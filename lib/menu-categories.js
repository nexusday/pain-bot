import fs from 'fs'
import { join } from 'path'
import os from 'os'
import { getMenuRentalLine } from './alquiler.js'
import { formatBotUptime } from './bot-uptime.js'
import { findGroupParticipant } from './group-participant.js'
import { isMainBotConn, cleanBotNum } from '../plugins/modo-sub.js'

export const MENU_ROW_PREFIX = 'painmenu_'
export const MENU_BUTTON_TEXT = '𓍯 𝚅𝙴𝚁 𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰𝚂 𓍯'

const cmd = (p, name) => `> 𓂃 ࣪ ִֶָ☾.  ${p}${name}`
const sectionHeader = (name) => `   𓍯  ${name}  𓍯`
const pickerRow = (name) => `𓍯 ${name} 𓍯`
const pickerGroup = (name) => `𓂃 ࣪ ִֶָ☾. ${name}`
const pickerHint = (text) => `⊹ ${text} ⊹`

function sectionOwners(p) {
  return `${sectionHeader('𝙾𝚆𝙽𝙴𝚁𝚂')}
${cmd(p, 'verplugin <nombre.js>')}
${cmd(p, 'replugin <nombre.js>')}
${cmd(p, 'addplugin <nombre.js>')}
${cmd(p, 'nameplugins <archivo.js> > <nuevo.js>')}
${cmd(p, 'update')}
${cmd(p, 'restart')}
${cmd(p, 'setvist on/off')}
${cmd(p, 'subme <mensaje>')}
${cmd(p, 'join <link>')}
${cmd(p, 'exit')}
${cmd(p, 'one 1h')}
${cmd(p, 'one infinito')}
${cmd(p, 'one oficial')}`.trim()
}

function sectionAdmins(p) {
  return `${sectionHeader('𝙰𝙳𝙼𝙸𝙽𝚂')}
${cmd(p, 'ban @usuario')}
${cmd(p, 'promote @usuario')}
${cmd(p, 'demote @usuario')}
${cmd(p, 'warn @usuario <motivo>')}
${cmd(p, 'delwarn @usuario')}
${cmd(p, 'warnings @usuario')}
${cmd(p, 'tag')}
${cmd(p, 'temp <mensaje> <tiempo>')}
${cmd(p, 'open')}
${cmd(p, 'close')}
${cmd(p, 'delete')}
${cmd(p, 'fijar')}
${cmd(p, 'desfijar')}
${cmd(p, 'namegp <nombre>')}
${cmd(p, 'desgp <descripción>')}
${cmd(p, 'photogp')}
${cmd(p, 'adg <numero>')}
${cmd(p, 'grupo on/off')}
${cmd(p, 'modosub')}
${cmd(p, 'modosub <n>')}
${cmd(p, 'modosub all')}
${cmd(p, 'antilink on/off')}
${cmd(p, 'antiimg on/off')}
${cmd(p, 'antiaudio on/off')}
${cmd(p, 'antivideo on/off')}
${cmd(p, 'antisticker on/off')}
${cmd(p, 'antispam on/off')}
${cmd(p, 'anticontact on/off')}
${cmd(p, 'antimention on/off')}
${cmd(p, 'antidocument on/off')}
${cmd(p, 'antipalabra on/off')}
${cmd(p, 'antipalabra add <palabra>')}
${cmd(p, 'antipalabra <palabra>')}
${cmd(p, 'antipalabra action delete|kick')}
${cmd(p, 'anticaracter on/off <limite>')}
${cmd(p, 'antiprefijo on/off')}
${cmd(p, 'mute @usuario')}
${cmd(p, 'delmute @usuario')}
${cmd(p, 'soloadmin on/off')}
${cmd(p, 'welcome on/off')}
${cmd(p, 'modoia on/off')}
${cmd(p, 'modohot on/off')}
${cmd(p, 'modoilegal on/off')}
${cmd(p, 'modohuman on/off')}
${cmd(p, 'modosad on/off')}
${cmd(p, 'modospico on/off')}
${cmd(p, 'mododescargas on/off')}
${cmd(p, 'cmd18 on/off')}`.trim()
}

