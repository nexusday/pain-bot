import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import fluent from 'fluent-ffmpeg'
import { fileTypeFromBuffer as fromBuffer } from 'file-type'
import { addExif } from '../lib/sticker.js'


let handler = async (m, { conn, args }) => {
  let citado = m.quoted ? m.quoted : m
  let tipoMime = (citado.msg || citado).mimetype || citado.mediaType || ''
  let bufer

  try {
    if (/image|video|webp|webm/.test(tipoMime) && citado.download) {
      bufer = await citado.download()
    } else if (args[0] && esUrl(args[0])) {
      const respuesta = await fetch(args[0])
      bufer = await respuesta.buffer()
    } else {
      return conn.reply(m.chat, '[❗] Por favor, responde a una imagen o video para crear un sticker.', m, rcanal)
    }

    const { packname, author } = resolverMetaSticker(m, conn)

    const datosSticker = await aWebp(bufer)
    const stickerFinal = await addExif(datosSticker, packname, author)
    const animado = esWebPAnimado(stickerFinal)

    
    await conn.sendMessage(
      m.chat,
      {
        sticker: stickerFinal,
        ...(animado ? { isAnimated: true } : {}),
        contextInfo: rcanal?.contextInfo
      },
      { quoted: m }
    )
  } catch (error) {
    console.error(error)
    conn.reply(m.chat, '[❌] Error al crear el sticker.', m, rcanal)
  }
}

handler.help = ['#sticker • #s • #stickers + {imagen/video o link}']
handler.tags = ['stickers']
handler.command = ['s', 'stickers', 'sticker']

export default handler

/** Usa pack/autor de .setmeta; si no hay, el diseño por defecto del bot. */
export function resolverMetaSticker(m, conn) {
  const usuario = global.db?.data?.users?.[m.sender] || {}
  const nombreUsuario = m.pushName || conn?.getName?.(m.sender) || 'Usuario'
  const nombreBot = global.namebot || 'PAIN BOT'

  const nombreCorto = String(nombreUsuario).replace(/\s+/g, ' ').trim().slice(0, 24) || 'Usuario'
  const packPorDefecto = `꒰   𓆩  ${nombreBot}  𓆪   ꒱`
  const autorPorDefecto = [
    '',
    '‧₊˚  𖦹  ˚₊‧',
    'ᡣ𐭩   https://nexcodea.com',
    `𓇼   ${nombreCorto}`
  ].join('\n')

  const packPersonalizado = String(usuario.packname || '').trim()
  const autorPersonalizado = String(usuario.author || '').trim()

  return {
    packname: packPersonalizado || packPorDefecto,
    author: autorPersonalizado || autorPorDefecto
  }
}


function limpiarArchivosTemporales(...rutasArchivos) {
  rutasArchivos.forEach(rutaArchivo => {
    try {
      if (fs.existsSync(rutaArchivo)) {
        fs.unlinkSync(rutaArchivo)
      }
    } catch (error) {
      console.error('Error cleaning up temp file:', rutaArchivo, error.message)
    }
  })
}

/** Detecta WebP animado (ANIM/ANMF o flag VP8X). */
export function esWebPAnimado(bufer) {
  if (!Buffer.isBuffer(bufer) || bufer.length < 20) return false
  if (bufer[0] !== 0x52 || bufer[1] !== 0x49 || bufer[2] !== 0x46 || bufer[3] !== 0x46) return false
  if (bufer.toString('ascii', 8, 12) !== 'WEBP') return false

  let desplazamiento = 12
  while (desplazamiento + 8 <= bufer.length) {
    const codigoCuatroCC = bufer.toString('ascii', desplazamiento, desplazamiento + 4)
    const tamanoFragmento = bufer.readUInt32LE(desplazamiento + 4)
    if (codigoCuatroCC === 'ANIM' || codigoCuatroCC === 'ANMF') return true
    if (codigoCuatroCC === 'VP8X' && desplazamiento + 8 < bufer.length) {
      if (bufer[desplazamiento + 8] & 0x02) return true
    }
    desplazamiento += 8 + tamanoFragmento + (tamanoFragmento % 2)
    if (tamanoFragmento < 0) break
  }
  return false
}

/**
 * Imagen → webp estático.
 * Video/GIF → webp animado (máx ~7s, peso controlado) para WhatsApp.
 */
async function aWebp(bufer) {
  const tipo = await fromBuffer(bufer)
  if (!tipo?.ext) throw '[❌] Archivo no compatible.'
  const { ext, mime } = tipo
  if (!/(png|jpe?g|mp4|mkv|m4p|gif|webp|webm)/i.test(ext)) throw '[❌] Archivo no compatible.'

  // Ya es webp animado: no re-encodificar (rompe frames a veces)
  if (ext === 'webp' && esWebPAnimado(bufer)) return bufer

  const esEntradaAnimada =
    /(mp4|mkv|m4p|gif|webm)/i.test(ext) ||
    /video\//i.test(mime || '') ||
    /gif/i.test(mime || '')

  const directorioTemp = path.join(process.cwd(), 'tmp')
  if (!fs.existsSync(directorioTemp)) fs.mkdirSync(directorioTemp, { recursive: true })

  const sello = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const entrada = path.join(directorioTemp, `${sello}.${ext}`)
  const salida = path.join(directorioTemp, `${sello}.webp`)
  fs.writeFileSync(entrada, bufer)

  const ejecutarFfmpeg = (lado = 320, duracionSeg = 7) =>
    new Promise((resolver, rechazar) => {
      const vf =
        `scale='min(${lado},iw)':'min(${lado},ih)':force_original_aspect_ratio=decrease,` +
        `format=rgba,fps=15,pad=${lado}:${lado}:(ow-iw)/2:(oh-ih)/2:color=white@0.0,` +
        `split[a][b];[a]palettegen=reserve_transparent=on:transparency_color=ffffff[p];[b][p]paletteuse`

      const opciones = esEntradaAnimada
        ? [
            '-vcodec', 'libwebp',
            '-vf', vf,
            '-loop', '0',
            '-ss', '0',
            '-t', String(duracionSeg),
            '-an',
            '-vsync', 'cfr'
          ]
        : [
            '-vcodec', 'libwebp',
            '-vf', vf,
            '-frames:v', '1'
          ]

      fluent(entrada)
        .addOutputOptions(opciones)
        .toFormat('webp')
        .save(salida)
        .on('end', () => {
          try {
            resolver(fs.readFileSync(salida))
          } catch (err) {
            rechazar(err)
          }
        })
        .on('error', rechazar)
    })

  try {
    let resultado = await ejecutarFfmpeg(320, 7)

    if (resultado.length > 950 * 1024) {
      resultado = await ejecutarFfmpeg(224, esEntradaAnimada ? 5 : 7)
    }

    if (esEntradaAnimada && !esWebPAnimado(resultado)) {
      throw new Error('FFmpeg generó un webp sin animación')
    }

    return resultado
  } finally {
    limpiarArchivosTemporales(entrada, salida)
  }
}

function esUrl(texto) {
  return /^https?:\/\/\S+\.(jpg|jpeg|png|gif|webp|mp4|webm)$/i.test(texto)
}

export {
  resolverMetaSticker as resolveStickerMeta,
  esWebPAnimado as isAnimatedWebP,
  aWebp as toWebp,
  esUrl as isUrl
}
