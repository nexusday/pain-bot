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

  const sender = m.sender
  const mention = [sender]
  const userTag = '@' + sender.split('@')[0]
  const text = `${userTag} se está riendo 😂`

  let gifUrl = gifs[Math.floor(Math.random() * gifs.length)]

  // Download GIF to temp, convert to MP4 with ffmpeg, send MP4 buffer
  const tmpName = `reir_${Date.now()}`
  const gifPath = join(tmpdir(), `${tmpName}.gif`)
  const mp4Path = join(tmpdir(), `${tmpName}.mp4`)

  try {
    const res = await fetch(gifUrl)
    if (!res.ok) throw new Error('Failed to download gif')
    const buffer = await res.arrayBuffer()
    writeFileSync(gifPath, Buffer.from(buffer))

    // Convert with ffmpeg: ensure dimensions even, optimize for streaming
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
    console.error('reir plugin error:', err)
    // fallback to sending original URL as image/video
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

handler.help = ['reir', 'risa']
handler.tags = ['diversion']
handler.command = ['reir', 'risa']

export default handler
