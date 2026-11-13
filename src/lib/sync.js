/**
 * Client de l'API de synchronisation (/api/sync, même origine).
 *
 * Même origine uniquement, par construction : le Worker n'émet aucun en-tête
 * CORS, donc seul le site hébergé peut l'appeler. En `file://` ou en dev sans
 * Worker, les fonctions renvoient une erreur claire.
 */

const ENDPOINT = '/api/sync'

function authHeaders (token) {
  return { Authorization: `Bearer ${String(token || '').trim()}` }
}

async function readJson (response) {
  try { return await response.json() } catch { return null }
}

function describe (status, body) {
  if (status === 401) return 'Jeton de synchronisation invalide'
  if (status === 503) return body?.error || 'Synchronisation non configurée sur le serveur'
  if (status === 413) return 'Base trop volumineuse pour la synchronisation'
  return body?.error || `Erreur serveur (HTTP ${status})`
}

/** Dernière enveloppe stockée. Retourne { ok, rev, savedAt, envelope } (envelope null si vide). */
export async function pullRemote (token) {
  let response
  try {
    response = await fetch(ENDPOINT, { headers: authHeaders(token), cache: 'no-store' })
  } catch {
    return { ok: false, error: 'Serveur injoignable — la synchronisation ne fonctionne que sur la version hébergée' }
  }
  const body = await readJson(response)
  if (!response.ok) return { ok: false, status: response.status, error: describe(response.status, body) }
  return { ok: true, rev: body?.rev || 0, savedAt: body?.savedAt || null, envelope: body?.envelope || null }
}

/**
 * Envoie une enveloppe chiffrée. `baseRev` est la dernière révision serveur
 * connue : en cas d'écriture concurrente, retourne { conflict: true } avec
 * l'enregistrement courant, à fusionner côté client puis renvoyer.
 */
export async function pushRemote (token, baseRev, envelope) {
  let response
  try {
    response = await fetch(ENDPOINT, {
      method: 'PUT',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRev: Number.isFinite(baseRev) ? baseRev : 0, envelope })
    })
  } catch {
    return { ok: false, error: 'Serveur injoignable — la synchronisation ne fonctionne que sur la version hébergée' }
  }
  const body = await readJson(response)
  if (response.status === 409) {
    return { ok: false, conflict: true, rev: body?.rev || 0, savedAt: body?.savedAt || null, envelope: body?.envelope || null }
  }
  if (!response.ok) return { ok: false, status: response.status, error: describe(response.status, body) }
  return { ok: true, rev: body?.rev || 0, savedAt: body?.savedAt || null }
}
