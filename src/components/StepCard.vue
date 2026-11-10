<script setup>
import { computed } from 'vue'
import { CATEGORIES } from '@/lib/model.js'
import { formatCurrency, formatDateFR, pjFilename } from '@/lib/format.js'

const props = defineProps({
  step: { type: Object, required: true },
  draggable: { type: Boolean, default: false }
})

const emit = defineEmits(['edit', 'duplicate', 'insert-after', 'remove', 'copy-pj', 'toggle-question', 'answer-question', 'remove-question', 'shift-date'])

const category = computed(() => CATEGORIES[props.step.category] || CATEGORIES.ADMIN)
const amount = computed(() => Number.parseFloat(props.step.amount) || 0)
const filename = computed(() => pjFilename(props.step))
const hasOpenQuestion = computed(() => Boolean(props.step.question?.trim()) && !props.step.questionResolved)
</script>

<template>
  <article class="step" :class="{ 'is-open-q': hasOpenQuestion }">
    <div class="step-top">
      <button
        v-if="draggable"
        class="drag-handle no-print"
        title="Glisser pour déplacer · Maj+↑/↓ pour décaler la date d'un jour"
        @keydown.up.shift.prevent="emit('shift-date', -1)"
        @keydown.down.shift.prevent="emit('shift-date', 1)"
      >⠿</button>
      <span class="step-date">{{ formatDateFR(step.date) }}</span>
      <span v-if="step.time" class="muted xsmall">{{ step.time }}</span>
      <span class="badge" :class="`badge-${step.category}`">{{ category.icon }} {{ category.short }}</span>
      <span v-if="step.actor" class="badge">👤 {{ step.actor }}</span>
      <span v-if="amount" class="badge badge-money">{{ formatCurrency(amount) }}</span>

      <span class="step-acts no-print">
        <button class="btn btn-sm btn-ghost" title="Modifier" @click="emit('edit')">✎</button>
        <button class="btn btn-sm btn-ghost" title="Dupliquer" @click="emit('duplicate')">⧉</button>
        <button class="btn btn-sm btn-ghost" title="Insérer une étape juste après" @click="emit('insert-after')">＋</button>
        <button class="btn btn-sm btn-ghost btn-danger" title="Supprimer" @click="emit('remove')">🗑</button>
      </span>
    </div>

    <p class="step-fact">{{ step.fact }}</p>

    <div class="step-foot">
      <span v-if="step.impact" class="badge">⇢ {{ step.impact }}</span>
      <button
        v-if="step.pjCode || step.pjName"
        class="pj-tag"
        :title="`Copier le nom de fichier : ${filename}`"
        @click="emit('copy-pj', filename)"
      >📎 {{ step.pjCode || 'PJ' }} · {{ step.pjName || 'document' }} ⧉</button>
      <span v-else class="badge badge-warn no-print">Aucune preuve rattachée</span>
    </div>

    <div v-if="step.question" class="qbox" :class="{ done: step.questionResolved }">
      <div class="row">
        <span class="badge" :class="step.questionResolved ? 'badge-ok' : 'badge-BLOCAGE'">
          {{ step.questionResolved ? '✔ Traitée' : '● Question en attente' }}
        </span>
        <span class="grow" />
        <button class="btn btn-sm no-print" @click="emit('toggle-question')">
          {{ step.questionResolved ? 'Rouvrir' : 'Marquer traitée' }}
        </button>
        <button class="btn btn-sm btn-ghost btn-danger no-print" title="Supprimer la question (l'étape est conservée)" @click="emit('remove-question')">🗑</button>
      </div>
      <p class="q-text">{{ step.question }}</p>
      <input
        class="input-flat answer"
        :value="step.questionAnswer"
        placeholder="Réponse obtenue (date, canal, contenu)"
        @input="emit('answer-question', $event.target.value)"
      >
    </div>
  </article>
</template>

<style scoped>
.q-text { margin-top: 7px; }
.answer { margin-top: 8px; }
</style>
