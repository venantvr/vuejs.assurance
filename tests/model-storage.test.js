import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { installBrowserEnv } from './helpers/browser-env.js'
import {
  cloneDossier, createDossier, createParty, createQuestion, createStep, safeUrl
} from '@/lib/model.js'
import {
  CORRUPT_PREFIX, DB_KEY, emptyDb, listPreserved, loadDb, mergeDb, saveDb
} from '@/lib/storage.js'

const env = installBrowserEnv()

beforeEach(() => {
  env.reset()
})

describe('model', () => {
  it('safeUrl n’accepte que http(s) et rejette les schémas dangereux', () => {
    assert.equal(safeUrl('https://drive.google.com/file/d/abc1234567/view'), 'https://drive.google.com/file/d/abc1234567/view')
    assert.equal(safeUrl('drive.google.com/file/d/abc'), 'https://drive.google.com/file/d/abc')
    assert.equal(safeUrl('javascript:alert(1)'), '')
    assert.equal(safeUrl('data:text/html,<script>alert(1)</script>'), '')
    assert.equal(safeUrl(''), '')
  })

  it('cloneDossier avec newIds régénère les identifiants des dossiers, étapes, pièces, parties et questions', () => {
    const orig = createDossier('Orig')
    orig.steps.push(createStep({ fact: 'Fait', attachments: [{ code: 'PJ-01', name: 'Facture' }] }))
    orig.parties.push(createParty({ role: 'Assuré', name: 'Martin' }))
    orig.globalQuestions.push(createQuestion({ text: 'Question ?' }))

    const copy = cloneDossier(orig, { newIds: true, name: 'Copie' })
    assert.equal(copy.name, 'Copie')
    assert.notEqual(copy.id, orig.id)
    assert.notEqual(copy.steps[0].id, orig.steps[0].id)
    assert.notEqual(copy.steps[0].attachments[0].id, orig.steps[0].attachments[0].id)
    assert.notEqual(copy.parties[0].id, orig.parties[0].id)
    assert.notEqual(copy.globalQuestions[0].id, orig.globalQuestions[0].id)
  })
})

describe('storage', () => {
  it('mergeDb unit les étapes, parties et questions sans rien perdre', () => {
    const newerDossier = createDossier('Sinistre')
    newerDossier.updatedAt = '2026-11-19T10:00:00.000Z'
    newerDossier.steps = [createStep({ id: 's-1', fact: 'Fait 1' })]
    newerDossier.parties = [createParty({ id: 'p-1', role: 'Assuré', name: 'A' })]
    newerDossier.globalQuestions = [createQuestion({ id: 'q-1', text: 'Q1' })]

    const olderDossier = JSON.parse(JSON.stringify(newerDossier))
    olderDossier.updatedAt = '2026-11-19T09:00:00.000Z'
    olderDossier.steps.push(createStep({ id: 's-2', fact: 'Fait 2' }))
    olderDossier.parties.push(createParty({ id: 'p-2', role: 'Expert', name: 'B' }))
    olderDossier.globalQuestions.push(createQuestion({ id: 'q-2', text: 'Q2' }))

    const merged = mergeDb(
      { ...emptyDb(), dossiers: [olderDossier], actors: ['Expert'] },
      { ...emptyDb(), dossiers: [newerDossier], actors: ['Assuré'] }
    )
    const d = merged.dossiers[0]
    assert.deepEqual(d.steps.map((s) => s.id), ['s-1', 's-2'])
    assert.deepEqual(d.parties.map((p) => p.id), ['p-1', 'p-2'])
    assert.deepEqual(d.globalQuestions.map((q) => q.id), ['q-1', 'q-2'])
    assert.deepEqual(merged.actors, ['Assuré', 'Expert'])
  })

  it('saveDb détecte une révision concurrente et fusionne automatiquement', () => {
    const d1 = createDossier('Dossier 1')
    const r1 = saveDb({ ...emptyDb(), activeId: d1.id, dossiers: [d1] }, 0)
    assert.equal(r1.ok, true)
    assert.equal(r1.rev, 1)
    assert.equal(r1.merged, false)

    // Un autre onglet ajoute Dossier 2 sur rev 1 → rev 2
    const d2 = createDossier('Dossier 2')
    const r2 = saveDb({ ...emptyDb(), activeId: d2.id, dossiers: [d1, d2] }, 1)
    assert.equal(r2.rev, 2)

    // Premier onglet encore à knownRev = 1 ajoute Dossier 3 → fusionne avec rev 2
    const d3 = createDossier('Dossier 3')
    const r3 = saveDb({ ...emptyDb(), activeId: d3.id, dossiers: [d1, d3] }, 1)
    assert.equal(r3.ok, true)
    assert.equal(r3.merged, true)
    assert.equal(r3.rev, 3)
    assert.deepEqual(r3.db.dossiers.map((d) => d.name).sort(), ['Dossier 1', 'Dossier 2', 'Dossier 3'])
  })

  it('loadDb met un contenu illisible de côté sans jamais l’effacer', () => {
    localStorage.setItem(DB_KEY, '{json cassé')
    const { db, preserved } = loadDb()
    assert.ok(preserved && preserved.startsWith(CORRUPT_PREFIX))
    assert.equal(localStorage.getItem(preserved), '{json cassé')
    assert.equal(db.dossiers.length, 0)
    assert.equal(listPreserved().length, 1)
  })
})
