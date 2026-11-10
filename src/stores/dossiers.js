/**
 * Store principal : dossiers, étapes, questions, historique (annuler/rétablir)
 * et persistance automatique dans le navigateur.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  cloneDossier, createDossier, createQuestion, createStep,
  sanitizeDossier, todayISO, uid
} from '@/lib/model.js'
import { loadDb, saveDb } from '@/lib/storage.js'
import { DOSSIER_TEMPLATES } from '@/lib/presets.js'

const HISTORY_LIMIT = 80
const SAVE_DELAY = 300

export const useDossiersStore = defineStore('dossiers', () => {
  const dossiers = ref([])
  const activeId = ref(null)

  const saveState = ref('saved') // saved | pending | error
  const saveError = ref('')

  const past = shallowRef([])
  const future = shallowRef([])

  let saveTimer = null
  let restoring = false

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
      .filter((s) => s.pjCode || s.pjName)
      .sort((a, b) => (a.pjCode || 'zz').localeCompare(b.pjCode || 'zz', 'fr', { numeric: true }))
  })

  const knownActors = computed(() => {
    const set = new Set()
    dossiers.value.forEach((d) => d.steps.forEach((s) => s.actor.trim() && set.add(s.actor.trim())))
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  })

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  /* ------------------------------------------------------------ persistance */

  function snapshotState () {
    return JSON.stringify({ activeId: activeId.value, dossiers: dossiers.value })
  }

  function schedulePersist () {
    if (restoring) return
    saveState.value = 'pending'
    clearTimeout(saveTimer)
    saveTimer = setTimeout(persistNow, SAVE_DELAY)
  }

  function persistNow () {
    clearTimeout(saveTimer)
    const result = saveDb({ activeId: activeId.value, dossiers: dossiers.value })
    saveState.value = result.ok ? 'saved' : 'error'
    saveError.value = result.ok ? '' : result.error
    return result
  }

  watch([dossiers, activeId], schedulePersist, { deep: true })

  /* --------------------------------------------------------------- historique */

  /** Enregistre l'état courant avant une modification annulable. */
  function commit () {
    past.value = [...past.value, snapshotState()].slice(-HISTORY_LIMIT)
    future.value = []
  }

  function applySnapshot (json) {
    const parsed = JSON.parse(json)
    restoring = true
    dossiers.value = parsed.dossiers.map((d) => sanitizeDossier(d))
    activeId.value = parsed.activeId
    restoring = false
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
    const db = loadDb()
    restoring = true
    dossiers.value = db.dossiers.length ? db.dossiers : [demoDossier()]
    activeId.value = db.activeId && db.dossiers.length ? db.activeId : dossiers.value[0].id
    restoring = false
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

  function removeActive () {
    if (!active.value) return
    commit()
    const id = activeId.value
    dossiers.value = dossiers.value.filter((d) => d.id !== id)
    if (!dossiers.value.length) dossiers.value.push(createDossier('Nouveau dossier'))
    activeId.value = dossiers.value[0].id
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
        .filter((s) => s.pjCode || s.pjName)
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
  function importPayload (payload, { mode = 'merge', filename = 'Dossier importé' } = {}) {
    let incoming = []
    if (Array.isArray(payload?.dossiers)) incoming = payload.dossiers
    else if (payload?.dossier) incoming = [payload.dossier]
    else if (Array.isArray(payload?.steps) || payload?.meta) incoming = [payload]
    if (!incoming.length) return { ok: false, count: 0 }

    commit()
    const fallback = String(filename).replace(/\.json$/i, '')

    if (mode === 'replace' && active.value) {
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
      if (dossiers.value.some((d) => d.id === dossier.id)) dossier.id = uid('dos')
      dossier.updatedAt = new Date().toISOString()
      dossiers.value.push(dossier)
      lastId = dossier.id
    })
    if (lastId) activeId.value = lastId
    return { ok: true, count: incoming.length, mode }
  }

  return {
    dossiers,
    activeId,
    active,
    dossiersByRecent,
    orderedSteps,
    attachments,
    knownActors,
    saveState,
    saveError,
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
    importPayload
  }
})
