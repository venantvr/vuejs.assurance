/**
 * Modèle de données : catégories, création et normalisation des entités.
 */

export const CATEGORIES = {
  SINISTRE: { label: 'Fait générateur / Sinistre', short: 'Sinistre', icon: '⚠' },
  TECHNIQUE: { label: 'Mesure conservatoire / Technique', short: 'Technique', icon: '🔧' },
  ADMIN: { label: 'Administratif / Juridique', short: 'Administratif', icon: '📄' },
  BLOCAGE: { label: 'Point de blocage / Relance', short: 'Blocage / Relance', icon: '🔔' },
  ECHEANCE: { label: 'Échéance / Rendez-vous', short: 'Échéance', icon: '📅' }
}

export const CATEGORY_ORDER = ['SINISTRE', 'TECHNIQUE', 'ADMIN', 'BLOCAGE', 'ECHEANCE']

export const SORT_MODES = {
  DATE_ASC: 'Ancien → récent',
  DATE_DESC: 'Récent → ancien',
  MANUAL: 'Ordre manuel (glisser-déposer)'
}

export function uid (prefix = 'id') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

export function isoOf (date) {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

export function todayISO () {
  return isoOf(new Date())
}

export function shiftISO (iso, days) {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return todayISO()
  d.setDate(d.getDate() + days)
  return isoOf(d)
}

export function daysBetween (isoA, isoB) {
  if (!isoA || !isoB) return null
  const a = new Date(`${isoA}T00:00:00`)
  const b = new Date(`${isoB}T00:00:00`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return Math.round((b - a) / 86400000)
}

export function createStep (overrides = {}) {
  return {
    id: uid('step'),
    date: todayISO(),
    time: '',
    category: 'ADMIN',
    fact: '',
    actor: '',
    amount: 0,
    impact: '',
    pjCode: '',
    pjName: '',
    question: '',
    questionResolved: false,
    questionAnswer: '',
    order: 0,
    ...overrides
  }
}

export function createQuestion (overrides = {}) {
  return { id: uid('gq'), text: '', status: 'PENDING', answer: '', order: 0, ...overrides }
}

export function createDossier (name = 'Nouveau dossier', template = null) {
  const now = new Date().toISOString()
  const steps = []

  if (template?.steps?.length) {
    template.steps.forEach((tpl, index) => {
      steps.push(createStep({
        date: shiftISO(todayISO(), index - (template.steps.length - 1)),
        category: tpl.category,
        fact: tpl.fact,
        actor: tpl.actor || '',
        impact: tpl.impact || '',
        pjName: tpl.pjName || '',
        question: tpl.question || '',
        amount: tpl.amount || 0,
        order: index
      }))
    })
    let n = 0
    steps.forEach((step) => {
      if (step.pjName) {
        n += 1
        step.pjCode = `PJ-${String(n).padStart(2, '0')}`
      }
    })
  }

  return {
    id: uid('dos'),
    name,
    createdAt: now,
    updatedAt: now,
    meta: {
      ref: '',
      parties: '',
      insurer: '',
      deductible: '',
      object: template?.object || '',
      status: ''
    },
    steps,
    globalQuestions: [],
    ui: { sortMode: 'DATE_ASC', viewMode: 'CARDS' }
  }
}

/** Normalise une structure venue d'un fichier ou du stockage (toutes versions). */
export function sanitizeDossier (raw, fallbackName = 'Dossier importé') {
  const base = createDossier(fallbackName)
  if (!raw || typeof raw !== 'object') return base

  const meta = raw.meta || {}
  const steps = Array.isArray(raw.steps) ? raw.steps : []
  const questions = Array.isArray(raw.globalQuestions) ? raw.globalQuestions : []

  const legacySort = raw.ui?.sortAsc === false ? 'DATE_DESC' : 'DATE_ASC'

  return {
    id: raw.id ? String(raw.id) : base.id,
    name: String(raw.name || meta.ref || fallbackName),
    createdAt: raw.createdAt || base.createdAt,
    updatedAt: raw.updatedAt || base.updatedAt,
    meta: {
      ref: meta.ref || '',
      parties: meta.parties || '',
      insurer: meta.insurer || '',
      deductible: meta.deductible || '',
      object: meta.object || '',
      status: meta.status || ''
    },
    steps: steps.map((step, index) => createStep({
      id: step.id || uid('step'),
      date: step.date || todayISO(),
      time: step.time || '',
      category: CATEGORIES[step.category] ? step.category : 'ADMIN',
      fact: step.fact || '',
      actor: step.actor || '',
      amount: Number.parseFloat(step.amount) || 0,
      impact: step.impact || '',
      pjCode: step.pjCode || '',
      pjName: step.pjName || '',
      question: step.question || '',
      questionResolved: !!step.questionResolved,
      questionAnswer: step.questionAnswer || '',
      order: Number.isFinite(step.order) ? step.order : index
    })),
    globalQuestions: questions.map((q, index) => createQuestion({
      id: q.id || uid('gq'),
      text: q.text || '',
      status: q.status === 'RESOLVED' ? 'RESOLVED' : 'PENDING',
      answer: q.answer || '',
      order: Number.isFinite(q.order) ? q.order : index
    })),
    ui: {
      sortMode: SORT_MODES[raw.ui?.sortMode] ? raw.ui.sortMode : legacySort,
      viewMode: raw.ui?.viewMode === 'TABLE' ? 'TABLE' : 'CARDS'
    }
  }
}

export function cloneDossier (dossier, { newIds = true, name } = {}) {
  const copy = sanitizeDossier(JSON.parse(JSON.stringify(dossier)))
  if (name) copy.name = name
  if (newIds) {
    copy.id = uid('dos')
    copy.steps.forEach((s) => { s.id = uid('step') })
    copy.globalQuestions.forEach((q) => { q.id = uid('gq') })
  }
  copy.createdAt = copy.updatedAt = new Date().toISOString()
  return copy
}
