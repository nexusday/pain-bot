import fetch from "node-fetch"

let handler = async (m, { conn, text, args, usedPrefix, command }) => {
  if (!text) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Ingresa un enlace de *Instagram\n\n> Ejemplo:\n${usedPrefix + command} https://www.instagram.com/reel/C6AtQa1LEX0/`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }

  try {
    const url = `https://api.vreden.my.id/api/v1/download/instagram?url=${encodeURIComponent(args[0])}`
    const res = await fetch(url)
    const json = await res.json()

    if (!json.status || !json.result?.data?.length) {
      return conn.sendMessage(m.chat, {
        text: `[❗] No se pudo obtener el contenido.`,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

    const { profile, caption, statistics, data } = json.result
    const media = data[0] 

    let captionMsg = `> *Usuario:* ${profile?.username || '-'}\n> *Nombre:* ${profile?.full_name || '-'}\n> *Likes:* ${statistics?.like_count || 0}\n> *Comentarios:* ${statistics?.comment_count || 0}\n> *Descripción:* ${caption.text}\n`

    if (media.type === "video") {
      await conn.sendMessage(m.chat, {
        video: { url: media.url },
        fileName: "instagram.mp4",
        caption: captionMsg,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    } else {
      await conn.sendMessage(m.chat, {
        image: { url: media.url },
        caption: captionMsg,
        contextInfo: { ...rcanal?.contextInfo }
      }, { quoted: m })
    }

  } catch (e) {
    console.error('Error en Instagram:', e)
    await conn.sendMessage(m.chat, {
      text: `[❗] Se produjo un error al procesar Instagram.\n> Usa *${usedPrefix}report* para informarlo.\n\n${e.message}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['instagram <url>', 'ig <url>']
handler.tags = ['downloader']
handler.command = ['instagram', 'ig']
handler.group = true

export default handler