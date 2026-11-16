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
  <BaseDialog title="☁ Synchronisation" subtitle="automatique, chiffrée de bout en bout — le serveur ne peut pas lire vos dossiers" @close="close">
    <div class="stack">
      <p v-if="!hosted" class="small warn-box">
        ⚠ Ouvert en local (fichier) : la synchronisation n'est disponible que sur la version hébergée
        (même origine que l'API <code>/api/sync</code>).
      </p>

      <p class="small">
        Réglage <b>une seule fois par appareil</b> : ensuite l'application se synchronise toute seule avec le KV
        Cloudflare (au démarrage, au retour sur l'onglet, chaque minute et quelques secondes après chaque modification).
      </p>

      <label class="field">
        <span>Jeton d'accès au serveur</span>
        <input v-model="tokenInput" type="password" autocomplete="off" placeholder="VUEJS_ASSURANCE_TOKEN défini sur le Worker">
        <span class="xsmall muted">Celui défini par <code>wrangler secret put VUEJS_ASSURANCE_TOKEN</code>. Mémorisé dans ce navigateur, jamais exporté.</span>
      </label>

      <label class="field">
        <span>Passphrase de chiffrement</span>
        <input v-model="passInput" type="password" autocomplete="off" placeholder="Longue phrase, identique sur chaque appareil">
        <span class="xsmall muted">
          Chiffre la base <b>dans le navigateur</b> (AES-GCM) avant envoi ; le serveur ne voit jamais la passphrase.
          Elle est mémorisée dans ce navigateur (comme vos dossiers) pour que tout soit automatique.
          Perdue sur tous les appareils = sauvegardes distantes illisibles (vos exports .json restent la porte de sortie).
        </span>
      </label>

      <label class="check">
        <input type="checkbox" :checked="ui.syncAuto" @change="ui.setSyncAuto($event.target.checked)">
        <span>Synchronisation automatique</span>
      </label>

      <div class="row">
        <button v-if="dirty || !ui.syncRev" class="btn btn-primary" :disabled="!ready || busy" @click="saveAndSync">
          {{ busy ? 'Synchronisation…' : 'Enregistrer et synchroniser' }}
        </button>
        <button v-else class="btn btn-primary" :disabled="busy" @click="syncNowClick">
          {{ busy ? 'Synchronisation…' : '⟳ Synchroniser maintenant' }}
        </button>
        <span class="grow" />
        <span v-if="ui.syncRev" class="xsmall muted">révision {{ ui.syncRev }}<template v-if="ui.syncAt"> · {{ formatRelative(ui.syncAt) }}</template></span>
      </div>

      <p v-if="ui.syncError" class="small error-text">⚠ {{ ui.syncError }}</p>
      <p v-else-if="notice" class="small ok-text">✔ {{ notice }}</p>

      <p class="xsmall muted">
        La récupération <b>fusionne</b> (union dossier par dossier, étape par étape), elle n'écrase jamais
        l'état local, et une sauvegarde automatique est prise avant chaque fusion (Ctrl+Z pour annuler).
        En cas d'écriture simultanée depuis un autre appareil, la fusion se fait ici puis l'envoi reprend.
      </p>
    </div>
  </BaseDialog>
</template>

<style scoped>
.stack { display: flex; flex-direction: column; gap: 12px; }
.field > span:first-child {
  font-size: 10.5px; font-weight: 650; text-transform: uppercase;
  letter-spacing: .06em; color: var(--text-faint);
}
.check { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.error-text { color: var(--red); }
.ok-text { color: var(--green); }
.warn-box {
  background: var(--amber-soft); border: 1px solid color-mix(in srgb, var(--amber) 35%, transparent);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
</style>
