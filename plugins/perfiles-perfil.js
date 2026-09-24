import fs from 'fs'
import { join } from 'path'
import { findGroupParticipant } from '../lib/group-participant.js'
import { getRpgSnapshot, formatNumber } from '../lib/rpg-level.js'
import { ensureMsgStats, getChatMsgCount, getTotalMsgCount } from '../lib/msg-activity.js'
import { resolveDbUser } from '../lib/michi-users.js'


async function jidMencionCaption(jid, chatId, participants, conn) {
  if (!jid) return ''
  const crudo = String(jid)
  const part = findGroupParticipant(participants, crudo, conn)

  if (part?.phoneNumber) {
    const dig = String(part.phoneNumber).replace(/\D/g, '')
    if (dig.length >= 8 && dig.length <= 15) {
      return `${dig}@s.whatsapp.net`
    }
  }

  if (crudo.endsWith('@s.whatsapp.net')) {
    const dig = crudo.split('@')[0].replace(/\D/g, '')
    if (dig.length >= 8 && dig.length <= 15) return conn?.decodeJid?.(crudo) || crudo
  }

  try {
    const pn = await conn?.signalRepository?.lidMapping?.getPNForLID?.(crudo)
    if (pn && String(pn).includes('@s.whatsapp.net')) {
      return conn?.decodeJid?.(pn) || pn
    }
  } catch {}

  if (chatId?.endsWith?.('@g.us') && (crudo.endsWith('@lid') || crudo.endsWith('@hosted.lid'))) {
    try {
      const real = await String.prototype.resolveLidToRealJid.call(crudo, chatId, conn, 2, 0)
      if (real && String(real).endsWith('@s.whatsapp.net')) {
        const dig = String(real).split('@')[0].replace(/\D/g, '')
        if (dig.length >= 8 && dig.length <= 15) return conn?.decodeJid?.(real) || real
      }
    } catch {}
  }

  
  const id = part?.id || part?.jid || crudo
  return conn?.decodeJid?.(id) || id
}

