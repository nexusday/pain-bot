import { buyFromCharShop } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix, args }) => {
  try {
    await buyFromCharShop(m, conn, usedPrefix || '.', args?.[0] || '')
  } catch (e) {
    console.error('char-buy:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo comprar.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['comprarg <orden>']
handler.tags = ['rpg', 'gacha']
handler.command = ['comprarg', 'buyg', 'comprargacha']
handler.group = true

export default handler
