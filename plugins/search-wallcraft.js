import fetch from 'node-fetch'
import { esModoIos } from '../lib/menu-modo.js'

const LIMITE_RESULTADOS = 4

function recortarTexto(text = '', max = 120) {
  const valor = String(text).replace(/\s+/g, ' ').trim()
  if (!valor || valor === '-') return ''
  return valor.length > max ? `${valor.slice(0, max - 1)}…` : valor
}

function construirLeyenda(elemento) {
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${recortarTexto(elemento.description, 60) || 'Wallpaper'}*
╰─ ✧  ✩
┊ autor  ·  \`${recortarTexto(elemento.author, 40) || 'Desconocido'}\`
┊ rating  ·  \`${elemento.rating ?? '—'}\`
┊ descargas  ·  \`${Number(elemento.downloads || 0).toLocaleString()}\`
╰─────────`.trim()
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa qué wallpaper buscar.\n\n> *Ejemplo:*\n${usedPrefix + command} pain`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const consulta = text.trim()
    const urlBusqueda = `https://api.delirius.online/search/wallcraft?query=${encodeURIComponent(consulta)}`
    const resBusqueda = await fetch(urlBusqueda).then(r => r.json())

    if (!resBusqueda?.status || !Array.isArray(resBusqueda.data) || !resBusqueda.data.length) {
      throw '[❗] No se encontraron wallpapers para esa búsqueda.'
    }

    const resultados = resBusqueda.data
      .filter(elemento => elemento?.download)
      .slice(0, LIMITE_RESULTADOS)

    if (!resultados.length) {
      throw '[❗] No hay imágenes disponibles para descargar.'
    }

   

    if (esModoIos(conn)) {
      for (const elemento of resultados) {
        await conn.sendMessage(m.chat, {
          image: { url: elemento.download },
          caption: construirLeyenda(elemento),
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: m })
      }
      return
    }

    const tarjetas = resultados.map(elemento => ({
      image: { url: elemento.download },
      caption: construirLeyenda(elemento),
      footer: 'copiar enlace',
      nativeFlow: [{ text: 'Copiar', copy: elemento.download }]
    }))

    await conn.sendMessageLia(m.chat, {
      text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *Wallpaper*
╰─ ✧  ✩
┊ búsqueda  ·  \`${recortarTexto(consulta, 40)}\`
┊ resultados  ·  \`${tarjetas.length}\`
╰─────────`.trim(),
      footer: 'desliza',
      cards: tarjetas,
      linkPreview: null
    }, { quoted: m, keepQuoted: true })
  } catch (e) {
    console.error('Error en wallcraft:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string' ? e : `[❗] Error al buscar wallpapers.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['wall <búsqueda> → 4 wallpapers con descripción']
handler.tags = ['descargas', 'imagenes']
handler.command = ['wall', 'wallcraft', 'wallpaper', 'fondo']

export default handler
