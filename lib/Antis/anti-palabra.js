/**
 * Sistema Anti-Palabra
 * Detecta palabras prohibidas configuradas por grupo y aplica acción.
 */

export async function handleAntiPalabra(m, conn, isAdmin, rcanal) {
  try {
    if (!m.isGroup) return
    if (!global.db || !global.db.data) return
    if (!global.db.data.antiPalabra || !global.db.data.antiPalabra[m.chat]) return

    const cfg = global.db.data.antiPalabra[m.chat]
    if (!cfg || cfg.enabled !== true) return

    const text = (m.text || '').toString()
    if (!text) return

    
    const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
    let _prefix = global.prefix
    let isCommand = (_prefix instanceof RegExp ?
      _prefix.test(text) :
      Array.isArray(_prefix) ?
        _prefix.some(p => new RegExp(str2Regex(p)).test(text)) :
        typeof _prefix === 'string' ?
          new RegExp(str2Regex(_prefix)).test(text) :
          false
    )
    if (isCommand) return

    
    const words = Array.isArray(cfg.words) ? cfg.words : []
    if (words.length === 0) return

    const found = words.some(w => {
      const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp('\\b' + escaped + '\\b', 'i')
      return re.test(text)
    })

    if (!found) return


    if (isAdmin) return false

    const action = cfg.action || 'delete'

    try {
      
      if (action === 'delete' || action === 'kick') {
        await conn.sendMessage(m.chat, { delete: m.key }).catch(() => {})
      }

      if (action === 'kick') {
        await conn.sendMessage(m.chat, {
          text: `@${m.sender.split('@')[0]} Ha usado una palabra prohibida y será expulsado.`,
          contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] }
        }, { quoted: m })
        await conn.groupParticipantsUpdate(m.chat, [m.sender], 'remove')
      } else {
        
        await conn.sendMessage(m.chat, {
          text: `@${m.sender.split('@')[0]} Mensaje eliminado por usar palabra prohibida.`,
          contextInfo: { ...rcanal.contextInfo, mentionedJid: [m.sender] }
        }, { quoted: m }).catch(() => {})
      }
    } catch (e) {
      console.error('anti-palabra action error:', e)
    }

    return true
  } catch (e) {
    console.error('handleAntiPalabra error:', e)
    return false
  }
}