function sectionSubBot(p) {
  return `${sectionHeader('𝙲𝙼𝙳 𝚂𝚄𝙱 𝙱𝙾𝚃')}
${cmd(p, 'qr')}
${cmd(p, 'code')}
${cmd(p, 'bots')}
${cmd(p, 'botinfo')}
${cmd(p, 'reconnect')}
${cmd(p, 'setbotname')}
${cmd(p, 'setbotimg')}
${cmd(p, 'setautoread')}`.trim()
}

function sectionEconomia(p) {
  return `${sectionHeader('𝙴𝙲𝙾𝙽𝙾𝙼𝙸𝙰 𝚁𝙿𝙶')}
${cmd(p, 'balance')}
${cmd(p, 'bal')}
${cmd(p, 'coins')}
${cmd(p, 'transf @usuario <cantidad>')}`.trim()
}

function sectionPerfil(p) {
  return `${sectionHeader('𝙿𝙴𝚁𝙵𝙸𝙻 𝚁𝙿𝙶')}
${cmd(p, 'perfil')}
${cmd(p, 'setbirth <fecha>')}
${cmd(p, 'setdesc <descripción>')}
${cmd(p, 'setfav <personaje>')}
${cmd(p, 'setgenre <hombre/mujer>')}
${cmd(p, 'birthdays')}
${cmd(p, 'setname <nombre>')}
${cmd(p, 'owner')}`.trim()
}

function sectionTop(p) {
  return `${sectionHeader('𝚃𝙾𝙿 𝚁𝙿𝙶')}
${cmd(p, 'topcoins')}`.trim()
}

function sectionJuegos(p) {
  return `${sectionHeader('𝙶𝙰𝙼𝙴 𝚁𝙿𝙶')}
${cmd(p, 'dado')}
${cmd(p, 'daily / dda')}
${cmd(p, 'adivinanza')}
${cmd(p, 'pescar')}
${cmd(p, 'michi @usuario')}
${cmd(p, 'miner @usuario')}
${cmd(p, 'bomba @usuario [apuesta]')}
${cmd(p, 'bomba [apuesta] @usuario')}
${cmd(p, 'slot <cantidad>')}
${cmd(p, 'ruleta <rojo/negro/par/impar/0-36> <cantidad USD>')}
${cmd(p, 'moneda <cara/sello> <cantidad>')}
${cmd(p, 'work')}
${cmd(p, 'suerte')}
${cmd(p, 'banco')}
${cmd(p, 'deposit <cantidad/all>')}
${cmd(p, 'withdraw <cantidad/all>')}
${cmd(p, 'change <banco>')}
${cmd(p, 'unirsebank <banco>')}
${cmd(p, 'robar')}
${cmd(p, 'sorpresa')}`.trim()
}

function sectionBusquedas(p) {
  return `${sectionHeader('𝙱𝚄𝚂𝚀𝚄𝙴𝙳𝙰𝚂')}
${cmd(p, 'google <búsqueda>')}
${cmd(p, 'yt <búsqueda>')}
${cmd(p, 'tiktok <búsqueda/link>')}
${cmd(p, 'tiktok2 <búsqueda/link>')}
${cmd(p, 'scsearch <búsqueda>')}
${cmd(p, 'ly <canción>')}
${cmd(p, 'onlyfans <username>')}
${cmd(p, 'imagen <busqueda>')}
${cmd(p, 'wall <busqueda>')}
${cmd(p, 'pinterest <busqueda>')}
${cmd(p, 'bsticker <busqueda>')}`.trim()
}

function sectionOsint(p) {
  return `${sectionHeader('𝙾𝚂𝙸𝙽𝚃 - 𝙱𝙴𝚃𝙰')}
${cmd(p, 'ip <dirección IP>')}
${cmd(p, 'ip2 <dirección IP>')}
${cmd(p, 'sher <nombre/apodo>')}
${cmd(p, 'webinfo <URL>')}
${cmd(p, 'tik <@usuario>')}`.trim()
}

function sectionIA(p) {
  return `${sectionHeader('𝙸𝙽𝚃𝙴𝙻𝙸𝙶𝙴𝙽𝙲𝙸𝙰 𝙰.𝙸')}
${cmd(p, 'gemini <texto>')}
${cmd(p, 'chatgpt <texto>')}
${cmd(p, 'kora <texto>')}
${cmd(p, 'replia <texto>')}
${cmd(p, 'copilot <texto>')}
${cmd(p, 'animg <texto>')}`.trim()
}

