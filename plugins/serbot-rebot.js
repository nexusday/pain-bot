import fs from 'fs'
import path from 'path'
import { esBotPrincipal, esDuenoPrincipal, esOwnerConfig, obtenerIdsStaffComoOwner } from '../lib/staff.js'
import { candidatosJidRemitente, jidsSeSolapan } from '../lib/group-participant.js'
import { extractPhoneFromArgs, resolvePhoneNumber } from '../lib/resolve-phone.js'
import { tr } from '../lib/lang.js'

const ESPERA_MS = 5 * 60 * 1000
let reconexionMasivaEnCurso = false

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

function socketAbierto(c) {
  try {
    if (c?.ws?.isOpen === true) return true
    return c?.ws?.socket?.readyState === 1
  } catch {
    return false
  }
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
  const pidioTodos = args.length === 1 && String(args[0]).toLowerCase() === 'all'
  if (args.some((arg) => String(arg).toLowerCase() === 'all') && !pidioTodos) {
    return conn.sendMessage(m.chat, {
      text: `Usa ${usedPrefix + command} all para reconectar todos los sub-bots.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })
  }

  if (pidioTodos) {
    const autorizado = esBotPrincipal(conn) &&
      (esDuenoPrincipal(m, conn) || esStaffPrincipal(m, conn))
    if (!autorizado) {
      return conn.sendMessage(m.chat, {
        text: 'Solo el owner principal y el staff del bot principal pueden reconectar todos los sub-bots.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }, { quoted: m })
    }
    if (reconexionMasivaEnCurso) {
      return conn.sendMessage(m.chat, {
        text: 'Ya hay una reconexión masiva de sub-bots en curso.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }, { quoted: m })
    }
    if (typeof global.reconnectSubBots !== 'function') {
      return conn.sendMessage(m.chat, {
        text: 'La función de reconexión de sub-bots no está disponible.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }, { quoted: m })
    }

    reconexionMasivaEnCurso = true
    try {
      await conn.sendMessage(m.chat, {
        text: 'Revisión iniciada en segundo plano. Los sub-bots activos no se reiniciarán; te avisaré al terminar.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }, { quoted: m })
    } catch (e) {
      reconexionMasivaEnCurso = false
      console.error('[rebot all]', e?.message || e)
      return conn.sendMessage(m.chat, {
        text: 'No se pudo iniciar la reconexión masiva de sub-bots.',
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }, { quoted: m })
    }

    setImmediate(async () => {
      try {
        const resultado = await global.reconnectSubBots()
        const conectados = Number(resultado?.conectados) || 0
        const omitidos = Number(resultado?.omitidos) || 0
        const pendientes = Number(resultado?.pendientes) || 0
        const fallidos = Number(resultado?.fallidos) || 0
        const requierenVincular = Number(resultado?.requierenVincular) || 0
        const socketAviso = global.conn || conn
        await socketAviso.sendMessage(m.chat, {
          text: `Revisión terminada.\n> Reconectados por esta revisión: ${conectados}\n> Ya activos, sin tocar: ${omitidos}\n> Ya en reconexión automática: ${pendientes}\n> Fallidos: ${fallidos}\n> Requieren volver a vincular: ${requierenVincular}`,
          contextInfo: { ...(global.rcanal?.contextInfo || {}) }
        }, { quoted: m })
      } catch (e) {
        console.error('[rebot all]', e?.message || e)
        try {
          const socketAviso = global.conn || conn
          await socketAviso.sendMessage(m.chat, {
            text: 'La reconexión masiva falló. Revisa los errores del servidor.',
            contextInfo: { ...(global.rcanal?.contextInfo || {}) }
          }, { quoted: m })
        } catch (errorAviso) {
          console.error('[rebot all] No se pudo enviar el resultado:', errorAviso?.message || errorAviso)
        }
      } finally {
        reconexionMasivaEnCurso = false
      }
    })
    return
  }

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

  // En modo supervisor (primary gestionado) los sockets viven en los workers.
  // Crear el socket aquí duplicaría la sesión y provoca 440/405. Se delega al worker dueño.
  if (process.env.PAIN_ROLE === 'primary' && typeof global.reconnectSubBotOneManaged === 'function') {
    let resultado = null
    try {
      resultado = await global.reconnectSubBotOneManaged(phoneNumber)
    } catch (e) {
      console.error('[rebot managed]', e?.message || e)
    }
    if (resultado?.already) {
      return conn.sendMessage(m.chat, {
        text: tr(conn,
          `+${phoneNumber} ya está conectado.`,
          `+${phoneNumber} is already connected.`,
          `+${phoneNumber} já está conectado.`
        ),
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }, { quoted: m })
    }
    if (resultado?.reason === 'needs-relink') {
      return conn.sendMessage(m.chat, {
        text: tr(conn,
          `+${phoneNumber} requiere volver a vincularse con ${usedPrefix}code o ${usedPrefix}qr.`,
          `+${phoneNumber} needs to be relinked with ${usedPrefix}code or ${usedPrefix}qr.`,
          `+${phoneNumber} precisa de novo vínculo com ${usedPrefix}code ou ${usedPrefix}qr.`
        ),
        contextInfo: { ...(global.rcanal?.contextInfo || {}) }
      }, { quoted: m })
    }
    await conn.sendMessage(m.chat, {
      text: resultado?.ok
        ? tr(conn,
          `+${phoneNumber} SUBBOT RECONECTADO CON EXITO.`,
          `+${phoneNumber} SUBBOT RECONNECTED.`,
          `+${phoneNumber} SUBBOT RECONECTADO COM SUCESSO.`
        )
        : tr(conn,
          `+${phoneNumber} NO SE PUDO RECONECTAR EL SUBBOT. Revisa /bots y reintenta en 1 min.`,
          `+${phoneNumber} THE SUBBOT COULD NOT RECONNECT. Check /bots and retry in 1 min.`,
          `+${phoneNumber} NÃO FOI POSSÍVEL RECONECTAR O SUBBOT. Veja /bots e tente em 1 min.`
        ),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) }
    }, { quoted: m })
    return
  }

  let ok = false
  try {
    if (typeof sock?.reconectarPain === 'function') {
      await sock.reconectarPain()
    } else {
      const { AYBot } = await import('./serbot-serbot.js')
      // fromCommand false: no pide QR ni código. Solo vuelve a abrir la carpeta ya vinculada.
      await AYBot({
        pathAYBot: carpeta,
        m: null,
        conn: global.conn,
        args: [],
        usedPrefix: '.',
        command: 'qr',
        fromCommand: false
      })
    }
    const limite = Date.now() + 50000
    while (Date.now() < limite) {
      const vivo = socketDe(phoneNumber)
      if (vivo?.user && socketAbierto(vivo)) {
        ok = true
        break
      }
      await new Promise((resolver) => setTimeout(resolver, 500))
    }
  } catch (e) {
    console.error('[rebot]', e?.message || e)
  }

  await conn.sendMessage(m.chat, {
    text: ok
      ? tr(conn,
        `+${phoneNumber} SUBBOT RECONECTADO CON EXITO.`,
        `+${phoneNumber} SUBBOT RECONNECTED.`,
        `+${phoneNumber} SUBBOT RECONECTADO COM SUCESSO.`
      )
      : tr(conn,
        `+${phoneNumber} NO SE PUDO RECONECTAR EL SUBBOT.`,
        `+${phoneNumber} THE SUBBOT COULD NOT RECONNECT.`,
        `+${phoneNumber} NÃO FOI POSSÍVEL RECONECTAR O SUBBOT.`
      ),
    contextInfo: { ...(global.rcanal?.contextInfo || {}) }
  }, { quoted: m })
}

handler.help = ['#rebot [número|all]\n→ Reconecta tu subbot. El owner principal y su staff pueden poner otro número o reconectar todos los sub-bots. Una vez cada 5 minutos']
handler.tags = ['subbots']
handler.command = ['rebot']

export default handler
