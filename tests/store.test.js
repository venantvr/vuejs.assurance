import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { installBrowserEnv } from './helpers/browser-env.js'
import { useDossiersStore } from '@/stores/dossiers.js'
import { DB_KEY } from '@/lib/storage.js'
import { createDossier, createParty, createStep } from '@/lib/model.js'

const env = installBrowserEnv()

beforeEach(() => {
  env.reset()
  setActivePinia(createPinia())
})

describe('useDossiersStore', () => {
  it('init crée le dossier de démo une fois, sans réécrire sur un rechargement sain', async () => {
    const store = useDossiersStore()
    store.init()
    await nextTick()
    await new Promise((r) => setTimeout(r, 360))
    assert.equal(JSON.parse(localStorage.getItem(DB_KEY)).rev, 1)
    assert.equal(store.dossiers[0].id, 'dos-demo')

    // Second chargement (ex. autre onglet) : aucune migration, rev reste à 1
    setActivePinia(createPinia())
    const store2 = useDossiersStore()
    store2.init()
    await nextTick()
    await new Promise((r) => setTimeout(r, 360))
    assert.equal(JSON.parse(localStorage.getItem(DB_KEY)).rev, 1)
  })

  it('init persiste si la lecture a migré/complété un champ (ex. deletedAt manquant)', () => {
    const store = useDossiersStore()
    store.init()
    const raw = JSON.parse(localStorage.getItem(DB_KEY))
    raw.trash = [{ id: 'dos-old', name: 'Ancien', steps: [] }]
    localStorage.setItem(DB_KEY, JSON.stringify(raw))

    setActivePinia(createPinia())
    const store2 = useDossiersStore()
    store2.init()
    const after = JSON.parse(localStorage.getItem(DB_KEY))
    assert.equal(after.rev, 2)
    assert.ok(after.trash[0].deletedAt)
  })

  it('un événement storage d’un autre onglet recharge sans boucle de réécriture', async () => {
    const store = useDossiersStore()
    store.init()
    await nextTick()

    const tab2 = JSON.parse(localStorage.getItem(DB_KEY))
    tab2.rev = 2
    tab2.dossiers[0].meta.status = 'Modifié dans l’onglet 2'
    tab2.dossiers[0].updatedAt = '2026-11-19T12:00:00.000Z'
    localStorage.setItem(DB_KEY, JSON.stringify(tab2))

    env.dispatchWindow('storage', { key: DB_KEY })
    await nextTick()
    await new Promise((r) => setTimeout(r, 380))

    assert.equal(JSON.parse(localStorage.getItem(DB_KEY)).rev, 2)
    assert.equal(store.active.meta.status, 'Modifié dans l’onglet 2')
  })

  it('importPayload en copie régénère les identifiants des parties et pièces jointes', () => {
    const store = useDossiersStore()
    store.init()
    const src = createDossier('Source')
    src.steps.push(createStep({ fact: 'F1', attachments: [{ code: 'PJ-01', name: 'Doc' }] }))
    src.parties.push(createParty({ role: 'Assureur', name: 'Mutuelle' }))

    store.importPayload({ dossier: src }, { mode: 'merge', asCopies: true })
    const imported = store.dossiers[store.dossiers.length - 1]
    assert.notEqual(imported.id, src.id)
    assert.notEqual(imported.steps[0].attachments[0].id, src.steps[0].attachments[0].id)
    assert.notEqual(imported.parties[0].id, src.parties[0].id)
  })

  it('mergeRemoteDb remplace la démo intacte sur un appareil neuf, mais fusionne si modifiée', () => {
    const store = useDossiersStore()
    store.init()
    const remoteDossier = createDossier('Dossier réel')
    const remoteDb = { version: 1, activeId: remoteDossier.id, dossiers: [remoteDossier], trash: [], actors: [], categories: [] }

    // Démo intacte → adoptée telle quelle (pas de pollution par dos-demo)
    assert.equal(store.mergeRemoteDb(remoteDb), true)
    assert.deepEqual(store.dossiers.map((d) => d.name), ['Dossier réel'])

    // Démo modifiée localement → fusionnée pour ne pas perdre la saisie
    env.reset()
    setActivePinia(createPinia())
    const edited = useDossiersStore()
    edited.init()
    edited.renameActive('Mon vrai dossier')
    assert.equal(edited.mergeRemoteDb(remoteDb), true)
    assert.deepEqual(edited.dossiers.map((d) => d.name).sort(), ['Dossier réel', 'Mon vrai dossier'])
  })
})
