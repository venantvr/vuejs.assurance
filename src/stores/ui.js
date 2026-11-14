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
  // Bandeau d'indicateurs : masqué par défaut, l'essentiel est déjà dans la chronologie
  const showKpis = ref(prefs.showKpis === true)
  /** Écarts de temps entre étapes : affichés par défaut, désactivables. */
  const showGaps = ref(prefs.showGaps !== false)
  /**
   * Jeton d'accès Google Drive (lecture). Préférence locale du navigateur :
   * jamais inclus dans la base, les exports .json ou le courrier généré.
   */
  const driveToken = ref(typeof prefs.driveToken === 'string' ? prefs.driveToken : '')
  /** Date d'expiration du jeton Drive (ms epoch), 0 si inconnue. */
  const driveTokenExpiresAt = ref(Number(prefs.driveTokenExpiresAt) || 0)
  /**
   * Client ID OAuth (type « Application Web ») pour la connexion Google en un
   * clic. Identifiant public par conception, stocké ici, dans ce navigateur :
   * jamais dans le code, la base, les exports.
   */
  const driveClientId = ref(typeof prefs.driveClientId === 'string' ? prefs.driveClientId : '')
  /** Jeton d'accès à l'API de synchronisation (préférence locale, jamais exportée). */
  const syncToken = ref(typeof prefs.syncToken === 'string' ? prefs.syncToken : '')
  /** Dernière révision serveur connue (gestion des écritures concurrentes). */
  const syncRev = ref(Number.isFinite(prefs.syncRev) ? prefs.syncRev : 0)
  const syncAt = ref(typeof prefs.syncAt === 'string' ? prefs.syncAt : '')
  /** Passphrase de chiffrement : EN MÉMOIRE SEULEMENT, jamais stockée nulle part. */
  const syncPassphrase = ref('')

  // Filtres de la chronologie
  const search = ref('')
  const category = ref('ALL')
  const onlyOpenQuestions = ref(false)
  const onlyWithoutPj = ref(false)
  const channel = ref('ALL')

  // Dialogues
  const dialog = ref(null) // 'presets' | 'new-dossier' | 'help' | 'mail'
  const drawerStep = ref(null)
  const confirmBox = ref(null)
  const toasts = ref([])

  let toastSeq = 0

  const filtersActive = computed(
    () => Boolean(search.value.trim()) || category.value !== 'ALL' || channel.value !== 'ALL' || onlyOpenQuestions.value || onlyWithoutPj.value
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

  function toggleGaps () {
    showGaps.value = !showGaps.value
    savePrefs({ ...loadPrefs(), showGaps: showGaps.value })
  }

  function setDriveToken (value, expiresIn = 0) {
    driveToken.value = String(value || '').trim()
    driveTokenExpiresAt.value = driveToken.value && expiresIn ? Date.now() + expiresIn * 1000 : 0
    savePrefs({ ...loadPrefs(), driveToken: driveToken.value, driveTokenExpiresAt: driveTokenExpiresAt.value })
  }

  function setDriveClientId (value) {
    driveClientId.value = String(value || '').trim()
    savePrefs({ ...loadPrefs(), driveClientId: driveClientId.value })
  }

  /** Vrai si le jeton Drive est absent ou connu comme expiré (marge d'une minute). */
  const driveTokenStale = computed(() =>
    !driveToken.value || (driveTokenExpiresAt.value > 0 && Date.now() > driveTokenExpiresAt.value - 60_000)
  )

  function setSyncToken (value) {
    syncToken.value = String(value || '').trim()
    savePrefs({ ...loadPrefs(), syncToken: syncToken.value })
  }

  function setSyncState ({ rev, at } = {}) {
    if (Number.isFinite(rev)) syncRev.value = rev
    if (at !== undefined) syncAt.value = at || ''
    savePrefs({ ...loadPrefs(), syncRev: syncRev.value, syncAt: syncAt.value })
  }

  function toggleKpis () {
    showKpis.value = !showKpis.value
    savePrefs({ ...loadPrefs(), showKpis: showKpis.value })
  }

  function toggleDensity () {
    density.value = density.value === 'compact' ? 'cosy' : 'compact'
  }

  function resetFilters () {
    search.value = ''
    category.value = 'ALL'
    onlyOpenQuestions.value = false
    onlyWithoutPj.value = false
    channel.value = 'ALL'
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
    showKpis,
    showGaps,
    driveToken,
    driveTokenExpiresAt,
    driveTokenStale,
    driveClientId,
    setDriveToken,
    setDriveClientId,
    syncToken,
    setSyncToken,
    syncRev,
    syncAt,
    setSyncState,
    syncPassphrase,
    search,
    category,
    onlyOpenQuestions,
    onlyWithoutPj,
    channel,
    filtersActive,
    dialog,
    drawerStep,
    confirmBox,
    toasts,
    hasOverlay,
    toggleTheme,
    toggleDensity,
    toggleKpis,
    toggleGaps,
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
