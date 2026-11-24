import { smsg } from './lib/simple.js'
import { format } from 'util'
import { fileURLToPath } from 'url'
import path, { join } from 'path'
import { readFile } from 'node:fs/promises'
import fetch from 'node-fetch'

import { antipvDebeIgnorar } from './lib/Antis/anti-pv.js'
import { handleAIModes } from './lib/eventHandlers.js'
import { handleAntiSystems, handleAntiMediaEarly } from './lib/antiHandlers.js'
import { manejarAntiEstados } from './lib/Antis/anti-estados.js'
import {
  iniciarAntiDelete,
  guardarMensajeAntiDelete
} from './lib/Antis/anti-delete.js'
import { handleGroupEvents } from './lib/event.js'
import { handleModoDescargas } from './lib/Modos/modo-descargas.js'
import { isViewOnceCandidate, isKnownViewOnce, runAntiViewOnce } from './lib/viewOnce.js'
import { checkGroupRental, isRentalBypassCommand } from './lib/alquiler.js'
import { checkCmd18Command } from './lib/cmd18.js'
import {
  findGroupParticipant,
  findBotParticipant,
  findCurrentBotParticipant,
  isAdminRole,
  resolverAdminRemitente,
  candidatosJidRemitente,
  jidsSeSolapan
} from './lib/group-participant.js'
import { metadataGrupo } from './lib/group-meta-cache.js'
import { antiActivo } from './lib/Antis/anti-modo.js'
import { shouldSkipGroupMessageEarly, extraerTextoMensajeCrudo } from './plugins/modo-sub.js'
import { shouldBlockByGrupoOff } from './lib/bot-groups.js'
import { sendMichiBoard } from './lib/michi-board.js'
import { isInviteOpponent } from './lib/michi-users.js'
import { ensureRpgUser, awardCommandProgress, isStickerMessage, trackSentSticker, formatLevelUpMessage } from './lib/rpg-level.js'
import { trackUserMessage } from './lib/msg-activity.js'
import { haySesionStickerAudio } from './lib/sticker-audio.js'
import { getStaffOwnerIds } from './lib/staff.js'
import { estaEnBlackn } from './lib/blackn.js'
import { idiomaDe, tr } from './lib/lang.js'
import { coincideRespuesta } from './lib/banco-adivinanzas.js'
import { cobrarPrestamoSiToca, textoCobro } from './lib/banco-prestamo.js'
import { juegosBloqueadosEn, verificarComandoJuegos, esPluginJuegos } from './lib/Modos/modo-games.js'
import { COMANDOS_SIN_COMISION, aplicarComisionPareja } from './lib/pareja-comision.js'
import { registrarComandoGlobal } from './lib/webpanel/runtime-stats.js'
import { contarMensajesDuplicados, contarMensajesRecibidos } from './lib/worker-metrics.js'
import { comandosOcultosPremium } from './lib/premium.js'

const { proto } = (await import('@whiskeysockets/baileys')).default
const isNumber = x => typeof x === 'number' && !isNaN(x)

let cachePlugins = null
let imprimirMensaje = null

// Un `messages.upsert` puede llegar antes de que Baileys termine de
// completar `conn.user` (emparejamiento o reconexión). Acceder a
// `this.user.jid` directamente tumbaba el handler con unhandledRejection.
function jidDeConexion(conn) {
  const jid = conn?.user?.jid || conn?.user?.id || ''
  return jid ? String(jid) : ''
}

function numeroDeJid(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}

function pareceComandoCrudo(msg) {
  try {
    const texto = String(extraerTextoMensajeCrudo(msg) || '').trim()
    return Boolean(texto && global.prefix instanceof RegExp && global.prefix.test(texto))
  } catch {
    return false
  }
}

function avisarPermiso(tipo, m, conn) {
  if (typeof global.dfail === 'function') return global.dfail(tipo, m, conn)
  const textos = {
    admin: 'Este comando solo puede usarlo un administrador del grupo.',
    botAdmin: 'El bot debe ser admin para usar este comando.',
    owner: 'Este comando solo puede usarlo el owner del bot.',
    rowner: 'Este comando solo puede usarlo el creador del bot.',
    group: 'Este comando solo funciona en grupos.'
  }
  return conn.reply(m.chat, textos[tipo] || 'No puedes usar este comando.', m)
}

function pluginsEnCache() {
  const epoch = global.pluginsEpoch || 0
  if (cachePlugins && cachePlugins.epoch === epoch) return cachePlugins

  const lista = []
  const conAll = []
  const comandos = new Set()
  const pluginsPorComando = new Map()
  const pluginsConComandoRegex = []
  const pluginsConPrefijoPropio = []
  const pluginsAntesSesion = []
  const PLUGINS_CON_BEFORE_SESION = new Set(['xnxx.js', 'hentai.js', 'xvideos.js'])

  for (const name in global.plugins) {
    const plugin = global.plugins[name]
    if (!plugin || plugin.disabled) continue

    let command = plugin.command || plugin.handler?.command || []
    if (typeof command === 'string') command = [command]
    else if (command instanceof RegExp) command = [command.source]
    else if (!Array.isArray(command)) command = []

    const normalizado = {
      name,
      handler: plugin.handler || plugin,
      command,
      tags: plugin.tags || plugin.handler?.tags || [],
      help: plugin.help || [],
      all: plugin.all || plugin.handler?.all,
      customPrefix: plugin.customPrefix || plugin.handler?.customPrefix,
      admin: Boolean(plugin.admin || plugin.handler?.admin),
      botAdmin: Boolean(plugin.botAdmin || plugin.handler?.botAdmin),
      owner: Boolean(plugin.owner || plugin.handler?.owner),
      rowner: Boolean(plugin.rowner || plugin.handler?.rowner),
      group: Boolean(plugin.group || plugin.handler?.group)
    }

    for (const cmd of command) {
      if (typeof cmd === 'string' && cmd) {
        const nombreComando = cmd.toLowerCase()
        comandos.add(nombreComando)
        if (!pluginsPorComando.has(nombreComando)) pluginsPorComando.set(nombreComando, [])
        pluginsPorComando.get(nombreComando).push(normalizado)
      } else if (cmd instanceof RegExp) {
        pluginsConComandoRegex.push(normalizado)
      }
    }

    lista.push(normalizado)
    if (normalizado.customPrefix) pluginsConPrefijoPropio.push(normalizado)
    if (typeof normalizado.all === 'function') conAll.push(normalizado)
    // Los `handler.before` de sesión solo existen en tres plugins: se indexan
    // una vez en lugar de recorrer los ~200 plugins por cada mensaje.
    if (PLUGINS_CON_BEFORE_SESION.has(name) && typeof normalizado.handler?.before === 'function') {
      pluginsAntesSesion.push(normalizado)
    }
  }

  cachePlugins = {
    epoch,
    lista,
    conAll,
    comandos,
    pluginsPorComando,
    pluginsConComandoRegex,
    pluginsConPrefijoPropio,
    pluginsAntesSesion,
    ordenPlugins: new Map(lista.map((plugin, index) => [plugin, index]))
  }
  return cachePlugins
}

