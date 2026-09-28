import fetch from 'node-fetch'
import { generateWAMessage } from '@itsliaaa/baileys'

const API = 'https://my.izuka-api.xyz/api/search/stickerly-search'
const MAX_STICKERS = 20

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

    const pack = packs[Math.floor(Math.random() * packs.length)]
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
      upload: conn.waUploadToServer
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
