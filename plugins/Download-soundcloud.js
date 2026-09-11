import fetch from 'node-fetch'

const API_BASE = () => (global.APIs?.delirius?.url || 'https://api.delirius.online').replace(/\/$/, '')
const LIMITE_RESULTADOS = 8

function recortarTexto(text = '', max = 100) {
  const valor = String(text).replace(/\s+/g, ' ').trim()
  if (!valor || valor === '-') return ''
  return valor.length > max ? `${valor.slice(0, max - 1)}…` : valor
}

function formatearDuracion(ms) {
  if (!ms || ms <= 0) return '--:--'
  const seg = Math.floor(Number(ms) / 1000)
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function limpiarNombreArchivo(titulo = 'audio') {
  return String(titulo)
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'soundcloud'
}

function artistaDe(elemento = {}) {
  return (
    recortarTexto(elemento.artist, 50) ||
    recortarTexto(elemento.author, 50) ||
    recortarTexto(elemento.label_name, 40) ||
    'SoundCloud'
  )
}

function enlacePista(elemento = {}) {
  return elemento.link || elemento.url || elemento.permalink_url || ''
}


function construirVariantesConsulta(consulta) {
  const q = String(consulta || '').replace(/\s+/g, ' ').trim()
  if (!q) return []
  const palabras = q.split(' ')
  const variantes = [q]

  for (let i = palabras.length - 1; i >= 2; i--) {
    variantes.push(palabras.slice(0, i).join(' '))
  }
  if (palabras.length >= 2) variantes.push(palabras.slice(-2).join(' '))
  if (palabras.length >= 3) variantes.push(palabras.slice(0, 3).join(' '))
  if (palabras.length >= 1) variantes.push(palabras[palabras.length - 1])

  return [...new Set(variantes.filter(Boolean))]
}

async function apiJson(rutaConConsulta) {
  const url = `${API_BASE()}${rutaConConsulta}`
  const respuesta = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PainBot/1.0'
    }
  })
  const crudo = await respuesta.text()
  let jsonDatos
  try {
    jsonDatos = JSON.parse(crudo)
  } catch {
    throw `[❗] La API de SoundCloud no devolvió JSON válido (${respuesta.status}).\n> ${url}`
  }
  if (!respuesta.ok) {
    throw `[❗] Error API SoundCloud (${respuesta.status}).`
  }
  return jsonDatos
}

async function buscarUnaVez(consulta) {
  const resBusqueda = await apiJson(`/search/soundcloud?q=${encodeURIComponent(consulta)}`)
  const lista = Array.isArray(resBusqueda?.data) ? resBusqueda.data : []
  return lista
    .map(elemento => ({ ...elemento, link: enlacePista(elemento) }))
    .filter(t => t.link)
}

async function buscarPistas(consulta, limite = LIMITE_RESULTADOS) {
  const variantes = construirVariantesConsulta(consulta)
  let ultimoConteo = 0

  for (const q of variantes) {
    const lista = await buscarUnaVez(q)
    ultimoConteo = lista.length
    if (lista.length) {
      console.log(`[sc] search ok q="${q}" (orig="${consulta}") n=${lista.length}`)
      return lista.slice(0, limite)
    }
  }

  throw (
    `[❗] No se encontraron resultados en SoundCloud.\n` +
    `> Búsqueda: *${consulta}*\n` +
    `> Prueba con menos palabras o corrige el nombre.\n` +
    `> Ej: *como me encanta* / *kevin kaarl*`
  )
}

async function descargarPista(scUrl) {
  const resDescarga = await apiJson(`/download/soundcloud?url=${encodeURIComponent(scUrl)}`)
  if (!resDescarga?.status || !resDescarga.data) {
    throw '[❗] No se pudo descargar el audio de SoundCloud.'
  }
  if (!resDescarga.data.download) throw '[❗] No se encontró el enlace MP3.'
  return resDescarga.data
}

async function obtenerBufer(url) {
  const respuesta = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PainBot/1.0' }
  })
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
  return Buffer.from(await respuesta.arrayBuffer())
}

