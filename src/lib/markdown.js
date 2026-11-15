/**
 * Rendu Markdown lisible d'un dossier : synthèse, parties, chronologie (avec
 * liens relatifs vers les pièces de l'archive), questions. Sans HTML : le
 * fichier reste lisible dans n'importe quel éditeur ou visionneuse Markdown.
 */
import { CATEGORIES, actorsLabel, channelOf } from './model.js'
import { formatCurrency, formatDateFR } from './format.js'

/** Échappe le minimum pour qu'une valeur libre ne casse pas la mise en forme Markdown. */
function esc (value) {
  return String(value ?? '').replace(/([\\`*_{}[\]<>|])/g, '\\$1').replace(/\s*\n\s*/g, ' ').trim()
}

/** Texte libre multi-ligne : chaque ligne reste, mais ne peut pas ouvrir un titre ou une liste. */
function block (value) {
  return String(value ?? '').trim().split('\n')
    .map((line) => line.replace(/</g, '\\<').replace(/^(\s*)([#>*+-]|\d+\.)(?=\s)/, '$1\\$2'))
    .join('  \n')
}

/**
 * @param {object} dossier
 * @param {{ categoryOf?: (key:string)=>{short:string,icon:string}, pieceFiles?: Map<string,string> }} [options]
 *   pieceFiles : id de pièce → chemin du fichier dans l'archive (pour un lien relatif)
 */
export function dossierToMarkdown (dossier, { categoryOf = null, pieceFiles = new Map() } = {}) {
  const cat = (key) => (categoryOf ? categoryOf(key) : CATEGORIES[key]) || { short: key, icon: '' }
  const steps = [...dossier.steps].sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`))
  const meta = dossier.meta || {}
  const out = []

  out.push(`# ${esc(meta.project || dossier.name)}`, '')
  const info = [
    ['Référence', meta.ref], ['Parties', meta.parties], ['Assureur / gestionnaire', meta.insurer],
    ['Franchise', meta.deductible], ['Objet', meta.object], ['État actuel', meta.status]
  ].filter(([, v]) => v && String(v).trim())
  info.forEach(([k, v]) => out.push(`- **${k}** : ${esc(v)}`))
  out.push(`- **Archive générée le** ${new Date().toLocaleDateString('fr-FR')}`, '')

  const parties = [...(dossier.parties || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((p) => [p.role, p.name, p.address, p.identifiers, p.references, p.contact, p.notes].some((x) => String(x || '').trim()))
  if (parties.length) {
    out.push('## Parties et coordonnées', '')
    for (const p of parties) {
      out.push(`### ${esc([p.role, p.name].filter(Boolean).join(' — '))}`)
      for (const v of [p.address, p.identifiers, p.references, p.contact, p.notes]) if (String(v || '').trim()) out.push(`- ${esc(v)}`)
      out.push('')
    }
  }

  out.push('## Chronologie', '')
  if (!steps.length) out.push('_Aucune étape._', '')
  for (const s of steps) {
    const c = cat(s.category)
    const channel = channelOf(s.channel)
    const head = [`**${formatDateFR(s.date)}${s.time ? ` ${s.time}` : ''}**`, `${c.icon || ''} ${esc(c.short)}`.trim()]
    const who = actorsLabel(s)
    if (who) head.push(esc(who))
    if (channel) head.push(`${channel.icon} ${esc(channel.short)}`)
    if (Number.parseFloat(s.amount) > 0) head.push(formatCurrency(s.amount))
    out.push(`### ${head.join(' · ')}`, '', block(s.fact), '')
    if (s.impact?.trim()) out.push(`- Impact : ${esc(s.impact)}`)
    for (const a of s.attachments || []) {
      const label = esc(`${a.code || 'PJ'} — ${a.name || 'document'}`)
      const local = pieceFiles.get(a.id)
      const parts = [local ? `[${label}](${encodeURI(local)})` : label]
      if (a.url) parts.push(`[${/^https:\/\/(drive|docs)\.google\.com\//.test(a.url) ? 'Drive' : 'Lien'}](${a.url})`)
      if (!local && !a.url) parts.push('_(sans fichier ni lien)_')
      out.push(`- 📎 ${parts.join(' · ')}`)
    }
    if (s.question?.trim()) {
      out.push(`- ${s.questionResolved ? '✅' : '❓'} Question : ${esc(s.question)}`)
      if (s.questionAnswer?.trim()) out.push(`  - Réponse : ${esc(s.questionAnswer)}`)
    }
    out.push('')
  }

  const general = (dossier.globalQuestions || []).filter((q) => String(q.text || '').trim())
  const stepQuestions = steps.filter((s) => s.question?.trim())
  if (general.length || stepQuestions.length) {
    out.push('## Questions et points d\'arbitrage', '')
    for (const s of stepQuestions) {
      out.push(`- ${s.questionResolved ? '✅' : '❓'} ${formatDateFR(s.date)} — ${esc(s.question)}${s.questionAnswer?.trim() ? ` → ${esc(s.questionAnswer)}` : ''}`)
    }
    for (const q of general) {
      out.push(`- ${q.status === 'RESOLVED' ? '✅' : '❓'} ${esc(q.text)}${q.answer?.trim() ? ` → ${esc(q.answer)}` : ''}`)
    }
    out.push('')
  }

  const total = steps.reduce((sum, s) => sum + (Number.parseFloat(s.amount) || 0), 0)
  if (total > 0) out.push('---', '', `Total des sommes engagées : **${formatCurrency(total)}**`, '')
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}
