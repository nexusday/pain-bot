import fs from 'fs'
import { join } from 'path'
import os from 'os'
import { getMenuRentalLine } from './alquiler.js'
import { formatBotUptime } from './bot-uptime.js'
import { findGroupParticipant, candidatosJidRemitente, jidsSeSolapan } from './group-participant.js'
import { isMainBotConn, cleanBotNum } from '../plugins/modo-sub.js'
import { getStaffOwnerIds, esOwnerConfig } from './staff.js'
import { construirBotonSoporte, obtenerLinkSoporte } from './soporte.js'

export const PREFIJO_FILA_MENU = 'painmenu_'
export const TEXTO_BOTON_MENU = '⋆  menú completo'

const tip = (v) => `\`${String(v ?? '').replace(/`/g, "'")}\``
const cmd = (p, name) => `> ${tip(`${p}${name}`)}`
const encabezadoSeccion = (name) => `\n\`*˚  ✩   ${name}   ✩  ˚*\`\n`
const filaSelector = (name) => name
const grupoSelector = (name) => name
const pistaSelector = (text) => text

function seccionOwners(p, ctx) {
  const líneasSoporte = ctx?.esPrincipal
    ? `\n${cmd(p, 'soporte <link>')}\n${cmd(p, 'soporte del')}`
    : ''
  const líneasBotExtra = ctx?.esOwnerConfig
    ? `\n${cmd(p, 'bot 1h')}\n${cmd(p, 'bot oficial')}`
    : ''
  return `${encabezadoSeccion('owners')}
${cmd(p, 'mod @usuario / numero / lid')}
${cmd(p, 'mod del @usuario')}
${cmd(p, 'mod lista')}
_staff por bot · owners de config en todos_
${cmd(p, 'verplugin <nombre.js>')}
${cmd(p, 'replugin <nombre.js>')}
${cmd(p, 'addplugin <nombre.js>')}
${cmd(p, 'nameplugins <archivo.js> > <nuevo.js>')}
${cmd(p, 'update')}
${cmd(p, 'restart')}
${cmd(p, 'delsession')}
${cmd(p, 'delsession lista')}
${cmd(p, 'setvist on/off')}
${cmd(p, 'subme <mensaje>')}
${cmd(p, 'join <link>')}
${cmd(p, 'exit')}
${cmd(p, 'blackn @usuario / responder / numero')}
${cmd(p, 'blackn del')}
${cmd(p, 'blackn ver')}
${cmd(p, 'bot on')}
${cmd(p, 'bot off')}${líneasBotExtra}
${tip('=>')}  ${tip('>')}  ${tip('$')}  _eval owner_${líneasSoporte}`.trim()
}

function seccionAdmins(p) {
  return `${encabezadoSeccion('admins')}
${cmd(p, 'ban @usuario / responder')}
${cmd(p, 'sban → sticker ban (responder sticker)')}
${cmd(p, 'sban del / ver')}
${cmd(p, 'promote @usuario / responder')}
${cmd(p, 'demote @usuario / responder')}
${cmd(p, 'warn @usuario / responder')}
${cmd(p, 'delwarn @usuario / responder')}
${cmd(p, 'warnings @usuario / responder')}
${cmd(p, 'tag')}
${cmd(p, 'clas 3|13')}
${cmd(p, 'clas lista')}
${cmd(p, 'clas libres')}
${cmd(p, 'clas ocupados')}
${cmd(p, 'clas cupo @conEquipo @libre')}
${cmd(p, 'clas quitar @usuario')}
${cmd(p, 'clas mover @usuario N')}
${cmd(p, 'clas reset')}
${cmd(p, 'mute @usuario / responder')}
${cmd(p, 'delmute @usuario / responder')}
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
${cmd(p, 'antibot on/off')}
${cmd(p, 'antiestados on/off')}
${cmd(p, 'antidelete on/off')}
${cmd(p, 'antis')}
${cmd(p, 'anticontact on/off')}
${cmd(p, 'antimention on/off')}
${cmd(p, 'antidocument on/off')}
${cmd(p, 'antipalabra on/off')}
${cmd(p, 'antipalabra add <palabra>')}
${cmd(p, 'antipalabra <palabra>')}
${cmd(p, 'antipalabra action delete|kick')}
${cmd(p, 'anticaracter on/off <limite>')}
${cmd(p, 'antiprefijo on/off')}
${cmd(p, 'soloadmin on/off')}
${cmd(p, 'welcome on/off')}
${cmd(p, 'modoia on/off')}
${cmd(p, 'modohot on/off')}
${cmd(p, 'modoilegal on/off')}
${cmd(p, 'modohuman on/off')}
${cmd(p, 'modosad on/off')}
${cmd(p, 'modospico on/off')}
${cmd(p, 'modo nombre|prompt')}
${cmd(p, 'modo nombre|prompt|ban,del,mute,warn,delwarn')}
${cmd(p, 'modo nombre|prompt|all')}
${cmd(p, 'modo off')}
${cmd(p, 'mododescargas on/off')}
${cmd(p, 'cmd18 on/off')}`.trim()
}

