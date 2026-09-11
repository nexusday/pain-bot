import fetch from 'node-fetch'

const TIKWM = 'https://www.tikwm.com'
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const RE_URL_TT =
  /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.|t\.)?tiktok\.com\/[^\s]+/i

function mediaAbsoluta(url = '') {
  const u = String(url || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u)) return u
  return `${TIKWM}${u.startsWith('/') ? u : `/${u}`}`
}

export function sanitizarUrlTikTok(entrada = '') {
  let url = String(entrada || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()

  const coincidente = url.match(RE_URL_TT)?.[0]
  if (coincidente) url = coincidente

  url = url
    .replace(/^[\s<'"(\[]+/, '')
    .replace(/[\s>'"\)\],]+$/g, '')
    .replace(/[)\]}>.,;:!?]+$/g, '')
    .trim()

  if (!url) return ''
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`
  return url
}

function extraerIdVideo(text = '') {
  const s = String(text)
  return (
    s.match(/\/video\/(\d{8,})/)?.[1] ||
    s.match(/\/photo\/(\d{8,})/)?.[1] ||
    s.match(/\/v\/(\d{8,})/)?.[1] ||
    s.match(/[?&](?:item_id|aweme_id|share_item_id)=(\d{8,})/i)?.[1] ||
    s.match(/(?:^|[^\d])(\d{15,20})(?:[^\d]|$)/)?.[1] ||
    null
  )
}

async function resolverUrlEntrada(entrada) {
  let url = sanitizarUrlTikTok(entrada)
  if (!url) return { url: '', id: null }

  let id = extraerIdVideo(url)
  if (id) return { url, id }

  // Short links (vm/vt): seguir redirect y también Location manual
  try {
    const respuesta = await fetch(url, {
      redirect: 'manual',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    const ubicacion = respuesta.headers?.get?.('location') || respuesta.headers?.get?.('Location')
    if (ubicacion) {
      const siguiente = sanitizarUrlTikTok(ubicacion.startsWith('http') ? ubicacion : new URL(ubicacion, url).href)
      id = extraerIdVideo(siguiente)
      if (id || siguiente) return { url: siguiente || url, id }
    }
  } catch {}

  try {
    const respuesta = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': UA, Accept: 'text/html' },
    })
    const urlFinal = sanitizarUrlTikTok(respuesta.url || url)
    id = extraerIdVideo(urlFinal)
    return { url: urlFinal || url, id }
  } catch {
    return { url, id: null }
  }
}

async function tikwmJson(rutaConConsulta) {
  const respuesta = await fetch(`${TIKWM}${rutaConConsulta}`, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      Referer: `${TIKWM}/`,
      Cookie: 'current_language=en'
    }
  })
  const crudo = await respuesta.text()
  if (crudo.trim().startsWith('<')) {
    throw new Error(`TikWM bloqueó la petición (${respuesta.status})`)
  }
  try {
    return JSON.parse(crudo)
  } catch {
    throw new Error('TikWM no devolvió JSON válido')
  }
}

function normalizarVideoTikwm(datos = {}) {
  const play = mediaAbsoluta(datos.hdplay || datos.play || datos.wmplay)
  const imagenes = Array.isArray(datos.images) ? datos.images.map(mediaAbsoluta) : []
  return {
    ...datos,
    play,
    music: mediaAbsoluta(datos.music),
    cover: mediaAbsoluta(datos.cover),
    imagenes,
    type: datos.type || (imagenes.length ? 'image' : 'video')
  }
}

async function descargarDesdeTikwm(urlOrId) {
  const jsonDatos = await tikwmJson(`/api/?url=${encodeURIComponent(urlOrId)}&hd=1`)
  if (jsonDatos?.code !== 0 || !jsonDatos?.data) {
    throw new Error(jsonDatos?.msg || 'TikWM no pudo procesar el enlace')
  }
  const video = normalizarVideoTikwm(jsonDatos.data)
  if (!video.play && !video.images?.length) {
    throw new Error('Sin media descargable en TikWM')
  }
  return video
}

async function descargarDesdeTikmate(url) {
  const respuesta = await fetch('https://api.tikmate.app/api/lookup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': UA,
      Accept: 'application/json',
    },
    body: `url=${encodeURIComponent(url)}`
  })
  const crudo = await respuesta.text()
  if (crudo.trim().startsWith('<')) {
    throw new Error('TikMate bloqueó la petición')
  }
  let datos
  try {
    datos = JSON.parse(crudo)
  } catch {
    throw new Error('TikMate no devolvió JSON válido')
  }
  if (!datos?.success || !datos?.token || !datos?.id) {
    throw new Error(datos?.message || 'TikMate falló')
  }
  return {
    title: datos.desc || 'TikTok',
    author: {
      nickname: datos.author_name,
      unique_id: datos.author_id
    },
    duration: null,
    created_at: datos.create_time,
    cover: datos.cover,
    play: `https://tikmate.app/download/${datos.token}/${datos.id}.mp4`,
    music: '',
    images: [],
    type: 'video'
  }
}

async function descargarDesdeDelirius(url) {
  const base = (global.APIs?.delirius?.url || 'https://api.delirius.online').replace(/\/$/, '')
  const respuesta = await fetch(`${base}/download/tiktok?url=${encodeURIComponent(url)}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  })
  const crudo = await respuesta.text()
  if (crudo.trim().startsWith('<')) throw new Error('Delirius bloqueó la petición')
  let datos
  try {
    datos = JSON.parse(crudo)
  } catch {
    throw new Error('Delirius no devolvió JSON válido')
  }
  if (!datos?.status && datos?.status !== true) {
    throw new Error(datos?.message || datos?.msg || 'Delirius falló')
  }
  const medio = datos.data || datos.result || datos
  const play =
    medio?.video ||
    medio?.play ||
    medio?.hdplay ||
    medio?.url ||
    medio?.media ||
    (Array.isArray(medio?.media) ? medio.media.find(x => x?.url)?.url : '') ||
    ''
  const imagenes = Array.isArray(medio?.images)
    ? medio.images
    : Array.isArray(medio?.media)
      ? medio.media.filter(x => x?.type === 'image').map(x => x.url).filter(Boolean)
      : []
  if (!play && !imagenes.length) throw new Error('Delirius sin media')
  return {
    title: medio?.title || medio?.description || 'TikTok',
    author: {
      nickname: medio?.author || medio?.author?.nickname || medio?.nickname,
      unique_id: medio?.unique_id || medio?.author?.unique_id,
    },
    duration: medio?.duration,
    cover: medio?.cover || medio?.thumbnail,
    play: mediaAbsoluta(play),
    music: mediaAbsoluta(medio?.music || medio?.audio || ''),
    images: imagenes.map(mediaAbsoluta),
    type: imagenes.length && !play ? 'image' : 'video',
  }
}

async function descargarTikTok(inputUrl) {
  const limpio = sanitizarUrlTikTok(inputUrl)
  if (!limpio) throw new Error('Enlace de TikTok inválido')

  const { url, id } = await resolverUrlEntrada(limpio)
  const intentos = []
  if (id) intentos.push(id)
  if (url) intentos.push(url)
  if (limpio) intentos.push(limpio)

  let ultimoError
  for (const objetivo of [...new Set(intentos.filter(Boolean))]) {
    try {
      return await descargarDesdeTikwm(objetivo)
    } catch (e) {
      ultimoError = e
    }
  }

  for (const objetivo of [...new Set([url, limpio].filter(Boolean))]) {
    try {
      return await descargarDesdeTikmate(objetivo)
    } catch (e) {
      ultimoError = e
    }
    try {
      return await descargarDesdeDelirius(objetivo)
    } catch (e) {
      ultimoError = e
    }
  }

  throw ultimoError || new Error('No se pudo descargar el TikTok')
}

async function buscarTikTok(consulta, limite = 3) {

  try {
    const respuesta = await fetch(`${TIKWM}/api/feed/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Cookie: 'current_language=en',
        'User-Agent': UA,
        Referer: `${TIKWM}/`,
        Origin: TIKWM
      },
      body: new URLSearchParams({
        keywords: consulta,
        count: String(Math.max(limite, 10)),
        cursor: '0',
        HD: '1'
      })
    })
    const crudo = await respuesta.text()
    if (!crudo.trim().startsWith('<')) {
      const datos = JSON.parse(crudo)
      const videos = (datos?.data?.videos || []).filter(v => v.play)
      if (videos.length) return videos.slice(0, limite).map(normalizarVideoTikwm)
    }
  } catch {}

  
  const ch = await tikwmJson(
    `/api/challenge/search?keywords=${encodeURIComponent(consulta)}&count=5`
  )
  const desafio = ch?.data?.challenge_list?.[0]
  if (!desafio?.id) {
    throw new Error('Sin resultados de búsqueda')
  }

  const publicaciones = await tikwmJson(
    `/api/challenge/posts?challenge_id=${encodeURIComponent(desafio.id)}&count=${Math.max(limite, 8)}&cursor=0`
  )
  const videos = (publicaciones?.data?.videos || []).filter(v => v.play)
  if (!videos.length) throw new Error('Sin videos para ese término')
  return videos.slice(0, limite).map(normalizarVideoTikwm)
}

