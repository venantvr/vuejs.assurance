<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'
import StepCard from './StepCard.vue'
import StepTable from './StepTable.vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { useTimeline } from '@/composables/useTimeline.js'
import { CATEGORIES, CATEGORY_ORDER, SORT_MODES, shiftISO } from '@/lib/model.js'
import { copyToClipboard } from '@/lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()
const { active } = storeToRefs(store)
const { visibleSteps, countByCategory, gapBefore } = useTimeline()

const searchInput = ref(null)
const dragging = ref(false)

const dragDisabled = computed(() => ui.filtersActive || active.value?.ui.viewMode !== 'CARDS')

/** Liste liée au glisser-déposer : l'écriture applique le nouvel ordre. */
const draggableSteps = computed({
  get: () => visibleSteps.value,
  set: (list) => {
    const wasChronological = active.value?.ui.sortMode !== 'MANUAL'
    store.reorderSteps(list.map((step) => step.id))
    ui.toast(wasChronological
      ? 'Ordre manuel activé — Ctrl+Z pour revenir en arrière'
      : 'Étape déplacée')
  }
})

function focusSearch () {
  searchInput.value?.focus()
}

function cycleSort () {
  const order = ['DATE_ASC', 'DATE_DESC', 'MANUAL']
  const current = active.value?.ui.sortMode || 'DATE_ASC'
  store.setSortMode(order[(order.indexOf(current) + 1) % order.length])
}

function toggleView () {
  store.setViewMode(active.value?.ui.viewMode === 'CARDS' ? 'TABLE' : 'CARDS')
}

async function copyPj (filename) {
  const ok = await copyToClipboard(filename)
  ui.toast(ok ? `Nom de fichier copié : ${filename}` : 'Copie impossible', { type: ok ? 'info' : 'error' })
}

function confirmRemove (step) {
  ui.confirm({
    title: 'Supprimer cette étape ?',
    message: step.fact.slice(0, 160) + (step.fact.length > 160 ? '…' : ''),
    confirmLabel: 'Supprimer',
    onConfirm: () => {
      store.removeStep(step.id)
      ui.toast('Étape supprimée — Ctrl+Z pour annuler')
    }
  })
}

function insertAfter (step) {
  ui.openDrawer({ date: shiftISO(step.date, 1), category: step.category })
}

function duplicate (step) {
  store.duplicateStep(step.id)
  ui.toast('Étape dupliquée')
}

defineExpose({ focusSearch })
</script>

<template>
  <section v-if="active" class="card card-pad">
    <div class="sec-head">
      <span class="sec-bar no-print" />
      <h2>4. Chronologie factuelle</h2>
      <span class="badge">{{ visibleSteps.length }} / {{ active.steps.length }} affichés</span>
      <span class="grow" />
      <div class="row no-print">
        <input ref="searchInput" v-model="ui.search" placeholder="Rechercher… (F)" class="search">
        <button class="btn btn-sm" :title="'Mode de tri : ' + SORT_MODES[active.ui.sortMode]" @click="cycleSort">
          {{ active.ui.sortMode === 'MANUAL' ? '⠿' : active.ui.sortMode === 'DATE_ASC' ? '↓' : '↑' }}
          {{ SORT_MODES[active.ui.sortMode] }}
        </button>
        <button class="btn btn-sm" @click="toggleView">
          {{ active.ui.viewMode === 'CARDS' ? '▦ Vue tableau' : '☰ Vue timeline' }}
        </button>
      </div>
    </div>

    <div class="row no-print filters">
      <button class="chip" :class="{ on: ui.category === 'ALL' }" @click="ui.category = 'ALL'">
        Toutes ({{ active.steps.length }})
      </button>
      <button
        v-for="key in CATEGORY_ORDER"
        :key="key"
        class="chip"
        :class="{ on: ui.category === key }"
        @click="ui.category = key"
      >{{ CATEGORIES[key].icon }} {{ CATEGORIES[key].short }} ({{ countByCategory[key] || 0 }})</button>
      <span class="grow" />
      <button class="chip" :class="{ on: ui.onlyOpenQuestions }" @click="ui.onlyOpenQuestions = !ui.onlyOpenQuestions">● Questions ouvertes</button>
      <button class="chip" :class="{ on: ui.onlyWithoutPj }" @click="ui.onlyWithoutPj = !ui.onlyWithoutPj">📎 Sans pièce jointe</button>
      <button v-if="ui.filtersActive" class="chip" @click="ui.resetFilters()">✕ Réinitialiser</button>
    </div>

    <!-- Vue timeline : glisser-déposer -->
    <template v-if="active.ui.viewMode === 'CARDS' && visibleSteps.length">
      <p class="drag-hint no-print">
        <template v-if="dragDisabled">
          ⠿ Glisser-déposer désactivé tant qu'un filtre ou une recherche est actif.
        </template>
        <template v-else>
          ⠿ Saisissez la poignée pour réordonner les étapes
          <template v-if="active.ui.sortMode !== 'MANUAL'"> (bascule automatique en ordre manuel)</template>.
        </template>
      </p>

      <draggable
        v-model="draggableSteps"
        class="timeline"
        :class="{ 'dragging-active': dragging }"
        item-key="id"
        handle=".drag-handle"
        :animation="180"
        :disabled="dragDisabled"
        :force-fallback="true"
        fallback-class="sortable-drag"
        :fallback-tolerance="3"
        :swap-threshold="0.65"
        ghost-class="sortable-ghost"
        chosen-class="sortable-chosen"
        drag-class="sortable-drag"
        @start="dragging = true"
        @end="dragging = false"
      >
        <template #item="{ element, index }">
          <div class="tl-item">
            <span class="tl-dot" :class="`dot-${element.category}`" />
            <div v-if="!dragging && gapBefore(index) !== null" class="gap-note" :class="{ hot: gapBefore(index) >= 15 }">
              ⟡ {{ gapBefore(index) }} jours d'écart<template v-if="gapBefore(index) >= 15"> — délai à justifier ou à opposer</template>
            </div>
            <StepCard
              :step="element"
              :draggable="!dragDisabled"
              @edit="ui.openDrawer(element)"
              @duplicate="duplicate(element)"
              @insert-after="insertAfter(element)"
              @remove="confirmRemove(element)"
              @copy-pj="copyPj"
              @shift-date="(days) => store.shiftStepDate(element.id, days)"
              @toggle-question="store.setStepQuestion(element.id, { questionResolved: !element.questionResolved })"
              @answer-question="(value) => store.setStepQuestion(element.id, { questionAnswer: value })"
            />
          </div>
        </template>
      </draggable>
    </template>

    <!-- Vue tableau -->
    <StepTable
      v-else-if="visibleSteps.length"
      :steps="visibleSteps"
      @edit="ui.openDrawer($event)"
      @remove="confirmRemove"
    />

    <div v-else class="empty">
      <b>{{ active.steps.length ? 'Aucune étape ne correspond aux filtres' : 'La chronologie est vide' }}</b>
      <template v-if="active.steps.length">
        <button class="btn btn-sm" @click="ui.resetFilters()">Réinitialiser les filtres</button>
      </template>
      <template v-else>
        Utilisez la capture rapide, ou partez d'une
        <a href="#" @click.prevent="ui.openDialog('presets')">étape type</a>.
      </template>
    </div>
  </section>
</template>

<style scoped>
.search { width: 175px; }
.filters { margin-bottom: 14px; }
</style>