const ORDENES_SUELTAS = new Set(['abrir', 'cerrar', 'del', 'delete', 'eliminar'])
const ESCUCHA_CADA_MENSAJE = [
  'antiLink', 'antiSpam', 'antiPalabra', 'antiBot', 'antiEstados', 'antiViewOnce',
  'antiDelete', 'antiSticker', 'antiImg', 'antiVer', 'antiAudio', 'antiVideo',
  'antiDocument', 'antiContact', 'antiMention', 'antiCaracter', 'soloAdmin', 'stickerBan',
  'modoIA', 'modoHot', 'modoIlegal', 'modoHuman', 'modoSad', 'modoPsico', 'modoCustom', 'modoDescargas'
]

function elGrupoMiraCadaMensaje(chatId) {
  const datos = global.db?.data
  if (!datos || !chatId) return false
  for (const clave of ESCUCHA_CADA_MENSAJE) {
    const valor = datos[clave]?.[chatId]
    if (clave.startsWith('modo')) {
      if (valor === true) return true
      continue
    }
    if (antiActivo(valor)) return true
  }
  if (datos.muted?.[chatId]?.length) return true
  return false
}

function hayRespuestaPendiente(chatId) {
  if (!chatId) return false
  if (global.pendingInvites?.[chatId]) return true
  if (global.pendingMarriages?.[chatId]) return true
  if (global.games?.[chatId]) return true
  if (global.db?.data?.adivinanzasActivas?.[chatId]) return true
  const descargas = global.pendingYtDescarga
  if (!descargas) return false
  const prefijo = `${chatId}|`
  for (const clave in descargas) {
    if (clave.startsWith(prefijo)) return true
  }
  return false
}

function mensajeYaLeidoPuedeSoltarse(m) {
  if (!m?.isGroup || m.fromMe) return false
  // /sa espera el audio como respuesta: no se puede descartar por ser media.
  if (haySesionStickerAudio(m.chat)) return false
  const texto = String(m.text || '').trim()
  if (global.prefix instanceof RegExp && texto && global.prefix.test(texto)) return false
  if (ORDENES_SUELTAS.has(texto.toLowerCase())) return false
  if (global.db?.data?.antiprefijo?.[m.chat] === true) return false
  if (elGrupoMiraCadaMensaje(m.chat)) return false
  if (hayRespuestaPendiente(m.chat)) return false
  const tipo = m.mtype || ''
  if (/buttons|list|template|interactive/i.test(tipo)) return false
  return true
}

function esCharlaQueNoFrena(conn, msg) {
  const jid = String(msg?.key?.remoteJid || '')
  if (!jid.endsWith('@g.us') || msg?.key?.fromMe || msg?.messageStubType) return false
  let chatId = jid
  try { chatId = conn?.decodeJid?.(jid) || jid } catch {}
  // /sa espera el audio como respuesta: debe llegar a los plugins.
  if (haySesionStickerAudio(chatId)) return false
  if (global.db?.data?.antiprefijo?.[chatId] === true) return false
  if (elGrupoMiraCadaMensaje(chatId) || hayRespuestaPendiente(chatId)) return false

  const texto = String(extraerTextoMensajeCrudo(msg) || '').trim()
  if (!texto) {
    const cuerpo = msg?.message || {}
    const esMedia = cuerpo.imageMessage || cuerpo.videoMessage || cuerpo.stickerMessage || cuerpo.audioMessage || cuerpo.documentMessage
    return Boolean(esMedia)
  }
  if (global.prefix instanceof RegExp && global.prefix.test(texto)) return false
  if (ORDENES_SUELTAS.has(texto.toLowerCase())) return false
  return true
}

function textoPuedeSerComando(m, isOwner, isROwner, comandos) {
  const texto = typeof m.text === 'string' ? m.text.trim() : ''
  if (!texto) return false
  if (global.prefix instanceof RegExp && global.prefix.test(texto)) return true
  const permiteSinPrefijo = isOwner || isROwner || (m.isGroup && global.db?.data?.antiprefijo?.[m.chat] === true)
  if (!permiteSinPrefijo) return false
  const palabra = texto.split(/\s+/)[0]?.toLowerCase() || ''
  return comandos.has(palabra)
}

