import {
  resolveTargetJids,
  senderJidCandidates,
  jidsOverlap,
  findGroupParticipant,
} from './group-participant.js'

export const MICHI_MIN_COINS = 20
export const MINER_MIN_COINS = 450
export const BOMBA_MIN_COINS = 150

export function formatearBalance(jid, conn, participants = null) {
  const total = obtenerBalanceJugable(jid, conn, participants)
  const moneda = global.moneda || 'USD'
  return `${total} ${moneda}`
}

export const formatMichiBalance = formatearBalance

export function puedeJugarMiner(jid, conn, participants = null) {
  return obtenerBalanceJugable(jid, conn, participants) >= MINER_MIN_COINS
}

export function puedeJugarBomba(jid, conn, participants = null, bet = BOMBA_MIN_COINS) {
  return obtenerBalanceJugable(jid, conn, participants) >= Math.max(BOMBA_MIN_COINS, bet)
}

export function resolverUsuarioDb(jid, conn, participants = null) {
  const jids = participants?.length
    ? resolveTargetJids(jid, participants, conn)
    : senderJidCandidates(null, conn, [jid])

  const users = global.db?.data?.users || {}
  for (const id of jids) {
    if (users[id]) return { jid: id, user: users[id] }
  }

  const digitos = new Set(
    jids
      .map(j => String(j).split('@')[0].split(':')[0].replace(/\D/g, ''))
      .filter(d => d.length >= 6)
  )
  for (const [id, user] of Object.entries(users)) {
    const d = String(id).split('@')[0].split(':')[0].replace(/\D/g, '')
    if (d.length >= 6 && digitos.has(d)) return { jid: id, user }
  }

  const primario = jids[0] || jid
  return { jid: primario, user: users[primario] || null }
}

export function obtenerBalanceJugable(jid, conn, participants = null) {
  const { user } = resolverUsuarioDb(jid, conn, participants)
  if (!user) return 0
  return (Number(user.coins) || 0) + (Number(user.bancoDinero) || 0)
}

export function puedeJugarMichi(jid, conn, participants = null) {
  return obtenerBalanceJugable(jid, conn, participants) >= MICHI_MIN_COINS
}

export function esMismoJugador(a, b, conn, participants = null) {
  const aJids = participants?.length
    ? resolveTargetJids(a, participants, conn)
    : senderJidCandidates(null, conn, [a])
  const bJids = participants?.length
    ? resolveTargetJids(b, participants, conn)
    : senderJidCandidates(null, conn, [b])
  return jidsOverlap(aJids, bJids)
}

export function esOponenteInvitado(m, invite, conn, participants) {
  const objetivos = invite?.opponentJids?.length
    ? invite.opponentJids
    : [invite?.opponent].filter(Boolean)
  return jidsOverlap(senderJidCandidates(m, conn), objetivos)
}

export function obtenerNombreMostrar(jid, conn, participants = null) {
  const p = participants?.length ? findGroupParticipant(participants, jid, conn) : null
  if (p?.notify) return String(p.notify).replace(/[<>&"']/g, '').trim().slice(0, 18) || 'Jugador'
  if (p?.name) return String(p.name).replace(/[<>&"']/g, '').trim().slice(0, 18) || 'Jugador'
  const { user } = resolverUsuarioDb(jid, conn, participants)
  if (user?.name) return String(user.name).replace(/[<>&"']/g, '').trim().slice(0, 18) || 'Jugador'
  return String(jid?.split('@')[0] || 'Jugador').slice(0, 18)
}

export {
  formatearBalance as formatBalance,
  puedeJugarMiner as canPlayMiner,
  puedeJugarBomba as canPlayBomba,
  resolverUsuarioDb as resolveDbUser,
  obtenerBalanceJugable as getPlayableBalance,
  puedeJugarMichi as canPlayMichi,
  esMismoJugador as isSamePlayer,
  esOponenteInvitado as isInviteOpponent,
  obtenerNombreMostrar as getDisplayName
}
