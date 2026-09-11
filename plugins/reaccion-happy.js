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

  const remitente = m.sender
  const mencion = [remitente]
  const etiquetaUsuario = '@' + remitente.split('@')[0]
  const texto = `${etiquetaUsuario} esta feliz 😄`

  let urlGif = gifs[Math.floor(Math.random() * gifs.length)]


  const nombreTmp = `alegre_${Date.now()}`
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

handler.help = ['alegre', 'happy']
handler.tags = ['diversion']
handler.command = ['alegre', 'happy', 'feliz']

export default handler
