import { cancelCharacterSale } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix, args }) => {
  try {
    await cancelCharacterSale(m, conn, usedPrefix || '.', args?.[0] || '')
  } catch (error) {
    console.error('char-cancel:', error)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo cancelar.*\n> ${error?.message || error}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['cancelarg <orden>']
handler.tags = ['rpg', 'gacha']
handler.command = ['cancelarg', 'cancelarvender', 'cancelg', 'cancelartienda']
handler.group = true

export default handler
