import { rollCharacter } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix }) => {
  try {
    await rollCharacter(m, conn, usedPrefix || '.')
  } catch (e) {
    console.error('char-roll:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo tirar el personaje.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
  }
}

handler.help = ['w', 'rw', 'personaje']
handler.tags = ['rpg', 'gacha']
handler.command = ['w', 'rw', 'personaje', 'rollchar']
handler.group = true

export default handler