function sectionDescargas(p) {
  return `${sectionHeader('𝙳𝙴𝚂𝙲𝙰𝚁𝙶𝙰𝚂')}
${cmd(p, 'play <búsqueda/url>')}
${cmd(p, 'sc <búsqueda/url/número>')}
${cmd(p, 'play2 <búsqueda>')}
${cmd(p, 'aptoide <app>')}
${cmd(p, 'git <url>')}
${cmd(p, 'tiktok2 <link>')}
${cmd(p, 'fb <link>')}
${cmd(p, 'ig <link>')}
${cmd(p, 'igs <búsqueda>')}
${cmd(p, 'ytvideo <link>')}`.trim()
}

function sectionReacciones(p) {
  return `${sectionHeader('𝚁𝙴𝙰𝙲𝙲𝙸𝙾𝙽𝙴𝚂')}
${cmd(p, 'reir')}
${cmd(p, 'happy')}
${cmd(p, 'sad')}
${cmd(p, 'angry')}
${cmd(p, 'dance')}
${cmd(p, 'slap @usuario')}
${cmd(p, 'kiss @usuario')}
${cmd(p, 'hug @usuario')}`.trim()
}

function sectionAdicionales(p) {
  return `${sectionHeader('𝙰𝙳𝙸𝙲𝙸𝙾𝙽𝙰𝙻𝙴𝚂')}
${cmd(p, 'nota <contenido>')}
${cmd(p, 'delnota <numero>')}
${cmd(p, 'vernotas')}
${cmd(p, 'id')}
${cmd(p, 'infogrupo')}
${cmd(p, 'traducir')}
${cmd(p, 'speed <audio>')}
${cmd(p, 'slow <audio>')}
${cmd(p, 'sss <imagen/video ver una vez>')}
${cmd(p, 'text <imagen/sticker>')}
${cmd(p, 'pdf <imagen/sticker> nombre')}
${cmd(p, 'tepdf <responder texto/img> nombre')}
${cmd(p, 'resize <imagen/sticker> 800x600')}
${cmd(p, 'ge o gr <texto/enlace/imagen>')}
${cmd(p, 'leerqr <imagen con QR>')}
${cmd(p, 'hd <imagen/sticker>')}
${cmd(p, 'ssimg <foto> título|artista')}
${cmd(p, 'sfimg <foto> texto')}
${cmd(p, 'imgay <foto> texto')}
${cmd(p, 'tts <texto>')}
${cmd(p, 'stt <nota de voz/audio>')}
${cmd(p, 'cat <texto>')}`.trim()
}

function sectionStickers(p) {
  return `${sectionHeader('𝚂𝚃𝙸𝙲𝙺𝙴𝚁𝚂')}
${cmd(p, 'sticker')}
${cmd(p, 'st <texto>')}
${cmd(p, 'sp <texto>')}
${cmd(p, 'sgay <foto> texto')}
${cmd(p, 'sw <responder/@user> texto')}
${cmd(p, 'toimg')}
${cmd(p, 'delmeta nombre|autor')}
${cmd(p, 'setmeta pack | autor')}
${cmd(p, 'delstickermeta')}`.trim()
}

function sectionDiversion(p) {
  return `${sectionHeader('𝙳𝙸𝚅𝙴𝚁𝚂𝙾𝙽')}
${cmd(p, 'top <nombre>|emoji')}
${cmd(p, 'topgays')}
${cmd(p, 'topfeos')}
${cmd(p, 'toplindos')}
${cmd(p, 'topburros')}
${cmd(p, 'topmachos')}
${cmd(p, 'topparejas')}
${cmd(p, 'toppajeros')}
${cmd(p, 'topmancos')}
${cmd(p, 'topinfieles')}
${cmd(p, 'topfieles')}
${cmd(p, 'topotakus')}
${cmd(p, 'topfemboys')}
${cmd(p, 'toptrans')}
${cmd(p, 'topfracasados')}
${cmd(p, 'topingenieros')}
${cmd(p, 'meme')}`.trim()
}

