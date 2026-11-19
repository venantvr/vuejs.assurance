import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/index.js'

function makeEnv (token = 'secret-token') {
  const data = new Map()
  const meta = new Map()
  return {
    data,
    meta,
    env: {
      VUEJS_ASSURANCE_TOKEN: token,
      SYNC_KV: {
        async get (k, type) {
          if (!data.has(k)) return null
          return type === 'json' ? JSON.parse(data.get(k)) : data.get(k)
        },
        async put (k, v, opts) {
          data.set(k, v)
          if (opts?.metadata) meta.set(k, opts.metadata)
        },
        async delete (k) {
          data.delete(k)
          meta.delete(k)
        },
        async list ({ prefix }) {
          const keys = [...data.keys()]
            .filter((k) => k.startsWith(prefix))
            .map((name) => ({ name, metadata: meta.get(name) }))
          return { keys, list_complete: true }
        }
      }
    }
  }
}

const VALID_ENVELOPE = { v: 1, iter: 600000, salt: 'c2FsdA==', iv: 'aXY=', data: 'ZGF0YQ==' }
const AUTH = { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' }

describe('worker /api/sync', () => {
  it('répond 503 si KV ou jeton absent et 401 si le jeton ne correspond pas', async () => {
    const r503 = await worker.fetch(new Request('https://x.test/api/sync'), {})
    assert.equal(r503.status, 503)

    const { env } = makeEnv()
    const r401 = await worker.fetch(new Request('https://x.test/api/sync', {
      headers: { Authorization: 'Bearer mauvais' }
    }), env)
    assert.equal(r401.status, 401)
  })

  it('gère GET vide, PUT, conflit 409, liste et lecture d’historique', async () => {
    const { env } = makeEnv()

    let r = await worker.fetch(new Request('https://x.test/api/sync', { headers: AUTH }), env)
    assert.equal(r.status, 200)
    assert.deepEqual(await r.json(), { rev: 0, envelope: null })

    // PUT rev 1
    r = await worker.fetch(new Request('https://x.test/api/sync', {
      method: 'PUT',
      headers: AUTH,
      body: JSON.stringify({ baseRev: 0, envelope: VALID_ENVELOPE })
    }), env)
    assert.equal(r.status, 200)
    assert.equal((await r.json()).rev, 1)

    // PUT avec baseRev périmé → 409 avec enveloppe courante
    r = await worker.fetch(new Request('https://x.test/api/sync', {
      method: 'PUT',
      headers: AUTH,
      body: JSON.stringify({ baseRev: 0, envelope: VALID_ENVELOPE })
    }), env)
    assert.equal(r.status, 409)
    const conflict = await r.json()
    assert.equal(conflict.rev, 1)
    assert.deepEqual(conflict.envelope, VALID_ENVELOPE)

    // PUT rev 2 dans la même heure → remplace rev 1 dans l'historique horaire
    r = await worker.fetch(new Request('https://x.test/api/sync', {
      method: 'PUT',
      headers: AUTH,
      body: JSON.stringify({ baseRev: 1, envelope: VALID_ENVELOPE })
    }), env)
    assert.equal(r.status, 200)
    assert.equal((await r.json()).rev, 2)

    r = await worker.fetch(new Request('https://x.test/api/sync?list=1', { headers: AUTH }), env)
    const listed = await r.json()
    assert.deepEqual(listed.revisions.map((x) => x.rev), [2])
    assert.equal(listed.retentionDays, null)

    r = await worker.fetch(new Request('https://x.test/api/sync?rev=2', { headers: AUTH }), env)
    assert.equal(r.status, 200)
    assert.equal((await r.json()).rev, 2)
  })

  it('rejette un corps PUT trop volumineux même sans en-tête Content-Length', async () => {
    const { env } = makeEnv()
    const stream = new ReadableStream({
      start (controller) {
        const chunk = new Uint8Array(1024 * 1024)
        for (let i = 0; i < 6; i++) controller.enqueue(chunk)
        controller.close()
      }
    })
    const r = await worker.fetch(new Request('https://x.test/api/sync', {
      method: 'PUT',
      headers: AUTH,
      body: stream,
      duplex: 'half'
    }), env)
    assert.equal(r.status, 413)
  })

  it('plafonne DELETE à 40 révisions par lot et protège la révision courante', async () => {
    const { env, data } = makeEnv()
    await worker.fetch(new Request('https://x.test/api/sync', {
      method: 'PUT',
      headers: AUTH,
      body: JSON.stringify({ baseRev: 0, envelope: VALID_ENVELOPE })
    }), env)
    data.set('sync:rev:2', '{}')
    data.set('sync:rev:3', '{}')

    // > 40 refusé
    let r = await worker.fetch(new Request('https://x.test/api/sync', {
      method: 'DELETE',
      headers: AUTH,
      body: JSON.stringify({ revs: Array.from({ length: 41 }, (_, i) => i + 1) })
    }), env)
    assert.equal(r.status, 400)

    // Supprime 2 et 3 mais protège 1 (courante)
    r = await worker.fetch(new Request('https://x.test/api/sync', {
      method: 'DELETE',
      headers: AUTH,
      body: JSON.stringify({ revs: [1, 2, 3] })
    }), env)
    assert.equal(r.status, 200)
    const body = await r.json()
    assert.deepEqual(body.deleted, [2, 3])
    assert.deepEqual(body.kept, [1])
    assert.equal(data.has('sync:rev:1'), true)
    assert.equal(data.has('sync:rev:2'), false)
    assert.equal(data.has('sync:rev:3'), false)
  })
})
