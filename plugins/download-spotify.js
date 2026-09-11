import axios from "axios"

const handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) {
    return m.reply(`*[❗] Ingresa el nombre de una canción o un enlace de Spotify.*\nEjemplo: ${usedPrefix + command} Linkin Park Numb`)
  }

  try {

    const esUrl = /https?:\/\/(open\.)?spotify\.com\/track\/[a-zA-Z0-9]+/.test(text)
    let urlPista = text
    let informacion = null

    
    if (!esUrl) {
      const busqueda = await axios.get(`${global.APIs.delirius.url}/search/spotify?q=${encodeURIComponent(text)}&limit=1`)
      const resultado = Array.isArray(busqueda.data?.data) ? busqueda.data.data[0] : null

      if (!resultado?.url) throw new Error("⚠︎ No se encontraron resultados.")

      urlPista = resultado.url
      informacion = {
        title: resultado.title || "Desconocido",
        artist: resultado.artist || "Desconocido",
        album: resultado.album || "Desconocido",
        duration: resultado.duration || null,
        popularity: resultado.popularity || null,
        release: resultado.publish || null,
        image: resultado.image || null,
        url: resultado.url
      }
    }

    
    const respuesta = await axios.get(`${global.APIs.delirius.url}/download/spotifydl?url=${encodeURIComponent(urlPista)}`)
    const d = respuesta.data?.data

    if (!respuesta.data?.status || !d?.url) throw new Error("⚠︎ No se pudo obtener el audio.")

    const datos = {
      title: d.title || informacion?.title || "Desconocido",
      artist: d.author || informacion?.artist || "Desconocido",
      album: informacion?.album || "Desconocido",
      duration: informacion?.duration || `${Math.floor(d.duration / 60000)}:${String(Math.floor((d.duration % 60000) / 1000)).padStart(2, '0')}`,
      popularity: informacion?.popularity || "Desconocido",
      release: informacion?.release || "Desconocido",
      type: d.type,
      source: d.source,
      image: d.image || informacion?.image,
      download: d.url,
      url: informacion?.url || urlPista
    }

    
    const leyenda = `╭───「 ✦ 𝗦𝗣𝗢𝗧𝗜𝗙𝗬 ✦ 」\n│\n` +
      `│  *Título:* ${datos.title}\n` +
      `│  *Autor:* ${datos.artist}\n` +
      `${datos.album && datos.album !== "Desconocido" ? `│  *Álbum:* ${datos.album}\n` : ''}` +
      `${datos.duration ? `│  *Duración:* ${datos.duration}\n` : ''}` +
      `${datos.popularity && datos.popularity !== "Desconocido" ? `│  *Popularidad:* ${datos.popularity}\n` : ''}` +
      `${datos.release && datos.release !== "Desconocido" ? `│  *Publicado:* ${datos.release}\n` : ''}` +
      `${datos.url ? `│  *Enlace:* ${datos.url}\n` : ''}` +
      `╰───「 ✦ ${global.packname} ✦ 」`

await conn.sendMessage(m.chat, {
  text: leyenda,
  contextInfo: {
    externalAdReply: {
      showAdAttribution: true,
      containsAutoReply: true,
      renderLargerThumbnail: true,
      title: '🎵 Spotify Downloader',
      body: `Autor: ${datos.artist}`, 
      mediaType: 1,
      thumbnailUrl: datos.image,
      mediaUrl: datos.url,
      sourceUrl: datos.url,
    }
  }
}, { quoted: m })

    
    await conn.sendMessage(m.chat, {
      audio: { url: datos.download },
      fileName: `${datos.title}.mp3`,
      mimetype: 'audio/mpeg'
    }, { quoted: m })


  } catch (err) {
    console.error("Error en Spotify:", err)
    m.reply(`⚠︎ Ocurrió un problema.\n> Usa *${usedPrefix}report* para informarlo.\n\n${err.message}`)
  }
}

handler.help = ["spotify <canción | link>"]
handler.tags = ["downloader"]
handler.command = ["spotify", "splay"]
handler.group = true

export default handler