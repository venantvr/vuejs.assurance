<script setup>
/**
 * Sélecteur Google Drive (lecture seule) : recherche un fichier par nom et
 * renvoie son nom + lien de consultation. Utilisé dans le tiroir d'étape pour
 * lier une pièce justificative à un fichier Drive.
 *
 * Connexion en un clic par Google Identity Services avec un client_id saisi
 * une fois (préférence locale). Le collage manuel d'un jeton reste possible.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui.js'
import { checkDriveTokenReadonly, driveLink, isFolder, requestDriveToken, resolveDrivePath, searchDriveFiles, searchDriveRecursive } from '@/lib/gdrive.js'
import { formatDateFR } from '@/lib/format.js'

const emit = defineEmits(['pick'])
const ui = useUiStore()

const mode = ref(ui.driveTokenStale ? 'connect' : 'search') // connect | manual | search | settings
const clientIdInput = ref(ui.driveClientId)
const folderInput = ref(ui.driveFolder)
/** Fil d'Ariane : [{ id, name }], vide = racine du Drive. */
const crumbs = ref([])
const folderNotice = ref('')
let folderResolvedFor = null
/** Arborescences déjà parcourues, par dossier racine (le temps de la session). */
const treeCache = new Map()
const recursive = ref(true)
const tokenInput = ref('')
const query = ref('')
const queryField = ref(null)
const results = ref(null) // null = pas encore cherché, [] = aucun résultat
const loading = ref(false)
const busy = ref(false)
const error = ref('')
let searchSeq = 0

const connected = computed(() => !ui.driveTokenStale)
const expiresLabel = computed(() => {
  if (!ui.driveTokenExpiresAt) return ''
  const minutes = Math.max(0, Math.round((ui.driveTokenExpiresAt - Date.now()) / 60000))
  return minutes ? `valable encore ${minutes} min` : 'expiré'
})

const currentFolderId = computed(() => (crumbs.value.length ? crumbs.value[crumbs.value.length - 1].id : 'root'))

watch(mode, async (value) => {
  if (value === 'search') {
    await openDefaultFolder()
    await nextTick()
    queryField.value?.focus()
  }
}, { immediate: true })

/** Ouvre le dossier par défaut (⚙) et en liste le contenu ; repli sur la racine s'il manque. */
async function openDefaultFolder () {
  if (ui.driveTokenStale) return
  const key = `${ui.driveToken}|${ui.driveFolder}`
  if (folderResolvedFor === key) return
  folderResolvedFor = key
  folderNotice.value = ''
  crumbs.value = []
  if (ui.driveFolder) {
    const res = await resolveDrivePath(ui.driveToken, ui.driveFolder)
    if (!res.ok) { error.value = res.error; return }
    crumbs.value = res.path
    if (res.missing) folderNotice.value = `Dossier « ${res.missing} » introuvable : ouverture de ${crumbs.value.length ? crumbs.value.map((c) => c.name).join(' / ') : 'la racine'}.`
  }
  await search()
}

function enterFolder (folder) {
  crumbs.value = [...crumbs.value, { id: folder.id, name: folder.name }]
  query.value = ''
  search()
}

function goTo (index) {
  crumbs.value = crumbs.value.slice(0, index)
  query.value = ''
  search()
}

function saveClientId () {
  ui.setDriveClientId(clientIdInput.value)
  ui.setDriveFolder(folderInput.value)
  folderResolvedFor = null
  error.value = ''
  mode.value = connected.value ? 'search' : 'connect'
  if (connected.value) openDefaultFolder()
}

/** Connexion Google : jeton lecture seule, vérifié avant d'être conservé. */
async function connect (consent = false) {
  if (!ui.driveClientId) {
    mode.value = 'settings'
    error.value = 'Indiquez d\'abord votre client ID OAuth (une seule fois).'
    return
  }
  busy.value = true
  error.value = ''
  const res = await requestDriveToken(ui.driveClientId, { consent })
  if (!res.ok) {
    busy.value = false
    error.value = res.error
    return
  }
  const check = await checkDriveTokenReadonly(res.token)
  busy.value = false
  if (!check.ok) {
    error.value = check.error
    return
  }
  ui.setDriveToken(res.token, res.expiresIn)
  mode.value = 'search'
}

