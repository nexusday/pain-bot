import { showTopHarem } from '../lib/characters/index.js'
import { prepararIdentidadesPareja } from '../lib/parejas.js'

let handler = async (m, { conn, usedPrefix, args, participants = [] }) => {
  try {
    participants = await prepararIdentidadesPareja(m, conn, participants, global.db.data, false)
    await showTopHarem(m, conn, usedPrefix || '.', args?.[0] || '10', participants)
  } catch (error) {
    console.error('char-topharem:', error)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo mostrar el top harem.*\n> ${error?.message || error}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['topharem', 'gacha', 'topharem <n>']
handler.tags = ['rpg', 'gacha']
handler.command = ['topharem', 'topharems', 'topchars', 'topgacha', 'gacha']
handler.group = true

export default handler
