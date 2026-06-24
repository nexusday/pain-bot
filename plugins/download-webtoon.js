import { mkdir, writeFile, unlink } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import {
  trimText,
  cleanPdfName,
  searchWebtoons,
  fetchWebtoonInfo,
  getOrderedEpisodes,
  buildEpisodeListText,
  buildFullWebtoonPdf
} from '../lib/webtoon-utils.js'

const CACHE_TTL = 10 * 60 * 1000

function getEpisodeCache(sender) {
  const cache = global.lastWtEpisodes?.[sender]
  if (!cache || Date.now() - cache.at > CACHE_TTL) return null
  return cache
}

function setEpisodeCache(sender, data) {
  if (!global.lastWtEpisodes) global.lastWtEpisodes = {}
  global.lastWtEpisodes[sender] = {
    url: data.url,
    title: data.title,
    data,
    episodes: data.episodes || [],
    at: Date.now()
  }
}

async function resolveListUrl(m, input, usedPrefix) {
  const urlMatch = input.match(/(https?:\/\/\S*webtoons\.com\S+)/i)
  if (urlMatch) {
    const url = urlMatch[0]
    if (!/\/list\?title_no=\d+/i.test(url)) {
      throw '[❗] Usa el enlace de la lista del webtoon (debe contener /list?title_no=).'
    }
    return { listUrl: url }
  }

  const parts = input.trim().split(/\s+/).filter(Boolean)
  if (parts.length && /^\d+$/.test(parts[0])) {
    const idx = parseInt(parts[0], 10) - 1
    const cache = global.lastWtSearch?.[m.sender]
    if (!cache?.results?.length || Date.now() - cache.at > CACHE_TTL) {
      throw `[❗] No hay búsqueda reciente. Usa primero *${usedPrefix}wtsearch <nombre>*`
    }
    if (idx < 0 || idx >= cache.results.length) {
      throw `[❗] Elige un número del 1 al ${cache.results.length}.`
    }
    return { listUrl: cache.results[idx].url }
  }

  let query = input.trim()
  let language = 'es'
  const langMatch = query.match(/^(.+?)\s+(en|es|fr|de|id|th|zh-hant|zh-hans)$/i)
  if (langMatch) {
    query = langMatch[1].trim()
    language = langMatch[2].toLowerCase()
  }

  if (!query) throw '[❗] Ingresa un enlace o nombre de webtoon.'

  const results = await searchWebtoons(query, language)
  return { listUrl: results[0].url }
}

