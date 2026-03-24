import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, {
    text: `[❗] Ingresa un texto para buscar una imagen\n> *Ejemplo:* ${usedPrefix + command} gatos`,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })

  try {

    const urls = await getGoogleImageSearch(text)

    if (urls.length < 2) return conn.sendMessage(m.chat, {
      text: '[❗] No se encontraron suficientes imágenes para un álbum',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })

    const caption = `𓂃 ࣪ ִֶָ☾. Resultados de búsqueda para: *${text}*`

    for (let url of urls.slice(0, 3)) {
      await conn.sendMessage(m.chat, {
        image: { url },
        caption,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }


  } catch (error) {

    conn.sendMessage(m.chat, {
      text: `[❗] Se produjo un error al buscar la imagen\n> Usa *${usedPrefix}report* para informarlo.\n\n${error.message}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['imagen <texto>']
handler.tags = ['busqueda']
handler.command = ['imagen', 'image']

export default handler

async function getGoogleImageSearch(query) {
  const apis = [
    `${global.APIs.delirius.url}/search/gimage?query=${encodeURIComponent(query)}`,
    `${global.APIs.siputzx.url}/api/images?query=${encodeURIComponent(query)}`
  ]

  for (const url of apis) {
    try {
      const res = await fetch(url)
      const data = await res.json()

      if (Array.isArray(data?.data)) {
        const urls = data.data
          .map(d => d.url)
          .filter(u => typeof u === 'string' && u.startsWith('http'))

        if (urls.length) return urls
      }
    } catch { /* ignorar errores de una API y seguir con la otra */ }
  }

  return []
}