function seccionSubBot(p) {
  return `${encabezadoSeccion('sub bot')}
${cmd(p, 'qr')}
${cmd(p, 'code')}
${cmd(p, 'bots')}
${cmd(p, 'botinfo')}
${cmd(p, 'reconnect')}
${cmd(p, 'delsession')}
${cmd(p, 'setbotname')}
${cmd(p, 'setbotimg')}
${cmd(p, 'setautoread')}`.trim()
}

function seccionJuegosRpg(p) {
  return `${encabezadoSeccion('juegos rpg')}
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
  return `${encabezadoSeccion('perfil')}
${cmd(p, 'perfil')}
${cmd(p, 'setbirth <fecha>')}
${cmd(p, 'setage <edad>')}
${cmd(p, 'setdesc <descripción>')}
${cmd(p, 'setfav <personaje>')}
${cmd(p, 'setgenre <hombre/mujer>')}
${cmd(p, 'birthdays')}
${cmd(p, 'setname <nombre>')}
${cmd(p, 'marry @user')}
${cmd(p, 'divorce')}
${cmd(p, 'owner')}`.trim()
}

function seccionTop(p) {
  return `${encabezadoSeccion('tops')}
${cmd(p, 'topcoins')}
${cmd(p, 'topharem / gacha')}
${cmd(p, 'topinactivos')}
${cmd(p, 'topactivos')}`.trim()
}

function seccionBusquedas(p) {
  return `${encabezadoSeccion('búsquedas')}
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
  return `${encabezadoSeccion('osint')}
${cmd(p, 'ip <dirección IP>')}
${cmd(p, 'ip2 <dirección IP>')}
${cmd(p, 'sher <nombre/apodo>')}
${cmd(p, 'webinfo <URL>')}
${cmd(p, 'tik <@usuario>')}`.trim()
}

function seccionIA(p) {
  return `${encabezadoSeccion('inteligencia ai')}
${cmd(p, 'gemini <texto>')}
${cmd(p, 'chatgpt <texto>')}
${cmd(p, 'kora <texto>')}
${cmd(p, 'replia <texto>')}
${cmd(p, 'copilot <texto>')}
${cmd(p, 'animg <texto>')}`.trim()
}

