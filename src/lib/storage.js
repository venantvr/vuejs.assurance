/**
 * Base locale (localStorage) + reprise automatique des versions précédentes.
 */
import { sanitizeDossier } from './model.js'

export const DB_KEY = 'vuejs_assurance_db_v1'
export const PREFS_KEY = 'vuejs_assurance_prefs_v1'

/** Clés historiques reprises au premier lancement. */
const LEGACY_KEYS = ['chronoassur_db_v2', 'chronoassur_dossier_v1']

export function emptyDb () {
  return { version: 1, activeId: null, dossiers: [], actors: [] }
}

/** Liste d'acteurs : chaînes non vides, dédoublonnées, triées. */
export function sanitizeActors (list) {
  const seen = new Set()
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    const name = String(raw || '').trim()
    const key = name.toLowerCase()
    if (name && !seen.has(key)) {
      seen.add(key)
      out.push(name)
    }
  }
  return out.sort((a, b) => a.localeCompare(b, 'fr'))
}

function readLegacy () {
  const dossiers = []
  for (const key of LEGACY_KEYS) {
    try {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.dossiers)) {
        parsed.dossiers.forEach((d) => dossiers.push(sanitizeDossier(d)))
      } else if (parsed?.steps || parsed?.meta) {
        dossiers.push(sanitizeDossier(parsed, 'Dossier repris (ancienne version)'))
      }
    } catch { /* clé illisible : ignorée */ }
    if (dossiers.length) break
  }
  return dossiers
}

export function loadDb () {
  const db = emptyDb()
  try {
    const raw = localStorage.getItem(DB_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed?.dossiers)) {
        db.dossiers = parsed.dossiers.map((d) => sanitizeDossier(d))
        db.activeId = parsed.activeId || db.dossiers[0]?.id || null
        db.actors = sanitizeActors(parsed.actors)
      }
    }
  } catch { /* stockage corrompu : on repart sur une base propre */ }

  if (!db.dossiers.length) {
    const legacy = readLegacy()
    if (legacy.length) {
      db.dossiers = legacy
      db.activeId = legacy[0].id
    }
  }

  if (db.dossiers.length && !db.dossiers.some((d) => d.id === db.activeId)) {
    db.activeId = db.dossiers[0].id
  }
  return db
}

export function saveDb (db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify({
      version: 1,
      activeId: db.activeId,
      dossiers: db.dossiers,
      actors: db.actors || []
    }))
    return { ok: true }
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError'
    return { ok: false, error: quota ? 'stockage du navigateur saturé' : String(error?.message || error) }
  }
}

export function loadPrefs () {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {} } catch { return {} }
}

export function savePrefs (prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* non bloquant */ }
}