/** Collage manuel (ex. OAuth Playground) : même exigence de lecture seule. */
async function saveToken () {
  const value = String(tokenInput.value || '').trim()
  if (!value) {
    error.value = 'Collez un jeton d\'accès pour interroger Google Drive'
    return
  }
  busy.value = true
  error.value = ''
  const res = await checkDriveTokenReadonly(value)
  busy.value = false
  if (!res.ok) {
    error.value = res.error
    return
  }
  ui.setDriveToken(value, 3600)
  tokenInput.value = ''
  mode.value = 'search'
}

function disconnect () {
  treeCache.clear()
  ui.setDriveToken('')
  results.value = null
  mode.value = 'connect'
}

function forgetClientId () {
  ui.setDriveClientId('')
  clientIdInput.value = ''
  disconnect()
  mode.value = 'settings'
}

async function search () {
  if (ui.driveTokenStale) {
    mode.value = 'connect'
    error.value = ui.driveToken ? 'Jeton expiré : reconnectez-vous à Google Drive.' : ''
    return
  }
  const seq = ++searchSeq
  loading.value = true
  error.value = ''
  const term = query.value.trim()
  const root = currentFolderId.value
  // sans mot-clé on parcourt le dossier ; avec, on cherche dans tous ses sous-dossiers
  const res = term && recursive.value
    ? await searchDriveRecursive(ui.driveToken, term, root, { tree: treeCache.get(root) || null })
    : await searchDriveFiles(ui.driveToken, term, { folderId: root })
  if (res.ok && res.tree) treeCache.set(root, res.tree)
  if (seq !== searchSeq) return // une recherche plus récente a pris la main
  loading.value = false
  if (!res.ok) {
    error.value = res.error
    results.value = null
    if (res.status === 401) {
      ui.setDriveToken('')
      mode.value = 'connect'
    }
    return
  }
  results.value = res.files
}

