import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'

let handler = async (m, { conn }) => {
  
  const objetivo = m.mentionedJid && m.mentionedJid.length ? m.mentionedJid[0] : null
  if (!objetivo) return conn.sendMessage(m.chat, { text: `[❗] Debes mencionar a un usuario.\n\n> Ejemplo: /slap @usuario`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })

  

  const gifs = [
    'https://media.tenor.com/FJsjk_9b_XgAAAAM/anime-hit.gif',
    'https://media.tenor.com/VHGbBswo_rQAAAAM/k-on-ritsu.gif',
    'https://media.tenor.com/qsfk5t5qiqwAAAAM/angel-beats-yuri-nakamura.gif',
    'https://media.tenor.com/fz-V6dZ1PiQAAAAM/how-to-raise-a-boring-girlfriend-saenai.gif',
    'https://media.tenor.com/EiFGi9dZXSAAAAAM/toradora-taiga.gif',
    'https://media.tenor.com/469w9za-5a0AAAAM/anime.gif',
    'https://media.tenor.com/cdQuOQtvwBIAAAAM/spy-x-family-anya-forger.gif',
    'https://media.tenor.com/5d2jizGkXksAAAAM/k-on-slap.gif',
    'https://media.tenor.com/p-RMgSXHMCIAAAAM/diosa-bocchi.gif'
  ]
  const urlGif = gifs[Math.floor(Math.random() * gifs.length)]

  const remitente = m.sender
  const mencion = [remitente].concat(objetivo ? [objetivo] : [])
  const etiquetaUsuario = '@' + (typeof remitente === 'string' ? remitente.split('@')[0] : String(remitente))
  const targetTag = '@' + (objetivo ? (typeof objetivo === 'string' ? objetivo.split('@')[0] : String(objetivo)) : 'desconocido')
  const texto = `${etiquetaUsuario} le dio una bofetada fuerte a ${targetTag} 👊`

  const nombreTmp = `slap_${Date.now()}`
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

handler.help = ['slap @user']
handler.tags = ['reaccion']
handler.command = ['bang', 'bofetada', 'slap']

export default handler