function construirLeyenda(video, prefijo = '𝗧𝗜𝗞𝗧𝗢𝗞 𝗩𝗜𝗗𝗘𝗢') {
  return `${prefijo}

> *[+] Título:* ${video.title || 'Sin título'}
> *[+] Autor:* ${video.author?.nickname || video.author?.unique_id || 'Desconocido'}
> *[+] Duración:* ${video.duration || 'N/A'}s`
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(
      m.chat,
      {
        text: `*[❗] Ingresa un término o un enlace de TikTok.*\nEjemplo:\n> ${usedPrefix + command} https://www.tiktok.com/...\n> ${usedPrefix + command} baile`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  const entrada = text.trim()
  const esUrl = RE_URL_TT.test(entrada)

  try {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    if (esUrl) {
      const link = entrada.match(RE_URL_TT)?.[0] || entrada
      const video = await descargarTikTok(link)
      const leyenda = construirLeyenda(video)

      if (video.type === 'image' && video.images?.length) {
        for (const img of video.images.slice(0, 8)) {
          await conn.sendMessage(
            m.chat,
            { image: { url: img }, caption: leyenda, contextInfo: { ...rcanal.contextInfo } },
            { quoted: m }
          )
        }
        if (video.music) {
          await conn.sendMessage(
            m.chat,
            {
              audio: { url: video.music },
              mimetype: 'audio/mp4',
              fileName: 'tiktok_audio.mp4',
              contextInfo: { ...rcanal.contextInfo }
            },
            { quoted: m }
          )
        }
      } else {
        await conn.sendMessage(
          m.chat,
          {
            video: { url: video.play },
            caption: leyenda,
            contextInfo: { ...rcanal.contextInfo }
          },
          { quoted: m }
        )
      }
    } else {
      const resultados = await buscarTikTok(entrada, 3)
      for (let i = 0; i < resultados.length; i++) {
        const vid = resultados[i]
        await conn.sendMessage(
          m.chat,
          {
            video: { url: vid.play },
            caption: construirLeyenda(vid, `𝗧𝗜𝗞𝗧𝗢𝗞 ${i + 1}`),
            contextInfo: { ...rcanal.contextInfo }
          },
          { quoted: m }
        )
      }
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (e) {
    console.error('Error en tiktok2:', e)
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
    conn.sendMessage(
      m.chat,
      {
        text: `*[❗] Ocurrió un error al procesar TikTok.*\n> ${e?.message || e}`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }
}

handler.help = ['tiktok2 <búsqueda | link>']
handler.tags = ['downloader']
handler.command = ['tiktok2', 'tt2', 'tiktoks2', 'tts2']

export default handler

export { sanitizarUrlTikTok as sanitizeTikTokUrl, descargarTikTok as downloadTikTok, buscarTikTok as searchTikTok, mediaAbsoluta as absMedia }
