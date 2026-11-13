/** Générateurs de sorties : CSV et brouillon de courrier à l'assureur. */
import { CATEGORIES, actorsLabel, channelOf, todayISO } from './model.js'
import { formatCurrency, formatDateFR, pjFilename } from './format.js'

const byDate = (a, b) => `${a.date}T${a.time || '00:00'}`.localeCompare(`${b.date}T${b.time || '00:00'}`)

function csvCell (value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function dossierToCsv (dossier) {
  const header = ['Date', 'Heure', 'Catégorie', 'Fait', 'Acteur', 'Canal', 'Montant EUR', 'Impact', 'Code PJ', 'Nom PJ', 'Lien PJ', 'Question', 'Question résolue', 'Réponse']
  const rows = [header.map(csvCell).join(';')]
  for (const step of [...dossier.steps].sort(byDate)) {
    rows.push([
      step.date,
      step.time,
      CATEGORIES[step.category]?.short || step.category,
      step.fact,
      actorsLabel(step),
      channelOf(step.channel)?.short || '',
      (Number.parseFloat(step.amount) || 0).toFixed(2).replace('.', ','),
      step.impact,
      step.pjCode,
      step.pjName,
      step.pjUrl,
      step.question,
      step.question ? (step.questionResolved ? 'oui' : 'non') : '',
      step.questionAnswer
    ].map(csvCell).join(';'))
  }
  return `﻿${rows.join('\r\n')}`
}

export function buildMail (dossier, { kind = 'SYNTHESE' } = {}) {
  const steps = [...dossier.steps].sort(byDate)
  const total = steps.reduce((sum, s) => sum + (Number.parseFloat(s.amount) || 0), 0)

  const openQuestions = [
    ...steps.filter((s) => s.question?.trim() && !s.questionResolved).map((s) => s.question),
    ...dossier.globalQuestions.filter((q) => q.status !== 'RESOLVED' && q.text.trim()).map((q) => q.text)
  ]

  const lines = []
  const subject = kind === 'RELANCE'
    ? "relance et point d'avancement du dossier"
    : 'chronologie factuelle et pièces justificatives'
  lines.push(`Objet : ${dossier.meta.ref ? `${dossier.meta.ref} — ` : ''}${subject}`)
  lines.push('', 'Madame, Monsieur,', '')
  if (dossier.meta.project) lines.push(`Projet : ${dossier.meta.project}.`)
  if (dossier.meta.comment) lines.push(`Commentaires : ${dossier.meta.comment}.`)
  lines.push(dossier.meta.object
    ? `Je reviens vers vous au sujet du sinistre suivant : ${dossier.meta.object}`
    : 'Je reviens vers vous au sujet du dossier référencé en objet.')
  if (dossier.meta.parties) lines.push(`Parties concernées : ${dossier.meta.parties}.`)
  const parties = [...(dossier.parties || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).filter((p) => p.name || p.role)
  if (parties.length) {
    lines.push('', '— PARTIES —')
    for (const p of parties) {
      const head = [p.role, p.name].filter(Boolean).join(' : ')
      const extra = [p.address, p.identifiers, p.references, p.contact].filter(Boolean).join(' — ')
      lines.push(`• ${head}${extra ? ` — ${extra}` : ''}`)
    }
  }
  if (dossier.meta.status) lines.push(`État actuel du dossier : ${dossier.meta.status}.`)
  lines.push('')
  lines.push("Afin de vous faire gagner du temps dans l'instruction, vous trouverez ci-dessous la chronologie factuelle des événements, chaque élément clé étant appuyé par une pièce justificative numérotée.")
  lines.push('', '— CHRONOLOGIE —')

  for (const step of steps) {
    const details = []
    const who = actorsLabel(step)
    if (who) details.push(`${who.includes('&') ? 'intervenants' : 'intervenant'} : ${who}`)
    const channel = channelOf(step.channel)
    if (channel) details.push(`par ${channel.label.toLowerCase()}`)
    if (Number.parseFloat(step.amount) > 0) details.push(`montant : ${formatCurrency(step.amount)}`)
    if (step.pjCode) details.push(step.pjCode)
    const suffix = details.length ? ` (${details.join(' ; ')})` : ''
    lines.push(`• ${formatDateFR(step.date)}${step.time ? ` à ${step.time}` : ''} — ${step.fact.replace(/\s+/g, ' ').trim()}${suffix}`)
  }

  if (total > 0) {
    lines.push('', `Total des sommes engagées / chiffrées à ce jour : ${formatCurrency(total)}.`)
  }

  if (openQuestions.length) {
    lines.push('', '— POINTS NÉCESSITANT VOTRE POSITION ÉCRITE —')
    openQuestions.forEach((q, i) => lines.push(`${i + 1}. ${q}`))
  }

  const attachments = steps.filter((s) => s.pjCode)
  if (attachments.length) {
    lines.push('', '— BORDEREAU DES PIÈCES JOINTES —')
    attachments.forEach((s) => lines.push(`${s.pjCode} — ${s.pjName || 'document'} (${formatDateFR(s.date)}) — ${pjFilename(s)}${s.pjUrl ? ` — consultable : ${s.pjUrl}` : ''}`))
  }

  lines.push('')
  if (kind === 'RELANCE') {
    const last = steps.length ? formatDateFR(steps[steps.length - 1].date) : formatDateFR(todayISO())
    lines.push(`Sauf erreur de ma part, ce dossier est sans évolution depuis le ${last}. Je vous remercie de bien vouloir m'indiquer par écrit la suite réservée aux points ci-dessus, ainsi que le délai prévisionnel de traitement.`)
  } else {
    lines.push("Je reste à votre disposition pour tout complément et vous remercie de bien vouloir me confirmer par écrit votre position sur les points listés ci-dessus.")
  }
  lines.push('')
  lines.push("Dans l'attente de votre retour, je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.")
  lines.push('', '[Nom, prénom]', `[Référence : ${dossier.meta.ref || 'à compléter'}]`, '[Téléphone / courriel]')
  return lines.join('\n')
}
