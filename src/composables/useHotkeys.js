/** Raccourcis clavier globaux. */
import { onBeforeUnmount, onMounted } from 'vue'

function isTypingTarget (target) {
  const tag = (target?.tagName || '').toLowerCase()
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable
}

/**
 * @param {Record<string, (event: KeyboardEvent) => void>} handlers
 *   clés : 'escape', 'new', 'capture', 'search', 'help', 'save', 'undo', 'redo'
 */
export function useHotkeys (handlers) {
  function onKeydown (event) {
    const typing = isTypingTarget(event.target)

    if (event.key === 'Escape') {
      handlers.escape?.(event)
      if (typing) event.target.blur()
      return
    }

    const meta = event.ctrlKey || event.metaKey
    if (meta && event.key.toLowerCase() === 's') {
      event.preventDefault()
      handlers.save?.(event)
      return
    }
    if (meta && event.key.toLowerCase() === 'z') {
      if (typing) return
      event.preventDefault()
      if (event.shiftKey) handlers.redo?.(event)
      else handlers.undo?.(event)
      return
    }
    if (meta || event.altKey || typing) return

    switch (event.key) {
      case 'n': case 'N': event.preventDefault(); handlers.new?.(event); break
      case '/': event.preventDefault(); handlers.capture?.(event); break
      case 'f': case 'F': event.preventDefault(); handlers.search?.(event); break
      case '?': event.preventDefault(); handlers.help?.(event); break
      default: break
    }
  }

  onMounted(() => document.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
}
