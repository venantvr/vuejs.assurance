import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/base.css'
import './composables/useInstall.js'

createApp(App).use(createPinia()).mount('#app')

// Hors ligne : service worker, en production et en https (ou localhost) uniquement.
if (import.meta.env.PROD && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* l'application fonctionne sans */ })
  })
}
