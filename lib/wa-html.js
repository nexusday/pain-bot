import { randomUUID, getRandomValues } from 'crypto'
import { generateMessageID } from '@whiskeysockets/baileys'

/** Typenames del primitive HTML (requeridos por el protocolo) */
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

/**
 * Mensaje HTML embebido. Sin textos visibles de IA / disclaimer.
 * Solo el WebView con el HTML del juego.
 */
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

export async function enviarHtmlWhatsApp(conn, jid, opciones = {}, relayOptions = {}) {
  const message = construirMensajeHtml(opciones)
  const messageId = generateMessageID()
  await conn.relayMessage(jid, message, { messageId, ...relayOptions })
  return { key: { remoteJid: jid, fromMe: true, id: messageId }, message }
}

export {
  construirMensajeHtml as buildHtmlMessage,
  enviarHtmlWhatsApp as sendHtmlWhatsApp
}
