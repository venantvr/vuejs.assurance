/**
 * API de synchronisation chiffrée (/api/sync).
 *
 * Le serveur est un simple coffre : il ne stocke et ne renvoie que des
 * enveloppes CHIFFRÉES côté client (AES-GCM, clé dérivée d'une passphrase qui
 * ne quitte jamais le navigateur). Il ne peut pas lire les dossiers, et ne
 * journalise rien de leur contenu.
 *
 * Tant que le KV (SYNC_KV) et le secret (SYNC_TOKEN) ne sont pas configurés
 * dans wrangler.toml, l'API répond « non configuré » : l'application reste
 * purement locale.
 *
 * Modèle de concurrence : chaque écriture porte le numéro de révision connu
 * du client (`baseRev`). S'il ne correspond plus à la révision stockée, le
 * serveur répond 409 avec l'enveloppe courante ; le client (qui, lui, sait
 * déchiffrer) fusionne puis renvoie. Rien n'est jamais écrasé à l'aveugle.
 */

const LATEST_KEY = 'sync:latest'
const HISTORY_TTL = 60 * 60 * 24 * 30 // 30 jours d'historique de révisions
const MAX_BODY = 5 * 1024 * 1024 // 5 Mo d'enveloppe chiffrée

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
  if (!env.SYNC_KV || !env.SYNC_TOKEN) {
    return json(503, { error: 'Synchronisation non configurée sur ce déploiement (KV ou secret manquant)' })
  }

  const auth = request.headers.get('Authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token || !tokenMatches(token, env.SYNC_TOKEN)) {
    return json(401, { error: 'Jeton de synchronisation invalide' })
  }

  if (request.method === 'GET') {
    const stored = await env.SYNC_KV.get(LATEST_KEY, 'json')
    if (!stored) return json(200, { rev: 0, envelope: null })
    return json(200, stored)
  }

  if (request.method === 'PUT') {
    const length = Number(request.headers.get('Content-Length') || 0)
    if (length > MAX_BODY) return json(413, { error: 'Enveloppe trop volumineuse' })

    let body
    try { body = await request.json() } catch { return json(400, { error: 'JSON invalide' }) }
    if (!isEnvelope(body?.envelope)) return json(400, { error: 'Enveloppe chiffrée attendue' })
    if (JSON.stringify(body.envelope).length > MAX_BODY) return json(413, { error: 'Enveloppe trop volumineuse' })

    const baseRev = Number.isFinite(body.baseRev) ? body.baseRev : 0
    const stored = await env.SYNC_KV.get(LATEST_KEY, 'json')
    const currentRev = stored?.rev || 0
    if (baseRev !== currentRev) {
      // Quelqu'un (un autre appareil) a écrit entre-temps : le client fusionne.
      return json(409, stored || { rev: 0, envelope: null })
    }

    const record = { rev: currentRev + 1, savedAt: new Date().toISOString(), envelope: body.envelope }
    await env.SYNC_KV.put(LATEST_KEY, JSON.stringify(record))
    await env.SYNC_KV.put(`sync:rev:${record.rev}`, JSON.stringify(record), { expirationTtl: HISTORY_TTL })
    return json(200, { rev: record.rev, savedAt: record.savedAt })
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
