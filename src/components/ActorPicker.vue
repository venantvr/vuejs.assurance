<script setup>
/**
 * Sélecteur d'acteur : saisie libre + liste mémorisée (catalogue partagé par
 * tous les dossiers). Filtrage à la frappe, ajout au catalogue en un geste,
 * suppression des entrées devenues inutiles.
 */
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDossiersStore } from '@/stores/dossiers.js'
import { onClickOutside } from '@/composables/useClickOutside.js'

const props = defineProps({
  modelValue: { type: String, default: '' },
  placeholder: { type: String, default: 'Ex : Assuré, Syndic, Expert…' }
})
const emit = defineEmits(['update:modelValue'])

const store = useDossiersStore()
const { knownActors } = storeToRefs(store)

const root = ref(null)
const input = ref(null)
const open = ref(false)
const highlighted = ref(-1)
// Le filtrage ne s'applique qu'à la frappe : ▾ montre toujours tout le catalogue.
const filtering = ref(false)

onClickOutside(root, () => { open.value = false })

const value = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const matches = computed(() => {
  const needle = value.value.trim().toLowerCase()
  if (!filtering.value || !needle) return knownActors.value
  return knownActors.value.filter((a) => a.toLowerCase().includes(needle))
})

/** Vrai si la saisie n'existe pas encore dans le catalogue. */
const isNew = computed(() => {
  const needle = value.value.trim()
  return Boolean(needle) && !knownActors.value.some((a) => a.toLowerCase() === needle.toLowerCase())
})

function openList () {
  open.value = true
  highlighted.value = -1
}

function onInput () {
  filtering.value = true
  openList()
}

async function toggleList () {
  open.value = !open.value
  filtering.value = false
  if (open.value) {
    highlighted.value = -1
    await nextTick()
    input.value?.focus()
  }
}

function choose (actor) {
  value.value = actor
  filtering.value = false
  open.value = false
  input.value?.focus()
}

function addCurrent () {
  const name = value.value.trim()
  if (!name) return
  store.rememberActor(name)
  open.value = false
  input.value?.focus()
}

function forget (actor) {
  store.forgetActor(actor)
  if (!matches.value.length) open.value = false
}

function onKeydown (event) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (!open.value) openList()
    else highlighted.value = Math.min(highlighted.value + 1, matches.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlighted.value = Math.max(highlighted.value - 1, -1)
  } else if (event.key === 'Enter' && open.value && highlighted.value >= 0) {
    event.preventDefault()
    choose(matches.value[highlighted.value])
  } else if (event.key === 'Escape' && open.value) {
    event.stopPropagation()
    open.value = false
  }
}
</script>

<template>
  <div ref="root" class="picker">
    <div class="picker-field">
      <input
        ref="input"
        v-model="value"
        type="text"
        spellcheck="false"
        autocomplete="off"
        :placeholder="placeholder"
        @focus="openList"
        @input="onInput"
        @keydown="onKeydown"
      >
      <button
        class="btn btn-sm btn-ghost toggle"
        type="button"
        :title="open ? 'Fermer la liste' : 'Choisir dans la liste mémorisée'"
        @click="toggleList"
      >▾</button>
    </div>

    <div v-if="open" class="menu picker-menu">
      <div class="menu-label">
        Acteurs mémorisés<template v-if="filtering && value.trim()"> ({{ matches.length }}/{{ knownActors.length }})</template>
        <template v-else-if="knownActors.length"> ({{ knownActors.length }})</template>
      </div>

      <button
        v-for="(actor, index) in matches"
        :key="actor"
        class="menu-item"
        type="button"
        :class="{ active: actor === value, hot: index === highlighted }"
        @click="choose(actor)"
      >
        <span class="ico">👤</span>
        <span class="name">{{ actor }}</span>
        <button
          class="btn btn-sm btn-ghost btn-danger forget"
          type="button"
          title="Retirer du catalogue (les étapes existantes ne changent pas)"
          @click.stop="forget(actor)"
        >✕</button>
      </button>

      <p v-if="!matches.length" class="xsmall muted none">
        {{ knownActors.length ? 'Aucun acteur ne correspond.' : 'Catalogue vide : le premier acteur saisi y sera ajouté.' }}
      </p>

      <template v-if="isNew">
        <div class="menu-sep" />
        <button class="menu-item" type="button" @click="addCurrent">
          <span class="ico">＋</span> Mémoriser « {{ value.trim() }} »
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.picker { position: relative; }
.picker-field { display: flex; align-items: center; gap: 2px; }
.picker-field input { flex: 1; min-width: 0; }
.toggle { flex: none; }
.picker-menu {
  left: 0; right: auto; min-width: 100%; width: max-content; max-width: min(340px, 86vw);
  max-height: 280px; overflow-y: auto;
}
.menu-item .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.menu-item .forget { opacity: 0; }
.menu-item:hover .forget, .menu-item:focus-within .forget { opacity: 1; }
.menu-item.hot { background: var(--bg-soft); }
.none { padding: 6px 10px; margin: 0; }
</style>
