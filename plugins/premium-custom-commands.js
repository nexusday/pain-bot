import { extraerComandoDelTexto } from '../lib/bot-groups.js'
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  comandosPersonalizadosPremium,
  guardarComandosPersonalizados,
  interpolarComandoPremium,
  premiumDeTelefono,
  establecerComandoPremium,
  telefonoDeConexion,
} from '../lib/premium.js'

const COMANDOS_PROHIBIDOS = new Set([
  'addcmd', 'delcmd', 'cmds', 'exec', 'eval', 'shell', 'owner', 'mod', 'ban', 'kick',
  'promote', 'demote', 'close', 'open', 'rab', 'grupo', 'update', 'restart', 'delsession',
])

function respuestaAyuda(p) {
  return `🌴 𝗖𝗼𝗺𝗮𝗻𝗱𝗼𝘀 𝗣𝗿𝗲𝗺𝗶𝘂𝗺\n\n> ${p}addcmd nombre | instrucción\n> ${p}addcmd foto | imagen https://sitio.com/imagen.jpg\n> ${p}cmds\n> ${p}delcmd nombre\n\nSolo se permiten respuestas simples de texto o imagen. No se ejecuta código.`
}

function guardarLista(lista) {
  return guardarComandosPersonalizados(lista.slice(0, 50))
}

function imagenParaWhatsApp(valor) {
  const texto = String(valor || '')
  const coincidencia = texto.match(/^data:image\/[^;]+;base64,(.+)$/i)
  return coincidencia ? Buffer.from(coincidencia[1], 'base64') : { url: texto }
}

const pluginsCargados = new Map()

async function ejecutarPluginReal(item, m, data) {
  if (!item.plugin) return false
  const telefono = telefonoDeConexion(data.conn)
  const archivo = path.join(process.cwd(), global.bot || 'Serbot', telefono, item.plugin)
  try {
    const mtime = fs.statSync(archivo).mtimeMs
    let cacheado = pluginsCargados.get(archivo)
    if (!cacheado || cacheado.mtime !== mtime) {
      const importado = await import(`${pathToFileURL(archivo).href}?premium=${mtime}`)
      cacheado = { mtime, modulo: importado.default || importado }
      pluginsCargados.set(archivo, cacheado)
    }
    const modulo = cacheado.modulo
    if (typeof modulo === 'function') await modulo(m, data)
    else if (typeof modulo?.handler === 'function') await modulo.handler(m, data)
    return true
  } catch (error) {
    console.error('[premium-plugin]', item.name, error?.message || error)
    return false
  }
}

