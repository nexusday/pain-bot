import { addExif } from '../lib/sticker.js'
import {
  conLimiteStickerAudio,
  enviarAudioStickerNativo,
  extraerAudioDeVideo
} from '../lib/audio-sticker.js'
import { esWebPAnimado, resolverMetaSticker, toWebp } from './stickers-sticker.js'

console.log('[sa] plugin cargado')

const MAX_VIDEO_BYTES = 25 * 1024 * 1024
const MAX_VIDEO_SEGUNDOS = 60

const AYUDA = (p) => `Responde a un *video con sonido* con *${p}sa*.
También puedes enviar un video y ponerle el texto *${p}sa*.

> Límites del video: ${MAX_VIDEO_SEGUNDOS} s y 25 MB.`

function mimeDe(mensaje) {
  return String(mensaje?.msg?.mimetype || mensaje?.mimetype || mensaje?.mediaType || '')
}

function tipoDeMensaje(mensaje) {
  if (!mensaje) return ''
  const tipo = String(mensaje.mtype || mensaje.mediaType || '')
  const mime = mimeDe(mensaje)
  if (/video|ptv/i.test(tipo) || /^video\//i.test(mime)) return 'video'
  return ''
}

async function descargarVideo(conn, mensaje) {
  if (!mensaje) return null

  try {
    const buffer = await mensaje.download?.()
    if (buffer?.length) return Buffer.from(buffer)
  } catch {}

  const bruto = mensaje.msg || mensaje.message
  if (conn?.downloadM && bruto) {
    for (const tipo of ['videoMessage', 'video', 'ptvMessage']) {
      try {
        const buffer = await conn.downloadM(bruto, tipo)
        if (buffer?.length) return Buffer.from(buffer)
      } catch {}
    }
  }

  if (conn?.getFile && bruto) {
    try {
      const archivo = await conn.getFile(bruto)
      if (archivo?.data?.length) return Buffer.from(archivo.data)
    } catch {}
  }

  return null
}

let handler = async (m, { conn, usedPrefix }) => {
  console.log(`[sa] comando recibido chat=${m.chat} tipo=${m.mtype || '?'} citado=${m.quoted?.mtype || '-'}`)
  await conn.sendMessage(m.chat, {
    react: { text: '⏳', key: m.key }
  }).catch(() => {})

  const candidatos = [m, m.quoted].filter(Boolean)
  const video = candidatos.find((mensaje) => tipoDeMensaje(mensaje) === 'video')

  if (!video) {
    console.log('[sa] no se detectó video en el mensaje ni en el citado')
    return conn.reply(m.chat, AYUDA(usedPrefix), m)
  }

  try {
    const segundos = Number(video?.msg?.seconds || video?.msg?.duration || 0)
    if (segundos > MAX_VIDEO_SEGUNDOS) {
      throw new Error(`El video es demasiado largo (máximo ${MAX_VIDEO_SEGUNDOS} s).`)
    }

    const bytesDeclarados = Number(video?.msg?.fileLength || 0)
    if (bytesDeclarados > MAX_VIDEO_BYTES) {
      throw new Error('El video supera el límite de 25 MB.')
    }

    const datos = await descargarVideo(conn, video)
    if (!datos) throw new Error('No se pudo descargar el video.')
    if (datos.length > MAX_VIDEO_BYTES) {
      throw new Error('El video supera el límite de 25 MB.')
    }
    console.log(`[sa] video descargado: ${datos.length} bytes`)

    const { packname, author } = resolverMetaSticker(m, conn)
    const { sticker, audio } = await conLimiteStickerAudio(async () => {
      const audioOgg = await extraerAudioDeVideo(datos)
      console.log(`[sa] audio extraído: ${audioOgg.length} bytes`)
      const webp = await toWebp(datos)
      const stickerFinal = await addExif(webp, packname, author)
      console.log(`[sa] sticker preparado: ${stickerFinal.length} bytes`)
      return { sticker: stickerFinal, audio: audioOgg }
    })

    try {
      console.log('[sa] enviando audioStickerMessage nativo...')
      await enviarAudioStickerNativo(conn, m.chat, {
        sticker,
        audio,
        isAnimated: esWebPAnimado(sticker)
      })
      console.log('[sa] audioStickerMessage enviado')
      await conn.sendMessage(m.chat, {
        react: { text: '✅', key: m.key }
      }).catch(() => {})
    } catch (error) {
      console.error('[sa] audioStickerMessage falló:', error)
      await conn.sendMessage(m.chat, {
        react: { text: '❌', key: m.key }
      }).catch(() => {})
      return conn.reply(
        m.chat,
        `*[❌] No se pudo enviar el sticker con sonido.*\n> ${String(error?.message || error).slice(0, 180)}`,
        m
      )
    }
  } catch (error) {
    console.error('[sa]', error)
    await conn.sendMessage(m.chat, {
      react: { text: '❌', key: m.key }
    }).catch(() => {})
    return conn.reply(
      m.chat,
      `*[❌] No se pudo crear el sticker con sonido.*\n> ${String(error?.message || error).slice(0, 180)}`,
      m
    )
  }
}

handler.help = ['#sa + {responder un video con sonido} → sticker con sonido nativo']
handler.tags = ['stickers', 'audio']
handler.command = ['sa', 'soundsticker', 'stickeraudio', 'saudio']

export default handler
