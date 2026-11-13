/**
 * Store principal : dossiers, étapes, questions, historique (annuler/rétablir)
 * et persistance automatique dans le navigateur.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  BUILTIN_CATEGORIES, FALLBACK_CATEGORY,
  cloneDossier, createCategory, createDossier, createParty, createQuestion, createStep,
  sanitizeCategories, sanitizeDossier, todayISO, uid
} from '@/lib/model.js'
import {
  DB_KEY, listBackups, loadDb, mergeDb, normalizeDb, readRawDb, readStoredDb, rotateBackup, sanitizeActors, saveDb
} from '@/lib/storage.js'
import { DOSSIER_TEMPLATES } from '@/lib/presets.js'

const HISTORY_LIMIT = 80
const SAVE_DELAY = 300

export const useDossiersStore = defineStore('dossiers', () => {
  const dossiers = ref([])
  const activeId = ref(null)
  /** Dossiers supprimés : conservés ici, restaurables, jamais effacés d'office. */
  const trash = ref([])
  /** Catalogue d'acteurs réutilisables, partagé par tous les dossiers. */
  const actors = ref([])
  /** Catégories personnalisées, en plus des cinq catégories natives. */
  const customCategories = ref([])

  const saveState = ref('saved') // saved | pending | error
  const saveError = ref('')
  /** Clé sous laquelle un contenu illisible a été mis de côté au chargement. */
  const preservedKey = ref(null)
  /** Compteur d'événements externes (autre onglet) : l'interface s'en sert pour notifier. */
  const externalEvents = ref([])

  const past = shallowRef([])
  const future = shallowRef([])

  let saveTimer = null
  let restoring = false
  /** Révision de la base telle que lue ou écrite en dernier par cet onglet. */
  let knownRev = null
  let listenersBound = false

  /* ---------------------------------------------------------------- lecture */

  const active = computed(() => dossiers.value.find((d) => d.id === activeId.value) || null)

  const dossiersByRecent = computed(
    () => [...dossiers.value].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  )

  /** Étapes du dossier actif, triées selon le mode choisi. */
  const orderedSteps = computed(() => {
    const dossier = active.value
    if (!dossier) return []
    const steps = [...dossier.steps]
    const mode = dossier.ui.sortMode
    if (mode === 'MANUAL') return steps.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    const key = (s) => `${s.date}T${s.time || '00:00'}`
    return steps.sort((a, b) => (mode === 'DATE_DESC' ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b))))
  })

  /** Pièces jointes, dans l'ordre de leur numérotation. */
  const attachments = computed(() => {
    const dossier = active.value
    if (!dossier) return []
    return dossier.steps
      .filter((s) => s.pjCode || s.pjName || s.pjUrl)
      .sort((a, b) => (a.pjCode || 'zz').localeCompare(b.pjCode || 'zz', 'fr', { numeric: true }))
  })

  const knownActors = computed(() => sanitizeActors(actors.value))

  /** Catégories utilisables : natives puis personnalisées non supprimées. */
  const categories = computed(() => [...BUILTIN_CATEGORIES, ...customCategories.value.filter((c) => !c.deleted)])
  /** Catégories personnalisées supprimées (restaurables). */
  const deletedCategories = computed(() => customCategories.value.filter((c) => c.deleted))
  const categoryMap = computed(() => Object.fromEntries(
    [...BUILTIN_CATEGORIES, ...customCategories.value].map((c) => [c.key, c])
  ))

  /**
   * Descripteur d'une catégorie. Une catégorie supprimée reste résolue (nom et
   * couleur conservés, marquée « supprimée ») ; une clé inconnue tombe en repli.
   */
  function category (key) {
    const found = categoryMap.value[key]
    if (found) return found
    return { ...FALLBACK_CATEGORY, key: key || FALLBACK_CATEGORY.key }
  }

  /** Nombre d'étapes citant une catégorie, tous dossiers confondus. */
  function categoryUsage (key) {
    return dossiers.value.reduce(
      (total, d) => total + d.steps.filter((s) => s.category === key).length, 0
    )
  }

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  /* ------------------------------------------------------------ persistance */

  function currentDb () {
    return {
      activeId: activeId.value,
      dossiers: dossiers.value,
      trash: trash.value,
      actors: actors.value,
      categories: customCategories.value
    }
  }

  function snapshotState () {
    return JSON.stringify(currentDb())
  }

  /** Charge une base (stockée, fusionnée ou historique) dans l'état réactif. */
  function loadIntoState (db) {
    restoring = true
    dossiers.value = db.dossiers.map((d) => sanitizeDossier(d))
    trash.value = (db.trash || []).map((d) => ({ ...sanitizeDossier(d), deletedAt: d.deletedAt || new Date().toISOString() }))
    activeId.value = db.activeId
    actors.value = sanitizeActors(db.actors)
    customCategories.value = sanitizeCategories(db.categories)
    if (dossiers.value.length && !dossiers.value.some((d) => d.id === activeId.value)) {
      activeId.value = dossiers.value[0].id
    }
    restoring = false
  }

  function clearHistory () {
    past.value = []
    future.value = []
  }

  function schedulePersist () {
    if (restoring) return
    saveState.value = 'pending'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persistNow, SAVE_DELAY)
  }

  function persistNow () {
    clearTimeout(saveTimer)
    saveTimer = null
    const result = saveDb(currentDb(), knownRev)
    if (result.ok) {
      knownRev = result.rev
      saveState.value = 'saved'
      saveError.value = ''
      if (result.merged) {
        // Un autre onglet avait écrit entre-temps : la fusion est déjà stockée,
        // on aligne la mémoire dessus. L'historique local ne décrit plus cet état.
        loadIntoState(result.db)
        clearHistory()
        externalEvents.value = [...externalEvents.value, { at: Date.now(), kind: 'merged' }]
      }
      rotateBackup(readRawDb())
    } else {
      saveState.value = 'error'
      saveError.value = result.error
    }
    return result
  }

  /** Recharge depuis le stockage si un autre onglet a écrit une révision plus récente. */
  function reloadIfStale () {
    const stored = readStoredDb()
    if (!stored || stored.rev === knownRev) return false
    if (saveState.value === 'pending') {
      // on a des modifications en attente : l'enregistrement fusionnera
      persistNow()
      return true
    }
    loadIntoState(stored)
    knownRev = stored.rev
    clearHistory()
    externalEvents.value = [...externalEvents.value, { at: Date.now(), kind: 'reloaded' }]
    return true
  }

  function bindLifecycle () {
    if (listenersBound || typeof window === 'undefined') return
    listenersBound = true
    const flush = () => { if (saveState.value === 'pending') persistNow() }
    // Le tampon de 300 ms est vidé dès que l'onglet s'efface : fermeture, bascule
    // d'onglet, mise en veille mobile, mise en cache arrière (bfcache)…
    window.addEventListener('beforeunload', flush)
    window.addEventListener('pagehide', flush)
    window.addEventListener('blur', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
      else reloadIfStale()
    })
    window.addEventListener('focus', reloadIfStale)
    // Écriture par un autre onglet
    window.addEventListener('storage', (event) => {
      if (event.key === DB_KEY || event.key === null) reloadIfStale()
    })
    // Demande au navigateur de ne pas évincer ce stockage sous pression disque
    try { navigator.storage?.persist?.() } catch { /* best effort */ }
  }

  watch([dossiers, activeId, trash, actors, customCategories], schedulePersist, { deep: true })

  // Les champs de synthèse sont liés en v-model : on date la modification ici.
  watch(
    () => (active.value ? [active.value.id, JSON.stringify(active.value.meta)] : null),
    (next, prev) => {
      if (next && prev && next[0] === prev[0] && next[1] !== prev[1]) touch()
    }
  )

  /* --------------------------------------------------------------- historique */

  /** Enregistre l'état courant avant une modification annulable. */
  function commit ({ backup = false, label = '' } = {}) {
    past.value = [...past.value, snapshotState()].slice(-HISTORY_LIMIT)
    future.value = []
    // L'état d'avant la modification rejoint l'anneau de sauvegardes
    // (toutes les deux minutes au plus, ou immédiatement si l'action est destructive).
    rotateBackup(readRawDb(), { force: backup, label })
  }

  function applySnapshot (json) {
    loadIntoState(JSON.parse(json))
    schedulePersist()
  }

  function undo () {
    if (!canUndo.value) return false
    const current = snapshotState()
    const previous = past.value[past.value.length - 1]
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, current]
    applySnapshot(previous)
    return true
  }

  function redo () {
    if (!canRedo.value) return false
    const current = snapshotState()
    const next = future.value[future.value.length - 1]
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, current]
    applySnapshot(next)
    return true
  }

  function touch () {
    if (active.value) active.value.updatedAt = new Date().toISOString()
  }

  /* ------------------------------------------------------------- amorçage */

  function demoDossier () {
    const template = DOSSIER_TEMPLATES.find((t) => t.id === 'DDE')
    const dossier = createDossier('Dossier de démonstration', template)
    // identifiant fixe : deux onglets ouverts sur un stockage vide fusionnent en un seul démo
    dossier.id = 'dos-demo'
    Object.assign(dossier.meta, {
      ref: 'Sinistre #2026-94810 / Contrat MRH-774201',
      parties: 'M. Martin (assuré) / Syndic GestiCopro / Entreprise AquaFuite',
      insurer: 'À compléter',
      deductible: '150 €',
      status: 'Attente de validation du devis de remise en état'
    })
    if (dossier.steps[2]) {
      dossier.steps[2].amount = 285
      dossier.steps[2].question = 'Confirmez-vous le remboursement des 285,00 € TTC avancés au titre de la recherche de fuite ?'
    }
    if (dossier.steps[4]) {
      dossier.steps[4].amount = 1840
      dossier.steps[4].category = 'BLOCAGE'
      dossier.steps[4].impact = 'Travaux bloqués'
    }
    return dossier
  }

  function init () {
    const { db, preserved } = loadDb()
    preservedKey.value = preserved
    knownRev = preserved ? null : db.rev
    if (!db.dossiers.length && !db.trash.length) {
      db.dossiers = [demoDossier()]
      db.activeId = db.dossiers[0].id
    }
    // au premier lancement, le catalogue est alimenté par les acteurs déjà saisis
    const used = db.dossiers.flatMap((d) => d.steps.flatMap((step) => step.actors))
    db.actors = sanitizeActors([...(db.actors || []), ...used])
    loadIntoState(db)
    bindLifecycle()
    persistNow()
  }

  /* --------------------------------------------------------------- dossiers */

  function selectDossier (id) {
    activeId.value = id
  }

  function addDossier (name, templateId) {
    commit()
    const template = DOSSIER_TEMPLATES.find((t) => t.id === templateId) || null
    const dossier = createDossier(name?.trim() || 'Nouveau dossier', template)
    dossiers.value.push(dossier)
    activeId.value = dossier.id
    return dossier
  }

  function duplicateActive () {
    if (!active.value) return null
    commit()
    const copy = cloneDossier(active.value, { name: `${active.value.name} (copie)` })
    dossiers.value.push(copy)
    activeId.value = copy.id
    return copy
  }

  function renameActive (name) {
    if (!active.value || !name?.trim()) return
    commit()
    active.value.name = name.trim()
    touch()
  }

  /** Met le dossier actif à la corbeille (restaurable, jamais effacé d'office). */
  function removeActive () {
    if (!active.value) return
    commit()
    const id = activeId.value
    const removed = dossiers.value.find((d) => d.id === id)
    dossiers.value = dossiers.value.filter((d) => d.id !== id)
    trash.value = [{ ...removed, deletedAt: new Date().toISOString() }, ...trash.value]
    if (!dossiers.value.length) dossiers.value.push(createDossier('Nouveau dossier'))
    activeId.value = dossiers.value[0].id
  }

  function restoreFromTrash (id) {
    const index = trash.value.findIndex((d) => d.id === id)
    if (index < 0) return null
    commit()
    const { deletedAt, ...dossier } = trash.value[index]
    trash.value = trash.value.filter((d) => d.id !== id)
    if (dossiers.value.some((d) => d.id === dossier.id)) dossier.id = uid('dos')
    dossier.updatedAt = new Date().toISOString()
    dossiers.value.push(dossier)
    activeId.value = dossier.id
    return dossier
  }

  /** Effacement définitif : une sauvegarde forcée est prise juste avant. */
  function purgeFromTrash (id) {
    commit({ backup: true, label: 'avant effacement définitif' })
    trash.value = trash.value.filter((d) => d.id !== id)
  }

  /* ------------------------------------------------------------- catégories */

  function addCategory (data) {
    commit()
    const created = createCategory(data, categories.value.map((c) => c.key))
    customCategories.value = [...customCategories.value, created]
    return created
  }

  function updateCategory (key, patch) {
    const target = customCategories.value.find((c) => c.key === key)
    if (!target) return
    commit()
    Object.assign(target, {
      label: patch.label !== undefined ? String(patch.label).trim() || target.label : target.label,
      short: patch.short !== undefined ? String(patch.short).trim() || target.short : target.short,
      icon: patch.icon !== undefined ? String(patch.icon).trim().slice(0, 3) || target.icon : target.icon,
      color: patch.color !== undefined ? patch.color : target.color
    })
  }

  /**
   * Supprime une catégorie personnalisée. Les étapes qui la citaient sont
   * reclassées dans `fallbackKey` (aucune étape n'est perdue).
   */
  /**
   * Suppression douce : la catégorie disparaît des listes mais les étapes gardent
   * leur classement d'origine (affiché comme « supprimée ») et la catégorie reste
   * restaurable.
   */
  function removeCategory (key) {
    const target = customCategories.value.find((c) => c.key === key && !c.builtin)
    if (!target) return 0
    commit()
    target.deleted = true
    return categoryUsage(key)
  }

  function restoreCategory (key) {
    const target = customCategories.value.find((c) => c.key === key)
    if (!target) return
    commit()
    target.deleted = false
  }

  /* ---------------------------------------------------------------- acteurs */

  /** Ajoute un acteur au catalogue s'il n'y figure pas déjà. */
  function rememberActor (name) {
    const value = String(name || '').trim()
    if (!value) return
    if (actors.value.some((a) => a.toLowerCase() === value.toLowerCase())) return
    actors.value = sanitizeActors([...actors.value, value])
  }

  /** Retire un acteur du catalogue (les étapes qui le citent ne changent pas). */
  function forgetActor (name) {
    actors.value = actors.value.filter((a) => a.toLowerCase() !== String(name).trim().toLowerCase())
  }

  /* ----------------------------------------------------------------- étapes */

  function nextPjCode () {
    const max = (active.value?.steps || []).reduce((acc, step) => {
      const match = /(\d+)/.exec(step.pjCode || '')
      return match ? Math.max(acc, Number.parseInt(match[1], 10)) : acc
    }, 0)
    return `PJ-${String(max + 1).padStart(2, '0')}`
  }

  function nextOrder () {
    return (active.value?.steps || []).reduce((acc, s) => Math.max(acc, (s.order ?? 0) + 1), 0)
  }

  function addStep (data = {}) {
    if (!active.value) return null
    commit()
    const step = createStep({ ...data, order: nextOrder() })
    if (step.pjName && !step.pjCode) step.pjCode = nextPjCode()
    active.value.steps.push(step)
    step.actors.forEach(rememberActor)
    touch()
    return step
  }

  function updateStep (data) {
    if (!active.value) return
    commit()
    const index = active.value.steps.findIndex((s) => s.id === data.id)
    const payload = { ...data, amount: Number.parseFloat(data.amount) || 0 }
    if (index >= 0) active.value.steps.splice(index, 1, payload)
    else active.value.steps.push({ ...payload, order: nextOrder() })
    ;(payload.actors || []).forEach(rememberActor)
    touch()
  }

  function duplicateStep (id) {
    if (!active.value) return null
    const source = active.value.steps.find((s) => s.id === id)
    if (!source) return null
    commit()
    const copy = { ...JSON.parse(JSON.stringify(source)), id: uid('step'), pjCode: '', order: nextOrder() }
    active.value.steps.push(copy)
    touch()
    return copy
  }

  function removeStep (id) {
    if (!active.value) return
    commit()
    active.value.steps = active.value.steps.filter((s) => s.id !== id)
    touch()
  }

  /** Applique un nouvel ordre d'étapes (glisser-déposer) et bascule en tri manuel. */
  function reorderSteps (orderedIds) {
    if (!active.value) return
    commit()
    orderedIds.forEach((id, index) => {
      const step = active.value.steps.find((s) => s.id === id)
      if (step) step.order = index
    })
    active.value.ui.sortMode = 'MANUAL'
    touch()
  }

  /** Décale une étape d'un jour (poignées clavier / boutons). */
  function shiftStepDate (id, days) {
    if (!active.value) return
    const step = active.value.steps.find((s) => s.id === id)
    if (!step) return
    commit()
    const date = new Date(`${step.date || todayISO()}T00:00:00`)
    date.setDate(date.getDate() + days)
    step.date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    touch()
  }

  function setSortMode (mode) {
    if (!active.value) return
    if (mode === 'MANUAL') {
      // fige l'ordre actuellement affiché avant de passer en manuel
      orderedSteps.value.forEach((step, index) => { step.order = index })
    }
    active.value.ui.sortMode = mode
    touch()
  }

  function setViewMode (mode) {
    if (!active.value) return
    active.value.ui.viewMode = mode
    touch()
  }

  /* ------------------------------------------------------------ pièces jointes */

  /** Renumérote PJ-01, PJ-02… dans l'ordre donné (ou l'ordre chronologique). */
  function renumberAttachments (orderedIds = null) {
    if (!active.value) return 0
    commit()
    const source = orderedIds
      ? orderedIds.map((id) => active.value.steps.find((s) => s.id === id)).filter(Boolean)
      : [...active.value.steps]
        .filter((s) => s.pjCode || s.pjName || s.pjUrl)
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
    source.forEach((step, index) => { step.pjCode = `PJ-${String(index + 1).padStart(2, '0')}` })
    touch()
    return source.length
  }

  /**
   * Détache la pièce d'une étape : le code et le nom sont vidés, l'étape reste
   * dans la chronologie. Les autres numéros ne bougent pas (vos fichiers déjà
   * renommés restent valables) ; « Renuméroter par date » comble les trous.
   */
  function detachAttachment (stepId) {
    const step = active.value?.steps.find((s) => s.id === stepId)
    if (!step) return
    commit()
    step.pjCode = ''
    step.pjName = ''
    step.pjUrl = ''
    touch()
  }

  /* ----------------------------------------------------------------- parties */

  const parties = computed(() => [...(active.value?.parties || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))

  function addParty (data = {}) {
    if (!active.value) return null
    commit()
    if (!Array.isArray(active.value.parties)) active.value.parties = []
    const party = createParty({ ...data, order: active.value.parties.length })
    active.value.parties.push(party)
    touch()
    return party
  }

  function updateParty (id, patch) {
    const party = active.value?.parties?.find((p) => p.id === id)
    if (!party) return
    Object.assign(party, patch)
    touch()
  }

  function removeParty (id) {
    if (!active.value) return
    commit()
    active.value.parties = (active.value.parties || []).filter((p) => p.id !== id)
    touch()
  }

  function reorderParties (orderedIds) {
    if (!active.value) return
    commit()
    orderedIds.forEach((id, index) => {
      const party = active.value.parties.find((p) => p.id === id)
      if (party) party.order = index
    })
    touch()
  }

  /* --------------------------------------------------------------- questions */

  function addGlobalQuestion () {
    if (!active.value) return null
    commit()
    const question = createQuestion({ order: active.value.globalQuestions.length })
    active.value.globalQuestions.push(question)
    touch()
    return question
  }

  function updateGlobalQuestion (id, patch) {
    const question = active.value?.globalQuestions.find((q) => q.id === id)
    if (!question) return
    Object.assign(question, patch)
    touch()
  }

  function removeGlobalQuestion (id) {
    if (!active.value) return
    commit()
    active.value.globalQuestions = active.value.globalQuestions.filter((q) => q.id !== id)
    touch()
  }

  function reorderGlobalQuestions (orderedIds) {
    if (!active.value) return
    commit()
    orderedIds.forEach((id, index) => {
      const question = active.value.globalQuestions.find((q) => q.id === id)
      if (question) question.order = index
    })
    active.value.globalQuestions.sort((a, b) => a.order - b.order)
    touch()
  }

  /** Supprime la question d'une étape (l'étape reste dans la chronologie). */
  function clearStepQuestion (id) {
    const step = active.value?.steps.find((s) => s.id === id)
    if (!step) return
    commit()
    step.question = ''
    step.questionResolved = false
    step.questionAnswer = ''
    touch()
  }

  function setStepQuestion (id, patch) {
    const step = active.value?.steps.find((s) => s.id === id)
    if (!step) return
    Object.assign(step, patch)
    touch()
  }

  /* ------------------------------------------------------------------ import */

  /**
   * Importe un fichier .json (base complète, dossier seul, ou export des
   * versions précédentes). mode : 'merge' (ajout) ou 'replace' (dossier courant).
   */
  function importPayload (payload, { mode = 'merge', filename = 'Dossier importé', asCopies = false, suffix = '' } = {}) {
    let incoming = []
    if (Array.isArray(payload?.dossiers)) incoming = payload.dossiers
    else if (payload?.dossier) incoming = [payload.dossier]
    else if (Array.isArray(payload?.steps) || payload?.meta) incoming = [payload]
    if (!incoming.length) return { ok: false, count: 0 }

    commit({ backup: mode === 'replace', label: mode === 'replace' ? 'avant import dans le dossier courant' : '' })
    const fallback = String(filename).replace(/\.json$/i, '')

    // Catalogues du fichier : réunis aux nôtres, jamais substitués
    actors.value = sanitizeActors([...actors.value, ...(payload?.actors || [])])
    const knownKeys = new Set(customCategories.value.map((c) => c.key))
    sanitizeCategories(payload?.categories).forEach((c) => {
      if (!knownKeys.has(c.key)) customCategories.value.push(c)
    })
    ;(Array.isArray(payload?.trash) ? payload.trash : []).forEach((raw) => {
      const dossier = sanitizeDossier(raw, fallback)
      if (!trash.value.some((d) => d.id === dossier.id) && !dossiers.value.some((d) => d.id === dossier.id)) {
        trash.value.push({ ...dossier, deletedAt: raw.deletedAt || new Date().toISOString() })
      }
    })

    if (mode === 'replace' && active.value) {
      // La version remplacée part à la corbeille : rien n'est perdu.
      const previous = JSON.parse(JSON.stringify(active.value))
      trash.value = [{ ...previous, id: uid('dos'), name: `${previous.name} (avant import)`, deletedAt: new Date().toISOString() }, ...trash.value]
      const merged = sanitizeDossier(incoming[0], fallback)
      merged.id = active.value.id
      merged.name = active.value.name
      merged.updatedAt = new Date().toISOString()
      const index = dossiers.value.findIndex((d) => d.id === merged.id)
      dossiers.value.splice(index, 1, merged)
      return { ok: true, count: 1, mode }
    }

    let lastId = null
    incoming.forEach((raw) => {
      const dossier = sanitizeDossier(raw, fallback)
      if (asCopies || dossiers.value.some((d) => d.id === dossier.id) || trash.value.some((d) => d.id === dossier.id)) {
        dossier.id = uid('dos')
        dossier.steps.forEach((s) => { s.id = uid('step') })
        dossier.globalQuestions.forEach((q) => { q.id = uid('gq') })
      }
      if (suffix) dossier.name = `${dossier.name} ${suffix}`
      dossier.updatedAt = new Date().toISOString()
      dossiers.value.push(dossier)
      lastId = dossier.id
    })
    if (lastId) activeId.value = lastId
    return { ok: true, count: incoming.length, mode }
  }

  /* ------------------------------------------------------------ synchronisation */

  /** Copie sérialisable de la base, destinée à être chiffrée puis envoyée. */
  function exportDb () {
    return JSON.parse(JSON.stringify({ version: 1, ...currentDb() }))
  }

  /**
   * Fusionne une base distante (déjà déchiffrée) avec l'état local, selon les
   * mêmes règles que deux onglets : l'union l'emporte, rien n'est perdu.
   * Retourne false si la structure est inconnue.
   */
  function mergeRemoteDb (remote) {
    const normalized = normalizeDb(remote)
    if (!normalized) return false
    commit({ backup: true, label: 'avant fusion de la synchronisation' })
    loadIntoState(mergeDb(normalized, currentDb()))
    schedulePersist()
    return true
  }

  /** Sauvegardes automatiques disponibles (les plus récentes d'abord). */
  function backups () {
    return listBackups().map((b) => {
      let count = 0
      try { count = (JSON.parse(b.json).dossiers || []).length } catch { count = 0 }
      return { at: b.at, label: b.label || '', dossiers: count, size: b.json.length, json: b.json }
    })
  }

  /** Restaure une sauvegarde : ses dossiers sont ajoutés en copies datées, rien n'est écrasé. */
  function restoreBackup (backup) {
    const parsed = JSON.parse(backup.json)
    const when = new Date(backup.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    return importPayload(parsed, { mode: 'merge', asCopies: true, suffix: `(sauvegarde du ${when})` })
  }

  return {
    dossiers,
    activeId,
    trash,
    actors,
    categories,
    deletedCategories,
    customCategoriesAll: customCategories,
    categoryMap,
    category,
    categoryUsage,
    active,
    dossiersByRecent,
    orderedSteps,
    attachments,
    knownActors,
    saveState,
    saveError,
    preservedKey,
    externalEvents,
    canUndo,
    canRedo,
    init,
    persistNow,
    commit,
    undo,
    redo,
    selectDossier,
    addDossier,
    duplicateActive,
    renameActive,
    removeActive,
    restoreFromTrash,
    purgeFromTrash,
    addCategory,
    updateCategory,
    removeCategory,
    restoreCategory,
    rememberActor,
    forgetActor,
    addStep,
    updateStep,
    duplicateStep,
    removeStep,
    reorderSteps,
    shiftStepDate,
    setSortMode,
    setViewMode,
    nextPjCode,
    renumberAttachments,
    detachAttachment,
    addGlobalQuestion,
    updateGlobalQuestion,
    removeGlobalQuestion,
    reorderGlobalQuestions,
    setStepQuestion,
    clearStepQuestion,
    parties,
    addParty,
    updateParty,
    removeParty,
    reorderParties,
    importPayload,
    backups,
    restoreBackup,
    exportDb,
    mergeRemoteDb
  }
})
