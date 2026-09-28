import fetch from 'node-fetch'

const API_FF = 'https://my.izuka-api.xyz/api/canvas/fake-ff'

const handler = async (m, { conn, text, usedPrefix, command }) => {
  const nick = String(text || '').trim()
  if (!nick) {
    return conn.sendMessage(m.chat, {
      text: `[❗] Falta el nick.\n\n> *Ejemplo:* ${usedPrefix}${command} niko`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await fetch(`${API_FF}?username=${encodeURIComponent(nick)}`, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0' }
    })
    const json = await res.json()
    const imagen = json?.status && typeof json.result === 'string' ? json.result : ''
    if (!imagen) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No se pudo generar la imagen de *${nick}*.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    await conn.sendMessage(m.chat, {
      image: { url: imagen },
      caption: `\`*˚   ✩    ✦    ✩   ˚*\`\n\n╭─ ✧\n┊ *${nick}*\n╰─ ✧  ✩\n┊ free fire\n╰─────────`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } catch (e) {
    console.error('Error en ffn:', e)
    await conn.sendMessage(m.chat, {
      text: `[❌] No se pudo generar la imagen.\n> ${e?.message || e}`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  } finally {
    clearTimeout(timer)
  }
}

handler.command = ['ffn', 'fakeff', 'freefire']
handler.tags = ['canvas']
handler.help = ['ffn <nick>']

export default handler
