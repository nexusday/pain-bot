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

  const sender = m.sender
  const mention = [sender]
  const userTag = '@' + sender.split('@')[0]
  const text = `${userTag} se está enojando 😠`

  let gifUrl = gifs[Math.floor(Math.random() * gifs.length)]

  
  const tmpName = `angry_${Date.now()}`
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
    console.error('angry plugin error:', err)
    
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

handler.help = ['angry', 'enojado']
handler.tags = ['diversion']
handler.command = ['angry', 'enojado']

export default handler
