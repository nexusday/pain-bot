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
    const urlApi = `https://api.vreden.my.id/api/v1/artificial/animagine?prompt=${encodeURIComponent(text)}`
    const respuesta = await fetch(urlApi)
    if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`)
    const datos = await respuesta.json()

    if (!datos?.status || !datos.result || !datos.result.image || !datos.result.image.results) {
      throw new Error('No se obtuvo imagen de la API.')
    }

    const urlImagen = datos.result.image.results
    const metadatos = datos.result
    const leyenda = `𓍯  *Prompt:* ${metadatos.prompt || text}\n𓍯  *Modelo:* ${metadatos.model?.name || 'Desconocido'}\n𓍯  *Resolución:* ${metadatos.resolution || 'Desconocido'}\n𓍯  *Duración:* ${typeof metadatos.duration === 'number' ? metadatos.duration.toFixed(2) + 's' : metadatos.duration || 'Desconocido'}`

    
    let respuestaImagen = await fetch(urlImagen)
    if (!respuestaImagen.ok) {
      
      respuestaImagen = await fetch(urlImagen, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://api.vreden.my.id/' } })
    }
    if (!respuestaImagen.ok) throw new Error(`No se pudo descargar la imagen (status ${respuestaImagen.status})`)

    const arrayBuffer = await respuestaImagen.arrayBuffer()
    const buferImagen = Buffer.from(arrayBuffer)

    
    try {
      await conn.sendMessage(m.chat, { image: buferImagen, caption: leyenda, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
      return
    } catch (errEnvio) {
      console.warn('Envio directo falló, intentando archivo temporal:', errEnvio.message)
    }

    
    try {
      const dirTmp = path.join(process.cwd(), 'tmp')
      if (!fs.existsSync(dirTmp)) fs.mkdirSync(dirTmp, { recursive: true })
      const archivoTmp = path.join(dirTmp, `ia-anime-${Date.now()}.png`)
      fs.writeFileSync(archivoTmp, buferImagen)
      await conn.sendMessage(m.chat, { image: { url: archivoTmp }, caption: leyenda, contextInfo: { ...rcanal?.contextInfo } }, { quoted: m })
      try { fs.unlinkSync(archivoTmp) } catch (e) { }
      return
    } catch (errArchivo) {
      console.error('falló:', errArchivo)
      
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
