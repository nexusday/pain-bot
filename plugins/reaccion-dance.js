import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'

let handler = async (m, { conn }) => {
  const gifs = [
    'https://media.tenor.com/KeqbuC5yrgUAAAAm/deal-with-it-trailblazer.gif',
    'https://media.tenor.com/jxYz5DbA0VUAAAAm/cute-dance.gif',
    'https://media.tenor.com/TxflfpxQNgcAAAAM/happy-dance.gif',
    'https://media.tenor.com/hYkRcm80JFwAAAAm/foxy-foxplushy.gif',
    'https://media.tenor.com/fGYh4lfXG8MAAAAm/anime-dance-anime.gif',
    'https://media.tenor.com/nxLuqC8_hVwAAAAm/meowbah-meowbahh.gif',
    'https://media.tenor.com/Mdz2s-fOMggAAAAm/the-fragrant-flower-blooms-with-dignity-kaoruko-waguri.gif',
    'https://media.tenor.com/s6b_m6fCF0sAAAAm/miku-miku-dance.gif',
    'https://media.tenor.com/_5-dHn2YWycAAAAm/cool-verycute.gif',
    'https://media.tenor.com/R0qf99efP7gAAAAm/anime-anime-dance.gif',
    'https://media.tenor.com/qnSjApbtvRsAAAAm/hasu-yuki.gif',
    'https://media.tenor.com/KOQYL00kmYEAAAAm/happy-holidays.gif',
    'https://media.tenor.com/AAMEFNsRaeEAAAA1/anime-girl.gif',
    'https://media.tenor.com/Smph2uXkObIAAAAm/yor-forger-dance.gif',
    'https://media.tenor.com/_mD_Pm-e9A8AAAAm/anime-danza-danza-anime.gif',
    'https://media.tenor.com/4XOmub9Au0AAAAAm/anime-dance.gif',
    'https://media.tenor.com/MaMoqv18URwAAAAm/ausonia-ausonia-vt.gif',
    'https://media.tenor.com/6p9Xm3fV6y8AAAAm/anime-dance-dancing.gif',
    'https://media.tenor.com/jWeXSzmd-yUAAAAm/lonely-lonely-lonely.gif',
    'https://media.tenor.com/C8hO7qe5z1YAAAAm/dance-anime.gif',
    'https://media.tenor.com/2MwmA-pfFL8AAAAm/caily-dance.gif',
    'https://media.tenor.com/m21RwoBHceEAAAA1/koshi-torako-shikanoko.gif',
    'https://media.tenor.com/VvKVHL5DogYAAAAm/anime-dancing.gif',
    'https://media.tenor.com/ER2TMm6Qo5UAAAAm/uma-musume-satono-diamond.gif',
    'https://media.tenor.com/H6VeJuNhLJkAAAAM/anime-girl-dance.gif',
    'https://media.tenor.com/6DxJzu87RocAAAAM/cute-girls.gif',
    'https://media.tenor.com/qhfzQWre-ewAAAAM/dance-anime-girl.gif',
    'https://media.tenor.com/GOYRQva4UeoAAAAM/anime-dance.gif',
    'https://media.tenor.com/Oit9SMP6oFkAAAAM/reze-denji.gif',
    'https://media.tenor.com/otG766XEBmoAAAAM/d4dj-anime-girl.gif',
    'https://media.tenor.com/9eu9F42NQuYAAAAM/dance-anime-cool.gif',
    'https://media.tenor.com/GrQMj0CDbcQAAAAm/ayaya-club-march-7th.gif',
    'https://media.tenor.com/yicdybTnMaMAAAAM/reze-chainsaw-man.gif',
    'https://media.tenor.com/lKmddHTKgWQAAAAM/onimai-oniichan-wa-oshimai.gif',
    'https://media.tenor.com/db0yF9G7qn4AAAAM/cat-dance.gif',
    'https://media.tenor.com/LzCV-UOvyBAAAAAM/s%C5%8Dsuke-aizen-gin-ichimaru.gif',
    'https://media.tenor.com/b-xhltuOrEYAAAAM/anime-dance-kawaii-dance.gif',
    ''
   
  ]

  const sender = m.sender
  const mention = [sender]
  const userTag = '@' + sender.split('@')[0]
  const text = `${userTag} está bailando 🎶`

  let gifUrl = gifs[Math.floor(Math.random() * gifs.length)]

  
  const tmpName = `danzar_${Date.now()}`
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
    console.error('dance plugin error:', err)
    
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

handler.help = ['dance', 'danzar']
handler.tags = ['diversion']
handler.command = ['dance', 'danzar']

export default handler
