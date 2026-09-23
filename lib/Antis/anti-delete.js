import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  renameSync,
  readdirSync,
  statSync,
  rmSync
} from 'fs'
import { join } from 'path'

const TTL_MS = 10 * 60 * 1000
const MAX_POR_CHAT = 80
const MAX_IMG = 1.5 * 1024 * 1024
const MAX_VIDEO = 2.5 * 1024 * 1024
const MAX_AUDIO = 1 * 1024 * 1024
const DIR_BASE = join(process.cwd(), 'storage', 'msgdels')
const escuchadores = new WeakSet()
const guardando = new Set()

function chatSeguro(chatId = '') {
  return String(chatId).replace(/[^a-zA-Z0-9._@-]/g, '_')
}

function dirChat(chatId) {
  return join(DIR_BASE, chatSeguro(chatId))
}

function rutaMeta(chatId, msgId) {
  return join(dirChat(chatId), `${msgId}.json`)
}

function asegurarDir(chatId) {
  const dir = dirChat(chatId)
  if (!existsSync(DIR_BASE)) mkdirSync(DIR_BASE, { recursive: true })
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function textoCorto(m) {
  const t = String(m.text || m.msg?.caption || m.caption || '').trim()
  if (t) return t.slice(0, 800)
  return ''
}

function esPlaceholderFeo(texto = '') {
  return /^\[[^\]]+\]$/i.test(String(texto).trim())
}

function cuerpoLimpio(texto = '') {
  const t = String(texto || '').trim()
  if (!t || esPlaceholderFeo(t)) return ''
  return t
}

function tipoMedia(m) {
  const tipo = String(m.mtype || '')
  if (/sticker/i.test(tipo)) return 'sticker'
  if (/image|album/i.test(tipo)) return 'image'
  if (/video/i.test(tipo)) return 'video'
  if (/audio|ptt/i.test(tipo)) return 'audio'
  return null
}

function extensionMedia(tipo, m) {
  if (tipo === 'sticker') return '.webp'
  if (tipo === 'image') return '.jpg'
  if (tipo === 'video') return '.mp4'
  if (tipo === 'audio') {
    const mime = String(m.msg?.mimetype || '')
    return /ogg|opus/i.test(mime) ? '.ogg' : '.mp3'
  }
  return '.bin'
}

function maxBytesMedia(tipo) {
  if (tipo === 'video') return MAX_VIDEO
  if (tipo === 'audio') return MAX_AUDIO
  return MAX_IMG
}

