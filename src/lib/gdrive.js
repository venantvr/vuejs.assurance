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
