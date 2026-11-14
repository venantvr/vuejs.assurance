<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { CHANNELS, createAttachment, createStep, safeUrl } from '@/lib/model.js'
import { copyToClipboard, pjFilename } from '@/lib/format.js'
import { driveDownloadLink } from '@/lib/gdrive.js'
import ActorPicker from './ActorPicker.vue'
import DrivePicker from './DrivePicker.vue'

const store = useDossiersStore()
const ui = useUiStore()
const { drawerStep } = storeToRefs(ui)
const { categories } = storeToRefs(store)

const form = ref(null)
const factField = ref(null)
/** Sélecteur Drive : -1 fermé, 'new' pour créer des pièces, sinon index de la pièce à relier. */
const driveFor = ref(-1)

const isNew = computed(() => !form.value?.id || !store.active?.steps.some((s) => s.id === form.value.id))

watch(drawerStep, async (payload) => {
  form.value = payload ? createStep(JSON.parse(JSON.stringify(payload))) : null
  if (form.value && payload?.id) form.value.id = payload.id
  driveFor.value = -1
  if (!form.value) return
  await nextTick()
  factField.value?.focus()
}, { immediate: true })

function close () {
  ui.closeDrawer()
}

function save () {
  if (!form.value.fact.trim()) {
    ui.toast('Le fait constaté est obligatoire', { type: 'error' })
    return
  }
  if (!form.value.date) {
    ui.toast('La date est obligatoire', { type: 'error' })
    return
  }
  for (const att of form.value.attachments) {
    if (att.url?.trim() && !safeUrl(att.url)) {
      ui.toast(`Le lien de la pièce « ${att.name || att.code || '?'} » doit être une URL http(s) valide`, { type: 'error' })
      return
    }
    att.url = safeUrl(att.url)
    // URL Drive collée à la main : le lien de téléchargement se déduit de l'identifiant
    if (att.url && !att.downloadUrl) att.downloadUrl = driveDownloadLink(att.url)
    if (!att.url) att.downloadUrl = ''
  }
  // une ligne entièrement vide n'est pas une pièce
  form.value.attachments = form.value.attachments.filter((a) => a.code.trim() || a.name.trim() || a.url)
  if (isNew.value) {
    const { id, order, ...data } = form.value
    store.addStep(data)
    ui.toast('Étape ajoutée')
  } else {
    store.updateStep({ ...form.value })
    ui.toast('Étape mise à jour')
  }
  close()
}

function addAttachment () {
  form.value.attachments.push(createAttachment())
  driveFor.value = -1
}

function removeAttachment (index) {
  form.value.attachments.splice(index, 1)
  if (driveFor.value === index) driveFor.value = -1
  else if (driveFor.value > index) driveFor.value -= 1
}

/** Numéro suivant, en comptant les codes déjà saisis dans ce tiroir. */
function suggestPj (index) {
  const taken = form.value.attachments.map((a) => a.code).filter(Boolean)
  form.value.attachments[index].code = store.nextPjCode(taken)
}

/**
 * Sélection d'un fichier Drive. Depuis l'en-tête (« Chercher sur Drive »), chaque
 * fichier devient une nouvelle pièce numérotée et le sélecteur reste ouvert pour
 * en enchaîner plusieurs ; depuis une ligne, il relie cette pièce.
 */
function linkDriveFile ({ name, url, downloadUrl }) {
  if (driveFor.value === 'new') {
    if (form.value.attachments.some((a) => a.url === url)) {
      ui.toast('Ce fichier est déjà rattaché à l\'étape')
      return
    }
    const taken = form.value.attachments.map((a) => a.code).filter(Boolean)
    form.value.attachments.push(createAttachment({ code: store.nextPjCode(taken), name, url, downloadUrl }))
    ui.toast(`Pièce ${form.value.attachments.length} ajoutée — choisissez-en une autre ou fermez Drive`)
    return
  }
  const att = form.value.attachments[driveFor.value]
  if (!att) return
  att.url = url
  att.downloadUrl = downloadUrl || ''
  if (!att.name.trim() && name) att.name = name
  driveFor.value = -1
  ui.toast('Pièce liée au fichier Google Drive')
}

