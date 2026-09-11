import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'

let handler = async (m, { conn }) => {
  
  const objetivo = m.mentionedJid && m.mentionedJid.length ? m.mentionedJid[0] : null
  if (!objetivo) return conn.sendMessage(m.chat, { text: `[❗] Debes mencionar a un usuario.\n\n> Ejemplo: /kiss @usuario`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })

  

  const gifs = [
    'https://media.tenor.com/lJPu85pBQLEAAAAM/kiss.gif',
    'https://media.tenor.com/YhGc7aQAI4oAAAAM/megumi-kato-kiss.gif',
    'https://media.tenor.com/9u2vmryDP-cAAAAM/horimiya-animes.gif',
    'https://media.tenor.com/YHxJ9NvLYKsAAAAM/anime-kiss.gif',
    'https://media.tenor.com/f7zzuRSaIXoAAAAM/anime-kiss-ranma.gif',
    'https://media.tenor.com/L-NTpww8HTUAAAAM/kiss-anime-anime-kiss.gif',
    'https://media.tenor.com/fFXn6UF_Dt4AAAAM/yuki-yuki-and-itsuomi-kiss.gif',
    'https://media.tenor.com/APN_rYYwVCQAAAAM/runa-shirakawa-ryuuto-kashima.gif',
    'https://media.tenor.com/SZ8-4vDwi6cAAAAM/miyamura-hori.gif',
    'https://media.tenor.com/spb5E5laMLYAAAAM/runa-shirakawa-ryuuto-kashima.gif',
    'https://media.tenor.com/cbIOD1pMlEQAAAAM/mst.gif',
    'https://media.tenor.com/iVKQga_D3mYAAAAM/kiss-anime-couple.gif',
    'https://media.tenor.com/JdpApI0hbZ8AAAAM/anime-kiss.gif',
    'https://media.tenor.com/fONsKJlR5aEAAAAM/kiss-love.gif',
    'https://media.tenor.com/WFOK0MuT3LoAAAAM/anime-anime-couple.gif',
    'https://media.tenor.com/9puut6mBygQAAAAM/kiss.gif',
    'https://media.tenor.com/2MZgbU7fxrUAAAAM/tomo-chan-is-a-girl-kiss-anime.gif'
  
  ]
  const urlGif = gifs[Math.floor(Math.random() * gifs.length)]

  const remitente = m.sender
  const mencion = [remitente].concat(objetivo ? [objetivo] : [])
  const etiquetaUsuario = '@' + (typeof remitente === 'string' ? remitente.split('@')[0] : String(remitente))
  const targetTag = '@' + (objetivo ? (typeof objetivo === 'string' ? objetivo.split('@')[0] : String(objetivo)) : 'desconocido')
  const texto = `${etiquetaUsuario} le dio un beso a ${targetTag}  ❤`

  const nombreTmp = `kiss_${Date.now()}`
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
    console.error('bang plugin error:', err)
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

handler.help = ['kiss @user']
handler.tags = ['reaccion']
handler.command = ['kiss', 'beso']

export default handler
