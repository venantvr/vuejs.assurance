<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { CHANNELS, createStep, safeUrl } from '@/lib/model.js'
import { copyToClipboard, pjFilename } from '@/lib/format.js'
import ActorPicker from './ActorPicker.vue'
import DrivePicker from './DrivePicker.vue'

const store = useDossiersStore()
const ui = useUiStore()
const { drawerStep } = storeToRefs(ui)
const { categories } = storeToRefs(store)

const form = ref(null)
const factField = ref(null)
const showDrive = ref(false)

const isNew = computed(() => !form.value?.id || !store.active?.steps.some((s) => s.id === form.value.id))
const filename = computed(() => (form.value ? pjFilename(form.value) : ''))

watch(drawerStep, async (payload) => {
  form.value = payload ? { ...createStep(), ...JSON.parse(JSON.stringify(payload)) } : null
  showDrive.value = false
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
  const link = safeUrl(form.value.pjUrl)
  if (form.value.pjUrl?.trim() && !link) {
    ui.toast('Le lien de la pièce doit être une URL http(s) valide', { type: 'error' })
    return
  }
  form.value.pjUrl = link
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

function suggestPj () {
  form.value.pjCode = store.nextPjCode()
}

/** Sélection d'un fichier Drive : le lien est posé, le nom comble le champ vide. */
function linkDriveFile ({ name, url }) {
  form.value.pjUrl = url
  if (!form.value.pjName.trim() && name) form.value.pjName = name
  showDrive.value = false
  ui.toast('Pièce liée au fichier Google Drive')
}

async function copyFilename () {
  const ok = await copyToClipboard(filename.value)
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
            <b class="small">📎 Pièce justificative</b>
            <span class="grow" />
            <button class="btn btn-sm" @click="suggestPj">Numéro suivant</button>
            <button
              v-if="form.pjCode || form.pjName || form.pjUrl"
              class="btn btn-sm btn-danger"
              title="Retirer la pièce de cette étape"
              @click="form.pjCode = ''; form.pjName = ''; form.pjUrl = ''"
            >✕ Détacher</button>
          </div>
          <div class="grid-2">
            <label class="field">
              <span>Code</span>
              <input v-model="form.pjCode" placeholder="PJ-01">
            </label>
            <label class="field">
              <span>Nom de la pièce</span>
              <input v-model="form.pjName" placeholder="Facture recherche de fuite">
            </label>
          </div>
          <div v-if="form.pjCode || form.pjName" class="row small mono filename">
            {{ filename }}
            <button class="btn btn-sm btn-ghost" @click="copyFilename">⧉ copier</button>
          </div>
          <div class="field link-field">
            <span>Lien vers la pièce (Google Drive ou autre URL)</span>
            <div class="row link-row">
              <input v-model="form.pjUrl" class="grow" placeholder="https://drive.google.com/…">
              <a
                v-if="safeUrl(form.pjUrl)"
                class="btn btn-sm btn-ghost"
                :href="safeUrl(form.pjUrl)"
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir le lien dans un nouvel onglet"
              >↗</a>
              <button class="btn btn-sm" type="button" @click="showDrive = !showDrive">
                {{ showDrive ? 'Fermer Drive' : '🔍 Chercher sur Drive' }}
              </button>
            </div>
          </div>
          <DrivePicker v-if="showDrive" @pick="linkDriveFile" />
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
.cat-field { display: flex; align-items: center; gap: 2px; }
.cat-field select { flex: 1; min-width: 0; }
</style>
