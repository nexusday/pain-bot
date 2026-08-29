import {
  extractNewsletterFromMessage,
  resolveNewsletter,
  formatCanalConfig,
  isNewsletterJid
} from '../lib/newsletter-rcanal.js'

let handler = async (m, { conn, args, usedPrefix, isOwner }) => {
  if (!isOwner) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo puede ser usado por el owner del bot.',
      contextInfo: { ...global.rcanal?.contextInfo }
    }, { quoted: m })
  }

  const input = args.join(' ').trim()
  let jid = ''
  let name = ''
  let invite = ''
  let source = ''

  if (input) {
    const resolved = await resolveNewsletter(conn, input).catch(() => null)
    if (!resolved?.jid) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No pude resolver ese canal.\n\nUsa un link tipo:\nhttps://whatsapp.com/channel/XXXXXXXX\n\nO el JID:\n120363423390538090@newsletter`,
        contextInfo: { ...global.rcanal?.contextInfo }
      }, { quoted: m })
    }
    jid = resolved.jid
    name = resolved.name || ''
    invite = resolved.invite || ''
    source = 'link'
  } else {
    const fromMessage = extractNewsletterFromMessage(m)
    if (fromMessage.jid) {
      jid = fromMessage.jid
      name = fromMessage.name || ''
      source = fromMessage.source || 'mensaje'
    } else if (isNewsletterJid(m.chat)) {
      jid = m.chat
      source = 'chat'
      const resolved = await resolveNewsletter(conn, jid).catch(() => null)
      if (resolved?.name) name = resolved.name
    } else if (m.quoted) {
      const fromQuoted = extractNewsletterFromMessage(m.quoted)
      if (fromQuoted.jid) {
        jid = fromQuoted.jid
        name = fromQuoted.name || ''
        source = 'respuesta'
      }
    }
  }

  if (!jid) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No detecté ningún canal en este chat.\n\n*Opciones:*\n• ${usedPrefix}canalid https://whatsapp.com/channel/XXXX\n• Responde a un mensaje del canal con ${usedPrefix}canalid\n• Escribe ${usedPrefix}canalid dentro del canal\n\n_Los comentarios del canal no muestran el ID en consola; usa el link del canal._`,
      contextInfo: { ...global.rcanal?.contextInfo }
    }, { quoted: m })
  }

  if (!name && typeof conn.newsletterMetadata === 'function') {
    const resolved = await resolveNewsletter(conn, jid).catch(() => null)
    if (resolved?.name) {
      name = resolved.name
      invite = invite || resolved.invite || ''
    }
  }

  const lines = [
    'ᬊ *Datos del canal / newsletter*',
    '',
    `• *JID:* \`${jid}\``,
    name ? ` *Nombre:* ${name}` : null,
    invite ? ` *Invite:* ${invite}` : null,
    source ? ` *Detectado por:* ${source}` : null,
    '',
    '*Pega esto en config.js:*',
    '```',
    formatCanalConfig(jid, name || 'Canal'),
    '```',
    '',
    '_Reinicia el bot o guarda config.js para aplicar la etiqueta en los mensajes._'
  ].filter(Boolean)

  await conn.sendMessage(m.chat, {
    text: lines.join('\n'),
    contextInfo: { ...global.rcanal?.contextInfo }
  }, { quoted: m })
}

handler.help = [
  '#canalid • #getcanal • #newsletter',
  '→ Obtener el JID del canal para config.js',
  '→ Uso: .canalid <link del canal>',
  '→ También funciona respondiendo a un mensaje del canal'
]
handler.tags = ['owner']
handler.command = ['canalid', 'getcanal', 'newsletter', 'canal']

export default handler
