import { findGroupParticipant } from '../lib/group-participant.js'

function digitosDe(jidUsuario = '') {
  return String(jidUsuario || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function comoJid(valor, preferirLid = false) {
  if (!valor) return ''
  const s = String(valor)
  if (s.includes('@')) return s
  const d = s.replace(/\D/g, '')
  if (!d) return ''
  return preferirLid ? `${d}@lid` : `${d}@s.whatsapp.net`
}

function recolectarIdsObjetivo(quien, participants, conn) {
  const listaIds = new Set([String(quien)].filter(Boolean))
  const p = findGroupParticipant(participants, quien, conn)
  if (p) {
    for (const v of [p.id, p.jid]) if (v) listaIds.add(String(v))
    if (p.lid) listaIds.add(comoJid(p.lid, true))
    if (p.phoneNumber) listaIds.add(comoJid(p.phoneNumber, false))
  }
  return [...listaIds]
}

function idsSeSolapan(listaA, listaB) {
  const conjuntoB = new Set((listaB || []).map(String))
  for (const a of listaA || []) {
    if (conjuntoB.has(String(a))) return true
  }
  const digitosB = new Set((listaB || []).map(digitosDe).filter(d => d.length >= 6))
  for (const a of listaA || []) {
    const d = digitosDe(a)
    if (d.length >= 6 && digitosB.has(d)) return true
  }
  return false
}

function eliminarSolapados(listaSilenciados, idsObjetivo) {
  return (listaSilenciados || []).filter(j => !idsSeSolapan([j], idsObjetivo))
}

let handler = async (m, { conn, args, usedPrefix, command, isAdmin, participants }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, { text: '[❗] Este comando sólo funciona en grupos.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (!isAdmin) {
      return conn.sendMessage(m.chat, { text: '[❗] Solo los administradores pueden usar este comando.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    let quien
    if (m.mentionedJid && m.mentionedJid.length) quien = m.mentionedJid[0]
    else if (m.quoted && m.quoted.sender) quien = m.quoted.sender
    else if (args && args[0]) {
      const id = args[0].replace(/[^0-9]/g, '')
      quien = id + '@s.whatsapp.net'
    }

    if (!quien) {
      return conn.sendMessage(m.chat, { text: `Uso: ${usedPrefix}mute @usuario  ó  ${usedPrefix}delmute @usuario`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (!global.db.data.muted) global.db.data.muted = {}
    if (!global.db.data.muted[m.chat]) global.db.data.muted[m.chat] = []

    const idsObjetivo = recolectarIdsObjetivo(quien, participants, conn)
    const jidMencion = idsObjetivo[0] || quien

    const participanteObjetivo = findGroupParticipant(participants, quien, conn)
    const esAdminObjetivo = participanteObjetivo?.admin === 'admin' || participanteObjetivo?.admin === 'superadmin'

    const idsOwner = [
      ...(global.owner || []).map(v => {
        const numLimpio = typeof v === 'string' ? v.replace(/[^0-9]/g, '') : String(v).replace(/[^0-9]/g, '')
        return numLimpio ? `${numLimpio}@s.whatsapp.net` : ''
      }),
      ...(global.ownerLid || []).map(v => {
        const raw = Array.isArray(v) ? v[0] : v
        const numLimpio = String(raw || '').replace(/[^0-9]/g, '')
        return numLimpio ? `${numLimpio}@lid` : ''
      })
    ].filter(Boolean)

    const idsBot = recolectarIdsObjetivo(conn.user?.jid || conn.user?.id, participants, conn)
    if (idsSeSolapan(idsObjetivo, idsBot)) {
      return conn.sendMessage(m.chat, { text: '[❌] No puedes mutear al bot.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (esAdminObjetivo) {
      return conn.sendMessage(m.chat, { text: '[❌] No puedes mutear a un administrador del grupo.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    if (idsSeSolapan(idsObjetivo, idsOwner)) {
      return conn.sendMessage(m.chat, { text: '[❌] No puedes mutear al propietario del bot.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }

    const silenciados = global.db.data.muted[m.chat]
    const yaSilenciado = idsSeSolapan(silenciados, idsObjetivo)

    if (command === 'mute' || command === 'group-mute' || command === 'mutechat') {
      if (yaSilenciado) {
        return conn.sendMessage(m.chat, { text: `El usuario ya está muteado.`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      }
      for (const jidUsuario of idsObjetivo) {
        if (!silenciados.includes(jidUsuario)) silenciados.push(jidUsuario)
      }
      return conn.sendMessage(m.chat, {
        text: `🔇 Usuario muteado correctamente\n> @${jidMencion.split('@')[0]}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [jidMencion, m.sender] }
      }, { quoted: m })
    }

    if (command === 'delmute' || command === 'unmute' || command === 'group-unmute') {
      if (!yaSilenciado) {
        return conn.sendMessage(m.chat, { text: `El usuario no está muteado.`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
      }
      global.db.data.muted[m.chat] = eliminarSolapados(silenciados, idsObjetivo)
      return conn.sendMessage(m.chat, {
        text: `🔊 Usuario desmuteado correctamente\n> @${jidMencion.split('@')[0]}`,
        contextInfo: { ...rcanal.contextInfo, mentionedJid: [jidMencion, m.sender] }
      }, { quoted: m })
    }

    return conn.sendMessage(m.chat, { text: `Comando no reconocido. Uso: ${usedPrefix}mute @usuario | ${usedPrefix}delmute @usuario`, contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  } catch (e) {
    console.error(e)
    return conn.sendMessage(m.chat, { text: '[❌] Error al procesar el comando.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
  }
}

handler.command = ['mute', 'delmute', 'unmute', 'group-mute', 'group-unmute']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
