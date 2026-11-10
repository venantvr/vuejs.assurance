<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AppTopBar from './components/AppTopBar.vue'
import SummaryPanel from './components/SummaryPanel.vue'
import QuickCapture from './components/QuickCapture.vue'
import QuestionsPanel from './components/QuestionsPanel.vue'
import TimelinePanel from './components/TimelinePanel.vue'
import BordereauPanel from './components/BordereauPanel.vue'
import StepDrawer from './components/StepDrawer.vue'
import ToastHost from './components/ToastHost.vue'
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
import { useTimeline } from './composables/useTimeline.js'
import { formatCurrency } from './lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()
const files = useFiles()
const { active, attachments } = storeToRefs(store)
const { kpis } = useTimeline()

const capture = ref(null)
const timeline = ref(null)
const dragDepth = ref(0)
const isDraggingFile = computed(() => dragDepth.value > 0)

const printDate = new Date().toLocaleString('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
})

onMounted(() => {
  store.init()
  window.addEventListener('beforeunload', store.persistNow)
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

    <div v-if="active" class="print-only print-head">
      <h1>Journal d'audit chronologique de sinistre</h1>
      <p class="small">Document de synthèse factuelle, chiffrage et points d'arbitrage soumis à l'assureur — pièces numérotées.</p>
      <p class="small muted">Édité le {{ printDate }} · Dossier : {{ active.meta.ref || active.name }}</p>
    </div>

    <main v-if="active">
      <SummaryPanel />
      <QuickCapture ref="capture" />
      <TimelinePanel ref="timeline" />
      <BordereauPanel />
      <QuestionsPanel />

      <div class="print-only small muted print-foot">
        Document établi par l'assuré — chronologie factuelle, sans appréciation.
        Total des sommes engagées : {{ formatCurrency(kpis.total) }} ·
        {{ attachments.length }} pièce(s) jointe(s) ·
        {{ kpis.open }} point(s) d'arbitrage en attente de réponse écrite.
      </div>
    </main>

    <StepDrawer />

    <PresetsDialog v-if="ui.dialog === 'presets'" />
    <NewDossierDialog v-if="ui.dialog === 'new-dossier'" />
    <RenameDossierDialog v-if="ui.dialog === 'rename'" />
    <MailDialog v-if="ui.dialog === 'mail'" />
    <HelpDialog v-if="ui.dialog === 'help'" />
    <ConfirmDialog v-if="ui.confirmBox" />

    <div v-if="isDraggingFile" class="dropzone">⬇ Déposez un fichier .json pour l'importer</div>

    <ToastHost />
  </div>
</template>

<style scoped>
.print-foot { border-top: 1px solid #b9c3d3; padding-top: 8px; }
</style>