function recordarBusqueda(sender, consulta, resultados) {
  if (!global.lastScSearch) global.lastScSearch = {}
  global.lastScSearch[sender] = {
    query: consulta,
    results: resultados.map(r => ({
      title: r.title,
      link: r.link,
      image: r.image,
      artist: artistaDe(r),
      duration: r.duration,
      play: r.play
    })),
    at: Date.now()
  }
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text:
          `ִֶָ☾. Ingresa búsqueda, enlace o número.\n\n` +
          `> ${usedPrefix + command} <búsqueda>\n` +
          `> ${usedPrefix + command} <enlace>\n` +
          `> ${usedPrefix + command} <número>\n\n` +
          `> Lista: *${usedPrefix}scsearch <texto>*\n` +
          `> *Ejemplo:*\n${usedPrefix + command} como me encanta`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const entrada = text.trim()
    let enlaceSc = null
    let vistaPrevia = null

    const esUrl = /soundcloud\.com/i.test(entrada)

    if (esUrl) {
      enlaceSc = entrada.split(/\s+/)[0]
    } else if (/^\d+$/.test(entrada)) {
      const indice = parseInt(entrada, 10) - 1
      const cacheBusqueda = global.lastScSearch?.[m.sender]
      if (!cacheBusqueda?.results?.length || Date.now() - cacheBusqueda.at > 10 * 60 * 1000) {
        throw `[❗] No hay búsqueda reciente. Usa primero *${usedPrefix}scsearch <texto>* o *${usedPrefix}sc <búsqueda>*.`
      }
      if (indice < 0 || indice >= cacheBusqueda.results.length) {
        throw `[❗] Elige un número del 1 al ${cacheBusqueda.results.length}.`
      }
      enlaceSc = cacheBusqueda.results[indice].link
      vistaPrevia = cacheBusqueda.results[indice]
    } else {
      await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})
      const resultados = await buscarPistas(entrada)
      recordarBusqueda(m.sender, entrada, resultados)
      const primero = resultados[0]
      enlaceSc = primero.link
      vistaPrevia = primero
    }

    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})
    await conn.sendPresenceUpdate('composing', m.chat).catch(() => {})

    const datos = await descargarPista(enlaceSc)
    const titulo = datos.title || vistaPrevia?.title || 'SoundCloud'
    const autor = recortarTexto(datos.author, 50) || artistaDe(vistaPrevia || {}) || 'SoundCloud'
    const portada = datos.image || vistaPrevia?.image
    const duracion = formatearDuracion(datos.duration)
    const esVistaPrevia = Number(datos.duration) > 0 && Number(datos.duration) <= 35000

    const informacion =
      `ִֶָ☾. 𝗦𝗼𝘂𝗻𝗱𝗖𝗹𝗼𝘂𝗱 ִֶָ☾.\n` +
      ` 𓍯  *Título:* ${recortarTexto(titulo, 90)}\n` +
      ` 𓍯  *Autor:* ${autor}\n` +
      ` 𓍯  *Duración:* ${duracion}${esVistaPrevia ? ' _(preview)_' : ''}\n` +
      ` 𓍯  *Reproducciones:* ${datos.playbacks ?? vistaPrevia?.play ?? '—'}\n` +
      ` 𓍯  *Enlace:* ${datos.link || enlaceSc}`

    if (portada) {
      try {
        const miniatura = await obtenerBufer(portada)
        await conn.sendMessage(
          m.chat,
          { image: miniatura, caption: informacion, contextInfo: { ...rcanal?.contextInfo } },
          { quoted: m }
        )
      } catch {
        await conn.sendMessage(
          m.chat,
          { text: informacion, contextInfo: { ...rcanal?.contextInfo } },
          { quoted: m }
        )
      }
    } else {
      await conn.sendMessage(
        m.chat,
        { text: informacion, contextInfo: { ...rcanal?.contextInfo } },
        { quoted: m }
      )
    }

    const audio = await obtenerBufer(datos.download)
    await conn.sendMessage(
      m.chat,
      {
        audio,
        fileName: `${limpiarNombreArchivo(titulo)}.mp3`,
        mimetype: 'audio/mpeg'
      },
      { quoted: m }
    )

    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})
    await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
  } catch (e) {
    console.error('Error en soundcloud download:', e)
    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})
    return conn.sendMessage(m.chat, {
      text:
        typeof e === 'string'
          ? e
          : `[❌] Se ha producido un problema.\n> Usa *${usedPrefix}report* para informarlo.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['sc <búsqueda/url/número>', 'soundcloud <búsqueda>']
handler.tags = ['descargas']
handler.command = ['sc', 'soundcloud', 'scdl', 'scloud']
handler.group = true

export default handler
