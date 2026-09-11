import { listCharacterForSale } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix, args }) => {
  try {
    await listCharacterForSale(m, conn, usedPrefix || '.', args?.[0] || '', args?.[1] || '')
  } catch (error) {
    console.error('char-sell:', error)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo publicar.*\n> ${error?.message || error}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['vender <n°> <precio>']
handler.tags = ['rpg', 'gacha']
handler.command = ['vender', 'sellchar', 'venderchar', 'cvender']
handler.group = true

export default handler
