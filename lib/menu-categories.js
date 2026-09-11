import fs from 'fs'
import { join } from 'path'
import os from 'os'
import { getMenuRentalLine } from './alquiler.js'
import { formatBotUptime } from './bot-uptime.js'
import { findGroupParticipant } from './group-participant.js'
import { isMainBotConn, cleanBotNum } from '../plugins/modo-sub.js'

export const PREFIJO_FILA_MENU = 'painmenu_'
export const TEXTO_BOTON_MENU = '『 Ver Categorias 』'

const cmd = (p, name) => `> ・ ${p}${name}`
const encabezadoSeccion = (name) => `ー ${name} ー`
const filaSelector = (name) => `・ ${name}`
const grupoSelector = (name) => `ー ${name} ー`
const pistaSelector = (text) => `〜 ${text}`

function seccionOwners(p) {
  return `${encabezadoSeccion('𝙾𝚆𝙽𝙴𝚁𝚂')}
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

function seccionAdmins(p) {
  return `${encabezadoSeccion('𝙰𝙳𝙼𝙸𝙽𝚂')}
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

function seccionSubBot(p) {
  return `${encabezadoSeccion('𝙲𝙼𝙳 𝚂𝚄𝙱 𝙱𝙾𝚃')}
${cmd(p, 'qr')}
${cmd(p, 'code')}
${cmd(p, 'bots')}
${cmd(p, 'botinfo')}
${cmd(p, 'reconnect')}
${cmd(p, 'setbotname')}
${cmd(p, 'setbotimg')}
${cmd(p, 'setautoread')}`.trim()
}

function seccionJuegosRpg(p) {
  return `${encabezadoSeccion('𝙶𝙰𝙼𝙴𝚂 𝚁𝙿𝙶')}
${cmd(p, 'balance')}
${cmd(p, 'bal')}
${cmd(p, 'coins')}
${cmd(p, 'transf @usuario <cantidad>')}
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
${cmd(p, 'sorpresa')}
${cmd(p, 'w / rw')}
${cmd(p, 'claim / c')}
${cmd(p, 'harem')}
${cmd(p, 'vharem <n°>')}
${cmd(p, 'darhr @user <n°>')}
${cmd(p, 'vender <n°> <precio>')}
${cmd(p, 'cancelarg <orden>')}
${cmd(p, 'tiendag')}
${cmd(p, 'comprarg <orden>')}
${cmd(p, 'topharem / gacha')}`.trim()
}

function seccionPerfil(p) {
  return `${encabezadoSeccion('𝙿𝙴𝚁𝙵𝙸𝙻 𝚁𝙿𝙶')}
${cmd(p, 'perfil')}
${cmd(p, 'setbirth <fecha>')}
${cmd(p, 'setdesc <descripción>')}
${cmd(p, 'setfav <personaje>')}
${cmd(p, 'setgenre <hombre/mujer>')}
${cmd(p, 'birthdays')}
${cmd(p, 'setname <nombre>')}
${cmd(p, 'owner')}`.trim()
}

function seccionTop(p) {
  return `${encabezadoSeccion('𝚃𝙾𝙿 𝚁𝙿𝙶')}
${cmd(p, 'topcoins')}
${cmd(p, 'topharem / gacha')}
${cmd(p, 'topinactivos')}
${cmd(p, 'topactivos')}`.trim()
}

function seccionBusquedas(p) {
  return `${encabezadoSeccion('𝙱𝚄𝚂𝚀𝚄𝙴𝙳𝙰𝚂')}
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

function seccionOsint(p) {
  return `${encabezadoSeccion('𝙾𝚂𝙸𝙽𝚃 - 𝙱𝙴𝚃𝙰')}
${cmd(p, 'ip <dirección IP>')}
${cmd(p, 'ip2 <dirección IP>')}
${cmd(p, 'sher <nombre/apodo>')}
${cmd(p, 'webinfo <URL>')}
${cmd(p, 'tik <@usuario>')}`.trim()
}

function seccionIA(p) {
  return `${encabezadoSeccion('𝙸𝙽𝚃𝙴𝙻𝙸𝙶𝙴𝙽𝙲𝙸𝙰 𝙰.𝙸')}
${cmd(p, 'gemini <texto>')}
${cmd(p, 'chatgpt <texto>')}
${cmd(p, 'kora <texto>')}
${cmd(p, 'replia <texto>')}
${cmd(p, 'copilot <texto>')}
${cmd(p, 'animg <texto>')}`.trim()
}

function seccionDescargas(p) {
  return `${encabezadoSeccion('𝙳𝙴𝚂𝙲𝙰𝚁𝙶𝙰𝚂')}
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

function seccionReacciones(p) {
  return `${encabezadoSeccion('𝚁𝙴𝙰𝙲𝙲𝙸𝙾𝙽𝙴𝚂')}
${cmd(p, 'reir')}
${cmd(p, 'happy')}
${cmd(p, 'sad')}
${cmd(p, 'angry')}
${cmd(p, 'dance')}
${cmd(p, 'slap @usuario')}
${cmd(p, 'kiss @usuario')}
${cmd(p, 'hug @usuario')}`.trim()
}

function seccionAdicionales(p) {
  return `${encabezadoSeccion('𝙰𝙳𝙸𝙲𝙸𝙾𝙽𝙰𝙻𝙴𝚂')}
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

function seccionStickers(p) {
  return `${encabezadoSeccion('𝚂𝚃𝙸𝙲𝙺𝙴𝚁𝚂')}
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

function seccionDiversion(p) {
  return `${encabezadoSeccion('𝙳𝙸𝚅𝙴𝚁𝚂𝙾𝙽')}
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

function seccionNsfw(p) {
  return `${encabezadoSeccion('𝙽𝚂𝙵𝚆')}
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

const GRUPOS_CATEGORIA = [
  { title: grupoSelector('𝚂𝚃𝙰𝙵𝙵'), ids: ['owners', 'admins'] },
  { title: grupoSelector('𝚁𝙿𝙶'), ids: ['juegos', 'perfil', 'top'] },
  { title: grupoSelector('𝚄𝚃𝙸𝙻𝙸𝙳𝙰𝙳𝙴𝚂'), ids: ['busquedas', 'osint', 'ia', 'descargas'] },
  { title: grupoSelector('𝙼𝙴𝙳𝙸𝙰'), ids: ['reacciones', 'stickers', 'adicionales'] },
  { title: grupoSelector('𝙴𝚇𝚃𝚁𝙰𝚂'), ids: ['subbot', 'diversion', 'nsfw'] },
]

const DEFS_CATEGORIA = [
  { id: 'owners', label: '𝙾𝚆𝙽𝙴𝚁𝚂', hint: 'gestión del bot', roles: ['owner'], body: seccionOwners },
  { id: 'admins', label: '𝙰𝙳𝙼𝙸𝙽𝚂', hint: 'moderación grupal', roles: ['owner', 'admin'], body: seccionAdmins },
  { id: 'subbot', label: '𝚂𝚄𝙱 𝙱𝙾𝚃', hint: 'qr · bots · config', roles: ['all'], body: seccionSubBot },
  { id: 'juegos', label: '𝙶𝙰𝙼𝙴𝚂 𝚁𝙿𝙶', hint: 'economía · gacha · casino', roles: ['all'], body: seccionJuegosRpg },
  { id: 'perfil', label: '𝙿𝙴𝚁𝙵𝙸𝙻', hint: 'tu perfil rpg', roles: ['all'], body: seccionPerfil },
  { id: 'top', label: '𝚃𝙾𝙿', hint: 'rankings', roles: ['all'], body: seccionTop },
  { id: 'busquedas', label: '𝙱𝚄𝚂𝚀𝚄𝙴𝙳𝙰𝚂', hint: 'google · yt · tiktok', roles: ['all'], body: seccionBusquedas },
  { id: 'osint', label: '𝙾𝚂𝙸𝙽𝚃', hint: 'ip · sherlock', roles: ['all'], body: seccionOsint },
  { id: 'ia', label: '𝙸𝙰', hint: 'gemini · chatgpt', roles: ['all'], body: seccionIA },
  { id: 'descargas', label: '𝙳𝙴𝚂𝙲𝙰𝚁𝙶𝙰𝚂', hint: 'play · ig · fb', roles: ['all'], body: seccionDescargas },
  { id: 'reacciones', label: '𝚁𝙴𝙰𝙲𝙲𝙸𝙾𝙽𝙴𝚂', hint: 'gifs · acciones', roles: ['all'], body: seccionReacciones },
  { id: 'adicionales', label: '𝙰𝙳𝙸𝙲𝙸𝙾𝙽𝙰𝙻𝙴𝚂', hint: 'notas · tts · pdf', roles: ['all'], body: seccionAdicionales },
  { id: 'stickers', label: '𝚂𝚃𝙸𝙲𝙺𝙴𝚁𝚂', hint: 'crear · editar', roles: ['all'], body: seccionStickers },
  { id: 'diversion', label: '𝙳𝙸𝚅𝙴𝚁𝚂𝙸𝙾𝙽', hint: 'tops · memes', roles: ['all'], body: seccionDiversion },
  { id: 'nsfw', label: '𝙽𝚂𝙵𝚆', hint: '+18 · cmd18', roles: ['all'], body: seccionNsfw },
]

export function obtenerIdCategoriaMenu(rowId) {
  if (!rowId || !String(rowId).startsWith(PREFIJO_FILA_MENU)) return null
  return String(rowId).slice(PREFIJO_FILA_MENU.length)
}

export function extraerIdFilaListaMenu(m) {
  return (
    m?.msg?.singleSelectReply?.selectedRowId ||
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    (m?.mtype === 'listResponseMessage' && m?.msg?.singleSelectReply?.selectedRowId) ||
    ''
  )
}

export function extraerIdSeleccionMenu(m) {
  const filaLista = extraerIdFilaListaMenu(m)
  if (filaLista) return filaLista

  const flujoNativo =
    m?.msg?.nativeFlowResponseMessage ||
    m?.message?.interactiveResponseMessage?.nativeFlowResponseMessage
  if (flujoNativo?.paramsJson) {
    const id = parsearIdPainMenuDeJson(flujoNativo.paramsJson)
    if (id) return id
  }

  const idBoton =
    m?.msg?.selectedButtonId ||
    m?.message?.buttonsResponseMessage?.selectedButtonId
  if (idBoton) return idBoton

  const idProfundo = buscarIdPainMenuProfundo(m?.message || m)
  if (idProfundo) return idProfundo

  return ''
}

function parsearIdPainMenuDeJson(crudo) {
  if (!crudo) return ''
  try {
    const parseado = typeof crudo === 'string' ? JSON.parse(crudo) : crudo
    const candidatos = [
      parseado?.id,
      parseado?.main_arg,
      parseado?.selected_id,
      parseado?.selectedRowId,
      parseado?.rowId,
    ]
    for (const valor of candidatos) {
      if (valor && String(valor).startsWith(PREFIJO_FILA_MENU)) {
        return String(valor)
      }
    }
  } catch {}
  return ''
}

function buscarIdPainMenuProfundo(valor, profundidad = 0) {
  if (!valor || profundidad > 10) return ''
  if (typeof valor === 'string') {
    if (valor.startsWith(PREFIJO_FILA_MENU)) return valor
    const desdeJson = parsearIdPainMenuDeJson(valor)
    if (desdeJson) return desdeJson
    return ''
  }
  if (Array.isArray(valor)) {
    for (const item of valor) {
      const encontrado = buscarIdPainMenuProfundo(item, profundidad + 1)
      if (encontrado) return encontrado
    }
    return ''
  }
  if (typeof valor === 'object') {
    for (const clave of Object.keys(valor)) {
      const encontrado = buscarIdPainMenuProfundo(valor[clave], profundidad + 1)
      if (encontrado) return encontrado
    }
  }
  return ''
}

function crearIdsOwner(number) {
  const numeroLimpio = String(number).replace(/[^0-9]/g, '')
  return [numeroLimpio + '@s.whatsapp.net', numeroLimpio + '@lid']
}

/** Convierte global.prefix (RegExp) a texto visible: ".", "/" etc. */
export function formatearPrefijoVisible(prefix, fallback = '.') {
  if (!prefix) return fallback
  if (typeof prefix === 'string') return prefix
  if (Array.isArray(prefix)) {
    for (const item of prefix) {
      const formateado = formatearPrefijoVisible(item, '')
      if (formateado) return formateado
    }
    return fallback
  }
  if (prefix instanceof RegExp) {
    const coincidencia = prefix.source.match(/^\^\[((?:\\.|[^\]\\])+)\]/)
    if (coincidencia) {
      const chars = coincidencia[1].replace(/\\(.)/g, '$1').split('')
      if (chars.includes('.')) return '.'
      if (chars.includes('/')) return '/'
      return chars[0] || fallback
    }
    return fallback
  }
  return fallback
}

export async function resolverContextoMenu(m, conn, usedPrefix) {
  usedPrefix = formatearPrefijoVisible(
    usedPrefix || conn?.prefix || global.prefix,
    '.',
  )

  let nombreBot = global.namebot || 'PAIN BOT'
  let mainImg = './storage/img/menu3.jpg'
  const botActual = cleanBotNum(conn.user?.jid || conn.user?.id)
  const esPrincipal = isMainBotConn(conn)
  const tipo = esPrincipal ? 'Principal Bot' : 'Sub Bot'

  if (!esPrincipal && botActual) {
    const rutaConfigGlobal = join('./Serbot', botActual, 'config.json')
    if (fs.existsSync(rutaConfigGlobal)) {
      const configGlobal = JSON.parse(fs.readFileSync(rutaConfigGlobal, 'utf8'))
      if (configGlobal.img) mainImg = configGlobal.img
      if (configGlobal.name) nombreBot = configGlobal.name
    }
  }

  const todosIdsOwner = [
    conn.decodeJid(conn.user.id),
    ...global.owner.flatMap(([number]) => crearIdsOwner(number)),
    ...(global.ownerLid || []).flatMap(([number]) => crearIdsOwner(number)),
  ]

  const esROwner = todosIdsOwner.includes(m.sender)
  const esOwner = esROwner || m.fromMe
  const esMods = esOwner || global.mods.map(v => v.replace(/[^0-9]/g, '') + '@s.whatsapp.net').includes(m.sender)

  let esRAdmin = false
  let esAdmin = false
  let esCreadorGrupo = false
  if (m.isGroup) {
    try {
      const groupMetadata = conn.chats[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(_ => null)
      if (groupMetadata) {
        const participants = groupMetadata.participants || []
        const user = findGroupParticipant(participants, m, conn) || {}
        esRAdmin = user?.admin == 'superadmin' || false
        esAdmin = esRAdmin || user?.admin == 'admin' || false
        esCreadorGrupo = groupMetadata.owner === m.sender ||
          groupMetadata.subjectOwner === m.sender ||
          user?.admin === 'superadmin'
      }
    } catch (error) {
      console.error('Error obteniendo metadata del grupo:', error)
    }
  }

  let rolUsuario = 'Miembro'
  if (esROwner || esOwner) {
    if (esCreadorGrupo) rolUsuario = '👑 Staff Bot y Grupo'
    else if (esRAdmin || esAdmin) rolUsuario = '👑 Staff Bot y Admin'
    else rolUsuario = '👑 Staff Bot'
  } else if (esMods) {
    if (esCreadorGrupo) rolUsuario = 'Moderador del Bot y Creador'
    else if (esRAdmin || esAdmin) rolUsuario = 'Moderador del Bot y Admin'
    else rolUsuario = 'Moderador del Bot'
  } else if (esCreadorGrupo) {
    rolUsuario = '👑 Creador del Grupo'
  } else if (esRAdmin || esAdmin) {
    rolUsuario = '𖢠 Admin del Grupo'
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
    userRole: rolUsuario,
    botFormatUptime,
    totalf,
    totalRamMB,
    processRamMB,
    rentalLine,
    isOwner: esOwner,
    isAdmin: esAdmin,
  }
}

function puedeVerCategoria(cat, ctx) {
  if (cat.roles.includes('all')) return true
  if (cat.roles.includes('owner') && ctx.isOwner) return true
  if (cat.roles.includes('admin') && (ctx.isOwner || ctx.isAdmin)) return true
  return false
}

function aFilaSelector(cat, usedPrefix) {
  return {
    id: cat.id,
    title: filaSelector(cat.label),
    description: pistaSelector(cat.hint),
    rowId: `${PREFIJO_FILA_MENU}${cat.id}`,
    body: cat.body(usedPrefix),
  }
}

export function construirCategoriasMenu(ctx) {
  return DEFS_CATEGORIA
    .filter(cat => puedeVerCategoria(cat, ctx))
    .map(cat => ({
      ...aFilaSelector(cat, ctx.usedPrefix),
      img: ctx.mainImg,
    }))
}

function construirSeccionesAgrupadas(categorias, mapearFila) {
  const porId = Object.fromEntries(categorias.map(cat => [cat.id, cat]))
  const usados = new Set()
  const secciones = []

  for (const grupo of GRUPOS_CATEGORIA) {
    const filas = grupo.ids
      .map(id => porId[id])
      .filter(Boolean)
      .map(cat => {
        usados.add(cat.id)
        return mapearFila(cat)
      })
    if (filas.length) secciones.push({ title: grupo.title, rows: filas })
  }

  const restantes = categorias.filter(cat => !usados.has(cat.id))
  if (restantes.length) {
    secciones.push({
      title: grupoSelector('𝙾𝚃𝚁𝙾𝚂'),
      rows: restantes.map(mapearFila),
    })
  }

  return secciones
}

export function construirRespuestaCategoria(category, ctx, { interactive = false } = {}) {
  if (interactive) return category.body
  return `${category.body}

> 𓂃 ࣪ ִֶָ☾.  Escribe ${ctx.usedPrefix}menu para volver.`.trim()
}

function construirCamposFlujoNativo(ctx, categorias) {
  return {
    footer: ctx.nombreBot,
    optionText: TEXTO_BOTON_MENU,
    optionTitle: grupoSelector('𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰𝚂'),
    nativeFlow: [{
      text: TEXTO_BOTON_MENU,
      sections: construirSeccionesInteractivas(categorias),
      icon: 'default',
    }],
  }
}

function construirContextInfoInteractivo(sender) {
  return {
    ...(global.rcanal?.contextInfo || {}),
    ...(sender ? { mentionedJid: [sender] } : {}),
  }
}

export function construirEncabezadoMenu(m, ctx) {
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

 𓂃 ࣪ ִֶָ☾. 𝙷𝙾𝚂𝚃𝙸𝙽𝙶 𝙾𝙵𝙸𝙲𝙸𝙰𝙻 𓂃 ࣪ ִֶָ☾.
> 𓂃 ࣪ ִֶָ☾.  ⟅ https://nexcodea.com ⟆

 𓂃 ࣪ ִֶָ☾. 𝙲𝙰𝙽𝙰𝙻𝙴𝚂 𝙾𝙵𝙸𝙲𝙸𝙰𝙻𝙴𝚂 𓂃 ࣪ ִֶָ☾.
> 𓂃 ࣪ ִֶָ☾.  ⟅ https://whatsapp.com/channel/0029Vb7Y87RLikgEutyMId1h ⟆

𓂃 ࣪ ִֶָ☾. *𝙴𝙻𝙸𝙶𝙴 𝚄𝙽𝙰 𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰* 𓂃 ࣪ ִֶָ☾.`.trim()
}

export function construirSeccionesLista(categorias) {
  return construirSeccionesAgrupadas(categorias, cat => ({
    title: cat.title,
    description: cat.description,
    rowId: cat.rowId,
  }))
}

/** Secciones para botón native flow (funciona en grupos y privado) */
export function construirSeccionesInteractivas(categorias) {
  return construirSeccionesAgrupadas(categorias, cat => ({
    header: '',
    title: cat.title,
    description: cat.description,
    id: cat.rowId,
  }))
}

/** Menú completo en un solo mensaje: imagen + info + botón de categorías */
export function construirContenidoMenuInteractivo(ctx, categorias, header, media = {}, sender) {
  return {
    ...media,
    caption: header,
    ...construirCamposFlujoNativo(ctx, categorias),
    contextInfo: construirContextInfoInteractivo(sender),
  }
}

/** Categoría elegida: imagen + comandos + botón ver categorías */
export function construirContenidoCategoriaInteractivo(ctx, categorias, caption, media = {}, sender) {
  return {
    ...media,
    caption,
    ...construirCamposFlujoNativo(ctx, categorias),
    contextInfo: construirContextInfoInteractivo(sender),
  }
}

/** Solo selector (fallback si falla imagen+interactivo) */
export function construirContenidoSelectorFlujoNativo(ctx, categorias) {
  return {
    text: '𓂃 ࣪ ִֶָ☾. 𝙴𝙻𝙸𝙶𝙴 𝚄𝙽𝙰 𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰 𝚙𝚊𝚛𝚊 𝚟𝚎𝚛 𝚜𝚞𝚜 𝚌𝚘𝚖𝚊𝚗𝚍𝚘𝚜.',
    footer: ctx.nombreBot,
    optionText: TEXTO_BOTON_MENU,
    optionTitle: grupoSelector('𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰𝚂'),
    nativeFlow: [{
      text: TEXTO_BOTON_MENU,
      sections: construirSeccionesInteractivas(categorias),
      icon: 'default',
    }],
  }
}

export function buscarCategoriaMenu(categorias, categoryId) {
  return categorias.find(cat => cat.id === categoryId) || null
}

const CLAVES_COINCIDENCIA_CATEGORIA = {
  owners: ['OWNERS', '𝙾𝚆𝙽𝙴𝚁𝚂'],
  admins: ['ADMINS', '𝙰𝙳𝙼𝙸𝙽𝚂'],
  subbot: ['SUB BOT', '𝚂𝚄𝙱 𝙱𝙾𝚃'],
  juegos: ['GAMES RPG', 'GAME RPG', '𝙶𝙰𝙼𝙴𝚂 𝚁𝙿𝙶', '𝙶𝙰𝙼𝙴 𝚁𝙿𝙶', 'GAMES', 'GAME', '𝙶𝙰𝙼𝙴', 'ECONOM', '𝙴𝙲𝙾𝙽𝙾𝙼'],
  perfil: ['PERFIL', '𝙿𝙴𝚁𝙵𝙸𝙻'],
  top: ['TOP RPG', '𝚃𝙾𝙿 𝚁𝙿𝙶'],
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

export function buscarCategoriaMenuDesdeMensaje(m, categorias) {
  const rowId = extraerIdSeleccionMenu(m)
  const porId = buscarCategoriaMenu(categorias, obtenerIdCategoriaMenu(rowId))
  if (porId) return porId

  const etiqueta = [
    m?.msg?.title,
    m?.msg?.description,
    m?.msg?.singleSelectReply?.selectedRowId,
    m?.message?.listResponseMessage?.title,
    m?.message?.listResponseMessage?.description,
    m?.message?.listResponseMessage?.singleSelectReply?.selectedRowId,
    m?.text,
  ].filter(Boolean).join(' ')

  if (!etiqueta) return null

  for (const cat of categorias) {
    const claves = CLAVES_COINCIDENCIA_CATEGORIA[cat.id] || [cat.id.toUpperCase()]
    if (claves.some(clave => etiqueta.toUpperCase().includes(clave.toUpperCase()))) {
      return cat
    }
  }

  return null
}

export function construirTextoMenuCompleto(m, ctx, categorias) {
  const encabezado = construirEncabezadoMenu(m, ctx).replace(
    '𝙴𝙻𝙸𝙶𝙴 𝚄𝙽𝙰 𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰',
    '𝙲𝙾𝙼𝙰𝙽𝙳𝙾𝚂',
  )
  const cuerpo = categorias.map(cat => cat.body).join('\n\n')
  return `${encabezado}\n\n${cuerpo}`.trim()
}

export {
  PREFIJO_FILA_MENU as MENU_ROW_PREFIX,
  TEXTO_BOTON_MENU as MENU_BUTTON_TEXT,
  obtenerIdCategoriaMenu as getMenuCategoryId,
  extraerIdFilaListaMenu as extractMenuListRowId,
  extraerIdSeleccionMenu as extractMenuSelectionId,
  formatearPrefijoVisible as formatDisplayPrefix,
  resolverContextoMenu as resolveMenuContext,
  construirCategoriasMenu as buildMenuCategories,
  construirRespuestaCategoria as buildCategoryResponse,
  construirEncabezadoMenu as buildMenuHeader,
  construirSeccionesLista as buildListSections,
  construirSeccionesInteractivas as buildInteractiveSections,
  construirContenidoMenuInteractivo as buildInteractiveMenuContent,
  construirContenidoCategoriaInteractivo as buildCategoryInteractiveContent,
  construirContenidoSelectorFlujoNativo as buildNativeFlowPickerContent,
  buscarCategoriaMenu as findMenuCategory,
  buscarCategoriaMenuDesdeMensaje as findMenuCategoryFromMessage,
  construirTextoMenuCompleto as buildFullMenuText
}
