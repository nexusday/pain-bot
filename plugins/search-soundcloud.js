import fetch from 'node-fetch'
import { esModoIos } from '../lib/menu-modo.js'

const API_BASE = () => (global.APIs?.delirius?.url || 'https://api.delirius.online').replace(/\/$/, '')
const LIMITE_RESULTADOS = 5

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

function formatearReproducciones(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v)
}

function artistaDe(elemento = {}) {
  return (
    recortarTexto(elemento.artist, 40) ||
    recortarTexto(elemento.author, 40) ||
    recortarTexto(elemento.genre, 30) ||
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

async function buscarUnaVez(consulta) {
  const urlBusqueda = `${API_BASE()}/search/soundcloud?q=${encodeURIComponent(consulta)}`
  const respuesta = await fetch(urlBusqueda, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PainBot/1.0'
    }
  })
  const crudo = await respuesta.text()
  let resBusqueda
  try {
    resBusqueda = JSON.parse(crudo)
  } catch {
    throw `[❗] La API de búsqueda no devolvió JSON válido (${respuesta.status}).`
  }
  if (!respuesta.ok) throw `[❗] Error API SoundCloud (${respuesta.status}).`
  const lista = Array.isArray(resBusqueda?.data) ? resBusqueda.data : []
  return lista
    .map(elemento => ({ ...elemento, link: enlacePista(elemento) }))
    .filter(t => t.link)
}

async function buscarSoundCloud(consulta) {
  for (const q of construirVariantesConsulta(consulta)) {
    const lista = await buscarUnaVez(q)
    if (lista.length) {
      console.log(`[scsearch] ok q="${q}" (orig="${consulta}") n=${lista.length}`)
      return { queryUsed: q, results: lista }
    }
  }
  throw (
    `[❗] No se encontraron resultados en SoundCloud.\n` +
    `> Búsqueda: *${consulta}*\n` +
    `> Prueba con menos palabras o corrige el nombre.`
  )
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa el nombre de la canción.\n\n> *Ejemplo:*\n${usedPrefix + command} como me encanta`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const consulta = text.trim()
    await conn.sendMessage(m.chat, { react: { text: '', key: m.key } }).catch(() => {})

    const busqueda = await buscarSoundCloud(consulta)
    const consultaUsada = busqueda.queryUsed || consulta
    const resultados = busqueda.results.slice(0, LIMITE_RESULTADOS)

    if (!global.lastScSearch) global.lastScSearch = {}
    global.lastScSearch[m.sender] = {
      query: consultaUsada,
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

    const tarjetas = []
    resultados.forEach((elemento, i) => {
      if (!elemento.image) return
      tarjetas.push({
        image: { url: elemento.image },
        caption: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${recortarTexto(elemento.title, 70) || 'SoundCloud'}*
╰─ ✧  ✩
┊ artista  ·  \`${artistaDe(elemento)}\`
┊ duración  ·  \`${formatearDuracion(elemento.duration)}\`
┊ plays  ·  \`${formatearReproducciones(elemento.play)}\`
╰─────────`.trim(),
        footer: 'descargar',
        nativeFlow: [{ text: 'Descargar', id: `${usedPrefix}sc ${i + 1}` }]
      })
    })

    if (esModoIos(conn) || !tarjetas.length) {
      const lista = resultados.map((elemento, i) => (
        `*${i + 1}.* ${recortarTexto(elemento.title, 70)}\n` +
        `┊ artista  ·  \`${artistaDe(elemento)}\`\n` +
        `┊ duración  ·  \`${formatearDuracion(elemento.duration)}\`\n` +
        `> ${usedPrefix}sc ${i + 1}`
      )).join('\n\n')
      await conn.sendMessage(m.chat, {
        text: lista,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    } else {
      await conn.sendMessageLia(m.chat, {
        text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *SoundCloud*
╰─ ✧  ✩
┊ búsqueda  ·  \`${recortarTexto(consultaUsada, 40)}\`
┊ resultados  ·  \`${tarjetas.length}\`
╰─────────`.trim(),
        footer: 'descargar',
        cards: tarjetas,
        linkPreview: null
      }, { quoted: m, keepQuoted: true })
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } catch (e) {
    console.error('Error en scsearch:', e)
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string' ? e : `[❗] Error al buscar en SoundCloud.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['scsearch <búsqueda>', 'scs <búsqueda>']
handler.tags = ['descargas']
handler.command = ['scsearch', 'scs', 'soundcloudsearch']
handler.group = true

export default handler
