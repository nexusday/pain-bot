import { showHarem } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix }) => {
  try {
    await showHarem(m, conn, usedPrefix || '.')
  } catch (e) {
    console.error('char-harem:', e)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo mostrar el harem.*\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['harem', 'personajes', 'mischars']
handler.tags = ['rpg', 'gacha']
handler.command = ['harem', 'personajes', 'mischars', 'coleccion', 'chars']
handler.group = true

export default handler
