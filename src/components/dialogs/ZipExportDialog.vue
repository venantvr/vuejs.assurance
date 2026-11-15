<script setup>
/**
 * Export « dossier + pièces » (.zip). Lit chaque pièce Drive par l'API avec le
 * jeton lecture seule, affiche la progression pièce par pièce, puis déclenche
 * le téléchargement. Rien n'est omis en silence : l'index du zip le détaille.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import BaseDialog from '../BaseDialog.vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { buildArchive, collectPieces } from '@/lib/archive.js'
import { driveIdFromUrl } from '@/lib/gdrive.js'
import { downloadFile, slugify } from '@/lib/format.js'
import { todayISO } from '@/lib/model.js'

const store = useDossiersStore()
const ui = useUiStore()

const dossier = store.active
const pieces = computed(() => (dossier ? collectPieces(dossier) : []))
const driveCount = computed(() => pieces.value.filter((p) => driveIdFromUrl(p.attachment.url)).length)

const phase = ref('ready') // ready | running | done | error
const lines = ref([])
const current = ref(0)
const result = ref(null)
const errorMessage = ref('')
const signal = { cancelled: false }
let archive = null

const tokenOk = computed(() => !ui.driveTokenStale)
const needsToken = computed(() => driveCount.value > 0 && !tokenOk.value)
const percent = computed(() => (pieces.value.length ? Math.round((current.value / pieces.value.length) * 100) : 100))

const zipName = () => `assurance_${slugify(dossier.meta.ref || dossier.name)}_avec-pieces_${todayISO()}.zip`

function payload () {
  return JSON.stringify({
    app: 'vuejs.assurance',
    kind: 'dossier',
    version: 1,
    exportedAt: new Date().toISOString(),
    dossier,
    actors: store.actors,
    categories: store.customCategoriesAll
  }, null, 2)
}

async function start () {
  phase.value = 'running'
  lines.value = []
  current.value = 0
  signal.cancelled = false
  try {
    archive = await buildArchive({
      dossier,
      json: payload(),
      jsonName: `${slugify(dossier.meta.ref || dossier.name)}.json`,
      token: tokenOk.value ? ui.driveToken : '',
      categoryOf: (key) => store.category(key),
      signal,
      onProgress: (e) => {
        if (e.status === 'running') { current.value = e.index; return }
        current.value = e.index + 1
        lines.value.push(e)
      }
    })
    result.value = { included: archive.included, missing: archive.missing, total: archive.total }
    phase.value = 'done'
    save()
  } catch (error) {
    phase.value = 'error'
    errorMessage.value = error.message || 'Export impossible'
  }
}

function save () {
  if (!archive) return
  downloadFile(zipName(), archive.blob, 'application/zip')
  ui.toast(archive.missing
    ? `Archive téléchargée — ${archive.included}/${archive.total} pièce(s) incluse(s), le détail est dans LISEZMOI.txt`
    : 'Archive téléchargée')
}

function cancel () {
  signal.cancelled = true
  ui.closeDialog()
}

onMounted(() => { if (!pieces.value.length) start() })
onBeforeUnmount(() => { signal.cancelled = true })

const icons = { done: '✔', failed: '✕', skipped: '○' }
</script>

<template>
  <BaseDialog title="Dossier + pièces (.zip)" width="640px" @close="cancel">
    <template v-if="phase === 'ready'">
      <p class="small">
        L'archive contiendra le <b>JSON du dossier</b> (réimportable), le <b>même dossier en Markdown</b> lisible
        (liens vers les pièces copiées) et un dossier <code>pieces/</code> avec
        <b>{{ driveCount }}</b> fichier(s) lu(s) sur Google Drive sur {{ pieces.length }} pièce(s), plus un
        <code>LISEZMOI.txt</code> qui détaille ce qui est inclus ou non.
      </p>
      <p v-if="pieces.length - driveCount" class="small muted">
        {{ pieces.length - driveCount }} pièce(s) n'ont pas de lien Drive : elles seront listées avec leur lien, mais pas copiées
        (un navigateur ne peut pas télécharger un lien quelconque).
      </p>
      <div v-if="needsToken" class="qbox warn">
        <b class="small">⚠ Drive n'est pas connecté</b>
        <p class="small">
          Sans jeton Drive en cours de validité, les {{ driveCount }} pièces Drive ne pourront pas être copiées.
          Connectez Drive (tiroir d'une étape ▸ « Chercher sur Drive » ▸ « Connecter »), puis relancez l'export ;
          ou continuez : le zip contiendra le JSON et l'index des pièces manquantes.
        </p>
      </div>
      <p v-else-if="driveCount" class="small muted">Drive connecté : lecture seule, vos fichiers ne sont pas modifiés.</p>
    </template>

    <template v-else>
      <div class="bar" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
        <div class="bar-fill" :style="{ width: `${percent}%` }" />
      </div>
      <p class="small muted">
        <template v-if="phase === 'running'">Pièce {{ Math.min(current + 1, pieces.length) }} sur {{ pieces.length }}…</template>
        <template v-else-if="phase === 'done'">Terminé : {{ result.included }} pièce(s) incluse(s) sur {{ result.total }}.</template>
        <template v-else>⚠ {{ errorMessage }}</template>
      </p>
      <ul class="lines">
        <li v-for="(l, i) in lines" :key="i" :class="l.status">
          <span class="ico">{{ icons[l.status] }}</span>
          <span class="lbl">{{ l.label }}</span>
          <span v-if="l.detail" class="xsmall muted">{{ l.detail }}</span>
        </li>
      </ul>
    </template>

    <template #footer>
      <template v-if="phase === 'ready'">
        <button class="btn btn-primary" @click="start">{{ needsToken ? 'Continuer sans les pièces Drive' : 'Créer l\'archive' }}</button>
        <button class="btn" @click="cancel">Annuler</button>
      </template>
      <template v-else-if="phase === 'running'">
        <button class="btn" @click="cancel">Annuler</button>
      </template>
      <template v-else>
        <button v-if="phase === 'done'" class="btn btn-primary" @click="save">⬇ Télécharger à nouveau</button>
        <button class="btn" @click="ui.closeDialog()">Fermer</button>
      </template>
    </template>
  </BaseDialog>
</template>

<style scoped>
.bar { height: 8px; border-radius: 99px; background: var(--bg-soft); overflow: hidden; }
.bar-fill { height: 100%; background: var(--brand); transition: width .15s; }
.lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 300px; overflow: auto; }
.lines li { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; }
.lines .ico { width: 14px; flex: none; }
.lines .done .ico { color: var(--green); }
.lines .failed .ico { color: var(--red); }
.lines .skipped .ico { color: var(--text-faint); }
.lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warn { background: var(--amber-soft); border-color: color-mix(in srgb, var(--amber) 35%, transparent); }
</style>
