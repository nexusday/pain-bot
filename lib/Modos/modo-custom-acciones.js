/**
 * Acciones de moderación para Modo Custom.
 * Reutiliza la misma lógica de ban/mute/warn/del (sin tocar admins/owners/bot).
 */

import {
  findGroupParticipant,
  findBotParticipant,
  jidsParticipante,
  jidsSeSolapan
} from '../group-participant.js'
import { resolveGroupTarget, isOwnerJid, findWarningKey } from '../resolve-group-target.js'

export const ACCIONES_VALIDAS = ['ban', 'del', 'mute', 'unmute', 'warn', 'delwarn']

const ALIAS_ACCION = {
  ban: 'ban',
  kick: 'ban',
  banear: 'ban',
  expulsar: 'ban',
  sacar: 'ban',
  echar: 'ban',
  del: 'del',
  delete: 'del',
  eliminar: 'del',
  borrar: 'del',
  mute: 'mute',
  mutear: 'mute',
  silenciar: 'mute',
  unmute: 'unmute',
  delmute: 'unmute',
  desmutear: 'unmute',
  desmute: 'unmute',
  warn: 'warn',
  advertir: 'warn',
  advertencia: 'warn',
  warning: 'warn',
  delwarn: 'delwarn',
  delwarns: 'delwarn',
  quitarwarn: 'delwarn',
  quitaradvertencia: 'delwarn',
  limpiarwarn: 'delwarn',
  limpiaradvertencias: 'delwarn',
  unwarn: 'delwarn'
}

export function normalizarListaAcciones(crudo = '') {
  const texto = String(crudo || '').trim().toLowerCase()
  if (!texto) return []

  // |all → todas las acciones admin
  if (
    texto === 'all' ||
    texto === 'todas' ||
    texto === 'todo' ||
    texto === '*' ||
    /(^|[,|;/\s])(all|todas|todo|\*)([,|;/\s]|$)/.test(texto)
  ) {
    return [...ACCIONES_VALIDAS]
  }

  const partes = texto
    .split(/[,|;/\s]+/)
    .map(p => p.trim().toLowerCase())
    .filter(Boolean)

  const out = []
  for (const p of partes) {
    if (p === 'all' || p === 'todas' || p === 'todo' || p === '*') {
      return [...ACCIONES_VALIDAS]
    }
    const key = ALIAS_ACCION[p]
    if (key && !out.includes(key)) out.push(key)
  }
  return out
}

export function normalizarAccionUnica(valor = '') {
  const key = ALIAS_ACCION[String(valor || '').toLowerCase().trim()]
  return key || null
}

/** Detecta pedido claro de un admin en lenguaje natural. */
export function detectarAccionDesdeTexto(texto = '', accionesPermitidas = []) {
  const permitidas = new Set(accionesPermitidas || [])
  const t = String(texto || '').toLowerCase()

  const pruebas = [
    {
      id: 'delwarn',
      re: /\b(delwarn|unwarn|quita(?:le|r)?\s+(?:el\s+|la\s+)?(?:warn|advertencia)s?|elimina(?:r)?\s+(?:el\s+|la\s+)?(?:warn|advertencia)s?|limpia(?:r)?\s+(?:el\s+|las\s+)?(?:warn|advertencia)s?|sacar?\s+(?:el\s+|la\s+)?(?:warn|advertencia)s?)\b/
    },
    {
      id: 'ban',
      re: /\b(banea|banear|banéalo|banealo|ban|kick|expulsa|expulsar|saca(?:lo|la)?|echar?lo|elimina(?:r)?\s+a)\b/
    },
    {
      id: 'del',
      re: /\b(borra(?:r)?(?:\s+(?:eso|el\s+mensaje|ese\s+mensaje))?|elimina(?:r)?\s+(?:el\s+mensaje|ese\s+mensaje|eso)|delete|borra\b|\bdel\b)\b/
    },
    {
      id: 'mute',
      re: /\b(mutea|mutear|mutealo|muétalo|silencia|silenciar|mute)\b/
    },
    {
      id: 'unmute',
      re: /\b(desmutea|desmutear|unmute|delmute|quita(?:le)?\s+el\s+mute|sacar?\s+mute)\b/
    },
    {
      id: 'warn',
      re: /\b(advierte|advertir|advertise|warn|warning|amonesta|amonestar)\b/
    }
  ]

  for (const p of pruebas) {
    if (permitidas.has(p.id) && p.re.test(t)) return p.id
  }
  return null
}

