/**
 * Environnement navigateur minimal en mémoire pour tester les stores Pinia et
 * composables sous Node.js.
 */
export function installBrowserEnv () {
  const storage = new Map()
  const winListeners = new Map()
  const docListeners = new Map()

  const add = (map) => (event, fn) => {
    if (!map.has(event)) map.set(event, [])
    map.get(event).push(fn)
  }

  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => { storage.set(k, String(v)) },
    removeItem: (k) => { storage.delete(k) },
    clear: () => { storage.clear() },
    get length () { return storage.size },
    key: (i) => [...storage.keys()][i] ?? null
  }

  globalThis.window = {
    location: { protocol: 'https:', pathname: '/', search: '' },
    addEventListener: add(winListeners),
    removeEventListener: () => {}
  }

  globalThis.document = {
    visibilityState: 'visible',
    documentElement: { setAttribute: () => {} },
    addEventListener: add(docListeners),
    removeEventListener: () => {},
    createElement: () => ({})
  }

  return {
    storage,
    dispatchWindow (event, payload = {}) {
      for (const fn of winListeners.get(event) || []) fn(payload)
    },
    reset () {
      storage.clear()
      winListeners.clear()
      docListeners.clear()
    }
  }
}
