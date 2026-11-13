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

/**
 * Recherche des fichiers par nom. Retourne { ok, files } ou { ok: false, error }.
 * `files` : [{ id, name, mimeType, webViewLink, modifiedTime }]
 */
export async function searchDriveFiles (token, query, { pageSize = 15 } = {}) {
  const trimmed = String(query || '').trim()
  const q = [
    'trashed = false',
    trimmed ? `name contains '${escapeQuery(trimmed)}'` : null
  ].filter(Boolean).join(' and ')

  const params = new URLSearchParams({
    q,
    pageSize: String(pageSize),
    orderBy: 'modifiedTime desc',
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
