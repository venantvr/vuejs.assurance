/** Déclenche un callback sur un clic en dehors d'un élément. */
import { onBeforeUnmount, onMounted, unref } from 'vue'

export function onClickOutside (elementRef, handler) {
  function onPointerDown (event) {
    const el = unref(elementRef)
    if (!el || el.contains(event.target)) return
    handler(event)
  }
  onMounted(() => document.addEventListener('pointerdown', onPointerDown, true))
  onBeforeUnmount(() => document.removeEventListener('pointerdown', onPointerDown, true))
}
