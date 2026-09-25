import fs from 'fs'
import path from 'path'

const SEP = '┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈'
const tip = (v) => `\`${String(v ?? '').replace(/`/g, "'")}\``

function dirImagenGrupo(chatId) {
  const safe = String(chatId).replace(/[^a-zA-Z0-9._@-]/g, '_')
  const dir = path.join(process.cwd(), 'storage', 'welcome', safe)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function rutaImagenTipo(chatId, tipo) {
  return path.join(dirImagenGrupo(chatId), tipo === 'goodbye' ? 'goodbye.jpg' : 'welcome.jpg')
}


function payloadImagen(rutaOUrl) {
  if (!rutaOUrl || !String(rutaOUrl).trim()) return null
  const v = String(rutaOUrl).trim()
  if (/^https?:\/\//i.test(v)) return { url: v }
  try {
    if (fs.existsSync(v)) return fs.readFileSync(v)
  } catch {}
  return null
}

function borrarArchivoSiExiste(ruta) {
  try {
    if (ruta && fs.existsSync(ruta)) fs.unlinkSync(ruta)
  } catch {}
}

function mensajeBienvenidaPorDefecto() {
  return `
ㅤ
𓂃 ࣪ ִֶָ☾.  *bienvenida*
_\${group}_

${SEP}
*hola*
\${participant}

miembros  ·  \`\${memberCount}\`
fecha  ·  \`\${date}\`
hora  ·  \`\${time}\`

pase y siéntete en casa
ㅤ`.trim()
}

function mensajeDespedidaPorDefecto() {
  return `
ㅤ
𓂃 ࣪ ִֶָ☾.  *despedida*
_\${group}_

${SEP}
*adiós*
\${participant}

miembros  ·  \`\${memberCount}\`
fecha  ·  \`\${date}\`
hora  ·  \`\${time}\`

que te vaya bien
ㅤ`.trim()
}

function asegurarConfig(chatId) {
    if (!global.db.data.bienvenidas) global.db.data.bienvenidas = {}
  const actual = global.db.data.bienvenidas[chatId]
    
  if (actual === true) {
    global.db.data.bienvenidas[chatId] = {
        enabled: true,
        welcomeMsg: '',
        goodbyeMsg: '',
        welcomeImg: '',
      goodbyeImg: '',
      }
  } else if (actual === false) {
    global.db.data.bienvenidas[chatId] = {
        enabled: false,
        welcomeMsg: '',
        goodbyeMsg: '',
        welcomeImg: '',
      goodbyeImg: '',
      }
  } else if (!actual || typeof actual !== 'object') {
    global.db.data.bienvenidas[chatId] = {
        enabled: false,
        welcomeMsg: '',
        goodbyeMsg: '',
        welcomeImg: '',
      goodbyeImg: '',
    }
  }
  return global.db.data.bienvenidas[chatId]
}

async function datosVistaPrevia(conn, m) {
  const meta = await conn.groupMetadata(m.chat).catch(() => null)
  return {
    user: (await conn.getName(m.sender)) || 'Usuario',
    participant: `@${String(m.sender).split('@')[0]}`,
    group: (await conn.getName(m.chat)) || 'Grupo',
    memberCount: meta?.participants?.length || 0,
    date: new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' }),
    time: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
  }
}

function aplicarVars(plantilla, data) {
  return String(plantilla || '')
    .replace(/\${user}/g, data.user)
    .replace(/\${participant}/g, data.participant)
    .replace(/\${group}/g, data.group)
    .replace(/\${memberCount}/g, data.memberCount)
    .replace(/\${date}/g, data.date)
    .replace(/\${time}/g, data.time)
}

async function enviarTexto(conn, m, text, mentions = []) {
  return conn.sendMessage(m.chat, {
    text,
    contextInfo: {
      ...(global.rcanal?.contextInfo || {}),
      ...(mentions.length ? { mentionedJid: mentions } : {}),
    },
  }, { quoted: m })
}

async function enviarVistaConImagen(conn, m, caption, rutaOUrl, mentions = [m.sender]) {
  try {
    let image = payloadImagen(rutaOUrl)
    if (!image) {
      const pp = await conn.profilePictureUrl(m.chat, 'image').catch(() => null)
      if (pp) image = { url: pp }
    }
    if (image) {
      await conn.sendMessage(m.chat, {
        image,
        caption,
        contextInfo: {
          ...(global.rcanal?.contextInfo || {}),
          mentionedJid: mentions,
        },
      }, { quoted: m })
      return
    }
  } catch {}
  await enviarTexto(conn, m, caption, mentions)
}

function guia(usedPrefix) {
  return `
ㅤ
𓂃 ࣪ ִֶָ☾.  *bienvenidas*
_configuración del grupo_

${SEP}
*comandos*
> ${usedPrefix}welcome on
> ${usedPrefix}welcome off
> ${usedPrefix}welcome status
> ${usedPrefix}welcome reset

${SEP}
*mensajes*
> ${usedPrefix}welcome msg welcome <texto>
> ${usedPrefix}welcome msg goodbye <texto>

${SEP}
*imágenes*
_(responde a una foto)_
> ${usedPrefix}welcome img welcome
> ${usedPrefix}welcome img goodbye
> ${usedPrefix}welcome img welcome reset
> ${usedPrefix}welcome img goodbye reset

${SEP}
*variables*
${tip('${user}')}  ·  nombre
${tip('${participant}')}  ·  @mención
${tip('${group}')}  ·  grupo
${tip('${memberCount}')}  ·  miembros
${tip('${date}')}  ·  fecha
${tip('${time}')}  ·  hora

${SEP}
*ejemplo*
> ${usedPrefix}welcome msg welcome hola \${participant}, bienvenido a \${group}

activa primero con ${tip(usedPrefix + 'welcome on')}
ㅤ`.trim()
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    if (!m.isGroup) {
      return enviarTexto(conn, m, 'Este comando solo funciona en grupos.')
    }

    const accion = args[0]?.toLowerCase()
    const cfg = asegurarConfig(m.chat)

    if (accion === 'on') {
      cfg.enabled = true
      const data = await datosVistaPrevia(conn, m)
      const bienvenida = aplicarVars(cfg.welcomeMsg || mensajeBienvenidaPorDefecto(), data)
      const despedida = aplicarVars(cfg.goodbyeMsg || mensajeDespedidaPorDefecto(), data)

      await enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *bienvenidas*
_activadas_

${SEP}
estado  ·  ${tip('activado')}
bienvenida + despedida

${SEP}
*vista previa — bienvenida*
${bienvenida}

${SEP}
*vista previa — despedida*
${despedida}

${SEP}
> ${usedPrefix}welcome msg welcome <texto>
> ${usedPrefix}welcome img welcome
ㅤ`.trim(), [m.sender])
      return
    }

    if (accion === 'off') {
      cfg.enabled = false
      return enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *bienvenidas*
_desactivadas_

${SEP}
estado  ·  ${tip('apagado')}
ㅤ`.trim(), [m.sender])
    }

    if (accion === 'msg') {
      const tipo = args[1]?.toLowerCase()
      const mensaje = m.text.replace(new RegExp(`^\\s*${usedPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}?${command}\\s+msg\\s+${tipo}\\s+`, 'i'), '').trim()

      if (!tipo || !mensaje || !['welcome', 'goodbye'].includes(tipo)) {
        return enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *mensaje*

${SEP}
> ${usedPrefix}welcome msg welcome <texto>
> ${usedPrefix}welcome msg goodbye <texto>

${SEP}
*variables*
${tip('${user}')}  ${tip('${participant}')}
${tip('${group}')}  ${tip('${memberCount}')}
${tip('${date}')}  ${tip('${time}')}
ㅤ`.trim())
      }

      if (!cfg.enabled) {
        return enviarTexto(conn, m, `Activa primero:\n> ${usedPrefix}welcome on`)
      }

      if (tipo === 'welcome') cfg.welcomeMsg = mensaje
      else cfg.goodbyeMsg = mensaje

      const data = await datosVistaPrevia(conn, m)
      const preview = aplicarVars(mensaje, data)
      await enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *${tipo === 'welcome' ? 'bienvenida' : 'despedida'}*
_mensaje guardado_

${SEP}
${tip(mensaje)}
ㅤ`.trim())
      await enviarVistaConImagen(conn, m, preview, tipo === 'welcome' ? cfg.welcomeImg : cfg.goodbyeImg)
      return
    }

    if (accion === 'img') {
      const tipo = args[1]?.toLowerCase()
      const extra = String(args[2] || '').toLowerCase()

      if (!tipo || !['welcome', 'goodbye'].includes(tipo)) {
        return enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *imagen*

${SEP}
responde a una foto con:
> ${usedPrefix}welcome img welcome
> ${usedPrefix}welcome img goodbye

reset:
> ${usedPrefix}welcome img welcome reset
ㅤ`.trim())
      }

      if (!cfg.enabled) {
        return enviarTexto(conn, m, `Activa primero:\n> ${usedPrefix}welcome on`)
      }

      if (extra === 'reset') {
        const rutaVieja = tipo === 'welcome' ? cfg.welcomeImg : cfg.goodbyeImg
        borrarArchivoSiExiste(rutaVieja)
        borrarArchivoSiExiste(rutaImagenTipo(m.chat, tipo))
        if (tipo === 'welcome') cfg.welcomeImg = ''
        else cfg.goodbyeImg = ''
        return enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *imagen*
_reseteada_

${SEP}
ahora se usa la foto del grupo
ㅤ`.trim())
      }

      const q = m.quoted || m
      const tipoMime = (q.msg || q).mimetype || q.mimetype || ''
      if (!/image\/(jpe?g|png|webp)/i.test(tipoMime)) {
        return enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *imagen*

${SEP}
responde a una *foto* con:
> ${usedPrefix}welcome img ${tipo}
ㅤ`.trim())
      }

      let buffer
      try {
        buffer = await q.download?.()
      } catch {}
      if (!buffer?.length) {
        return enviarTexto(conn, m, 'No pude descargar la imagen. Intenta de nuevo.')
      }

      const ruta = rutaImagenTipo(m.chat, tipo)
      const anterior = tipo === 'welcome' ? cfg.welcomeImg : cfg.goodbyeImg
      if (anterior && anterior !== ruta) borrarArchivoSiExiste(anterior)

      fs.writeFileSync(ruta, buffer)
      if (tipo === 'welcome') cfg.welcomeImg = ruta
      else cfg.goodbyeImg = ruta

      const data = await datosVistaPrevia(conn, m)
      const plantilla = tipo === 'welcome'
        ? (cfg.welcomeMsg || mensajeBienvenidaPorDefecto())
        : (cfg.goodbyeMsg || mensajeDespedidaPorDefecto())
      const preview = aplicarVars(plantilla, data)

      await enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *imagen*
_guardada_

${SEP}
${tipo === 'welcome' ? 'bienvenida' : 'despedida'}  ·  ${tip('foto del chat')}
ㅤ`.trim())
      await enviarVistaConImagen(conn, m, preview, ruta)
      return
    }

    if (accion === 'status' || accion === 'estado') {
      const activo = cfg.enabled === true
      return enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *estado*
_bienvenidas_

${SEP}
estado  ·  ${tip(activo ? 'activado' : 'apagado')}
msg bienvenida  ·  ${tip(cfg.welcomeMsg ? 'personalizado' : 'por defecto')}
msg despedida  ·  ${tip(cfg.goodbyeMsg ? 'personalizado' : 'por defecto')}
img bienvenida  ·  ${tip(cfg.welcomeImg ? 'personalizada' : 'foto del grupo')}
img despedida  ·  ${tip(cfg.goodbyeImg ? 'personalizada' : 'foto del grupo')}
ㅤ`.trim(), [m.sender])
    }

    if (accion === 'reset') {
      global.db.data.bienvenidas[m.chat] = {
        enabled: false,
        welcomeMsg: '',
        goodbyeMsg: '',
        welcomeImg: '',
        goodbyeImg: '',
      }
      return enviarTexto(conn, m, `
ㅤ
𓂃 ࣪ ִֶָ☾.  *reset*
_listo_

${SEP}
mensajes  ·  ${tip('por defecto')}
imágenes  ·  ${tip('foto del grupo')}
estado  ·  ${tip('apagado')}
ㅤ`.trim())
    }

    return enviarTexto(conn, m, guia(usedPrefix))
  } catch (e) {
    console.error('Error en bienvenidas:', e)
    return enviarTexto(conn, m, 'Ocurrió un error al configurar las bienvenidas.')
  }
}

handler.help = ['welcome', 'welcome on/off', 'welcome status']
handler.tags = ['grupo']
handler.command = ['welcome', 'bienvenidas', 'bienvenida']
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler

export {
  mensajeBienvenidaPorDefecto as defaultWelcomeMessage,
  mensajeDespedidaPorDefecto as defaultGoodbyeMessage,
}
