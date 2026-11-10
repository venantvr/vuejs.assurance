<script setup>
import { nextTick, onMounted, ref } from 'vue'
import BaseDialog from '../BaseDialog.vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'

const store = useDossiersStore()
const ui = useUiStore()

const name = ref(store.active?.name || '')
const field = ref(null)

onMounted(async () => {
  await nextTick()
  field.value?.select()
})

function rename () {
  store.renameActive(name.value)
  ui.closeDialog()
  ui.toast('Dossier renommé')
}
</script>

<template>
  <BaseDialog title="Renommer le dossier" width="480px" @close="ui.closeDialog()">
    <label class="field">
      <span>Nom du dossier</span>
      <input ref="field" v-model="name" @keydown.enter="rename">
    </label>

    <template #footer>
      <button class="btn btn-primary" @click="rename">Renommer</button>
      <button class="btn" @click="ui.closeDialog()">Annuler</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.field > span {
  font-size: 10.5px; font-weight: 650; text-transform: uppercase;
  letter-spacing: .06em; color: var(--text-faint);
}
</style>
