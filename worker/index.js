/**
 * API de synchronisation chiffrée (/api/sync).
 *
 * Le serveur est un simple coffre : il ne stocke et ne renvoie que des
 * enveloppes CHIFFRÉES côté client (AES-GCM, clé dérivée d'une passphrase qui
 * ne quitte jamais le navigateur). Il ne peut pas lire les dossiers, et ne
 * journalise rien de leur contenu.
 *
 * Tant que le KV (SYNC_KV) et le secret (VUEJS_ASSURANCE_TOKEN) ne sont pas configurés
 * dans wrangler.toml, l'API répond « non configuré » : l'application reste
 * purement locale.
 *
 * Modèle de concurrence : chaque écriture porte le numéro de révision connu
 * du client (`baseRev`). S'il ne correspond plus à la révision stockée, le
 * serveur répond 409 avec l'enveloppe courante ; le client (qui, lui, sait
 * déchiffrer) fusionne puis renvoie.
 *
 * Limite connue de Cloudflare KV : le stockage KV est à cohérence éventuelle
 * (sans compare-and-swap atomique, propagation inter-PoP jusqu'à ~60 s). Ce
 * contrôle optimiste protège les accès séquentiels et décalés, mais pas deux
 * écritures quasi simultanées sur des PoP distincts ; pour un verrouillage
 * strictement linéarisable, un Durable Object ou D1 serait nécessaire.
 */

const LATEST_KEY = 'sync:latest'
const REV_PREFIX = 'sync:rev:'
// Historique : conservé SANS expiration (usage juridique, procédures longues).
// Pour ne pas saturer le KV avec la synchro automatique, une seule révision est
// gardée par heure d'activité : la dernière de l'heure remplace les précédentes.
const HISTORY_BUCKET_MS = 60 * 60 * 1000
const LAST_HISTORY_KEY = 'sync:hist:last'
const MAX_BODY = 5 * 1024 * 1024 // 5 Mo d'enveloppe chiffrée
const MAX_DELETE_BODY = 64 * 1024
// Limite basse pour rester sous le plafond de 50 sous-requêtes du plan Workers Free.
const MAX_DELETE_BATCH = 40

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff'
}

function json (status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

/** Comparaison en temps constant du jeton (évite les attaques par chronométrage). */
function tokenMatches (given, expected) {
  const enc = new TextEncoder()
  const a = enc.encode(String(given || ''))
  const b = enc.encode(String(expected || ''))
  if (a.byteLength !== b.byteLength) return false
  if (crypto.subtle?.timingSafeEqual) return crypto.subtle.timingSafeEqual(a, b)
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Lit un corps JSON en bornant strictement le nombre d'octets lus en mémoire. */
async function readBoundedJson (request, maxBytes) {
  const cl = Number(request.headers.get('Content-Length') || 0)
  if (cl > maxBytes) return { status: 413, error: 'Enveloppe trop volumineuse' }
  if (!request.body) return { status: 400, error: 'JSON invalide' }
  const reader = request.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        try { await reader.cancel() } catch { /* ignore */ }
        return { status: 413, error: 'Enveloppe trop volumineuse' }
      }
      chunks.push(value)
    }
  } catch {
    return { status: 400, error: 'Corps de requête illisible' }
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return { body: JSON.parse(new TextDecoder().decode(merged)) }
  } catch {
    return { status: 400, error: 'JSON invalide' }
  }
}

/** L'enveloppe doit ressembler à du chiffré produit par le client, rien d'autre. */
function isEnvelope (value) {
  return Boolean(
    value && typeof value === 'object' &&
    typeof value.v === 'number' &&
    typeof value.salt === 'string' &&
    typeof value.iv === 'string' &&
    typeof value.data === 'string' &&
    Number.isFinite(value.iter)
  )
}

