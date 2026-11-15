/**
 * Installation de l'application (PWA). L'événement `beforeinstallprompt` n'est
 * émis qu'une fois, tôt : l'écoute est donc posée dès l'import de ce module
 * (depuis main.js), pas à l'ouverture d'un menu.
 */
import { computed, ref } from 'vue'

const deferred = ref(null)
const installed = ref(false)

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

if (typeof window !== 'undefined') {
  installed.value = isStandalone()
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()          // on propose l'installation depuis notre menu, pas en bandeau
    deferred.value = event
  })
  window.addEventListener('appinstalled', () => {
    installed.value = true
    deferred.value = null
  })
}

export function useInstall () {
  const canInstall = computed(() => Boolean(deferred.value) && !installed.value)

  /** Ouvre la boîte d'installation du navigateur. Retourne 'accepted' | 'dismissed' | 'unavailable'. */
  async function install () {
    const event = deferred.value
    if (!event) return 'unavailable'
    event.prompt()
    const { outcome } = await event.userChoice
    deferred.value = null
    return outcome
  }

  return { canInstall, installed, install }
}