let handler = async (m, { conn, usedPrefix, command, participants }) => {
  let targetUser = m.sender

  if (m.mentionedJid && m.mentionedJid.length > 0) {
    targetUser = m.mentionedJid[0]
  }

  const resolved = resolveDbUser(targetUser, conn)
  targetUser = resolved.jid || targetUser

  if (!global.db.data.users[targetUser]) {
    global.db.data.users[targetUser] = {
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

  const datosUsuario = global.db.data.users[targetUser]
  ensureMsgStats(datosUsuario)
  const rpg = getRpgSnapshot(datosUsuario)
  const msgTotal = getTotalMsgCount(datosUsuario)
  const msgGroup = m.isGroup ? getChatMsgCount(datosUsuario, m.chat, conn) : 0

  const createOwnerIds = (number) => {
    const cleanNumber = number.replace(/[^0-9]/g, '')
    return [
      cleanNumber + '@s.whatsapp.net',
      cleanNumber + '@lid'
    ]
  }

  const allOwnerIds = [
    conn.decodeJid(conn.user.id),
    ...global.owner.flatMap(([number]) => createOwnerIds(number)),
    ...(global.ownerLid || []).flatMap(([number]) => createOwnerIds(number))
  ]
  try {
    if (global.conn?.user?.id && conn.user?.jid !== global.conn.user?.jid) {
      allOwnerIds.push(conn.decodeJid(global.conn.user.id))
    }
  } catch {}
  try {
    const { getStaffOwnerIds } = await import('../lib/staff.js')
    allOwnerIds.push(...getStaffOwnerIds(conn))
  } catch {}

  const isROwner = allOwnerIds.includes(targetUser)
  const isOwner = isROwner || m.fromMe
  const isMods = isOwner || global.mods.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(targetUser)
  const _user = global.db.data?.users?.[targetUser]
  const isPrems = isROwner || global.prems.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(targetUser) || _user?.prem == true

  let isRAdmin = false
  let isAdmin = false
  let isGroupCreator = false

  let targetIsRAdmin = false
  let targetIsAdmin = false
  let targetIsGroupCreator = false

  if (m.isGroup) {
    try {
      const metadatosGrupo = conn.chats[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(_ => null)
      if (metadatosGrupo) {
        const participants = metadatosGrupo.participants || []

        const viewerData = findGroupParticipant(participants, m, conn) || {}
        isRAdmin = viewerData?.admin == 'superadmin' || false
        isAdmin = isRAdmin || viewerData?.admin == 'admin' || false
        isGroupCreator = metadatosGrupo.owner === m.sender ||
                        metadatosGrupo.subjectOwner === m.sender ||
                        viewerData?.admin === 'superadmin'

        const targetData = findGroupParticipant(participants, targetUser, conn) || {}
        targetIsRAdmin = targetData?.admin == 'superadmin' || false
        targetIsAdmin = targetIsRAdmin || targetData?.admin == 'admin' || false
        targetIsGroupCreator = metadatosGrupo.owner === targetUser ||
                               metadatosGrupo.subjectOwner === targetUser ||
                               targetData?.admin === 'superadmin'
      }
    } catch (error) {
      console.error('Error obteniendo metadata del grupo:', error)
    }
  }

  let userRole = 'miembro'
  if (isROwner || isOwner) {
    if (targetIsGroupCreator) userRole = 'creador · bot & grupo'
    else if (targetIsRAdmin || targetIsAdmin) userRole = 'creador · bot & admin'
    else userRole = 'creador del bot'
  } else if (isMods) {
    if (targetIsGroupCreator) userRole = 'mod · bot & creador'
    else if (targetIsRAdmin || targetIsAdmin) userRole = 'mod · bot & admin'
    else userRole = 'moderador'
  } else if (targetIsGroupCreator) {
    userRole = 'creador del grupo'
  } else if (targetIsRAdmin || targetIsAdmin) {
    userRole = 'admin'
  }

  let bancoInfo = 'sin banco'
  let totalCoins = datosUsuario.coins || 0
  if (datosUsuario.banco && global.bancos && global.bancos[datosUsuario.banco]) {
    bancoInfo = global.bancos[datosUsuario.banco].nombre || 'banco'
    totalCoins += (datosUsuario.bancoDinero || 0)
  }

  const groupParts = m.isGroup
    ? (participants || conn.chats[m.chat]?.metadata?.participants || [])
    : []

  let partnerMention = ''
  let lineaVinculo = 'soltero/a'
  if (datosUsuario.partner) {
    partnerMention = await jidMencionCaption(
      datosUsuario.partner,
      m.isGroup ? m.chat : null,
      groupParts,
      conn
    )
    if (partnerMention) {
      lineaVinculo = `junto a @${String(partnerMention).split('@')[0]}`
      if (String(partnerMention).endsWith('@s.whatsapp.net')) {
        datosUsuario.partner = partnerMention
      }
    } else {
      const parejaUser = resolveDbUser(datosUsuario.partner, conn, groupParts).user
      const nombre = parejaUser?.name && parejaUser.name !== 'Usuario' ? parejaUser.name : null
      lineaVinculo = nombre ? `casado/a con ${nombre}` : 'en pareja'
    }
  }

  const nombre = String(datosUsuario.name || 'sin nombre').trim() || 'sin nombre'
  const genero = datosUsuario.genre && datosUsuario.genre !== 'No establecido' ? datosUsuario.genre : '—'
  const cumple = datosUsuario.birth && datosUsuario.birth !== 'No registrado' ? datosUsuario.birth : '—'
  const desc = datosUsuario.desc && datosUsuario.desc !== 'Sin descripción' ? datosUsuario.desc : 'sin descripción aún'
  const favorito = datosUsuario.favourite && datosUsuario.favourite !== 'No establecido' ? datosUsuario.favourite : '—'
  const moneda = global.moneda || 'coins'
  const sep = '┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈'

  const texto = `
ㅤ
𓂃 ࣪ ִֶָ☾.  *${nombre}*
_${userRole}_

${sep}
*esencia*
${genero}  ·  ${cumple}
${desc}
♡  ${favorito}

${sep}
*progreso*
nivel *${rpg.level}*
${rpg.bar}
\`${rpg.ratio}\` xp

*${formatNumber(totalCoins)}* ${moneda}
banco · ${bancoInfo}

${sep}
*eco*
comandos  ·  ${formatNumber(rpg.commandCount)}
stickers  ·  ${formatNumber(rpg.stickerCount)}
mensajes  ·  ${formatNumber(msgTotal)}${m.isGroup ? `\nen este grupo  ·  ${formatNumber(msgGroup)}` : ''}

${sep}
*vínculo*
${lineaVinculo}
${datosUsuario.registered ? 'registrado' : 'sin registro'}
ㅤ`.trim()

  const botNumber = conn.user?.jid?.split('@')[0].replace(/\D/g, '')
  const configPath = join('./Serbot', botNumber, 'config.json')

  let imgBot = './storage/img/menu3.jpg'
  let hasUserPP = false

  try {
    const pp = await conn.profilePictureUrl(targetUser, 'image')
    if (pp) {
      imgBot = pp
      hasUserPP = true
    }
  } catch (error) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (config.img) imgBot = config.img
      } catch {}
    }
  }

 
  const targetMention = await jidMencionCaption(
    targetUser,
    m.isGroup ? m.chat : null,
    groupParts,
    conn
  )
  const listaMenciones = [...new Set(
    [targetMention, partnerMention].filter(j => j && String(j).includes('@'))
  )]

  if (hasUserPP) {
    await conn.sendMessage(m.chat, {
      image: { url: imgBot },
      caption: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: listaMenciones
      }
    }, { quoted: m })
  } else {
    await conn.sendMessage(m.chat, {
      image: typeof imgBot === 'string' && !imgBot.startsWith('http')
        ? fs.readFileSync(imgBot)
        : { url: imgBot },
      caption: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: listaMenciones
      }
    }, { quoted: m }).catch(async () => {
      await conn.sendFile(m.chat, imgBot, 'profile.jpg', texto, m, null, {
        ...rcanal,
        contextInfo: {
          ...(rcanal?.contextInfo || {}),
          mentionedJid: listaMenciones
        }
      }, { mentions: listaMenciones })
    })
  }
}

handler.help = ['#profile • #perfil [mención]\n→ Revisa tu perfil o el de otro usuario mencionado']
handler.tags = ['perfiles']
handler.command = ['profile', 'perfil']
export default handler
