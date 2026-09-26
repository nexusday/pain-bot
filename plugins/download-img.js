import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, {
    text: `[❗] Ingresa un texto para buscar una imagen\n> *Ejemplo:* ${usedPrefix + command} gatos`,
    contextInfo: { ...rcanal.contextInfo }
  }, { quoted: m })

  try {

    const urls = await obtenerBusquedaImagenGoogle(text)

    if (urls.length < 2) return conn.sendMessage(m.chat, {
      text: '[❗] No se encontraron suficientes imágenes para un álbum',
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })

    const elegidas = urls.slice(0, 3)
    const tarjetas = elegidas.map((url, i) => ({
      image: { url },
      caption: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *${text}*
╰─ ✧  ✩
┊ imagen  ·  \`${i + 1}\`
╰─────────`.trim(),
      footer: 'copiar enlace',
      nativeFlow: [{ text: 'Copiar', copy: url }]
    }))

    await conn.sendMessageLia(m.chat, {
      text: `
\`*˚   ✩    ✦    ✩   ˚*\`

╭─ ✧
┊ *Imagen*
╰─ ✧  ✩
┊ búsqueda  ·  \`${text.slice(0, 40)}\`
┊ resultados  ·  \`${tarjetas.length}\`
╰─────────`.trim(),
      footer: 'desliza',
      cards: tarjetas,
      linkPreview: null
    }, { quoted: m, keepQuoted: true })


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

async function obtenerBusquedaImagenGoogle(consulta) {
  const apis = [
    `${global.APIs.delirius.url}/search/gimage?query=${encodeURIComponent(consulta)}`,
    `${global.APIs.siputzx.url}/api/images?query=${encodeURIComponent(consulta)}`
  ]

  for (const url of apis) {
    try {
      const respuesta = await fetch(url)
      const datos = await respuesta.json()

      if (Array.isArray(datos?.data)) {
        const urls = datos.data
          .map(d => d.url)
          .filter(u => typeof u === 'string' && u.startsWith('http'))

        if (urls.length) return urls
      }
    } catch { /* ignorar errores de una API y seguir con la otra */ }
  }

  return []
}

export { obtenerBusquedaImagenGoogle as getGoogleImageSearch }
