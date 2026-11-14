/** Formatage et helpers d'affichage. */
import { todayISO } from './model.js'
import { loadPrefs, savePrefs } from './storage.js'

export function formatDateFR (iso) {
  if (!iso) return '—'
  const parts = String(iso).split('-')
  if (parts.length !== 3) return iso
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

export function formatCurrency (value) {
  const n = Number.parseFloat(value) || 0
  return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
}

export function formatRelative (iso) {
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return "à l'instant"
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`
  return `le ${new Date(t).toLocaleDateString('fr-FR')}`
}

export function slugify (str) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'document'
}

/** Nom de fichier normalisé d'une pièce : PJ-01_2026-09-12_Nom.pdf */
export function pjFilename (attachment, date) {
  const code = (attachment?.code || 'PJ').trim().replace(/\s+/g, '-')
  return `${code}_${date || 'date'}_${slugify(attachment?.name || 'document')}.pdf`
}

/**
 * Nom de fichier précédé du compteur du jour : 01_nom.ext, 02_nom.ext…
 * Le compteur est global (tous types de téléchargements), repart à 01 au premier
 * téléchargement de chaque jour et vit dans les préférences locales du navigateur.
 */
export function nextDownloadName (filename, { today = todayISO(), commit = true } = {}) {
  const prefs = loadPrefs()
  const state = prefs.downloadCounter
  const n = (state && state.date === today && Number.isInteger(state.n) ? state.n : 0) + 1
  if (commit) savePrefs({ ...prefs, downloadCounter: { date: today, n } })
  return `${String(n).padStart(2, '0')}_${filename}`
}

export function downloadFile (filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nextDownloadName(filename)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export async function copyToClipboard (text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch { /* bascule sur la méthode de repli */ }
  }
  const ta = document.createElement('textarea')
  ta.value = text
  ta.style.position = 'fixed'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}
