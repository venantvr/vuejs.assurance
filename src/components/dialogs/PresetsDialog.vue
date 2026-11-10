<script setup>
import BaseDialog from '../BaseDialog.vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { STEP_PRESETS } from '@/lib/presets.js'

const store = useDossiersStore()
const ui = useUiStore()

function use (preset) {
  const step = store.addStep({ ...preset })
  ui.closeDialog()
  ui.openDrawer(step)
}
</script>

<template>
  <BaseDialog title="Étapes types" subtitle="insertion en un clic, à la date du jour" @close="ui.closeDialog()">
    <div class="preset-list">
      <button v-for="(preset, index) in STEP_PRESETS" :key="index" class="preset" @click="use(preset)">
        <span class="row top">
          <b class="label">{{ preset.fact }}</b>
          <span class="badge cat-badge" :style="{ '--cat': store.category(preset.category).color }">{{ store.category(preset.category).short }}</span>
        </span>
        <span>
          <template v-if="preset.actor">Intervenant proposé : {{ preset.actor }}</template>
          <template v-if="preset.question"> · question d'arbitrage incluse</template>
          <template v-if="preset.pjName"> · pièce jointe numérotée automatiquement</template>
        </span>
      </button>
    </div>

    <template #footer>
      <span class="small muted">Les crochets <code>[…]</code> sont à compléter : l'étape s'ouvre aussitôt pour édition.</span>
    </template>
  </BaseDialog>
</template>

<style scoped>
.top { align-items: flex-start; flex-wrap: nowrap; gap: 12px; }
.label { flex: 1; min-width: 0; }
</style>