function seccionDescargas(p) {
  return `${encabezadoSeccion('descargas')}
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
  return `${encabezadoSeccion('reacciones')}
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
  return `${encabezadoSeccion('adicionales')}
${cmd(p, 'nota <contenido>')}
${cmd(p, 'delnota <numero>')}
${cmd(p, 'vernotas')}
${cmd(p, 'id')}
${cmd(p, 'infogrupo')}
${cmd(p, 'traducir')}
${cmd(p, 'speed <audio>')}
${cmd(p, 'slow <audio>')}
${cmd(p, 'audio <video>')}
${cmd(p, 'sss <imagen/video ver una vez>')}
${cmd(p, 'ssa <audio/nota de voz una vez>')}
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
  return `${encabezadoSeccion('stickers')}
${cmd(p, 'sticker')}
${cmd(p, 'st <texto>')}
${cmd(p, 'brat <texto>')}
${cmd(p, 'sgay <foto> texto')}
${cmd(p, 'sw <responder/@user> texto')}
${cmd(p, 'toimg')}
${cmd(p, 'delmeta nombre|autor')}
${cmd(p, 'setmeta pack | autor')}
${cmd(p, 'delstickermeta')}`.trim()
}

function seccionDiversion(p) {
  return `${encabezadoSeccion('diversión')}
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
${cmd(p, 'meme')}
${cmd(p, 'snake')}`.trim()
}

function seccionNsfw(p) {
  return `${encabezadoSeccion('nsfw')}
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
${cmd(p, 'r34 <tag>')}
${cmd(p, 'danbooru <tag>')}
${cmd(p, 'gelbooru <tag>')}
${cmd(p, 'xvideos <url>')}
${cmd(p, 'xvideos <búsqueda>')}`.trim()
}

const GRUPOS_CATEGORIA = [
  { title: grupoSelector('staff'), ids: ['owners', 'admins'] },
  { title: grupoSelector('rpg'), ids: ['juegos', 'perfil', 'top'] },
  { title: grupoSelector('utilidades'), ids: ['busquedas', 'osint', 'ia', 'descargas'] },
  { title: grupoSelector('media'), ids: ['reacciones', 'stickers', 'adicionales'] },
  { title: grupoSelector('extras'), ids: ['subbot', 'diversion', 'nsfw'] },
]

const DEFS_CATEGORIA = [
  { id: 'owners', label: 'owners', hint: 'gestión del bot', roles: ['owner'], body: seccionOwners },
  { id: 'admins', label: 'admins', hint: 'moderación del grupo', roles: ['owner', 'admin'], body: seccionAdmins },
  { id: 'subbot', label: 'sub bot', hint: 'qr · bots · config', roles: ['all'], body: seccionSubBot },
  { id: 'juegos', label: 'juegos rpg', hint: 'economía · gacha · casino', roles: ['all'], body: seccionJuegosRpg },
  { id: 'perfil', label: 'perfil', hint: 'tu perfil rpg', roles: ['all'], body: seccionPerfil },
  { id: 'top', label: 'tops', hint: 'rankings', roles: ['all'], body: seccionTop },
  { id: 'busquedas', label: 'búsquedas', hint: 'google · yt · tiktok', roles: ['all'], body: seccionBusquedas },
  { id: 'osint', label: 'osint', hint: 'ip · sherlock', roles: ['all'], body: seccionOsint },
  { id: 'ia', label: 'inteligencia ai', hint: 'gemini · chatgpt', roles: ['all'], body: seccionIA },
  { id: 'descargas', label: 'descargas', hint: 'play · ig · fb', roles: ['all'], body: seccionDescargas },
  { id: 'reacciones', label: 'reacciones', hint: 'gifs · acciones', roles: ['all'], body: seccionReacciones },
  { id: 'adicionales', label: 'adicionales', hint: 'notas · tts · pdf', roles: ['all'], body: seccionAdicionales },
  { id: 'stickers', label: 'stickers', hint: 'crear · editar', roles: ['all'], body: seccionStickers },
  { id: 'diversion', label: 'diversión', hint: 'tops · memes', roles: ['all'], body: seccionDiversion },
  { id: 'nsfw', label: 'nsfw', hint: '+18 · cmd18', roles: ['all'], body: seccionNsfw },
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
  if (!numeroLimpio) return []
  return [
    numeroLimpio + '@s.whatsapp.net',
    numeroLimpio + '@lid',
    numeroLimpio + '@hosted.lid'
  ]
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
    ...(!esPrincipal && global.conn?.user?.id ? [conn.decodeJid(global.conn.user.id)] : []),
    ...global.owner.flatMap(([number]) => crearIdsOwner(number)),
    ...(global.ownerLid || []).flatMap(([number]) => crearIdsOwner(number)),
    ...getStaffOwnerIds(conn),
  ]

  const idsRemitente = candidatosJidRemitente(m, conn)
  const esROwner = jidsSeSolapan(idsRemitente, todosIdsOwner)
  const esOwner = esROwner || m.fromMe
  const esMods = esOwner || (global.mods || []).some(v =>
    jidsSeSolapan(idsRemitente, crearIdsOwner(v))
  )

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

  let rolUsuario = 'miembro'
  if (esROwner || esOwner) {
    if (esCreadorGrupo) rolUsuario = 'staff · bot & grupo'
    else if (esRAdmin || esAdmin) rolUsuario = 'staff · bot & admin'
    else rolUsuario = 'staff del bot'
  } else if (esMods) {
    if (esCreadorGrupo) rolUsuario = 'mod · bot & creador'
    else if (esRAdmin || esAdmin) rolUsuario = 'mod · bot & admin'
    else rolUsuario = 'moderador'
  } else if (esCreadorGrupo) {
    rolUsuario = 'creador del grupo'
  } else if (esRAdmin || esAdmin) {
    rolUsuario = 'admin'
  }

  const botFormatUptime = formatBotUptime(conn)
  const totalf = Object.values(global.plugins).filter(v => v.help && v.tags).length
  const totalRamMB = Math.round(os.totalmem() / 1024 / 1024)
  const processRamMB = Math.round(process.memoryUsage().rss / 1024 / 1024)
  const rentalLine = m.isGroup ? getMenuRentalLine(m.chat) : ''

  let botonSoporte = null
  let linkSoporte = null
  try {
    botonSoporte = construirBotonSoporte(conn)
    linkSoporte = obtenerLinkSoporte(conn)
  } catch {}

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
    botonSoporte,
    linkSoporte,
    esPrincipal,
    esOwnerConfig: esOwnerConfig(m, conn),
  }
}

function puedeVerCategoria(cat, ctx) {
  if (cat.roles.includes('all')) return true
  if (cat.roles.includes('owner') && ctx.isOwner) return true
  if (cat.roles.includes('admin') && (ctx.isOwner || ctx.isAdmin)) return true
  return false
}

function aFilaSelector(cat, ctx) {
  return {
    id: cat.id,
    title: filaSelector(cat.label),
    description: pistaSelector(cat.hint),
    rowId: `${PREFIJO_FILA_MENU}${cat.id}`,
    body: cat.body(ctx.usedPrefix, ctx),
  }
}

export function construirCategoriasMenu(ctx) {
  return DEFS_CATEGORIA
    .filter(cat => puedeVerCategoria(cat, ctx))
    .map(cat => ({
      ...aFilaSelector(cat, ctx),
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
      title: grupoSelector('otros'),
      rows: restantes.map(mapearFila),
    })
  }

  return secciones
}

export function construirRespuestaCategoria(category, ctx, { interactive = false } = {}) {
  const pie = interactive
    ? `\n\n\`*˚  ✩   menú completo   ✩  ˚*\``
    : `\n\n> ${tip(`${ctx.usedPrefix}menu`)}`
  return `ㅤ\n${category.body}${pie}\nㅤ`.trim()
}