function pick (file) {
  if (isFolder(file)) { enterFolder(file); return }
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
    <!-- Réglage : client ID (une seule fois, local) -->
    <template v-if="mode === 'settings'">
      <label class="field">
        <span>Client ID OAuth Google (application Web)</span>
        <input
          v-model="clientIdInput"
          autocomplete="off"
          placeholder="123456789-abc….apps.googleusercontent.com"
          @keydown.enter.prevent="saveClientId"
        >
        <span class="xsmall muted">
          Identifiant <b>public</b> d'un client OAuth de type « Application Web » (console Google Cloud),
          avec l'origine de ce site dans « Origines JavaScript autorisées ». Aucun secret n'est demandé.
          Il reste dans ce navigateur : jamais dans le code, la base ni les exports.
        </span>
      </label>
      <label class="field">
        <span>Dossier ouvert par défaut (chemin depuis la racine du Drive)</span>
        <input v-model="folderInput" autocomplete="off" placeholder="Assurance ou Assurance/2026" @keydown.enter.prevent="saveClientId">
        <span class="xsmall muted">Vide = racine. La recherche se fait dans le dossier affiché ; les sous-dossiers se parcourent au clic.</span>
      </label>
      <div class="row">
        <button class="btn btn-sm btn-primary" type="button" :disabled="!clientIdInput.trim()" @click="saveClientId">Enregistrer</button>
        <button class="btn btn-sm" type="button" @click="mode = 'manual'">Coller un jeton à la place</button>
        <button v-if="ui.driveClientId" class="btn btn-sm btn-ghost" type="button" @click="mode = connected ? 'search' : 'connect'">Annuler</button>
      </div>
    </template>

    <!-- Connexion en un clic -->
    <template v-else-if="mode === 'connect'">
      <div class="row">
        <button class="btn btn-sm btn-primary" type="button" :disabled="busy" @click="connect(false)">
          {{ busy ? 'Connexion…' : '🔐 Connecter Google Drive (lecture seule)' }}
        </button>
        <button class="btn btn-sm btn-ghost" type="button" title="Client ID OAuth" @click="clientIdInput = ui.driveClientId; mode = 'settings'">⚙</button>
        <button class="btn btn-sm btn-ghost" type="button" @click="mode = 'manual'">Coller un jeton</button>
      </div>
      <span class="xsmall muted">
        Ouvre la fenêtre de connexion Google ; l'application ne reçoit qu'un jeton <b>en lecture seule</b>
        (scope <code>drive.readonly</code>, vérifié), conservé dans ce navigateur le temps de sa validité.
        <template v-if="!ui.driveClientId"> Première utilisation : renseignez le client ID via ⚙.</template>
      </span>
    </template>

    <!-- Collage manuel -->
    <template v-else-if="mode === 'manual'">
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
          Jeton OAuth <b>en lecture seule</b> (ex. <b>developers.google.com/oauthplayground</b>, scope
          <code>drive.readonly</code>) : sa portée est vérifiée et tout droit d'écriture est refusé.
        </span>
      </label>
      <div class="row">
        <button class="btn btn-sm btn-primary" type="button" :disabled="busy" @click="saveToken">
          {{ busy ? 'Vérification…' : 'Utiliser ce jeton' }}
        </button>
        <button class="btn btn-sm" type="button" @click="mode = 'connect'">← Connexion en un clic</button>
      </div>
    </template>

    <!-- Recherche -->
    <template v-else>
      <div class="crumbs small">
        <button class="crumb" type="button" :class="{ on: !crumbs.length }" @click="goTo(0)">Drive</button>
        <template v-for="(c, i) in crumbs" :key="c.id">
          <span class="muted">/</span>
          <button class="crumb" type="button" :class="{ on: i === crumbs.length - 1 }" @click="goTo(i + 1)">{{ c.name }}</button>
        </template>
        <span class="grow" />
        <button class="btn btn-sm btn-ghost" type="button" title="Client ID et dossier par défaut" @click="clientIdInput = ui.driveClientId; folderInput = ui.driveFolder; mode = 'settings'">⚙</button>
      </div>
      <p v-if="folderNotice" class="xsmall muted">{{ folderNotice }}</p>
      <div class="row search-row">
        <input
          ref="queryField"
          v-model="query"
          class="grow"
          :placeholder="`Rechercher dans ${crumbs.length ? crumbs[crumbs.length - 1].name : 'tout le Drive'}…`"
          @keydown.enter.prevent="search"
        >
        <button class="btn btn-sm btn-primary" type="button" :disabled="loading" @click="search">
          {{ loading ? '…' : 'Chercher' }}
        </button>
      </div>
      <label class="xsmall muted rec-row">
        <input v-model="recursive" type="checkbox"> inclure les sous-dossiers
      </label>
      <div class="xsmall muted token-row">
        Drive connecté<template v-if="expiresLabel"> · {{ expiresLabel }}</template> ·
        <button class="link-btn" type="button" @click="connect(false)">renouveler</button> ·
        <button class="link-btn" type="button" @click="disconnect">déconnecter</button>
        <template v-if="ui.driveClientId"> · <button class="link-btn" type="button" @click="forgetClientId">oublier le client ID</button></template>
      </div>
    </template>

    <p v-if="error" class="small error-text">⚠ {{ error }}</p>

    <ul v-if="results && results.length" class="results">
      <li v-for="file in results" :key="file.id">
        <button class="result" type="button" :title="isFolder(file) ? `Ouvrir ${file.name}` : `Lier ${file.name}`" @click="pick(file)">
          <span class="result-name">
            {{ isFolder(file) ? '📁' : '📄' }} {{ file.name }}
            <span v-if="file.folderPath" class="xsmall muted"> · {{ file.folderPath }}/</span>
          </span>
          <span class="xsmall muted nowrap">{{ dateOf(file) }}</span>
        </button>
      </li>
    </ul>
    <p v-else-if="results && !loading" class="small muted">{{ query.trim() ? 'Aucun fichier trouvé pour cette recherche.' : 'Dossier vide.' }}</p>
  </div>
</template>

<style scoped>
.drive-picker { display: flex; flex-direction: column; gap: 8px; margin-top: 9px; }
.search-row { gap: 6px; }
.search-row input { min-width: 0; }
.token-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.link-btn {
  background: none; border: none; padding: 0; cursor: pointer;
  color: var(--text-faint); text-decoration: underline; font-size: inherit;
}
.error-text { color: var(--red); }
.crumbs { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.rec-row { display: flex; align-items: center; gap: 5px; cursor: pointer; }
.rec-row input { width: auto; margin: 0; }
.crumb { background: none; border: 0; padding: 2px 4px; border-radius: 5px; cursor: pointer; color: var(--text-soft); font: inherit; }
.crumb:hover { background: var(--bg-soft); }
.crumb.on { color: var(--text); font-weight: 650; }
.results { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 260px; overflow: auto; }
.result {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; text-align: left; cursor: pointer;
  border: 1px solid var(--border); border-radius: 7px; padding: 6px 9px;
  background: var(--surface); color: var(--text); font: inherit;
}
.result:hover { border-color: var(--blue); }
.result-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
