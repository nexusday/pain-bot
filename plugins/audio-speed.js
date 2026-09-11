import { exec } from 'child_process'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { promisify } from 'util'

const ejecutarPromesa = promisify(exec)

let handler = async (m, { conn, text }) => {
  
  let rutaEntrada = ''
  let rutaSalida = ''

  try {
    if (!m.quoted) return m.reply('[❗] Responde a un audio o nota de voz. Uso: /speed')
    
    
    let tempo = 0.99
    if (text && !isNaN(parseFloat(text))) {
      const t = parseFloat(text)
      if (t >= 0.5 && t <= 1.99) tempo = t
      else return m.reply('Velocidad debe estar entre 0.5 y 1.99')
    }

    const q = await m.getQuotedObj()
    const metaAudio = q.msg?.audioMessage || q.msg?.voiceMessage || {}
    const mime = q.msg?.mimetype || q.mimetype || metaAudio.mimetype || ''

    if (!mime.startsWith('audio/') && !q.mtype?.includes('audio')) {
      return m.reply('[❗] Responde a un audio o nota de voz')
    }

    let medio = null
    try { medio = await q.download?.() } catch (e) { medio = null }

    if ((!medio || medio.length === 0) && conn.downloadM && q.msg) {
      try { medio = await conn.downloadM(q.msg.audioMessage || q.msg.voiceMessage || q.msg, 'audioMessage') } catch (e) { medio = null }
    }

    if ((!medio || medio.length === 0) && conn.getFile && q.msg) {
      try {
        const archivo = await conn.getFile(q.msg.audioMessage || q.msg.voiceMessage || q.msg)
        medio = archivo?.data || null
      } catch (e) { medio = null }
    }

    if (!medio || medio.length === 0) {
      return m.reply('No se pudo descargar el audio')
    }


    const id = Date.now() + Math.random().toString(36).substring(2, 7)
    let ext = 'ogg'
    try { ext = (mime.split('/')[1] || '').split(';')[0] || ext } catch (e) {}
    
    rutaEntrada = join(tmpdir(), `input_${id}.${ext}`)
    rutaSalida = join(tmpdir(), `output_${id}.mp3`)

    writeFileSync(rutaEntrada, Buffer.from(medio))

   
 const comandoFfmpeg = `ffmpeg -y -i "${rutaEntrada}" \
-af "asetrate=44100*1.20,aresample=44100,treble=g=4,bass=g=2" \
-c:a libmp3lame -b:a 128k -ac 2 "${rutaSalida}"`

    console.log('speed: ejecutando ffmpeg con tempo=', tempo)
    
    await ejecutarPromesa(comandoFfmpeg)

    
    if (!existsSync(rutaSalida)) {
      throw new Error('FFmpeg no pudo generar el archivo de salida.')
    }

    const buferAudioFinal = readFileSync(rutaSalida)

    if (buferAudioFinal.length === 0) {
      throw new Error('El archivo generado por FFmpeg está vacío.')
    }


    await conn.sendMessage(m.chat, { 
      audio: buferAudioFinal, 
      mimetype: 'audio/mpeg',
      fileName: `speed-${id}.mp3`,
      ptt: false 
    }, { quoted: m })

  } catch (err) {
    console.error('Error crítico en el plugin speed:', err)
    try { m.reply('[❗] FFmpeg: ' + (err.message || err)) } catch {}
  } finally {
    
    try { if (rutaEntrada && existsSync(rutaEntrada)) unlinkSync(rutaEntrada) } catch {}
    try { if (rutaSalida && existsSync(rutaSalida)) unlinkSync(rutaSalida) } catch {}
  }
}

handler.command = ['speed']
handler.help = ['speed']
handler.tags = ['audio']

export default handler