async function copyFilename (att) {
  const ok = await copyToClipboard(pjFilename(att, form.value.date))
  ui.toast(ok ? 'Nom de fichier copié' : 'Copie impossible', { type: ok ? 'info' : 'error' })
}

function confirmRemove () {
  const id = form.value.id
  close()
  ui.confirm({
    title: 'Supprimer cette étape ?',
    message: 'Cette étape sera retirée de la chronologie (annulable avec Ctrl+Z).',
    confirmLabel: 'Supprimer',
    onConfirm: () => {
      store.removeStep(id)
      ui.toast('Étape supprimée')
    }
  })
}
</script>

<template>
  <div v-if="form" class="scrim no-print" @click.self="close">
    <aside class="drawer" role="dialog" aria-modal="true" @keydown.ctrl.enter="save">
      <header class="dlg-head">
        <h3>{{ isNew ? 'Nouvelle étape' : "Modifier l'étape" }}</h3>
        <span class="grow" />
        <button class="btn btn-ghost btn-icon" title="Fermer (Échap)" @click="close">✕</button>
      </header>

      <div class="dlg-body">
        <div class="grid-3">
          <label class="field">
            <span>Date *</span>
            <input v-model="form.date" type="date">
          </label>
          <label class="field">
            <span>Heure</span>
            <input v-model="form.time" type="time">
          </label>
          <div class="field">
            <span>Catégorie *</span>
            <div class="cat-field">
              <select v-model="form.category">
                <option v-for="cat in categories" :key="cat.key" :value="cat.key">{{ cat.icon }} {{ cat.label }}</option>
                <option v-if="!categories.some((c) => c.key === form.category)" :value="form.category">
                  {{ store.category(form.category).icon }} {{ store.category(form.category).label }} (catégorie supprimée)
                </option>
              </select>
              <button class="btn btn-sm btn-ghost" type="button" title="Ajouter ou modifier des catégories" @click="ui.openDialog('categories')">⚙</button>
            </div>
          </div>
        </div>

        <label class="field">
          <span>Fait constaté — factuel, sans adjectif émotionnel *</span>
          <textarea
            ref="factField"
            v-model="form.fact"
            rows="4"
            placeholder="Ex : Intervention d'AquaFuite pour recherche de fuite par caméra thermique. Conclusion : fuite sur colonne montante encastrée (partie commune)."
          />
          <span class="xsmall muted">Préférez « délai d'intervention de 6 jours » à « ils ont mis un temps interminable ».</span>
        </label>

        <div class="field actors-field">
          <span>Intervenants</span>
          <ActorPicker v-model="form.actors" />
        </div>
        <div class="grid-3">
          <label class="field">
            <span>Canal / support</span>
            <select v-model="form.channel">
              <option value="">— non précisé —</option>
              <option v-for="c in CHANNELS" :key="c.key" :value="c.key">{{ c.icon }} {{ c.label }}</option>
            </select>
          </label>
          <label class="field">
            <span>Montant engagé (€)</span>
            <input v-model.number="form.amount" type="number" step="0.01" min="0" placeholder="0,00">
          </label>
          <label class="field">
            <span>Impact / conséquence</span>
            <input v-model="form.impact" placeholder="Ex : Salon inutilisable">
          </label>
        </div>

        <div class="card card-pad sub-card">
          <div class="row head-row">
            <b class="small">📎 Pièces justificatives</b>
            <span v-if="form.attachments.length" class="badge">{{ form.attachments.length }}</span>
            <span class="grow" />
            <button class="btn btn-sm" type="button" :class="{ 'btn-primary': driveFor === 'new' }" @click="driveFor = driveFor === 'new' ? -1 : 'new'">
              {{ driveFor === 'new' ? 'Fermer Drive' : '🔍 Chercher sur Drive' }}
            </button>
            <button class="btn btn-sm" type="button" title="Ajouter une pièce à saisir à la main" @click="addAttachment">＋ Pièce</button>
          </div>

          <DrivePicker v-if="driveFor === 'new'" @pick="linkDriveFile" />

          <p v-if="!form.attachments.length && driveFor !== 'new'" class="xsmall muted">
            Aucune pièce : cherchez vos documents sur Drive (chaque fichier choisi devient une pièce numérotée)
            ou ajoutez-en une à la main.
          </p>

          <div v-for="(att, index) in form.attachments" :key="att.id" class="att-row">
            <div class="row att-head">
              <span class="xsmall muted att-index">#{{ index + 1 }}</span>
              <input v-model="att.code" class="att-code" placeholder="PJ-01">
              <button class="btn btn-sm btn-ghost" type="button" title="Numéro suivant" @click="suggestPj(index)">№</button>
              <input v-model="att.name" class="grow" placeholder="Nom de la pièce — ex : Facture recherche de fuite">
              <button class="btn btn-sm btn-ghost btn-danger" type="button" title="Retirer cette pièce" @click="removeAttachment(index)">✕</button>
            </div>
            <div class="row link-row">
              <input v-model="att.url" class="grow" placeholder="Lien — https://drive.google.com/…">
              <a
                v-if="safeUrl(att.url)"
                class="btn btn-sm btn-ghost"
                :href="safeUrl(att.url)"
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir le lien dans un nouvel onglet"
              >↗</a>
              <a
                v-if="att.downloadUrl || driveDownloadLink(att.url)"
                class="btn btn-sm btn-ghost"
                :href="att.downloadUrl || driveDownloadLink(att.url)"
                target="_blank"
                rel="noopener noreferrer"
                title="Télécharger la pièce"
              >⬇</a>
              <button class="btn btn-sm" type="button" @click="driveFor = driveFor === index ? -1 : index">
                {{ driveFor === index ? 'Fermer Drive' : '🔍 Drive' }}
              </button>
            </div>
            <div v-if="att.code || att.name" class="row xsmall mono filename">
              {{ pjFilename(att, form.date) }}
              <button class="btn btn-sm btn-ghost" type="button" @click="copyFilename(att)">⧉</button>
            </div>
            <DrivePicker v-if="driveFor === index" @pick="linkDriveFile" />
          </div>
        </div>

        <div class="card card-pad question-card">
          <b class="small">● Question liée à cette étape</b>
          <label class="field question-field">
            <input v-model="form.question" placeholder="Ex : Confirmez-vous le remboursement des 285 € avancés au titre de la recherche de fuite ?">
            <span class="xsmall muted">Remonte dans la section « Questions » (en bas de page) et dans le courrier généré.</span>
          </label>
        </div>
      </div>

      <footer class="dlg-foot">
        <button class="btn btn-primary" @click="save">Enregistrer <span class="xsmall faded">Ctrl+↵</span></button>
        <button class="btn" @click="close">Annuler</button>
        <span class="grow" />
        <button v-if="!isNew" class="btn btn-danger" @click="confirmRemove">🗑 Supprimer</button>
      </footer>
    </aside>
  </div>
