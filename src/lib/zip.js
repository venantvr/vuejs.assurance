/**
 * Écrivain ZIP minimal, sans dépendance : entrées « stockées » (non compressées —
 * les pièces PDF/JPEG le sont déjà), noms en UTF-8, CRC-32. Limité à 4 Go au
 * total (pas de ZIP64) : largement au-delà de ce qu'un dossier de sinistre pèse.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32 (bytes) {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function dosDateTime (date) {
  const d = date instanceof Date ? date : new Date()
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  const day = ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time, day }
}

/** Retire les composants dangereux d'un chemin d'archive (.., absolu, caractères interdits). */
export function safeZipPath (path) {
  return String(path || 'fichier')
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim())
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/') || 'fichier'
}

/**
 * @param {Array<{ name: string, data: Uint8Array | string, date?: Date }>} entries
 * @returns {Blob} archive .zip
 */
export function createZip (entries) {
  const encoder = new TextEncoder()
  const parts = []
  const central = []
  let offset = 0
  const seen = new Set()

  for (const entry of entries) {
    let name = safeZipPath(entry.name)
    // deux entrées de même nom : la seconde reçoit un suffixe plutôt que d'écraser la première
    if (seen.has(name)) {
      const dot = name.lastIndexOf('.')
      const base = dot > name.lastIndexOf('/') ? name.slice(0, dot) : name
      const ext = dot > name.lastIndexOf('/') ? name.slice(dot) : ''
      let n = 2
      while (seen.has(`${base}_${n}${ext}`)) n++
      name = `${base}_${n}${ext}`
    }
    seen.add(name)

    const nameBytes = encoder.encode(name)
    const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data
    const { time, day } = dosDateTime(entry.date)
    const crc = crc32(data)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)          // version nécessaire
    local.setUint16(6, 0x0800, true)      // bit 11 : noms en UTF-8
    local.setUint16(8, 0, true)           // méthode 0 : stockée
    local.setUint16(10, time, true)
    local.setUint16(12, day, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, nameBytes.length, true)
    local.setUint16(28, 0, true)
    parts.push(local.buffer, nameBytes, data)

    const dir = new DataView(new ArrayBuffer(46))
    dir.setUint32(0, 0x02014b50, true)
    dir.setUint16(4, 20, true)
    dir.setUint16(6, 20, true)
    dir.setUint16(8, 0x0800, true)
    dir.setUint16(10, 0, true)
    dir.setUint16(12, time, true)
    dir.setUint16(14, day, true)
    dir.setUint32(16, crc, true)
    dir.setUint32(20, data.length, true)
    dir.setUint32(24, data.length, true)
    dir.setUint16(28, nameBytes.length, true)
    dir.setUint32(42, offset, true)
    central.push(dir.buffer, nameBytes)

    offset += 30 + nameBytes.length + data.length
  }

  const centralSize = central.reduce((sum, p) => sum + (p.byteLength ?? p.length), 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true)
  end.setUint16(8, seen.size, true)
  end.setUint16(10, seen.size, true)
  end.setUint32(12, centralSize, true)
  end.setUint32(16, offset, true)

  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' })
}