function pluginsCandidatosComando(texto, conn, m, isOwner, isROwner, cache) {
  const prefijo = conn.prefix || global.prefix
  let match = null

  if (prefijo instanceof RegExp) {
    match = prefijo.exec(texto)
  } else if (Array.isArray(prefijo)) {
    for (const item of prefijo) {
      const regex = item instanceof RegExp
        ? item
        : new RegExp(String(item).replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'))
      match = regex.exec(texto)
      if (match) break
    }
  } else if (typeof prefijo === 'string') {
    const regex = new RegExp(prefijo.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&'))
    match = regex.exec(texto)
  }

  let comando
  if (match) {
    comando = texto.slice(match[0].length).trim().split(/\s+/)[0]?.toLowerCase()
  } else {
    const antiprefijo = m.isGroup && global.db?.data?.antiprefijo?.[m.chat] === true
    if (!isOwner && !isROwner && !antiprefijo) return cache.pluginsConPrefijoPropio
    comando = texto.trim().split(/\s+/)[0]?.toLowerCase()
  }

  const candidatos = new Set([
    ...(cache.pluginsPorComando.get(comando) || []),
    ...cache.pluginsConComandoRegex,
    ...cache.pluginsConPrefijoPropio
  ])
  return [...candidatos].sort(
    (a, b) => cache.ordenPlugins.get(a) - cache.ordenPlugins.get(b)
  )
}

// Baileys puede entregar varios mensajes en un mismo messages.upsert. No se
// debe perder toda la ráfaga salvo el último mensaje: se procesa cada ID una
// sola vez y en el orden recibido. El procesamiento sigue siendo acotado al
// socket que recibió la actualización, sin crear una cola global que bloquee
// a todos los sub-bots.
export async function handler(chatUpdate) {
  if (!chatUpdate || !Array.isArray(chatUpdate.messages)) return
  const vistos = new Set()
  const mensajes = chatUpdate.messages.filter((mensaje) => {
    if (!mensaje) return false
    const id = String(mensaje.key?.id || '')
    if (!id) return true
    if (vistos.has(id)) return false
    vistos.add(id)
    return true
  })
  contarMensajesRecibidos(chatUpdate.messages.length, mensajes.length)
  const duplicados = chatUpdate.messages.length - mensajes.length
  if (duplicados > 0) contarMensajesDuplicados(duplicados)
  for (const mensaje of mensajes) {
    // `this` es la conexión del socket (bind del caller); sin `.call()`,
    // `this.pushMessage` dentro de procesarActualizacion sería undefined.
    await procesarActualizacion.call(this, { ...chatUpdate, messages: [mensaje] })
  }
}

async function procesarActualizacion(chatUpdate) {
if (!chatUpdate) return
if (chatUpdate.type && chatUpdate.type !== 'notify') {
  const ultimo = chatUpdate.messages?.[chatUpdate.messages.length - 1]
  if (!pareceComandoCrudo(ultimo)) return
  const marca = Number(ultimo?.messageTimestamp || 0)
  const ms = marca > 1e12 ? marca : marca * 1000
  if (!ms || Date.now() - ms > 12000) return
}
let m = chatUpdate.messages[chatUpdate.messages.length - 1]
if (!m) return

// Un `messages.upsert` puede adelantarse al evento 'open' por unos ms. Sin
// `user` no hay identidad para responder, aplicar owner ni leer ajustes; se
// espera un poco (máx. 2 s) en vez de procesar a ciegas o reventar.
if (!this.user) {
  for (let intento = 0; intento < 20 && !this.user; intento++) {
    await new Promise((resolver) => setTimeout(resolver, 100))
  }
  if (!this.user) return
}


try {
  if (global.db.data == null) await global.loadDatabase()
  if (pareceComandoCrudo(m)) {
    try {
      await global.db.adapter.refresh(global.db.data)
    } catch (error) {
      console.error('[db] No se pudo sincronizar antes de filtrar el comando:', error?.message || error)
      return
    }
  }
  if (antipvDebeIgnorar(this, m)) return
  if (shouldSkipGroupMessageEarly(this, m)) return
  if (esCharlaQueNoFrena(this, m)) return
} catch (e) {
  console.error('Error modosub early:', e)
}

await this.pushMessage(chatUpdate.messages).catch(console.error)

try {
m = smsg(this, m) || m
if (!m) return
if (antipvDebeIgnorar(this, m)) return
if (mensajeYaLeidoPuedeSoltarse(m)) return
const conn = this
iniciarAntiDelete(this)

if (!m.messageStubType && m.isGroup && !m.fromMe) {
  await runAntiViewOnce(this, m)
  try {
    if (global.db?.data?.antiEstados?.[m.chat]) {
      const partes =
        (this.chats[m.chat] || {}).metadata?.participants || []
      const u = findGroupParticipant(partes, m, this) || {}
      const esAdminEarly = u?.admin === 'admin' || u?.admin === 'superadmin'
      await manejarAntiEstados(m, this, esAdminEarly)
    }
  } catch {}
}

try {
  if (m.isGroup) {
    guardarMensajeAntiDelete(m, this)
  }
} catch {}

if (m.messageStubType) return
m.exp = 0
m.limit = false

try {  
  let user = global.db.data.users[m.sender] ||= {}  
  if (!isNumber(user.limit)) user.limit = 10  
  if (!('registered' in user)) user.registered = false  
  if (!user.registered) {
    user.registered = true
    user.name = m.name || m.pushName || 'Usuario'
    user.regTime = Date.now()
    user.age = -1
    user.level = 1
    user.coins = 100
    user.exp = 0
    user.commandCount = 0
    user.stickerCount = 0
    user.msgCount = 0
    user.msgByChat = {}
    user.genre = 'No establecido'
    user.birth = 'No registrado'
    user.desc = 'Sin descripción'
    user.favourite = 'No establecido'
    user.partner = ''
    user.banned = false
    user.prem = false
    user.rpgV2 = true
  }
  if (!('banned' in user)) user.banned = false
  if (!isNumber(user.coins)) user.coins = 0
  ensureRpgUser(user)  

  let chat = global.db.data.chats[m.chat] ||= {}  
  if (!('isBanned' in chat)) chat.isBanned = false  
  if (!('bienvenida' in chat)) chat.bienvenida = true  
  if (!('antiLink' in chat)) chat.antiLink = false  
  if (!('onlyLatinos' in chat)) chat.onlyLatinos = false  
  if (!('nsfw' in chat)) chat.nsfw = false  
  if (!isNumber(chat.expired)) chat.expired = 0  

  const jidBotHandler = jidDeConexion(this)
  let settings = jidBotHandler ? (global.db.data.settings[jidBotHandler] ||= {}) : {}
  if (!('self' in settings)) settings.self = false  
  if (!('autoread' in settings)) settings.autoread = true 
  if (!('autoread' in opts)) opts.autoread = true 
  
  
  if (global.db.data.notes && global.db.data.notes[m.chat]) {
    const ahora = Date.now()
    const longitudOriginal = global.db.data.notes[m.chat].length
    global.db.data.notes[m.chat] = global.db.data.notes[m.chat].filter(nota => nota.expiresAt > ahora)
    const longitudLimpia = global.db.data.notes[m.chat].length
    if (longitudOriginal > longitudLimpia) {
      console.log(`[NOTAS] Se limpiaron ${longitudOriginal - longitudLimpia} notas expiradas en ${m.chat}`)
    }
  }
} catch (e) {  
  console.error(e)  
}  

if (opts['nyimak']) return  
if (!m.fromMe && opts['self']) return  

if (opts['swonly'] && m.chat !== 'status@broadcast') return  
if (typeof m.text !== 'string') m.text = ''  

let _user = global.db.data?.users?.[m.sender]  

const crearIdsOwner = (numero) => {
  const numeroLimpio = String(numero || '').replace(/[^0-9]/g, '')
  if (!numeroLimpio) return []
  return [
    numeroLimpio + '@s.whatsapp.net',
    numeroLimpio + '@lid',
    numeroLimpio + '@hosted.lid'
  ]
}

const listaOwner = Array.isArray(global.owner) ? global.owner : []
const listaOwnerLid = Array.isArray(global.ownerLid) ? global.ownerLid : []
const listaPrems = Array.isArray(global.prems) ? global.prems : []

const numBotActual = String(conn.user?.jid || conn.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '')
const numBotPrincipal = String(global.conn?.user?.jid || global.conn?.user?.id || '').split('@')[0].split(':')[0].replace(/\D/g, '')
const esEsteSubBot = Boolean(numBotActual && numBotPrincipal && numBotActual !== numBotPrincipal)

const todosIdsOwner = [
  // Número de ESTE bot (principal o subbot). Si el socket aún no tiene
  // `user`, simplemente no se añade: los checks de owner darán false en vez
  // de romper el procesamiento del mensaje.
  ...(conn.user?.id ? [conn.decodeJid(conn.user.id)] : []),
  // En subbots: el número del principal también cuenta como owner
  ...(esEsteSubBot && global.conn?.user?.id
    ? [conn.decodeJid(global.conn.user.id)]
    : []),
  ...listaOwner.flatMap((entrada) => {
    const numero = Array.isArray(entrada) ? entrada[0] : entrada
    return crearIdsOwner(numero)
  }),
  ...listaOwnerLid.flatMap((entrada) => {
    const numero = Array.isArray(entrada) ? entrada[0] : entrada
    return crearIdsOwner(numero)
  }),
  // Staff solo de este bot (main ≠ subs)
  ...getStaffOwnerIds(conn)
]

// Baileys 7: m.sender suele ser el PN (participantAlt), mientras ownerLid
// guarda el @lid. Hay que cruzar TODOS los candidatos del mensaje.
const idsRemitente = candidatosJidRemitente(m, this)
const isROwner = jidsSeSolapan(idsRemitente, todosIdsOwner)
const isOwner = isROwner || m.fromMe
const isPrems = isROwner || listaPrems.some(v =>
  jidsSeSolapan(idsRemitente, crearIdsOwner(v))
) || _user?.prem == true  

if (m.isBaileys) return

if (!m.fromMe && estaEnBlackn(m, this)) return  

try {
  trackUserMessage(m, this)
} catch (e) {
  console.error('msg-activity:', e?.message || e)
}

if (!m.fromMe && isStickerMessage(m)) {
  const usuarioDb = global.db.data.users[m.sender]
  if (usuarioDb) trackSentSticker(usuarioDb)
}

let groupMetadata = {}
let participants = []
if (m.isGroup) {
  groupMetadata = (await metadataGrupo(this, m.chat)) || (this.chats[m.chat] || {}).metadata || {}
  participants = groupMetadata.participants || []
}
const rolRemitente = m.isGroup ? await resolverAdminRemitente(participants, m, this, groupMetadata.owner) : null
let user = rolRemitente?.user || {}
let bot = (m.isGroup ? findBotParticipant(participants, this) : null) || {}
let isRAdmin = !!rolRemitente?.isRAdmin
let isAdmin = !!rolRemitente?.isAdmin
let isBotAdmin = isAdminRole(bot?.admin)

if (shouldBlockByGrupoOff(m, this)) return

if (m.isGroup && !isRentalBypassCommand(m, this, isOwner, isROwner)) {
  const alquilerBloqueado = await checkGroupRental(m, this)
  if (alquilerBloqueado) return
}

  
  try {
    if (!global.db.data.muted) global.db.data.muted = {}
    const listaMuteados = m.isGroup ? global.db.data.muted[m.chat] : null
    if (m.isGroup && Array.isArray(listaMuteados) && listaMuteados.length && !m.fromMe) {
    
      const idsRemitente = [
        m.sender,
        m.participant,
        m.key?.participant,
        m.key?.participantAlt,
        m.senderPn,
        m.participantPn,
        m.participantAlt
      ].filter(Boolean).map(String)

      const conjuntoDigitos = new Set(
        listaMuteados.map(j => String(j).split('@')[0].split(':')[0].replace(/\D/g, '')).filter(d => d.length >= 6)
      )
      let golpeMute = idsRemitente.some(id => listaMuteados.includes(id))
      if (!golpeMute) {
        golpeMute = idsRemitente.some(id => {
          const d = String(id).split('@')[0].split(':')[0].replace(/\D/g, '')
          return d.length >= 6 && conjuntoDigitos.has(d)
        })
      }
      if (!golpeMute) {
        const p = findGroupParticipant(participants, m, this)
        if (p) {
          const idsParticipante = [p.id, p.jid, p.lid, p.phoneNumber]
            .filter(Boolean)
            .map(v => {
              const s = String(v)
              if (s.includes('@')) return s
              if (String(p.lid) === s || /lid/i.test(s)) return `${s.replace(/\D/g, '')}@lid`
              return `${s.replace(/\D/g, '')}@s.whatsapp.net`
            })
          golpeMute = idsParticipante.some(id => listaMuteados.includes(id)) ||
            idsParticipante.some(id => {
              const d = String(id).split('@')[0].split(':')[0].replace(/\D/g, '')
              return d.length >= 6 && conjuntoDigitos.has(d)
            })
        }
      }

      if (golpeMute) {
        try {
          await this.sendMessage(m.chat, { delete: m.key })
        } catch (err) {
          console.error('Error deleting message from muted user:', err)
        }
        return
      }
    }
  } catch (err) {
    console.error('Error processing muted list:', err)
  }

  
  try {
    await handleAntiMediaEarly(m, this, isAdmin, participants)
  } catch (e) {
    console.error('Error en handleAntiMediaEarly:', e?.message || e)
  }

const ___dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), './plugins')  

let usedPrefix = '.'  


let comandoEjecutado = false


const { lista: pluginsProcesados, conAll, comandos, pluginsAntesSesion } = pluginsEnCache()
const comandosOcultos = comandosOcultosPremium()

for (const plugin of pluginsAntesSesion) {
  try {
    await plugin.handler.before.call(this, m, {
      conn: this,
      participants,
      groupMetadata,
      user,
      bot,
      isROwner,
      isOwner,
      isRAdmin,
      isAdmin,
      isBotAdmin,
      isPrems,
      chatUpdate,
      __dirname: ___dirname,
      __filename
    })
    if (m.commandExecuted) break
  } catch (e) {
    console.error(`Error en handler.before de ${plugin.name}:`, e)
  }
}

for (const plugin of conAll) {
  const __filename = join(___dirname, plugin.name)
  try {
    await plugin.all.call(this, m, {
      conn: this,
      participants,
      groupMetadata,
      user,
      bot,
      isROwner,
      isOwner,
      isRAdmin,
      isAdmin,
      isBotAdmin,
      isPrems,
      chatUpdate,
      __dirname: ___dirname,
      __filename
    })
  } catch (e) {
    console.error(`Error en plugin.all de ${plugin.name}:`, e)
  }
}

if (textoPuedeSerComando(m, isOwner, isROwner, comandos)) {
// Saldo antes de ejecutar: si un juego lo aumenta, la comisión de pareja
// (/comi) mueve el % al partner. Se calcula por delta, sin tocar cada plugin.
const saldoCoinsAntes = Number(global.db.data?.users?.[m.sender]?.coins) || 0
for (let plugin of pluginsCandidatosComando(m.text, this, m, isOwner, isROwner, pluginsEnCache())) {
  const __filename = join(___dirname, plugin.name)

  
  if (!opts['restrict']) {
    if (plugin.tags && plugin.tags.includes('admin')) continue
  }

  
  const escaparRegex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')
  let _prefix = plugin.customPrefix ? plugin.customPrefix : conn.prefix ? conn.prefix : global.prefix
  
  let match = (_prefix instanceof RegExp ?
    [[_prefix.exec(m.text), _prefix]] :
    Array.isArray(_prefix) ?
      _prefix.map(p => {
        let re = p instanceof RegExp ? p : new RegExp(escaparRegex(p))
        return [re.exec(m.text), re]
      }) :
      typeof _prefix === 'string' ?
        [[new RegExp(escaparRegex(_prefix)).exec(m.text), new RegExp(escaparRegex(_prefix))]] :
        [[[], new RegExp]]
  ).find(p => p[1] && p[0])

  // prefijo o sin 
  let coincidenciaPrefijo, sinPrefijo, textoComando, args, command
  if (!match) {
    const grupoPermiteSinPrefijo = m.isGroup && global.db?.data?.antiprefijo && global.db.data.antiprefijo[m.chat] === true
    if (!isOwner && !isROwner && !grupoPermiteSinPrefijo) continue
    
    sinPrefijo = (m.text || '').trim()
    if (!sinPrefijo) continue
    ;[textoComando, ...args] = sinPrefijo.split(/\s+/)
    command = textoComando?.toLowerCase()
    
    const esCoincideSinPrefijo = plugin.command && plugin.command.some(cmd => {
      if (typeof cmd === 'string') return command === cmd.toLowerCase()
      if (cmd instanceof RegExp) return cmd.test(command)
      return false
    })
    if (!esCoincideSinPrefijo) continue
    coincidenciaPrefijo = ['']
  } else {
    coincidenciaPrefijo = match[0]
    sinPrefijo = m.text.slice(coincidenciaPrefijo[0].length).trim()
    ;[textoComando, ...args] = sinPrefijo.split(/\s+/)
    command = textoComando?.toLowerCase()
  }

 
  const esComandoCoincide = plugin.command && plugin.command.some(cmd => {
    if (typeof cmd === 'string') {
      return command === cmd.toLowerCase()
    } else if (cmd instanceof RegExp) {
      return cmd.test(command)
    }
    return false
  })

  if (esComandoCoincide) {
    // Premium puede ocultar comandos solo para este sub-bot. No se desactiva
    // el plugin global: simplemente se ignora aquí y no se ejecuta.
    if (comandosOcultos.has(String(command || '').toLowerCase())) {
      comandoEjecutado = true
      m.commandExecuted = true
      break
    }
    
  
    if (m.isGroup && global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        
        continue
      }
    }
    
    const comandosPrivadosPermitidos = ['qr', 'code', 'setbotname', 'setbotimg', 'setautoread', 'delsession', 'delssesion', 'deletesession', 'eliminarsesion', 'delsub', 'borrarsesion', 'logoutbot']
    if (!m.isGroup && !comandosPrivadosPermitidos.includes(command) && !isOwner) {
      return 
    }
    
    if (m.isGroup && global.db.data.botGroups && global.db.data.botGroups[m.chat] === false) {
      if (command !== 'grupo') return
    }

    if (await checkCmd18Command(m, this, command, coincidenciaPrefijo[0] || usedPrefix, isOwner, isROwner)) {
      continue
    }

    if (await verificarComandoJuegos(m, this, plugin, plugin.name, coincidenciaPrefijo[0] || usedPrefix, isOwner, isROwner)) {
      comandoEjecutado = true
      m.commandExecuted = true
      continue
    }

    if (plugin.group && !m.isGroup) {
      comandoEjecutado = true
      m.commandExecuted = true
      avisarPermiso('group', m, this)
      continue
    }
    if (plugin.rowner && !isROwner) {
      comandoEjecutado = true
      m.commandExecuted = true
      avisarPermiso('rowner', m, this)
      continue
    }
    if (plugin.owner && !isOwner && !isROwner) {
      comandoEjecutado = true
      m.commandExecuted = true
      avisarPermiso('owner', m, this)
      continue
    }
    if (
      m.isGroup &&
      ((plugin.admin && !isAdmin && !isOwner && !isROwner) ||
        (plugin.botAdmin && !isBotAdmin))
    ) {
      const metadataActualizada = await metadataGrupo(this, m.chat, { esperar: true })
      if (metadataActualizada?.participants?.length) {
        groupMetadata = metadataActualizada
        participants = metadataActualizada.participants
        const rolActual = await resolverAdminRemitente(participants, m, this, groupMetadata.owner)
        user = rolActual.user
        bot = await findCurrentBotParticipant(this, participants) || {}
        isRAdmin = rolActual.isRAdmin
        isAdmin = rolActual.isAdmin
        isBotAdmin = isAdminRole(bot?.admin)
      }
    }
    if (plugin.admin && m.isGroup && !isAdmin && !isOwner && !isROwner) {
      comandoEjecutado = true
      m.commandExecuted = true
      avisarPermiso('admin', m, this)
      continue
    }
    if (plugin.botAdmin && m.isGroup && !isBotAdmin) {
      comandoEjecutado = true
      m.commandExecuted = true
      avisarPermiso('botAdmin', m, this)
      continue
    }

    const esComandoJuego = (Array.isArray(plugin.tags) && plugin.tags.some((tag) =>
      /^(juegos?|econom[ií]a|rpg)$/i.test(String(tag))
    )) || /^rpg[-_]/i.test(plugin.name)
    const idMensaje = String(m.key?.id || m.id || '')
    let reclamoJuegoAdquirido = false
    const usaReclamoEconomicoAtomico = [
      'daily', 'day', 'diario', 'crimen', 'crime'
    ].includes(command)
    if (esComandoJuego && idMensaje && !usaReclamoEconomicoAtomico) {
      const claimKey = `game:${m.chat}:${idMensaje}`
      try {
        const adquirido = await global.db.adapter.claimCommand(global.db.data, claimKey)
        if (!adquirido) {
          comandoEjecutado = true
          m.commandExecuted = true
          continue
        }
      } catch (error) {
        console.error('[game] No se pudo bloquear la ejecución duplicada:', error?.message || error)
        comandoEjecutado = true
        m.commandExecuted = true
        await m.reply('No pude verificar si este comando ya fue ejecutado. Inténtalo de nuevo en unos segundos.')
        continue
      }
      reclamoJuegoAdquirido = true
    }
    
    comandoEjecutado = true
    try {
      await plugin.handler.call(this, m, {
        match,
        conn: this,
        participants,
        groupMetadata,
        user,
        bot,
        isROwner,
        isOwner,
        isRAdmin,
        isAdmin,
        isBotAdmin,
        isPrems,
        chatUpdate,
        __dirname: ___dirname,
        __filename,
        usedPrefix: coincidenciaPrefijo[0],
        command,
        args,
        text: args.join(' ').trim()
      })
       m.plugin = plugin.name
       m.command = command
       m.args = args
       if (m.error == null) {
         registrarComandoGlobal(command, m.chat, this)
       }

      if (m.error == null && !m.rpgAwarded) {
        const usuarioDb = global.db.data.users[m.sender]
        const idProgreso = String(m.key?.id || m.id || '')
        let reclamarProgreso = Boolean(usuarioDb)
        if (reclamarProgreso && idProgreso && !reclamoJuegoAdquirido) {
          try {
            reclamarProgreso = await global.db.adapter.claimCommand(
              global.db.data,
              `rpg-progress:${m.chat}:${idProgreso}`
            )
          } catch (error) {
            reclamarProgreso = false
            console.error('[rpg] No se pudo reservar la experiencia de este mensaje:', error?.message || error)
          }
        }
        if (usuarioDb && reclamarProgreso) {
          const esSticker = Array.isArray(plugin.tags) && plugin.tags.includes('stickers')
          m.rpgProgress = awardCommandProgress(usuarioDb, { isSticker: esSticker })
          m.rpgAwarded = true
        }
      }
    } catch (e) {
      m.error = e
      console.error(`Error ejecutando plugin ${plugin.name}:`, e)
    }
  }
  // Hook de comisión de pareja: solo juegos que aumentaron el saldo
  // (banco/préstamos/transferencias están excluidos en COMANDOS_SIN_COMISION).
  if (comandoEjecutado && !m.error && m.plugin && m.command &&
      !COMANDOS_SIN_COMISION.has(String(m.command).toLowerCase())) {
    try {
      const defEjecutado = global.plugins?.[m.plugin]
      if (defEjecutado && esPluginJuegos(defEjecutado, m.plugin)) {
        const saldoAhora = Number(global.db.data?.users?.[m.sender]?.coins) || 0
        const ganado = saldoAhora - saldoCoinsAntes
        if (ganado > 0) {
          await aplicarComisionPareja(m.sender, ganado, this, m.chat, m)
        }
      }
    } catch (e) {
      console.error('[comi] Hook central:', e?.message || e)
    }
  }
}
}

if (comandoEjecutado && global.db.data?.users?.[m.sender]) {
  try {
    const cobro = cobrarPrestamoSiToca(global.db.data.users[m.sender])
    if (cobro?.tomado > 0) {
      await this.sendMessage(m.chat, {
        text: textoCobro(this, cobro),
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }, { quoted: m }).catch(() => {})
    }
  } catch (e) {
    console.error('Cobro de prestamo:', e)
  }
}

// Cierre perezoso de lotería: si el sorteo del grupo venció, lo cierra el
// bot presente (con claim anti-duplicado entre procesos). Barato si no venció.
if (m.isGroup) {
  try {
    const { maybeCerrarSorteo } = await import('./lib/loteria.js')
    await maybeCerrarSorteo(this, m.chat)
  } catch {}
}

if (m.rpgProgress?.leveled) {
  const rpg = m.rpgProgress
  await this.sendMessage(m.chat, {
    text: formatLevelUpMessage(rpg),
    contextInfo: { ...(global.rcanal?.contextInfo || {}) }
  }, { quoted: m }).catch(() => {})
}



if (m.text && !comandoEjecutado && global.db.data.adivinanzasActivas && global.db.data.adivinanzasActivas[m.chat]) {
  if (juegosBloqueadosEn(m.chat, { isOwner, isROwner })) return

  if (m.isGroup && global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
    if (!isAdmin && !isOwner && !isROwner) {
      return 
    }
  }
  
  const adivinanzaActiva = global.db.data.adivinanzasActivas[m.chat]
  
  
  if (adivinanzaActiva.activa && !adivinanzaActiva.respondida) {
    const tiempoTranscurrido = Date.now() - adivinanzaActiva.timestamp
    const tiempoLimite = 60 * 1000 
    
    
    if (tiempoTranscurrido > tiempoLimite) {
      adivinanzaActiva.activa = false
      adivinanzaActiva.respondida = true
      
      await this.sendMessage(m.chat, {
        text: tr(this,
          `👻 𝗔𝗱𝗶𝘃𝗶𝗻𝗮𝗻𝘇𝗮 𝗲𝘅𝗽𝗶𝗿𝗮𝗱𝗮\n\n> *Respuesta:* ${adivinanzaActiva.respuesta}\n> Nadie pudo adivinarla.`,
          `👻 𝗥𝗶𝗱𝗱𝗹𝗲 𝗲𝘅𝗽𝗶𝗿𝗲𝗱\n\n> *Answer:* ${adivinanzaActiva.respuesta}\n> Nobody guessed it.`,
          `👻 𝗔𝗱𝗶𝘃𝗶𝗻𝗵𝗮 𝗲𝘅𝗽𝗶𝗿𝗮𝗱𝗮\n\n> *Resposta:* ${adivinanzaActiva.respuesta}\n> Ninguém acertou.`
        ),
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
      
      return
    }
    
  
    const lista = Array.isArray(adivinanzaActiva.respuestas) && adivinanzaActiva.respuestas.length
      ? adivinanzaActiva.respuestas
      : [adivinanzaActiva.respuesta]
    if (coincideRespuesta(m.text, lista)) {
     
      adivinanzaActiva.activa = false
      adivinanzaActiva.respondida = true
      adivinanzaActiva.ganador = m.sender
      
    
      let user = global.db.data.users[m.sender]
      if (!user) global.db.data.users[m.sender] = {}
      
      const premio = Math.floor(Math.random() * (500 - 250 + 1)) + 250
      user.coins = (user.coins || 0) + premio
      await aplicarComisionPareja(m.sender, premio, this, m.chat, m)
      
      await this.sendMessage(m.chat, {
        text: tr(this,
          ` 🎉 𝗧𝗲𝗻𝗲𝗺𝗼𝘀 𝘂𝗻 𝗴𝗮𝗻𝗮𝗱𝗼𝗿 🎉\n\n> *Ganador:* @${m.sender.split('@')[0]}\n> *Respuesta:* ${adivinanzaActiva.respuesta}\n> *Premio:* +${premio} ${global.moneda}\n> *Total:* ${user.coins} ${global.moneda}`,
          ` 🎉 𝗪𝗲 𝗵𝗮𝘃𝗲 𝗮 𝘄𝗶𝗻𝗻𝗲𝗿 🎉\n\n> *Winner:* @${m.sender.split('@')[0]}\n> *Answer:* ${adivinanzaActiva.respuesta}\n> *Prize:* +${premio} ${global.moneda}\n> *Total:* ${user.coins} ${global.moneda}`,
          ` 🎉 𝗧𝗲𝗺𝗼𝘀 𝘂𝗺 𝘃𝗲𝗻𝗰𝗲𝗱𝗼𝗿 🎉\n\n> *Vencedor:* @${m.sender.split('@')[0]}\n> *Resposta:* ${adivinanzaActiva.respuesta}\n> *Prémio:* +${premio} ${global.moneda}\n> *Total:* ${user.coins} ${global.moneda}`
        ),
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender]
        }
      }, { quoted: m })
      
      return
    }
  }
}


  
  await handleModoDescargas(m, this, comandoEjecutado)
  await handleAntiSystems(m, this, isAdmin, isOwner, isRAdmin, isBotAdmin, isPrems, comandoEjecutado, participants)

  await handleGroupEvents(m, this, isAdmin, isBotAdmin, isOwner, participants)

  
  if (m.isGroup && global.pendingInvites && global.pendingInvites[m.chat] && !comandoEjecutado) {
    if (juegosBloqueadosEn(m.chat, { isOwner, isROwner })) return

    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        return 
      }
    }
    
    const invitacion = global.pendingInvites[m.chat]

    if (!isInviteOpponent(m, invitacion, this, participants)) return

    const mensaje = m.text?.toLowerCase().trim()

    if (mensaje === 'si' || mensaje === 'sí' || mensaje === 'yes' || mensaje === 'acepto') {
      try {
        let modulo
        if (invitacion.type === 'miner') modulo = await import(`./lib/logic-miner.js`)
        else if (invitacion.type === 'bomba') modulo = await import(`./lib/logic-bomba.js`)
        else modulo = await import(`./plugins/rpg-michi.js`)
        const { acceptInvite } = modulo
        return acceptInvite.call(this, m, this, invitacion, participants)
      } catch (e) {
        console.error('Error al aceptar invitación:', e)
      }
    } else if (mensaje === 'no' || mensaje === 'rechazo' || mensaje === 'rechazar') {
      try {
        let modulo
        if (invitacion.type === 'miner') modulo = await import(`./lib/logic-miner.js`)
        else if (invitacion.type === 'bomba') modulo = await import(`./lib/logic-bomba.js`)
        else modulo = await import(`./plugins/rpg-michi.js`)
        const { rejectInvite } = modulo
        return rejectInvite.call(this, m, this, invitacion)
      } catch (e) {
        console.error('Error al rechazar invitación:', e)
      }
    }
  }

  if (m.isGroup && global.games && global.games[m.chat] && global.games[m.chat].type === 'tictactoe' && !comandoEjecutado) {
    if (juegosBloqueadosEn(m.chat, { isOwner, isROwner })) return

    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        return 
      }
    }
    
    const datosJuego = global.games[m.chat]
    const game = datosJuego.game

    
    if (!datosJuego.players.includes(m.sender)) return

    
    if (!game.gameActive) return

    
    const mensaje = m.text?.trim()
    if (!mensaje || !/^[1-9]$/.test(mensaje)) return

    const posicion = parseInt(mensaje)

    try {
      
      const { handleGameEnd } = await import(`./plugins/rpg-michi.js`)

      
      const resultado = game.makeMove(posicion, m.sender)

      if (!resultado.success) {
        
        return this.sendMessage(m.chat, {
          text: `𝗧𝗲𝗻𝗲𝗺𝗼𝘀 𝘂𝗻 𝗲𝗿𝗿𝗼𝗿:  
  𓂃 ࣪ ִֶָ☾.  ${resultado.message}`,
          contextInfo: {
            ...rcanal.contextInfo
          }
        }, { quoted: m })
      }

      
      game.startInactivityTimeout((cancelledGame) => {
        if (global.games && global.games[m.chat] && global.games[m.chat].type === 'tictactoe') {
          handleGameEnd(m, this, cancelledGame, 'timeout')
        }
      })

      if (resultado.finished) {
        
        return handleGameEnd(m, this, game, resultado.winner ? 'finished' : 'draw')
      } else {
        const siguienteJugador = game.currentPlayer
        const siguienteSimbolo = game.currentPlayer === game.player1 ? '❌' : '⭕'
        const leyenda = `Movimiento realizado\n\nTurno de @${siguienteJugador.split('@')[0]} (${siguienteSimbolo})\nResponde con el numero 1-9`

        return sendMichiBoard(this, m.chat, game, {
          quoted: m,
          caption: leyenda,
          mentionedJid: [siguienteJugador],
          status: 'playing',
        })
      }

    } catch (e) {
      console.error('Error procesando movimiento de 3 en raya:', e)
      return this.sendMessage(m.chat, {
        text: `[❌ Error al procesar el movimiento.`,
        contextInfo: {
          ...rcanal.contextInfo
        }
      }, { quoted: m })
    }
  }

  // Miner game moves
  if (m.isGroup && global.games && global.games[m.chat] && global.games[m.chat].type === 'miner' && !comandoEjecutado) {
    if (juegosBloqueadosEn(m.chat, { isOwner, isROwner })) return
    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) {
        return 
      }
    }

    const datosJuego = global.games[m.chat]
    const game = datosJuego.game
    if (!datosJuego.players.includes(m.sender)) return
    if (!game?.gameActive) return

    const mensaje = m.text?.trim()
    if (!mensaje || !/^[0-9]+$/.test(mensaje)) return

    try {
      const modulo = await import(`./lib/logic-miner.js`)
      const saldoMinerAntes = Number(global.db.data?.users?.[m.sender]?.coins) || 0
      await modulo.handleMove.call(this, m, this, datosJuego)
      const ganadoMiner = (Number(global.db.data?.users?.[m.sender]?.coins) || 0) - saldoMinerAntes
      if (ganadoMiner > 0) {
        await aplicarComisionPareja(m.sender, ganadoMiner, this, m.chat, m)
      }
    } catch (e) {
      console.error('Error procesando movimiento miner:', e)
      return this.sendMessage(m.chat, { text: '[❌] Error al procesar el movimiento.', contextInfo: { ...rcanal.contextInfo } }, { quoted: m })
    }
  }

  // Bomba game moves (botones interactivos o numero 1-10)
  if (m.isGroup && global.games && global.games[m.chat] && global.games[m.chat].type === 'bomba' && !comandoEjecutado) {
    if (juegosBloqueadosEn(m.chat, { isOwner, isROwner })) return
    if (global.db.data.soloAdmin && global.db.data.soloAdmin[m.chat] === true) {
      if (!isAdmin && !isOwner && !isROwner) return
    }

    try {
      const modulo = await import(`./lib/logic-bomba.js`)
      await modulo.handleMove(m, this, global.games[m.chat], participants)
    } catch (e) {
      console.error('Error procesando movimiento bomba:', e)
    }
  }

