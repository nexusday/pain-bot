import { listCharacterForSale } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix, args }) => {
  try {
    await listCharacterForSale(m, conn, usedPrefix || '.', args?.[0] || '', args?.[1] || '')
  } catch (e) {
    console.error('char-sell:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo publicar.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['vender <n°> <precio>']
handler.tags = ['rpg', 'gacha']
handler.command = ['vender', 'sellchar', 'venderchar', 'cvender']
handler.group = true

export default handler