async function handleSync (request, env) {
  if (!env.SYNC_KV || !env.VUEJS_ASSURANCE_TOKEN) {
    return json(503, { error: 'Synchronisation non configurée sur ce déploiement (KV ou secret manquant)' })
  }

  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !tokenMatches(token, env.VUEJS_ASSURANCE_TOKEN)) {
    return json(401, { error: 'Jeton de synchronisation invalide' })
  }

  if (request.method === 'GET') {
    const url = new URL(request.url)

    // Historique : liste des révisions conservées (métadonnées seulement, rien de lisible).
    if (url.searchParams.get('list')) {
      const revisions = []
      let cursor
      for (let page = 0; page < 50; page++) {
        const res = await env.SYNC_KV.list({ prefix: REV_PREFIX, cursor })
        for (const key of res.keys) {
          const rev = Number(key.name.slice(REV_PREFIX.length))
          if (Number.isFinite(rev)) revisions.push({ rev, savedAt: key.metadata?.savedAt || null, size: key.metadata?.size || 0 })
        }
        if (res.list_complete) break
        cursor = res.cursor
      }
      revisions.sort((a, b) => b.rev - a.rev)
      return json(200, { revisions, retentionDays: null, granularity: 'heure' })
    }

    // Une révision précise de l'historique (enveloppe chiffrée).
    const wanted = url.searchParams.get('rev')
    if (wanted) {
      const rev = Number(wanted)
      if (!Number.isInteger(rev) || rev < 1) return json(400, { error: 'Révision invalide' })
      const old = await env.SYNC_KV.get(`${REV_PREFIX}${rev}`, 'json')
      return old ? json(200, old) : json(404, { error: 'Révision expirée ou inconnue' })
    }

    const stored = await env.SYNC_KV.get(LATEST_KEY, 'json')
    if (!stored) return json(200, { rev: 0, envelope: null })
    return json(200, stored)
  }

  if (request.method === 'PUT') {
    const parsed = await readBoundedJson(request, MAX_BODY)
    if (parsed.error) return json(parsed.status, { error: parsed.error })
    const { body } = parsed
    if (!isEnvelope(body?.envelope)) return json(400, { error: 'Enveloppe chiffrée attendue' })

    const baseRev = Number.isInteger(body.baseRev) && body.baseRev >= 0 ? body.baseRev : 0
    const stored = await env.SYNC_KV.get(LATEST_KEY, 'json')
    const currentRev = stored?.rev || 0
    if (baseRev !== currentRev) {
      // Quelqu'un (un autre appareil) a écrit entre-temps : le client fusionne.
      return json(409, stored || { rev: 0, envelope: null })
    }

    const record = { rev: currentRev + 1, savedAt: new Date().toISOString(), envelope: body.envelope }
    const serialized = JSON.stringify(record)
    await env.SYNC_KV.put(LATEST_KEY, serialized)
    await env.SYNC_KV.put(`${REV_PREFIX}${record.rev}`, serialized, {
      metadata: { savedAt: record.savedAt, size: serialized.length }
    })
    // Même heure que la révision d'historique précédente : celle-ci est remplacée.
    const bucket = Math.floor(Date.parse(record.savedAt) / HISTORY_BUCKET_MS)
    const last = await env.SYNC_KV.get(LAST_HISTORY_KEY, 'json')
    if (last && last.bucket === bucket && last.rev !== record.rev) {
      await env.SYNC_KV.delete(`${REV_PREFIX}${last.rev}`)
    }
    await env.SYNC_KV.put(LAST_HISTORY_KEY, JSON.stringify({ rev: record.rev, bucket }))
    return json(200, { rev: record.rev, savedAt: record.savedAt })
  }

  // Ménage manuel : supprime des révisions d'historique (jamais la plus récente).
  if (request.method === 'DELETE') {
    const parsed = await readBoundedJson(request, MAX_DELETE_BODY)
    if (parsed.error) return json(parsed.status, { error: parsed.error })
    const { body } = parsed
    const revs = Array.isArray(body?.revs) ? [...new Set(body.revs.map(Number))].filter((n) => Number.isInteger(n) && n > 0) : []
    if (!revs.length || revs.length > MAX_DELETE_BATCH) {
      return json(400, { error: `Liste de révisions invalide (1 à ${MAX_DELETE_BATCH} par requête)` })
    }
    const stored = await env.SYNC_KV.get(LATEST_KEY, 'json')
    const latest = stored?.rev || 0
    const toDelete = revs.filter((rev) => rev !== latest)
    await Promise.all(toDelete.map((rev) => env.SYNC_KV.delete(`${REV_PREFIX}${rev}`)))
    return json(200, { deleted: toDelete, kept: revs.filter((r) => r === latest) })
  }

  return json(405, { error: 'Méthode non autorisée' })
}

export default {
  async fetch (request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/api/sync') return handleSync(request, env)
    if (url.pathname.startsWith('/api/')) return json(404, { error: 'Inconnu' })
    // Hors /api : laisse la main aux assets statiques (SPA).
    return env.ASSETS ? env.ASSETS.fetch(request) : json(404, { error: 'Inconnu' })
  }
}
