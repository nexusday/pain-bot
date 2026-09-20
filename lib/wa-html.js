import { randomUUID, getRandomValues } from 'crypto'
import { generateMessageID, generateWAMessageFromContent } from '@whiskeysockets/baileys'

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
  if (quoted.key && (quoted.message || quoted.msg)) {
    return {
      key: quoted.key,
      message: quoted.message || quoted.msg || quoted.vM?.message || undefined
    }
  }
  if (quoted.fakeObj?.key) return quoted.fakeObj
  if (quoted.vM?.key) return quoted.vM
  return quoted
}

export async function enviarHtmlWhatsApp(conn, jid, opciones = {}, relayOptions = {}) {
  const { quoted, ...restRelay } = relayOptions
  const content = construirMensajeHtml(opciones)
  const quotedMsg = resolverQuoted(quoted)

  const full = generateWAMessageFromContent(jid, content, {
    userJid: conn.user?.id || conn.user?.jid,
    ...(quotedMsg ? { quoted: quotedMsg } : {})
  })

  const messageId = full.key?.id || generateMessageID()
  await conn.relayMessage(jid, full.message, { messageId, ...restRelay })
  return { key: { ...full.key, id: messageId, remoteJid: jid, fromMe: true }, message: full.message }
}

export {
  construirMensajeHtml as buildHtmlMessage,
  enviarHtmlWhatsApp as sendHtmlWhatsApp
}
