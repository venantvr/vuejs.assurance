<script setup>
import { computed, ref } from 'vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { parseQuickLine } from '@/lib/parse.js'
import { formatCurrency, formatDateFR } from '@/lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()

const line = ref('')
const input = ref(null)

const parsed = computed(() => parseQuickLine(line.value, store.categories))

function focus () {
  input.value?.focus()
}

function submit () {
  if (!parsed.value) {
    ui.toast('Saisissez au moins la description du fait', { type: 'error' })
    return
  }
  const { date, time, category, fact, actor, amount, pjName } = parsed.value
  const step = store.addStep({ date, time, category, fact, actor, amount, pjName })
  line.value = ''
  ui.toast(`Étape ajoutée au ${formatDateFR(step.date)}`)
}

defineExpose({ focus })
</script>

<template>
  <section class="card card-pad no-print">
    <div class="sec-head">
      <span class="sec-bar" />
      <h2>2. Capture rapide</h2>
      <span class="grow" />
      <button class="btn btn-sm" @click="ui.openDialog('presets')">📋 Étapes types</button>
      <button class="btn btn-sm btn-primary" @click="ui.openDrawer({})">＋ Étape détaillée <span class="xsmall faded">N</span></button>
    </div>

    <div class="capture">
      <input
        ref="input"
        v-model="line"
        placeholder="Ex : 12/09 14h30 intervention plombier recherche de fuite 285€ | AquaFuite | PJ Facture-AquaFuite"
        @keydown.enter="submit"
        @keydown.esc="line = ''"
      >
      <button class="btn btn-primary" :disabled="!parsed" @click="submit">Ajouter ↵</button>
    </div>

    <div v-if="parsed" class="capture-preview">
      <span class="badge cat-badge" :style="{ '--cat': store.category(parsed.category).color }">
        {{ store.category(parsed.category).short }}<template v-if="parsed.guessedCategory"> (déduit)</template>
      </span>
      <b>{{ formatDateFR(parsed.date) }}</b>
      <span v-if="parsed.time">{{ parsed.time }}</span>
      <span class="fact">{{ parsed.fact }}</span>
      <span v-if="parsed.actor" class="badge">👤 {{ parsed.actor }}</span>
      <span v-if="parsed.amount" class="badge badge-money">{{ formatCurrency(parsed.amount) }}</span>
      <span v-if="parsed.pjName" class="badge">📎 {{ parsed.pjName }}</span>
    </div>
    <p v-else class="capture-hint">
      Tapez une ligne, appuyez sur <b>Entrée</b> : la date (<code>12/09</code>, <code>hier</code>, <code>14h30</code>),
      le montant (<code>285€</code>), la catégorie (<code>tech:</code>, <code>admin:</code>, <code>relance:</code>)
      et la pièce (<code>PJ Nom-du-fichier</code>) sont reconnus. Séparez acteur et pièce par <code>|</code>. Raccourci : <b>/</b>
    </p>
  </section>
</template>

<style scoped>
.fact { flex: 1; min-width: 120px; }
.faded { opacity: .75; }
</style>
