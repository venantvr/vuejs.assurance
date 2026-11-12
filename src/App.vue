<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AppTopBar from './components/AppTopBar.vue'
import SummaryPanel from './components/SummaryPanel.vue'
import QuickCapture from './components/QuickCapture.vue'
import QuestionsPanel from './components/QuestionsPanel.vue'
import PartiesPanel from './components/PartiesPanel.vue'
import TimelinePanel from './components/TimelinePanel.vue'
import StepDrawer from './components/StepDrawer.vue'
import ToastHost from './components/ToastHost.vue'
import CategoriesDialog from './components/dialogs/CategoriesDialog.vue'
import PresetsDialog from './components/dialogs/PresetsDialog.vue'
import NewDossierDialog from './components/dialogs/NewDossierDialog.vue'
import RenameDossierDialog from './components/dialogs/RenameDossierDialog.vue'
import MailDialog from './components/dialogs/MailDialog.vue'
import HelpDialog from './components/dialogs/HelpDialog.vue'
import ConfirmDialog from './components/dialogs/ConfirmDialog.vue'
import { useDossiersStore } from './stores/dossiers.js'
import { useUiStore } from './stores/ui.js'
import { useHotkeys } from './composables/useHotkeys.js'
import { useFiles } from './composables/useFiles.js'
import BackupsDialog from './components/dialogs/BackupsDialog.vue'
import { watch } from 'vue'

const store = useDossiersStore()
const ui = useUiStore()
const files = useFiles()
const { active, saveState, saveError, preservedKey, externalEvents } = storeToRefs(store)

const capture = ref(null)
const timeline = ref(null)
const dragDepth = ref(0)
const isDraggingFile = computed(() => dragDepth.value > 0)

const printDate = new Date().toLocaleString('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
})

onMounted(() => {
  store.init()
  if (preservedKey.value) {
    ui.toast(`Contenu local illisible mis de côté sous « ${preservedKey.value} » — rien n'a été effacé`, { type: 'error', duration: 12000 })
  }
})

// Un autre onglet a écrit : l'état a été rechargé ou fusionné, l'historique local est reparti de zéro.
watch(() => externalEvents.value.length, () => {
  const last = externalEvents.value[externalEvents.value.length - 1]
  if (!last) return
  ui.toast(last.kind === 'merged'
    ? 'Modifications d’un autre onglet fusionnées — rien n’a été écrasé'
    : 'Données rechargées depuis un autre onglet')
})

useHotkeys({
  escape: () => ui.closeTopLayer(),
  new: () => ui.openDrawer({}),
  capture: () => capture.value?.focus(),
  search: () => timeline.value?.focusSearch(),
  help: () => ui.openDialog('help'),
  save: () => files.exportActive(),
  undo: () => store.undo() && ui.toast('Action annulée'),
  redo: () => store.redo() && ui.toast('Action rétablie')
})

function onDragEnter (event) {
  if (event.dataTransfer?.types?.includes('Files')) dragDepth.value += 1
}
function onDragLeave () {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}
function onDrop (event) {
  dragDepth.value = 0
  const file = event.dataTransfer?.files?.[0]
  if (file) files.readJsonFile(file, 'merge')
}

function confirmDeleteDossier () {
  if (!active.value) return
  ui.confirm({
    title: 'Supprimer le dossier ?',
    message: `« ${active.value.name} » et ses ${active.value.steps.length} étapes seront retirés du stockage local (annulable avec Ctrl+Z).`,
    confirmLabel: 'Supprimer',
    onConfirm: () => {
      store.removeActive()
      ui.toast('Dossier supprimé')
    }
  })
}
</script>

<template>
  <div
    class="app"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave.prevent="onDragLeave"
    @drop.prevent="onDrop"
  >
    <AppTopBar
      @new-dossier="ui.openDialog('new-dossier')"
      @rename-dossier="ui.openDialog('rename')"
      @delete-dossier="confirmDeleteDossier"
      @open-mail="ui.openDialog('mail')"
    />

    <div v-if="saveState === 'error'" class="save-alert no-print" role="alert">
      <b>⚠ Enregistrement impossible</b> — {{ saveError }}. Vos modifications ne sont conservées qu'en mémoire :
      téléchargez-les maintenant, puis libérez de l'espace (corbeille, sauvegardes) avant de fermer l'onglet.
      <button class="btn btn-sm btn-primary" @click="files.exportAll()">⬇ Télécharger tout maintenant</button>
      <button class="btn btn-sm" @click="store.persistNow()">Réessayer</button>
    </div>

    <div v-if="active" class="print-only print-head">
      <h1>Journal d'audit chronologique de sinistre</h1>
      <p class="small">Chronologie factuelle du dossier et parties en présence.</p>
      <p v-if="active.meta.project?.trim()" class="small"><b>Projet :</b> {{ active.meta.project }}</p>
      <p v-if="active.meta.comment?.trim()" class="small">{{ active.meta.comment }}</p>
      <p class="small muted">Édité le {{ printDate }} · Dossier : {{ active.meta.ref?.trim() || active.name }}</p>
    </div>

    <main v-if="active">
      <SummaryPanel />
      <QuickCapture ref="capture" />
      <PartiesPanel />
      <TimelinePanel ref="timeline" />
      <!-- Bordereau des pièces : mis de côté pour l'instant (composant conservé) -->
      <QuestionsPanel />
    </main>

    <StepDrawer />

    <PresetsDialog v-if="ui.dialog === 'presets'" />
    <CategoriesDialog v-if="ui.dialog === 'categories'" />
    <NewDossierDialog v-if="ui.dialog === 'new-dossier'" />
    <RenameDossierDialog v-if="ui.dialog === 'rename'" />
    <MailDialog v-if="ui.dialog === 'mail'" />
    <HelpDialog v-if="ui.dialog === 'help'" />
    <BackupsDialog v-if="ui.dialog === 'backups'" />
    <ConfirmDialog v-if="ui.confirmBox" />

    <div v-if="isDraggingFile" class="dropzone">⬇ Déposez un fichier .json pour l'importer</div>

    <ToastHost />
  </div>
</template>

<style scoped>
.print-foot { border-top: 1px solid #b9c3d3; padding-top: 8px; }
.save-alert {
  position: sticky; top: 56px; z-index: 35;
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  margin: 0 auto; max-width: 1280px; width: calc(100% - 40px);
  background: var(--red-soft); color: var(--red);
  border: 1px solid color-mix(in srgb, var(--red) 40%, transparent);
  border-radius: var(--radius-sm); padding: 10px 14px; margin-top: 12px; font-size: 13px;
}
</style>