const handler = async (m, { conn, text, usedPrefix, isOwner, isROwner, command }) => {
  const premium = premiumDeTelefono(telefonoDeConexion(conn))
  if (!premium.activo) return m.reply('❗ Necesitas Premium activo para usar comandos personalizados.')
  if (!isOwner && !isROwner) return m.reply('❗ Solo el dueño o staff autorizado puede configurar este sub-bot.')
  const lista = comandosPersonalizadosPremium()
  const entrada = String(text || '').trim()

  if (command === 'cmds' || !entrada) {
    if (!lista.length) return m.reply(`🌴 𝗖𝗼𝗺𝗮𝗻𝗱𝗼𝘀 𝗣𝗿𝗲𝗺𝗶𝘂𝗺\n\n> No tienes comandos personalizados.\n> Usa ${usedPrefix}addcmd nombre | instrucción`)
    return m.reply(`🌴 𝗖𝗼𝗺𝗮𝗻𝗱𝗼𝘀 𝗣𝗿𝗲𝗺𝗶𝘂𝗺\n\n${lista.map((item, i) => `> ${i + 1}. ${usedPrefix}${item.name}`).join('\n')}`)
  }

  if (command === 'delcmd') {
    const nombre = entrada.toLowerCase().replace(/^[./!#]/, '').trim()
    const siguiente = lista.filter((item) => item.name !== nombre)
    if (siguiente.length === lista.length) return m.reply(`❗ No existe el comando *${nombre}*.`)
    guardarLista(siguiente)
    return m.reply(`✅ Comando *${nombre}* eliminado de este sub-bot.`)
  }

  const partes = entrada.split('|').map((v) => v.trim())
  if (partes.length < 2 || !partes[0] || !partes[1]) return m.reply(respuestaAyuda(usedPrefix))
  const nombre = partes.shift().toLowerCase().replace(/^[./!#]/, '')
  if (!/^[a-záéíóúñ][\wáéíóúñ-]{1,30}$/i.test(nombre) || COMANDOS_PROHIBIDOS.has(nombre)) {
    return m.reply('❗ Nombre no válido o reservado. Usa un nombre simple, por ejemplo: saludo, reglas o foto.')
  }
  if (lista.some((item) => item.name === nombre)) return m.reply(`❗ El comando *${nombre}* ya existe. Usa ${usedPrefix}delcmd ${nombre} primero.`)

  const pedido = partes.join(' | ').trim()
  let item = { name: nombre, response: '' }
  if (/^imagen\s+/i.test(pedido)) {
    const imagenPartes = pedido.replace(/^imagen\s+/i, '').split('|').map((v) => v.trim())
    const imagen = imagenPartes.shift() || ''
    if (!/^https?:\/\/[^\s]+$/i.test(imagen)) return m.reply('❗ La imagen debe ser una URL http(s) directa.')
    item.image = imagen.slice(0, 500)
    item.response = imagenPartes.join(' | ').slice(0, 2000)
  } else {
    if (pedido.length > 500) return m.reply('❗ La instrucción no puede superar 500 caracteres.')
    await m.reply('⏳ La IA está preparando la respuesta de tu comando…')
    try {
      const { llamarApiGemini } = await import('../lib/geminiAPI.js')
      const generado = await llamarApiGemini(
        `Crea únicamente el texto final que responderá un comando de WhatsApp llamado ${nombre}. Instrucción del dueño: ${pedido}. No uses código, enlaces ni explicaciones. Máximo 1200 caracteres.`,
        m.name || 'Usuario',
        'Sub-bot Premium',
        m.chat,
      )
      item.response = String(generado || '').trim().slice(0, 2000)
    } catch (error) {
      console.error('[premium-cmd] IA:', error?.message || error)
      return m.reply('❌ No pude generar la respuesta. Inténtalo nuevamente.')
    }
  }
  if (!item.response && !item.image) return m.reply('❗ El comando necesita una respuesta o una imagen.')
  guardarLista([...lista, item])
  return m.reply(`✅ Comando *${nombre}* creado solo para este sub-bot.\n> Úsalo con ${usedPrefix}${nombre}`)
}

handler.command = ['addcmd', 'cmds', 'delcmd', 'comandospremium']
handler.tags = ['subbots']
handler.help = ['addcmd nombre | instrucción', 'cmds', 'delcmd nombre']
handler.owner = true
handler.all = async function (m, { conn }) {
  if (!m?.text || m.commandExecuted) return
  const nombre = extraerComandoDelTexto(m.text, conn?.prefix || global.prefix)
  if (!nombre || ['addcmd', 'cmds', 'delcmd', 'comandospremium'].includes(nombre)) return
  const item = comandosPersonalizadosPremium().find((actual) => actual.name === nombre)
  if (!item) return
  m.commandExecuted = true
  m.plugin = 'premium-custom-commands.js'
  m.command = nombre
  establecerComandoPremium(nombre)
  if (await ejecutarPluginReal(item, m, { conn, text: '', usedPrefix: conn.prefix || global.prefix, command: nombre })) return
  const respuesta = interpolarComandoPremium(`${item.prefix || ''}${item.response || ''}${item.suffix || ''}`, { usuario: m.pushName || 'Usuario', grupo: m.chat, fecha: new Date().toLocaleDateString('es'), hora: new Date().toLocaleTimeString('es'), bot: conn.user?.name || 'PAIN BOT' })
  if (item.image) {
    await conn.sendMessage(m.chat, { image: imagenParaWhatsApp(item.image), caption: respuesta }, { quoted: m })
  } else {
    await conn.sendMessage(m.chat, { text: respuesta }, { quoted: m })
  }
}

export default handler
