import fetch from "node-fetch"

let handler = async (m, { conn, text, args, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Ingresa un enlace de *Facebook\n\n> Ejemplo:\n${usedPrefix + command} https://www.facebook.com/share/r/16sXMhKi6e/`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }

  try {
    const url = `https://api.vreden.my.id/api/v1/download/facebook?url=${encodeURIComponent(args[0])}`
    const respuesta = await fetch(url)
    const jsonDatos = await respuesta.json()

    if (!jsonDatos.status || !jsonDatos.result?.download) {
      return conn.sendMessage(m.chat, {
        text: `[❌]︎ No se pudo obtener el video.`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const { titulo, durasi, download } = jsonDatos.result
    const urlVideo = download.hd || download.sd

    if (!urlVideo) {
      return conn.sendMessage(m.chat, {
        text: `[❗] ︎ No se encontró un link válido de descarga.`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      video: { url: urlVideo },
      fileName: "facebook.mp4",
      caption: `*𓂃 ࣪ ִֶָ☾. *Aqui esta tu video*\n\n> *Título:* ${titulo}\n> *Duración:* ${durasi}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })

  } catch (e) {
    console.error('Error en Facebook:', e)
    await conn.sendMessage(m.chat, {
      text: `[❗] Se produjo un error al procesar Facebook\n> Usa *${usedPrefix}report* para informarlo.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['facebook <url>', 'fb <url>']
handler.tags = ['downloader']
handler.command = ['facebook', 'fb']
handler.group = true

export default handler