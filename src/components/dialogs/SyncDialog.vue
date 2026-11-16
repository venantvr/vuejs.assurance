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
import { useDossiersStore } from '@/stores/dossiers.js'
import { decryptJson } from '@/lib/crypto.js'
import { listRevisions, fetchRevision } from '@/lib/sync.js'
import { formatRelative } from '@/lib/format.js'

const ui = useUiStore()
const store = useDossiersStore()
const sync = useAutoSync()

/* ---- historique distant ---- */
const history = ref(null)       // null = pas chargé ; sinon { revisions, retentionDays }
const historyBusy = ref(false)
const historyError = ref('')
const restoring = ref(0)

async function loadHistory () {
  if (!ui.syncToken.trim()) { historyError.value = 'Renseignez d\'abord le jeton'; return }
  historyBusy.value = true
  historyError.value = ''
  const res = await listRevisions(ui.syncToken)
  historyBusy.value = false
  if (!res.ok) { historyError.value = res.error; return }
  history.value = res
}

async function restoreRevision (item) {
  if (restoring.value) return
  restoring.value = item.rev
  historyError.value = ''
  try {
    const res = await fetchRevision(ui.syncToken, item.rev)
    if (!res.ok) throw new Error(res.error)
    let db
    try { db = await decryptJson(ui.syncPassphrase, res.envelope) } catch { throw new Error('Déchiffrement impossible : mauvaise passphrase pour cette révision') }
    const out = store.restoreBackup({ at: res.savedAt || item.savedAt, json: JSON.stringify(db) })
    notice.value = out?.ok === false
      ? ''
      : `Révision ${item.rev} ajoutée en copies datées (rien n'a été écrasé)`
    if (out?.ok === false) historyError.value = out.error || 'Révision non reconnue'
  } catch (e) {
    historyError.value = String(e?.message || e)
  } finally {
    restoring.value = 0
  }
}

function fmtSize (n) {
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`
}
function fmtDate (iso) {
  return iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'
}

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

      <section class="history">
        <div class="h-head">
          <b>Historique distant</b>
          <span class="grow" />
          <button class="btn btn-sm" :disabled="historyBusy" @click="loadHistory">
            {{ historyBusy ? 'Chargement…' : history ? '⟳ Actualiser' : 'Afficher' }}
          </button>
        </div>
        <p v-if="historyError" class="msg error-text">⚠ {{ historyError }}</p>
        <template v-if="history">
          <p v-if="!history.revisions.length" class="msg muted">Aucune révision conservée.</p>
          <ul v-else class="revs">
            <li v-for="item in history.revisions" :key="item.rev">
              <span class="rev-n">#{{ item.rev }}</span>
              <span class="rev-d">{{ fmtDate(item.savedAt) }}</span>
              <span class="muted xsmall">{{ fmtSize(item.size) }}</span>
              <span class="grow" />
              <button class="btn btn-sm" :disabled="Boolean(restoring)" title="Ajoute les dossiers de cette révision en copies datées, sans rien écraser" @click="restoreRevision(item)">
                {{ restoring === item.rev ? '…' : 'Restaurer en copies' }}
              </button>
            </li>
          </ul>
          <p class="xsmall muted">Révisions conservées sans limite de durée : une par heure d'activité (la dernière de l'heure).</p>
        </template>
      </section>
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
.history { border-top: 1px solid var(--border); padding-top: 14px; display: flex; flex-direction: column; gap: 8px; }
.h-head { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.revs { list-style: none; margin: 0; padding: 0; max-height: 200px; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.revs li { display: flex; align-items: center; gap: 10px; padding: 6px 10px; font-size: 12.5px; }
.revs li + li { border-top: 1px solid var(--border); }
.rev-n { font-weight: 650; min-width: 38px; }
.msg { margin: 0; font-size: 13px; }
.error-text { color: var(--red); }
.ok-text { color: var(--green); }
.warn-box {
  margin: 0; background: var(--amber-soft); border: 1px solid color-mix(in srgb, var(--amber) 35%, transparent);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
</style>
