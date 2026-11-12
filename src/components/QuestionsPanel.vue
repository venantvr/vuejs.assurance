<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { useTimeline } from '@/composables/useTimeline.js'
import { formatDateFR } from '@/lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()
const { active } = storeToRefs(store)
const { openQuestions, kpis } = useTimeline()

const stepQuestions = computed(() => openQuestions.value.filter((q) => q.kind === 'step'))
const hasPrintableQuestions = computed(() =>
  stepQuestions.value.length > 0 || globalQuestions.value.some((q) => q.text?.trim())
)

/** Questions générales, réordonnables par glisser-déposer (ordre de priorité). */
const globalQuestions = computed({
  get: () => [...(active.value?.globalQuestions || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
  set: (list) => {
    store.reorderGlobalQuestions(list.map((q) => q.id))
    ui.toast('Priorité des questions mise à jour')
  }
})

function addQuestion () {
  store.addGlobalQuestion()
  ui.toast('Question ajoutée — rédigez-la ci-dessous')
}

function removeStepQuestion (question) {
  store.clearStepQuestion(question.id)
  ui.toast('Question supprimée — Ctrl+Z pour annuler')
}

function removeQuestion (id) {
  store.removeGlobalQuestion(id)
  ui.toast('Question supprimée — Ctrl+Z pour annuler')
}
</script>

<template>
  <section v-if="active" class="card card-pad questions-panel" :class="{ 'print-hide': !hasPrintableQuestions }">
    <div class="sec-head">
      <span class="sec-bar no-print violet" />
      <h2>5. Questions &amp; points d'arbitrage</h2>
      <span class="badge no-print" :class="kpis.open ? 'badge-BLOCAGE' : 'badge-ok'">{{ kpis.open }} en attente</span>
      <span class="grow" />
      <button class="btn btn-sm no-print" @click="addQuestion">＋ Question générale</button>
    </div>

    <div v-if="stepQuestions.length" class="stack group">
      <div
        v-for="question in stepQuestions"
        :key="question.id"
        class="qbox"
        :class="{ done: question.resolved }"
      >
        <div class="row">
          <span class="badge" :class="question.resolved ? 'badge-ok' : 'badge-BLOCAGE'">
            {{ question.resolved ? '✔ Traitée' : '● En attente' }}
          </span>
          <span class="badge">{{ formatDateFR(question.date) }}</span>
          <span class="grow" />
          <button class="btn btn-sm no-print" @click="store.setStepQuestion(question.id, { questionResolved: !question.resolved })">
            {{ question.resolved ? 'Rouvrir' : 'Marquer traitée' }}
          </button>
          <button class="btn btn-sm btn-ghost no-print" title="Ouvrir l'étape rattachée" @click="ui.openDrawer(store.active.steps.find((s) => s.id === question.id))">✎</button>
          <button class="btn btn-sm btn-ghost btn-danger no-print" title="Supprimer la question (l'étape est conservée)" @click="removeStepQuestion(question)">🗑</button>
        </div>
        <p class="text">{{ question.text }}</p>
        <input
          class="input-flat answer no-print"
          :value="question.answer"
          placeholder="Réponse obtenue (date, canal, contenu)"
          @input="store.setStepQuestion(question.id, { questionAnswer: $event.target.value })"
        >
        <p v-if="question.answer?.trim()" class="print-only answer field-print"><b>Réponse :</b> {{ question.answer }}</p>
      </div>
    </div>

    <div v-if="globalQuestions.length" class="group" :class="{ 'print-hide': !globalQuestions.some((q) => q.text?.trim()) }">
      <p class="drag-hint no-print">⠿ Questions générales — glissez pour définir l'ordre de priorité dans le courrier généré.</p>
      <draggable
        v-model="globalQuestions"
        class="stack"
        item-key="id"
        handle=".drag-handle"
        :animation="180"
        :force-fallback="true"
        fallback-class="sortable-drag"
        :fallback-tolerance="3"
        :swap-threshold="0.65"
        ghost-class="sortable-ghost"
        drag-class="sortable-drag"
      >
        <template #item="{ element }">
          <div class="qbox" :class="{ done: element.status === 'RESOLVED', 'print-hide': !element.text?.trim() }">
            <div class="row">
              <button class="drag-handle no-print" title="Glisser pour réordonner">⠿</button>
              <span class="badge" :class="element.status === 'RESOLVED' ? 'badge-ok' : 'badge-BLOCAGE'">
                {{ element.status === 'RESOLVED' ? '✔ Traitée' : '● En attente' }}
              </span>
              <span class="badge">Question générale</span>
              <span class="grow" />
              <button
                class="btn btn-sm no-print"
                @click="store.updateGlobalQuestion(element.id, { status: element.status === 'RESOLVED' ? 'PENDING' : 'RESOLVED' })"
              >{{ element.status === 'RESOLVED' ? 'Rouvrir' : 'Marquer traitée' }}</button>
              <button class="btn btn-sm btn-ghost btn-danger no-print" title="Supprimer" @click="removeQuestion(element.id)">🗑</button>
            </div>
            <input
              class="input-flat text strong no-print"
              :value="element.text"
              placeholder="Ex : quelle franchise contractuelle s'applique si la responsabilité incombe à la copropriété ?"
              @input="store.updateGlobalQuestion(element.id, { text: $event.target.value })"
            >
            <p class="print-only text strong">{{ element.text }}</p>
            <input
              class="input-flat answer no-print"
              :value="element.answer"
              placeholder="Réponse obtenue (date, canal, contenu)"
              @input="store.updateGlobalQuestion(element.id, { answer: $event.target.value })"
            >
            <p v-if="element.answer?.trim()" class="print-only answer field-print"><b>Réponse :</b> {{ element.answer }}</p>
          </div>
        </template>
      </draggable>
    </div>

    <div v-if="!stepQuestions.length && !globalQuestions.length" class="empty">
      <b>Aucune question en suspens</b>
      Isolez ici chaque point qui nécessite une position écrite de l'assureur : il les traitera plus vite
      qu'enfouis dans un mail.
    </div>
  </section>
</template>

<style scoped>
.violet { background: var(--violet); }
.group + .group { margin-top: 14px; }
.text { margin-top: 7px; }
.strong { font-weight: 550; }
.answer { margin-top: 8px; }
</style>
