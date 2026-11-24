import { addExif } from '../lib/sticker.js'
import { enviarAudioStickerNativo } from '../lib/audio-sticker.js'
import {
  cancelarSesionStickerAudio,
  construirVideoConAudio,
  crearSesionStickerAudio,
  haySesionStickerAudio,
  mimeAudioDe,
  prepararAudioSticker,
  tomarSesionStickerAudio
} from '../lib/sticker-audio.js'
import { esWebPAnimado, resolverMetaSticker, toWebp } from './stickers-sticker.js'

const AYUDA = (p) => `🎧 *Sticker con sonido*

*Cómo usarlo:*
1. Responde a una *imagen*, *video* o *sticker* con *${p}sa*.
2. El bot te pedirá el audio: responde a su mensaje con una *nota de voz* o *audio*.
3. Listo: se envía como sticker animado con sonido.

*Atajo en un solo paso:*
Envía una imagen/video con el texto *${p}sa* respondiendo a un audio.

*Opciones:*
> ${p}sa — sticker con sonido nativo (un solo mensaje)
> ${p}sa gif — video corto con sonido (compatible con clientes viejos)
> ${p}sa sticker — sticker + audio separado
> ${p}sa cancelar — cancela la espera

> Límites: audio de hasta 15 s y 6 MB para la imagen.`

function mimeDe(mensaje) {
  return String(mensaje?.msg?.mimetype || mensaje?.mimetype || mensaje?.mediaType || '')
}

