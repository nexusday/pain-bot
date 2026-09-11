import { addExif } from '../lib/sticker.js'

/**
 * Cambia packname/autor de un sticker (estático o animado) sin re-encodear.
 * Uso: responder sticker + .delmeta nombre|autor
 * Si el autor va vacío → se usa el pushName del usuario.
 */
let handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    const citado = m.quoted ? m.quoted : null
    const tipoMime = ((citado?.msg || citado)?.mimetype || citado?.mediaType || '').toLowerCase()
    const esSticker =
      !!citado &&
      (
        /webp/.test(tipoMime) ||
        citado.mtype === 'stickerMessage' ||
        !!citado.isAnimated ||
        typeof citado.isAnimated !== 'undefined'
      )

    if (!citado || !esSticker || typeof citado.download !== 'function') {
      return conn.reply(
        m.chat,
        `*[❗] Responde a un *sticker* (normal o animado) con el comando.*\n\n` +
          `Ejemplos:\n` +
          `> ${usedPrefix + command} Pain Bot|Sunkovv\n` +
          `> ${usedPrefix + command} Mi Pack\n` +
          `> ${usedPrefix + command} Mi Pack|`,
        m,
        global.rcanal
      )
    }

    const crudo = String(text || '').trim()
    if (!crudo) {
      return conn.reply(
        m.chat,
        `*[❗] Escribe el nombre del pack y, opcional, el autor.*\n\n` +
          `Formato: ${usedPrefix + command} nombre|autor\n` +
          `Si no pones autor, se usa tu nombre de WhatsApp.`,
        m,
        global.rcanal
      )
    }

    let nombrePack = ''
    let autor = ''

    if (crudo.includes('|')) {
      const partes = crudo.split('|')
      nombrePack = (partes[0] || '').trim()
      autor = partes.slice(1).join('|').trim()
    } else {
      nombrePack = crudo
      autor = ''
    }

    if (!nombrePack) {
      return conn.reply(
        m.chat,
        `*[❗] Debes indicar al menos el *nombre* del pack.*\n\n` +
          `Ejemplo: ${usedPrefix + command} Pain Bot|Sunkovv`,
        m,
        global.rcanal
      )
    }

    const nombrePush =
      m.pushName ||
      m.name ||
      conn.getName?.(m.sender) ||
      'Usuario'

    if (!autor) autor = String(nombrePush).trim() || 'Usuario'

    const bufer = await citado.download()
    if (!bufer || !Buffer.isBuffer(bufer) || bufer.length < 10) {
      return conn.reply(m.chat, '[❌] No se pudo descargar el sticker.', m, global.rcanal)
    }

   
    const stickerFinal = await addExif(bufer, nombrePack, autor)

    await conn.sendFile(
      m.chat,
      stickerFinal,
      'sticker.webp',
      '',
      m,
      null,
      global.rcanal
    )
  } catch (error) {
    console.error('[delmeta]', error)
    return conn.reply(
      m.chat,
      `*[❌] Error al cambiar la metadata del sticker.*\n> ${error?.message || error}`,
      m,
      global.rcanal
    )
  }
}

handler.help = [
  '#delmeta • #remeta • #take + {responder sticker} nombre|autor\n→ Cambia pack y autor del sticker (si autor vacío usa tu nombre)'
]
handler.tags = ['stickers']
handler.command = ['delmeta', 'remeta', 'take', 'wm']

export default handler
