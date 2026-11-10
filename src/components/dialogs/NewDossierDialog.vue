<script setup>
import { nextTick, onMounted, ref } from 'vue'
import BaseDialog from '../BaseDialog.vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { DOSSIER_TEMPLATES } from '@/lib/presets.js'

const store = useDossiersStore()
const ui = useUiStore()

const name = ref('')
const templateId = ref('DDE')
const nameField = ref(null)

onMounted(async () => {
  await nextTick()
  nameField.value?.focus()
})

function create () {
  store.addDossier(name.value, templateId.value)
  ui.closeDialog()
  ui.resetFilters()
  ui.toast('Dossier créé')
}
</script>

<template>
  <BaseDialog title="Nouveau dossier" @close="ui.closeDialog()">
    <label class="field">
      <span>Nom du dossier</span>
      <input ref="nameField" v-model="name" placeholder="Ex : DDE séjour — sinistre 2026-94810" @keydown.enter="create">
    </label>

    <div class="field">
      <span>Partir d'un modèle de sinistre</span>
      <div class="preset-list">
        <button
          v-for="template in DOSSIER_TEMPLATES"
          :key="template.id"
          class="preset"
          :class="{ selected: templateId === template.id }"
          @click="templateId = template.id"
        >
          <b>{{ template.name }}</b>
          <span>
            {{ template.steps.length
              ? `${template.steps.length} étapes pré-rédigées, pièces déjà numérotées`
              : 'aucune étape — à construire librement' }}
          </span>
        </button>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-primary" @click="create">Créer le dossier</button>
      <button class="btn" @click="ui.closeDialog()">Annuler</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.field > span {
  font-size: 10.5px; font-weight: 650; text-transform: uppercase;
  letter-spacing: .06em; color: var(--text-faint);
}
.selected { border-color: var(--brand); background: var(--brand-soft); }
</style>
