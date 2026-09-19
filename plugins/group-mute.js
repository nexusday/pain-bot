import {
  findGroupParticipant,
  findBotParticipant,
  jidsParticipante,
  jidsSeSolapan
} from '../lib/group-participant.js'
import { resolveGroupTarget, isOwnerJid } from '../lib/resolve-group-target.js'

function eliminarSolapados(listaSilenciados, idsObjetivo) {
  return (listaSilenciados || []).filter(j => !jidsSeSolapan([j], idsObjetivo))
}

let handler = async (m, { conn, args, usedPrefix, command, isAdmin, participants }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(
        m.chat,
        {
          text: '[❗] Este comando sólo funciona en grupos.',
          contextInfo: { ...rcanal.contextInfo }
        },
        { quoted: m }
      )
    }

    const metadatos =
      (conn.chats[m.chat] || {}).metadata ||
      (await conn.groupMetadata(m.chat).catch(_ => null)) ||
      {}
    const partes = metadatos.participants || participants || []

    const usuario = findGroupParticipant(partes, m, conn) || {}
    const esAdminManual =
      Boolean(isAdmin) ||
      usuario?.admin === 'admin' ||
      usuario?.admin === 'superadmin'

    const esOwnerManual =
      global.owner?.some(
        ([numero]) =>
          String(numero).replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender
      ) ||
      global.ownerLid?.some(
        ([numero]) => String(numero).replace(/[^0-9]/g, '') + '@lid' === m.sender
      ) ||
      m.sender === conn.user?.jid

    if (!esAdminManual && !esOwnerManual) {
      return conn.sendMessage(
        m.chat,
        {
          text: '[❗] Solo los administradores pueden usar este comando.',
          contextInfo: { ...rcanal.contextInfo }
        },
        { quoted: m }
      )
    }

    const objetivo = await resolveGroupTarget(m, args, conn, partes)
    if (!objetivo.ok) {
      return conn.sendMessage(
        m.chat,
        {
          text:
            objetivo.reason === 'not_in_group'
              ? `[❗] No encontré a ese usuario en el grupo.\n> Prueba: ${usedPrefix}mute @usuario`
              : `Uso:\n> ${usedPrefix}mute @usuario\n> (responde un mensaje) ${usedPrefix}mute\n> ${usedPrefix}delmute @usuario`,
          contextInfo: { ...rcanal.contextInfo }
        },
        { quoted: m }
      )
    }

    const { quien, participante, ids } = objetivo
    const jidMencion = quien

    if (!global.db.data.muted) global.db.data.muted = {}
    if (!global.db.data.muted[m.chat]) global.db.data.muted[m.chat] = []

    const botPart = findBotParticipant(partes, conn)
    const idsBot = jidsParticipante(botPart, conn).concat(
      [conn.user?.jid, conn.user?.id].filter(Boolean)
    )
    if (jidsSeSolapan(ids, idsBot)) {
      return conn.sendMessage(
        m.chat,
        {
          text: '[❌] No puedes mutear al bot.',
          contextInfo: { ...rcanal.contextInfo }
        },
        { quoted: m }
      )
    }

    if (participante?.admin === 'admin' || participante?.admin === 'superadmin') {
      return conn.sendMessage(
        m.chat,
        {
          text: '[❌] No puedes mutear a un administrador del grupo.',
          contextInfo: { ...rcanal.contextInfo }
        },
        { quoted: m }
      )
    }

    if (isOwnerJid(ids)) {
      return conn.sendMessage(
        m.chat,
        {
          text: '[❌] No puedes mutear al propietario del bot.',
          contextInfo: { ...rcanal.contextInfo }
        },
        { quoted: m }
      )
    }

    const silenciados = global.db.data.muted[m.chat]
    const yaSilenciado = jidsSeSolapan(silenciados, ids)

    if (command === 'mute' || command === 'group-mute' || command === 'mutechat') {
      if (yaSilenciado) {
        return conn.sendMessage(
          m.chat,
          {
            text: 'El usuario ya está muteado.',
            contextInfo: { ...rcanal.contextInfo }
          },
          { quoted: m }
        )
      }
      for (const jidUsuario of ids) {
        if (!silenciados.includes(jidUsuario)) silenciados.push(jidUsuario)
      }
      return conn.sendMessage(
        m.chat,
        {
          text: `🔇 Usuario muteado correctamente\n> @${jidMencion.split('@')[0]}`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [jidMencion, m.sender]
          }
        },
        { quoted: m }
      )
    }

    if (command === 'delmute' || command === 'unmute' || command === 'group-unmute') {
      if (!yaSilenciado) {
        return conn.sendMessage(
          m.chat,
          {
            text: 'El usuario no está muteado.',
            contextInfo: { ...rcanal.contextInfo }
          },
          { quoted: m }
        )
      }
      global.db.data.muted[m.chat] = eliminarSolapados(silenciados, ids)
      return conn.sendMessage(
        m.chat,
        {
          text: `🔊 Usuario desmuteado correctamente\n> @${jidMencion.split('@')[0]}`,
          contextInfo: {
            ...rcanal.contextInfo,
            mentionedJid: [jidMencion, m.sender]
          }
        },
        { quoted: m }
      )
    }

    return conn.sendMessage(
      m.chat,
      {
        text: `Comando no reconocido. Uso: ${usedPrefix}mute @usuario | ${usedPrefix}delmute @usuario`,
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  } catch (e) {
    console.error(e)
    return conn.sendMessage(
      m.chat,
      {
        text: '[❌] Error al procesar el comando.',
        contextInfo: { ...rcanal.contextInfo }
      },
      { quoted: m }
    )
  }
}

handler.help = ['#mute / #delmute @usuario o responder']
handler.command = ['mute', 'delmute', 'unmute', 'group-mute', 'group-unmute']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