global.dfail = (type, m, conn) => {
  const lang = idiomaDe(conn)
  const textos = {
    en: {
      rowner: `𓂃 ࣪ ִֶָ☾.  This command can only be used by the bot *creator*.`,
      owner: `𓂃 ࣪ ִֶָ☾.  This command can only be used by the bot *creator* and *sub-bots*.`,
      mods: `𓂃 ࣪ ִֶָ☾.  This command can only be used by bot *moderators*.`,
      premium: `𓂃 ࣪ ִֶָ☾.  This command can only be used by *premium* users.`,
      group: `𓂃 ࣪ ִֶָ☾.  This command can only be used in *groups*.`,
      private: `𓂃 ࣪ ִֶָ☾.  This command can only be used in my *private* chat.`,
      admin: `𓂃 ࣪ ִֶָ☾.  This command can only be used by group *admins*.`,
      botAdmin: `𓂃 ࣪ ִֶָ☾.  The bot must be a group *admin* to run this command.`,
      unreg: `𓂃 ࣪ ִֶָ☾.  You need to be *registered* to use this command.`,
      restrict: `𓂃 ࣪ ִֶָ☾.  This feature is *disabled*.`
    },
    pt: {
      rowner: `𓂃 ࣪ ִֶָ☾.  Olá, este comando só pode ser usado pelo *criador* do bot.`,
      owner: `𓂃 ࣪ ִֶָ☾.  Olá, este comando só pode ser usado pelo *criador* do bot e pelos *sub-bots*.`,
      mods: `𓂃 ࣪ ִֶָ☾.  Olá, este comando só pode ser usado pelos *moderadores* do bot.`,
      premium: `𓂃 ࣪ ִֶָ☾.  Olá, este comando só pode ser usado por usuários *premium*.`,
      group: `𓂃 ࣪ ִֶָ☾.  Olá, este comando só pode ser usado em *grupos*.`,
      private: `𓂃 ࣪ ִֶָ☾.  Olá, este comando só pode ser usado no meu chat *privado*.`,
      admin: `𓂃 ࣪ ִֶָ☾.  Olá, este comando só pode ser usado pelos *administradores* do grupo.`,
      botAdmin: `𓂃 ࣪ ִֶָ☾.  Olá, o bot tem de ser *administrador* para usar este comando.`,
      unreg: `𓂃 ࣪ ִֶָ☾.  Olá, para usar este comando tens de estar *registado*.`,
      restrict: `𓂃 ࣪ ִֶָ☾.  Olá, esta função está *desativada*.`
    },
    es: {
      rowner: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por el *Creador* de la Bot.`,
      owner: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por el *Creador* de la Bot y *Sub Bots*.`,
      mods: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por los *Moderadores* de la Bot.`,
      premium: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por Usuarios *Premium*.`,
      group: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado en *Grupos*.`,
      private: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado en mi Chat *Privado*.`,
      admin: `𓂃 ࣪ ִֶָ☾.  Hola, este comando solo puede ser utilizado por los *Administradores* del Grupo.`,
      botAdmin: `𓂃 ࣪ ִֶָ☾.  El bot debe ser *admin* para ejecutar este comando.`,
      unreg: `𓂃 ࣪ ִֶָ☾.  Hola, para usar este comando debes estar *Registrado.*`,
      restrict: `𓂃 ࣪ ִֶָ☾.  Hola, esta característica está *deshabilitada.*`
    }
  }
  const msg = (textos[lang] || textos.es)[type]
  if (msg) return conn.reply(m.chat, msg, m, rcanal)
}

} catch (e) {
console.error(e)
} finally {
let user, stats = global.db.data.stats  
if (m) {  
  if (m.sender && (user = global.db.data.users[m.sender])) {  
    if (m.limit) user.limit -= m.limit * 1  
  }  

  let stat  
  if (m.plugin) {  
    let now = +new Date  
    stat = stats[m.plugin] ||= {  
      total: 0,  
      success: 0,  
      last: 0,  
      lastSuccess: 0  
    }  
    stat.total += 1  
    stat.last = now  
    if (m.error == null) {  
      stat.success += 1  
      stat.lastSuccess = now  
    }  
  }  
}  

try {  
  if (!opts['noprint']) {
    if (!imprimirMensaje) imprimirMensaje = (await import(`./lib/print.js`)).default
    void imprimirMensaje(m, this)
  }
} catch (e) {  
  console.log(m, m.quoted, e)  
}  

const jidBotLectura = jidDeConexion(this)
const numeroBotLectura = numeroDeJid(jidBotLectura)
const numeroPrincipalLectura = numeroDeJid(jidDeConexion(global.conn))
const esSubBot = Boolean(
  numeroBotLectura && numeroPrincipalLectura && numeroBotLectura !== numeroPrincipalLectura
)
const ajustesLectura = (jidBotLectura && global.db.data.settings[jidBotLectura]) || {}
// Sin `user` todavía no se puede decidir el modo; no se marca como leído a
// ciegas. En cuanto el socket complete el registro, el siguiente mensaje ya
// usa la configuración real.
let debeAutoLeer = Boolean(numeroBotLectura) && !esSubBot

if (esSubBot) {
  try {
    const ahora = Date.now()
    if (this._autoReadHasta && ahora < this._autoReadHasta) {
      debeAutoLeer = this._autoReadCache === true
    } else {
      debeAutoLeer = false
      const numeroBot = String(this.user?.jid || '').split('@')[0].replace(/\D/g, '')
      const rutas = [
        this.pathAYBot ? join(this.pathAYBot, 'config.json') : '',
        numeroBot ? `./Serbot/${numeroBot}/config.json` : ''
      ].filter(Boolean)
      for (const rutaConfig of rutas) {
        let contenido
        try {
          contenido = await readFile(rutaConfig, 'utf-8')
        } catch (error) {
          if (error?.code === 'ENOENT') continue
          throw error
        }
        const config = JSON.parse(contenido)
        debeAutoLeer = config.autoRead === true
        break
      }
      this._autoReadCache = debeAutoLeer
      this._autoReadHasta = ahora + 30000
    }
  } catch (error) {
    debeAutoLeer = false
    console.error('Error leyendo configuración de auto-leer:', error)
  }
} else {
  try {
    const claveBot = this.user?.jid || this.decodeJid(this.user?.id)
    const settings = claveBot && global.db?.data?.settings?.[claveBot]
    if (settings?.autoread === false) {
      debeAutoLeer = false
    }
  } catch (error) {
    console.error('Error leyendo visto del bot principal:', error)
  }
}

const idMensaje = m.id || m.key?.id
const saltarAutoLeer = isKnownViewOnce(idMensaje) || isViewOnceCandidate(m)

if (debeAutoLeer && !saltarAutoLeer && m.key) {
  try {
    void this.readMessages([m.key]).catch(() => {})
  } catch (e) {
    console.error('Error al marcar como leído:', e)
  }
}

await handleAIModes(m, this)

}
}
