<script setup>
import { ref, watch } from 'vue'
import BaseDialog from '../BaseDialog.vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { buildMail } from '@/lib/exporters.js'
import { copyToClipboard, downloadFile, slugify } from '@/lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()

const kind = ref('SYNTHESE')
const text = ref('')

watch(kind, (value) => {
  text.value = store.active ? buildMail(store.active, { kind: value }) : ''
}, { immediate: true })

async function copy () {
  const ok = await copyToClipboard(text.value)
  ui.toast(ok ? 'Courrier copié — collez-le dans votre messagerie' : 'Copie impossible', { type: ok ? 'info' : 'error' })
}

function save () {
  const base = slugify(store.active?.meta.ref || store.active?.name || 'dossier')
  downloadFile(`${kind.value === 'RELANCE' ? 'relance' : 'synthese'}_${base}.txt`, text.value, 'text/plain')
  ui.toast('Courrier téléchargé')
}
</script>

<template>
  <BaseDialog title="Courrier / mail prêt à envoyer" width="840px" @close="ui.closeDialog()">
    <template #head-actions>
      <button class="btn btn-sm" :class="{ 'btn-primary': kind === 'SYNTHESE' }" @click="kind = 'SYNTHESE'">Synthèse</button>
      <button class="btn btn-sm" :class="{ 'btn-primary': kind === 'RELANCE' }" @click="kind = 'RELANCE'">Relance</button>
    </template>

    <textarea v-model="text" class="mail-out" spellcheck="false" />

    <template #footer>
      <button class="btn btn-primary" @click="copy">⧉ Copier</button>
      <button class="btn" @click="save">⬇ Télécharger (.txt)</button>
      <span class="grow" />
      <span class="small muted">Complétez les champs entre crochets avant envoi.</span>
    </template>
  </BaseDialog>
</template>