async function downloadFullWebtoonPdf(m, conn, data) {
  const episodes = getOrderedEpisodes(data.episodes)
  if (!episodes.length) throw '[❗] No hay capítulos disponibles para descargar.'

  console.log(`[WT] ========== DESCARGA INICIADA: ${data.title} | ${episodes.length} caps | chat ${m.chat} ==========`)

  await conn.sendPresenceUpdate('composing', m.chat).catch(() => {})

  const statusMsg = await conn.sendMessage(m.chat, {
    text: `ִֶָ☾. Preparando PDF de *${trimText(data.title, 60)}*\n\n> Capítulos: ${episodes.length}\n> Descargando páginas por capítulo (wbdl)\n> Todo irá en orden en PDF.`,
    contextInfo: { ...rcanal?.contextInfo }
  }, { quoted: m })

  const updateProgress = async (current, total, ep, pages, imgCount) => {
    if (current !== 1 && current % 2 !== 0 && current !== total) return
    await conn.sendMessage(m.chat, {
      text: `ִֶָ☾. Generando PDF…\n\n> *${trimText(data.title, 50)}*\n> Cap. ${current}/${total}: ${trimText(ep.name, 35)}\n> Páginas del cap: ~${imgCount || '?'}\n> Total acumulado: ${pages} págs.`,
      edit: statusMsg.key
    }).catch(() => {})
  }

  const { parts, pageCount, chapterCount, totalChapters } = await buildFullWebtoonPdf(
    data.episodes,
    updateProgress,
    data.title || 'Webtoon'
  )

  console.log(`[WT] ========== PDF LISTO: ${parts.length} archivo(s) | ${pageCount} págs | ${chapterCount}/${totalChapters} caps ==========`)

  const tmpDir = join(process.cwd(), 'tmp')
  if (!existsSync(tmpDir)) await mkdir(tmpDir, { recursive: true })

  const multiPart = parts.length > 1

  for (let p = 0; p < parts.length; p++) {
    const part = parts[p]
    const suffix = multiPart ? `parte${p + 1}` : ''
    const fileName = cleanPdfName(data.title || 'webtoon_completo', suffix)
    const pdfPath = join(tmpDir, `wt_${Date.now()}_${p}_${fileName}`)

    await writeFile(pdfPath, part.pdfBytes)
    console.log(`[WT] Enviando parte ${p + 1}/${parts.length}: ${fileName} | ${mb(part.pdfBytes)} | caps [${part.chapters.join(', ')}]`)

    const capRange = part.chapters.length
      ? `Cap. ${part.chapters[0]}–${part.chapters[part.chapters.length - 1]}`
      : '—'

    try {
      await conn.sendMessage(m.chat, {
        document: { url: pdfPath },
        fileName,
        mimetype: 'application/pdf',
        caption: `ִֶָ☾. 𝗪𝗲𝗯𝘁𝗼𝗼𝗻 𝗣𝗗𝗙${multiPart ? ` · ${p + 1}/${parts.length}` : ''} ִֶָ☾.

 𓍯  *Título:* ${trimText(data.title, 80)}
 𓍯  *Rango:* ${capRange}
 𓍯  *Capítulos:* ${chapterCount}/${totalChapters}
 𓍯  *Páginas en archivo:* ${part.pageCount}
 𓍯  *Páginas totales:* ${pageCount}
 𓍯  *Enlace:* ${data.url || '—'}${multiPart ? '\n 𓍯  *Nota:* Dividido por tamaño, sigue en orden.' : ''}`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
      console.log(`[WT] Parte ${p + 1}/${parts.length} enviada OK`)
    } finally {
      try { await unlink(pdfPath) } catch {}
    }
  }

  await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
}

function mb(bytes) {
  return `${(Number(bytes) / 1024 / 1024).toFixed(2)} MB`
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    const raw = text?.trim()

    if (!raw) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Descarga webtoons completos en *un solo PDF*.\n\n> ${usedPrefix + command} <enlace>\n> ${usedPrefix + command} <número búsqueda>\n> ${usedPrefix + command} <nombre>\n> ${usedPrefix + command} info <enlace> _(solo ver datos)_\n\n> *Ejemplo:*\n${usedPrefix + command} https://www.webtoons.com/es/action/fog-land/list?title_no=9361`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const isInfoOnly = /^info\s+/i.test(raw)
    const input = isInfoOnly ? raw.replace(/^info\s+/i, '').trim() : raw

    if (!isInfoOnly && /^\d+$/.test(raw)) {
      const epCache = getEpisodeCache(m.sender)
      if (epCache) {
        await downloadFullWebtoonPdf(m, conn, epCache.data)
        return
      }
    }

    const { listUrl } = await resolveListUrl(m, input, usedPrefix)
    console.log(`[WT] Comando .wt | URL: ${listUrl}`)
    const data = await fetchWebtoonInfo(listUrl)
    setEpisodeCache(m.sender, data)

    if (isInfoOnly) {
      const infoText = buildEpisodeListText(data, usedPrefix, command)
      if (data.image) {
        try {
          const thumb = (await conn.getFile(data.image)).data
          await conn.sendMessage(m.chat, {
            image: thumb,
            caption: infoText,
            contextInfo: { ...rcanal?.contextInfo }
          }, { quoted: m })
          return
        } catch {}
      }
      await conn.sendMessage(m.chat, {
        text: infoText,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
      return
    }

    await downloadFullWebtoonPdf(m, conn, data)
  } catch (e) {
    console.error('[WT] ERROR FATAL:', e)
    const detail = e?.type === 'aborted' || e?.name === 'AbortError'
      ? 'La descarga tardó demasiado. Intenta de nuevo; si el webtoon es muy largo, puede tardar varios minutos.'
      : (e.message || 'Error desconocido')
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string' ? e : `[❌] Error al descargar webtoon.\n\n> ${detail}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['wt <enlace/número> → Webtoon completo en un PDF']
handler.tags = ['descargas']
handler.command = ['wt', 'webtoon', 'wtdl', 'comic', 'webtoondl']
handler.group = true

export default handler
