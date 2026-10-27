import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'
import { datosReaccion } from '../lib/reacciones.js'

let handler = async (m, { conn, participants = [] }) => {
  const gifs = [
    'https://media.tenor.com/Cb7siZ71KJYAAAAM/sad.gif',
    'https://media.tenor.com/8Ob5KEU7vKAAAAAM/anime-my-dress-up-darling.gif',
    'https://media.tenor.com/DiFQ_Rl3dCQAAAAM/anime-cry-crying.gif',
    'https://media.tenor.com/Epn8mtby9RcAAAAM/frieren-crying.gif',
    'https://media.tenor.com/YS2hbVD4hGIAAAAM/anime-noragami.gif',
    'https://media.tenor.com/Ifjf8kh9xi8AAAAM/last-tour-girl-sad-anime-melancholy.gif',
    'https://media.tenor.com/q7cz_01J4zsAAAAM/maid-cute.gif',
    'https://media.tenor.com/6NVgLILlDP4AAAA1/bocchi-crying.gif',
    'https://media.tenor.com/Mp8TV83G5z4AAAAM/anime-anime-girl.gif',
    'https://media.tenor.com/5kwtBdNCeEoAAAAM/ichigo-rain-ichigo.gif',
    'https://media.tenor.com/IWdHxxaoXGYAAAAM/suigintou-sad.gif'
   
  ]

  const { objetivo, mencion, etiquetaUsuario, targetTag } = datosReaccion(m, conn, participants)
  const texto = objetivo ? `${etiquetaUsuario} se puso triste al leer a ${targetTag} 😢` : `${etiquetaUsuario} se puso triste 😢`

  let urlGif = gifs[Math.floor(Math.random() * gifs.length)]

  
  const nombreTmp = `sad_${Date.now()}`
  const rutaGif = join(tmpdir(), `${nombreTmp}.gif`)
  const rutaMp4 = join(tmpdir(), `${nombreTmp}.mp4`)

  try {
    const res = await fetch(urlGif)
    if (!res.ok) throw new Error('Failed to download gif')
    const buffer = await res.arrayBuffer()
    writeFileSync(rutaGif, Buffer.from(buffer))

 
    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-i', rutaGif, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', "scale=trunc(iw/2)*2:trunc(ih/2)*2", rutaMp4])
      let stderr = ''
      ff.on('error', reject)
      ff.stderr.on('data', d => stderr += d.toString())
      ff.on('close', code => {
        if (code === 0 && existsSync(rutaMp4)) resolve()
        else reject(new Error('ffmpeg failed: ' + stderr))
      })
    })

    const bufferMp4 = Buffer.from(await (await import('fs')).promises.readFile(rutaMp4))

    await conn.sendMessage(m.chat, { video: bufferMp4, caption: texto, mimetype: 'video/mp4', gifPlayback: true, contextInfo: { mentionedJid: mencion } }, { quoted: m })

  } catch (err) {
    console.error('reir plugin error:', err)
    
    try {
      await conn.sendMessage(m.chat, { video: { url: urlGif }, gifPlayback: true, caption: texto, contextInfo: { mentionedJid: mencion } }, { quoted: m })
    } catch (err2) {
      try { await conn.sendMessage(m.chat, { image: { url: urlGif }, caption: texto, contextInfo: { mentionedJid: mencion } }, { quoted: m }) } catch {}
    }
  } finally {
    try { if (existsSync(rutaGif)) unlinkSync(rutaGif) } catch {}
    try { if (existsSync(rutaMp4)) unlinkSync(rutaMp4) } catch {}
  }
}

handler.help = ['triste / sad [@user o responder]']
handler.tags = ['diversion']
handler.command = ['triste', 'sad']

export default handler
