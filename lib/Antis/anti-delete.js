import fs from 'node:fs/promises'
import { join } from 'path'

const TTL_MS = 10 * 60 * 1000
const MAX_POR_CHAT = 80
const MAX_IMG = 1.5 * 1024 * 1024
const MAX_VIDEO = 2.5 * 1024 * 1024
const MAX_AUDIO = 1 * 1024 * 1024
const MAX_INDICES_CHAT = 256
const DIR_BASE = join(process.cwd(), 'storage', 'msgdels')
const escuchadores = new WeakSet()
const guardando = new Set()
const escriturasMeta = new Map()
const metasPorChat = new Map()
const cargasIndice = new Map()
let limpiandoExpirados = false

function chatSeguro(chatId = '') {
  return String(chatId).replace(/[^a-zA-Z0-9._@-]/g, '_')
}

function dirChat(chatId) {
  return join(DIR_BASE, chatSeguro(chatId))
}

function rutaMeta(chatId, msgId) {
  return join(dirChat(chatId), `${msgId}.json`)
}

function claveEscrituraMeta(chatId, msgId) {
  return `${chatId}\0${msgId}`
}

async function asegurarDir(chatId) {
  const dir = dirChat(chatId)
  await fs.mkdir(dir, { recursive: true })
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

async function listarMetas(chatId) {
  const dir = dirChat(chatId)
  let nombres
  try {
    nombres = await fs.readdir(dir)
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const metas = []
  for (const nombre of nombres) {
    if (!nombre.endsWith('.json')) continue
    try {
      const raw = JSON.parse(await fs.readFile(join(dir, nombre), 'utf8'))
      metas.push({ id: nombre.replace(/\.json$/, ''), ...raw })
    } catch (error) {
      if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error
    }
  }
  return metas
}

async function obtenerIndiceMetas(chatId) {
  const dir = dirChat(chatId)
  let indice = metasPorChat.get(dir)
  if (indice) {
    metasPorChat.delete(dir)
    metasPorChat.set(dir, indice)
    return indice
  }

  let carga = cargasIndice.get(dir)
  if (!carga) {
    carga = listarMetas(chatId).then(metas => {
      indice = new Map(
        metas
          .sort((a, b) => (a.at || 0) - (b.at || 0))
          .map(meta => [meta.id, { at: meta.at || 0, mediaFile: meta.mediaFile || null }])
      )
      metasPorChat.set(dir, indice)
      if (metasPorChat.size > MAX_INDICES_CHAT) {
        metasPorChat.delete(metasPorChat.keys().next().value)
      }
      return indice
    })
    cargasIndice.set(dir, carga)
  }
  try {
    indice = await carga
  } finally {
    if (cargasIndice.get(dir) === carga) cargasIndice.delete(dir)
  }
  return indice
}

async function recortarChat(chatId) {
  const indice = await obtenerIndiceMetas(chatId)

  while (indice.size > MAX_POR_CHAT) {
    let idAntiguo
    let tiempoAntiguo = Infinity
    for (const [id, meta] of indice) {
      const tiempo = Number(meta?.at) || 0
      if (tiempo < tiempoAntiguo) {
        idAntiguo = id
        tiempoAntiguo = tiempo
      }
    }
    if (idAntiguo === undefined) break
    const metaAntigua = indice.get(idAntiguo)
    indice.delete(idAntiguo)
    await borrarEntrada(chatId, idAntiguo, metaAntigua)
  }
}

async function borrarArchivosEnDir(dir, msgId, mediaFile) {
  metasPorChat.get(dir)?.delete(msgId)
  const rutas = [join(dir, `${msgId}.json`)]
  if (mediaFile) rutas.push(join(dir, mediaFile))
  await Promise.all(rutas.map(ruta => fs.unlink(ruta).catch(error => {
    if (error?.code !== 'ENOENT') throw error
  })))
}

async function borrarEntrada(chatId, msgId, meta = null) {
  const dir = dirChat(chatId)
  metasPorChat.get(dir)?.delete(msgId)
  const datos = meta || await leerMeta(chatId, msgId)
  const rutas = [join(dir, `${msgId}.json`)]
  if (datos?.mediaFile) rutas.push(join(dir, datos.mediaFile))
  await Promise.all(rutas.map(ruta =>
    fs.unlink(ruta).catch(error => {
      if (error?.code !== 'ENOENT') throw error
    })
  ))
}

async function leerMeta(chatId, msgId) {
  try {
    const ruta = rutaMeta(chatId, msgId)
    const datos = JSON.parse(await fs.readFile(ruta, 'utf8'))
    if (!datos?.at || Date.now() - datos.at > TTL_MS) {
      await borrarArchivosEnDir(dirChat(chatId), msgId, datos?.mediaFile)
      return null
    }
    return datos
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      console.error('[antidelete] read metadata:', error?.message || error)
    }
    return null
  }
}

async function escribirMeta(chatId, msgId, datos) {
  await asegurarDir(chatId)
  const indice = await obtenerIndiceMetas(chatId)
  const clave = claveEscrituraMeta(chatId, msgId)
  const guardar = async () => {
    await fs.writeFile(rutaMeta(chatId, msgId), JSON.stringify(datos), 'utf8')
    indice.set(msgId, { at: datos.at || Date.now(), mediaFile: datos.mediaFile || null })
    await recortarChat(chatId)
  }
  const escrituraAnterior = escriturasMeta.get(clave)
  const escritura = escrituraAnterior
    ? escrituraAnterior.then(guardar, guardar)
    : guardar()
  escriturasMeta.set(clave, escritura)
  return escritura.finally(() => {
    if (escriturasMeta.get(clave) === escritura) escriturasMeta.delete(clave)
  })
}

export async function limpiarMsgDelsExpirados() {
  if (limpiandoExpirados) return
  limpiandoExpirados = true
  try {
    const ahora = Date.now()
    let vistos = 0
    let carpetas
    try {
      carpetas = await fs.readdir(DIR_BASE, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    for (const entrada of carpetas) {
      if (!entrada.isDirectory()) continue
      const carpeta = entrada.name
      const dir = join(DIR_BASE, carpeta)
      let archivos
      try {
        archivos = await fs.readdir(dir, { withFileTypes: true })
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
        continue
      }
      for (const archivo of archivos) {
        if (!archivo.isFile() || !archivo.name.endsWith('.json')) continue
        vistos++
        if (vistos % 100 === 0) {
          await new Promise(resolve => setImmediate(resolve))
        }
        const ruta = join(dir, archivo.name)
        const id = archivo.name.replace(/\.json$/, '')
        try {
          const datos = JSON.parse(await fs.readFile(ruta, 'utf8'))
          if (!datos?.at || ahora - datos.at > TTL_MS) {
            await borrarArchivosEnDir(dir, id, datos?.mediaFile)
          }
        } catch (error) {
          if (error?.code === 'ENOENT') continue
          if (!(error instanceof SyntaxError)) throw error
          metasPorChat.get(dir)?.delete(id)
          await fs.unlink(ruta).catch(unlinkError => {
            if (unlinkError?.code !== 'ENOENT') throw unlinkError
          })
        }
      }

      try {
        if (!(await fs.readdir(dir)).length) await fs.rmdir(dir)
      } catch (error) {
        if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') throw error
      }
    }
  } catch (e) {
    console.error('[antidelete] cleanup:', e?.message || e)
  } finally {
    limpiandoExpirados = false
  }
}

if (process.env.PAIN_ROLE !== 'subbot') {
  setInterval(() => {
    const inicio = Date.now()
    limpiarMsgDelsExpirados().then(() => {
      const demora = Date.now() - inicio
      if (demora > 500) console.warn(`[antidelete] limpieza lenta: ${demora} ms`)
    }).catch(e => {
      console.error('[antidelete] cleanup:', e?.message || e)
    })
  }, 60_000).unref?.()
}

export function guardarMensajeAntiDelete(m, conn) {
  let claveGuard
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
    claveGuard = `${m.chat}:${msgId}`
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

    const escrituraBase = escribirMeta(m.chat, msgId, base)

    if (media && typeof m.download === 'function') {
      Promise.resolve()
        .then(async () => {
          try {
            await escrituraBase
            const buf = await m.download()
            if (!buf?.length) return
            if (buf.length > maxBytesMedia(media)) return

            const nombre = `${msgId}${extensionMedia(media, m)}`
            const ruta = join(await asegurarDir(m.chat), nombre)
            await fs.writeFile(ruta, buf)

            const actual = await leerMeta(m.chat, msgId)
            if (!actual) return
            actual.mediaFile = nombre
            actual.mediaType = media
            if (media === 'audio') {
              actual.ptt = !!m.msg?.ptt
              actual.mimetype = m.msg?.mimetype || ''
            }
            await escribirMeta(m.chat, msgId, actual)
          } catch (error) {
            console.error('[antidelete] save media:', error?.message || error)
          }
        })
        .finally(() => guardando.delete(claveGuard))
    } else {
      escrituraBase
        .catch(error => {
          console.error('[antidelete] save:', error?.message || error)
        })
        .finally(() => guardando.delete(claveGuard))
    }
  } catch (e) {
    if (claveGuard) guardando.delete(claveGuard)
    console.error('[antidelete] save:', e?.message || e)
  }
}

async function reclamarMeta(chatId, msgId) {
  await escriturasMeta.get(claveEscrituraMeta(chatId, msgId))
  const ruta = rutaMeta(chatId, msgId)
  const claim = `${ruta}.claim`
  try {
    await fs.rename(ruta, claim)
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.error('[antidelete] claim metadata:', error?.message || error)
    }
    return null
  }
  metasPorChat.get(dirChat(chatId))?.delete(msgId)
  try {
    const datos = JSON.parse(await fs.readFile(claim, 'utf8'))
    await fs.unlink(claim).catch(error => {
      if (error?.code !== 'ENOENT') throw error
    })
    if (!datos?.at || Date.now() - datos.at > TTL_MS) {
      await borrarArchivosEnDir(dirChat(chatId), msgId, datos?.mediaFile)
      return null
    }
    return datos
  } catch (error) {
    if (error?.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
      console.error('[antidelete] read claimed metadata:', error?.message || error)
    }
    await fs.unlink(claim).catch(unlinkError => {
      if (unlinkError?.code !== 'ENOENT') throw unlinkError
    })
    return null
  }
}

export async function procesarBorradoAntiDelete(conn, key) {
  try {
    if (!key?.id) return false
    const chatId = conn.decodeJid?.(key.remoteJid) || key.remoteJid
    if (!chatId?.endsWith?.('@g.us')) return false
    if (!global.db?.data?.antiDelete?.[chatId]) return false

    const guardado = await reclamarMeta(chatId, key.id)
    if (!guardado) return false

    if (key.deletedByBot) {
      await borrarArchivosEnDir(dirChat(chatId), key.id, guardado.mediaFile)
      return false
    }

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

    let bufferMedia = null
    if (guardado.mediaFile) {
      try {
        bufferMedia = await fs.readFile(join(dirChat(chatId), guardado.mediaFile))
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error
      }
    }

    if (bufferMedia && guardado.mediaType === 'image') {
      await conn.sendMessage(chatId, {
        image: bufferMedia,
        caption,
        contextInfo: ctx
      })
    } else if (bufferMedia && guardado.mediaType === 'sticker') {
      await conn.sendMessage(chatId, {
        sticker: bufferMedia,
        contextInfo: ctx
      })
      await conn.sendMessage(chatId, {
        text: caption,
        contextInfo: ctx
      })
    } else if (bufferMedia && guardado.mediaType === 'video') {
      await conn.sendMessage(chatId, {
        video: bufferMedia,
        caption,
        contextInfo: ctx
      })
    } else if (bufferMedia && guardado.mediaType === 'audio') {
      await conn.sendMessage(chatId, {
        audio: bufferMedia,
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

    await borrarArchivosEnDir(dirChat(chatId), key.id, guardado.mediaFile)
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
