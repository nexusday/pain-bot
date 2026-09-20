import { exec } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { promisify } from 'util'

const ejecutarPromesa = promisify(exec)
const MAX_SEGUNDOS = 59 * 60 

function segundosDeVideo(q) {
  const meta = q?.msg?.videoMessage || q?.msg || {}
  const s = Number(meta.seconds || q?.msg?.seconds || 0)
  return Number.isFinite(s) && s > 0 ? s : 0
}

function esVideo(q) {
  const mime = String(q?.msg?.mimetype || q?.mimetype || q?.msg?.videoMessage?.mimetype || '')
  const tipo = String(q?.mtype || '')
  return (
    mime.startsWith('video/') ||
    tipo.includes('video') ||
    Boolean(q?.msg?.videoMessage) ||
    (mime === 'application/octet-stream' && tipo.includes('video'))
  )
}

async function descargarVideo(q, conn) {
  let medio = null
  try { medio = await q.download?.() } catch {}
  if (medio?.length) return Buffer.from(medio)

  const msgVid = q?.msg?.videoMessage || q?.msg
  if (conn.downloadM && msgVid) {
    try {
      medio = await conn.downloadM(msgVid, 'videoMessage')
      if (medio?.length) return Buffer.from(medio)
    } catch {}
    try {
      medio = await conn.downloadM(msgVid, 'video')
      if (medio?.length) return Buffer.from(medio)
    } catch {}
  }

  if (conn.getFile && msgVid) {
    try {
      const archivo = await conn.getFile(msgVid)
      if (archivo?.data?.length) return Buffer.from(archivo.data)
    } catch {}
  }
  return null
}

let handler = async (m, { conn }) => {
  let rutaEntrada = ''
  let rutaSalida = ''

  try {
    if (!m.quoted) {
      return m.reply('[❗] Responde a un *video*. Uso: /audio')
    }

    const q = await m.getQuotedObj()
    if (!esVideo(q)) {
      return m.reply('[❗] Responde a un *video* (no audio ni imagen).')
    }

    const segundos = segundosDeVideo(q)
    if (segundos > MAX_SEGUNDOS) {
      const mins = Math.ceil(segundos / 60)
      return m.reply(`[❗] El video dura ~${mins} min. Máximo permitido: *59 minutos*.`)
    }


    const medio = await descargarVideo(q, conn)
    if (!medio?.length) {
      return m.reply('[❗] No se pudo descargar el video.')
    }

    const id = Date.now() + Math.random().toString(36).substring(2, 7)
    const mime = String(q.msg?.mimetype || q.mimetype || 'video/mp4')
    let ext = 'mp4'
    try {
      const parte = (mime.split('/')[1] || '').split(';')[0].trim()
      if (parte && parte !== 'octet-stream') ext = parte
    } catch {}

    rutaEntrada = join(tmpdir(), `vid2aud_in_${id}.${ext}`)
    rutaSalida = join(tmpdir(), `vid2aud_out_${id}.mp3`)
    writeFileSync(rutaEntrada, medio)

  
    const comando = `ffmpeg -y -i "${rutaEntrada}" -t ${MAX_SEGUNDOS} -vn -c:a libmp3lame -b:a 128k -ac 2 -ar 44100 "${rutaSalida}"`

    await ejecutarPromesa(comando, {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 12 * 60 * 1000
    })

    if (!existsSync(rutaSalida)) {
      throw new Error('FFmpeg no generó el audio.')
    }

    const bufer = readFileSync(rutaSalida)
    if (!bufer.length) {
      throw new Error('El audio generado está vacío.')
    }

    await conn.sendMessage(
      m.chat,
      {
        audio: bufer,
        mimetype: 'audio/mpeg',
        fileName: `audio-${id}.mp3`,
        ptt: false
      },
      { quoted: m }
    )
  } catch (err) {
    console.error('Error en /audio:', err)
    try {
      m.reply('[❗] No se pudo convertir: ' + (err?.message || err))
    } catch {}
  } finally {
    try { if (rutaEntrada && existsSync(rutaEntrada)) unlinkSync(rutaEntrada) } catch {}
    try { if (rutaSalida && existsSync(rutaSalida)) unlinkSync(rutaSalida) } catch {}
  }
}

handler.command = ['audio', 'toaudio', 'tomp3', 'mp3']
handler.help = ['audio']
handler.tags = ['audio', 'tools']

export default handler
