<script setup>
defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
  width: { type: String, default: '680px' }
})
const emit = defineEmits(['close'])
</script>

<template>
  <div class="scrim no-print" @click.self="emit('close')">
    <div class="modal" :style="{ width: `min(${width}, 100%)` }" role="dialog" aria-modal="true">
      <header class="dlg-head">
        <h3>{{ title }}</h3>
        <span v-if="subtitle" class="muted small">{{ subtitle }}</span>
        <span class="grow" />
        <slot name="head-actions" />
        <button class="btn btn-ghost btn-icon" title="Fermer (Échap)" @click="emit('close')">✕</button>
      </header>

      <div class="dlg-body">
        <slot />
      </div>

      <footer v-if="$slots.footer" class="dlg-foot">
        <slot name="footer" />
      </footer>
    </div>
  </div>
</template>
