/**
 * Google Drive — lecture seule, 100 % côté navigateur.
 *
 * L'application reste locale : elle n'embarque aucun identifiant OAuth et ne
 * passe par aucun serveur tiers. L'utilisateur colle un jeton d'accès Drive
 * (OAuth 2.0, scope lecture type `drive.readonly` ou `drive.metadata.readonly`),
 * obtenu par exemple via https://developers.google.com/oauthplayground.
 * Le jeton ne sert qu'à chercher des fichiers et récupérer leur lien de
 * consultation (`webViewLink`) ; seul ce lien est enregistré dans le dossier.
 * Le jeton reste dans les préférences locales du navigateur : il n'apparaît
 * jamais dans les exports .json ni dans le courrier généré.
 */

const API = 'https://www.googleapis.com/drive/v3/files'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
export const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly'

let gisLoading = null

/**
 * Charge Google Identity Services à la demande (jamais au chargement de la
 * page : tant que l'utilisateur n'active pas Drive, rien ne part vers Google).
 */
export function loadGis () {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve(globalThis.google.accounts.oauth2)
  if (gisLoading) return gisLoading
  gisLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => {
      const api = globalThis.google?.accounts?.oauth2
      if (api) resolve(api)
      else reject(new Error('Google Identity Services indisponible'))
    }
    script.onerror = () => {
      gisLoading = null
      reject(new Error('Impossible de charger Google Identity Services (bloqueur ? hors ligne ?)'))
    }
    document.head.appendChild(script)
  })
  return gisLoading
}

/**
 * Demande un jeton d'accès Drive en lecture seule par la fenêtre de connexion
 * Google (flux implicite « token » de Google Identity Services). Seul le
 * client_id — public par conception — est nécessaire ; aucun secret.
 * Retourne { ok, token, expiresIn } ou { ok: false, error }.
 */
export async function requestDriveToken (clientId, { consent = false } = {}) {
  const id = String(clientId || '').trim()
  if (!id) return { ok: false, error: 'Renseignez le client ID OAuth (type « Application Web »)' }
  let oauth2
  try {
    oauth2 = await loadGis()
  } catch (error) {
    return { ok: false, error: error.message }
  }
  return new Promise((resolve) => {
    const reasons = {
      popup_closed: 'Fenêtre Google fermée avant la fin de la connexion',
      popup_failed_to_open: 'Fenêtre Google bloquée : autorisez les pop-ups pour ce site',
      access_denied: 'Accès refusé dans la fenêtre Google',
      invalid_client: 'Client ID inconnu de Google : vérifiez l\'identifiant et le type « Application Web »'
    }
    let client
    try {
      client = oauth2.initTokenClient({
        client_id: id,
        scope: DRIVE_READONLY_SCOPE,
        callback: (response) => {
          if (response?.error) {
            resolve({ ok: false, error: reasons[response.error] || `Google a répondu : ${response.error_description || response.error}` })
            return
          }
          resolve({ ok: true, token: response.access_token, expiresIn: Number(response.expires_in) || 3600 })
        },
        error_callback: (err) => {
          resolve({ ok: false, error: reasons[err?.type] || err?.message || 'Connexion Google interrompue' })
        }
      })
    } catch (error) {
      resolve({ ok: false, error: `Initialisation Google impossible : ${error.message}` })
      return
    }
    // '' : pas de nouvel écran de consentement si l'accès a déjà été accordé
    client.requestAccessToken({ prompt: consent ? 'consent' : '' })
  })
}
const TOKENINFO = 'https://www.googleapis.com/oauth2/v3/tokeninfo'

/**
 * Vérifie auprès de Google qu'un jeton est bien en LECTURE SEULE sur Drive :
 * tous ses scopes Drive doivent se terminer par `.readonly`, et il en faut au
 * moins un. Un jeton porteur d'un droit d'écriture (drive, drive.file…) est
 * refusé : l'application n'en a pas besoin et ne doit pas pouvoir modifier
 * le Drive de l'utilisateur.
 * Retourne { ok: true } ou { ok: false, error }.
 */
