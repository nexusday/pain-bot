import { viewHaremCharacter } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix, args }) => {
  try {
    await viewHaremCharacter(m, conn, usedPrefix || '.', args?.[0] || '')
  } catch (error) {
    console.error('char-vharem:', error)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo ver el personaje.*\n> ${error?.message || error}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['vharem <n°>']
handler.tags = ['rpg', 'gacha']
handler.command = ['vharem', 'verharem', 'charinfo', 'vh']
handler.group = true

export default handler
