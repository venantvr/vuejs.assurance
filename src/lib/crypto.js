/**
 * Chiffrement de bout en bout (WebCrypto, natif navigateur).
 *
 * AES-GCM 256 bits, clé dérivée d'une passphrase par PBKDF2-SHA-256
 * (600 000 itérations, sel aléatoire par enveloppe). La passphrase et la clé
 * ne quittent jamais le navigateur : le serveur ne voit que l'enveloppe
 * { v, iter, salt, iv, data }, illisible sans la passphrase.
 */

const VERSION = 1
const ITERATIONS = 600000

function toBase64 (bytes) {
  let binary = ''
  const arr = new Uint8Array(bytes)
  const chunk = 0x8000
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function fromBase64 (text) {
  const binary = atob(String(text || ''))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function deriveKey (passphrase, salt, iterations) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(String(passphrase)), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/** Chiffre un objet JSON. Retourne l'enveloppe à envoyer au serveur. */
export async function encryptJson (passphrase, obj) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt, ITERATIONS)
  const plain = new TextEncoder().encode(JSON.stringify(obj))
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return { v: VERSION, iter: ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(cipher) }
}

/**
 * Déchiffre une enveloppe. Retourne l'objet, ou lève une erreur si la
 * passphrase est fausse ou l'enveloppe altérée (GCM authentifie le contenu).
 */
export async function decryptJson (passphrase, envelope) {
  if (!envelope || envelope.v !== VERSION) throw new Error('Enveloppe inconnue (version)')
  const iterations = Number(envelope.iter)
  if (!Number.isFinite(iterations) || iterations < 100000 || iterations > 10000000) {
    throw new Error('Enveloppe inconnue (itérations)')
  }
  const key = await deriveKey(passphrase, fromBase64(envelope.salt), iterations)
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) }, key, fromBase64(envelope.data)
  )
  return JSON.parse(new TextDecoder().decode(plain))
}
