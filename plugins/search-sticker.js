import fetch from 'node-fetch'
import { addExif } from '../lib/sticker.js'
import { toWebp, isAnimatedWebP } from './stickers-sticker.js'

const handler = async (m, { conn, text, args }) => {
  try {
    const consulta = (text || args.join(' ') || '').trim()
    if (!consulta) return conn.reply(m.chat, `Uso: search-sticker <término>`, m, rcanal)

    const urlBusqueda = `https://api.delirius.online/search/tenor?q=${encodeURIComponent(consulta)}`
    const respuesta = await fetch(urlBusqueda).then(r => r.json())
    if (!respuesta?.status || !Array.isArray(respuesta.data) || respuesta.data.length === 0)
      return conn.reply(m.chat, '[❗] No se encontraron stickers para: ' + consulta, m, rcanal)

    const candidatos = Array.from(respuesta.data)
    const barajar = (arreglo) => {
      for (let i = arreglo.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[arreglo[i], arreglo[j]] = [arreglo[j], arreglo[i]]
      }
      return arreglo
    }
    const totalAEnviar = Math.min(2, candidatos.length)
    const resultados = barajar(candidatos).slice(0, totalAEnviar)
    const nombreUsuario = '@' + (conn.getName(m.sender) || 'Usuario')
    let enviados = 0

    for (const item of resultados) {
      try {
        const urlMedia = item.mp4 || item.gif
        if (!urlMedia) continue

        const r = await fetch(urlMedia)
        if (!r.ok) continue
        const arregloBufer = await r.arrayBuffer()
        const bufer = Buffer.from(arregloBufer)

        const webp = await toWebp(bufer)
        const nombrePack = `${consulta}`
        const autor = `${nombreUsuario}` + '\n' + (global.namebot || 'PAIN BOT')
        const stickerFinal = await addExif(webp, nombrePack, autor)
        const animado = isAnimatedWebP(stickerFinal)

        await conn.sendMessage(
          m.chat,
          {
            sticker: stickerFinal,
            ...(animado ? { isAnimated: true } : {}),
            contextInfo: rcanal?.contextInfo
          },
          { quoted: m }
        )
        enviados++
      } catch (err) {
        console.error('Error procesando resultado de sticker:', err.message)
        continue
      }
    }

    if (enviados === 0) return conn.reply(m.chat, '[❌] No se pudieron generar stickers.', m, rcanal)
  } catch (error) {
    console.error('Error en search-sticker:', error)
    return conn.reply(m.chat, '[❌] Error al buscar stickers.', m, rcanal)
  }
}

handler.help = ['search-sticker <término>']
handler.tags = ['stickers']
handler.command = ['search-sticker', 'bsticker', 'sticker-search']

export default handler
