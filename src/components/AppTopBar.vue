<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { useFiles } from '@/composables/useFiles.js'
import { formatRelative } from '@/lib/format.js'
import { onClickOutside } from '@/composables/useClickOutside.js'

const emit = defineEmits(['new-dossier', 'rename-dossier', 'delete-dossier', 'open-mail'])

const store = useDossiersStore()
const ui = useUiStore()
const files = useFiles()
const { active, dossiersByRecent, trash, saveState, saveError, canUndo, canRedo } = storeToRefs(store)

function restore (dossier) {
  const restored = store.restoreFromTrash(dossier.id)
  openMenu.value = null
  if (restored) ui.toast(`« ${restored.name} » restauré`)
}

function purge (dossier) {
  openMenu.value = null
  ui.confirm({
    title: 'Effacer définitivement ?',
    message: `« ${dossier.name} » sera retiré de la corbeille. Une sauvegarde automatique est prise juste avant, consultable dans Fichier ▸ Sauvegardes automatiques.`,
    confirmLabel: 'Effacer',
    onConfirm: () => {
      store.purgeFromTrash(dossier.id)
      ui.toast('Dossier effacé de la corbeille')
    }
  })
}

const openMenu = ref(null)
const root = ref(null)
const fileInput = ref(null)
const importMode = ref('merge')

onClickOutside(root, () => { openMenu.value = null })

function toggle (name) {
  openMenu.value = openMenu.value === name ? null : name
}

function select (id) {
  store.selectDossier(id)
  openMenu.value = null
}

function run (action) {
  openMenu.value = null
  action()
}

function printPage () {
  window.print()
}

function pickFile (mode) {
  importMode.value = mode
  openMenu.value = null
  if (fileInput.value) {
    fileInput.value.value = ''
    fileInput.value.click()
  }
}

function onFileChosen (event) {
  const file = event.target.files?.[0]
  if (file) files.readJsonFile(file, importMode.value)
}

const saveLabels = {
  saved: '✔ Enregistré',
  pending: '… Enregistrement',
  error: '✕ Stockage indisponible'
}
</script>

