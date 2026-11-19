/**
 * Synchronisation automatique avec le KV Cloudflare (via /api/sync).
 *
 * Dès que le jeton et la passphrase sont posés sur un appareil, tout est
 * automatique : au démarrage, au retour sur l'onglet, à la reconnexion, toutes
 * les minutes, et quelques secondes après chaque modification.
 *
 * Un cycle = récupérer (si le serveur a avancé) → fusionner sans rien écraser
 * → envoyer (si la base locale a changé depuis le dernier envoi). Tout est
 * chiffré dans le navigateur avant d'être envoyé.
 */
import { watch } from 'vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { encryptJson, decryptJson } from '@/lib/crypto.js'
import { pullRemote, pushRemote } from '@/lib/sync.js'
import { normalizeDb } from '@/lib/storage.js'

const DEBOUNCE_MS = 3000
const INTERVAL_MS = 60_000
const MIN_GAP_MS = 8000

/** Empreinte canonique de la base (hors dossier actif : un simple clic ne synchronise pas). */
export function fingerprint (db) {
  const byId = (a, b) => String(a.id || a.key || '').localeCompare(String(b.id || b.key || ''))
  const canon = {
    dossiers: [...(db.dossiers || [])].sort(byId),
    trash: [...(db.trash || [])].sort(byId),
    actors: [...(db.actors || [])].map((a) => JSON.stringify(a)).sort(),
    categories: [...(db.categories || [])].sort(byId)
  }
  const text = JSON.stringify(canon)
  let h1 = 0x811c9dc5
  let h2 = 5381
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0
    h2 = (Math.imul(h2, 33) ^ c) >>> 0
  }
  return `${text.length}:${h1.toString(16)}${h2.toString(16)}`
}

let started = false
let running = false
let again = false
let configDirty = false
let lastRun = 0
let timer = null

export function isHosted () {
  return typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol)
}

