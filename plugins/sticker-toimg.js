import { webp2png } from '../lib/webp2mp4.js'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    const citado = m.quoted ? m.quoted : m
    const tipoMime = (citado.msg || citado).mimetype || ''
    
    if (!/webp/.test(tipoMime)) {
      return m.reply(`*[❗] Responde a un sticker con el comando ${usedPrefix + command} para convertirlo en imagen*`)
    }
    
    const dirTemp = join(process.cwd(), 'tmp')
    await mkdir(dirTemp, { recursive: true }).catch(() => {})
    
    const media = await citado.download()
    if (!media) throw new Error('No se pudo descargar el sticker')
    
   
    if (!Buffer.isBuffer(media)) {
      throw new Error('El sticker descargado no es un Buffer válido')
    }
    
    try {
      const urlImagen = await webp2png(media)
      if (!urlImagen) throw new Error('No se pudo convertir el sticker a imagen')
      
      await conn.sendMessage(m.chat, { 
        image: { url: urlImagen },
        caption: '',
        mentions: [m.sender],
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    } catch (error) {
      console.error('Error al procesar el sticker:', error)
      throw error
    }
    
  } catch (error) {
    console.error('Error en toimg:', error)
    m.reply('*[❗] Ocurrió un error al procesar el sticker. Asegúrate de estar respondiendo a un sticker válido.*')
  }
}

handler.help = ['#toimg']
handler.tags = ['stickers']
handler.command = ['toimg', 'ss']

export default handler
