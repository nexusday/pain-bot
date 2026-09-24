import { findGroupParticipant, resolveTargetJids, senderJidCandidates } from '../lib/group-participant.js'
import { resolveDbUser, isSamePlayer } from '../lib/michi-users.js'
import { resolveGroupTarget } from '../lib/resolve-group-target.js'

const TTL_MS = 60_000

function pendingStore() {
  if (!global.pendingMarriages) global.pendingMarriages = Object.create(null)
  return global.pendingMarriages
}

function clearProposal(chatId, proposal) {
  if (proposal?.timeout) clearTimeout(proposal.timeout)
  if (pendingStore()[chatId] === proposal) delete pendingStore()[chatId]
}

function ensureUser(jid) {
  if (!global.db.data.users[jid]) {
    global.db.data.users[jid] = {
      registered: true,
      name: 'Usuario',
      regTime: Date.now(),
      age: -1,
      level: 1,
      coins: 0,
      exp: 0,
      commandCount: 0,
      stickerCount: 0,
      msgCount: 0,
      msgByChat: {},
      genre: 'No establecido',
      birth: 'No registrado',
      desc: 'Sin descripción',
      favourite: 'No establecido',
      partner: '',
      banned: false,
      prem: false,
      rpgV2: true,
    }
  }
  const u = global.db.data.users[jid]
  if (!('partner' in u)) u.partner = ''
  return u
}


function jidMencionGrupo(jid, participants, conn) {
  if (!jid) return ''
  const part = findGroupParticipant(participants, jid, conn)
  if (part) {
    const id = part.id || part.jid
    if (id) return conn?.decodeJid?.(id) || id
  }
  return conn?.decodeJid?.(jid) || jid
}


function jidParaGuardar(jid, participants, conn) {
  if (!jid) return ''
  const part = findGroupParticipant(participants, jid, conn)
  if (part?.phoneNumber) {
    const dig = String(part.phoneNumber).replace(/\D/g, '')
    if (dig.length >= 8 && dig.length <= 15) return `${dig}@s.whatsapp.net`
  }
  if (String(jid).endsWith('@s.whatsapp.net')) return jid
  return jid
}

function syncPartner(aJid, bJid, conn, participants) {
  const aStore = jidParaGuardar(aJid, participants, conn)
  const bStore = jidParaGuardar(bJid, participants, conn)
  const ahora = Date.now()
  const a = ensureUser(aStore)
  const b = ensureUser(bStore)
  a.partner = bStore
  b.partner = aStore
  a.marriedAt = ahora
  b.marriedAt = ahora

  for (const [key, user] of Object.entries(global.db.data.users)) {
    if (key === aStore || key === bStore) continue
    if (isSamePlayer(key, aJid, conn, participants) || isSamePlayer(key, aStore, conn, participants)) {
      user.partner = bStore
      user.marriedAt = ahora
    } else if (isSamePlayer(key, bJid, conn, participants) || isSamePlayer(key, bStore, conn, participants)) {
      user.partner = aStore
      user.marriedAt = ahora
    }
  }
}

function clearPartner(jid, conn, participants) {
  const { user } = resolveDbUser(jid, conn, participants)
  if (!user?.partner) return null
  const partnerRaw = user.partner
  for (const [key, u] of Object.entries(global.db.data.users)) {
    if (key === jid || isSamePlayer(key, jid, conn, participants)) {
      u.partner = ''
      delete u.marriedAt
    }
    if (key === partnerRaw || isSamePlayer(key, partnerRaw, conn, participants)) {
      u.partner = ''
      delete u.marriedAt
    }
  }
  return partnerRaw
}

