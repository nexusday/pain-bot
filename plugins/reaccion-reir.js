import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'

let handler = async (m, { conn }) => {
  const gifs = [
    'https://media1.tenor.com/m/BP9vMzwRSZwAAAAC/laughing-lol.gif',
    'https://media1.tenor.com/m/i3LW-RDisIcAAAAd/lol-haha.gif',
    'https://media.tenor.com/mzIscFHY8L0AAAAM/blue-box-ao-no-hako.gif',
    'https://media.tenor.com/Qn5oTJTmbGMAAAAM/nagatoro-ijirinaide-nagatoro-san.gif',
    'https://media.tenor.com/axSJHc25AFoAAAAM/senko-lol.gif',
    'https://media.tenor.com/74Win7VdWDoAAAAM/anime-laughing.gif',
    'https://media.tenor.com/21LeAZoJ-X4AAAAM/anime-anime-girl.gif',
    'https://media.tenor.com/MHiY_UKt9CUAAAAM/anime-takagi-san.gif',
    'https://media.tenor.com/GpVrlLpkBEsAAAAM/haha-anime.gif',
    'https://media.tenor.com/YYL35bePtHAAAAAM/anime-laugh.gif',
    'https://media.tenor.com/CG8uhh9CoJcAAAAM/shikimori-shikimoris-not-just-cute.gif'
  ]

  const remitente = m.sender
  const mencion = [remitente]
  const etiquetaUsuario = '@' + remitente.split('@')[0]
  const texto = `${etiquetaUsuario} se está riendo 😂`

  let urlGif = gifs[Math.floor(Math.random() * gifs.length)]

  
  const nombreTmp = `reir_${Date.now()}`
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

handler.help = ['reir', 'risa']
handler.tags = ['diversion']
handler.command = ['reir', 'risa']

export default handler
