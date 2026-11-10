<script setup>
import { storeToRefs } from 'pinia'
import { useUiStore } from '@/stores/ui.js'

const ui = useUiStore()
const { toasts } = storeToRefs(ui)
</script>

<template>
  <div class="toasts no-print" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast"
        :class="{ err: toast.type === 'error' }"
        @click="ui.dismissToast(toast.id)"
      >
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast { cursor: pointer; }
.toast-enter-active, .toast-leave-active { transition: opacity .18s ease, transform .18s ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(6px) scale(.97); }
</style>
