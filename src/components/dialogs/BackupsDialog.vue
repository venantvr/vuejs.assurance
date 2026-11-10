<script setup>
/**
 * Sauvegardes automatiques : un anneau de copies de la base prises avant les
 * modifications (toutes les deux minutes au plus, ou immédiatement avant une
 * action destructive). Restaurer ajoute des copies datées : rien n'est écrasé.
 */
import { computed, ref } from 'vue'
import BaseDialog from '../BaseDialog.vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { listPreserved } from '@/lib/storage.js'
import { downloadFile } from '@/lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()

const refreshKey = ref(0)
const backups = computed(() => { void refreshKey.value; return store.backups() })
const preserved = computed(() => { void refreshKey.value; return listPreserved() })

function when (iso) {
  return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function restore (backup) {
  const result = store.restoreBackup(backup)
  ui.toast(`${result.count} dossier(s) restauré(s) en copie — comparez, puis mettez à la corbeille ce que vous ne gardez pas`)
  ui.closeDialog()
}

function download (backup) {
  downloadFile(`assurance_sauvegarde_${backup.at.replace(/[:.]/g, '-')}.json`, backup.json, 'application/json')
}

function downloadPreserved (entry) {
  try {
    downloadFile(`assurance_contenu-illisible_${entry.at.replace(/[:.]/g, '-')}.txt`, localStorage.getItem(entry.key) || '', 'text/plain')
  } catch {
    ui.toast('Lecture impossible', { type: 'error' })
  }
}
</script>

<template>
  <BaseDialog title="Sauvegardes automatiques" subtitle="prises avant vos modifications" width="760px" @close="ui.closeDialog()">
    <p class="small muted">
      Restaurer <b>ajoute</b> les dossiers de la sauvegarde en copies datées à côté des vôtres ; rien n'est
      écrasé. Vous comparez, puis mettez à la corbeille ce que vous ne gardez pas.
    </p>

    <div v-if="backups.length" class="stack">
      <div v-for="backup in backups" :key="backup.at" class="row bk-row">
        <span class="badge">{{ when(backup.at) }}</span>
        <span class="small">{{ backup.dossiers }} dossier(s) · {{ Math.round(backup.size / 1024) }} Ko</span>
        <span v-if="backup.label" class="xsmall muted">{{ backup.label }}</span>
        <span class="grow" />
        <button class="btn btn-sm" @click="download(backup)">⬇ .json</button>
        <button class="btn btn-sm btn-primary" @click="restore(backup)">♻ Restaurer en copie</button>
      </div>
    </div>
    <div v-else class="empty">
      <b>Aucune sauvegarde automatique pour l'instant</b>
      Elles se constituent au fil de vos modifications (au plus une toutes les deux minutes, et toujours avant une action destructive).
    </div>

    <section v-if="preserved.length">
      <b class="small">Contenus illisibles mis de côté</b>
      <p class="xsmall muted">
        Au chargement, un contenu que l'application n'a pas pu lire a été conservé tel quel plutôt qu'écrasé.
        Téléchargez-le : il est souvent récupérable à la main.
      </p>
      <div class="stack">
        <div v-for="entry in preserved" :key="entry.key" class="row bk-row">
          <span class="badge badge-warn">{{ when(entry.at) }}</span>
          <span class="small mono">{{ entry.key }}</span>
          <span class="xsmall muted">{{ Math.round(entry.size / 1024) }} Ko</span>
          <span class="grow" />
          <button class="btn btn-sm" @click="downloadPreserved(entry)">⬇ Télécharger</button>
        </div>
      </div>
    </section>

    <template #footer>
      <button class="btn btn-primary" @click="ui.closeDialog()">Fermer</button>
      <span class="grow" />
      <span class="small muted">Ces copies vivent dans le navigateur : le fichier .json reste la sauvegarde de référence.</span>
    </template>
  </BaseDialog>
</template>

<style scoped>
.bk-row { border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; background: var(--surface); }
</style>
