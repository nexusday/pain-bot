import fs from 'fs'
import { join } from 'path'

let handler = async (m, { conn, usedPrefix, command }) => {
  
  let targetUser = m.sender

  
  if (m.mentionedJid && m.mentionedJid.length > 0) {
    targetUser = m.mentionedJid[0]
  }

  const data = global.db.data.users[targetUser]


  if (!data || !data.registered) {
    
    if (!global.db.data.users[targetUser]) {
      global.db.data.users[targetUser] = {
        registered: true,
        name: 'Usuario', 
        regTime: Date.now(),
        age: -1,
        level: 0,
        coins: 0,
        exp: 0,
        genre: 'No establecido',
        birth: 'No registrado',
        desc: 'Sin descripción',
        favourite: 'No establecido',
        partner: '',
        banned: false,
        prem: false
      }
      console.log(`✅ Usuario registrado automáticamente desde perfil: ${targetUser}`)
    }
  }

  const userData = global.db.data.users[targetUser]



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
      const groupMetadata = conn.chats[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(_ => null)
      if (groupMetadata) {
        const participants = groupMetadata.participants || []
      
        const viewerData = participants.find(u => conn.decodeJid(u.id) === m.sender) || {}
        isRAdmin = viewerData?.admin == 'superadmin' || false
        isAdmin = isRAdmin || viewerData?.admin == 'admin' || false
        isGroupCreator = groupMetadata.owner === m.sender ||
                        groupMetadata.subjectOwner === m.sender ||
                        viewerData?.admin === 'superadmin'

        
        const targetData = participants.find(u => conn.decodeJid(u.id) === targetUser) || {}
        targetIsRAdmin = targetData?.admin == 'superadmin' || false
        targetIsAdmin = targetIsRAdmin || targetData?.admin == 'admin' || false
        targetIsGroupCreator = groupMetadata.owner === targetUser ||
                               groupMetadata.subjectOwner === targetUser ||
                               targetData?.admin === 'superadmin'

      }
    } catch (error) {
      console.error('Error obteniendo metadata del grupo:', error)
    }
  }

  
  let userRole = 'Miembro'
  if (isROwner || isOwner) {
    if (targetIsGroupCreator) {
      userRole = '👑 Creador del Bot y Grupo'
    } else if (targetIsRAdmin || targetIsAdmin) {
      userRole = '👑 Creador del Bot y Admin'
    } else {
      userRole = '👑 Creador del Bot'
    }
  } else if (isMods) {
    if (targetIsGroupCreator) {
      userRole = 'Moderador del Bot y Creador'
    } else if (targetIsRAdmin || targetIsAdmin) {
      userRole = 'Moderador del Bot y Admin'
    } else {
      userRole = 'Moderador del Bot'
    }
  } else if (targetIsGroupCreator) {
    userRole = 'Creador del Grupo'
  } else if (targetIsRAdmin || targetIsAdmin) {
    userRole = 'Admin del Grupo'
  }

  
  let bancoInfo = 'Sin banco'
  let totalCoins = userData.coins || 0
  if (userData.banco && global.bancos && global.bancos[userData.banco]) {
    bancoInfo = global.bancos[userData.banco].nombre || 'Banco desconocido'
    totalCoins += (userData.bancoDinero || 0)
  }

  const texto = `

𓂃 ࣪ ִֶָ☾. 𝙿𝙴𝚁𝙵𝙸𝙻 𝙳𝙴 𝚄𝚂𝚄𝙰𝚁𝙸𝙾 𓂃 ࣪ ִֶָ☾.


╭─╮  𓍯  𝙸𝙽𝙵𝙾𝚁𝙼𝙰𝙲𝙸𝙾𝙽 𝙿𝙴𝚁𝚂𝙾𝙽𝙰𝙻  𓍯  
│  𓂃 ࣪ ִֶָ☾.  𝙽𝙾𝙼𝙱𝚁𝙴:  ${userData.name || 'No establecido'}
│  𓂃 ࣪ ִֶָ☾.  𝙶𝙴𝙽𝙴𝚁𝙾:  ${userData.genre || 'No establecido'}
│  𓂃 ࣪ ִֶָ☾.  𝙲𝚄𝙼𝙿𝙻𝙴𝙰𝙽𝙾𝚂:  ${userData.birth || 'No registrado'}
│  𓂃 ࣪ ִֶָ☾.  𝙳𝙴𝚂𝙲𝚁𝙸𝙿𝙲𝙸𝙾𝙽:  ${userData.desc || 'Sin descripción'}
│  𓂃 ࣪ ִֶָ☾.  𝙵𝙰𝚅𝙾𝚁𝙸𝚃𝙾:  ${userData.favourite || 'No establecido'}
╰─╯

╭─╮  𓍯  𝙴𝚂𝚃𝙰𝙳𝙸𝚂𝚃𝙸𝙲𝙰𝚂  𓍯  
│  𓂃 ࣪ ִֶָ☾.  𝙽𝙸𝚅𝙴𝙻:  ${userData.level || 0}
│  𓂃 ࣪ ִֶָ☾.  𝙲𝙾𝙸𝙽𝚂:  ${totalCoins} ${global.moneda}
│  𓂃 ࣪ ִֶָ☾.  𝙴𝚇𝙿𝙴𝚁𝙸𝙴𝙽𝙲𝙸𝙰:  ${userData.exp || 0}
│  𓂃 ࣪ ִֶָ☾.  𝙱𝙰𝙽𝙲𝙾:  ${bancoInfo}
╰─╯

╭─╮  𓍯  𝙸𝙽𝙵𝙾 𝙶𝙴𝙽𝙴𝚁𝙰𝙻  𓍯  
│  𓂃 ࣪ ִֶָ☾.  𝙸𝙳:  ${targetUser}
│  𓂃 ࣪ ִֶָ☾.  𝚁𝙾𝙻:  ${userRole}
│  𓂃 ࣪ ִֶָ☾.  𝚁𝙴𝙶𝙸𝚂𝚃𝚁𝙰𝙳𝙾:  ${userData.registered ? 'Sí' : 'No'}
╰─╯`.trim()

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
  } catch (e) {
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        if (config.img) imgBot = config.img
      } catch {}
    }
  }

  if (hasUserPP) {
    await conn.sendMessage(m.chat, {
      image: { url: imgBot },
      caption: texto,
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [userData.partner || targetUser]
      }
    }, { quoted: m })
  } else {
    await conn.sendFile(m.chat, imgBot, 'profile.jpg', texto, m, null, rcanal, { mentions: [userData.partner || targetUser] })
  }
}

handler.help = ['#profile • #perfil [mención]\n→ Revisa tu perfil o el de otro usuario mencionado']
handler.tags = ['perfiles']
handler.command = ['profile', 'perfil']
export default handler