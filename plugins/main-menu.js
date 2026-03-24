import fs from 'fs'
import { join } from 'path'

function clockString(ms) {
  let h = Math.floor(ms / 3600000)
  let m = Math.floor((ms % 3600000) / 60000)
  let s = Math.floor((ms % 60000) / 1000)
  return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':')
}

let handler = async (m, { conn, usedPrefix }) => {
  try {
    let nombreBot = global.namebot || 'PAIN BOT'
    let imgBot = 'https://files.catbox.moe/iomah1.jpg'
    let mainImg = './storage/img/menu3.jpg'
    const botActual = conn.user?.jid?.split('@')[0]?.replace(/\D/g, '')
    const tipo = botActual === '+51921487184'.replace(/\D/g, '') ? 'Principal Bot' : 'Sub Bot'
    
    
    if (tipo === 'Sub Bot') {
      const configGlobalPath = join('./Serbot', botActual, 'config.json')
      if (fs.existsSync(configGlobalPath)) {
        const globalConfig = JSON.parse(fs.readFileSync(configGlobalPath, 'utf8'))
        if (globalConfig.img) {
          mainImg = globalConfig.img
        }
        if (globalConfig.name) {
          nombreBot = globalConfig.name
        }
      }
    }
    
   
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

    const isROwner = allOwnerIds.includes(m.sender)
    const isOwner = isROwner || m.fromMe
    const isMods = isOwner || global.mods.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender)
    const _user = global.db.data?.users?.[m.sender]
    const isPrems = isROwner || global.prems.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender) || _user?.prem == true

    
    let isRAdmin = false
    let isAdmin = false
    let isGroupCreator = false
    if (m.isGroup) {
      try {
        const groupMetadata = conn.chats[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(_ => null)
        if (groupMetadata) {
          const participants = groupMetadata.participants || []
          const user = participants.find(u => conn.decodeJid(u.id) === m.sender) || {}
          isRAdmin = user?.admin == 'superadmin' || false
          isAdmin = isRAdmin || user?.admin == 'admin' || false
          
         
          isGroupCreator = groupMetadata.owner === m.sender || 
                          groupMetadata.subjectOwner === m.sender ||
                          user?.admin === 'superadmin'
        }
      } catch (error) {
        console.error('Error obteniendo metadata del grupo:', error)
      }
    }

  
    let userRole = 'Miembro'
    
    if (isROwner || isOwner) {
     
      if (isGroupCreator) {
        userRole = '👑 Creador del Bot y Grupo'
      } else if (isRAdmin || isAdmin) {
        userRole = '👑 Creador del Bot y Admin'
      } else {
        userRole = '👑 Creador del Bot'
      }
    } else if (isMods) {
      
      if (isGroupCreator) {
        userRole = 'Moderador del Bot y Creador'
      } else if (isRAdmin || isAdmin) {
        userRole = 'Moderador del Bot y Admin'
      } else {
        userRole = 'Moderador del Bot'
      }
    } else if (isGroupCreator) {
      userRole = '👑 Creador del Grupo'
    } else if (isRAdmin || isAdmin) {
      userRole = '𖢠 Admin del Grupo'
    }
    
    let botUptime = 0
    if (conn.startTime) {
      botUptime = Date.now() - conn.startTime
    }
    let botFormatUptime = clockString(botUptime)
    
   
    let totalf = Object.values(global.plugins).filter(v => v.help && v.tags).length
    
    
    const memoryUsage = process.memoryUsage()
    const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024)

    const text = `

𓂃 ࣪ ִֶָ☾. 𝙱𝙸𝙴𝙽𝚅𝙴𝙽𝙸𝙳𝙾 𓂃 ࣪ ִֶָ☾.


╭─╮  𓍯  𝙸𝙽𝙵𝙾 𝚄𝚂𝚄𝙰𝚁𝙸𝙾  𓍯  
│  𓂃 ࣪ ִֶָ☾.  𝚄𝚂𝚄𝙰𝚁𝙸𝙾:  @${m.sender.split('@')[0]}
│  𓂃 ࣪ ִֶָ☾.  𝚁𝙾𝙻:  ${userRole}
│  𓂃 ࣪ ִֶָ☾.  𝙱𝙾𝚃:  ${nombreBot}
│  𓂃 ࣪ ִֶָ☾.  𝚃𝙸𝙿𝙾:  ${tipo}
│  𓂃 ࣪ ִֶָ☾.  𝙻𝙸𝙱𝚁𝙴𝚁𝙸𝙰:  𝙱𝚊𝚒𝚕𝚎𝚢𝚜 𝙼𝙳
│  𓂃 ࣪ ִֶָ☾.  𝚃𝙸𝙴𝙼𝙿𝙾 𝙰𝙲𝚃𝙸𝚅𝙾:  ${botFormatUptime}
│  𓂃 ࣪ ִֶָ☾.  𝙿𝙻𝚄𝙶𝙸𝙽𝚂:  ${totalf}
│  𓂃 ࣪ ִֶָ☾.  𝙼𝙴𝙼𝙾𝚁𝙸𝙰:  ${memoryMB} 𝙼𝙱
╰─╯

𓂃 ࣪ ִֶָ☾. 𝙿𝚁𝙾𝙿𝙸𝙴𝚃𝙰𝚁𝙸𝙾𝚂𓂃 ࣪ ִֶָ☾.

𓂃 ࣪ ִֶָ☾.  ⊹ +51901437507 ⊹ 𝚂𝚞𝚗𝚔𝚘𝚟𝚟


𓂃 ࣪ ִֶָ☾. 𝙲𝙰𝙽𝙰𝙻𝙴𝚂 𝙾𝙵𝙸𝙲𝙸𝙰𝙻𝙴𝚂 𓂃 ࣪ ִֶָ☾.

𓂃 ࣪ ִֶָ☾.  ⟅ https://whatsapp.com/channel/0029Vb7Y87RLikgEutyMId1h ⟆


𓂃 ࣪ ִֶָ☾. 𝙲𝙾𝙼𝙰𝙽𝙳𝙾𝚂 𓂃 ࣪ ִֶָ☾.


╭─╮  𓍯  𝙾𝚆𝙽𝙴𝚁𝚂  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}verplugin <nombre.js>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}replugin <nombre.js>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}addplugin <nombre.js>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}nameplugins <archivo.js> > <nuevo.js>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}update
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}restart
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}subme <mensaje>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}join <link>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}exit
╰─╯

╭─╮  𓍯  𝙲𝙼𝙳 𝚂𝚄𝙱 𝙱𝙾𝚃  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}qr
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}code
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}bots
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}botinfo
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}reconnect
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}setbotname
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}setbotimg
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}setautoread
╰─╯

╭─╮  𓍯  𝙴𝙲𝙾𝙽𝙾𝙼𝙸𝙰 𝚁𝙿𝙶  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}balance
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}bal
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}coins
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}transf @usuario <cantidad>
╰─╯

╭─╮  𓍯  𝙿𝙴𝚁𝙵𝙸𝙻 𝚁𝙿𝙶  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}perfil
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}setbirth <fecha>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}setdesc <descripción>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}setfav <personaje>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}setgenre <hombre/mujer>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}birthdays
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}setname <nombre>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}owner
╰─╯

╭─╮  𓍯  𝚃𝙾𝙿 𝚁𝙿𝙶  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topcoins
╰─╯

╭─╮  𓍯  𝙶𝙰𝙼𝙴 𝚁𝙿𝙶  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}dado
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}daily / dda
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}adivinanza
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}pescar
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}michi @usuario
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}slot <cantidad>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}moneda <cara/sello> <cantidad>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}work
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}suerte
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}banco
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}deposit <cantidad/all>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}withdraw <cantidad/all>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}change <banco>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}unirsebank <banco>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}robar
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}sorpresa
╰─╯

╭─╮  𓍯  𝙱𝚄𝚂𝚀𝚄𝙴𝙳𝙰𝚂  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}google <búsqueda>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}yt <búsqueda>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}tiktok <búsqueda>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}tiktok2 <búsqueda>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}onlyfans <username>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}imagen <busqueda>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}pinterest <busqueda>
╰─╯

╭─╮  𓍯  𝙾𝚂𝙸𝙽𝚃 - 𝙱𝙴𝚃𝙰  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}ip <dirección IP>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}ip2 <dirección IP>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}sher <nombre/apodo>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}webinfo <URL>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}tik <@usuario>
╰─╯

╭─╮  𓍯  𝙸𝙽𝚃𝙴𝙻𝙸𝙶𝙴𝙽𝙲𝙸𝙰 𝙰.𝙸  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}gemini <texto>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}deepseek <texto>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}llama <texto>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}exaone <texto>
╰─╯

╭─╮  𓍯  𝙳𝙴𝚂𝙲𝙰𝚁𝙶𝙰𝚂  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}play <búsqueda/url>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}play2 <búsqueda>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}aptoide <app>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}git <url>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}tiktok2 <link>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}fb <link>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}ig <link>
╰─╯

╭─╮  𓍯  𝙰𝙳𝙸𝙲𝙸𝙾𝙽𝙰𝙻𝙴𝚂  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}nota <contenido>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}delnota <numero>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}vernotas
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}id
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}infogrupo
╰─╯

╭─╮  𓍯  𝚂𝚃𝙸𝙲𝙺𝙴𝚁𝚂  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}sticker
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}toimg
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}setmeta <autor> | <pack>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}delmeta
╰─╯

╭─╮  𓍯  𝙰𝙳𝙼𝙸𝙽𝚂  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}ban @usuario
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}promote @usuario
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}demote @usuario
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}warn @usuario <motivo>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}delwarn @usuario
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}warnings @usuario
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}tag
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}temp <mensaje> <tiempo>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}open
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}close
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}delete
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}namegp <nombre>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}desgp <descripción>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}photogp
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}adg <numero>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}grupo on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}antilink on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}antiimg on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}antiaudio on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}antivideo on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}antisticker on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}antispam on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}anticontact on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}antimention on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}antidocument on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}anticaracter on/off <limite>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}soloadmin on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}welcome on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}savep
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}publicg on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}publicg time <tiempo>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}modoia on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}modohot on/off
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}modoilegal on/off
╰─╯

╭─╮  𓍯  𝙳𝙸𝚅𝙴𝚁𝚂𝙸𝙾𝙽  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topgays
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topfeos
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}toplindos
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topburros
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topmachos
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topparejas
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}toppajeros
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topmancos
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topinfieles
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topfieles
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}topotakus
╰─╯

╭─╮  𓍯  𝙽𝚂𝙵𝚆  𓍯  
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}waifu
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}waifu2
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}neko
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}xnxx <url>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}xnxx <búsqueda>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}hentai <url>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}hentai <búsqueda>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}xvideos <url>
│  𓂃 ࣪ ִֶָ☾.  ${usedPrefix}xvideos <búsqueda>
╰─╯



> 𝙿𝙰𝙸𝙽 𝙲𝙾𝙼𝙼𝚄𝙽𝙸𝚃𝚈`.trim()

    
//    const externalAdReply = {
//      title: `✦ ${nombreBot} | WhatsApp Bot\n`,
//      body: `𝗖𝗼𝗺𝗮𝗻𝗱𝗼𝘀 𝗱𝗲 ${nombreBot} By @Sunkovv`,
//      thumbnailUrl: imgBot,
//      mediaType: 1,
//      showAdAttribution: true,
//      renderLargerThumbnail: true
//    }

    await conn.sendFile(m.chat, mainImg, 'thumbnail.jpg', text, m, null, { 
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender],
//        externalAdReply: externalAdReply
      }
    })

  } catch (e) {
    console.error('Error en menú:', e)
    conn.sendMessage(m.chat, {
      text: 'Hubo un error al mostrar el menú.',
      contextInfo: {
        ...rcanal.contextInfo
      }
    }, { quoted: m })
    throw e
  }
}

handler.command = ['menu', 'help', 'menú']
export default handler