export function useAutoSync () {
  const store = useDossiersStore()
  const ui = useUiStore()

  const configured = () => Boolean(ui.syncToken.trim() && ui.syncPassphrase.trim())
  const configKey = () => JSON.stringify([ui.syncToken, ui.syncPassphrase, ui.syncAuto])

  function refreshIdle () {
    ui.syncStatus = isHosted() && configured() && ui.syncAuto ? 'idle' : 'off'
  }

  /**
   * Prise en compte d'un changement de configuration. Pendant un cycle, le
   * statut appartient au cycle : la réaction est différée (et non perdue)
   * jusqu'à sa fin, sinon un jeton corrigé ne réarmerait jamais d'essai.
   */
  function applyConfigChange () {
    configDirty = false
    refreshIdle()
    if (ui.syncStatus === 'idle') { ui.syncError = ''; schedule(500) }
  }

  function fail (status, message) {
    ui.syncStatus = status
    ui.syncError = message
  }

  async function decryptRemote (envelope) {
    try {
      return await decryptJson(ui.syncPassphrase, envelope)
    } catch {
      throw new Error('Déchiffrement impossible : passphrase différente de celle utilisée à l\'envoi (ou données altérées)')
    }
  }

  /**
   * Un cycle complet. `force` : synchronise même si la synchro automatique est
   * désactivée (bouton « Synchroniser maintenant »). Retourne { ok, message }.
   */
  async function syncNow ({ force = false } = {}) {
    if (!isHosted()) return { ok: false, message: 'Disponible uniquement sur la version hébergée' }
    if (!configured()) { ui.syncStatus = 'off'; return { ok: false, message: 'Jeton et passphrase requis' } }
    if (!force && !ui.syncAuto) return { ok: false, message: 'Synchronisation automatique désactivée' }
    if (running) { again = true; return { ok: true, message: 'Déjà en cours' } }

    clearTimeout(timer)
    timer = null
    const startConfig = configKey()
    configDirty = false
    running = true
    lastRun = Date.now()
    ui.syncStatus = 'syncing'
    ui.syncError = ''
    let result = { ok: true, message: 'À jour' }
    try {
      const pulled = await pullRemote(ui.syncToken)
      if (!pulled.ok) {
        const authProblem = pulled.status === 401 || pulled.status === 503
        fail(authProblem ? 'error' : 'offline', pulled.error)
        return { ok: false, message: pulled.error }
      }

      let rev = pulled.rev
      let remoteSavedAt = pulled.savedAt
      let remoteFp = null
      if (pulled.envelope && pulled.rev !== ui.syncRev) {
        const remote = await decryptRemote(pulled.envelope)
        const normalized = normalizeDb(remote)
        if (!normalized) throw new Error('Structure distante non reconnue')
        remoteFp = fingerprint(normalized)
        if (!store.mergeRemoteDb(normalized)) throw new Error('Structure distante non reconnue')
        result = { ok: true, message: `Données distantes fusionnées (révision ${pulled.rev})` }
      }

      // Envoi si la base locale diffère de la dernière version connue côté serveur (ou si le serveur est vide).
      for (let attempt = 0; attempt < 3; attempt++) {
        const snapshot = store.exportDb()
        const fp = fingerprint(snapshot)
        const matchesRemote = remoteFp !== null && fp === remoteFp
        const unchangedSinceLastSync = fp === ui.syncFp && rev === pulled.rev && (pulled.envelope || rev > 0)
        if (matchesRemote || unchangedSinceLastSync) {
          ui.setSyncState({ rev, at: remoteSavedAt, fp })
          break
        }
        const envelope = await encryptJson(ui.syncPassphrase, snapshot)
        const res = await pushRemote(ui.syncToken, rev, envelope)
        if (res.ok) {
          ui.setSyncState({ rev: res.rev, at: res.savedAt, fp })
          result = { ok: true, message: `Envoyé, chiffré (révision ${res.rev})` }
          break
        }
        if (res.conflict) {
          rev = res.rev
          remoteSavedAt = res.savedAt
          remoteFp = null
          if (res.envelope) {
            const remote = await decryptRemote(res.envelope)
            const normalized = normalizeDb(remote)
            if (!normalized) throw new Error('Structure distante non reconnue')
            remoteFp = fingerprint(normalized)
            if (!store.mergeRemoteDb(normalized)) throw new Error('Structure distante non reconnue')
          }
          if (attempt === 2) throw new Error('Écritures concurrentes répétées : nouvel essai à la prochaine synchronisation')
          continue
        }
        const authProblem = res.status === 401 || res.status === 503
        fail(authProblem ? 'error' : 'offline', res.error)
        return { ok: false, message: res.error }
      }
      ui.syncStatus = 'idle'
      return result
    } catch (e) {
      const message = String(e?.message || e)
      fail('error', message)
      return { ok: false, message }
    } finally {
      running = false
      const retry = again
      again = false
      // Ne réagir qu'à un changement survenu PENDANT le cycle (pas à la
      // micro-tâche différée d'un save() appelé juste avant syncNow).
      const changedDuringRun = configDirty && configKey() !== startConfig
      configDirty = false
      if (changedDuringRun) applyConfigChange()
      else if (retry) schedule(DEBOUNCE_MS)
    }
  }

  function schedule (delay = DEBOUNCE_MS) {
    clearTimeout(timer)
    timer = setTimeout(() => { if (ui.syncStatus !== 'error') syncNow() }, delay)
  }

  /** Démarre les déclencheurs automatiques (une seule fois par page). */
  function start () {
    if (started) return
    started = true
    refreshIdle()

    // Après chaque enregistrement local, si le contenu a réellement changé.
    watch(() => store.saveState, (state) => {
      if (state !== 'saved' || !ui.syncAuto || !configured() || !isHosted()) return
      if (fingerprint(store.exportDb()) !== ui.syncFp) schedule()
    })

    // Configuration modifiée (jeton, passphrase, interrupteur) : on repart, erreur effacée.
    watch(() => [ui.syncToken, ui.syncPassphrase, ui.syncAuto], () => {
      if (running) { configDirty = true; return }
      applyConfigChange()
    })

    const wake = () => {
      if (document.visibilityState === 'hidden' || !ui.syncAuto || !configured()) return
      if (Date.now() - lastRun > MIN_GAP_MS) syncNow()
    }
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('focus', wake)
    window.addEventListener('online', () => { if (ui.syncStatus === 'offline') syncNow() })
    setInterval(() => { if (ui.syncStatus !== 'error') wake() }, INTERVAL_MS)

    // Premier cycle peu après le chargement de la base locale.
    if (isHosted() && configured() && ui.syncAuto) schedule(1200)
  }

  return { syncNow, start, configured }
}
