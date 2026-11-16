<script setup>
/**
 * Synchronisation chiffrée de bout en bout avec le KV Cloudflare (/api/sync).
 *
 * Réglage unique par appareil (jeton + passphrase) ; ensuite tout est automatique
 * (voir useAutoSync). La base est chiffrée DANS le navigateur (AES-GCM) avant
 * envoi ; la récupération déchiffre puis fusionne sans rien perdre.
 */
import { computed, ref } from 'vue'
import BaseDialog from '../BaseDialog.vue'
import { useUiStore } from '@/stores/ui.js'
import { useAutoSync, isHosted } from '@/composables/useAutoSync.js'
import { formatRelative } from '@/lib/format.js'

const ui = useUiStore()
const sync = useAutoSync()

const tokenInput = ref(ui.syncToken)
const passInput = ref(ui.syncPassphrase)
const notice = ref('')
const showSecrets = ref(false)

const hosted = isHosted()
const dirty = computed(() => tokenInput.value.trim() !== ui.syncToken || passInput.value !== ui.syncPassphrase)
const ready = computed(() => Boolean(tokenInput.value.trim() && passInput.value.trim()))
const busy = computed(() => ui.syncStatus === 'syncing')

function close () {
  ui.closeDialog()
}

function save () {
  ui.setSyncToken(tokenInput.value)
  ui.setSyncPassphrase(passInput.value)
}

async function saveAndSync () {
  if (!ready.value) return
  save()
  const res = await sync.syncNow({ force: true })
  notice.value = res.ok ? res.message : ''
}

async function syncNowClick () {
  if (dirty.value) save()
  const res = await sync.syncNow({ force: true })
  notice.value = res.ok ? res.message : ''
}
</script>

<template>
  <BaseDialog title="☁ Synchronisation" width="520px" @close="close">
    <div class="stack">
      <p v-if="!hosted" class="warn-box small">
        ⚠ Ouvert en local : la synchronisation n'existe que sur la version hébergée.
      </p>

      <p class="lead">
        À régler <b>une fois par appareil</b>. Ensuite tout est automatique, chiffré
        dans le navigateur : le serveur ne peut pas lire vos dossiers.
      </p>

      <div class="field">
        <label for="sync-token">Jeton du serveur</label>
        <div class="secret">
          <input id="sync-token" v-model="tokenInput" :type="showSecrets ? 'text' : 'password'" autocomplete="off" placeholder="VUEJS_ASSURANCE_TOKEN">
        </div>
        <small>Défini avec <code>wrangler secret put VUEJS_ASSURANCE_TOKEN</code>.</small>
      </div>

      <div class="field">
        <label for="sync-pass">Passphrase de chiffrement</label>
        <div class="secret">
          <input id="sync-pass" v-model="passInput" :type="showSecrets ? 'text' : 'password'" autocomplete="off" placeholder="Identique sur chaque appareil">
        </div>
        <small>Perdue sur tous les appareils, les sauvegardes distantes sont illisibles (vos exports .json restent valables).</small>
      </div>

      <div class="options">
        <label class="toggle">
          <input type="checkbox" :checked="ui.syncAuto" @change="ui.setSyncAuto($event.target.checked)">
          <span>Synchroniser automatiquement</span>
        </label>
        <label class="toggle">
          <input v-model="showSecrets" type="checkbox">
          <span>Afficher les secrets</span>
        </label>
      </div>

      <p v-if="ui.syncError" class="msg error-text">⚠ {{ ui.syncError }}</p>
      <p v-else-if="notice" class="msg ok-text">✔ {{ notice }}</p>
      <p v-else-if="ui.syncRev" class="msg muted">
        Dernière synchro : révision {{ ui.syncRev }}<template v-if="ui.syncAt"> · {{ formatRelative(ui.syncAt) }}</template>
      </p>
    </div>

    <template #footer>
      <button class="btn" @click="close">Fermer</button>
      <span class="grow" />
      <button v-if="dirty || !ui.syncRev" class="btn btn-primary" :disabled="!ready || busy" @click="saveAndSync">
        {{ busy ? 'Synchronisation…' : 'Enregistrer et synchroniser' }}
      </button>
      <button v-else class="btn btn-primary" :disabled="busy" @click="syncNowClick">
        {{ busy ? 'Synchronisation…' : '⟳ Synchroniser maintenant' }}
      </button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.stack { display: flex; flex-direction: column; gap: 16px; }
.lead { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--text-soft, var(--text)); }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label {
  font-size: 11px; font-weight: 650; text-transform: uppercase;
  letter-spacing: .06em; color: var(--text-faint);
}
.field input { width: 100%; }
@media (min-width: 641px) {
  .secret input { font-size: 12px; padding: 6px 9px; }
}
.secret input { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.secret input::placeholder { font-family: inherit; }
.field small { font-size: 11.5px; line-height: 1.4; color: var(--text-faint); }
.options { display: flex; flex-wrap: wrap; gap: 8px 22px; }
.toggle {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 13px; cursor: pointer; width: auto; margin: 0;
}
.toggle input { width: auto; margin: 0; }
.msg { margin: 0; font-size: 13px; }
.error-text { color: var(--red); }
.ok-text { color: var(--green); }
.warn-box {
  margin: 0; background: var(--amber-soft); border: 1px solid color-mix(in srgb, var(--amber) 35%, transparent);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
</style>
