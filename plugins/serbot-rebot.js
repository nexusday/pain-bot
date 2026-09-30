import fs from 'fs'
import path from 'path'
import { esBotPrincipal, esDuenoPrincipal, esOwnerConfig, obtenerIdsStaffComoOwner } from '../lib/staff.js'
import { candidatosJidRemitente, jidsSeSolapan } from '../lib/group-participant.js'
import { extractPhoneFromArgs, resolvePhoneNumber } from '../lib/resolve-phone.js'
import { tr } from '../lib/lang.js'

const ESPERA_MS = 5 * 60 * 1000

function variantesNumero(numero) {
  const d = String(numero || '').split('@')[0].split(':')[0].replace(/\D/g, '')
  const set = new Set()
  if (d.length < 8) return set
  set.add(d)
  if (d.startsWith('521') && d.length >= 12) set.add(`52${d.slice(3)}`)
  if (d.startsWith('52') && !d.startsWith('521') && d.length >= 11) set.add(`521${d.slice(2)}`)
  if (d.startsWith('549') && d.length >= 12) set.add(`54${d.slice(3)}`)
  if (d.startsWith('54') && !d.startsWith('549') && d.length >= 11) set.add(`549${d.slice(2)}`)
  return set
}

function numerosCoinciden(a, b) {
  const A = variantesNumero(a)
  if (!A.size) return false
  for (const n of variantesNumero(b)) if (A.has(n)) return true
  return false
}

function esStaffPrincipal(m, conn) {
  if (!global.conn) return false
  try {
    return jidsSeSolapan(candidatosJidRemitente(m, conn), obtenerIdsStaffComoOwner(global.conn))
  } catch {
    return false
  }
}

function reloj() {
  if (!global.rebotUltimo || typeof global.rebotUltimo !== 'object') global.rebotUltimo = {}
  return global.rebotUltimo
}

function socketDe(numero) {
  for (const c of global.conns || []) {
    const candidatos = [
      c?.phoneNumber,
      c?.botNumber,
      c?.user?.jid,
      c?.user?.id,
      c?.authState?.creds?.me?.id,
      c?.pathAYBot
    ]
    if (candidatos.some((v) => numerosCoinciden(numero, v))) return c
  }
  return null
}

function carpetaDe(numero) {
  const raiz = path.join(process.cwd(), global.bot || 'Serbot')
  if (!fs.existsSync(raiz)) return null
  for (const carpeta of fs.readdirSync(raiz)) {
    if (!numerosCoinciden(numero, carpeta)) continue
    const ruta = path.join(raiz, carpeta, 'creds.json')
    if (!fs.existsSync(ruta)) continue
    try {
      const creds = JSON.parse(fs.readFileSync(ruta, 'utf8'))
      if (creds?.registered) return path.join(raiz, carpeta)
    } catch {}
  }
  return null
}

let handler = async (m, { conn, args, usedPrefix, command, participants, groupMetadata }) => {
  if (!esBotPrincipal(conn)) return

  let quien = m.mentionedJid?.[0] || (m.fromMe ? conn.user.jid : m.sender)
  const claveAlt = m.key?.participantAlt || m.key?.remoteJidAlt
  if (claveAlt) quien = claveAlt

  let participantesGrupo = participants || []
  if (m.isGroup) {
    try {
      const fresco = await conn.groupMetadata(m.chat)
      if (fresco?.participants?.length) participantesGrupo = fresco.participants
    } catch {}
  }

  const datosNumero = {
    participants: participantesGrupo,
    groupId: m.isGroup ? m.chat : null,
    groupMetadata: groupMetadata || null
  }
  const pedido = extractPhoneFromArgs(args)
  const propio = await resolvePhoneNumber(quien, conn, null, m, datosNumero)
  const puedeOtro = esDuenoPrincipal(m, conn) || esOwnerConfig(m, conn) || esStaffPrincipal(m, conn)
  let phoneNumber = pedido || propio

  if (pedido && !puedeOtro && !numerosCoinciden(pedido, propio)) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `+${pedido} no es tu subbot.`,
        `+${pedido} is not your sub-bot.`,
        `+${pedido} não é o seu sub-bot.`
      ),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })
  }

  if (!phoneNumber) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `no se detectó tu número. usa ${usedPrefix}code <número>`,
        `your number was not detected. use ${usedPrefix}code <number>`,
        `não detectei seu número. use ${usedPrefix}code <número>`
      ),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })
  }

  const carpeta = carpetaDe(phoneNumber)
  if (!carpeta) {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `+${phoneNumber} no tiene un subbot. vincúlalo con ${usedPrefix}code`,
        `+${phoneNumber} has no sub-bot. link it with ${usedPrefix}code`,
        `+${phoneNumber} não tem um sub-bot. vincule com ${usedPrefix}code`
      ),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })
  }

  const clave = [...variantesNumero(phoneNumber)][0] || phoneNumber
  const ultimo = reloj()[clave] || 0
  const falta = ESPERA_MS - (Date.now() - ultimo)
  if (falta > 0) {
    const minutos = Math.max(1, Math.ceil(falta / 60000))
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `+${phoneNumber} espera ${minutos} min para volver a reconectar.`,
        `+${phoneNumber} wait ${minutos} min before reconnecting again.`,
        `+${phoneNumber} espera ${minutos} min para reconectar outra vez.`
      ),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })
  }

  const sock = socketDe(phoneNumber)
  if (sock && typeof sock.reconectarPain !== 'function') {
    return conn.sendMessage(m.chat, {
      text: tr(conn,
        `+${phoneNumber} sigue en la sesión anterior. reinicia el principal una vez y usa ${usedPrefix}rebot.`,
        `+${phoneNumber} is still on the previous session. restart the main bot once, then use ${usedPrefix}rebot.`,
        `+${phoneNumber} ainda está na sessão anterior. reinicia o principal uma vez e usa ${usedPrefix}rebot.`
      ),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })
  }

  reloj()[clave] = Date.now()

  await conn.sendMessage(m.chat, {
    text: tr(conn,
      `+${phoneNumber} reconectando tu subbot, por favor espere un momento.`,
      `+${phoneNumber} reconnecting your sub-bot, please wait a moment.`,
      `+${phoneNumber} reconectando seu sub-bot, por favor espere um momento.`
    ),
    contextInfo: { ...(global.rcanal?.contextInfo || {}) }
  }, { quoted: m })

  try {
    if (typeof sock?.reconectarPain === 'function') {
      await sock.reconectarPain()
      return
    }
    const { AYBot } = await import('./serbot-serbot.js')
    await AYBot({
      pathAYBot: carpeta,
      m: null,
      conn: global.conn,
      args: [],
      usedPrefix: '.',
      command: 'qr',
      fromCommand: false
    })
  } catch (e) {
    console.error('[rebot]', e?.message || e)
  }
}

handler.help = ['#rebot [número]\n→ Reconecta tu subbot. El owner principal y su staff pueden poner otro número. Una vez cada 5 minutos']
handler.tags = ['subbots']
handler.command = ['rebot']

export default handler
