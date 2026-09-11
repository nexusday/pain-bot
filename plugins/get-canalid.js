import {
  extractNewsletterFromMessage,
  resolveNewsletter,
  formatCanalConfig,
  formatLogsSubbotsConfig,
  isNewsletterJid
} from '../lib/newsletter-rcanal.js'

let handler = async (m, { conn, args, usedPrefix, isOwner }) => {
  if (!isOwner) {
    return conn.sendMessage(m.chat, {
      text: '[❗] Este comando solo puede ser usado por el owner del bot.',
      contextInfo: { ...global.rcanal?.contextInfo }
    }, { quoted: m })
  }

  const entrada = args.join(' ').trim()
  let jidUsuario = ''
  let nombre = ''
  let invitacion = ''
  let fuente = ''

  if (entrada) {
    const resuelto = await resolveNewsletter(conn, entrada).catch(() => null)
    if (!resuelto?.jid) {
      return conn.sendMessage(m.chat, {
        text: `[❌] No pude resolver ese canal.\n\nUsa un link tipo:\nhttps://whatsapp.com/channel/XXXXXXXX\n\nO el JID:\n120363423390538090@newsletter`,
        contextInfo: { ...global.rcanal?.contextInfo }
      }, { quoted: m })
    }
    jidUsuario = resuelto.jid
    nombre = resuelto.name || ''
    invitacion = resuelto.invite || ''
    fuente = 'link'
  } else {
    const desdeMensaje = extractNewsletterFromMessage(m)
    if (desdeMensaje.jid) {
      jidUsuario = desdeMensaje.jid
      nombre = desdeMensaje.name || ''
      fuente = desdeMensaje.source || 'mensaje'
    } else if (isNewsletterJid(m.chat)) {
      jidUsuario = m.chat
      fuente = 'chat'
      const resuelto = await resolveNewsletter(conn, jidUsuario).catch(() => null)
      if (resuelto?.name) nombre = resuelto.name
    } else if (m.quoted) {
      const desdeCitado = extractNewsletterFromMessage(m.quoted)
      if (desdeCitado.jid) {
        jidUsuario = desdeCitado.jid
        nombre = desdeCitado.name || ''
        fuente = 'respuesta'
      }
    }
  }

  if (!jidUsuario) {
    return conn.sendMessage(m.chat, {
      text: `[❗] No detecté ningún canal en este chat.\n\n*Opciones:*\n• ${usedPrefix}canalid https://whatsapp.com/channel/XXXX\n• Responde a un mensaje del canal con ${usedPrefix}canalid\n• Escribe ${usedPrefix}canalid dentro del canal\n\n_Los comentarios del canal no muestran el ID en consola; usa el link del canal._`,
      contextInfo: { ...global.rcanal?.contextInfo }
    }, { quoted: m })
  }

  if (!nombre && typeof conn.newsletterMetadata === 'function') {
    const resuelto = await resolveNewsletter(conn, jidUsuario).catch(() => null)
    if (resuelto?.name) {
      nombre = resuelto.name
      invitacion = invitacion || resuelto.invite || ''
    }
  }

  const lineas = [
    'ᬊ *Datos del canal / newsletter*',
    '',
    `• *JID:* \`${jidUsuario}\``,
    nombre ? ` *Nombre:* ${nombre}` : null,
    invitacion ? ` *Invite:* ${invitacion}` : null,
    fuente ? ` *Detectado por:* ${fuente}` : null,
    '',
    '*Pega esto en config.js:*',
    '```',
    formatCanalConfig(jidUsuario, nombre || 'Canal'),
    '```',
    '',
    '*Para logs de sub-bots (anuncios):*',
    '```',
    formatLogsSubbotsConfig(jidUsuario, nombre || 'Logs Sub-Bots'),
    '```',
    '',
    '_global.canal = etiqueta en mensajes | global.logssubbots = anuncios de sub-bots_'
  ].filter(Boolean)

  await conn.sendMessage(m.chat, {
    text: lineas.join('\n'),
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