function construirCamposFlujoNativo(ctx, categorias) {
  const flujo = [{
    text: TEXTO_BOTON_MENU,
    sections: construirSeccionesInteractivas(categorias),
    icon: 'default',
  }]

  if (ctx?.botonSoporte?.url) {
    flujo.push({
      text: ctx.botonSoporte.text || '𓂃  soporte',
      url: ctx.botonSoporte.url,
    })
  }

  return {
    footer: ctx.nombreBot,
    nativeFlow: flujo,
  }
}

function construirContextInfoInteractivo(sender) {
  return {
    ...(global.rcanal?.contextInfo || {}),
    ...(sender ? { mentionedJid: [sender] } : {}),
  }
}

export function construirEncabezadoMenu(m, ctx) {
  const quien = `@${String(m.sender).split('@')[0]}`
  const bloqueAcceso = ctx.rentalLine
    ? `\n┊  acceso      ${tip(ctx.rentalLine)}`
    : ''

  return `
\`*˚      ⋆      ✩      ⋆      ˚*\`

*${ctx.nombreBot}*
hola ${quien}
_${ctx.tipo}_

\`*˚      ⋆      ✩      ⋆      ˚*\`

┊  rol         ${tip(ctx.userRole)}
┊  activo      ${tip(ctx.botFormatUptime)}
┊  comandos    ${tip(ctx.totalf)}
┊  memoria     ${tip(`${ctx.processRamMB} / ${ctx.totalRamMB} mb`)}${bloqueAcceso}

\`*˚      ⋆      ✩      ⋆      ˚*\`

˚  *creador*
${tip('Sunkovv')}
https://wa.me/Sunkovv

˚  *hosting*
${tip('Nexcodea')}
https://nexcodea.com

˚  *canal*
https://whatsapp.com/channel/0029Vb7Y87RLikgEutyMId1h

\`*˚      ⋆      ✩      ⋆      ˚*\`
_menú completo, abajo_
`.trim()
}

