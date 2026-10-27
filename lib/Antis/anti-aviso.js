import { quitarParticipanteActual } from '../group-participant.js'

const avisosRecientes = new Map()
const expulsionesRecientes = new Map()
const COOLDOWN_AVISO = 30_000
const COOLDOWN_EXPULSION = 30_000
const INTERVALO_LIMPIEZA = 60_000
let ultimaLimpieza = 0

function limpiarCaducados(mapa, ahora) {
  for (const [clave, vence] of mapa) {
    if (vence <= ahora) mapa.delete(clave)
  }
}

function reservar(mapa, clave, cooldown) {
  const ahora = Date.now()
  if (ahora - ultimaLimpieza >= INTERVALO_LIMPIEZA) {
    limpiarCaducados(avisosRecientes, ahora)
    limpiarCaducados(expulsionesRecientes, ahora)
    ultimaLimpieza = ahora
  }

  const vence = mapa.get(clave) || 0
  if (vence > ahora) return false
  mapa.set(clave, ahora + cooldown)
  return true
}

export function debeEnviarAvisoAnti(chat, sender, regla) {
  return reservar(avisosRecientes, `${chat}:${sender}:${regla}`, COOLDOWN_AVISO)
}

export async function expulsarParticipanteUnaVez(conn, chat, sender, etiqueta = 'anti') {
  if (!conn?.groupParticipantsUpdate || !chat || !sender) return false

  const clave = `${chat}:${sender}:${etiqueta}`
  if (!reservar(expulsionesRecientes, clave, COOLDOWN_EXPULSION)) return false

  const resultado = await quitarParticipanteActual(conn, chat, sender, [], { protegerAdmins: true })
  if (!resultado.ok) {
    expulsionesRecientes.delete(clave)
    if (resultado.reason === 'not_in_group') {
      console.warn(`[${etiqueta}] no se encontró participante para expulsar: ${sender}`)
    } else if (resultado.reason === 'remove_failed') {
      console.warn(`[${etiqueta}] WhatsApp rechazó la expulsión (${resultado.status ?? 'sin estado'}): ${sender}`)
    }
    return false
  }
  return true
}
