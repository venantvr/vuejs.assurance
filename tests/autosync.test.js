import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { installBrowserEnv } from './helpers/browser-env.js'
import { useDossiersStore } from '@/stores/dossiers.js'
import { useUiStore } from '@/stores/ui.js'
import { useAutoSync } from '@/composables/useAutoSync.js'
import { encryptJson } from '@/lib/crypto.js'
import { createDossier } from '@/lib/model.js'

const env = installBrowserEnv()
const origSetInterval = globalThis.setInterval
const intervals = []

before(() => {
  // Évite que le setInterval interne de useAutoSync.start() ne bloque la fin du processus de test.
  globalThis.setInterval = (...args) => {
    const id = origSetInterval(...args)
    id.unref?.()
    intervals.push(id)
    return id
  }
})

after(() => {
  for (const id of intervals) clearInterval(id)
  globalThis.setInterval = origSetInterval
})

describe('useAutoSync', () => {
  it('ne repousse pas de révision inutile après un pull propre sur appareil neuf, puis pousse après édition', async () => {
    env.reset()
    setActivePinia(createPinia())
    const store = useDossiersStore()
    const ui = useUiStore()
    store.init()

    const remoteDossier = createDossier('Dossier distant')
    const remoteDb = { version: 1, activeId: remoteDossier.id, dossiers: [remoteDossier], trash: [], actors: [], categories: [] }
    const remoteEnvelope = await encryptJson('passphrase-test', remoteDb)

    let putCount = 0
    let getCount = 0
    globalThis.fetch = async (url, opts = {}) => {
      if ((opts.method || 'GET') === 'PUT') {
        putCount++
        return new Response(JSON.stringify({ rev: 6, savedAt: '2026-11-19T11:05:00.000Z' }), { status: 200 })
      }
      getCount++
      return new Response(JSON.stringify({ rev: 5, savedAt: '2026-11-19T11:00:00.000Z', envelope: remoteEnvelope }), { status: 200 })
    }

    const sync = useAutoSync()
    sync.start()
    ui.setSyncToken('tok-valid')
    ui.setSyncPassphrase('passphrase-test')

    // Simule SyncDialog.saveAndSync() : pas de deuxième synchro 500 ms plus tard
    const res = await sync.syncNow({ force: true })
    assert.equal(res.ok, true)
    assert.equal(putCount, 0)
    assert.equal(ui.syncRev, 5)
    assert.deepEqual(store.dossiers.map((d) => d.name), ['Dossier distant'])

    await new Promise((r) => setTimeout(r, 600))
    assert.equal(getCount, 1, 'saveAndSync ne doit pas déclencher un second cycle différé')

    // Modification locale → pousse rev 6
    store.renameActive('Dossier distant modifié')
    await nextTick()
    const res2 = await sync.syncNow({ force: true })
    assert.equal(res2.ok, true)
    assert.equal(putCount, 1)
    assert.equal(ui.syncRev, 6)
  })

  it('conserve l’erreur après saveAndSync en 401, mais réessaie si la config change pendant un cycle', async () => {
    const ui = useUiStore()
    const sync = useAutoSync()

    let calls = 0
    let mode = '401'
    let releaseSlow = null
    globalThis.fetch = async (url, opts = {}) => {
      calls++
      if (mode === 'slow401') {
        await new Promise((r) => { releaseSlow = r })
        return new Response(JSON.stringify({ error: 'Jeton invalide' }), { status: 401 })
      }
      if (mode === '401') return new Response(JSON.stringify({ error: 'Jeton invalide' }), { status: 401 })
      if ((opts.method || 'GET') === 'PUT') return new Response(JSON.stringify({ rev: 7, savedAt: new Date().toISOString() }), { status: 200 })
      return new Response(JSON.stringify({ rev: 6, envelope: null }), { status: 200 })
    }

    // save() + syncNow() avec mauvais jeton : erreur conservée, un seul appel
    ui.setSyncToken('bad-token')
    const r1 = await sync.syncNow({ force: true })
    assert.equal(r1.ok, false)
    assert.equal(ui.syncStatus, 'error')
    assert.ok(ui.syncError.includes('invalide'))
    await new Promise((r) => setTimeout(r, 600))
    assert.equal(calls, 1)

    // Correction du jeton PENDANT un cycle lent : doit réessayer automatiquement
    calls = 0
    mode = 'slow401'
    const inFlight = sync.syncNow({ force: true })
    await nextTick()
    mode = 'ok'
    ui.setSyncToken('fixed-token')
    await nextTick()
    releaseSlow()
    await inFlight

    await new Promise((r) => setTimeout(r, 550))
    while (ui.syncStatus === 'syncing') await new Promise((r) => setTimeout(r, 50))
    assert.equal(ui.syncStatus, 'idle')
    assert.equal(ui.syncError, '')
    assert.ok(calls >= 2)
  })

  it('réinitialise remoteFp sur un 409 sans enveloppe pour ne pas sauter le renvoi', async () => {
    const ui = useUiStore()
    const sync = useAutoSync()

    let putCalls = 0
    const remoteDossier = createDossier('Distant')
    const remoteEnv = await encryptJson(ui.syncPassphrase, {
      version: 1, activeId: remoteDossier.id, dossiers: [remoteDossier], trash: [], actors: [], categories: []
    })

    globalThis.fetch = async (url, opts = {}) => {
      if ((opts.method || 'GET') === 'PUT') {
        putCalls++
        if (putCalls === 1) {
          // Simule un KV vidé entre GET et PUT : 409 sans enveloppe
          return new Response(JSON.stringify({ rev: 0, envelope: null }), { status: 409 })
        }
        return new Response(JSON.stringify({ rev: 1, savedAt: new Date().toISOString() }), { status: 200 })
      }
      return new Response(JSON.stringify({ rev: 9, savedAt: '2026-11-19T11:00:00.000Z', envelope: remoteEnv }), { status: 200 })
    }

    const res = await sync.syncNow({ force: true })
    assert.equal(res.ok, true)
    assert.equal(putCalls, 2)
    assert.equal(ui.syncRev, 1)
  })
})
