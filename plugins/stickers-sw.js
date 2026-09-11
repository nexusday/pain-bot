import sharp from '../lib/sharp.js'
import fetch from 'node-fetch'
import { readFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { addExif } from '../lib/sticker.js'
import { resolveStickerMeta } from './stickers-sticker.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(__dirname, '../lib/fonts')
const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72'

let notoRegularBase64 = null
const cachePngEmoji = new Map()
const segmentadorGrafemas = typeof Intl !== 'undefined' && Intl.Segmenter
  ? new Intl.Segmenter('und', { granularity: 'grapheme' })
  : null

const SIZE = 512
const AVATAR_SIZE = 132
const AVATAR_X = 36
const TEXT_X = 188
const BUBBLE_MAX_WIDTH = 292
const BUBBLE_PAD_X = 18
const BUBBLE_PAD_Y = 14
const TEXT_AREA_WIDTH = BUBBLE_MAX_WIDTH - BUBBLE_PAD_X * 2
const MAX_MSG = 120
const MAX_LINES = 6

function escaparXml(texto) {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cargarNotoBase64() {
  if (notoRegularBase64 !== null) return notoRegularBase64

  const rutaArchivo = join(FONTS_DIR, 'NotoSans-Regular.ttf')
  notoRegularBase64 = existsSync(rutaArchivo)
    ? readFileSync(rutaArchivo).toString('base64')
    : ''

  return notoRegularBase64
}

function dividirGrafemas(texto) {
  if (!texto) return []
  if (segmentadorGrafemas) {
    return [...segmentadorGrafemas.segment(texto)].map(s => s.segment)
  }
  return [...texto]
}

function esPuntoCodigoEmoji(puntoCodigo) {
  if (puntoCodigo === 0xFE0F || puntoCodigo === 0x200D) return true
  return (
    (puntoCodigo >= 0x1F300 && puntoCodigo <= 0x1FAFF) ||
    (puntoCodigo >= 0x1F600 && puntoCodigo <= 0x1F64F) ||
    (puntoCodigo >= 0x1F680 && puntoCodigo <= 0x1F6FF) ||
    (puntoCodigo >= 0x1F900 && puntoCodigo <= 0x1F9FF) ||
    (puntoCodigo >= 0x2600 && puntoCodigo <= 0x27BF) ||
    (puntoCodigo >= 0x2300 && puntoCodigo <= 0x23FF)
  )
}

function esGrafemaEmoji(segmento) {
  if (!segmento) return false
  return [...segmento].some(caracter => esPuntoCodigoEmoji(caracter.codePointAt(0)))
}

function emojiACodigoTwemoji(emoji) {
  return [...emoji]
    .map(caracter => caracter.codePointAt(0).toString(16))
    .filter(codigo => codigo !== 'fe0f')
    .join('-')
}

async function obtenerPngEmoji(emoji) {
  if (cachePngEmoji.has(emoji)) return cachePngEmoji.get(emoji)

  try {
    const codigo = emojiACodigoTwemoji(emoji)
    const respuesta = await fetch(`${TWEMOJI_BASE}/${codigo}.png`)
    if (!respuesta.ok) {
      cachePngEmoji.set(emoji, null)
      return null
    }
    const bufer = Buffer.from(await respuesta.arrayBuffer())
    cachePngEmoji.set(emoji, bufer)
    return bufer
  } catch {
    cachePngEmoji.set(emoji, null)
    return null
  }
}

async function precargarEmojis(texto) {
  const tareas = []
  for (const grafema of dividirGrafemas(texto)) {
    if (esGrafemaEmoji(grafema)) tareas.push(obtenerPngEmoji(grafema))
  }
  await Promise.all(tareas)
}

async function parsearCorridasLinea(line) {
  const corridas = []
  let textoActual = ''

  for (const grafema of dividirGrafemas(line)) {
    if (esGrafemaEmoji(grafema)) {
      if (textoActual) {
        corridas.push({ type: 'text', text: textoActual })
        textoActual = ''
      }
      corridas.push({ type: 'emoji', text: grafema, png: await obtenerPngEmoji(grafema) })
    } else {
      textoActual += grafema
    }
  }

  if (textoActual) corridas.push({ type: 'text', text: textoActual })
  return corridas
}

function estimarAnchoTexto(texto, tamanoFuente) {
  return dividirGrafemas(texto).reduce((ancho, grafema) => {
    return ancho + (esGrafemaEmoji(grafema) ? tamanoFuente * 1.05 : tamanoFuente * 0.56)
  }, 0)
}

function construirSvgCorridaTexto(texto, tamanoFuente) {
  const ancho = Math.max(8, Math.ceil(estimarAnchoTexto(texto, tamanoFuente)) + 6)
  const altura = Math.ceil(tamanoFuente * 1.35)
  const noto = cargarNotoBase64()
  const caraFuente = noto
    ? `@font-face { font-family: 'NotoSans'; src: url(data:font/ttf;base64,${noto}) format('truetype'); }`
    : ''
  const familia = noto ? 'NotoSans, Arial, sans-serif' : 'Segoe UI, Arial, sans-serif'

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${ancho}" height="${altura}" xmlns="http://www.w3.org/2000/svg">
  <style>${caraFuente}</style>
  <text x="0" y="${tamanoFuente * 0.9}" font-family="${familia}" font-size="${tamanoFuente}"
    font-weight="500" fill="#111111">${escaparXml(texto)}</text>
</svg>`
}

function obtenerDisenoMensaje(lineas, fuenteMsg) {
  const alturaLinea = fuenteMsg * 1.28
  const nombreY = 168
  const burbujaY = nombreY + 18
  const inicioTextoY = burbujaY + BUBBLE_PAD_Y + fuenteMsg * 0.85
  return { lineHeight, textStartY }
}

async function construirCompuestosMensaje(lineas, fuenteMsg) {
  const { lineHeight, textStartY } = obtenerDisenoMensaje(lineas, fuenteMsg)
  const tamanoEmoji = Math.round(fuenteMsg * 1.05)
  const compuestos = []

  for (let i = 0; i < lineas.length; i++) {
    const corridas = await parsearCorridasLinea(lineas[i])
    let x = TEXT_X + BUBBLE_PAD_X
    const textoArriba = Math.round(inicioTextoY + i * alturaLinea - fuenteMsg * 0.9)
    const emojiArriba = Math.round(inicioTextoY + i * alturaLinea - tamanoEmoji * 0.82)

    for (const corrida of corridas) {
      if (corrida.type === 'text' && corrida.text) {
        const svg = construirSvgCorridaTexto(corrida.text, fuenteMsg)
        const bufer = await sharp(Buffer.from(svg)).png().toBuffer()
        compuestos.push({ input: bufer, left: Math.round(x), top: textoArriba })
        x += estimarAnchoTexto(corrida.text, fuenteMsg)
        continue
      }

      if (corrida.type === 'emoji' && corrida.png) {
        const bufer = await sharp(corrida.png).resize(tamanoEmoji, tamanoEmoji).png().toBuffer()
        compuestos.push({ input: bufer, left: Math.round(x), top: emojiArriba })
      }

      if (corrida.type === 'emoji') x += tamanoEmoji * 0.95
    }
  }

  return compuestos
}

function envolverParrafo(parrafo, maxCaracteres) {
  const palabras = parrafo.split(/\s+/).filter(Boolean)
  if (!palabras.length) return []

  const lineas = []
  let actual = ''

  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra
    if (prueba.length <= maxCaracteres) {
      actual = prueba
      continue
    }
    if (actual) lineas.push(actual)
    if (palabra.length > maxCaracteres) {
      for (let i = 0; i < palabra.length; i += maxCaracteres) {
        lineas.push(palabra.slice(i, i + maxCaracteres))
      }
      actual = ''
    } else {
      actual = palabra
    }
  }

  if (actual) lineas.push(actual)
  return lineas
}

function estimarMaxCaracteres(tamanoFuente) {
  const anchoPromedioChar = tamanoFuente * 0.56
  return Math.max(6, Math.floor(TEXT_AREA_WIDTH / anchoPromedioChar))
}

function envolverTexto(texto, maxCaracteres) {
  const partes = texto.split('\n').map(p => p.trim())
  const lineas = []

  for (const parte of partes) {
    if (!parte) continue
    lineas.push(...envolverParrafo(parte, maxCaracteres))
  }

  return lineas.length ? lineas : [texto.slice(0, maxCaracteres)]
}

function calcularDiseno(texto) {
  let tamanoFuente = 30
  let maxCaracteres = estimarMaxCaracteres(tamanoFuente)
  let lineas = envolverTexto(texto, maxCaracteres)

  while (lineas.length > MAX_LINES && tamanoFuente > 20) {
    tamanoFuente -= 4
    maxCaracteres = estimarMaxCaracteres(tamanoFuente)
    lineas = envolverTexto(texto, maxCaracteres)
  }

  if (lineas.length > MAX_LINES) {
    lineas = lineas.slice(0, MAX_LINES)
    const ultimo = lineas[MAX_LINES - 1]
    lineas[MAX_LINES - 1] = ultimo.length > 3 ? `${ultimo.slice(0, -1)}…` : `${ultimo}…`
  }

  return { lines, fontSize }
}

function construirSvgSuperposicion(nombrePush, lineas, fuenteMsg) {
  const { lineHeight } = obtenerDisenoMensaje(lineas, fuenteMsg)
  const fuenteNombre = 28
  const anchoBurbuja = BUBBLE_MAX_WIDTH
  const alturaBurbuja = BUBBLE_PAD_Y * 2 + lineas.length * alturaLinea
  const nombreY = 168
  const burbujaY = nombreY + 18

  return `<svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <text x="${TEXT_X}" y="${nombreY}" font-family="Segoe UI, Arial, sans-serif"
    font-size="${fuenteNombre}" font-weight="700" fill="#25D366">${escaparXml(nombrePush)}</text>
  <rect x="${TEXT_X}" y="${burbujaY}" width="${anchoBurbuja}" height="${alturaBurbuja}"
    rx="20" ry="20" fill="#FFFFFF" stroke="#ECECEC" stroke-width="1"/>
</svg>`
}

function svgAvatarPorDefecto(letra) {
  const seguro = escaparXml(letra.slice(0, 1).toUpperCase() || '?')
  return `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="#DFE5E7"/>
  <text x="50%" y="54%" font-family="Arial, sans-serif" font-size="52" font-weight="700"
    fill="#FFFFFF" text-anchor="middle" dominant-baseline="middle">${seguro}</text>
</svg>`
}

function cargarCitadoDesdeStore(conn, m) {
  const idEstrofa = m.quoted?.id || m.msg?.contextInfo?.stanzaId
  if (!idEstrofa || !conn?.chats) return null

  const jidRemoto = m.msg?.contextInfo?.remoteJid || m.quoted?.chat || m.chat
  const participante = m.msg?.contextInfo?.participant
  const candidatos = []
  const vistos = new Set()

  const agregar = (entrada) => {
    if (!entrada?.message || vistos.has(entrada)) return
    vistos.add(entrada)
    candidatos.push(entrada)
  }

  agregar(conn.chats[jidRemoto]?.messages?.[idEstrofa])
  agregar(conn.chats[m.chat]?.messages?.[idEstrofa])
  if (participante) agregar(conn.chats[participante]?.messages?.[idEstrofa])

  for (const chat of Object.values(conn.chats)) {
    agregar(chat?.messages?.[idEstrofa])
    if (candidatos.length) break
  }

  return candidatos[0] || null
}

function mismoUsuarioJid(a, b) {
  if (!a || !b) return false
  const numA = String(a).split('@')[0].replace(/\D/g, '')
  const numB = String(b).split('@')[0].replace(/\D/g, '')
  return numA.length > 5 && numA === numB
}

async function recolectarJidsUsuario(m, conn, semillas = []) {
  const jids = new Set()
  const agregarJid = (jid) => {
    if (!jid || typeof jid !== 'string') return
    const decodificado = conn.decodeJid(jid)
    if (!decodificado || decodificado === 'status@broadcast' || decodificado.endsWith('@g.us')) return
    jids.add(decodificado)
  }

  for (const semilla of semillas) agregarJid(semilla)

  if (m.isGroup) {
    try {
      const meta = conn.chats[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(() => null)
      const objetivos = [...jids]
      for (const p of meta?.participants || []) {
        const idParticipante = conn.decodeJid(p.id)
        if (objetivos.some(t => t === idParticipante || mismoUsuarioJid(t, idParticipante))) {
          agregarJid(idParticipante)
          if (p.phoneNumber) agregarJid(`${String(p.phoneNumber).replace(/\D/g, '')}@s.whatsapp.net`)
          if (p.lid) agregarJid(p.lid.includes('@') ? p.lid : `${p.lid}@lid`)
        }
      }
    } catch {}
  }

  const resueltos = []
  for (const jid of jids) {
    if (!jid.includes('@lid') || !m.isGroup) {
      resueltos.push(jid)
      continue
    }
    try {
      const real = await Promise.race([
        String.prototype.resolveLidToRealJid.call(jid, m.chat, conn),
        new Promise((_, rechazar) => setTimeout(() => rechazar(new Error('timeout')), 6000))
      ])
      if (typeof real === 'string' && real) resueltos.push(conn.decodeJid(real))
    } catch {}
    resueltos.push(jid)
  }

  return [...new Set(resueltos)]
}

async function resolverNombrePushParaJid(jid, jids, conn, nombresExtra = []) {
  let nombrePush = ''

  for (const candidato of nombresExtra) {
    if (typeof candidato?.then === 'function') candidato = await candidato
    const valor = String(candidato || '').trim()
    if (valor) {
      nombrePush = valor
      break
    }
  }

  const jidsConsulta = [...new Set([jid, ...jids].filter(Boolean))]
  if (!nombrePush) {
    for (const id of jidsConsulta) {
      const enCache = conn.chats?.[id]
      nombrePush = (enCache?.notify || enCache?.name || enCache?.vname || '').trim()
      if (nombrePush) break
    }
  }

  if (!nombrePush) {
    for (const id of jidsConsulta) {
      nombrePush = String(await Promise.resolve(conn.getName(id)) || '').trim()
      if (nombrePush) break
    }
  }

  return nombrePush || 'Usuario'
}

async function resolverUsuarioCitado(m, conn) {
  const citadoCompleto = m.getQuotedObj?.() || null
  const almacenado = cargarCitadoDesdeStore(conn, m)
  const ctx = m.msg?.contextInfo
  const semillas = [
    ctx?.participant,
    citadoCompleto?.key?.participant,
    citadoCompleto?.sender,
    almacenado?.key?.participant
  ].filter(Boolean)

  const jids = await recolectarJidsUsuario(m, conn, semillas)
  const jidPrincipal = jids[0] || null
  if (!jidPrincipal) return null

  const nombrePush = await resolverNombrePushParaJid(jidPrincipal, jids, conn, [
    citadoCompleto?.pushName,
    almacenado?.pushName,
    citadoCompleto?.name
  ])

  return { primaryJid, jids, pushname }
}

async function resolverUsuarioMencionado(m, conn) {
  let mencion = m.mentionedJid?.[0]
  if (typeof mencion?.then === 'function') mencion = await mencion

  if (!mencion) {
    const analizado = conn.parseMention?.(m.text || '') || []
    mencion = analizado[0]
  }

  if (!mencion) return null

  mencion = conn.decodeJid(mencion)
  const jids = await recolectarJidsUsuario(m, conn, [mencion])
  const jidPrincipal = jids[0] || mencion

  const nombrePush = await resolverNombrePushParaJid(jidPrincipal, jids, conn)
  return { primaryJid, jids, pushname }
}

function resolverMensajeSw(m, args) {
  let texto = args.join(' ').trim()

  if (!texto && m.text) {
    const limpiado = m.text.replace(/^[\s\u200e\u200f]*/, '')
    const coincidencia = limpiado.match(/^[^\w]?[.!#/]\S+\s+([\s\S]*)$/)
    if (coincidencia) texto = coincidencia[1].trim()
  }

  return texto
    .replace(/@\d{5,20}/g, '')
    .replace(/[\u200e\u200f\uFEFF]/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .trim()
}

function tieneMencion(m, conn) {
  if (m.mentionedJid?.length) return true
  return (conn.parseMention?.(m.text || '') || []).length > 0
}

async function descargarUrlImagen(conn, url) {
  if (!url) return null

  try {
    const archivo = await conn.getFile(url)
    if (archivo?.data?.length > 512) return archivo.data
  } catch {}

  try {
    const data = await sharp(url).rotate().toBuffer()
    if (data?.length > 512) return data
  } catch {}

  return null
}

async function obtenerBuferPerfil(conn, jids, nombrePush) {
  const probados = new Set()

  for (const jid of jids) {
    if (!jid || probados.has(jid)) continue
    probados.add(jid)

    try {
      let url = await conn.profilePictureUrl(jid, 'image').catch(() => null)
      if (!url) url = await conn.profilePictureUrl(jid, 'preview').catch(() => null)
      const data = await descargarUrlImagen(conn, url)
      if (data?.length > 512) return data
    } catch {}
  }

  return sharp(Buffer.from(svgAvatarPorDefecto(nombrePush || '?')))
    .resize(AVATAR_SIZE, AVATAR_SIZE)
    .png()
    .toBuffer()
}

async function construirAvatarCircular(bufer) {
  const mascara = Buffer.from(
    `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}">
      <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="white"/>
    </svg>`
  )

  return sharp(bufer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .png()
    .composite([{ input: mascara, blend: 'dest-in' }])
    .png()
    .toBuffer()
}

async function construirSticker(nombrePush, mensaje, buferPerfil) {
  const { lines, fontSize } = calcularDiseno(mensaje)
  await precargarEmojis(mensaje)

  const avatar = await construirAvatarCircular(buferPerfil)
  const superposicion = Buffer.from(construirSvgSuperposicion(nombrePush, lineas, tamanoFuente))
  const capaMensaje = await construirCompuestosMensaje(lineas, tamanoFuente)
  const avatarY = Math.round((SIZE - AVATAR_SIZE) / 2)

  return sharp({
    create: {
      width: SIZE,
      height: SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite([
      { input: avatar, left: AVATAR_X, top: avatarY },
      { input: superposicion, left: 0, top: 0 },
      ...capaMensaje
    ])
    .webp({ quality: 92 })
    .toBuffer()
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    const mencionado = tieneMencion(m, conn)
    const citado = !!m.quoted

    if (!mencionado && !citado) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Respondé a un mensaje o mencioná al usuario, y escribe el texto que "diría".*\n\nEjemplos:\n> (respondés mensaje)\n> ${usedPrefix + command} Soy tu amigo 😄\n\n> ${usedPrefix + command} @usuario Hola, ¿cómo estás?`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const mensaje = resolverMensajeSw(m, args)
    if (!mensaje) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Falta el texto del mensaje.*\n\nEjemplos:\n> ${usedPrefix + command} Hola, ¿cómo estás?\n> ${usedPrefix + command} @usuario Te extraño`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    if (mensaje.length > MAX_MSG) {
      return conn.sendMessage(m.chat, {
        text: `*[❗] Texto muy largo.* Máximo ${MAX_MSG} caracteres.`,
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const destino = mencionado
      ? await resolverUsuarioMencionado(m, conn)
      : await resolverUsuarioCitado(m, conn)

    if (!destino?.primaryJid) {
      return conn.sendMessage(m.chat, {
        text: '*[❗] No se pudo identificar al usuario.*',
        contextInfo: { ...rcanal.contextInfo }
      }, { quoted: m })
    }

    const { primaryJid, jids, pushname } = destino

    const buferPerfil = await obtenerBuferPerfil(conn, jids.length ? jids : [jidPrincipal], nombrePush)
    const datosSticker = await construirSticker(nombrePush, mensaje, buferPerfil)

    const { packname, author } = resolveStickerMeta(m, conn)

    const stickerFinal = await addExif(datosSticker, packname, author)

    await conn.sendFile(m.chat, stickerFinal, 'sticker.webp', '', m, null, rcanal)
  } catch (error) {
    console.error('[sw] Error:', error)
    conn.sendMessage(m.chat, {
      text: `*[❌] Error al crear sticker: ${error.message || 'desconocido'}*`,
      contextInfo: { ...rcanal.contextInfo }
    }, { quoted: m })
  }
}

handler.help = ['#sw + {responder o @mención} texto → sticker estilo chat con foto y nombre']
handler.tags = ['stickers']
handler.command = ['sw', 'stickerwa', 'fakemsg', 'msgfake']

export default handler