let handler = async (m, { conn, usedPrefix, command, participants, args }) => {
  try {
    if (!m.isGroup) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Este comando solo funciona en grupos.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const partes = participants || []
    const cmd = String(command || '').toLowerCase()

    if (['divorce', 'divorciar', 'divorcio'].includes(cmd)) {
      const partnerRaw = clearPartner(m.sender, conn, partes)
      if (!partnerRaw) {
        return conn.sendMessage(m.chat, {
          text: '[❗] No estás casado/a con nadie.',
          contextInfo: { ...(global.rcanal?.contextInfo || {}) },
        }, { quoted: m })
      }

      // Igual que /ban: m.sender + jid del otro en el grupo
      const yo = m.sender
      const pareja = jidMencionGrupo(partnerRaw, partes, conn) || partnerRaw

      return conn.sendMessage(m.chat, {
        text: `💔 *Divorcio*\n\n> @${yo.split('@')[0]} y @${pareja.split('@')[0]} ya no son pareja.`,
        contextInfo: {
          ...(global.rcanal?.contextInfo || {}),
          mentionedJid: [yo, pareja],
        },
      }, { quoted: m })
    }

    
    const objetivo = await resolveGroupTarget(m, args, conn, partes)
    if (!objetivo.ok) {
      return conn.sendMessage(m.chat, {
        text: `[❗] Menciona o *responde el mensaje* de la persona.\n> ${usedPrefix}marry @usuario\n> (responde un mensaje) ${usedPrefix}marry`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const quien = objetivo.quien
    const ids = objetivo.ids || [quien]

    if (isSamePlayer(quien, m.sender, conn, partes)) {
      return conn.sendMessage(m.chat, {
        text: '[❗] No puedes casarte contigo mismo/a.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    if (isSamePlayer(quien, conn.user?.jid || conn.user?.id, conn, partes)) {
      return conn.sendMessage(m.chat, {
        text: '[❗] No puedes casarte con el bot.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const proposer = ensureUser(resolveDbUser(m.sender, conn, partes).jid || m.sender)
    const target = ensureUser(resolveDbUser(quien, conn, partes).jid || quien)

    if (proposer.partner) {
      const p = jidMencionGrupo(proposer.partner, partes, conn) || proposer.partner
      return conn.sendMessage(m.chat, {
        text: `[❗] Ya estás casado/a con @${p.split('@')[0]}.\n> Usa *${usedPrefix}divorce* primero.`,
        contextInfo: {
          ...(global.rcanal?.contextInfo || {}),
          mentionedJid: [p],
        },
      }, { quoted: m })
    }

    if (target.partner) {
      return conn.sendMessage(m.chat, {
        text: `[❗] @${String(quien).split('@')[0]} ya está casado/a.`,
        contextInfo: {
          ...(global.rcanal?.contextInfo || {}),
          mentionedJid: [quien],
        },
      }, { quoted: m })
    }

    if (pendingStore()[m.chat]) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Ya hay una propuesta pendiente en este chat. Espera 1 minuto.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

    const yo = m.sender
    const proposal = {
      proposer: yo,
      target: quien,
      targetJids: [...new Set([...ids, ...resolveTargetJids(quien, partes, conn)])],
      timeout: null,
      msg: null,
    }

    pendingStore()[m.chat] = proposal

    const enviado = await conn.sendMessage(m.chat, {
      text: [
        `💍 *Propuesta de matrimonio*`,
        ``,
        `> @${yo.split('@')[0]} quiere casarse con @${quien.split('@')[0]}`,
        ``,
        `> @${quien.split('@')[0]} responde en *1 minuto*:`,
        `> *si* — Aceptar`,
        `> *no* — Rechazar`,
      ].join('\n'),
      contextInfo: {
        ...(global.rcanal?.contextInfo || {}),
        mentionedJid: [yo, quien],
      },
    }, { quoted: m })

    proposal.msg = enviado

    proposal.timeout = setTimeout(() => {
      if (pendingStore()[m.chat] !== proposal) return
      clearProposal(m.chat, proposal)
      conn.sendMessage(m.chat, {
        text: `💍 *Propuesta expirada*\n\n> @${quien.split('@')[0]} no respondió a tiempo.`,
        contextInfo: {
          ...(global.rcanal?.contextInfo || {}),
          mentionedJid: [yo, quien],
        },
      }, { quoted: proposal.msg || undefined }).catch(() => {})
    }, TTL_MS)

    return enviado
  } catch (e) {
    console.error('Error en marry:', e)
    return conn.sendMessage(m.chat, {
      text: `[❌] Error.\n> ${e?.message || e}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
  }
}

handler.all = async function (m, { conn, participants }) {
  try {
    if (!m.isGroup || !m.text) return
    const proposal = pendingStore()[m.chat]
    if (!proposal) return

    const partes = participants || []
    const esObjetivo = senderJidCandidates(m, conn).some(id =>
      (proposal.targetJids || [proposal.target]).some(t => isSamePlayer(id, t, conn, partes))
    )
    if (!esObjetivo) return

    const msg = m.text.toLowerCase().trim()
    const acepta = ['si', 'sí', 'yes', 'acepto', 'dale'].includes(msg)
    const rechaza = ['no', 'nel', 'rechazo', 'rechazar', 'nop'].includes(msg)
    if (!acepta && !rechaza) return

    clearProposal(m.chat, proposal)
    m.commandExecuted = true

    const yo = proposal.proposer
    const quien = m.sender 

    if (rechaza) {
      return conn.sendMessage(m.chat, {
        text: `💔 *Propuesta rechazada*\n\n> @${quien.split('@')[0]} rechazó a @${yo.split('@')[0]}.`,
        contextInfo: {
          ...(global.rcanal?.contextInfo || {}),
          mentionedJid: [yo, quien],
        },
      }, { quoted: m })
    }

    const proposerUser = ensureUser(resolveDbUser(yo, conn, partes).jid || yo)
    const targetUser = ensureUser(resolveDbUser(quien, conn, partes).jid || quien)
    if (proposerUser.partner || targetUser.partner) {
      return conn.sendMessage(m.chat, {
        text: '[❗] Uno de los dos ya está casado/a. Propuesta cancelada.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }

   
    const aKey = resolveDbUser(yo, conn, partes).jid || yo
    const bKey = resolveDbUser(quien, conn, partes).jid || quien
    syncPartner(aKey, bKey, conn, partes)

    return conn.sendMessage(m.chat, {
      text: [
        `💒 *¡Matrimonio!*`,
        ``,
        `> @${yo.split('@')[0]} y @${quien.split('@')[0]} ahora son pareja.`,
        `> Se verá en *perfil*.`,
      ].join('\n'),
      contextInfo: {
        ...(global.rcanal?.contextInfo || {}),
        mentionedJid: [yo, quien],
      },
    }, { quoted: m })
  } catch (e) {
    console.error('Error en marry.all:', e)
  }
}

handler.help = [
  '#marry @usuario / responder\n→ Propone matrimonio (1 min para si/no)',
  '#divorce\n→ Divorciarse',
]
handler.tags = ['perfiles', 'rpg']
handler.command = ['marry', 'casar', 'casarse', 'divorce', 'divorciar', 'divorcio']
handler.group = true

export default handler
