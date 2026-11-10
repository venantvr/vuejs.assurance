<script setup>
/**
 * Gestion des catégories : les cinq natives sont fixes, les personnalisées
 * s'ajoutent, se modifient et se suppriment (les étapes sont alors reclassées).
 */
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import BaseDialog from '../BaseDialog.vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { CATEGORY_COLORS, CATEGORY_SUGGESTIONS } from '@/lib/model.js'

const store = useDossiersStore()
const ui = useUiStore()
const { categories, deletedCategories } = storeToRefs(store)

const draft = ref({ label: '', short: '', icon: '', color: CATEGORY_COLORS[4].value })

function add () {
  if (!draft.value.label.trim()) {
    ui.toast('Donnez un libellé à la catégorie', { type: 'error' })
    return
  }
  const created = store.addCategory({ ...draft.value })
  draft.value = { label: '', short: '', icon: '', color: CATEGORY_COLORS[4].value }
  ui.toast(`Catégorie « ${created.short} » ajoutée`)
}

function addSuggestion (suggestion) {
  const created = store.addCategory(suggestion)
  ui.toast(`Catégorie « ${created.short} » ajoutée`)
}

function remove (cat) {
  const used = store.categoryUsage(cat.key)
  ui.confirm({
    title: `Supprimer « ${cat.short} » ?`,
    message: used
      ? `${used} étape(s) gardent leur classement « ${cat.short} » (affiché comme supprimé) ; la catégorie reste restaurable ici. Annulable avec Ctrl+Z.`
      : 'Cette catégorie n’est utilisée par aucune étape ; elle reste restaurable ici.',
    confirmLabel: 'Supprimer',
    onConfirm: () => {
      store.removeCategory(cat.key)
      ui.toast(`Catégorie « ${cat.short} » supprimée — restaurable dans ce dialogue`)
    }
  })
}

function isUsed (cat) {
  return store.categoryUsage(cat.key)
}
</script>

<template>
  <BaseDialog title="Catégories" subtitle="adaptez-les à votre dossier" width="720px" @close="ui.closeDialog()">
    <section class="stack">
      <div v-for="cat in categories" :key="cat.key" class="cat-row" :style="{ '--cat': cat.color }">
        <template v-if="cat.builtin">
          <div class="cat-line">
            <span class="badge cat-badge nowrap">{{ cat.icon }} {{ cat.short }}</span>
            <span class="cat-name small muted">{{ cat.label }}</span>
            <span class="xsmall muted nowrap">{{ isUsed(cat) }} étape(s)</span>
            <span class="badge xsmall nowrap">native</span>
          </div>
        </template>

        <template v-else>
          <div class="cat-line">
            <span class="badge cat-badge nowrap">{{ cat.icon }} {{ cat.short }}</span>
            <input
              class="cat-name"
              :value="cat.label"
              placeholder="Libellé complet"
              @input="store.updateCategory(cat.key, { label: $event.target.value })"
            >
            <input
              class="cat-short"
              :value="cat.short"
              placeholder="Nom court"
              @input="store.updateCategory(cat.key, { short: $event.target.value })"
            >
            <input
              class="cat-icon"
              :value="cat.icon"
              maxlength="3"
              placeholder="🔍"
              @input="store.updateCategory(cat.key, { icon: $event.target.value })"
            >
          </div>
          <div class="cat-line">
            <span class="swatches">
              <button
                v-for="color in CATEGORY_COLORS"
                :key="color.value"
                class="cat-swatch"
                type="button"
                :class="{ on: cat.color === color.value }"
                :style="{ '--cat': color.value }"
                :title="color.name"
                @click="store.updateCategory(cat.key, { color: color.value })"
              />
            </span>
            <span class="grow" />
            <span class="xsmall muted nowrap">{{ isUsed(cat) }} étape(s)</span>
            <button class="btn btn-sm btn-ghost btn-danger" title="Supprimer la catégorie" @click="remove(cat)">🗑 Supprimer</button>
          </div>
        </template>
      </div>
    </section>

    <section v-if="deletedCategories.length">
      <b class="small">Catégories supprimées</b>
      <div class="row suggestions">
        <button
          v-for="cat in deletedCategories"
          :key="cat.key"
          class="chip cat-chip"
          :style="{ '--cat': cat.color }"
          :title="`${isUsed(cat)} étape(s) la citent encore`"
          @click="store.restoreCategory(cat.key); ui.toast(`Catégorie « ${cat.short} » restaurée`)"
        >♻ {{ cat.icon }} {{ cat.short }} <span class="xsmall">({{ isUsed(cat) }})</span></button>
      </div>
      <p class="xsmall muted hint">Les étapes classées dans une catégorie supprimée gardent ce classement : un clic la restaure.</p>
    </section>

    <section>
      <b class="small">Ajouter une catégorie</b>
      <div class="add-row" :style="{ '--cat': draft.color }">
        <input v-model="draft.label" class="cat-name" placeholder="Libellé — ex : Observation / Constat sur site" @keydown.enter="add">
        <input v-model="draft.short" class="cat-short" placeholder="Nom court">
        <input v-model="draft.icon" class="cat-icon" maxlength="3" placeholder="🔍">
        <span class="swatches">
          <button
            v-for="color in CATEGORY_COLORS"
            :key="color.value"
            class="cat-swatch"
            type="button"
            :class="{ on: draft.color === color.value }"
            :style="{ '--cat': color.value }"
            :title="color.name"
            @click="draft.color = color.value"
          />
        </span>
        <button class="btn btn-sm btn-primary nowrap" @click="add">＋ Ajouter</button>
      </div>
      <p class="xsmall muted hint">
        Le nom court s'affiche sur les cartes et dans les filtres ; il sert aussi de préfixe en capture rapide
        (<code>observation: fissure en façade nord</code>).
      </p>
    </section>

    <section>
      <b class="small">Suggestions</b>
      <div class="row suggestions">
        <button
          v-for="suggestion in CATEGORY_SUGGESTIONS"
          :key="suggestion.label"
          class="chip cat-chip"
          :style="{ '--cat': suggestion.color }"
          :disabled="categories.some((c) => c.short.toLowerCase() === suggestion.short.toLowerCase())"
          @click="addSuggestion(suggestion)"
        >＋ {{ suggestion.icon }} {{ suggestion.short }}</button>
      </div>
    </section>

    <template #footer>
      <button class="btn btn-primary" @click="ui.closeDialog()">Terminé</button>
      <span class="grow" />
      <span class="small muted">Les catégories sont partagées par tous les dossiers.</span>
    </template>
  </BaseDialog>
</template>

<style scoped>
.cat-row { flex-direction: column; align-items: stretch; gap: 8px; }
.cat-line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.cat-name { flex: 1 1 220px; min-width: 0; }
.cat-short { flex: 0 1 140px; min-width: 110px; }
.cat-icon { flex: 0 0 58px; text-align: center; }
.swatches { display: flex; gap: 4px; flex-wrap: wrap; }
.add-row {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 8px; padding: 10px; border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm); background: var(--surface-2);
}
.suggestions { margin-top: 8px; }
.hint { margin-top: 7px; }
</style>
