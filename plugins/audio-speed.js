import { exec } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { promisify } from 'util'

const execPromise = promisify(exec)

let handler = async (m, { conn, text }) => {
  
  let inputPath = ''
  let outputPath = ''

  try {
    if (!m.quoted) return m.reply('[❗] Responde a un audio o nota de voz. Uso: /speed')
    
    
    let tempo = 0.99
    if (text && !isNaN(parseFloat(text))) {
      const t = parseFloat(text)
      if (t >= 0.5 && t <= 1.99) tempo = t
      else return m.reply('Velocidad debe estar entre 0.5 y 1.99')
    }

    const q = await m.getQuotedObj()
    const audioMeta = q.msg?.audioMessage || q.msg?.voiceMessage || {}
    const mime = q.msg?.mimetype || q.mimetype || audioMeta.mimetype || ''

    if (!mime.startsWith('audio/') && !q.mtype?.includes('audio')) {
      return m.reply('[❗] Responde a un audio o nota de voz')
    }

    let media = null
    try { media = await q.download?.() } catch (e) { media = null }

    if ((!media || media.length === 0) && conn.downloadM && q.msg) {
      try { media = await conn.downloadM(q.msg.audioMessage || q.msg.voiceMessage || q.msg, 'audioMessage') } catch (e) { media = null }
    }

    if ((!media || media.length === 0) && conn.getFile && q.msg) {
      try {
        const file = await conn.getFile(q.msg.audioMessage || q.msg.voiceMessage || q.msg)
        media = file?.data || null
      } catch (e) { media = null }
    }

    if (!media || media.length === 0) {
      return m.reply('No se pudo descargar el audio')
    }


    const id = Date.now() + Math.random().toString(36).substring(2, 7)
    let ext = 'ogg'
    try { ext = (mime.split('/')[1] || '').split(';')[0] || ext } catch (e) {}
    
    inputPath = join(tmpdir(), `input_${id}.${ext}`)
    outputPath = join(tmpdir(), `output_${id}.ogg`)

    writeFileSync(inputPath, Buffer.from(media))

   
 const ffmpegCommand = `ffmpeg -y -i "${inputPath}" \
-af "asetrate=44100*1.20,aresample=44100,treble=g=4,bass=g=2" \
-c:a libopus -b:a 128k -ac 1 "${outputPath}"`

    console.log('speed: ejecutando ffmpeg con tempo=', tempo, 'filtros: highpass/lowpass/bass, aresample=24000')
    
    await execPromise(ffmpegCommand)

    
    if (!existsSync(outputPath)) {
      throw new Error('FFmpeg no pudo generar el archivo de salida.')
    }

    const finalAudioBuffer = readFileSync(outputPath)

    if (finalAudioBuffer.length === 0) {
      throw new Error('El archivo generado por FFmpeg está vacío.')
    }


    await conn.sendMessage(m.chat, { 
      audio: finalAudioBuffer, 
      mimetype: 'audio/ogg; codecs=opus', 
      ptt: false 
    }, { quoted: m })

  } catch (err) {
    console.error('Error crítico en el plugin speed:', err)
    try { m.reply('[❗] FFmpeg: ' + (err.message || err)) } catch {}
  } finally {
    
    try { if (inputPath && existsSync(inputPath)) unlinkSync(inputPath) } catch {}
    try { if (outputPath && existsSync(outputPath)) unlinkSync(outputPath) } catch {}
  }
}

handler.command = ['speed']
handler.help = ['speed']
handler.tags = ['audio']

export default handler