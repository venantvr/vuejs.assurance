<script setup>
/**
 * Parties au dossier : noms, coordonnées, identifiants et références de chaque
 * intervenant. Imprimé en tête du dossier, repris dans le courrier généré.
 */
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import draggable from 'vuedraggable'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { PARTY_ROLES } from '@/lib/model.js'
import { copyToClipboard } from '@/lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()
const { active, parties } = storeToRefs(store)

const list = computed({
  get: () => parties.value,
  set: (next) => store.reorderParties(next.map((p) => p.id))
})

/** Rôles proposés en un clic, sans ceux déjà présents. */
const quickRoles = computed(() => {
  const taken = new Set(parties.value.map((p) => p.role.toLowerCase()))
  return PARTY_ROLES.slice(0, 6).filter((r) => !taken.has(r.toLowerCase()))
})

function add (role = '') {
  store.addParty({ role })
}

function remove (party) {
  store.removeParty(party.id)
  ui.toast(`Partie « ${party.role || party.name || 'sans nom'} » retirée — Ctrl+Z pour annuler`)
}

/** Une partie sans aucun contenu n'a rien à faire sur le document imprimé. */
const isEmpty = (p) => !['role', 'name', 'address', 'identifiers', 'references', 'contact', 'notes'].some((k) => (p[k] || '').trim())

function asText (p) {
  return [p.role && `${p.role} :`, p.name, p.address, p.identifiers, p.references, p.contact, p.notes]
    .filter(Boolean).join('\n')
}

async function copyAll () {
  const text = parties.value.map(asText).join('\n\n')
  const ok = await copyToClipboard(text)
  ui.toast(ok ? 'Coordonnées des parties copiées' : 'Copie impossible', { type: ok ? 'info' : 'error' })
}
</script>

<template>
  <section v-if="active" class="card card-pad" :class="{ 'print-hide': !parties.some((p) => !isEmpty(p)) }">
    <div class="sec-head">
      <span class="sec-bar no-print" />
      <h2>3. Parties &amp; coordonnées</h2>
      <span class="badge no-print">{{ parties.length }} partie(s)</span>
      <span class="grow" />
      <div class="row no-print">
        <button class="btn btn-sm" :disabled="!parties.length" @click="copyAll">⧉ Copier le bloc</button>
        <button class="btn btn-sm btn-primary" @click="add()">＋ Partie</button>
      </div>
    </div>

    <div v-if="quickRoles.length" class="row no-print quick">
      <span class="xsmall muted">Ajouter :</span>
      <button v-for="role in quickRoles" :key="role" class="chip" @click="add(role)">＋ {{ role }}</button>
    </div>

    <datalist id="party-roles">
      <option v-for="role in PARTY_ROLES" :key="role" :value="role" />
    </datalist>

    <draggable
      v-if="parties.length"
      v-model="list"
      class="parties"
      item-key="id"
      handle=".drag-handle"
      :animation="180"
      :force-fallback="true"
      fallback-class="sortable-drag"
      :fallback-tolerance="3"
      ghost-class="sortable-ghost"
      drag-class="sortable-drag"
    >
      <template #item="{ element: p }">
        <div class="party-card" :class="{ 'print-hide': isEmpty(p) }">
          <div class="party-head">
            <button class="drag-handle no-print" title="Glisser pour réordonner">⠿</button>
            <input
              class="party-role"
              :value="p.role"
              list="party-roles"
              placeholder="Rôle — ex : MOE, Assurance MOE…"
              @input="store.updateParty(p.id, { role: $event.target.value })"
            >
            <button class="btn btn-sm btn-ghost btn-danger no-print" title="Retirer cette partie" @click="remove(p)">✕</button>
          </div>
          <input class="field-row" :value="p.name" placeholder="Nom / raison sociale" @input="store.updateParty(p.id, { name: $event.target.value })">
          <textarea class="field-row" :value="p.address" rows="2" placeholder="Adresse" @input="store.updateParty(p.id, { address: $event.target.value })" />
          <input class="field-row" :value="p.identifiers" placeholder="Identifiants — SIRET, SIREN, RCS…" @input="store.updateParty(p.id, { identifiers: $event.target.value })">
          <input class="field-row" :value="p.references" placeholder="Références — n° de contrat, de sinistre, d'assuré…" @input="store.updateParty(p.id, { references: $event.target.value })">
          <input class="field-row" :value="p.contact" placeholder="Contact — interlocuteur, téléphone, e-mail" @input="store.updateParty(p.id, { contact: $event.target.value })">
          <input class="field-row" :value="p.notes" placeholder="Notes" @input="store.updateParty(p.id, { notes: $event.target.value })">

          <!-- rendu compact à l'impression -->
          <div class="party-print">
            <b>{{ p.role }}<template v-if="p.role && p.name"> — </template>{{ p.name }}</b>
            <div v-if="p.address">{{ p.address }}</div>
            <div v-if="p.identifiers">{{ p.identifiers }}</div>
            <div v-if="p.references">{{ p.references }}</div>
            <div v-if="p.contact">{{ p.contact }}</div>
            <div v-if="p.notes">{{ p.notes }}</div>
          </div>
        </div>
      </template>
    </draggable>

    <div v-else class="empty">
      <b>Aucune partie renseignée</b>
      Maître d'ouvrage, maître d'œuvre, entreprises, assureurs, experts : nom, adresse, SIRET, n° de contrat et de
      sinistre — tout ce que l'assureur et l'expert redemanderont.
    </div>
  </section>
</template>

<style scoped>
.quick { margin-bottom: 12px; }
</style>
