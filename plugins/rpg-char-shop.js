import { showCharShop } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix }) => {
  try {
    await showCharShop(m, conn, usedPrefix || '.')
  } catch (e) {
    console.error('char-shop:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo mostrar la tienda.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['tiendag']
handler.tags = ['rpg', 'gacha']
handler.command = ['tiendag', 'tiendagacha', 'gshop', 'charshop']
handler.group = true

export default handler
