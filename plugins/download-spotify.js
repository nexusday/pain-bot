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
    const descarga = d?.download || d?.url

    if (!respuesta.data?.status || !descarga) throw new Error("⚠︎ No se pudo obtener el audio.")

    const datos = {
      title: d.title || informacion?.title || "Desconocido",
      artist: d.author || informacion?.artist || "Desconocido",
      album: informacion?.album || "Desconocido",
      duration: informacion?.duration || null,
      popularity: informacion?.popularity || "Desconocido",
      release: informacion?.release || "Desconocido",
      image: d.image || informacion?.image,
      download: descarga,
      url: informacion?.url || urlPista
    }

    
    const lineas = [
      ['autor', datos.artist],
      datos.album && datos.album !== 'Desconocido' ? ['álbum', datos.album] : null,
      datos.duration ? ['duración', datos.duration] : null,
      datos.popularity && datos.popularity !== 'Desconocido' ? ['popularidad', datos.popularity] : null,
      datos.release && datos.release !== 'Desconocido' ? ['publicado', datos.release] : null
    ].filter(Boolean)
    const leyenda = ficha(datos.title, lineas, datos.url)

    let envioPortada = false
    if (datos.image) {
      try {
        const miniatura = (await conn.getFile(datos.image)).data
        await conn.sendMessage(m.chat, {
          image: miniatura,
          caption: leyenda,
          contextInfo: { ...rcanal?.contextInfo }
        }, { quoted: m })
        envioPortada = true
      } catch {}
    }
    if (!envioPortada) {
      await conn.sendMessage(m.chat, {
        text: leyenda,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    
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

function ficha(titulo, lineas, enlace) {
  const cuerpo = lineas
    .map(([nombre, valor]) => `┊ ${nombre}  ·  \`${String(valor).replace(/`/g, "'")}\``)
    .join('\n')
  const link = enlace ? `\n┊ \`${String(enlace).replace(/`/g, "'")}\`` : ''
  return `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${String(titulo || 'Spotify').replace(/\s+/g, ' ').slice(0, 70)}*
╰─ ✧  ✩
${cuerpo}${link}
╰─────────`.trim()
}