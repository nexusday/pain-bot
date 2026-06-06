import fetch from 'node-fetch'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { spawn } from 'child_process'

let handler = async (m, { conn }) => {
  
  const target = m.mentionedJid && m.mentionedJid.length ? m.mentionedJid[0] : null
  if (!target) return conn.sendMessage(m.chat, { text: `[❗] Debes mencionar a un usuario.\n\n> Ejemplo: /hug @usuario`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })

  

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
  const gifUrl = gifs[Math.floor(Math.random() * gifs.length)]

  const sender = m.sender
  const mention = [sender].concat(target ? [target] : [])
  const userTag = '@' + (typeof sender === 'string' ? sender.split('@')[0] : String(sender))
  const targetTag = '@' + (target ? (typeof target === 'string' ? target.split('@')[0] : String(target)) : 'desconocido')
  const text = `${userTag} le dio un fuerte abrazo a ${targetTag} 🫂`

  const tmpName = `hug_${Date.now()}`
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
    console.error('hug plugin error:', err)
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

handler.help = ['abrazo @user']
handler.tags = ['reaccion']
handler.command = ['hug', 'abrazo']

export default handler
