<script setup>
import { storeToRefs } from 'pinia'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { useTimeline } from '@/composables/useTimeline.js'
import { formatCurrency } from '@/lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()
const { active } = storeToRefs(store)
const { kpis } = useTimeline()
</script>

<template>
  <section v-if="active" class="card card-pad">
    <div class="sec-head">
      <span class="sec-bar no-print" />
      <h2>1. Synthèse du dossier</h2>
      <span class="grow" />
      <span v-if="active.meta.deductible" class="badge">Franchise : {{ active.meta.deductible }}</span>
      <button class="btn btn-sm no-print" :title="ui.showKpis ? 'Masquer les indicateurs' : 'Afficher les indicateurs'" @click="ui.toggleKpis()">
        {{ ui.showKpis ? '▾' : '▸' }} Indicateurs
      </button>
    </div>

    <div class="grid-2 meta-grid">
      <label class="field full">
        <span>Projet / opération</span>
        <input v-model="active.meta.project" placeholder="Ex : Extension ossature + pose d'ITE sur l'ancien bâti">
      </label>
      <label class="field">
        <span>Référence sinistre / contrat</span>
        <input v-model="active.meta.ref" placeholder="Ex : Sinistre #2026-94810 / Contrat MRH-774201">
      </label>
      <label class="field">
        <span>Parties concernées</span>
        <input v-model="active.meta.parties" placeholder="Ex : M. Martin (assuré) / Syndic GestiCopro">
      </label>
      <label class="field">
        <span>Assureur / gestionnaire</span>
        <input v-model="active.meta.insurer" placeholder="Ex : Mutuelle X — M. Durand">
      </label>
      <label class="field">
        <span>Franchise contractuelle</span>
        <input v-model="active.meta.deductible" placeholder="Ex : 150 € (dégât des eaux)">
      </label>
      <label class="field full">
        <span>Objet du sinistre (1 à 2 phrases factuelles)</span>
        <textarea v-model="active.meta.object" rows="2" placeholder="Ex : Dégât des eaux par infiltration au plafond du séjour suite à une fuite sur canalisation encastrée." />
      </label>
      <label class="field full">
        <span>État / point de blocage actuel</span>
        <input v-model="active.meta.status" placeholder="Ex : Attente de validation du devis de remise en état (1 840 €)">
      </label>
    </div>

    <div v-if="ui.showKpis" class="kpis">
      <div class="kpi">
        <div class="k-label">Sommes engagées</div>
        <div class="k-value">{{ formatCurrency(kpis.total) }}</div>
        <div class="k-sub">{{ kpis.counted }} ligne(s) chiffrée(s)</div>
      </div>
      <div class="kpi">
        <div class="k-label">Événements</div>
        <div class="k-value">{{ kpis.events }}</div>
        <div class="k-sub">{{ kpis.spanDays === null ? 'dossier vide' : `sur ${kpis.spanDays} jours` }}</div>
      </div>
      <div class="kpi" :class="{ alert: kpis.missingPj > 0 }">
        <div class="k-label">Pièces jointes</div>
        <div class="k-value">{{ kpis.pj }}</div>
        <div class="k-sub">{{ kpis.missingPj }} fait(s) sans preuve</div>
      </div>
      <div class="kpi" :class="{ alert: kpis.open > 0 }">
        <div class="k-label">Questions ouvertes</div>
        <div class="k-value">{{ kpis.open }}</div>
        <div class="k-sub">en attente de position écrite</div>
      </div>
      <div class="kpi" :class="{ alert: kpis.silenceDays !== null && kpis.silenceDays >= 15 }">
        <div class="k-label">Dernier mouvement</div>
        <div class="k-value">{{ kpis.silenceDays === null ? '—' : `J+${kpis.silenceDays}` }}</div>
        <div class="k-sub">
          {{ kpis.silenceDays === null ? 'aucun événement' : kpis.silenceDays >= 15 ? 'relance recommandée' : 'dossier actif' }}
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.meta-grid { margin-bottom: 12px; }
.full { grid-column: 1 / -1; }
.field > span {
  font-size: 10.5px; font-weight: 650; text-transform: uppercase;
  letter-spacing: .06em; color: var(--text-faint);
}
</style>
