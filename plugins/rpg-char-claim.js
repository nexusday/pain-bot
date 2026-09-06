import { claimCharacter } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix }) => {
  try {
    await claimCharacter(m, conn, usedPrefix || '.')
  } catch (e) {
    console.error('char-claim:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo comprar.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['claim', 'c', 'comprar']
handler.tags = ['rpg', 'gacha']
handler.command = ['claim', 'c', 'comprar', 'reclamar']
handler.group = true

export default handler
