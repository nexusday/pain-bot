import { showHarem } from '../lib/characters/index.js'

let handler = async (m, { conn, usedPrefix }) => {
  try {
    await showHarem(m, conn, usedPrefix || '.')
  } catch (error) {
    console.error('char-harem:', error)
    await conn.sendMessage(m.chat, {
      text: `*[❗] No se pudo mostrar el harem.*\n> ${error?.message || error}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m }).catch(() => {})
  }
}

handler.help = ['harem', 'personajes', 'mischars']
handler.tags = ['rpg', 'gacha']
handler.command = ['harem', 'personajes', 'mischars', 'coleccion', 'chars']
handler.group = true

export default handler
