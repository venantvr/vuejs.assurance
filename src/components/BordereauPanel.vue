<script setup>
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { copyToClipboard, formatDateFR, pjFilename } from '@/lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()
const { active, attachments } = storeToRefs(store)

/** Réordonner le bordereau renumérote directement les pièces (PJ-01, PJ-02…). */
const list = computed({
  get: () => attachments.value,
  set: (next) => {
    store.renumberAttachments(next.map((step) => step.id))
    ui.toast('Pièces renumérotées dans le nouvel ordre')
  }
})

function renumberByDate () {
  const count = store.renumberAttachments()
  ui.toast(`${count} pièce(s) renumérotée(s) dans l'ordre chronologique`)
}

async function copyOne (step) {
  const ok = await copyToClipboard(pjFilename(step))
  ui.toast(ok ? 'Nom de fichier copié' : 'Copie impossible', { type: ok ? 'info' : 'error' })
}

/** Retire la pièce de l'étape (l'étape elle-même reste dans la chronologie). */
function detach (step) {
  const code = step.pjCode || 'la pièce'
  store.detachAttachment(step.id)
  ui.toast(`${code} détachée de l'étape — Ctrl+Z pour annuler`)
}

async function copyAll () {
  if (!attachments.value.length) {
    ui.toast('Aucune pièce à copier', { type: 'error' })
    return
  }
  const text = attachments.value
    .map((s) => `${s.pjCode || 'PJ'} — ${s.pjName || 'document'} (${formatDateFR(s.date)}) — ${pjFilename(s)}`)
    .join('\n')
  const ok = await copyToClipboard(text)
  ui.toast(ok ? `Bordereau copié (${attachments.value.length} pièces)` : 'Copie impossible', { type: ok ? 'info' : 'error' })
}
</script>

<template>
  <section v-if="active" class="card card-pad">
    <div class="sec-head">
      <span class="sec-bar no-print green" />
      <h2>5. Bordereau des pièces jointes</h2>
      <span class="badge">{{ attachments.length }} pièce(s)</span>
      <span class="grow" />
      <div class="row no-print">
        <button class="btn btn-sm" title="Renuméroter dans l'ordre chronologique" @click="renumberByDate">↻ Renuméroter par date</button>
        <button class="btn btn-sm" @click="copyAll">⧉ Copier le bordereau</button>
      </div>
    </div>

    <template v-if="attachments.length">
      <p class="drag-hint no-print">⠿ Glissez une pièce pour changer son numéro : l'ensemble du bordereau est renuméroté.</p>
      <draggable
        v-model="list"
        class="bordereau"
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
          <div class="pj-card">
            <div class="pj-head">
              <button class="drag-handle no-print" title="Glisser pour renuméroter">⠿</button>
              <span class="badge badge-ECHEANCE nowrap">{{ element.pjCode || 'PJ' }}</span>
              <span class="pj-title">{{ element.pjName || 'Document' }}</span>
              <span class="pj-acts no-print">
                <button class="btn btn-sm btn-ghost" title="Copier le nom de fichier" @click="copyOne(element)">⧉</button>
                <button class="btn btn-sm btn-ghost" title="Ouvrir l'étape rattachée" @click="ui.openDrawer(element)">✎</button>
                <button class="btn btn-sm btn-ghost btn-danger" title="Détacher cette pièce (l'étape est conservée)" @click="detach(element)">✕</button>
              </span>
            </div>
            <div class="mono">{{ pjFilename(element) }}</div>
            <div class="xsmall muted pj-origin">
              {{ formatDateFR(element.date) }} · {{ element.fact.slice(0, 70) }}{{ element.fact.length > 70 ? '…' : '' }}
            </div>
          </div>
        </template>
      </draggable>
    </template>

    <div v-else class="empty">
      <b>Aucune pièce numérotée</b>
      Un gestionnaire ne valide que ce qui est prouvé : rattachez une pièce (PJ-01, PJ-02…) à chaque fait clé.
    </div>

    <p class="small muted footnote">
      Chaque pièce est rattachée à une étape de la chronologie : <b>✕ la détache</b> (l'étape, elle, est conservée),
      <b>✎ ouvre l'étape</b> pour la modifier. Renommez vos fichiers avec le nom généré ci-dessus : l'assureur
      retrouve immédiatement la pièce citée dans la chronologie.
    </p>
  </section>
</template>

<style scoped>
.green { background: var(--green); }
.pj-card { flex-direction: column; gap: 5px; }
.pj-head { display: flex; align-items: center; gap: 8px; width: 100%; }
.pj-title { font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pj-origin { margin-top: 1px; }
.pj-acts { display: flex; gap: 1px; margin-left: auto; opacity: .55; transition: opacity .14s; }
.pj-card:hover .pj-acts, .pj-card:focus-within .pj-acts { opacity: 1; }
.footnote { margin-top: 11px; }
</style>
