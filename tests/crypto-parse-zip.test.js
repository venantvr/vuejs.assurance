import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encryptJson, decryptJson } from '@/lib/crypto.js'
import { parseQuickLine } from '@/lib/parse.js'
import { createZip, safeZipPath } from '@/lib/zip.js'

describe('crypto', () => {
  it('chiffre puis déchiffre un objet JSON avec la bonne passphrase', async () => {
    const payload = { version: 1, dossiers: [{ id: 'dos-1', name: 'Dégât des eaux' }] }
    const env = await encryptJson('ma-passphrase-secrète', payload)
    assert.equal(env.v, 1)
    assert.equal(env.iter, 600000)
    assert.deepEqual(await decryptJson('ma-passphrase-secrète', env), payload)
  })

  it('rejette une mauvaise passphrase ou une enveloppe altérée', async () => {
    const env = await encryptJson('bonne-passphrase', { ok: true })
    await assert.rejects(() => decryptJson('mauvaise-passphrase', env))

    const tampered = { ...env, data: env.data.slice(0, -2) + (env.data.endsWith('AA') ? 'BB' : 'AA') }
    await assert.rejects(() => decryptJson('bonne-passphrase', tampered))
    await assert.rejects(() => decryptJson('bonne-passphrase', { ...env, v: 99 }))
    await assert.rejects(() => decryptJson('bonne-passphrase', { ...env, iter: 10 }))
  })
})

describe('parseQuickLine', () => {
  it('extrait date, heure, montant, acteur, canal et PJ', () => {
    const res = parseQuickLine('12/09/2026 14h30 relance LRAR plombier 285,50€ | AquaFuite & Assuré | PJ Facture-AquaFuite')
    assert.equal(res.date, '2026-09-12')
    assert.equal(res.time, '14:30')
    assert.equal(res.amount, 285.5)
    assert.deepEqual(res.actors, ['AquaFuite', 'Assuré'])
    assert.equal(res.channel, 'LRAR')
    assert.equal(res.pjName, 'Facture-AquaFuite')
    assert.equal(res.guessedDate, false)
  })

  it('reconnaît un préfixe de catégorie explicite', () => {
    const res = parseQuickLine('2026-09-15 tech: coupure arrivée d’eau')
    assert.equal(res.date, '2026-09-15')
    assert.equal(res.category, 'TECHNIQUE')
    assert.equal(res.guessedCategory, false)
    assert.equal(res.fact, 'coupure arrivée d’eau')
  })
})

describe('zip', () => {
  it('nettoie les chemins dangereux et dédoublonne les entrées', async () => {
    assert.equal(safeZipPath('../etc/passwd'), 'etc/passwd')
    assert.equal(safeZipPath('pieces/a:b?c*.pdf'), 'pieces/a_b_c_.pdf')

    const blob = createZip([
      { name: 'doc.txt', data: 'premier' },
      { name: 'doc.txt', data: 'second' }
    ])
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const text = new TextDecoder('latin1').decode(bytes)
    assert.equal(bytes[0], 0x50) // 'P'
    assert.equal(bytes[1], 0x4b) // 'K'
    assert.ok(text.includes('doc.txt'))
    assert.ok(text.includes('doc_2.txt'))
  })
})
