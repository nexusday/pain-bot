/**
 * Dual Baileys: conexión con @whiskeysockets/baileys + interactivos con @itsliaaa/baileys
 *
 * - @whiskeysockets/baileys → socket, auth, newsletters, handler
 * - @itsliaaa/baileys → generar interactivos + nodos biz obligatorios para botones/listas
 *
 * IMPORTANTE: relayMessage de Whiskey NO agrega nodos <biz> que WhatsApp exige para
 * buttonsMessage / interactiveMessage / listMessage. Sin esos nodos el mensaje se envía
 * pero NO muestra botones. Por eso sendViaLia inyecta getBizBinaryNode de Itsliaaa.
 */

export const BAILEYS_WHISKEY = '@whiskeysockets/baileys'
export const BAILEYS_LIA = '@itsliaaa/baileys'

let _lia = null

async function getLia() {
  if (!_lia) {
    _lia = await import('@itsliaaa/baileys')
  }
  return _lia
}

export function isInteractiveBaileysEnabled() {
  return global.baileysInteractive !== false
}

function getInnerMessage(message) {
  if (!message || typeof message !== 'object') return message
  if (message.ephemeralMessage?.message) {
    return getInnerMessage(message.ephemeralMessage.message)
  }
  if (message.viewOnceMessage?.message) {
    return getInnerMessage(message.viewOnceMessage.message)
  }
  if (message.viewOnceMessageV2?.message) {
    return getInnerMessage(message.viewOnceMessageV2.message)
  }
  return message
}

export async function sendViaLia(conn, jid, content, options = {}) {
  if (!conn?.user) throw new Error('Socket no conectado')
  if (!isInteractiveBaileysEnabled()) {
    return conn.sendMessage(jid, content, options)
  }

  const lia = await getLia()
  const { generateWAMessage, normalizeMessageContent, shouldIncludeBizBinaryNode } = lia
  const { getBizBinaryNode } = await import('@itsliaaa/baileys/lib/WABinary/generic-utils.js')

  try {
    const msg = await generateWAMessage(jid, content, {
      userJid: conn.user?.id || conn.user?.jid,
      upload: conn.waUploadToServer,
      ...options,
    })

    const innerMessage = normalizeMessageContent(msg.message) || getInnerMessage(msg.message) || msg.message
    const relayOptions = {
      messageId: msg.key.id,
      ...(options.relayOptions || {}),
    }

    if (shouldIncludeBizBinaryNode(innerMessage)) {
      const bizNode = getBizBinaryNode(innerMessage)
      relayOptions.additionalNodes = [
        ...(relayOptions.additionalNodes || []),
        bizNode,
      ]
    }

    await conn.relayMessage(jid, msg.message, relayOptions)

    return msg
  } catch (error) {
    console.error('[itsliaaa/baileys] Error al enviar interactivo:', error?.message || error)
    throw error
  }
}

export function normalizeLiaButtons(buttons = []) {
  return buttons.map((btn) => {
    if (btn && typeof btn === 'object' && !Array.isArray(btn)) return btn
    if (Array.isArray(btn)) return { text: btn[0], id: btn[1] }
    return btn
  })
}

export function normalizeLiaListSections(listSections = []) {
  return listSections.map((section) => {
    if (section?.title && section?.rows) return section
    if (Array.isArray(section) && section.length >= 2) {
      return {
        title: section[0],
        rows: (section[1] || []).map((row) => {
          if (Array.isArray(row)) {
            return {
              title: row[0],
              description: row[1] || '',
              rowId: row[2] || row[0],
            }
          }
          return row
        }),
      }
    }
    return section
  })
}
