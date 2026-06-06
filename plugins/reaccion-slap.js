import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'

let handler = async (m, { conn }) => {
  
  const target = m.mentionedJid && m.mentionedJid.length ? m.mentionedJid[0] : null
  if (!target) return conn.sendMessage(m.chat, { text: `[❗] Debes mencionar a un usuario.\n\n> Ejemplo: /slap @usuario`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })

  

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
  const gifUrl = gifs[Math.floor(Math.random() * gifs.length)]

  const sender = m.sender
  const mention = [sender].concat(target ? [target] : [])
  const userTag = '@' + (typeof sender === 'string' ? sender.split('@')[0] : String(sender))
  const targetTag = '@' + (target ? (typeof target === 'string' ? target.split('@')[0] : String(target)) : 'desconocido')
  const text = `${userTag} le dio una bofetada fuerte a ${targetTag} 👊`

  const tmpName = `slap_${Date.now()}`
  const gifPath = join(tmpdir(), `${tmpName}.gif`)
  const mp4Path = join(tmpdir(), `${tmpName}.mp4`)

  try {
    const res = await fetch(gifUrl)
    if (!res.ok) throw new Error('Failed to download gif')
    const buffer = await res.arrayBuffer()
    writeFileSync(gifPath, Buffer.from(buffer))

    await new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', ['-y', '-i', gifPath, '-movflags', 'faststart', '-pix_fmt', 'yuv420p', '-vf', "scale=trunc(iw/2)*2:trunc(ih/2)*2", mp4Path])
      let stderr = ''
      ff.stderr.on('data', d => stderr += d.toString())
      ff.on('close', code => {
        if (code === 0 && existsSync(mp4Path)) resolve()
        else reject(new Error('ffmpeg failed: ' + stderr))
      })
    })

    const mp4Buffer = Buffer.from(await (await import('fs')).promises.readFile(mp4Path))

    await conn.sendMessage(m.chat, { video: mp4Buffer, caption: text, mimetype: 'video/mp4', gifPlayback: true, contextInfo: { mentionedJid: mention } }, { quoted: m })
  } catch (err) {
    console.error('bang plugin error:', err)
    try {
      await conn.sendMessage(m.chat, { video: { url: gifUrl }, gifPlayback: true, caption: text, contextInfo: { mentionedJid: mention } }, { quoted: m })
    } catch (err2) {
      try { await conn.sendMessage(m.chat, { image: { url: gifUrl }, caption: text, contextInfo: { mentionedJid: mention } }, { quoted: m }) } catch {}
    }
  } finally {
    try { if (existsSync(gifPath)) unlinkSync(gifPath) } catch {}
    try { if (existsSync(mp4Path)) unlinkSync(mp4Path) } catch {}
  }
}

handler.help = ['slap @user']
handler.tags = ['reaccion']
handler.command = ['bang', 'bofetada', 'slap']

export default handler
