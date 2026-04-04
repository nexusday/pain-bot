import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return conn.sendMessage(m.chat, {
    text: `*[❗] Uso:* ${usedPrefix + command} <prompt>\n*Ejemplo:* ${usedPrefix + command} un gato astronauta, pintura digital`,
    contextInfo: { ...rcanal?.contextInfo }
  }, { quoted: m })

  await conn.sendMessage(m.chat, {
    text: `Generando imagen\n\n> *Prompt:* ${text}`,
    contextInfo: { ...rcanal?.contextInfo }
  }, { quoted: m })

  try {
    const apiUrl = `https://api.vreden.my.id/api/v1/artificial/animagine?prompt=${encodeURIComponent(text)}`
    const res = await fetch(apiUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()

    if (!data?.status || !data.result || !data.result.image || !data.result.image.results) {
      throw new Error('No se obtuvo imagen de la API.')
    }

    const imageUrl = data.result.image.results
    const meta = data.result
    const caption = `𓍯  *Prompt:* ${meta.prompt || text}\n𓍯  *Modelo:* ${meta.model?.name || 'Desconocido'}\n𓍯  *Resolución:* ${meta.resolution || 'Desconocido'}\n𓍯  *Duración:* ${typeof meta.duration === 'number' ? meta.duration.toFixed(2) + 's' : meta.duration || 'Desconocido'}`

    
    let imgResp = await fetch(imageUrl)
    if (!imgResp.ok) {
      
      imgResp = await fetch(imageUrl, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://api.vreden.my.id/' } })
    }
    if (!imgResp.ok) throw new Error(`No se pudo descargar la imagen (status ${imgResp.status})`)

    const arrayBuffer = await imgResp.arrayBuffer()
    const imageBuffer = Buffer.from(arrayBuffer)

    
    try {
      await conn.sendMessage(m.chat, { image: imageBuffer, caption, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
      return
    } catch (errSend) {
      console.warn('Envio directo falló, intentando archivo temporal:', errSend.message)
    }

    
    try {
      const tmpDir = path.join(process.cwd(), 'tmp')
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
      const tmpFile = path.join(tmpDir, `ia-anime-${Date.now()}.png`)
      fs.writeFileSync(tmpFile, imageBuffer)
      await conn.sendMessage(m.chat, { image: { url: tmpFile }, caption, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
      try { fs.unlinkSync(tmpFile) } catch (e) { }
      return
    } catch (errFile) {
      console.error('falló:', errFile)
      
      throw new Error('No se pudo enviar la imagen generada.')
    }

  } catch (e) {
    console.error('Error en ia-anime:', e)
    await conn.sendMessage(m.chat, { text: `*[❗] Error`, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
  }
}

handler.help = ['animg <prompt>']
handler.tags = ['ia', 'imagenes']
handler.command = ['animg', 'animagine', 'ia-anime']

export default handler
