<script setup>
/**
 * Sélecteur Google Drive (lecture seule) : recherche un fichier par nom et
 * renvoie son nom + lien de consultation. Utilisé dans le tiroir d'étape pour
 * lier une pièce justificative à un fichier Drive.
 */
import { nextTick, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui.js'
import { driveLink, searchDriveFiles } from '@/lib/gdrive.js'
import { formatDateFR } from '@/lib/format.js'

const emit = defineEmits(['pick'])
const ui = useUiStore()

const editingToken = ref(!ui.driveToken)
const tokenInput = ref(ui.driveToken)
const query = ref('')
const queryField = ref(null)
const results = ref(null) // null = pas encore cherché, [] = aucun résultat
const loading = ref(false)
const error = ref('')
let searchSeq = 0

watch(editingToken, async (editing) => {
  if (!editing) {
    await nextTick()
    queryField.value?.focus()
  }
})

function saveToken () {
  ui.setDriveToken(tokenInput.value)
  if (!ui.driveToken) {
    error.value = 'Collez un jeton d\'accès pour interroger Google Drive'
    return
  }
  error.value = ''
  editingToken.value = false
}

function forgetToken () {
  tokenInput.value = ''
  ui.setDriveToken('')
  results.value = null
  editingToken.value = true
}

async function search () {
  if (!ui.driveToken) {
    editingToken.value = true
    return
  }
  const seq = ++searchSeq
  loading.value = true
  error.value = ''
  const res = await searchDriveFiles(ui.driveToken, query.value)
  if (seq !== searchSeq) return // une recherche plus récente a pris la main
  loading.value = false
  if (!res.ok) {
    error.value = res.error
    results.value = null
    if (res.status === 401) editingToken.value = true
    return
  }
  results.value = res.files
}

function pick (file) {
  const url = driveLink(file)
  if (!url) return
  emit('pick', { name: file.name || '', url })
}

function dateOf (file) {
  return file.modifiedTime ? formatDateFR(String(file.modifiedTime).slice(0, 10)) : ''
}
</script>

<template>
  <div class="drive-picker">
    <template v-if="editingToken">
      <label class="field">
        <span>Jeton d'accès Google Drive (lecture)</span>
        <input
          v-model="tokenInput"
          type="password"
          autocomplete="off"
          placeholder="ya29.…"
          @keydown.enter.prevent="saveToken"
        >
        <span class="xsmall muted">
          Jeton OAuth avec un droit de lecture Drive (ex. généré sur
          <b>developers.google.com/oauthplayground</b>, scope <code>drive.readonly</code>).
          Il reste dans ce navigateur et n'est jamais inclus dans les exports.
        </span>
      </label>
      <div class="row">
        <button class="btn btn-sm btn-primary" type="button" @click="saveToken">Utiliser ce jeton</button>
        <button v-if="ui.driveToken" class="btn btn-sm" type="button" @click="editingToken = false">Annuler</button>
      </div>
    </template>

    <template v-else>
      <div class="row search-row">
        <input
          ref="queryField"
          v-model="query"
          class="grow"
          placeholder="Nom du fichier sur Drive (ex. facture fuite)"
          @keydown.enter.prevent="search"
        >
        <button class="btn btn-sm btn-primary" type="button" :disabled="loading" @click="search">
          {{ loading ? '…' : 'Chercher' }}
        </button>
        <button class="btn btn-sm btn-ghost" type="button" title="Changer ou oublier le jeton" @click="editingToken = true; tokenInput = ui.driveToken">🔑</button>
      </div>
      <div v-if="ui.driveToken" class="xsmall muted token-row">
        Jeton enregistré dans ce navigateur ·
        <button class="link-btn" type="button" @click="forgetToken">oublier le jeton</button>
      </div>
    </template>

    <p v-if="error" class="small error-text">⚠ {{ error }}</p>

    <ul v-if="results && results.length" class="results">
      <li v-for="file in results" :key="file.id">
        <button class="result" type="button" :title="`Lier ${file.name}`" @click="pick(file)">
          <span class="result-name">{{ file.name }}</span>
          <span class="xsmall muted nowrap">{{ dateOf(file) }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="results && !loading" class="small muted">Aucun fichier trouvé pour cette recherche.</p>
  </div>
</template>

<style scoped>
.drive-picker { display: flex; flex-direction: column; gap: 8px; margin-top: 9px; }
.search-row { gap: 6px; }
.search-row input { min-width: 0; }
.token-row { display: flex; align-items: center; gap: 4px; }
.link-btn {
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--text-faint); text-decoration: underline; font-size: inherit;
}
.error-text { color: var(--red); }
.results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 200px; overflow: auto; }
.result {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; text-align: left; cursor: pointer;
  border: 1px solid var(--border); border-radius: 7px; padding: 6px 9px;
  background: var(--surface);
}
.result:hover { border-color: var(--blue); }
.result-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
