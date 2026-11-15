/**
 * Archive « dossier + pièces » : JSON du dossier, fichiers des pièces Drive
 * (lus par l'API, jeton lecture seule) et un index lisible de ce qui est
 * inclus ou non — rien n'est omis en silence.
 */
import { createZip } from './zip.js'
import { driveIdFromUrl, fetchDriveFile } from './gdrive.js'
import { formatDateFR, slugify } from './format.js'
import { dossierToMarkdown } from './markdown.js'

const MIME_EXT = {
  'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif',
  'image/webp': '.webp', 'image/heic': '.heic', 'text/plain': '.txt', 'application/zip': '.zip',
  'application/msword': '.doc', 'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
}

/** Extension du fichier d'origine, à défaut déduite du type MIME. */
export function extensionFor (name, mimeType) {
  const match = String(name || '').match(/\.([A-Za-z0-9]{1,8})$/)
  if (match) return `.${match[1].toLowerCase()}`
  return MIME_EXT[mimeType] || '.bin'
}

/** Nom d'une pièce dans l'archive : PJ-01_2026-09-12_Nom.ext */
export function pieceEntryName (attachment, date, ext) {
  const code = (attachment.code || 'PJ').trim().replace(/\s+/g, '-')
  return `pieces/${code}_${date || 'date'}_${slugify(attachment.name || 'document')}${ext}`
}

/** Liste à plat des pièces d'un dossier, dans l'ordre chronologique des étapes. */
export function collectPieces (dossier) {
  return [...dossier.steps]
    .sort((a, b) => `${a.date}${a.time || ''}`.localeCompare(`${b.date}${b.time || ''}`))
    .flatMap((step) => (step.attachments || []).map((attachment) => ({ step, attachment })))
}

/**
 * @param {object} options
 * @param {object} options.dossier     dossier à archiver
 * @param {string} options.json        contenu JSON déjà sérialisé du dossier
 * @param {string} options.jsonName    nom du JSON dans l'archive
 * @param {string} options.token       jeton Drive (peut être vide)
 * @param {(event:object)=>void} [options.onProgress]  { index, total, status, label, detail }
 * @param {{cancelled:boolean}} [options.signal]
 * @returns {Promise<{ blob: Blob, included: number, missing: number, total: number }>}
 */
export async function buildArchive ({ dossier, json, jsonName, token, categoryOf = null, onProgress = () => {}, signal = { cancelled: false } }) {
  const pieces = collectPieces(dossier)
  const entries = [{ name: jsonName, data: json }]
  const report = []
  const cache = new Map() // id Drive → résultat, pour ne lire qu'une fois un fichier cité deux fois
  const pieceFiles = new Map() // id de pièce → chemin dans l'archive (liens relatifs du Markdown)

  for (let i = 0; i < pieces.length; i++) {
    if (signal.cancelled) throw new Error('Export annulé')
    const { step, attachment } = pieces[i]
    const label = `${attachment.code || 'PJ'} — ${attachment.name || 'document'}`
    const line = { code: attachment.code || '', name: attachment.name || '', date: step.date, url: attachment.url || '' }
    onProgress({ index: i, total: pieces.length, status: 'running', label })

    const fileId = driveIdFromUrl(attachment.url)
    if (!attachment.url) {
      report.push({ ...line, ok: false, reason: 'aucun lien enregistré' })
      onProgress({ index: i, total: pieces.length, status: 'skipped', label, detail: 'aucun lien' })
      continue
    }
    if (!fileId) {
      report.push({ ...line, ok: false, reason: 'lien hors Google Drive (non téléchargeable depuis le navigateur)' })
      onProgress({ index: i, total: pieces.length, status: 'skipped', label, detail: 'hors Drive' })
      continue
    }
    if (!token) {
      report.push({ ...line, ok: false, reason: 'jeton Drive absent ou expiré' })
      onProgress({ index: i, total: pieces.length, status: 'failed', label, detail: 'jeton Drive absent' })
      continue
    }

    if (!cache.has(fileId)) cache.set(fileId, await fetchDriveFile(token, fileId))
    const result = cache.get(fileId)
    if (!result.ok) {
      report.push({ ...line, ok: false, reason: result.error })
      onProgress({ index: i, total: pieces.length, status: 'failed', label, detail: result.error })
      continue
    }
    const name = pieceEntryName(attachment, step.date, extensionFor(result.name || attachment.name, result.mimeType))
    entries.push({ name, data: new Uint8Array(await result.blob.arrayBuffer()) })
    pieceFiles.set(attachment.id, name)
    report.push({ ...line, ok: true, file: name, source: result.name, exported: result.exported })
    onProgress({ index: i, total: pieces.length, status: 'done', label, detail: result.exported ? 'exporté en PDF' : '' })
  }

  const mdName = `${jsonName.replace(/\.json$/i, '')}.md`
  entries.push({ name: mdName, data: dossierToMarkdown(dossier, { categoryOf, pieceFiles }) })

  const included = report.filter((r) => r.ok).length
  const missing = report.length - included
  const text = [
    `Archive du dossier « ${dossier.name} »`,
    dossier.meta?.ref ? `Référence : ${dossier.meta.ref}` : null,
    `Générée le ${new Date().toLocaleString('fr-FR')}`,
    '',
    `Contenu : ${jsonName} (dossier complet, réimportable dans vuejs.assurance)`,
    `          ${mdName} (même dossier en Markdown lisible, liens vers pieces/)`,
    `          pieces/ (${included} pièce(s) sur ${report.length})`,
    '',
    '— PIÈCES INCLUSES —',
    ...(report.filter((r) => r.ok).map((r) => `${r.file}  ←  ${r.source || r.name}${r.exported ? ' (document Google exporté en PDF)' : ''}  [${formatDateFR(r.date)}]`)),
    included ? null : '(aucune)',
    '',
    '— PIÈCES NON INCLUSES —',
    ...(report.filter((r) => !r.ok).map((r) => `${r.code || 'PJ'} ${r.name || 'document'} [${formatDateFR(r.date)}] — ${r.reason}${r.url ? `\n    ${r.url}` : ''}`)),
    missing ? null : '(aucune)'
  ].filter((l) => l !== null).join('\n')
  entries.push({ name: 'LISEZMOI.txt', data: text })

  return { blob: createZip(entries), included, missing, total: report.length, report }
}
