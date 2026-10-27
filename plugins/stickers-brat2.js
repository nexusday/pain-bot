import {
  parsearBrat2,
  normalizarTextoBrat,
  textoAStickerBrat2
} from '../lib/brat.js'
import { addExif } from '../lib/sticker.js'
import { resolveStickerMeta } from './stickers-sticker.js'

function prepararEntrada(m, args) {
  const crudo = args.join(' ').trim()
  const separador = crudo.indexOf('|')
  if (separador === -1) return crudo

  // Permite responder a un mensaje y usar solo "segundos|".
  const despues = normalizarTextoBrat(crudo.slice(separador + 1))
  if (despues) return crudo

  const citado = normalizarTextoBrat(m.quoted?.text || '')
  return citado ? `${crudo.slice(0, separador)}|${citado}` : crudo
}

function mensajeUso(usedPrefix, command) {
  return (
    `*[❗] Falta la duración y el texto.*\n\n` +
    `Usa: *${usedPrefix + command} segundos|texto*\n` +
    `Duración: 2 a 10 segundos.\n\n` +
    `Ejemplos:\n` +
    `> ${usedPrefix + command} 4|Hola mundo\n` +
    `> ${usedPrefix + command} 6|BRAT con MAYÚSCULAS\n` +
    `> (responde un mensaje con ${usedPrefix + command} 5|)`
  )
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    const entrada = prepararEntrada(m, args)

    if (!entrada) {
      return conn.reply(m.chat, mensajeUso(usedPrefix, command), m, global.rcanal)
    }

    const { segundos, texto } = parsearBrat2(entrada)
    const { packname, author } = resolveStickerMeta(m, conn)
    const webp = await textoAStickerBrat2(texto, segundos)
    const stickerFinal = await addExif(webp, packname, author)

    await conn.sendFile(m.chat, stickerFinal, 'sticker.webp', '', m, null, global.rcanal)
  } catch (error) {
    if (error?.name === 'ErrorBrat2') {
      return conn.reply(m.chat, `*[❗] ${error.message}*`, m, global.rcanal)
    }

    console.error('[brat2]', error)
    return conn.reply(
      m.chat,
      `*[❌] Error al crear el sticker Brat animado.*\n> ${error?.message || error}`,
      m,
      global.rcanal
    )
  }
}

handler.help = ['#brat2 {segundos}|{texto} → sticker animado que revela el texto poco a poco']
handler.tags = ['stickers']
handler.command = ['brat2']

export default handler
