import { giftHaremCharacter } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix, args }) => {
  try {
    await giftHaremCharacter(m, conn, usedPrefix || '.', args || [])
  } catch (e) {
    console.error('char-darhr:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo regalar el personaje.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['darhr @user <n°>']
handler.tags = ['rpg', 'gacha']
handler.command = ['darhr', 'darharem', 'regalarhr', 'givehr']
handler.group = true

export default handler