</template>

<style scoped>
.field > span {
  font-size: 10.5px; font-weight: 650; text-transform: uppercase;
  letter-spacing: .06em; color: var(--text-faint);
}
.field > span.xsmall { text-transform: none; letter-spacing: 0; font-weight: 400; }
.sub-card { background: var(--surface-2); }
.head-row { margin-bottom: 9px; }
.filename { margin-top: 9px; }
.link-field { margin-top: 9px; }
.link-row { gap: 6px; }
.link-row input { min-width: 0; }
.question-card { background: var(--violet-soft); border-color: color-mix(in srgb, var(--violet) 25%, transparent); }
.question-field { margin-top: 9px; }
.faded { opacity: .75; }
.att-row { border-top: 1px dashed var(--border); padding-top: 9px; margin-top: 9px; display: flex; flex-direction: column; gap: 6px; }
.att-row:first-of-type { border-top: 0; margin-top: 0; padding-top: 0; }
.att-head { flex-wrap: nowrap; gap: 6px; }
.att-index { width: 22px; flex: none; }
.att-code { width: 86px; flex: none; }
.att-head .grow { min-width: 0; }
.link-row { gap: 6px; }
.link-row .grow { min-width: 0; }
.cat-field { display: flex; align-items: center; gap: 2px; }
.cat-field select { flex: 1; min-width: 0; }
</style>
