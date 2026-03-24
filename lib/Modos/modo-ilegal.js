/**
 * Modo IA Ilegal
 * Respuestas automáticas con contenido sin restricciones usando Gemini AI
 */

export async function handleModoIlegal(m, conn) {
  if (!m.isGroup || !global.db.data.modoIlegal || !global.db.data.modoIlegal[m.chat] || !m.text || m.fromMe) return

  try {
    const { callGeminiIlegalAPI, isLikelyCommand } = await import('../geminiAPI.js')

   
    if (isLikelyCommand(m.text)) return

    
    if (m.text.trim().length < 4) return

    
    if (/^[\s\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u.test(m.text)) return

    const rcanal = global.rcanal || {
      contextInfo: {
        isForwarded: true,
        forwardedNewsletterMessageInfo: {
          newsletterJid: '120363423390538090@newsletter',
          serverMessageId: 100,
          newsletterName: '༼ 𝙋𝙖𝙞𝙣 𝘾𝙤𝙢𝙢𝙪𝙣𝙞𝙩𝙮 ༽'
        }
      }
    }

    const userName = m.pushName || m.name || 'Usuario'
    const groupName = await conn.getName(m.chat) || 'Grupo'

   
    await conn.sendPresenceUpdate('composing', m.chat)

   
    const response = await callGeminiIlegalAPI(m.text, userName, groupName, m.chat)

   
    if (response && response.length > 0) {
      await conn.sendMessage(m.chat, {
        text: response,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }

  } catch (error) {
    console.error('Error en Modo Ilegal:', error)
  }
}