export function etiquetaAcciones(acciones = []) {
  if (!acciones?.length) return 'ninguna'
  return acciones.join(', ')
}

function esAdminParticipante(p) {
  return p?.admin === 'admin' || p?.admin === 'superadmin'
}

export async function esAdminOOwnerGrupo(m, conn, participants = []) {
  const usuario = findGroupParticipant(participants, m, conn) || {}
  if (esAdminParticipante(usuario)) return true

  const esOwner =
    global.owner?.some(
      ([numero]) =>
        String(numero).replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender
    ) ||
    global.ownerLid?.some(
      ([numero]) => String(numero).replace(/[^0-9]/g, '') + '@lid' === m.sender
    ) ||
    m.sender === conn.user?.jid

  return Boolean(esOwner)
}

export async function botEsAdminGrupo(conn, participants = []) {
  const botPart = findBotParticipant(participants, conn)
  return botPart?.admin === 'admin' || botPart?.admin === 'superadmin'
}

/**
 * Ejecuta una acción de moderación.
 * @returns {{ ok: boolean, detail?: string, quien?: string }}
 */
export async function ejecutarAccionModoCustom({
  accion,
  m,
  conn,
  participants = [],
  motivo = 'Modo personalizado'
}) {
  const accionNorm = normalizarAccionUnica(accion)
  if (!accionNorm) return { ok: false, detail: 'accion_invalida' }

  if (accionNorm === 'del') {
    if (!m.quoted) return { ok: false, detail: 'falta_respuesta' }

    const quotedSender =
      (typeof m.quoted.sender === 'string' && m.quoted.sender) ||
      m.msg?.contextInfo?.participant ||
      null

    if (quotedSender) {
      const partCitado = findGroupParticipant(participants, { sender: quotedSender }, conn)
      if (esAdminParticipante(partCitado)) {
        return { ok: false, detail: 'objetivo_admin' }
      }
      if (isOwnerJid([quotedSender], conn)) {
        return { ok: false, detail: 'objetivo_owner' }
      }
    }

    const idMensaje = m.msg?.contextInfo?.stanzaId || m.quoted?.id
    if (!idMensaje) return { ok: false, detail: 'sin_id_mensaje' }

    try {
      await conn.sendMessage(m.chat, {
        delete: {
          remoteJid: m.chat,
          fromMe: false,
          id: idMensaje,
          participant: m.msg?.contextInfo?.participant || quotedSender || m.chat
        }
      })
      return { ok: true, quien: quotedSender || '', detail: 'mensaje_eliminado' }
    } catch (e) {
      console.error('[modo-custom] del:', e)
      return { ok: false, detail: 'error_del' }
    }
  }

  // ban / mute / unmute / warn necesitan objetivo
  const objetivo = await resolveGroupTarget(m, [], conn, participants)
  if (!objetivo.ok) {
    return {
      ok: false,
      detail: objetivo.reason === 'not_in_group' ? 'no_en_grupo' : 'falta_objetivo'
    }
  }

  const { quien, participante, ids } = objetivo
  const botPart = findBotParticipant(participants, conn)
  const idsBot = jidsParticipante(botPart, conn).concat(
    [conn.user?.jid, conn.user?.id].filter(Boolean)
  )

  if (jidsSeSolapan(ids, idsBot)) return { ok: false, detail: 'objetivo_bot' }
  // ban/mute/warn no aplican a admins; delwarn sí puede limpiar warns de cualquiera (excepto bot/owner)
  if (accionNorm !== 'delwarn') {
    if (esAdminParticipante(participante)) return { ok: false, detail: 'objetivo_admin' }
  }
  if (isOwnerJid(ids, conn)) return { ok: false, detail: 'objetivo_owner' }

  if (accionNorm === 'ban') {
    try {
      await conn.groupParticipantsUpdate(m.chat, [quien], 'remove')
      if (!global.db.data.users[quien]) global.db.data.users[quien] = {}
      global.db.data.users[quien].banned = true
      return { ok: true, quien, detail: 'baneado' }
    } catch (e) {
      console.error('[modo-custom] ban:', e)
      return { ok: false, detail: 'error_ban' }
    }
  }

  if (accionNorm === 'mute' || accionNorm === 'unmute') {
    if (!global.db.data.muted) global.db.data.muted = {}
    if (!global.db.data.muted[m.chat]) global.db.data.muted[m.chat] = []
    const silenciados = global.db.data.muted[m.chat]
    const ya = jidsSeSolapan(silenciados, ids)

    if (accionNorm === 'mute') {
      if (ya) return { ok: false, detail: 'ya_muteado' }
      for (const jidUsuario of ids) {
        if (!silenciados.includes(jidUsuario)) silenciados.push(jidUsuario)
      }
      return { ok: true, quien, detail: 'muteado' }
    }

    if (!ya) return { ok: false, detail: 'no_muteado' }
    global.db.data.muted[m.chat] = silenciados.filter(j => !jidsSeSolapan([j], ids))
    return { ok: true, quien, detail: 'desmuteado' }
  }

  if (accionNorm === 'warn') {
    if (!global.db.data.warnings) global.db.data.warnings = {}
    if (!global.db.data.warnings[m.chat]) global.db.data.warnings[m.chat] = {}
    if (!global.db.data.warnings[m.chat][quien]) {
      global.db.data.warnings[m.chat][quien] = { count: 0, warnings: [] }
    }

    const advertenciasUsuario = global.db.data.warnings[m.chat][quien]
    advertenciasUsuario.count++
    advertenciasUsuario.warnings.push({
      reason: String(motivo || 'Sin motivo').slice(0, 120),
      admin: m.sender,
      date: new Date().toISOString(),
      timestamp: Date.now()
    })

    if (advertenciasUsuario.count >= 3) {
      try {
        await conn.groupParticipantsUpdate(m.chat, [quien], 'remove')
        if (!global.db.data.users[quien]) global.db.data.users[quien] = {}
        global.db.data.users[quien].banned = true
        delete global.db.data.warnings[m.chat][quien]
        return { ok: true, quien, detail: 'warn_expulsado', count: 3 }
      } catch (e) {
        console.error('[modo-custom] warn kick:', e)
        return { ok: true, quien, detail: 'warn_ok', count: 3 }
      }
    }

    return {
      ok: true,
      quien,
      detail: 'warn_ok',
      count: advertenciasUsuario.count
    }
  }

  if (accionNorm === 'delwarn') {
    if (!global.db.data.warnings) global.db.data.warnings = {}
    if (!global.db.data.warnings[m.chat]) global.db.data.warnings[m.chat] = {}

    const clave =
      findWarningKey(m.chat, ids) ||
      (global.db.data.warnings[m.chat][quien] ? quien : null)

    if (!clave || !global.db.data.warnings[m.chat][clave]?.count) {
      return { ok: false, detail: 'sin_warns', quien }
    }

    const anteriores = global.db.data.warnings[m.chat][clave].count
    delete global.db.data.warnings[m.chat][clave]
    return { ok: true, quien, detail: 'warns_limpiados', count: anteriores }
  }

  return { ok: false, detail: 'accion_invalida' }
}

export function mensajeErrorAccion(detail = '') {
  const mapa = {
    falta_respuesta: 'Necesito que respondas al mensaje que quieres borrar.',
    falta_objetivo: 'Menciona o responde al usuario objetivo.',
    no_en_grupo: 'Ese usuario no está en el grupo.',
    objetivo_admin: 'No puedo aplicar eso a un administrador.',
    objetivo_owner: 'No puedo aplicar eso a un owner del bot.',
    objetivo_bot: 'No puedo aplicarme eso a mí mismo.',
    ya_muteado: 'Ese usuario ya está muteado.',
    no_muteado: 'Ese usuario no está muteado.',
    error_ban: 'No pude banear (¿soy admin?).',
    error_del: 'No pude eliminar el mensaje.',
    sin_id_mensaje: 'No encontré el mensaje a eliminar.',
    sin_warns: 'Ese usuario no tiene advertencias.',
    warns_limpiados: 'Advertencias eliminadas.',
    accion_invalida: 'Esa acción no está disponible.'
  }
  return mapa[detail] || 'No pude completar la acción.'
}
