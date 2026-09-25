import fetch from "node-fetch"

const SEP = '┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈'
const MARCA = '𓂃 ࣪ ִֶָ☾.'
const tip = (v) => `\`${String(v ?? '').replace(/`/g, "'")}\``

function nombreAutor(autor) {
  if (!autor) return '—'
  if (typeof autor === 'string') return autor.trim() || '—'
  return autor.name || autor.channel || '—'
}

function textoPlay({ titulo, canal, duracion, url }) {
  return `
ㅤ
${MARCA}  *play*
_${titulo || 'audio'}_

${SEP}
*audio*
título  ·  ${tip(titulo || '—')}
canal  ·  ${tip(canal || '—')}
duración  ·  ${tip(duracion || '—')}

${SEP}
> ${tip(url || '—')}
ㅤ`.trim()
}

const handler = async (m, { conn, text, usedPrefix }) => {
  try {
    if (!text?.trim())
      return conn.sendMessage(m.chat, {
        text: `
ㅤ
${MARCA}  *play*
_falta la canción_

${SEP}
> ${tip(`${usedPrefix}play <nombre o link>`)}
ㅤ`.trim(),
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })

    const esUrl = /youtu\.be|youtube\.com/.test(text)
    let urlVideo
    let titulo = "Desconocido"
    let autor = { name: "Desconocido" }
    let duracion = "Desconocido"
    let urlMiniatura

    if (esUrl) {
      urlVideo = text.trim()
    } else {
      
      const urlBusqueda = `https://api.delirius.online/search/ytsearch?q=${encodeURIComponent(text)}`
      const resBusqueda = await fetch(urlBusqueda).then(r => r.json())
      if (!resBusqueda?.status || !Array.isArray(resBusqueda.data) || resBusqueda.data.length === 0)
        throw "sin resultados"
      const primero = resBusqueda.data[0]
      urlVideo = primero.url || `https://youtu.be/${primero.videoId}`
      titulo = primero.title || titulo
      autor = primero.author || autor
      duracion = primero.duration || duracion
      urlMiniatura = primero.image || primero.thumbnail
    }

    
    const apiDescarga = `https://api.delirius.online/download/ytmp3?url=${encodeURIComponent(urlVideo)}`
    const resDescarga = await fetch(apiDescarga).then(r => r.json())
    if (!resDescarga?.status || !resDescarga.data)
      throw "no se pudo obtener el audio"

    const datosInfo = resDescarga.data
    const urlAudio = typeof datosInfo.download === "string" ? datosInfo.download : datosInfo.download?.url
    const portada = datosInfo.image || urlMiniatura
    titulo = datosInfo.title || titulo
    autor = datosInfo.author || datosInfo.channel || autor
    duracion = datosInfo.duration || datosInfo.timestamp || duracion

    if (!urlAudio)
      throw "no se encontró el audio"

    const informacion = textoPlay({
      titulo,
      canal: nombreAutor(autor),
      duracion,
      url: urlVideo
    })

    let envioPortada = false
    if (portada) {
      try {
        const miniatura = (await conn.getFile(portada)).data
        await conn.sendMessage(m.chat, { image: miniatura, caption: informacion, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
        envioPortada = true
      } catch {}
    }
    if (!envioPortada) {
      await conn.sendMessage(m.chat, { text: informacion, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
    }

   
    await conn.sendMessage(
      m.chat,
      { audio: { url: urlAudio }, fileName: `${titulo}.mp3`, mimetype: "audio/mpeg" },
      { quoted: m }
    )

  } catch (e) {
    const detalle = typeof e === "string" ? e : (e?.message || "no se pudo descargar")
    return conn.sendMessage(m.chat, {
      text: `
ㅤ
${MARCA}  *play*
_no se pudo enviar_

${SEP}
${tip(detalle)}
> ${tip(`${usedPrefix}play <nombre o link>`)}
ㅤ`.trim(),
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.command = ["play", "ytmp3", "playaudio"]
handler.tags = ["descargas"]
handler.group = true

export default handler

function formatearVistas(views) {
  if (views === undefined) return "No disponible"
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B (${views.toLocaleString()})`
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M (${views.toLocaleString()})`
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}k (${views.toLocaleString()})`
  return views.toString()
}