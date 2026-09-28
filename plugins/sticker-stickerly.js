import fetch from 'node-fetch'
import { createReadStream } from 'fs'
import { generateWAMessage } from '@itsliaaa/baileys'
import { encodeBase64EncodedStringForUpload } from '@whiskeysockets/baileys/lib/Utils/messages-media.js'

const API = 'https://my.izuka-api.xyz/api/search/stickerly-search'
const MAX_STICKERS = 20
const RUTAS_PACK = {
  'sticker-pack': '/mms/sticker-pack',
  'thumbnail-sticker-pack': '/mms/thumbnail-sticker-pack'
}

async function subirPack(conn, filePath, info) {
  const ruta = RUTAS_PACK[info?.mediaType]
  if (!ruta) return conn.waUploadToServer(filePath, info)

  let uploadInfo = await conn.refreshMediaConn(false)
  const token = encodeBase64EncodedStringForUpload(info.fileEncSha256B64)
  const hosts = uploadInfo?.hosts || []

  for (let i = 0; i < hosts.length; i++) {
    const hostname = hosts[i]?.hostname
    if (!hostname) continue
    const auth = encodeURIComponent(uploadInfo.auth || '')
    const url = `https://${hostname}${ruta}/${token}?auth=${auth}&token=${token}`
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: createReadStream(filePath),
        duplex: 'half',
        headers: {
          'Content-Type': 'application/octet-stream',
          Origin: 'https://web.whatsapp.com'
        },
        signal: info.timeoutMs ? AbortSignal.timeout(info.timeoutMs) : undefined
      })
      const result = await response.json().catch(() => null)
      if (result?.url || result?.direct_path || result?.directPath) {
        return {
          mediaUrl: result.url,
          directPath: result.direct_path || result.directPath,
          meta_hmac: result.meta_hmac,
          fbid: result.fbid,
          ts: result.ts
        }
      }
      uploadInfo = await conn.refreshMediaConn(true)
    } catch (e) {
      console.error('[stickerly] upload', hostname, e?.message || e)
    }
  }

  throw new Error('No se pudo subir el pack a WhatsApp')
}

function urlArchivo(prefijo, archivo) {
  const base = String(prefijo || '')
  if (!base || !archivo) return ''
  const limpio = base.endsWith('/') ? base : `${base}/`
  return limpio + encodeURIComponent(archivo)
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const consulta = String(text || '').trim()
  if (!consulta) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Falta la búsqueda.\n\n> *Ejemplo:* ${usedPrefix}${command} gato`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(`${API}?query=${encodeURIComponent(consulta)}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }
    })
    const json = await res.json()
    const packs = (Array.isArray(json?.result) ? json.result : []).filter(p =>
      p?.resourceUrlPrefix &&
      Array.isArray(p.resourceFiles) &&
      p.resourceFiles.length &&
      !p.isPaid
    )
    if (!packs.length) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No encontré packs de *${consulta}*.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const cercanos = packs.slice(0, 3)
    const pack = cercanos[Math.floor(Math.random() * cercanos.length)]
    const archivos = pack.resourceFiles.slice(0, MAX_STICKERS)
    const tapaArchivo = pack.resourceFiles[pack.trayIndex] || archivos[0]
    const tapa = urlArchivo(pack.resourceUrlPrefix, tapaArchivo)
    const stickers = archivos
      .map(archivo => ({
        data: { url: urlArchivo(pack.resourceUrlPrefix, archivo) },
        emojis: ['✨']
      }))
      .filter(st => st.data.url)

    if (!stickers.length || !tapa) {
      return conn.sendMessage(m.chat, {
        text: `[❌] Ese pack no tiene stickers para enviar.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const nombre = String(pack.name || consulta).slice(0, 40)
    const autor = String(pack.authorName || 'Stickerly').slice(0, 40)

    const creado = await generateWAMessage(m.chat, {
      stickers,
      cover: { url: tapa },
      name: nombre,
      publisher: autor,
      description: nombre
    }, {
      userJid: conn.user?.id,
      quoted: m,
      upload: (archivo, info) => subirPack(conn, archivo, info)
    })
    await conn.relayMessage(m.chat, creado.message, { messageId: creado.key.id })
  } catch (e) {
    console.error('Error en stickerly:', e)
    await conn.sendMessage(m.chat, {
      text: `[❌] No se pudo enviar el pack.\n> ${e?.message || e}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    clearTimeout(timer)
  }
}

handler.command = ['stickerly', 'spack', 'stickly']
handler.tags = ['stickers']
handler.help = ['stickerly <texto>']

export default handler