export async function checkDriveTokenReadonly (token) {
  const value = String(token || '').trim()
  if (!value) return { ok: false, error: 'Jeton vide' }

  let response
  try {
    response = await fetch(TOKENINFO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ access_token: value })
    })
  } catch {
    return { ok: false, error: 'Vérification du jeton impossible (connexion réseau ?)' }
  }
  if (!response.ok) return { ok: false, error: 'Jeton invalide ou expiré — collez un jeton d\'accès à jour' }

  let scopes = []
  try {
    const data = await response.json()
    scopes = String(data.scope || '').split(/\s+/).filter(Boolean)
  } catch {
    return { ok: false, error: 'Réponse de vérification illisible' }
  }

  const driveScopes = scopes.filter((s) => s.startsWith('https://www.googleapis.com/auth/drive'))
  if (!driveScopes.length) {
    return { ok: false, error: 'Ce jeton n\'a aucun droit Google Drive (scope drive.readonly attendu)' }
  }
  const writable = driveScopes.filter((s) => !s.endsWith('.readonly'))
  if (writable.length) {
    return { ok: false, error: 'Jeton refusé : il porte un droit d\'écriture Drive. Générez un jeton limité au scope drive.readonly.' }
  }
  return { ok: true }
}

/** Échappe une valeur insérée dans une requête Drive (`name contains '…'`). */
function escapeQuery (value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

/** Lien de consultation d'un fichier (repli sur l'URL standard Drive). */
export function driveLink (file) {
  return file?.webViewLink || (file?.id ? `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view` : '')
}

export const FOLDER_MIME = 'application/vnd.google-apps.folder'
export const isFolder = (file) => file?.mimeType === FOLDER_MIME

/**
 * Résout un chemin de dossiers depuis la racine du Drive (« Assurance/2026 »).
 * Retourne { ok, path: [{ id, name }] } — le chemin s'arrête au dernier
 * segment trouvé, `missing` nomme le premier segment introuvable, s'il y en a.
 */
export async function resolveDrivePath (token, path) {
  const segments = String(path || '').split('/').map((s) => s.trim()).filter(Boolean)
  const resolved = []
  let parent = 'root'
  for (const name of segments) {
    const res = await searchDriveFiles(token, '', { folderId: parent, exactName: name, onlyFolders: true, pageSize: 2 })
    if (!res.ok) return { ok: false, error: res.error, status: res.status, path: resolved }
    const folder = res.files[0]
    if (!folder) return { ok: true, path: resolved, missing: name }
    resolved.push({ id: folder.id, name: folder.name })
    parent = folder.id
  }
  return { ok: true, path: resolved }
}

/**
 * Liste ou recherche des fichiers. Retourne { ok, files } ou { ok: false, error }.
 * `files` : [{ id, name, mimeType, webViewLink, modifiedTime }], dossiers d'abord.
 * Options : folderId (restreint au dossier), exactName, onlyFolders, pageSize.
 */
export async function searchDriveFiles (token, query, { pageSize = 40, folderId = null, exactName = null, onlyFolders = false } = {}) {
  const trimmed = String(query || '').trim()
  const q = [
    'trashed = false',
    folderId ? `'${escapeQuery(folderId)}' in parents` : null,
    exactName ? `name = '${escapeQuery(exactName)}'` : (trimmed ? `name contains '${escapeQuery(trimmed)}'` : null),
    onlyFolders ? `mimeType = '${FOLDER_MIME}'` : null
  ].filter(Boolean).join(' and ')

  const params = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    orderBy: 'folder,name,modifiedTime desc',
    fields: 'files(id,name,mimeType,webViewLink,modifiedTime)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true'
  })

  let response
  try {
    response = await fetch(`${API}?${params}`, {
      headers: { Authorization: `Bearer ${String(token || '').trim()}` }
    })
  } catch {
    return { ok: false, error: 'Google Drive injoignable (connexion réseau ?)' }
  }

  if (!response.ok) {
    const reasons = {
      401: 'Jeton invalide ou expiré — collez un jeton d\'accès à jour',
      403: 'Accès refusé : le jeton n\'a pas le droit de lecture Drive (scope insuffisant) ou le quota est dépassé',
      429: 'Trop de requêtes : réessayez dans quelques secondes'
    }
    return { ok: false, status: response.status, error: reasons[response.status] || `Erreur Google Drive (HTTP ${response.status})` }
  }

  try {
    const data = await response.json()
    return { ok: true, files: Array.isArray(data.files) ? data.files : [] }
  } catch {
    return { ok: false, error: 'Réponse Google Drive illisible' }
  }
}