function sectionNsfw(p) {
  return `${sectionHeader('𝙽𝚂𝙵𝚆')}
${cmd(p, 'cmd18 on/off')}
${cmd(p, 'waifu')}
${cmd(p, 'waifu2')}
${cmd(p, 'neko')}
${cmd(p, 'corean')}
${cmd(p, 'tik18')}
${cmd(p, 'tetas')}
${cmd(p, 'girls')}
${cmd(p, 'xnxx <url>')}
${cmd(p, 'xnxx <búsqueda>')}
${cmd(p, 'hentai <url>')}
${cmd(p, 'hentai <búsqueda>')}
${cmd(p, 'xvideos <url>')}
${cmd(p, 'xvideos <búsqueda>')}`.trim()
}

const CATEGORY_GROUPS = [
  { title: pickerGroup('𝚂𝚃𝙰𝙵𝙵'), ids: ['owners', 'admins'] },
  { title: pickerGroup('𝚁𝙿𝙶'), ids: ['economia', 'perfil', 'top', 'juegos'] },
  { title: pickerGroup('𝚄𝚃𝙸𝙻𝙸𝙳𝙰𝙳𝙴𝚂'), ids: ['busquedas', 'osint', 'ia', 'descargas'] },
  { title: pickerGroup('𝙼𝙴𝙳𝙸𝙰'), ids: ['reacciones', 'stickers', 'adicionales'] },
  { title: pickerGroup('𝙴𝚇𝚃𝚁𝙰𝚂'), ids: ['subbot', 'diversion', 'nsfw'] },
]

const CATEGORY_DEFS = [
  { id: 'owners', label: '𝙾𝚆𝙽𝙴𝚁𝚂', hint: 'gestión del bot', roles: ['owner'], body: sectionOwners },
  { id: 'admins', label: '𝙰𝙳𝙼𝙸𝙽𝚂', hint: 'moderación grupal', roles: ['owner', 'admin'], body: sectionAdmins },
  { id: 'subbot', label: '𝚂𝚄𝙱 𝙱𝙾𝚃', hint: 'qr · bots · config', roles: ['all'], body: sectionSubBot },
  { id: 'economia', label: '𝙴𝙲𝙾𝙽𝙾𝙼𝙸𝙰', hint: 'balance · monedas', roles: ['all'], body: sectionEconomia },
  { id: 'perfil', label: '𝙿𝙴𝚁𝙵𝙸𝙻', hint: 'tu perfil rpg', roles: ['all'], body: sectionPerfil },
  { id: 'top', label: '𝚃𝙾𝙿', hint: 'rankings', roles: ['all'], body: sectionTop },
  { id: 'juegos', label: '𝙶𝙰𝙼𝙴 𝚁𝙿𝙶', hint: 'casino · banco', roles: ['all'], body: sectionJuegos },
  { id: 'busquedas', label: '𝙱𝚄𝚂𝚀𝚄𝙴𝙳𝙰𝚂', hint: 'google · yt · tiktok', roles: ['all'], body: sectionBusquedas },
  { id: 'osint', label: '𝙾𝚂𝙸𝙽𝚃', hint: 'ip · sherlock', roles: ['all'], body: sectionOsint },
  { id: 'ia', label: '𝙸𝙰', hint: 'gemini · chatgpt', roles: ['all'], body: sectionIA },
  { id: 'descargas', label: '𝙳𝙴𝚂𝙲𝙰𝚁𝙶𝙰𝚂', hint: 'play · ig · fb', roles: ['all'], body: sectionDescargas },
  { id: 'reacciones', label: '𝚁𝙴𝙰𝙲𝙲𝙸𝙾𝙽𝙴𝚂', hint: 'gifs · acciones', roles: ['all'], body: sectionReacciones },
  { id: 'adicionales', label: '𝙰𝙳𝙸𝙲𝙸𝙾𝙽𝙰𝙻𝙴𝚂', hint: 'notas · tts · pdf', roles: ['all'], body: sectionAdicionales },
  { id: 'stickers', label: '𝚂𝚃𝙸𝙲𝙺𝙴𝚁𝚂', hint: 'crear · editar', roles: ['all'], body: sectionStickers },
  { id: 'diversion', label: '𝙳𝙸𝚅𝙴𝚁𝚂𝙸𝙾𝙽', hint: 'tops · memes', roles: ['all'], body: sectionDiversion },
  { id: 'nsfw', label: '𝙽𝚂𝙵𝚆', hint: '+18 · cmd18', roles: ['all'], body: sectionNsfw },
]

