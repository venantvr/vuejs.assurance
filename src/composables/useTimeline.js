/** Dérivations de la chronologie : filtres, indicateurs, écarts de délai. */
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { daysBetween, todayISO } from '@/lib/model.js'

export function useTimeline () {
  const dossiersStore = useDossiersStore()
  const ui = useUiStore()
  const { active, orderedSteps } = storeToRefs(dossiersStore)

  const visibleSteps = computed(() => {
    const needle = ui.search.trim().toLowerCase()
    return orderedSteps.value.filter((step) => {
      if (ui.category !== 'ALL' && step.category !== ui.category) return false
      if (ui.onlyOpenQuestions && !(step.question?.trim() && !step.questionResolved)) return false
      if (ui.onlyWithoutPj && (step.pjCode || step.pjName)) return false
      if (!needle) return true
      const haystack = [step.fact, (step.actors || []).join(' '), step.impact, step.pjCode, step.pjName, step.question, step.questionAnswer, step.date]
        .join(' ').toLowerCase()
      return haystack.includes(needle)
    })
  })

  const countByCategory = computed(() => {
    const counts = {}
    for (const step of active.value?.steps || []) {
      counts[step.category] = (counts[step.category] || 0) + 1
    }
    return counts
  })

  const openQuestions = computed(() => {
    const dossier = active.value
    if (!dossier) return []
    const fromSteps = orderedSteps.value
      .filter((s) => s.question?.trim())
      .map((s) => ({ kind: 'step', id: s.id, date: s.date, text: s.question, resolved: s.questionResolved, answer: s.questionAnswer }))
    const globals = [...dossier.globalQuestions]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((q) => ({ kind: 'global', id: q.id, date: null, text: q.text, resolved: q.status === 'RESOLVED', answer: q.answer }))
    return [...fromSteps, ...globals]
  })

  const kpis = computed(() => {
    const dossier = active.value
    if (!dossier) {
      return { total: 0, counted: 0, events: 0, pj: 0, missingPj: 0, open: 0, spanDays: null, silenceDays: null }
    }
    let total = 0
    let counted = 0
    let pj = 0
    let open = 0
    for (const step of dossier.steps) {
      const amount = Number.parseFloat(step.amount) || 0
      if (amount) { total += amount; counted += 1 }
      if (step.pjCode || step.pjName) pj += 1
      if (step.question?.trim() && !step.questionResolved) open += 1
    }
    for (const q of dossier.globalQuestions) {
      if (q.status !== 'RESOLVED' && q.text.trim()) open += 1
    }
    const dates = dossier.steps.map((s) => s.date).filter(Boolean).sort()
    const spanDays = dates.length ? daysBetween(dates[0], dates[dates.length - 1]) : null
    const rawSilence = dates.length ? daysBetween(dates[dates.length - 1], todayISO()) : null
    return {
      total,
      counted,
      events: dossier.steps.length,
      pj,
      missingPj: dossier.steps.length - pj,
      open,
      spanDays,
      silenceDays: rawSilence === null ? null : Math.max(0, rawSilence)
    }
  })

  /** Écart en jours entre l'étape affichée et la précédente (null si < 2 jours). */
  function gapBefore (index) {
    if (index <= 0) return null
    const previous = visibleSteps.value[index - 1]
    const current = visibleSteps.value[index]
    if (!previous || !current) return null
    const gap = daysBetween(previous.date, current.date)
    if (gap === null) return null
    const abs = Math.abs(gap)
    return abs >= 2 ? abs : null
  }

  return { visibleSteps, countByCategory, openQuestions, kpis, gapBefore }
}
