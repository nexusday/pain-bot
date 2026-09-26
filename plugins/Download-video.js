import fetch from 'node-fetch'

const RE_URL_YT = /youtu\.be|youtube\.com/i
const LIMITE_RESULTADOS = 5

function recortarTexto(text = '', max = 100) {
  const valor = String(text).replace(/\s+/g, ' ').trim()
  if (!valor || valor === '-') return ''
  return valor.length > max ? `${valor.slice(0, max - 1)}…` : valor
}

function normalizarFormato(crudo = '360') {
  const valor = String(crudo).trim().toLowerCase().replace(/p$/, '')
  if (!/^\d{3,4}$/.test(valor)) return '360p'
  return `${valor}p`
}

function formatearVistas(n) {
  const v = Number(n) || 0
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`
  return String(v || '—')
}

function limpiarNombreArchivo(titulo = 'video') {
  return String(titulo)
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'video'
}

async function buscarPrimero(consulta) {
  const urlBusqueda = `https://api.delirius.online/search/ytsearch?q=${encodeURIComponent(consulta)}`
  const resBusqueda = await fetch(urlBusqueda).then(r => r.json())
  if (!resBusqueda?.status || !Array.isArray(resBusqueda.data) || !resBusqueda.data.length) {
    throw '[❗] No se encontraron resultados para la búsqueda.'
  }
  return resBusqueda.data[0]
}

async function descargarVideo(urlVideo, formato) {
  const apiDescarga = `https://api.delirius.online/download/ytmp4?url=${encodeURIComponent(urlVideo)}&format=${encodeURIComponent(formato)}`
  const resDescarga = await fetch(apiDescarga).then(r => r.json())
  if (!resDescarga?.status || !resDescarga.data) {
    throw '[❗] No se pudo obtener el video desde la URL.'
  }
  return resDescarga.data
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim()) {
      return conn.sendMessage(m.chat, {
        text: `ִֶָ☾. Ingresa búsqueda, enlace o número.\n\n> ${usedPrefix + command} <búsqueda>\n> ${usedPrefix + command} <enlace>\n> ${usedPrefix + command} <número>\n\n> *Ejemplo:*\n${usedPrefix + command} its you`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    let entrada = text.trim()
    let formato = '360p'

    const coincidenciaFormato = entrada.match(/^(.+?)\s*(?:\||\s)\s*(\d{3,4})p?$/i)
    if (coincidenciaFormato) {
      entrada = coincidenciaFormato[1].trim()
      formato = normalizarFormato(coincidenciaFormato[2])
    }

    let urlVideo = null
    let vistaPrevia = null

    const citado = m.mtype === 'interactiveResponseMessage' ? null : m
    const enlace = (entrada.match(/https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/\S+|youtu\.be\/\S+)/i) || [''])[0]

    if (enlace) {
      urlVideo = enlace
    } else if (/^\d+$/.test(entrada)) {
      const indice = parseInt(entrada, 10) - 1
      const cacheBusqueda = global.lastYtSearch?.[m.sender]
      if (!cacheBusqueda?.results?.length || Date.now() - cacheBusqueda.at > 10 * 60 * 1000) {
        throw `[❗] No hay búsqueda reciente. Usa primero *${usedPrefix}yt <texto>*`
      }
      if (indice < 0 || indice >= cacheBusqueda.results.length) {
        throw `[❗] Elige un número del 1 al ${cacheBusqueda.results.length}.`
      }
      urlVideo = cacheBusqueda.results[indice].url
      vistaPrevia = cacheBusqueda.results[indice]
    } else {
      const primero = await buscarPrimero(entrada)
      urlVideo = primero.url || `https://youtu.be/${primero.videoId}`
      vistaPrevia = primero
    }

    await conn.sendPresenceUpdate('composing', m.chat).catch(() => {})

    const datos = await descargarVideo(urlVideo, formato)
    const descargaVideo = typeof datos.download === 'string' ? datos.download : datos.download?.url
    if (!descargaVideo) throw '[❗] No se encontró la URL del video.'

    const titulo = datos.title || vistaPrevia?.title || 'Video'
    const canal = datos.author || datos.channel || vistaPrevia?.author?.name || 'Desconocido'
    const duracion = vistaPrevia?.duration || datos.duration || '—'
    const portada = datos.image || vistaPrevia?.image || vistaPrevia?.thumbnail

    const informacion = `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${recortarTexto(titulo, 70)}*
╰─ ✧  ✩
┊ canal  ·  \`${recortarTexto(canal, 40)}\`
┊ duración  ·  \`${duracion}\`
┊ vistas  ·  \`${formatearVistas(datos.views || vistaPrevia?.views)}\`
┊ formato  ·  \`${datos.format || formato}\`
┊ \`${urlVideo}\`
╰─────────`.trim()

    if (portada) {
      try {
        const miniatura = (await conn.getFile(portada)).data
        await conn.sendMessage(m.chat, {
          image: miniatura,
          caption: informacion,
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: citado })
      } catch {
        await conn.sendMessage(m.chat, {
          text: informacion,
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: citado })
      }
    } else {
      await conn.sendMessage(m.chat, {
        text: informacion,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: citado })
    }

    enviarVideoAlFondo(conn, m, descargaVideo, titulo, informacion, citado)
    await conn.sendPresenceUpdate('paused', m.chat).catch(() => {})
  } catch (e) {
    console.error('Error en download-video:', e)
    return conn.sendMessage(m.chat, {
      text: typeof e === 'string'
        ? e
        : `[❌] Se ha producido un problema.\n> Usa *${usedPrefix}report* para informarlo.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

function enviarVideoAlFondo(conn, m, url, titulo, informacion, citado) {
  setTimeout(() => {
    (async () => {
      try {
        await conn.sendMessage(m.chat, {
          video: { url },
          caption: informacion,
          fileName: `${limpiarNombreArchivo(titulo)}.mp4`,
          mimetype: 'video/mp4'
        }, { quoted: citado })
      } catch (error) {
        try {
          const respuesta = await fetch(url)
          if (!respuesta.ok) throw error
          const bufer = Buffer.from(await respuesta.arrayBuffer())
          await conn.sendMessage(m.chat, {
            video: bufer,
            caption: informacion,
            fileName: `${limpiarNombreArchivo(titulo)}.mp4`,
            mimetype: 'video/mp4'
          }, { quoted: citado })
        } catch (e) {
          console.error('Error enviando video en segundo plano:', e?.message || e)
          await conn.sendMessage(m.chat, {
            text: '[❌] No se pudo enviar el video.',
            contextInfo: { ...rcanal?.contextInfo }
          }, { quoted: m }).catch(() => {})
        }
      }
    })().catch((e) => console.error('video fondo:', e?.message || e))
  }, 0)
}

handler.help = ['video <búsqueda/url/número>', 'ytmp4 <enlace>']
handler.command = ['download', 'downloadvideo', 'ytmp4', 'video', 'ytvideo']
handler.tags = ['descargas']
handler.group = true

export default handler