function tipoDeMensaje(mensaje) {
  if (!mensaje) return ''
  const tipo = String(mensaje.mtype || mensaje.mediaType || '')
  const mime = mimeDe(mensaje)
  if (/audio|ptt|voice/i.test(tipo) || /^audio\//i.test(mime)) return 'audio'
  if (/sticker/i.test(tipo) || /webp/i.test(mime)) return 'sticker'
  if (/video/i.test(tipo) || /^video\//i.test(mime)) return 'video'
  if (/image/i.test(tipo) || /^image\//i.test(mime)) return 'image'
  return ''
}

async function descargarMedia(conn, mensaje, tipo) {
  if (!mensaje) return null

  try {
    const buffer = await mensaje.download?.()
    if (buffer?.length) return Buffer.from(buffer)
  } catch {}

  const bruto = mensaje.msg || mensaje.message
  if (conn?.downloadM && bruto) {
    const claveTipo =
      tipo === 'audio' ? 'audioMessage'
        : tipo === 'video' ? 'videoMessage'
          : tipo === 'sticker' ? 'stickerMessage'
            : 'imageMessage'
    for (const intento of [claveTipo, tipo]) {
      try {
        const buffer = await conn.downloadM(bruto, intento)
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

function contexto() {
  return { ...(global.rcanal?.contextInfo || {}) }
}

async function enviarVideo(conn, m, buffer) {
  return conn.sendMessage(m.chat, {
    video: buffer,
    gifPlayback: true,
    mimetype: 'video/mp4',
    caption: '',
    contextInfo: contexto()
  }, { quoted: m })
}

async function enviarStickerConAudio(conn, m, visual, tipoVisual, audio) {
  const { packname, author } = resolverMetaSticker(m, conn)
  const webp = tipoVisual === 'sticker' ? visual : await toWebp(visual)
  const sticker = await addExif(webp, packname, author)
  const stickerMsg = await conn.sendMessage(m.chat, {
    sticker,
    ...(esWebPAnimado(sticker) ? { isAnimated: true } : {}),
    contextInfo: contexto()
  }, { quoted: m })

  const mimetype = mimeAudioDe(audio)
  await conn.sendMessage(m.chat, {
    audio,
    mimetype,
    ...(mimetype.startsWith('audio/ogg') ? { ptt: true } : {}),
    contextInfo: contexto()
  }, { quoted: stickerMsg || m })
}

async function enviarResultado(conn, m, visual, tipoVisual, audio, modo) {
  if (modo === 'sticker') {
    await enviarStickerConAudio(conn, m, visual, tipoVisual, audio)
    return
  }

  if (modo === 'gif') {
    const video = await construirVideoConAudio(visual, tipoVisual, audio)
    await enviarVideo(conn, m, video)
    return
  }

  // Protocolo nativo: StickerMessage + AudioMessage dentro de
  // audioStickerMessage. Si el servidor/cliente no lo acepta, se usa el GIF.
  const { packname, author } = resolverMetaSticker(m, conn)
  const webp = tipoVisual === 'sticker' ? visual : await toWebp(visual)
  const sticker = await addExif(webp, packname, author)
  try {
    const audioOgg = await prepararAudioSticker(audio)
    await enviarAudioStickerNativo(conn, m.chat, {
      sticker,
      audio: audioOgg,
      isAnimated: esWebPAnimado(sticker)
    })
  } catch (error) {
    console.error('[sa] audioStickerMessage nativo falló; se usa GIF:', error)
    const video = await construirVideoConAudio(visual, tipoVisual, audio)
    await enviarVideo(conn, m, video)
  }
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  const opcion = String(args[0] || '').toLowerCase().trim()

  if (['cancelar', 'cancel', 'off', 'stop'].includes(opcion)) {
    const cancelada = cancelarSesionStickerAudio(m.chat, m.sender)
    return conn.reply(
      m.chat,
      cancelada ? '✅ Espera cancelada.' : 'ℹ️ No había ningún audio pendiente.',
      m
    )
  }

  const modo = ['gif', 'video'].includes(opcion)
    ? 'gif'
    : ['sticker', 'stiker', 'separado'].includes(opcion)
      ? 'sticker'
      : 'audio'
  const citado = m.quoted || null
  const tipoActual = tipoDeMensaje(m)
  const tipoCitado = tipoDeMensaje(citado)

  try {
    // Un solo paso: imagen/video/sticker actual + audio citado.
    if (tipoCitado === 'audio' && ['image', 'video', 'sticker'].includes(tipoActual)) {
      const [visual, audio] = await Promise.all([
        descargarMedia(conn, m, tipoActual),
        descargarMedia(conn, citado, 'audio')
      ])
      if (!visual || !audio) throw new Error('No se pudo descargar la imagen o el audio.')
      return await enviarResultado(conn, m, visual, tipoActual, audio, modo)
    }

    // Video citado: normalmente ya trae su propio audio; se reenvía como GIF.
    if (tipoCitado === 'video' && tipoActual !== 'audio') {
      const visual = await descargarMedia(conn, citado, 'video')
      if (!visual) throw new Error('No se pudo descargar el video.')
      return await enviarVideo(conn, m, visual)
    }

    // Dos pasos: se guarda el visual y se pide el audio.
    if (['image', 'video', 'sticker'].includes(tipoCitado)) {
      const visual = await descargarMedia(conn, citado, tipoCitado)
      if (!visual) throw new Error('No se pudo descargar la imagen o el sticker.')
      if (!crearSesionStickerAudio({
        chat: m.chat,
        sender: m.sender,
        buffer: visual,
        tipo: tipoCitado,
        modo
      })) {
        throw new Error('La imagen supera el límite de 8 MB.')
      }
      return conn.reply(
        m.chat,
        `🎧 *Ahora responde a este mensaje con el audio o nota de voz.*\n\n` +
        `> Tienes 2 minutos.\n> Cancelar: *${usedPrefix}${command} cancelar*`,
        m
      )
    }

    if (['image', 'video', 'sticker'].includes(tipoActual)) {
      const visual = await descargarMedia(conn, m, tipoActual)
      if (!visual) throw new Error('No se pudo descargar la imagen o el sticker.')
      if (!crearSesionStickerAudio({
        chat: m.chat,
        sender: m.sender,
        buffer: visual,
        tipo: tipoActual,
        modo
      })) {
        throw new Error('La imagen supera el límite de 8 MB.')
      }
      return conn.reply(
        m.chat,
        `🎧 *Ahora responde a este mensaje con el audio o nota de voz.*\n\n` +
        `> Tienes 2 minutos.\n> Cancelar: *${usedPrefix}${command} cancelar*`,
        m
      )
    }

    return conn.reply(m.chat, AYUDA(usedPrefix), m)
  } catch (error) {
    console.error('[sa]', error)
    return conn.reply(
      m.chat,
      `*[❌] No se pudo crear el sticker con sonido.*\n> ${String(error?.message || error).slice(0, 180)}`,
      m
    )
  }
}

/**
 * Cuando el usuario responde con el audio, se completa la sesión sin exigir
 * otro comando. El handler deja pasar audios de chats con sesión pendiente.
 */
handler.all = async function (m, { conn }) {
  try {
    if (!haySesionStickerAudio(m.chat, m.sender)) return
    if (tipoDeMensaje(m) !== 'audio') return

    const sesion = tomarSesionStickerAudio(m.chat, m.sender)
    if (!sesion) return

    const audio = await descargarMedia(conn, m, 'audio')
    if (!audio) {
      await conn.reply(m.chat, '*[❗] No se pudo descargar el audio. Intenta de nuevo.*', m)
      return
    }

    await enviarResultado(conn, m, sesion.buffer, sesion.tipo, audio, sesion.modo)
  } catch (error) {
    console.error('[sa] audio:', error)
    await conn.reply(
      m.chat,
      `*[❌] No se pudo crear el sticker con sonido.*\n> ${String(error?.message || error).slice(0, 180)}`,
      m
    ).catch(() => {})
  }
}

handler.help = ['#sa + {responder imagen/video/sticker y luego audio} → sticker con sonido']
handler.tags = ['stickers', 'audio']
handler.command = ['sa', 'soundsticker', 'stickeraudio', 'saudio']

export default handler
