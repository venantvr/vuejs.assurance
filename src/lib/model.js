/**
 * Modèle de données : catégories, création et normalisation des entités.
 */

/** Palette proposée pour les catégories personnalisées. */
export const CATEGORY_COLORS = [
  { name: 'Rouge', value: '#dc2626' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Ambre', value: '#b45309' },
  { name: 'Vert', value: '#047857' },
  { name: 'Turquoise', value: '#0d9488' },
  { name: 'Bleu', value: '#2563eb' },
  { name: 'Indigo', value: '#4338ca' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Rose', value: '#be185d' },
  { name: 'Ardoise', value: '#475569' }
]

/** Catégories livrées avec l'application : ni modifiables, ni supprimables. */
export const BUILTIN_CATEGORIES = [
  { key: 'SINISTRE', label: 'Fait générateur / Sinistre', short: 'Sinistre', icon: '⚠', color: '#dc2626', builtin: true },
  { key: 'TECHNIQUE', label: 'Mesure conservatoire / Technique', short: 'Technique', icon: '🔧', color: '#2563eb', builtin: true },
  { key: 'ADMIN', label: 'Administratif / Juridique', short: 'Administratif', icon: '📄', color: '#b45309', builtin: true },
  { key: 'BLOCAGE', label: 'Point de blocage / Relance', short: 'Blocage / Relance', icon: '🔔', color: '#7c3aed', builtin: true },
  { key: 'ECHEANCE', label: 'Échéance / Rendez-vous', short: 'Échéance', icon: '📅', color: '#047857', builtin: true }
]

/** Catégories suggérées à l'ajout (un clic suffit à les créer). */
export const CATEGORY_SUGGESTIONS = [
  { label: 'Observation / Constat sur site', short: 'Observation', icon: '🔍', color: '#0d9488' },
  { label: 'Question posée / restée sans réponse', short: 'Question', icon: '❓', color: '#4338ca' },
  { label: 'Expertise judiciaire', short: 'Expertise', icon: '⚖', color: '#be185d' },
  { label: 'Travaux / Chantier', short: 'Chantier', icon: '🏠', color: '#ea580c' },
  { label: 'Désordre constaté', short: 'Désordre', icon: '💥', color: '#dc2626' }
]

/** Canal / support d'un échange : utile pour prouver une notification (LRAR) ou dater un accord. */
export const CHANNELS = [
  { key: 'EMAIL', label: 'E-mail', short: 'E-mail', icon: '✉' },
  { key: 'LRAR', label: 'Lettre recommandée avec AR', short: 'LRAR', icon: '📨' },
  { key: 'COURRIER', label: 'Courrier simple', short: 'Courrier', icon: '📮' },
  { key: 'SMS', label: 'SMS / messagerie', short: 'SMS', icon: '📱' },
  { key: 'TEL', label: 'Appel téléphonique', short: 'Téléphone', icon: '☎' },
  { key: 'REUNION', label: 'Réunion / visite sur place', short: 'Réunion', icon: '🤝' },
  { key: 'VISIO', label: 'Visioconférence', short: 'Visio', icon: '🎥' },
  { key: 'PORTAIL', label: 'Espace client / portail en ligne', short: 'Portail', icon: '🌐' },
  { key: 'MAIN_PROPRE', label: 'Remise en main propre', short: 'Main propre', icon: '🤲' }
]
export const CHANNEL_MAP = Object.fromEntries(CHANNELS.map((c) => [c.key, c]))

export function channelOf (key) {
  return CHANNEL_MAP[key] || null
}

/** Rôles usuels d'une partie au dossier (suggestions de saisie). */
export const PARTY_ROLES = [
  'MOA', 'MOE', 'Assurance MOE', 'Expert MOE', 'Entrepreneur', 'Assurance entrepreneur',
  'Assuré', 'Assureur', 'Expert assureur', 'Expert d\'assuré', 'Syndic', 'Avocat', 'Tiers'
]

export function createParty (overrides = {}) {
  return {
    id: uid('party'),
    role: '',
    name: '',
    address: '',
    identifiers: '',   // SIRET, SIREN, RCS…
    references: '',    // n° de contrat, de client, de sinistre, d'assuré…
    contact: '',       // téléphone, e-mail, interlocuteur
    notes: '',
    order: 0,
    ...overrides
  }
}

export function sanitizeParty (raw, index = 0) {
  const p = createParty()
  if (!raw || typeof raw !== 'object') return p
  for (const key of ['role', 'name', 'address', 'identifiers', 'references', 'contact', 'notes']) {
    p[key] = String(raw[key] ?? '').trim()
  }
  p.id = raw.id ? String(raw.id) : p.id
  p.order = Number.isFinite(raw.order) ? raw.order : index
  return p
}

/** Catégorie de repli quand une étape cite une catégorie supprimée. */
export const FALLBACK_CATEGORY = { key: 'ADMIN', label: 'Catégorie inconnue', short: 'Non classé', icon: '•', color: '#475569' }

export const CATEGORIES = Object.fromEntries(BUILTIN_CATEGORIES.map((c) => [c.key, c]))

/** Fabrique une clé technique stable à partir d'un libellé. */
export function categoryKey (label, taken = []) {
  const base = String(label || 'CATEGORIE')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'CATEGORIE'
  let key = base
  let n = 2
  while (taken.includes(key)) key = `${base}_${n++}`
  return key
}

export function createCategory ({ label, short, icon, color } = {}, taken = []) {
  const title = String(label || '').trim() || 'Nouvelle catégorie'
  return {
    key: categoryKey(title, taken),
    label: title,
    short: String(short || '').trim() || title.split(/[/(—-]/)[0].trim().slice(0, 22) || title,
    icon: String(icon || '').trim().slice(0, 3) || '•',
    color: CATEGORY_COLORS.some((c) => c.value === color) ? color : '#475569',
    builtin: false,
    deleted: false
  }
}

/** Normalise une liste de catégories personnalisées (sans écraser les natives). */
export function sanitizeCategories (list) {
  const taken = BUILTIN_CATEGORIES.map((c) => c.key)
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    if (!raw || typeof raw !== 'object') continue
    if (taken.includes(raw.key)) continue
    const category = createCategory(raw, taken)
    if (raw.key && !taken.includes(String(raw.key))) category.key = String(raw.key)
    category.deleted = Boolean(raw.deleted)
    taken.push(category.key)
    out.push(category)
  }
  return out
}

export const CATEGORY_ORDER = BUILTIN_CATEGORIES.map((c) => c.key)

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

/** Découpe une saisie libre en plusieurs intervenants (« Assuré & Syndic »). */
export function splitActors (value) {
  const raw = Array.isArray(value)
    ? value
    : String(value || '').split(/\s*(?:&|\+|;|,|\u00b7| \/ )\s*/)
  const seen = new Set()
  const out = []
  for (const item of raw) {
    const name = String(item || '').trim()
    const key = name.toLowerCase()
    if (name && !seen.has(key)) {
      seen.add(key)
      out.push(name)
    }
  }
  return out
}

/** Libellé lisible des intervenants d'une étape. */
export function actorsLabel (step) {
  return splitActors(step?.actors ?? step?.actor).join(' & ')
}

export function createStep (overrides = {}) {
  return {
    id: uid('step'),
    date: todayISO(),
    time: '',
    category: 'ADMIN',
    fact: '',
    actors: [],
    channel: '',
    amount: 0,
    impact: '',
    pjCode: '',
    pjName: '',
    question: '',
    questionResolved: false,
    questionAnswer: '',
    order: 0,
    ...overrides,
    actors: splitActors(overrides.actors ?? overrides.actor ?? [])
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
        actors: splitActors(tpl.actors ?? tpl.actor),
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
    parties: [],
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
      category: String(step.category || 'ADMIN').trim() || 'ADMIN',
      fact: step.fact || '',
      actors: splitActors(step.actors ?? step.actor),
      channel: CHANNEL_MAP[step.channel] ? step.channel : '',
      amount: Number.parseFloat(step.amount) || 0,
      impact: step.impact || '',
      pjCode: step.pjCode || '',
      pjName: step.pjName || '',
      question: step.question || '',
      questionResolved: !!step.questionResolved,
      questionAnswer: step.questionAnswer || '',
      order: Number.isFinite(step.order) ? step.order : index
    })),
    parties: (Array.isArray(raw.parties) ? raw.parties : []).map((p, index) => sanitizeParty(p, index)),
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
