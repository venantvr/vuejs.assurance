/**
 * Service worker — l'application reste utilisable hors ligne après une première visite.
 *
 * Stratégie : réseau d'abord (limité à 4 s), cache en secours. Les fichiers de
 * l'application ne portent pas de hash : « réseau d'abord » garantit qu'une
 * mise à jour est vue dès qu'on est en ligne, sans jamais servir une version
 * périmée quand le réseau répond.
 *
 * Ce que ce worker ne fait JAMAIS :
 *  - toucher à /api/* (synchronisation chiffrée) ni à une autre origine (Google
 *    Drive, authentification) : aucune donnée utilisateur n'est mise en cache ;
 *  - mettre en cache une réponse qui n'est pas un 200 (redirection vers
 *    Cloudflare Access, erreur…).
 * Les dossiers vivent dans le localStorage, pas ici.
 */
const VERSION = 'v1'
const CACHE = `vuejs-assurance-${VERSION}`
const NETWORK_TIMEOUT = 4000

const SHELL = [
  './',
  './index.html',
  './assets/app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/icon.svg'
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    // un fichier qui échoue (ex. session Access expirée) ne doit pas bloquer l'installation
    await Promise.allSettled(SHELL.map(async (url) => {
      const response = await fetch(new Request(url, { cache: 'reload' }))
      if (response.status === 200) await cache.put(url, response)
    }))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys()
    await Promise.all(names.filter((n) => n.startsWith('vuejs-assurance-') && n !== CACHE).map((n) => caches.delete(n)))
    await self.clients.claim()
  })())
})

function withTimeout (promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
  })
}

async function networkFirst (request, fallbackUrl) {
  const cache = await caches.open(CACHE)
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT)
    if (response.status === 200 && response.type === 'basic') cache.put(request, response.clone())
    return response
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true }) || (fallbackUrl && await cache.match(fallbackUrl))
    if (cached) return cached
    return new Response('Hors ligne : ouvrez l\'application une fois en ligne pour la rendre disponible sans réseau.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return          // Google, polices, Access : hors périmètre
  if (url.pathname.startsWith('/api/')) return             // données : jamais en cache
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, './index.html'))
    return
  }
  event.respondWith(networkFirst(request))
})