export function construirSeccionesLista(categorias) {
  return construirSeccionesAgrupadas(categorias, cat => ({
    title: cat.title,
    description: cat.description,
    rowId: cat.rowId,
  }))
}


export function construirSeccionesInteractivas(categorias) {
  return construirSeccionesAgrupadas(categorias, cat => ({
    header: '',
    title: cat.title,
    description: cat.description,
    id: cat.rowId,
  }))
}


export function construirContenidoMenuInteractivo(ctx, categorias, header, media = {}, sender) {
  return {
    ...media,
    caption: header,
    ...construirCamposFlujoNativo(ctx, categorias),
    contextInfo: construirContextInfoInteractivo(sender),
  }
}


export function construirContenidoCategoriaInteractivo(ctx, categorias, caption, media = {}, sender) {
  return {
    ...media,
    caption,
    ...construirCamposFlujoNativo(ctx, categorias),
    contextInfo: construirContextInfoInteractivo(sender),
  }
}


export function construirContenidoSelectorFlujoNativo(ctx, categorias) {
  return {
    text: `
\`*˚   ✩   menú completo   ✩   ˚*\`
_elige una sección_
`.trim(),
    ...construirCamposFlujoNativo(ctx, categorias),
  }
}

export function buscarCategoriaMenu(categorias, categoryId) {
  return categorias.find(cat => cat.id === categoryId) || null
}

const CLAVES_COINCIDENCIA_CATEGORIA = {
  owners: ['OWNERS', '𝙾𝚆𝙽𝙴𝚁𝚂', 'owners'],
  admins: ['ADMINS', '𝙰𝙳𝙼𝙸𝙽𝚂', 'admins'],
  subbot: ['SUB BOT', '𝚂𝚄𝙱 𝙱𝙾𝚃', 'sub bot', 'subbot'],
  juegos: ['GAMES RPG', 'GAME RPG', '𝙶𝙰𝙼𝙴𝚂 𝚁𝙿𝙶', 'juegos rpg', 'juegos', 'GAMES', 'GAME', 'ECONOM'],
  perfil: ['PERFIL', '𝙿𝙴𝚁𝙵𝙸𝙻', 'perfil'],
  top: ['TOP RPG', '𝚃𝙾𝙿 𝚁𝙿𝙶', 'tops', 'top'],
  busquedas: ['BUSQUEDA', '𝙱𝚄𝚂𝚀', 'búsquedas', 'busquedas'],
  osint: ['OSINT', '𝙾𝚂𝙸𝙽𝚃', 'osint'],
  ia: ['INTELIGENCIA', '𝙸𝙽𝚃𝙴𝙻𝙸𝙶𝙴𝙽𝙲𝙸𝙰', 'inteligencia ai', 'ia'],
  descargas: ['DESCARGA', '𝙳𝙴𝚂𝙲𝙰𝚁𝙶', 'descargas'],
  reacciones: ['REACCION', '𝚁𝙴𝙰𝙲𝙲𝙸𝙾𝙽', 'reacciones'],
  adicionales: ['ADICIONAL', '𝙰𝙳𝙸𝙲𝙸𝙾𝙽𝙰𝙻', 'adicionales'],
  stickers: ['STICKER', '𝚂𝚃𝙸𝙲𝙺𝙴𝚁', 'stickers'],
  diversion: ['DIVERSION', '𝙳𝙸𝚅𝙴𝚁𝚂𝙸𝙾𝙽', 'diversión', 'diversion'],
  nsfw: ['NSFW', '𝙽𝚂𝙵𝚆', 'nsfw'],
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
    '`*˚      ⋆      ✩      ⋆      ˚*\`\n_menú completo, abajo_',
    '`*˚      ⋆      ✩      ⋆      ˚*\`\n_comandos_',
  )
  const cuerpo = categorias.map(cat => cat.body).join('\n')
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
