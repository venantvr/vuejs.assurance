/**
 * Analyse d'une ligne de capture rapide.
 *
 * Exemples :
 *   "12/09 14h30 intervention plombier 285€ | AquaFuite | PJ Facture-AquaFuite"
 *   "hier relance: assureur sans réponse"
 *   "2026-09-12 déclaration du sinistre"
 */
import { isoOf, todayISO } from './model.js'

const CATEGORY_ALIASES = {
  sinistre: 'SINISTRE',
  tech: 'TECHNIQUE', technique: 'TECHNIQUE', travaux: 'TECHNIQUE',
  admin: 'ADMIN', administratif: 'ADMIN', courrier: 'ADMIN',
  blocage: 'BLOCAGE', relance: 'BLOCAGE', litige: 'BLOCAGE',
  echeance: 'ECHEANCE', échéance: 'ECHEANCE', rdv: 'ECHEANCE'
}

const CATEGORY_HINTS = [
  { category: 'ADMIN', words: ['déclaration', 'declaration', 'courrier', 'recommandé', 'recommande', 'plainte', 'contrat', 'mail', 'expert', 'constat'] },
  { category: 'SINISTRE', words: ['dégât', 'degat', 'découverte', 'decouverte', 'incendie', 'effraction', 'accident', 'apparition', 'départ de feu', 'depart de feu', 'fuite constatée'] },
  { category: 'TECHNIQUE', words: ['plombier', 'intervention', 'travaux', 'recherche de fuite', 'assèchement', 'assechement', 'serrurier', 'devis', 'réparation', 'reparation', 'garage', 'bâchage', 'bachage'] },
  { category: 'BLOCAGE', words: ['relance', 'blocage', 'sans réponse', 'sans reponse', 'refus', 'désaccord', 'desaccord', 'retard', 'litige', 'mise en demeure'] },
  { category: 'ECHEANCE', words: ['rendez-vous', 'rdv', 'à venir', 'a venir', 'prévu', 'prevu', 'échéance', 'echeance', 'convocation'] }
]

function guessCategory (text) {
  const hay = text.toLowerCase()
  for (const hint of CATEGORY_HINTS) {
    if (hint.words.some((w) => hay.includes(w))) return hint.category
  }
  return 'ADMIN'
}

/** Alias de saisie pour les catégories personnalisées : clé, libellé court, libellé. */
function aliasesFor (categories) {
  const map = { ...CATEGORY_ALIASES }
  for (const cat of categories || []) {
    for (const token of [cat.key, cat.short, cat.label]) {
      const alias = String(token || '').trim().toLowerCase()
      if (alias && !alias.includes(' ')) map[alias] = cat.key
    }
    // premier mot du libellé court : « observation » pour « Observation / Constat »
    const first = String(cat.short || cat.label || '').trim().toLowerCase().split(/[\s/]+/)[0]
    if (first && !map[first]) map[first] = cat.key
  }
  return map
}

/**
 * @param {string} line  ligne saisie
 * @param {Array}  categories  catégories disponibles (natives + personnalisées)
 */
export function parseQuickLine (line, categories = []) {
  let text = String(line || '').trim()
  if (!text) return null

  const result = {
    date: todayISO(),
    time: '',
    category: null,
    fact: '',
    actor: '',
    amount: 0,
    pjName: '',
    guessedDate: true,
    guessedCategory: true
  }

  // Segments explicites : fait | acteur | montant | PJ nom
  const segments = text.split('|').map((s) => s.trim()).filter(Boolean)
  if (segments.length > 1) {
    text = segments[0]
    for (const segment of segments.slice(1)) {
      const money = segment.match(/^(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros)?$/i)
      if (money) result.amount = Number.parseFloat(money[1].replace(',', '.'))
      else if (/^PJ[\s:-]/i.test(segment)) result.pjName = segment.replace(/^PJ[\s:-]+/i, '').trim()
      else if (!result.actor) result.actor = segment
    }
  }

  // Date en tête
  const lower = text.toLowerCase()
  let match
  if (/^avant[- ]hier\b/.test(lower)) {
    const d = new Date(); d.setDate(d.getDate() - 2)
    result.date = isoOf(d); result.guessedDate = false
    text = text.replace(/^avant[- ]hier\s*/i, '')
  } else if (/^hier\b/.test(lower)) {
    const d = new Date(); d.setDate(d.getDate() - 1)
    result.date = isoOf(d); result.guessedDate = false
    text = text.replace(/^hier\s*/i, '')
  } else if (/^(aujourd'hui|auj)\b/.test(lower)) {
    result.guessedDate = false
    text = text.replace(/^(aujourd'hui|auj)\s*/i, '')
  } else if ((match = text.match(/^(\d{4})-(\d{2})-(\d{2})\s*/))) {
    result.date = `${match[1]}-${match[2]}-${match[3]}`
    result.guessedDate = false
    text = text.slice(match[0].length)
  } else if ((match = text.match(/^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?\s*/))) {
    const year = match[3]
      ? (match[3].length === 2 ? `20${match[3]}` : match[3])
      : String(new Date().getFullYear())
    result.date = `${year}-${String(match[2]).padStart(2, '0')}-${String(match[1]).padStart(2, '0')}`
    result.guessedDate = false
    text = text.slice(match[0].length)
  }

  // Heure : 14h30, 14:30, 9h
  const time = text.match(/^(\d{1,2})\s*[h:]\s*(\d{2})?\s*/)
  if (time) {
    result.time = `${String(time[1]).padStart(2, '0')}:${time[2] || '00'}`
    text = text.slice(time[0].length)
  }

  // Catégorie explicite : "tech:", "relance -"
  const aliases = aliasesFor(categories)
  const cat = text.match(/^([a-zA-Zéèàûô]+)\s*[:>-]\s*/)
  if (cat && aliases[cat[1].toLowerCase()]) {
    result.category = aliases[cat[1].toLowerCase()]
    result.guessedCategory = false
    text = text.slice(cat[0].length)
  }

  // Montant dans le texte
  if (!result.amount) {
    const money = text.match(/(\d{1,3}(?:[  ]\d{3})*|\d+)(?:[.,](\d{1,2}))?\s*(?:€|eur\b|euros\b)/i)
    if (money) {
      const int = money[1].replace(/[  ]/g, '')
      result.amount = Number.parseFloat(int + (money[2] ? `.${money[2]}` : ''))
      text = `${text.slice(0, money.index)}${text.slice(money.index + money[0].length)}`.replace(/\s{2,}/g, ' ').trim()
    }
  }

  // Pièce jointe en fin de ligne
  if (!result.pjName) {
    const pj = text.match(/\bPJ\s*[:=-]?\s*([^\s|]{3,})\s*$/i)
    if (pj) {
      result.pjName = pj[1]
      text = text.slice(0, pj.index).trim()
    }
  }

  result.fact = text.replace(/^[\s:,-]+/, '').trim()
  if (!result.fact) return null
  if (!result.category) result.category = guessCategory(`${result.fact} ${result.actor}`)
  return result
}
