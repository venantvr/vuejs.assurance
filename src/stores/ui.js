/**
 * Store d'interface : thème, filtres, dialogues, notifications.
 */
import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { loadPrefs, savePrefs } from '@/lib/storage.js'

export const useUiStore = defineStore('ui', () => {
  const prefs = loadPrefs()

  const theme = ref(prefs.theme === 'dark' ? 'dark' : 'light')
  const density = ref(prefs.density === 'compact' ? 'compact' : 'cosy')

  // Filtres de la chronologie
  const search = ref('')
  const category = ref('ALL')
  const onlyOpenQuestions = ref(false)
  const onlyWithoutPj = ref(false)

  // Dialogues
  const dialog = ref(null) // 'presets' | 'new-dossier' | 'help' | 'mail'
  const drawerStep = ref(null)
  const confirmBox = ref(null)
  const toasts = ref([])

  let toastSeq = 0

  const filtersActive = computed(
    () => Boolean(search.value.trim()) || category.value !== 'ALL' || onlyOpenQuestions.value || onlyWithoutPj.value
  )

  watch(theme, (value) => {
    document.documentElement.setAttribute('data-theme', value)
    savePrefs({ ...loadPrefs(), theme: value })
  }, { immediate: true })

  watch(density, (value) => {
    document.documentElement.setAttribute('data-density', value)
    savePrefs({ ...loadPrefs(), density: value })
  }, { immediate: true })

  function toggleTheme () {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  function toggleDensity () {
    density.value = density.value === 'compact' ? 'cosy' : 'compact'
  }

  function resetFilters () {
    search.value = ''
    category.value = 'ALL'
    onlyOpenQuestions.value = false
    onlyWithoutPj.value = false
  }

  function toast (message, { type = 'info', duration } = {}) {
    const id = ++toastSeq
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, duration ?? (type === 'error' ? 6000 : 2800))
    return id
  }

  function dismissToast (id) {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function openDialog (name) { dialog.value = name }
  function closeDialog () { dialog.value = null }

  function openDrawer (step) { drawerStep.value = step }
  function closeDrawer () { drawerStep.value = null }

  function confirm ({ title, message, confirmLabel = 'Confirmer', danger = true, onConfirm }) {
    confirmBox.value = { title, message, confirmLabel, danger, onConfirm }
  }

  function resolveConfirm (accepted) {
    const box = confirmBox.value
    confirmBox.value = null
    if (accepted) box?.onConfirm?.()
  }

  /** Ferme le premier calque ouvert ; indique si quelque chose a été fermé. */
  function closeTopLayer () {
    if (confirmBox.value) { confirmBox.value = null; return true }
    if (dialog.value) { dialog.value = null; return true }
    if (drawerStep.value) { drawerStep.value = null; return true }
    return false
  }

  const hasOverlay = computed(() => Boolean(confirmBox.value || dialog.value || drawerStep.value))

  return {
    theme,
    density,
    search,
    category,
    onlyOpenQuestions,
    onlyWithoutPj,
    filtersActive,
    dialog,
    drawerStep,
    confirmBox,
    toasts,
    hasOverlay,
    toggleTheme,
    toggleDensity,
    resetFilters,
    toast,
    dismissToast,
    openDialog,
    closeDialog,
    openDrawer,
    closeDrawer,
    confirm,
    resolveConfirm,
    closeTopLayer
  }
})
