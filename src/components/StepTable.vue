<script setup>
import { computed } from 'vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { formatCurrency, formatDateFR } from '@/lib/format.js'
import { actorsLabel, channelOf } from '@/lib/model.js'

const props = defineProps({ steps: { type: Array, required: true } })
const store = useDossiersStore()
defineEmits(['edit', 'remove'])

const total = computed(() => props.steps.reduce((sum, s) => sum + (Number.parseFloat(s.amount) || 0), 0))
</script>

<template>
  <div class="tbl-wrap">
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Catégorie</th><th>Fait constaté</th><th>Acteur</th>
          <th>Canal</th><th class="num">Montant</th><th>Impact</th><th>PJ</th><th class="no-print" />
        </tr>
      </thead>
      <tbody>
        <tr v-for="step in steps" :key="step.id">
          <td class="nowrap">
            {{ formatDateFR(step.date) }}<br><span class="xsmall muted">{{ step.time }}</span>
          </td>
          <td>
            <span class="badge cat-badge" :style="{ '--cat': store.category(step.category).color }">
              {{ store.category(step.category).short }}
            </span>
          </td>
          <td class="fact">
            {{ step.fact }}
            <div v-if="step.question && !step.questionResolved" class="xsmall pending">● {{ step.question }}</div>
          </td>
          <td>{{ actorsLabel(step) }}</td>
          <td class="nowrap">{{ channelOf(step.channel) ? `${channelOf(step.channel).icon} ${channelOf(step.channel).short}` : '—' }}</td>
          <td class="num">{{ Number.parseFloat(step.amount) ? formatCurrency(step.amount) : '—' }}</td>
          <td>{{ step.impact }}</td>
          <td class="nowrap">{{ step.pjCode || '—' }}</td>
          <td class="no-print nowrap">
            <button class="btn btn-sm btn-ghost" title="Modifier" @click="$emit('edit', step)">✎</button>
            <button class="btn btn-sm btn-ghost btn-danger" title="Supprimer" @click="$emit('remove', step)">🗑</button>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="5" class="total-label">Total chiffré</td>
          <td class="num total-value">{{ formatCurrency(total) }}</td>
          <td colspan="3" />
        </tr>
      </tfoot>
    </table>
  </div>
</template>

<style scoped>
.fact { min-width: 260px; }
.pending { color: var(--violet); margin-top: 4px; }
.total-label { text-align: right; font-weight: 650; }
.total-value { font-weight: 700; }
</style>