function listarMetas(chatId) {
  const dir = dirChat(chatId)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(n => n.endsWith('.json'))
    .map(n => {
      try {
        const ruta = join(dir, n)
        const raw = JSON.parse(readFileSync(ruta, 'utf8'))
        return { ruta, id: n.replace(/\.json$/, ''), ...raw }
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function recortarChat(chatId) {
  const metas = listarMetas(chatId).sort((a, b) => (a.at || 0) - (b.at || 0))
  while (metas.length > MAX_POR_CHAT) {
    const viejo = metas.shift()
    borrarEntrada(chatId, viejo.id, viejo)
  }
}

function borrarArchivosEnDir(dir, msgId, mediaFile) {
  try {
    const rutaJ = join(dir, `${msgId}.json`)
    if (existsSync(rutaJ)) unlinkSync(rutaJ)
    if (mediaFile) {
      const rutaM = join(dir, mediaFile)
      if (existsSync(rutaM)) unlinkSync(rutaM)
    }
  } catch {}
}

function borrarEntrada(chatId, msgId, meta = null) {
  const datos = meta || leerMeta(chatId, msgId)
  borrarArchivosEnDir(dirChat(chatId), msgId, datos?.mediaFile)
}

function leerMeta(chatId, msgId) {
  try {
    const ruta = rutaMeta(chatId, msgId)
    if (!existsSync(ruta)) return null
    const datos = JSON.parse(readFileSync(ruta, 'utf8'))
    if (!datos?.at || Date.now() - datos.at > TTL_MS) {
      borrarArchivosEnDir(dirChat(chatId), msgId, datos?.mediaFile)
      return null
    }
    return datos
  } catch {
    return null
  }
}

function escribirMeta(chatId, msgId, datos) {
  asegurarDir(chatId)
  writeFileSync(rutaMeta(chatId, msgId), JSON.stringify(datos), 'utf8')
  recortarChat(chatId)
}

export function limpiarMsgDelsExpirados() {
  try {
    if (!existsSync(DIR_BASE)) return
    const ahora = Date.now()
    for (const carpeta of readdirSync(DIR_BASE)) {
      const dir = join(DIR_BASE, carpeta)
      let st
      try {
        st = statSync(dir)
      } catch {
        continue
      }
      if (!st.isDirectory()) continue

      for (const archivo of readdirSync(dir)) {
        if (!archivo.endsWith('.json')) continue
        const ruta = join(dir, archivo)
        const id = archivo.replace(/\.json$/, '')
        try {
          const datos = JSON.parse(readFileSync(ruta, 'utf8'))
          if (!datos?.at || ahora - datos.at > TTL_MS) {
            borrarArchivosEnDir(dir, id, datos?.mediaFile)
          }
        } catch {
          try { unlinkSync(ruta) } catch {}
        }
      }

      try {
        if (!readdirSync(dir).length) rmSync(dir, { recursive: true, force: true })
      } catch {}
    }
  } catch (e) {
    console.error('[antidelete] cleanup:', e?.message || e)
  }
}

setInterval(limpiarMsgDelsExpirados, 60_000).unref?.()

export function guardarMensajeAntiDelete(m, conn) {
  try {
    if (!m?.isGroup || !m.key?.id) return
    if (!global.db?.data?.antiDelete?.[m.chat]) return
    if (m.fromMe || m.isBaileys) return
    if (m.messageStubType) return
    if (m.mtype === 'protocolMessage' || m.message?.protocolMessage) return
    if (m.mtype === 'reactionMessage' || m.message?.reactionMessage) return

    const resumen = textoCorto(m)
    const media = tipoMedia(m)
    const tipo = String(m.mtype || '')
    if (/reaction|protocol|senderKey|messageContext/i.test(tipo)) return
    if (!resumen && !media) return

    const msgId = m.key.id
    const claveGuard = `${m.chat}:${msgId}`
    if (guardando.has(claveGuard)) return
    guardando.add(claveGuard)

    const base = {
      at: Date.now(),
      chatId: m.chat,
      sender: m.sender,
      name: m.pushName || m.name || '',
      text: resumen,
      mtype: m.mtype || '',
      participant: m.key.participant || m.sender,
      mediaFile: null,
      mediaType: null
    }

    escribirMeta(m.chat, msgId, base)

    if (media && typeof m.download === 'function') {
      Promise.resolve()
        .then(async () => {
          try {
            const buf = await m.download()
            if (!buf?.length) return
            if (buf.length > maxBytesMedia(media)) return

            const nombre = `${msgId}${extensionMedia(media, m)}`
            const ruta = join(asegurarDir(m.chat), nombre)
            writeFileSync(ruta, buf)

            const actual = leerMeta(m.chat, msgId) || base
            actual.mediaFile = nombre
            actual.mediaType = media
            if (media === 'audio') {
              actual.ptt = !!m.msg?.ptt
              actual.mimetype = m.msg?.mimetype || ''
            }
            escribirMeta(m.chat, msgId, actual)
          } catch {}
        })
        .finally(() => guardando.delete(claveGuard))
    } else {
      guardando.delete(claveGuard)
    }
  } catch (e) {
    console.error('[antidelete] save:', e?.message || e)
  }
}

function reclamarMeta(chatId, msgId) {
  const ruta = rutaMeta(chatId, msgId)
  if (!existsSync(ruta)) return null
  const claim = `${ruta}.claim`
  try {
    renameSync(ruta, claim)
  } catch {
    return null
  }
  try {
    const datos = JSON.parse(readFileSync(claim, 'utf8'))
    try { unlinkSync(claim) } catch {}
    if (!datos?.at || Date.now() - datos.at > TTL_MS) {
      borrarArchivosEnDir(dirChat(chatId), msgId, datos?.mediaFile)
      return null
    }
    return datos
  } catch {
    try { unlinkSync(claim) } catch {}
    return null
  }
}

export async function procesarBorradoAntiDelete(conn, key) {
  try {
    if (!key?.id) return false
    const chatId = conn.decodeJid?.(key.remoteJid) || key.remoteJid
    if (!chatId?.endsWith?.('@g.us')) return false
    if (!global.db?.data?.antiDelete?.[chatId]) return false

    const guardado = reclamarMeta(chatId, key.id)
    if (!guardado) return false

    const quien = guardado.sender || key.participant || ''
    const digitos = String(quien).split('@')[0]
    const texto = cuerpoLimpio(guardado.text)
    const caption =
      `*Mensaje eliminado*\n\n` +
      `> De: @${digitos}` +
      (texto ? `\n\n${texto}` : '')

    const mentions = quien ? [quien] : []
    const ctx = {
      ...(global.rcanal?.contextInfo || {}),
      mentionedJid: mentions
    }

    const rutaMedia =
      guardado.mediaFile && existsSync(join(dirChat(chatId), guardado.mediaFile))
        ? join(dirChat(chatId), guardado.mediaFile)
        : null

    if (rutaMedia && guardado.mediaType === 'image') {
      await conn.sendMessage(chatId, {
        image: readFileSync(rutaMedia),
        caption,
        contextInfo: ctx
      })
    } else if (rutaMedia && guardado.mediaType === 'sticker') {
      await conn.sendMessage(chatId, {
        sticker: readFileSync(rutaMedia),
        contextInfo: ctx
      })
      await conn.sendMessage(chatId, {
        text: caption,
        contextInfo: ctx
      })
    } else if (rutaMedia && guardado.mediaType === 'video') {
      await conn.sendMessage(chatId, {
        video: readFileSync(rutaMedia),
        caption,
        contextInfo: ctx
      })
    } else if (rutaMedia && guardado.mediaType === 'audio') {
      await conn.sendMessage(chatId, {
        audio: readFileSync(rutaMedia),
        mimetype: guardado.mimetype || 'audio/ogg; codecs=opus',
        ptt: !!guardado.ptt,
        contextInfo: ctx
      })
      await conn.sendMessage(chatId, {
        text: caption,
        contextInfo: ctx
      })
    } else {
      await conn.sendMessage(chatId, {
        text: caption,
        contextInfo: ctx
      })
    }

    borrarArchivosEnDir(dirChat(chatId), key.id, guardado.mediaFile)
    return true
  } catch (e) {
    console.error('[antidelete] delete:', e?.message || e)
    return false
  }
}

export function iniciarAntiDelete(conn) {
  if (!conn || escuchadores.has(conn)) return
  escuchadores.add(conn)

  conn.ev.on('message.delete', async (item) => {
    try {
      const key = item?.key || item
      if (!key?.id) return
      await procesarBorradoAntiDelete(conn, key)
    } catch (e) {
      console.error('[antidelete] listener:', e?.message || e)
    }
  })
}

export {
  guardarMensajeAntiDelete as cacheAntiDeleteMessage,
  procesarBorradoAntiDelete as handleAntiDeleteKey,
  iniciarAntiDelete as initAntiDelete
}

