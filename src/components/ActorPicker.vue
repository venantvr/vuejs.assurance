<script setup>
/**
 * Sélecteur d'intervenants : plusieurs par étape, saisie libre adossée à un
 * catalogue mémorisé et partagé par tous les dossiers.
 */
import { computed, nextTick, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDossiersStore } from '@/stores/dossiers.js'
import { onClickOutside } from '@/composables/useClickOutside.js'
import { splitActors } from '@/lib/model.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Ajouter un intervenant…' }
})
const emit = defineEmits(['update:modelValue'])

const store = useDossiersStore()
const { knownActors } = storeToRefs(store)

const root = ref(null)
const input = ref(null)
const query = ref('')
const open = ref(false)
const highlighted = ref(-1)

onClickOutside(root, () => { open.value = false })

const selected = computed(() => props.modelValue || [])

const isSelected = (actor) => selected.value.some((a) => a.toLowerCase() === actor.toLowerCase())

/** Catalogue filtré à la frappe ; liste complète sinon. */
const matches = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return knownActors.value
  return knownActors.value.filter((a) => a.toLowerCase().includes(needle))
})

const canAddQuery = computed(() => {
  const name = query.value.trim()
  return Boolean(name) && !isSelected(name)
})

function commit (list) {
  emit('update:modelValue', splitActors(list))
}

function add (actor) {
  const name = String(actor || '').trim()
  if (!name || isSelected(name)) return
  commit([...selected.value, name])
}

function remove (actor) {
  commit(selected.value.filter((a) => a !== actor))
}

function toggle (actor) {
  if (isSelected(actor)) remove(actor)
  else add(actor)
}

function addFromQuery () {
  // « Assuré & Syndic » saisi d'un coup crée bien deux intervenants
  splitActors(query.value).forEach(add)
  query.value = ''
  highlighted.value = -1
  input.value?.focus()
}

async function toggleList () {
  open.value = !open.value
  if (open.value) {
    highlighted.value = -1
    await nextTick()
    input.value?.focus()
  }
}

function onKeydown (event) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (open.value && highlighted.value >= 0) toggle(matches.value[highlighted.value])
    else addFromQuery()
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    open.value = true
    highlighted.value = Math.min(highlighted.value + 1, matches.value.length - 1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    highlighted.value = Math.max(highlighted.value - 1, -1)
  } else if (event.key === 'Backspace' && !query.value && selected.value.length) {
    commit(selected.value.slice(0, -1))
  } else if (event.key === 'Escape' && open.value) {
    event.stopPropagation()
    open.value = false
  }
}
</script>

<template>
  <div ref="root" class="picker">
    <div class="picker-field">
      <span v-for="actor in selected" :key="actor" class="actor-chip">
        👤 {{ actor }}
        <button class="chip-x" type="button" :title="`Retirer ${actor}`" @click="remove(actor)">✕</button>
      </span>

      <input
        ref="input"
        v-model="query"
        type="text"
        spellcheck="false"
        autocomplete="off"
        :placeholder="selected.length ? placeholder : 'Ex : Assuré, Expert, Entreprise…'"
        @focus="open = true"
        @input="open = true"
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
        Intervenants mémorisés<template v-if="knownActors.length"> ({{ matches.length }}/{{ knownActors.length }})</template>
      </div>

      <button
        v-for="(actor, index) in matches"
        :key="actor"
        class="menu-item"
        type="button"
        :class="{ active: isSelected(actor), hot: index === highlighted }"
        @click="toggle(actor)"
      >
        <span class="ico">{{ isSelected(actor) ? '✔' : '👤' }}</span>
        <span class="name">{{ actor }}</span>
        <button
          class="btn btn-sm btn-ghost btn-danger forget"
          type="button"
          title="Retirer du catalogue (les étapes existantes ne changent pas)"
          @click.stop="store.forgetActor(actor)"
        >✕</button>
      </button>

      <p v-if="!matches.length" class="xsmall muted none">
        {{ knownActors.length ? 'Aucun intervenant ne correspond.' : 'Catalogue vide : les intervenants saisis y seront ajoutés.' }}
      </p>

      <template v-if="canAddQuery">
        <div class="menu-sep" />
        <button class="menu-item" type="button" @click="addFromQuery">
          <span class="ico">＋</span> Ajouter « {{ query.trim() }} »
        </button>
      </template>
    </div>

    <p class="xsmall muted hint">
      Plusieurs intervenants possibles : <kbd>Entrée</kbd> valide la saisie, une ligne de la liste
      s'ajoute ou se retire au clic, <kbd>⌫</kbd> retire le dernier.
    </p>
  </div>
</template>

<style scoped>
.picker { position: relative; }
.picker-field {
  display: flex; align-items: center; gap: 5px; flex-wrap: wrap;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--surface); padding: 4px 4px 4px 7px;
}
.picker-field:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent);
}
.picker-field input {
  flex: 1 1 120px; min-width: 90px; border: 0; background: transparent;
  padding: 4px 2px; box-shadow: none;
}
.picker-field input:focus { box-shadow: none; }
.actor-chip {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--brand-soft); color: var(--brand-ink);
  border: 1px solid color-mix(in srgb, var(--brand) 28%, transparent);
  border-radius: 99px; padding: 2px 4px 2px 9px; font-size: 12px; font-weight: 550;
  white-space: nowrap;
}
.chip-x {
  border: 0; background: transparent; color: inherit; cursor: pointer;
  font-size: 11px; line-height: 1; padding: 3px 4px; border-radius: 99px;
}
.chip-x:hover { background: color-mix(in srgb, var(--brand) 22%, transparent); }
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
.hint { margin-top: 5px; }
</style>
