import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'

let handler = async (m, { conn }) => {
  const gifs = [
    'https://media.tenor.com/NACzM0o4iv4AAAAM/happy-easter.gif',
    'https://media.tenor.com/D05kuhjm9rUAAAAM/jjk-anime.gif',
    'https://media.tenor.com/70XBeW0ZY14AAAAM/belle-zzz.gif',
    'https://media.tenor.com/MM3La2Dx0c4AAAAM/onimai-cute-anime-girl-smile-smiling.gif',
    'https://media.tenor.com/9TzshBF2xAIAAAAM/kusuriya-no-hitorigoto-apothecary.gif',
    'https://media.tenor.com/UMC0fBr-CHYAAAAM/anime-kanna-kobayashi.gif',
    'https://media.tenor.com/KeqbuC5yrgUAAAAm/deal-with-it-trailblazer.gif',
    'https://media.tenor.com/nYnvtIcsVKMAAAAM/happy-anime-girl-anime.gif',
    'https://media.tenor.com/d548PiK-PNQAAAAM/anime-my-dress-up-darling.gif',
    'https://media.tenor.com/myCsjxxbtXAAAAAM/anime-happy.gif',
    'https://media.tenor.com/jxoSU-VpuzQAAAAM/anime-anime-girl.gif',
    'https://media.tenor.com/fAWuZZkNMHsAAAAM/iroha-kohinata-tomodachi-no-imouto-ga-ore-ni-dake-uzai.gif',
    'https://media.tenor.com/JH6re4Qi3kUAAAAM/hirasawa-yui.gif',
    'https://media.tenor.com/lAfLMj3TnCYAAAAM/noela-fox-girl.gif',
    'https://media.tenor.com/u4cVspRbEcsAAAAm/dance-happy.gif'
 
  ]

  const sender = m.sender
  const mention = [sender]
  const userTag = '@' + sender.split('@')[0]
  const text = `${userTag} esta feliz 😄`

  let gifUrl = gifs[Math.floor(Math.random() * gifs.length)]


  const tmpName = `alegre_${Date.now()}`
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
    console.error('reir plugin error:', err)
    
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

handler.help = ['alegre', 'happy']
handler.tags = ['diversion']
handler.command = ['alegre', 'happy']

export default handler
