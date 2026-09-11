import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text?.trim()) {
    return conn.sendMessage(m.chat, {
      text: `ִֶָ☾. Escribe el texto que irá en la imagen.\n\n> *Ejemplo:*\n${usedPrefix + command} HoLAAA`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }

  const etiqueta = text.trim()

  try {
    const urlApi = `https://api.delirius.online/random/cat?text=${encodeURIComponent(etiqueta)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30000)
    const res = await fetch(urlApi, { signal: controller.signal })
    clearTimeout(timer)

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }

    const contentType = res.headers.get('content-type') || ''
    let imageBuffer = null

    if (contentType.includes('image')) {
      imageBuffer = Buffer.from(await res.arrayBuffer())
    } else {
      const data = await res.json().catch(() => null)
      const imageUrl = data?.url || data?.data?.url || data?.data?.image || data?.image
      if (!imageUrl) throw new Error('La API no devolvió una imagen.')
      const imgRes = await fetch(imageUrl)
      if (!imgRes.ok) throw new Error('No se pudo descargar la imagen.')
      imageBuffer = Buffer.from(await imgRes.arrayBuffer())
    }

    if (!imageBuffer?.length) {
      throw new Error('Imagen vacía.')
    }

    const leyenda = `ִֶָ☾. 𝗖𝗮𝘁 ִֶָ☾.\n 𓍯  *Texto:* ${etiqueta}`

    await conn.sendMessage(m.chat, {
      image: imageBuffer,
      caption: leyenda,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  } catch (error) {
    console.error('Error en random-cat:', error)
    return conn.sendMessage(m.chat, {
      text: `[❌] No se pudo generar la imagen del gato.\n\n> ${error.message || 'Intenta de nuevo.'}`,
      contextInfo: { ...rcanal?.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['cat <texto> → Gato random con texto en la imagen']
handler.tags = ['random', 'imagenes']
handler.command = ['cat', 'gato', 'randomcat', 'catmeme']

export default handler