export function getMenuCategoryId(rowId) {
  if (!rowId || !String(rowId).startsWith(MENU_ROW_PREFIX)) return null
  return String(rowId).slice(MENU_ROW_PREFIX.length)
}

export function extractMenuListRowId(m) {
  return (
    m?.msg?.singleSelectReply?.selectedRowId ||
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    (m?.mtype === 'listResponseMessage' && m?.msg?.singleSelectReply?.selectedRowId) ||
    ''
  )
}

export function extractMenuSelectionId(m) {
  const listRow = extractMenuListRowId(m)
  if (listRow) return listRow

  const nativeFlow =
    m?.msg?.nativeFlowResponseMessage ||
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage
  if (nativeFlow?.paramsJson) {
    const id = parsePainMenuIdFromJson(nativeFlow.paramsJson)
    if (id) return id
  }

  const btnId =
    m?.msg?.selectedButtonId ||
    m?.message?.buttonsResponseMessage?.selectedButtonId
  if (btnId) return btnId

  const deepId = deepFindPainMenuId(m?.message || m)
  if (deepId) return deepId

  return ''
}

function parsePainMenuIdFromJson(raw) {
  if (!raw) return ''
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    const candidates = [
      parsed?.id,
      parsed?.main_arg,
      parsed?.selected_id,
      parsed?.selectedRowId,
      parsed?.rowId,
    ]
    for (const value of candidates) {
      if (value && String(value).startsWith(MENU_ROW_PREFIX)) {
        return String(value)
      }
    }
  } catch {}
  return ''
}

function deepFindPainMenuId(value, depth = 0) {
  if (!value || depth > 10) return ''
  if (typeof value === 'string') {
    if (value.startsWith(MENU_ROW_PREFIX)) return value
    const fromJson = parsePainMenuIdFromJson(value)
    if (fromJson) return fromJson
    return ''
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindPainMenuId(item, depth + 1)
      if (found) return found
    }
    return ''
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const found = deepFindPainMenuId(value[key], depth + 1)
      if (found) return found
    }
  }
  return ''
}

function createOwnerIds(number) {
  const cleanNumber = String(number).replace(/[^0-9]/g, '')
  return [cleanNumber + '@s.whatsapp.net', cleanNumber + '@lid']
}

/** Convierte global.prefix (RegExp) a texto visible: ".", "/" etc. */
export function formatDisplayPrefix(prefix, fallback = '.') {
  if (!prefix) return fallback
  if (typeof prefix === 'string') return prefix
  if (Array.isArray(prefix)) {
    for (const item of prefix) {
      const formatted = formatDisplayPrefix(item, '')
      if (formatted) return formatted
    }
    return fallback
  }
  if (prefix instanceof RegExp) {
    const match = prefix.source.match(/^\^\[((?:\\.|[^\]\\])+)\]/)
    if (match) {
      const chars = match[1].replace(/\\(.)/g, '$1').split('')
      if (chars.includes('.')) return '.'
      if (chars.includes('/')) return '/'
      return chars[0] || fallback
    }
    return fallback
  }
  return fallback
}

