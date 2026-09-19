import {
  resolveGroupTarget,
  findWarningKey
} from '../lib/resolve-group-target.js'

let handler = async (m, { conn, args, participants, usedPrefix, command }) => {
  if (!m.isGroup) {
    return conn.sendMessage(
      m.chat,
      {
        text: '[❗] Este comando solo puede ser usado en grupos.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  if (!global.db.data.warnings) global.db.data.warnings = {}
  if (!global.db.data.warnings[m.chat]) global.db.data.warnings[m.chat] = {}

  const metadatos =
    (conn.chats[m.chat] || {}).metadata ||
    (await conn.groupMetadata(m.chat).catch(_ => null)) ||
    {}
  const partes = metadatos.participants || participants || []
  const nombreGrupo = metadatos.subject || ''

  const tieneObjetivo =
    m.mentionedJid?.length ||
    m.quoted ||
    m.msg?.contextInfo?.participant ||
    (args?.[0] && String(args[0]).replace(/\D/g, '').length >= 8)

  if (tieneObjetivo) {
    const objetivo = await resolveGroupTarget(m, args, conn, partes)
    if (!objetivo.ok) {
      return conn.sendMessage(
        m.chat,
        {
          text:
            objetivo.reason === 'not_in_group'
              ? `[❗] No encontré a ese usuario en el grupo.\n> Prueba: ${usedPrefix + command} @usuario`
              : `[❗] Menciona o *responde el mensaje*.\n\n> ${usedPrefix + command} @usuario\n> (responde) ${usedPrefix + command}`,
          contextInfo: { ...rcanal.contextInfo }
        },
        { quoted: m }
      )
    }

    const { quien, ids } = objetivo
    const clave =
      findWarningKey(m.chat, ids) ||
      (global.db.data.warnings[m.chat][quien] ? quien : null)
    const advertenciasUsuario = clave
      ? global.db.data.warnings[m.chat][clave]
      : null

    if (!advertenciasUsuario || advertenciasUsuario.count === 0) {
      return conn.sendMessage(
        m.chat,
        {
          text:
            `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀\n\n` +
            `> *Usuario:* @${String(quien).split('@')[0]}\n` +
            `> *Advertencias:* 0/3`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [quien]
          }
        },
        { quoted: m }
      )
    }

    let textoAdvertencias =
      `𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗱𝗲 𝗨𝘀𝘂𝗮𝗿𝗶𝗼\n` +
      `> *Usuario:* @${String(quien).split('@')[0]}\n` +
      `> *Advertencias:* ${advertenciasUsuario.count}/3 ${advertenciasUsuario.count >= 2 ? '⚠️' : '📋'}\n`

    advertenciasUsuario.warnings.forEach((adv, index) => {
      const date = new Date(adv.timestamp).toLocaleDateString('es-ES')
      const nombreAdmin = String(adv.admin || '').split('@')[0]
      textoAdvertencias += `> *${index + 1}.* ${adv.reason}\n`
      textoAdvertencias += `> *Admin:* @${nombreAdmin} | ${date}\n`
    })

    textoAdvertencias += `> *Grupo:* ${nombreGrupo}\n`
    if (advertenciasUsuario.count >= 2) {
      textoAdvertencias += `> ⚠️ *¡Próxima advertencia = Expulsión!* ⚠️\n`
    }

    const usuariosMencionados = [
      quien,
      ...advertenciasUsuario.warnings.map(w => w.admin).filter(Boolean)
    ]

    return conn.sendMessage(
      m.chat,
      {
        text: textoAdvertencias,
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: usuariosMencionados
        }
      },
      { quoted: m }
    )
  }

  const todasLasAdvertencias = global.db.data.warnings[m.chat]
  const usuariosConAdvertencias = Object.keys(todasLasAdvertencias).filter(
    usuario => todasLasAdvertencias[usuario]?.count > 0
  )

  if (usuariosConAdvertencias.length === 0) {
    return conn.sendMessage(
      m.chat,
      {
        text:
          `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼\n\n` +
          `> *Grupo:* ${nombreGrupo}\n` +
          `> *Usuarios con advertencias:* 0`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }

  let textoAdvertenciasGrupo =
    `🌴 𝗔𝗱𝘃𝗲𝗿𝘁𝗲𝗻𝗰𝗶𝗮𝘀 𝗱𝗲𝗹 𝗚𝗿𝘂𝗽𝗼\n\n` +
    `> *Grupo:* ${nombreGrupo}\n` +
    `> *Usuarios con advertencias:* ${usuariosConAdvertencias.length}\n`

  const usuariosMencionados = []

  for (let i = 0; i < usuariosConAdvertencias.length; i++) {
    const idUsuario = usuariosConAdvertencias[i]
    const advertenciasUsuario = todasLasAdvertencias[idUsuario]
    const nombreUsuario = idUsuario.split('@')[0]

    usuariosMencionados.push(idUsuario)

    textoAdvertenciasGrupo += `> *${i + 1}.* @${nombreUsuario}\n`
    textoAdvertenciasGrupo += `> *Advertencias:* ${advertenciasUsuario.count}/3 ${advertenciasUsuario.count >= 2 ? '⚠️' : '📋'}\n`

    if (i < usuariosConAdvertencias.length - 1) {
      textoAdvertenciasGrupo += `│\n`
    }
  }

  textoAdvertenciasGrupo +=
    `\n\n> *Comando:* ${usedPrefix}warnings @usuario\n` +
    `> o responde un mensaje con ${usedPrefix}warnings`

  return conn.sendMessage(
    m.chat,
    {
      text: textoAdvertenciasGrupo,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: usuariosMencionados
      }
    },
    { quoted: m }
  )
}

handler.help = ['#warnings @usuario / responder / lista']
handler.command = ['warnings', 'advertencias', 'veradvertencias', 'listwarns']
handler.group = true
handler.admin = true

export default handler
