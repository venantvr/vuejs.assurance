/**
 * Base locale (localStorage).
 *
 * Règle d'or : rien n'est jamais écrasé sans filet.
 *  - un contenu illisible est mis de côté (jamais remplacé) ;
 *  - chaque écriture porte un numéro de révision : une écriture concurrente
 *    (autre onglet) est détectée et fusionnée au lieu d'être écrasée ;
 *  - les dossiers supprimés vont dans une corbeille ;
 *  - des sauvegardes tournantes sont conservées à côté de la base.
 */
import { sanitizeCategories, sanitizeDossier } from './model.js'

export const DB_KEY = 'vuejs_assurance_db_v1'
export const PREFS_KEY = 'vuejs_assurance_prefs_v1'
export const BACKUPS_KEY = 'vuejs_assurance_backups_v1'
export const CORRUPT_PREFIX = 'vuejs_assurance_illisible_'

/** Clés historiques reprises au premier lancement (jamais effacées). */
const LEGACY_KEYS = ['chronoassur_db_v2', 'chronoassur_dossier_v1']

const BACKUP_SLOTS = 8
const BACKUP_MIN_INTERVAL = 2 * 60 * 1000 // 2 min entre deux sauvegardes automatiques

export function emptyDb () {
  return { version: 1, rev: 0, activeId: null, dossiers: [], trash: [], actors: [], categories: [] }
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

/* ------------------------------------------------------------------ lecture */

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
    } catch { /* clé illisible : ignorée, jamais effacée */ }
    if (dossiers.length) break
  }
  return dossiers
}

/** Transforme un JSON déjà analysé en base normalisée. */
export function normalizeDb (parsed) {
  const db = emptyDb()
  if (!parsed || !Array.isArray(parsed.dossiers)) return null
  db.rev = Number.isFinite(parsed.rev) ? parsed.rev : 0
  db.dossiers = parsed.dossiers.map((d) => sanitizeDossier(d))
  db.trash = (Array.isArray(parsed.trash) ? parsed.trash : []).map((d) => {
    const dossier = sanitizeDossier(d)
    dossier.deletedAt = d?.deletedAt || new Date().toISOString()
    return dossier
  })
  db.activeId = parsed.activeId || db.dossiers[0]?.id || null
  db.actors = sanitizeActors(parsed.actors)
  db.categories = sanitizeCategories(parsed.categories)
  return db
}

/**
 * Met un contenu illisible à l'abri sous une clé horodatée. Il ne sera jamais
 * écrasé par la base : on pourra toujours tenter de le récupérer à la main.
 */
function preserveUnreadable (raw) {
  try {
    const key = `${CORRUPT_PREFIX}${Date.now()}`
    localStorage.setItem(key, raw)
    return key
  } catch {
    return null
  }
}

/** Contenu brut courant (null si absent). */
export function readRawDb () {
  try { return localStorage.getItem(DB_KEY) } catch { return null }
}

/** Base stockée telle quelle, ou null si absente / illisible. */
export function readStoredDb () {
  const raw = readRawDb()
  if (!raw) return null
  try { return normalizeDb(JSON.parse(raw)) } catch { return null }
}

/**
 * Charge la base. Retourne aussi `preserved` : clé sous laquelle un contenu
 * illisible a été mis de côté, le cas échéant.
 */
export function loadDb () {
  let db = null
  let preserved = null
  const raw = readRawDb()

  if (raw) {
    try {
      db = normalizeDb(JSON.parse(raw))
    } catch { db = null }
    if (!db) preserved = preserveUnreadable(raw)
  }

  if (!db) db = emptyDb()

  if (!db.dossiers.length && !db.trash.length) {
    const legacy = readLegacy()
    if (legacy.length) {
      db.dossiers = legacy
      db.activeId = legacy[0].id
    }
  }

  if (db.dossiers.length && !db.dossiers.some((d) => d.id === db.activeId)) {
    db.activeId = db.dossiers[0].id
  }
  return { db, preserved }
}

/* ------------------------------------------------------------------ fusion */

const newer = (a, b) => (String(b.updatedAt || '') > String(a.updatedAt || '') ? b : a)

/**
 * Deux versions d'un même dossier : la plus récente fixe le cadre (synthèse,
 * nom, tri…), mais aucune étape ni question présente d'un côté n'est perdue —
 * l'union par identifiant l'emporte sur la suppression. Dans la fenêtre de
 * course entre deux onglets, ressusciter vaut mieux que perdre.
 */
function mergeDossier (a, b) {
  const base = newer(a, b)
  const other = base === a ? b : a
  const merged = { ...base }
  const stepIds = new Set(base.steps.map((s) => s.id))
  merged.steps = [...base.steps, ...other.steps.filter((s) => !stepIds.has(s.id))]
  const qIds = new Set(base.globalQuestions.map((q) => q.id))
  merged.globalQuestions = [...base.globalQuestions, ...other.globalQuestions.filter((q) => !qIds.has(q.id))]
  return merged
}

