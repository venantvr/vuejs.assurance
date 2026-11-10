/** Sauvegarde et chargement de fichiers (.json, .csv, .txt). */
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { downloadFile, slugify } from '@/lib/format.js'
import { dossierToCsv } from '@/lib/exporters.js'
import { todayISO } from '@/lib/model.js'

const APP = 'vuejs.assurance'

export function useFiles () {
  const store = useDossiersStore()
  const ui = useUiStore()

  function exportActive () {
    const dossier = store.active
    if (!dossier) return
    const payload = { app: APP, kind: 'dossier', version: 1, exportedAt: new Date().toISOString(), dossier }
    downloadFile(
      `assurance_${slugify(dossier.meta.ref || dossier.name)}_${todayISO()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    )
    ui.toast('Dossier sauvegardé sur votre ordinateur')
  }

  function exportAll () {
    const payload = { app: APP, kind: 'base', version: 1, exportedAt: new Date().toISOString(), dossiers: store.dossiers }
    downloadFile(
      `assurance_sauvegarde-complete_${todayISO()}.json`,
      JSON.stringify(payload, null, 2),
      'application/json'
    )
    ui.toast(`${store.dossiers.length} dossier(s) sauvegardé(s)`)
  }

  function exportCsv () {
    const dossier = store.active
    if (!dossier) return
    downloadFile(`assurance_chronologie_${slugify(dossier.name)}.csv`, dossierToCsv(dossier), 'text/csv')
    ui.toast('Chronologie exportée au format CSV')
  }

  function readJsonFile (file, mode = 'merge') {
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const payload = JSON.parse(event.target.result)
        const result = store.importPayload(payload, { mode, filename: file.name })
        if (!result.ok) {
          ui.toast('Aucun dossier reconnu dans ce fichier', { type: 'error' })
          return
        }
        ui.toast(mode === 'replace'
          ? 'Dossier courant remplacé par le contenu du fichier'
          : `${result.count} dossier(s) importé(s) — Ctrl+Z pour annuler`)
      } catch {
        ui.toast('Fichier illisible : JSON invalide', { type: 'error' })
      }
    }
    reader.onerror = () => ui.toast('Lecture du fichier impossible', { type: 'error' })
    reader.readAsText(file)
  }

  return { exportActive, exportAll, exportCsv, readJsonFile }
}
