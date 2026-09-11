import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'

let handler = async (m, { conn }) => {
  const gifs = [
    'https://media.tenor.com/tx3x8ANgbBwAAAAM/the-dreaming-boy-is-a-realist-yumemiru-danshi.gif',
    'https://media.tenor.com/i--qyYG3cJMAAAAM/anime-pout.gif',
    'https://media.tenor.com/I52W87bM7K8AAAAm/anime-aaaa.gif',
    'https://media.tenor.com/z2iFD-hLYnAAAAAM/anime-girl-anime.gif',
    'https://media.tenor.com/Q_SHYUU4NccAAAAM/anime-evil.gif',
    'https://media.tenor.com/YPBIySGgoM0AAAAM/anime-rem.gif',
    'https://media.tenor.com/5hCo-bxm3mUAAAAM/gojo-gojo-annoyed.gif',
    'https://media.tenor.com/WUvwvcr2qJkAAAAM/apothekerin-tageb%C3%BCcher-der-apothekerin.gif',
    'https://media.tenor.com/Tv8fJWb2NlkAAAAm/anime-angry-anime.gif',
    'https://media.tenor.com/9JjBiqaxzdAAAAAM/anime-angry.gif',
    'https://media.tenor.com/4ziAn98nMiIAAAAM/vollice-vollice-mad.gif',
    'https://media.tenor.com/uctXlnLUN0sAAAAM/anime-mutsumi.gif',
    'https://media.tenor.com/U8vM8y9oJjUAAAAM/nisekoi-chitoge-kirisaki.gif',
    'https://media.tenor.com/83MHunfE_GMAAAAM/miku-nakano-angry.gif'
  
  ]

  const remitente = m.sender
  const mencion = [remitente]
  const etiquetaUsuario = '@' + remitente.split('@')[0]
  const texto = `${etiquetaUsuario} se está enojando 😠`

  let urlGif = gifs[Math.floor(Math.random() * gifs.length)]

  
  const nombreTmp = `angry_${Date.now()}`
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
      ff.stderr.on('data', d => stderr += d.toString())
      ff.on('close', code => {
        if (code === 0 && existsSync(rutaMp4)) resolve()
        else reject(new Error('ffmpeg failed: ' + stderr))
      })
    })

    const bufferMp4 = Buffer.from(await (await import('fs')).promises.readFile(rutaMp4))

    await conn.sendMessage(m.chat, { video: bufferMp4, caption: texto, mimetype: 'video/mp4', gifPlayback: true, contextInfo: { mentionedJid: mencion } }, { quoted: m })

  } catch (err) {
    console.error('angry plugin error:', err)
    
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

handler.help = ['angry', 'enojado']
handler.tags = ['diversion']
handler.command = ['angry', 'enojado']

export default handler
