import { webp2png, webp2mp4 } from '../lib/webp2mp4.js'
import { writeFile, readFile, unlink, mkdir } from 'fs/promises'
import { join } from 'path'
import fluent from 'fluent-ffmpeg'
import { obtenerSharp } from '../lib/sharp.js'
import { esWebPAnimado } from './stickers-sticker.js'

let handler = async (m, { conn, usedPrefix, command }) => {
  try {
    const citado = m.quoted ? m.quoted : m
    const tipoMime = (citado.msg || citado).mimetype || ''
    
    if (!/webp/.test(tipoMime)) {
      return m.reply(`*[❗] Responde a un sticker con el comando ${usedPrefix + command}.*\n> Fijo → imagen\n> En movimiento → GIF`)
    }
    
    const dirTemp = join(process.cwd(), 'tmp')
    await mkdir(dirTemp, { recursive: true }).catch(() => {})
    
    const media = await citado.download()
    if (!media) throw new Error('No se pudo descargar el sticker')
    
   
    if (!Buffer.isBuffer(media)) {
      throw new Error('El sticker descargado no es un Buffer válido')
    }
    
    try {
      if (esWebPAnimado(media)) {
        const gif = await webpAGif(media)
        await conn.sendMessage(m.chat, {
          video: gif.buffer || { url: gif.url },
          gifPlayback: true,
          mimetype: 'video/mp4',
          caption: '',
          contextInfo: { ...rcanal.contextInfo }
        }, { quoted: m })
        return
      }

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

handler.help = ['#toimg • #ss → sticker fijo a imagen, animado a GIF']

async function webpAGif(bufer) {
  const dir = join(process.cwd(), 'tmp')
  await mkdir(dir, { recursive: true }).catch(() => {})
  const sello = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const gif = join(dir, `${sello}.gif`)
  const mp4 = join(dir, `${sello}.mp4`)
  try {
    const sharp = obtenerSharp()
    const recorte = await recorteVisible(sharp, bufer)
    let imagen = sharp(bufer, { animated: true, pages: -1 })
    if (recorte) imagen = imagen.extract(recorte)
    const buferGif = await imagen.gif({ effort: 1 }).toBuffer()
    await writeFile(gif, buferGif)
    await new Promise((ok, fail) => {
      fluent(gif)
        .outputOptions([
          '-c:v', 'libx264',
          '-preset', 'ultrafast',
          '-tune', 'animation',
          '-crf', '28',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-an'
        ])
        .save(mp4)
        .on('end', ok)
        .on('error', fail)
    })
    return { buffer: await readFile(mp4) }
  } catch (error) {
    console.error('[ss] Conversión local falló, uso el conversor externo:', error?.message || error)
    const url = await webp2mp4(bufer)
    if (!url) throw error
    return { url }
  } finally {
    await unlink(gif).catch(() => {})
    await unlink(mp4).catch(() => {})
  }
}

async function recorteVisible(sharp, bufer) {
  const meta = await sharp(bufer, { animated: true, pages: -1 }).metadata()
  const paginas = meta.pages || 1
  const ancho = meta.width || 0
  const altoPagina = meta.pageHeight || meta.height || 0
  if (!ancho || !altoPagina || paginas < 1) return null

  const { data, info } = await sharp(bufer, { animated: true, pages: -1 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const alto = Math.floor(info.height / paginas) || altoPagina
  let minX = ancho
  let minY = alto
  let maxX = -1
  let maxY = -1

  for (let pagina = 0; pagina < paginas; pagina++) {
    const base = pagina * alto * ancho * info.channels
    for (let y = 0; y < alto; y++) {
      const fila = base + y * ancho * info.channels
      for (let x = 0; x < ancho; x++) {
        const i = fila + x * info.channels
        const alfa = info.channels > 3 ? data[i + 3] : 255
        if (alfa < 20) continue
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < 0 || maxY < 0) return null

  let izquierda = minX
  let arriba = minY
  let anchoRecorte = maxX - izquierda + 1
  let altoRecorte = maxY - arriba + 1
  if (anchoRecorte % 2) anchoRecorte -= 1
  if (altoRecorte % 2) altoRecorte -= 1
  if (anchoRecorte < 2 || altoRecorte < 2) return null
  if (izquierda + anchoRecorte > ancho) anchoRecorte = ancho - izquierda - ((ancho - izquierda) % 2)
  if (arriba + altoRecorte > alto) altoRecorte = alto - arriba - ((alto - arriba) % 2)
  if (anchoRecorte < 2 || altoRecorte < 2) return null
  if (izquierda === 0 && arriba === 0 && anchoRecorte === ancho && altoRecorte === alto) return null

  return { left: izquierda, top: arriba, width: anchoRecorte, height: altoRecorte }
}
handler.tags = ['stickers']
handler.command = ['toimg', 'ss']

export default handler
