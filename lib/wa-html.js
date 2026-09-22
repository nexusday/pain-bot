import { randomUUID, getRandomValues } from 'crypto'
import {
  generateMessageID,
  getContentType,
  jidNormalizedUser,
  normalizeMessageContent,
  proto
} from '@whiskeysockets/baileys'

export const HTML_PRIMITIVE_TYPENAMES = [
  'FOAHtmlPrimitiveDemoDONOTUSE',
  'GenAIaeacdsnwHtmlPrimitive'
]

function firmaBotMetadata() {
  const signature = new Uint8Array(64)
  getRandomValues(signature)
  return signature
}

function certificadoBotMetadata(length = 685) {
  const certificate = new Uint8Array(length)
  certificate[0] = 48
  certificate[1] = 130
  getRandomValues(certificate.subarray(2))
  return certificate
}

export function construirMensajeHtml({
  html,
  typename = HTML_PRIMITIVE_TYPENAMES[0],
  trustedSources = [],
  botJid = '867051314767696@bot'
} = {}) {
  if (!html || typeof html !== 'string') {
    throw new Error('html requerido')
  }

  const responseId = randomUUID()

  const unified = {
    __typename: 'GenAIUnifiedResponse',
    response_id: responseId,
    sections: [{
      __typename: 'GenAIUnifiedResponseSection',
      view_model: {
        __typename: 'GenAISingleLayoutViewModel',
        primitive: {
          __typename: typename,
          trusted_sources: Array.isArray(trustedSources) ? trustedSources : [],
          payload: html
        }
      }
    }]
  }

  return {
    messageContextInfo: {
      deviceListMetadata: {},
      deviceListMetadataVersion: 2,
      botMetadata: {
        botResponseId: responseId,
        verificationMetadata: {
          proofs: [{
            certificateChain: [
              certificadoBotMetadata(),
              certificadoBotMetadata(892)
            ],
            version: 1,
            useCase: 1,
            signature: firmaBotMetadata()
          }]
        }
      }
    },
    botForwardedMessage: {
      message: {
        richResponseMessage: {
          messageType: 1,
          submessages: [],
          unifiedResponse: {
            data: Buffer.from(JSON.stringify(unified))
          },
          contextInfo: {
            isForwarded: true,
            forwardingScore: 1,
            forwardedAiBotMessageInfo: { botJid },
            forwardOrigin: 4
          }
        }
      }
    }
  }
}

/** Resuelve un mensaje quoted usable por Baileys. */
function resolverQuoted(quoted) {
  if (!quoted) return null
  if (quoted.fakeObj?.key) return quoted.fakeObj
  if (quoted.vM?.key) return quoted.vM
  if (quoted.key && (quoted.message || quoted.msg)) {
    return {
      key: quoted.key,
      message: quoted.message || quoted.msg || quoted.vM?.message || undefined,
      participant: quoted.participant || quoted.sender
    }
  }
  return quoted?.key ? quoted : null
}

/**
 * FutureProofMessage (botForwardedMessage) no serializa contextInfo.
 * El reply debe ir en richResponseMessage.contextInfo.
 */
function aplicarQuoteEnHtml(content, jid, quoted, userJid) {
  const q = resolverQuoted(quoted)
  if (!q?.key?.id) return content

  const rich = content?.botForwardedMessage?.message?.richResponseMessage
  if (!rich) return content

  const participant = q.key.fromMe
    ? userJid
    : (q.participant || q.key.participant || q.key.remoteJid)

  let quotedMsg = normalizeMessageContent(q.message)
  if (!quotedMsg) {
    quotedMsg = { conversation: '' }
  }
  const msgType = getContentType(quotedMsg)
  if (msgType) {
    quotedMsg = proto.Message.create({ [msgType]: quotedMsg[msgType] })
    const quotedContent = quotedMsg[msgType]
    if (quotedContent && typeof quotedContent === 'object' && 'contextInfo' in quotedContent) {
      delete quotedContent.contextInfo
    }
  }

  rich.contextInfo = {
    ...(rich.contextInfo || {}),
    stanzaId: q.key.id,
    participant: jidNormalizedUser(participant || ''),
    quotedMessage: quotedMsg,
    ...(jid !== q.key.remoteJid && q.key.remoteJid
      ? { remoteJid: q.key.remoteJid }
      : {})
  }

  return content
}

export async function enviarHtmlWhatsApp(conn, jid, opciones = {}, relayOptions = {}) {
  const { quoted, ...restRelay } = relayOptions
  let content = construirMensajeHtml(opciones)
  content = aplicarQuoteEnHtml(
    content,
    jid,
    quoted,
    conn.user?.id || conn.user?.jid
  )

  const messageId = generateMessageID()
  await conn.relayMessage(jid, content, { messageId, ...restRelay })
  return {
    key: { remoteJid: jid, fromMe: true, id: messageId },
    message: content
  }
}

export {
  construirMensajeHtml as buildHtmlMessage,
  enviarHtmlWhatsApp as sendHtmlWhatsApp
}
