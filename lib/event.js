import { buscarParticipanteGrupo, buscarParticipanteBot } from './group-participant.js'

export async function manejarEventosGrupo(m, conn, _esAdmin, _esBotAdmin, _esOwner, _participantes) {
  if (!m.isGroup) return

  const texto = m.text?.toLowerCase().trim()
  if (!texto) return

  const metadatosGrupo = await conn.groupMetadata(m.chat).catch(_ => (conn.chats[m.chat] || {}).metadata || {})
  const participants = (m.isGroup ? metadatosGrupo.participants : []) || []
  const usuario = (m.isGroup ? buscarParticipanteGrupo(participants, m, conn) : null) || {}
  const bot = (m.isGroup ? buscarParticipanteBot(participants, conn) : null) || {}
  const esRAdmin = usuario?.admin == 'superadmin' || false
  const esAdmin = esRAdmin || usuario?.admin == 'admin' || false
  const esBotAdmin = bot?.admin || false

  const crearIdsOwner = (number) => {
    const numeroLimpio = number.replace(/[^0-9]/g, '')
    return [
      numeroLimpio + '@s.whatsapp.net',
      numeroLimpio + '@lid'
    ]
  }

  const todosIdsOwner = [
    conn.decodeJid(conn.user.id),
    ...global.owner.flatMap(([number]) => crearIdsOwner(number)),
    ...(global.ownerLid || []).flatMap(([number]) => crearIdsOwner(number))
  ]

  const esROwner = todosIdsOwner.includes(m.sender)
  const esOwner = esROwner || m.fromMe

  const estaPermitido = esAdmin || esOwner
  if (!estaPermitido) return

  if (texto === 'abrir') {
    if (!metadatosGrupo.announce) return
    try {
      await conn.groupSettingUpdate(m.chat, 'not_announcement')
      await conn.sendMessage(m.chat, {
        text: `🌴 Grupo abierto por ${m.name || 'un admin'}.`,
        contextInfo: {
          ...global.rcanal.contextInfo
        }
      }, { quoted: m })
    } catch (e) {
      console.error('Error abriendo grupo:', e)
    }
  } else if (texto === 'cerrar') {
    if (metadatosGrupo.announce) return
    try {
      await conn.groupSettingUpdate(m.chat, 'announcement')
      await conn.sendMessage(m.chat, {
        text: `🌴 Grupo cerrado por ${m.name || 'un admin'}.`,
        contextInfo: {
          ...global.rcanal.contextInfo
        }
      }, { quoted: m })
    } catch (e) {
      console.error('Error cerrando grupo:', e)
    }
  }
  else if (texto === 'del' || texto === 'delete' || texto === 'eliminar') {
    // silent delete: remove quoted message and the command message without sending texts
    if (!m.quoted) return

    // prefer the isBotAdmin value passed from handler, fallback to local calculation
    const botEsAdmin = typeof _esBotAdmin !== 'undefined' ? _esBotAdmin : esBotAdmin
    if (!botEsAdmin) return

    try {
      // try multiple ways to get the quoted message id and participant
      const claveCitada = m.quoted?.key || m.msg?.contextInfo
      const idMensaje = claveCitada?.id || m.quoted?.id || m.msg?.contextInfo?.stanzaId
      const participante = claveCitada?.participant || m.msg?.contextInfo?.participant || m.quoted?.participant || m.sender

      if (idMensaje) {
        await conn.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: idMensaje, participant: participante } }).catch(() => {})
      }

      // delete the command message
      const idCmd = m.key?.id
      if (idCmd) await conn.sendMessage(m.chat, { delete: { remoteJid: m.chat, fromMe: false, id: idCmd, participant: m.sender } }).catch(() => {})
    } catch (err) {
      console.error('Error al procesar del en event.js:', err)
    }
    return
  }
}

export {
  manejarEventosGrupo as handleGroupEvents
}
