<script setup>
/**
 * Synchronisation chiffrée de bout en bout avec le Worker (/api/sync).
 *
 * La base est chiffrée DANS le navigateur (AES-GCM, passphrase jamais
 * stockée ni transmise) avant d'être envoyée ; la récupération déchiffre
 * puis fusionne sans rien perdre (mêmes règles que deux onglets).
 */
import { computed, ref } from 'vue'
import BaseDialog from '../BaseDialog.vue'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { encryptJson, decryptJson } from '@/lib/crypto.js'
import { pullRemote, pushRemote } from '@/lib/sync.js'
import { formatRelative } from '@/lib/format.js'

const store = useDossiersStore()
const ui = useUiStore()

const tokenInput = ref(ui.syncToken)
const busy = ref('') // '' | 'push' | 'pull'
const error = ref('')
const notice = ref('')

const ready = computed(() => Boolean(tokenInput.value.trim() && ui.syncPassphrase.trim()))
const isHosted = computed(() => typeof window !== 'undefined' && /^https?:$/.test(window.location.protocol))

function close () {
  ui.closeDialog()
}

function remember () {
  ui.setSyncToken(tokenInput.value)
}

async function decryptOrExplain (envelope) {
  try {
    return await decryptJson(ui.syncPassphrase, envelope)
  } catch {
    throw new Error('Déchiffrement impossible : passphrase différente de celle utilisée à l\'envoi (ou données altérées)')
  }
}

/** Envoi : chiffre la base puis l'envoie ; en cas de conflit, fusionne et renvoie. */
async function push () {
  if (!ready.value || busy.value) return
  remember()
  busy.value = 'push'
  error.value = ''
  notice.value = ''
  try {
    let baseRev = ui.syncRev
    for (let attempt = 0; attempt < 2; attempt++) {
      const envelope = await encryptJson(ui.syncPassphrase, store.exportDb())
      const res = await pushRemote(ui.syncToken, baseRev, envelope)
      if (res.ok) {
        ui.setSyncState({ rev: res.rev, at: res.savedAt })
        notice.value = `Base chiffrée envoyée (révision ${res.rev})`
        return
      }
      if (res.conflict && attempt === 0) {
        // Un autre appareil a écrit : on fusionne sa version puis on renvoie.
        if (res.envelope) {
          const remote = await decryptOrExplain(res.envelope)
          store.mergeRemoteDb(remote)
        }
        baseRev = res.rev
        continue
      }
      error.value = res.error || 'Écritures concurrentes répétées : réessayez'
      return
    }
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    busy.value = ''
  }
}

/** Récupération : déchiffre l'enveloppe distante et la fusionne (rien n'est écrasé). */
async function pull () {
  if (!ready.value || busy.value) return
  remember()
  busy.value = 'pull'
  error.value = ''
  notice.value = ''
  try {
    const res = await pullRemote(ui.syncToken)
    if (!res.ok) { error.value = res.error; return }
    if (!res.envelope) { notice.value = 'Aucune sauvegarde distante pour l\'instant — utilisez « Envoyer »'; return }
    const remote = await decryptOrExplain(res.envelope)
    if (!store.mergeRemoteDb(remote)) { error.value = 'Structure distante non reconnue'; return }
    ui.setSyncState({ rev: res.rev, at: res.savedAt })
    notice.value = `Sauvegarde distante fusionnée (révision ${res.rev}) — rien n'a été écrasé, Ctrl+Z pour annuler`
  } catch (e) {
    error.value = String(e?.message || e)
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <BaseDialog title="☁ Synchronisation chiffrée" subtitle="de bout en bout — le serveur ne peut pas lire vos dossiers" @close="close">
    <div class="stack">
      <p v-if="!isHosted" class="small warn-box">
        ⚠ Ouvert en local (fichier) : la synchronisation n'est disponible que sur la version hébergée
        (même origine que l'API <code>/api/sync</code>).
      </p>

      <label class="field">
        <span>Jeton d'accès au serveur</span>
        <input v-model="tokenInput" type="password" autocomplete="off" placeholder="SYNC_TOKEN défini sur le Worker" @change="remember">
        <span class="xsmall muted">Celui défini par <code>wrangler secret put SYNC_TOKEN</code>. Mémorisé dans ce navigateur, jamais exporté.</span>
      </label>

      <label class="field">
        <span>Passphrase de chiffrement</span>
        <input v-model="ui.syncPassphrase" type="password" autocomplete="off" placeholder="Longue phrase connue de vous seul">
        <span class="xsmall muted">
          Chiffre la base <b>dans le navigateur</b> (AES-GCM) avant envoi. Elle n'est <b>ni stockée, ni transmise</b> :
          perdue = sauvegardes distantes illisibles (vos exports .json restent la porte de sortie).
          Utilisez la même sur chaque appareil.
        </span>
      </label>

      <div class="row">
        <button class="btn btn-primary" :disabled="!ready || Boolean(busy)" @click="push">
          {{ busy === 'push' ? 'Chiffrement et envoi…' : '⬆ Envoyer (chiffré)' }}
        </button>
        <button class="btn" :disabled="!ready || Boolean(busy)" @click="pull">
          {{ busy === 'pull' ? 'Récupération…' : '⬇ Récupérer et fusionner' }}
        </button>
        <span class="grow" />
        <span v-if="ui.syncRev" class="xsmall muted">révision {{ ui.syncRev }}<template v-if="ui.syncAt"> · {{ formatRelative(ui.syncAt) }}</template></span>
      </div>

      <p v-if="error" class="small error-text">⚠ {{ error }}</p>
      <p v-else-if="notice" class="small ok-text">✔ {{ notice }}</p>

      <p class="xsmall muted">
        La récupération <b>fusionne</b> (union dossier par dossier, étape par étape), elle n'écrase jamais
        l'état local. En cas d'écriture simultanée depuis un autre appareil, la fusion se fait ici puis
        l'envoi reprend : le serveur ne stocke que des enveloppes chiffrées numérotées.
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
.error-text { color: var(--red); }
.ok-text { color: var(--green); }
.warn-box {
  background: var(--amber-soft); border: 1px solid color-mix(in srgb, var(--amber) 35%, transparent);
  border-radius: var(--radius-sm); padding: 8px 10px;
}
</style>