/**
 * Fusionne deux bases sans rien perdre : un dossier présent d'un seul côté est
 * conservé ; présent des deux côtés, la version la plus récente l'emporte ;
 * acteurs et catégories sont réunis ; une catégorie restaurée d'un côté n'est
 * pas resupprimée par l'autre.
 */
export function mergeDb (stored, local) {
  const out = emptyDb()
  out.activeId = local.activeId || stored.activeId

  const byId = new Map()
  for (const d of [...(stored.dossiers || []), ...(local.dossiers || [])]) {
    byId.set(d.id, byId.has(d.id) ? mergeDossier(byId.get(d.id), d) : d)
  }
  const trashById = new Map()
  for (const d of [...(stored.trash || []), ...(local.trash || [])]) {
    trashById.set(d.id, trashById.has(d.id) ? newer(trashById.get(d.id), d) : d)
  }
  // Un dossier à la fois actif et en corbeille : l'état le plus récent l'emporte,
  // à égalité on le garde actif (jamais perdu).
  for (const [id, trashed] of trashById) {
    if (byId.has(id)) {
      const active = byId.get(id)
      if (String(trashed.deletedAt || '') > String(active.updatedAt || '')) byId.delete(id)
      else trashById.delete(id)
    }
  }
  out.dossiers = [...byId.values()]
  out.trash = [...trashById.values()]
  out.actors = sanitizeActors([...(stored.actors || []), ...(local.actors || [])])

  const cats = new Map()
  for (const c of [...(stored.categories || []), ...(local.categories || [])]) {
    const prev = cats.get(c.key)
    if (!prev) cats.set(c.key, { ...c })
    else cats.set(c.key, { ...prev, ...c, deleted: Boolean(prev.deleted && c.deleted) })
  }
  out.categories = sanitizeCategories([...cats.values()])
  return out
}

/* ----------------------------------------------------------------- écriture */

function serialize (db, rev) {
  return JSON.stringify({
    version: 1,
    rev,
    savedAt: new Date().toISOString(),
    activeId: db.activeId,
    dossiers: db.dossiers,
    trash: db.trash || [],
    actors: db.actors || [],
    categories: db.categories || []
  })
}

/**
 * Écrit la base. `knownRev` est la révision lue au chargement (ou au dernier
 * enregistrement) : si le stockage a avancé entre-temps (autre onglet), la
 * base stockée est fusionnée avec la nôtre avant écriture.
 *
 * Retourne { ok, rev, merged, db, error }.
 */
export function saveDb (db, knownRev) {
  let toWrite = db
  let merged = false
  let baseRev = knownRev

  const stored = readStoredDb()
  if (stored && Number.isFinite(knownRev) && stored.rev !== knownRev) {
    toWrite = mergeDb(stored, db)
    merged = true
    baseRev = stored.rev
  } else if (stored && !Number.isFinite(knownRev)) {
    baseRev = stored.rev
  }

  const rev = (Number.isFinite(baseRev) ? baseRev : 0) + 1
  try {
    localStorage.setItem(DB_KEY, serialize(toWrite, rev))
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError' || /quota/i.test(String(error?.message))
    return { ok: false, merged, db: toWrite, error: quota ? 'stockage du navigateur saturé' : String(error?.message || error) }
  }
  return { ok: true, rev, merged, db: toWrite }
}

/* --------------------------------------------------------------- sauvegardes */

export function listBackups () {
  try {
    const parsed = JSON.parse(localStorage.getItem(BACKUPS_KEY))
    return Array.isArray(parsed) ? parsed.filter((b) => b && b.at && b.json) : []
  } catch {
    return []
  }
}

/**
 * Conserve une copie de la base (JSON brut) dans un anneau de sauvegardes.
 * Sans `force`, deux sauvegardes sont espacées d'au moins deux minutes pour
 * que l'anneau couvre une vraie période et pas les 8 dernières frappes.
 */
export function rotateBackup (rawJson, { force = false, label = '' } = {}) {
  if (!rawJson) return false
  const backups = listBackups()
  const last = backups[0]
  if (!force && last && Date.now() - new Date(last.at).getTime() < BACKUP_MIN_INTERVAL) return false
  if (last && last.json === rawJson) return false
  const next = [{ at: new Date().toISOString(), label, json: rawJson }, ...backups].slice(0, BACKUP_SLOTS)
  try {
    localStorage.setItem(BACKUPS_KEY, JSON.stringify(next))
    return true
  } catch {
    // quota : on tente avec moins d'entrées, puis on abandonne silencieusement
    try {
      localStorage.setItem(BACKUPS_KEY, JSON.stringify(next.slice(0, 3)))
      return true
    } catch { return false }
  }
}

/** Contenus illisibles mis de côté (clé + taille), pour information. */
export function listPreserved () {
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(CORRUPT_PREFIX)) {
        out.push({ key, at: new Date(Number(key.slice(CORRUPT_PREFIX.length))).toISOString(), size: (localStorage.getItem(key) || '').length })
      }
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

/* ----------------------------------------------------------------- préfs */

export function loadPrefs () {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {} } catch { return {} }
}

export function savePrefs (prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* non bloquant */ }
}