export async function resolveMenuContext(m, conn, usedPrefix) {
  usedPrefix = formatDisplayPrefix(
    usedPrefix || conn?.prefix || global.prefix,
    '.',
  )

  let nombreBot = global.namebot || 'PAIN BOT'
  let mainImg = './storage/img/menu3.jpg'
  const botActual = cleanBotNum(conn.user?.jid || conn.user?.id)
  const isMain = isMainBotConn(conn)
  const tipo = isMain ? 'Principal Bot' : 'Sub Bot'

  if (!isMain && botActual) {
    const configGlobalPath = join('./Serbot', botActual, 'config.json')
    if (fs.existsSync(configGlobalPath)) {
      const globalConfig = JSON.parse(fs.readFileSync(configGlobalPath, 'utf8'))
      if (globalConfig.img) mainImg = globalConfig.img
      if (globalConfig.name) nombreBot = globalConfig.name
    }
  }

  const allOwnerIds = [
    conn.decodeJid(conn.user.id),
    ...global.owner.flatMap(([number]) => createOwnerIds(number)),
    ...(global.ownerLid || []).flatMap(([number]) => createOwnerIds(number)),
  ]

  const isROwner = allOwnerIds.includes(m.sender)
  const isOwner = isROwner || m.fromMe
  const isMods = isOwner || global.mods.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender)

  let isRAdmin = false
  let isAdmin = false
  let isGroupCreator = false
  if (m.isGroup) {
    try {
      const groupMetadata = conn.chats[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(_ => null)
      if (groupMetadata) {
        const participants = groupMetadata.participants || []
        const user = findGroupParticipant(participants, m, conn) || {}
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
    if (isGroupCreator) userRole = '👑 Staff Bot y Grupo'
    else if (isRAdmin || isAdmin) userRole = '👑 Staff Bot y Admin'
    else userRole = '👑 Staff Bot'
  } else if (isMods) {
    if (isGroupCreator) userRole = 'Moderador del Bot y Creador'
    else if (isRAdmin || isAdmin) userRole = 'Moderador del Bot y Admin'
    else userRole = 'Moderador del Bot'
  } else if (isGroupCreator) {
    userRole = '👑 Creador del Grupo'
  } else if (isRAdmin || isAdmin) {
    userRole = '𖢠 Admin del Grupo'
  }

  const botFormatUptime = formatBotUptime(conn)
  const totalf = Object.values(global.plugins).filter(v => v.help && v.tags).length
  const totalRamMB = Math.round(os.totalmem() / 1024 / 1024)
  const processRamMB = Math.round(process.memoryUsage().rss / 1024 / 1024)
  const rentalLine = m.isGroup
    ? `> 𓂃 ࣪ ִֶָ☾.  𝙰𝙻𝚀𝚄𝙸𝙻𝙴𝚁:  ${getMenuRentalLine(m.chat)}\n`
    : ''

  return {
    usedPrefix,
    nombreBot,
    mainImg,
    tipo,
    userRole,
    botFormatUptime,
    totalf,
    totalRamMB,
    processRamMB,
    rentalLine,
    isOwner,
    isAdmin,
  }
}

function canSeeCategory(cat, ctx) {
  if (cat.roles.includes('all')) return true
  if (cat.roles.includes('owner') && ctx.isOwner) return true
  if (cat.roles.includes('admin') && (ctx.isOwner || ctx.isAdmin)) return true
  return false
}

function toPickerRow(cat, usedPrefix) {
  return {
    id: cat.id,
    title: pickerRow(cat.label),
    description: pickerHint(cat.hint),
    rowId: `${MENU_ROW_PREFIX}${cat.id}`,
    body: cat.body(usedPrefix),
  }
}

export function buildMenuCategories(ctx) {
  return CATEGORY_DEFS
    .filter(cat => canSeeCategory(cat, ctx))
    .map(cat => ({
      ...toPickerRow(cat, ctx.usedPrefix),
      img: ctx.mainImg,
    }))
}

function buildGroupedSections(categories, mapRow) {
  const byId = Object.fromEntries(categories.map(cat => [cat.id, cat]))
  const used = new Set()
  const sections = []

  for (const group of CATEGORY_GROUPS) {
    const rows = group.ids
      .map(id => byId[id])
      .filter(Boolean)
      .map(cat => {
        used.add(cat.id)
        return mapRow(cat)
      })
    if (rows.length) sections.push({ title: group.title, rows })
  }

  const remaining = categories.filter(cat => !used.has(cat.id))
  if (remaining.length) {
    sections.push({
      title: pickerGroup('𝙾𝚃𝚁𝙾𝚂'),
      rows: remaining.map(mapRow),
    })
  }

  return sections
}

export function buildCategoryResponse(category, ctx, { interactive = false } = {}) {
  if (interactive) return category.body
  return `${category.body}

> 𓂃 ࣪ ִֶָ☾.  Escribe ${ctx.usedPrefix}menu para volver.`.trim()
}

function buildNativeFlowFields(ctx, categories) {
  return {
    footer: ctx.nombreBot,
    optionText: MENU_BUTTON_TEXT,
    optionTitle: pickerGroup('𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰𝚂'),
    nativeFlow: [{
      text: MENU_BUTTON_TEXT,
      sections: buildInteractiveSections(categories),
      icon: 'default',
    }],
  }
}

function buildInteractiveContextInfo(sender) {
  return {
    ...(global.rcanal?.contextInfo || {}),
    ...(sender ? { mentionedJid: [sender] } : {}),
  }
}

export function buildMenuHeader(m, ctx) {
  return `
𓂃 ࣪ ִֶָ☾. 𝙱𝙸𝙴𝙽𝚅𝙴𝙽𝙸𝙳𝙾 𓂃 ࣪ ִֶָ☾.

   𓍯  𝙸𝙽𝙵𝙾 𝚄𝚂𝚄𝙰𝚁𝙸𝙾  𓍯  
${ctx.rentalLine}> 𓂃 ࣪ ִֶָ☾.  𝚄𝚂𝚄𝙰𝚁𝙸𝙾:  @${m.sender.split('@')[0]}
> 𓂃 ࣪ ִֶָ☾.  𝚁𝙾𝙻:  ${ctx.userRole}
> 𓂃 ࣪ ִֶָ☾.  𝙱𝙾𝚃:  ${ctx.nombreBot}
> 𓂃 ࣪ ִֶָ☾.  𝚃𝙸𝙿𝙾:  ${ctx.tipo}
> 𓂃 ࣪ ִֶָ☾.  𝚃𝙸𝙴𝙼𝙿𝙾 𝙰𝙲𝚃𝙸𝚅𝙾:  ${ctx.botFormatUptime}
> 𓂃 ࣪ ִֶָ☾.  𝙲𝙾𝙼𝙰𝙽𝙳𝙾𝚂:  ${ctx.totalf}
> 𓂃 ࣪ ִֶָ☾.  𝙼𝙴𝙼𝙾𝚁𝙸𝙰: ${ctx.processRamMB}/${ctx.totalRamMB} MB

 𓂃 ࣪ ִֶָ☾. 𝙿𝚁𝙾𝙿𝙸𝙴𝚃𝙰𝚁𝙸𝙾𝚂𓂃 ࣪ ִֶָ☾.
> 𓂃 ࣪ ִֶָ☾.  ⊹ wa.me/@Sunkovv ⊹ *Sunkovv*
> 𓂃 ࣪ ִֶָ☾.  ⊹ wa.me/@14x.zafiro ⊹ *Zafiro(Mod)*

 𓂃 ࣪ ִֶָ☾. 𝙷𝙾𝚂𝚃𝙸𝙽𝙶 𝙾𝙵𝙸𝙲𝙸𝙰𝙻 𓂃 ࣪ ִֶָ☾.
> 𓂃 ࣪ ִֶָ☾.  ⟅ https://nexcodea.com ⟆

 𓂃 ࣪ ִֶָ☾. 𝙲𝙰𝙽𝙰𝙻𝙴𝚂 𝙾𝙵𝙸𝙲𝙸𝙰𝙻𝙴𝚂 𓂃 ࣪ ִֶָ☾.
> 𓂃 ࣪ ִֶָ☾.  ⟅ https://whatsapp.com/channel/0029Vb7Y87RLikgEutyMId1h ⟆

𓂃 ࣪ ִֶָ☾. *𝙴𝙻𝙸𝙶𝙴 𝚄𝙽𝙰 𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰* 𓂃 ࣪ ִֶָ☾.`.trim()
}

export function buildListSections(categories) {
  return buildGroupedSections(categories, cat => ({
    title: cat.title,
    description: cat.description,
    rowId: cat.rowId,
  }))
}

/** Secciones para botón native flow (funciona en grupos y privado) */
export function buildInteractiveSections(categories) {
  return buildGroupedSections(categories, cat => ({
    header: '',
    title: cat.title,
    description: cat.description,
    id: cat.rowId,
  }))
}

/** Menú completo en un solo mensaje: imagen + info + botón de categorías */
export function buildInteractiveMenuContent(ctx, categories, header, media = {}, sender) {
  return {
    ...media,
    caption: header,
    ...buildNativeFlowFields(ctx, categories),
    contextInfo: buildInteractiveContextInfo(sender),
  }
}

/** Categoría elegida: imagen + comandos + botón ver categorías */
export function buildCategoryInteractiveContent(ctx, categories, caption, media = {}, sender) {
  return {
    ...media,
    caption,
    ...buildNativeFlowFields(ctx, categories),
    contextInfo: buildInteractiveContextInfo(sender),
  }
}

/** Solo selector (fallback si falla imagen+interactivo) */
export function buildNativeFlowPickerContent(ctx, categories) {
  return {
    text: '𓂃 ࣪ ִֶָ☾. 𝙴𝙻𝙸𝙶𝙴 𝚄𝙽𝙰 𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰 𝚙𝚊𝚛𝚊 𝚟𝚎𝚛 𝚜𝚞𝚜 𝚌𝚘𝚖𝚊𝚗𝚍𝚘𝚜.',
    footer: ctx.nombreBot,
    optionText: MENU_BUTTON_TEXT,
    optionTitle: pickerGroup('𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰𝚂'),
    nativeFlow: [{
      text: MENU_BUTTON_TEXT,
      sections: buildInteractiveSections(categories),
      icon: 'default',
    }],
  }
}

export function findMenuCategory(categories, categoryId) {
  return categories.find(cat => cat.id === categoryId) || null
}

const CATEGORY_MATCH_KEYS = {
  owners: ['OWNERS', '𝙾𝚆𝙽𝙴𝚁𝚂'],
  admins: ['ADMINS', '𝙰𝙳𝙼𝙸𝙽𝚂'],
  subbot: ['SUB BOT', '𝚂𝚄𝙱 𝙱𝙾𝚃'],
  economia: ['ECONOM', '𝙴𝙲𝙾𝙽𝙾𝙼'],
  perfil: ['PERFIL', '𝙿𝙴𝚁𝙵𝙸𝙻'],
  top: ['TOP RPG', '𝚃𝙾𝙿 𝚁𝙿𝙶'],
  juegos: ['GAME', '𝙶𝙰𝙼𝙴'],
  busquedas: ['BUSQUEDA', '𝙱𝚄𝚂𝚀'],
  osint: ['OSINT', '𝙾𝚂𝙸𝙽𝚃'],
  ia: ['INTELIGENCIA', '𝙸𝙽𝚃𝙴𝙻𝙸𝙶𝙴𝙽𝙲𝙸𝙰'],
  descargas: ['DESCARGA', '𝙳𝙴𝚂𝙲𝙰𝚁𝙶'],
  reacciones: ['REACCION', '𝚁𝙴𝙰𝙲𝙲𝙸𝙾𝙽'],
  adicionales: ['ADICIONAL', '𝙰𝙳𝙸𝙲𝙸𝙾𝙽𝙰𝙻'],
  stickers: ['STICKER', '𝚂𝚃𝙸𝙲𝙺𝙴𝚁'],
  diversion: ['DIVERSION', '𝙳𝙸𝚅𝙴𝚁𝚂𝙸𝙾𝙽'],
  nsfw: ['NSFW', '𝙽𝚂𝙵𝚆'],
}

export function findMenuCategoryFromMessage(m, categories) {
  const rowId = extractMenuSelectionId(m)
  const byId = findMenuCategory(categories, getMenuCategoryId(rowId))
  if (byId) return byId

  const label = [
    m?.msg?.title,
    m?.msg?.description,
    m?.msg?.singleSelectReply?.selectedRowId,
    m?.message?.listResponseMessage?.title,
    m?.message?.listResponseMessage?.description,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.text,
  ].filter(Boolean).join(' ')

  if (!label) return null

  for (const cat of categories) {
    const keys = CATEGORY_MATCH_KEYS[cat.id] || [cat.id.toUpperCase()]
    if (keys.some(key => label.toUpperCase().includes(key.toUpperCase()))) {
      return cat
    }
  }

  return null
}

export function buildFullMenuText(m, ctx, categories) {
  const header = buildMenuHeader(m, ctx).replace(
    '𝙴𝙻𝙸𝙶𝙴 𝚄𝙽𝙰 𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰',
    '𝙲𝙾𝙼𝙰𝙽𝙳𝙾𝚂',
  )
  const body = categories.map(cat => cat.body).join('\n\n')
  return `${header}\n\n${body}`.trim()
}
