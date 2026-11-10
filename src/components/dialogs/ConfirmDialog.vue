<script setup>
import { storeToRefs } from 'pinia'
import BaseDialog from '../BaseDialog.vue'
import { useUiStore } from '@/stores/ui.js'

const ui = useUiStore()
const { confirmBox } = storeToRefs(ui)
</script>

<template>
  <BaseDialog v-if="confirmBox" :title="confirmBox.title" width="470px" @close="ui.resolveConfirm(false)">
    <p class="message">{{ confirmBox.message }}</p>

    <template #footer>
      <button class="btn" :class="confirmBox.danger ? 'btn-danger' : 'btn-primary'" @click="ui.resolveConfirm(true)">
        {{ confirmBox.confirmLabel }}
      </button>
      <button class="btn" @click="ui.resolveConfirm(false)">Annuler</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.message { margin: 0; }
</style>