<template>
  <header ref="root" class="topbar no-print">
    <div class="topbar-inner">
      <div class="logo">
        <div class="logo-mark">⚖</div>
        <div>
          <h1>vuejs.assurance</h1>
          <p>Chronologie factuelle, pièces numérotées &amp; questions</p>
        </div>
      </div>

      <!-- Dossiers -->
      <div v-if="active" class="menu-wrap">
        <button class="btn" title="Changer de dossier" @click="toggle('dossiers')">
          📁 <b class="ellipsis">{{ active.name }}</b>
          <span class="muted xsmall">{{ dossiersByRecent.length }}</span> ▾
        </button>
        <div v-if="openMenu === 'dossiers'" class="menu left">
          <div class="menu-label">Dossiers enregistrés localement</div>
          <button
            v-for="dossier in dossiersByRecent"
            :key="dossier.id"
            class="menu-item"
            :class="{ active: dossier.id === active.id }"
            @click="select(dossier.id)"
          >
            <span class="ico">{{ dossier.id === active.id ? '●' : '○' }}</span>
            <span class="menu-main">
              <span class="ellipsis">{{ dossier.name }}</span>
              <span class="xsmall muted">{{ dossier.steps.length }} étapes · modifié {{ formatRelative(dossier.updatedAt) }}</span>
            </span>
          </button>
          <div class="menu-sep" />
          <button class="menu-item" @click="run(() => emit('new-dossier'))"><span class="ico">＋</span> Nouveau dossier…</button>
          <button class="menu-item" @click="run(() => { store.duplicateActive(); ui.toast('Dossier dupliqué') })"><span class="ico">⧉</span> Dupliquer ce dossier</button>
          <button class="menu-item" @click="run(() => emit('rename-dossier'))"><span class="ico">✎</span> Renommer…</button>
          <button class="menu-item danger" @click="run(() => emit('delete-dossier'))"><span class="ico">🗑</span> Mettre à la corbeille</button>
          <template v-if="trash.length">
            <div class="menu-sep" />
            <div class="menu-label">Corbeille ({{ trash.length }}) — restaurable à tout moment</div>
            <div v-for="dossier in trash" :key="dossier.id" class="menu-item trash-row">
              <span class="ico">♻</span>
              <span class="menu-main">
                <span class="ellipsis">{{ dossier.name }}</span>
                <span class="xsmall muted">{{ dossier.steps.length }} étapes · supprimé {{ formatRelative(dossier.deletedAt) }}</span>
              </span>
              <button class="btn btn-sm" title="Restaurer" @click.stop="restore(dossier)">Restaurer</button>
              <button class="btn btn-sm btn-ghost btn-danger" title="Effacer définitivement" @click.stop="purge(dossier)">✕</button>
            </div>
          </template>
        </div>
      </div>

      <span class="grow" />

      <span
        class="badge"
        :class="saveState === 'saved' ? 'badge-ok' : saveState === 'error' ? 'badge-SINISTRE' : 'badge-warn'"
        :title="saveState === 'error' ? saveError : 'Enregistrement automatique dans le navigateur'"
      >{{ saveLabels[saveState] }}</span>

      <button class="btn btn-icon" :disabled="!canUndo" title="Annuler (Ctrl+Z)" @click="store.undo() && ui.toast('Action annulée')">↶</button>
      <button class="btn btn-icon" :disabled="!canRedo" title="Rétablir (Ctrl+Maj+Z)" @click="store.redo() && ui.toast('Action rétablie')">↷</button>

      <!-- Fichier -->
      <div class="menu-wrap">
        <button class="btn" title="Sauvegarde et import" @click="toggle('file')">💾 Fichier ▾</button>
        <div v-if="openMenu === 'file'" class="menu">
          <div class="menu-label">Sauvegarder sur l'ordinateur</div>
          <button class="menu-item" @click="run(files.exportActive)"><span class="ico">⬇</span> Dossier courant (.json)<span class="grow" /><span class="xsmall muted">Ctrl+S</span></button>
          <button class="menu-item" @click="run(files.exportAll)"><span class="ico">⬇</span> Tous les dossiers (.json)</button>
          <button class="menu-item" @click="run(files.exportCsv)"><span class="ico">⬇</span> Chronologie (.csv)</button>
          <div class="menu-sep" />
          <div class="menu-label">Charger depuis un fichier</div>
          <button class="menu-item" @click="pickFile('merge')"><span class="ico">⬆</span> Importer (ajouter à la base)</button>
          <button class="menu-item" @click="pickFile('replace')"><span class="ico">⬆</span> Importer dans le dossier courant</button>
          <div class="menu-sep" />
          <button class="menu-item" @click="run(() => ui.openDialog('backups'))"><span class="ico">🕘</span> Sauvegardes automatiques…</button>
          <div class="menu-sep" />
          <button class="menu-item" @click="run(() => emit('open-mail'))"><span class="ico">✉</span> Générer le courrier / mail</button>
          <button class="menu-item" @click="run(printPage)"><span class="ico">🖨</span> Imprimer / PDF<span class="grow" /><span class="xsmall muted">Ctrl+P</span></button>
        </div>
      </div>

      <button class="btn btn-icon" :title="ui.density === 'compact' ? 'Densité confortable' : 'Densité compacte'" @click="ui.toggleDensity()">
        {{ ui.density === 'compact' ? '▤' : '▥' }}
      </button>
      <button class="btn btn-icon" :title="ui.theme === 'dark' ? 'Thème clair' : 'Thème sombre'" @click="ui.toggleTheme()">
        {{ ui.theme === 'dark' ? '☀' : '☾' }}
      </button>
      <button class="btn btn-icon" title="Aide et raccourcis (?)" @click="ui.openDialog('help')">?</button>

      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFileChosen">
    </div>
  </header>
</template>

<style scoped>
.ellipsis { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom; }
.menu-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.menu-main .ellipsis { max-width: 100%; }
.trash-row { cursor: default; gap: 8px; }
.trash-row:hover { background: transparent; }
</style>
