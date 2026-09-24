/**
 * Sistema Anti-Sticker
 * Bloquea y elimina stickers (incluye efímeros / lottie / wrappers).
 */

function desempaquetarMensaje(message) {
  if (!message || typeof message !== 'object') return null
  let cur = message
  for (let i = 0; i < 10; i++) {
    if (cur.ephemeralMessage?.message) {
      cur = cur.ephemeralMessage.message
      continue
    }
    if (cur.viewOnceMessage?.message) {
      cur = cur.viewOnceMessage.message
      continue
    }
    if (cur.viewOnceMessageV2?.message) {
      cur = cur.viewOnceMessageV2.message
      continue
    }
    if (cur.viewOnceMessageV2Extension?.message) {
      cur = cur.viewOnceMessageV2Extension.message
      continue
    }
    if (cur.documentWithCaptionMessage?.message) {
      cur = cur.documentWithCaptionMessage.message
      continue
    }
    if (cur.editedMessage?.message) {
      cur = cur.editedMessage.message
      continue
    }
    if (cur.lottieStickerMessage?.message) {
      cur = cur.lottieStickerMessage.message
      continue
    }
    if (cur.associatedChildMessage?.message) {
      cur = cur.associatedChildMessage.message
      continue
    }
    break
  }
  return cur
}

function esSticker(m) {
  if (!m) return false
  if (m.mtype === 'stickerMessage' || m.mediaType === 'stickerMessage') return true
  if (m.mtype === 'lottieStickerMessage' || m.mediaType === 'lottieStickerMessage') return true
  if (m.message?.stickerMessage || m.message?.lottieStickerMessage) return true

  const inner = desempaquetarMensaje(m.message)
  if (inner?.stickerMessage || inner?.lottieStickerMessage) return true

  return false
}

function esComandoConPrefijo(m) {
  const texto = String(m.text || m.msg?.caption || '').trim()
  if (!texto) return false

  const escaparRegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  const prefijo = global.prefix
  if (prefijo instanceof RegExp) return prefijo.test(texto)
  if (Array.isArray(prefijo)) {
    return prefijo.some(p => {
      const re = p instanceof RegExp ? p : new RegExp(`^${escaparRegex(String(p))}`)
      return re.test(texto)
    })
  }
  if (typeof prefijo === 'string' && prefijo) {
    return new RegExp(`^${escaparRegex(prefijo)}`).test(texto)
  }
  return false
}

function claveBorrado(m) {
  return {
    remoteJid: m.key?.remoteJid || m.chat,
    fromMe: !!m.key?.fromMe,
    id: m.key?.id,
    participant: m.key?.participant || m.sender,
    ...(m.key?.participantAlt ? { participantAlt: m.key.participantAlt } : {}),
  }
}

export async function manejarAntiSticker(m, conn, esAdmin) {
  if (!m.isGroup || !global.db.data.antiSticker || !global.db.data.antiSticker[m.chat]) return
  if (m.fromMe) return

  if (!esSticker(m)) return


  if (esComandoConPrefijo(m)) return

  if (esAdmin) return false

  try {
    await conn.sendMessage(m.chat, { delete: claveBorrado(m) })
  } catch (error) {
    try {
      await conn.sendMessage(m.chat, { delete: m.key })
    } catch (e2) {
      console.error('Error eliminando sticker:', error?.message || error, e2?.message || e2)
    }
  }
  return true
}

export {
  manejarAntiSticker as handleAntiSticker,
  esSticker as isAntiStickerMessage,
}
