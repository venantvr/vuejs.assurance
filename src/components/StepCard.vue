<script setup>
import { computed } from 'vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { formatCurrency, formatDateFR, pjFilename } from '@/lib/format.js'
import { channelOf } from '@/lib/model.js'

const props = defineProps({
  step: { type: Object, required: true },
  draggable: { type: Boolean, default: false }
})

const emit = defineEmits(['edit', 'duplicate', 'insert-after', 'remove', 'copy-pj', 'toggle-question', 'answer-question', 'remove-question', 'shift-date'])

const store = useDossiersStore()
const category = computed(() => store.category(props.step.category))
const amount = computed(() => Number.parseFloat(props.step.amount) || 0)
const attachments = computed(() => props.step.attachments || [])
const channel = computed(() => channelOf(props.step.channel))
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
      <span class="badge cat-badge" :style="{ '--cat': category.color }" :title="category.deleted ? 'Catégorie supprimée — restaurable via ⚙ Catégories' : ''">
        {{ category.icon }} {{ category.short }}<template v-if="category.deleted"> ⌀</template>
      </span>
      <span v-for="actor in step.actors" :key="actor" class="badge badge-actor"><span class="actor-ico">👤</span> {{ actor }}</span>
      <span v-if="channel" class="badge badge-channel" :class="`channel-${channel.key}`" :title="channel.label">{{ channel.icon }} {{ channel.short }}</span>
      <span v-if="amount" class="badge badge-money">{{ formatCurrency(amount) }}</span>

      <span class="step-acts no-print">
        <button class="btn btn-sm btn-ghost" title="Modifier" @click="emit('edit')">✎</button>
        <button class="btn btn-sm btn-ghost" title="Dupliquer" @click="emit('duplicate')">⧉</button>
        <button class="btn btn-sm btn-ghost" title="Insérer une étape juste après" @click="emit('insert-after')">＋</button>
        <button class="btn btn-sm btn-ghost btn-danger" title="Supprimer" @click="emit('remove')">🗑</button>
      </span>
    </div>

    <p class="step-fact">{{ step.fact }}</p>

    <div class="step-foot" :class="{ 'print-hide': !step.impact && !attachments.length }">
      <span v-if="step.impact" class="badge">⇢ {{ step.impact }}</span>
      <span v-for="att in attachments" :key="att.id" class="pj-group">
        <button
          class="pj-tag"
          :title="`Copier le nom de fichier : ${pjFilename(att, step.date)}`"
          @click="emit('copy-pj', pjFilename(att, step.date))"
        >📎 {{ att.code || 'PJ' }} · {{ att.name || 'document' }} ⧉</button>
        <a
          v-if="att.url"
          class="badge badge-link no-print"
          :href="att.url"
          target="_blank"
          rel="noopener noreferrer"
          :title="`Ouvrir ${att.name || 'la pièce'}`"
        >🔗</a>
        <a
          v-if="att.downloadUrl"
          class="badge badge-link no-print"
          :href="att.downloadUrl"
          target="_blank"
          rel="noopener noreferrer"
          :title="`Télécharger ${att.name || 'la pièce'}`"
        >⬇</a>
      </span>
      <span v-if="!attachments.length" class="badge badge-warn no-print">Aucune preuve rattachée</span>
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
.badge-link { text-decoration: none; cursor: pointer; }
.badge-link:hover { border-color: var(--blue); color: var(--blue); }
.q-text { margin-top: 7px; }
.answer { margin-top: 8px; }
</style>
