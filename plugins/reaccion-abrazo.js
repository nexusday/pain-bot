import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'
import { datosReaccion } from '../lib/reacciones.js'

let handler = async (m, { conn, participants = [], usedPrefix = '/', command = 'hug' }) => {
  
  const { objetivo, mencion, etiquetaUsuario, targetTag } = datosReaccion(m, conn, participants)
  if (!objetivo) return conn.sendMessage(m.chat, { text: `[❗] Menciona a un usuario o responde a su mensaje.\n\n> ${usedPrefix}${command} @usuario\n> (responde un mensaje) ${usedPrefix}${command}`, contextInfo: { ...(global.rcanal?.contextInfo || {}) } }, { quoted: m })

  

  const gifs = [
    'https://media.tenor.com/7oCaSR-q1kkAAAAM/alice-vt.gif',
    'https://media.tenor.com/RWD2XL_CxdcAAAAM/hug.gif',
    'https://media.tenor.com/EX0f-orgGwoAAAAM/love.gif',
    'https://media.tenor.com/ukBByoKUNFEAAAAM/cuddle-anime.gif',
    'https://media.tenor.com/QTHLD_nBvv8AAAAM/danjo-no-yuujou-wa-seiritsu-suru-can-a-boy-girl-friendship-survive.gif',
    'https://media.tenor.com/I77M4aWAGk8AAAAM/hug.gif',
    'https://media.tenor.com/hYja0d71ss4AAAAM/these-guys.gif',
    'https://media.tenor.com/FfSuovWnabYAAAAM/haze-lena.gif',
    'https://media.tenor.com/MtmdE7YibpkAAAAM/hestia-hug.gif',
    'https://media.tenor.com/0QALoFNm07AAAAAM/kaname-hug-kaname-hug-yuki.gif',
    'https://media.tenor.com/0KYDZQ3Qjg8AAAAM/girl-side.gif',
    'https://media.tenor.com/mZdHYO8urvUAAAAM/natsu-natsu-dragneel.gif',
    'https://media.tenor.com/tcJXAA4Xi8QAAAAM/gray-juvia.gif',
    'https://media.tenor.com/hYe-gAUD-TwAAAAM/kitsuneupload-anime.gif',
    'https://media.tenor.com/FYKsVaNI7lkAAAAM/anime-hug.gif',
    'https://media.tenor.com/jQ0FcfbsXqIAAAAM/hug-anime.gif',
    'https://media.tenor.com/bSZuKqp8GSMAAAAM/cute-hug-anime-love-couple.gif',
    'https://media.tenor.com/5fiWSpLaEe0AAAAM/anime-hug.gif'

  ]
  const urlGif = gifs[Math.floor(Math.random() * gifs.length)]

  const texto = `${etiquetaUsuario} le dio un fuerte abrazo a ${targetTag} 🫂`

  const nombreTmp = `hug_${Date.now()}`
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
    console.error('hug plugin error:', err)
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

handler.help = ['hug / abrazo @user / responder']
handler.tags = ['reaccion']
handler.command = ['hug', 'abrazo']

export default handler
