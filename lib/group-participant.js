/**
 * Empareja sender ↔ participante de grupo con Baileys (LID + PN).
 
 */

function decodificarSiPosible(conn, jid) {
  if (!jid) return ''
  try {
    return conn?.decodeJid?.(jid) || String(jid)
  } catch {
    return String(jid)
  }
}

function digitosUsuario(jid = '') {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '')
}


function tipoJid(jid = '') {
  const s = String(jid || '')
  if (s.includes('@lid') || s.includes('hosted.lid')) return 'lid'
  if (s.includes('@s.whatsapp.net') || s.includes('@c.us')) return 'pn'
  return 'other'
}

function comoJidLid(value) {
  if (!value) return ''
  const s = String(value)
  if (s.includes('@')) return s
  return `${s.replace(/\D/g, '')}@lid`
}

function comoJidPn(value) {
  if (!value) return ''
  const s = String(value)
  if (s.includes('@')) return s
  const digitos = s.replace(/\D/g, '')
  return digitos ? `${digitos}@s.whatsapp.net` : ''
}

export function jidsParticipante(p, conn) {
  if (!p) return []
  const lista = [
    p.id,
    p.jid,
    p.lid ? comoJidLid(p.lid) : '',
    p.phoneNumber ? comoJidPn(p.phoneNumber) : '',
  ]
    .filter(Boolean)
    .map(j => decodificarSiPosible(conn, j))
  return [...new Set(lista.filter(Boolean))]
}

export function candidatosJidRemitente(m, conn, extra = []) {
  if (!m && !extra.length) return []

  const delMensaje = m
    ? [
        m.sender,
        m.participant,
        m.key?.participant,
        m.key?.participantAlt,
        m.key?.remoteJid,
        m.key?.remoteJidAlt,
        
        !m.isGroup ? m.chat : null,
        m.senderPn,
        m.participantPn,
        m.participantAlt,
      ]
    : []

  const lista = [...delMensaje, ...extra]
    .filter(Boolean)
    .map(j => decodificarSiPosible(conn, j))
    .filter(j => j && !String(j).endsWith('@g.us') && !String(j).endsWith('@broadcast'))

  // Variantes del MISMO tipo (nunca teléfono→@lid ni LID→@s.whatsapp.net).
  // Cruzar tipos hacía que un user coincidiera con un admin distinto.
  const ampliados = []
  for (const j of lista) {
    ampliados.push(j)
    const digitos = digitosUsuario(j)
    if (digitos.length < 6) continue
    const tipo = tipoJid(j)
    if (tipo === 'pn') {
      ampliados.push(`${digitos}@s.whatsapp.net`, `${digitos}@c.us`)
    } else if (tipo === 'lid') {
      ampliados.push(`${digitos}@lid`, `${digitos}@hosted.lid`)
    }
  }

  return [...new Set(ampliados.filter(Boolean))]
}

function indexarJids(jids) {
  const exactos = new Set()
  const lids = new Set()
  const pns = new Set()

  for (const valor of jids || []) {
    const jid = String(valor)
    exactos.add(jid)
    const digitos = digitosUsuario(jid)
    if (digitos.length < 6) continue

    const tipo = tipoJid(jid)
    if (tipo === 'lid') lids.add(digitos)
    else if (tipo === 'pn') pns.add(digitos)
  }

  return { exactos, lids, pns }
}

function coincideConIndiceJids(jids, indice) {
  for (const valor of jids || []) {
    const jid = String(valor)
    if (indice.exactos.has(jid)) return true

    const digitos = digitosUsuario(jid)
    if (digitos.length < 6) continue

    const tipo = tipoJid(jid)
    if (tipo === 'lid' && indice.lids.has(digitos)) return true
    if (tipo === 'pn' && indice.pns.has(digitos)) return true
  }

  return false
}

const indicesParticipantes = new WeakMap()

function crearIndiceParticipantes(participants, conn) {
  const porJid = new Map()
  const porLid = new Map()
  const porPn = new Map()
  const porDigitos = new Map()

  const registrar = (mapa, clave, entrada) => {
    if (!mapa.has(clave)) mapa.set(clave, entrada)
  }

  participants.forEach((participante, posicion) => {
    const entrada = { participante, posicion }
    entrada.digitos = new Set()
    for (const jid of jidsParticipante(participante, conn)) {
      registrar(porJid, jid, entrada)
      const digitos = digitosUsuario(jid)
      if (digitos.length < 6) continue
      entrada.digitos.add(digitos)
      const tipo = tipoJid(jid)
      if (tipo === 'lid') registrar(porLid, digitos, entrada)
      else if (tipo === 'pn') registrar(porPn, digitos, entrada)
    }
    for (const digitos of entrada.digitos) {
      if (!porDigitos.has(digitos)) porDigitos.set(digitos, [])
      porDigitos.get(digitos).push(entrada)
    }
  })

  return { porJid, porLid, porPn, porDigitos }
}

function obtenerIndiceParticipantes(participants, conn) {
  if (!conn || (typeof conn !== 'object' && typeof conn !== 'function')) {
    return crearIndiceParticipantes(participants, conn)
  }

  let indicesPorConexion = indicesParticipantes.get(participants)
  if (!indicesPorConexion) {
    indicesPorConexion = new WeakMap()
    indicesParticipantes.set(participants, indicesPorConexion)
  }

  let indice = indicesPorConexion.get(conn)
  if (!indice) {
    indice = crearIndiceParticipantes(participants, conn)
    indicesPorConexion.set(conn, indice)
  }
  return indice
}

export function invalidarIndiceParticipantes(participants) {
  if (participants && typeof participants === 'object') {
    indicesParticipantes.delete(participants)
  }
}

export function participanteCoincideConIdentidadActiva(idsBot, activo, participants, conn) {
  if (!Array.isArray(participants) || !participants.length || !activo) return false
  const indice = obtenerIndiceParticipantes(participants, conn)
  const candidatos = new Set()
  for (const id of idsBot || []) {
    const digitos = digitosUsuario(id)
    if (digitos.length < 6) continue
    for (const entrada of indice.porDigitos.get(digitos) || []) {
      candidatos.add(entrada)
    }
  }

  const ordenados = [...candidatos].sort((a, b) => a.posicion - b.posicion)
  return ordenados.some(entrada => entrada.digitos.has(String(activo)))
}

export function algunParticipanteCoincideConIds(ids, participants, conn) {
  if (!Array.isArray(participants) || !participants.length) return false
  const indice = obtenerIndiceParticipantes(participants, conn)
  for (const id of ids || []) {
    const digitos = digitosUsuario(id)
    if (digitos.length >= 6 && indice.porDigitos.has(digitos)) return true
    if (indice.porJid.has(String(id))) return true
  }
  return false
}

export function jidsSeSolapan(aList, bList) {
  return coincideConIndiceJids(bList, indexarJids(aList))
}

export function resolverJidsObjetivo(who, participants, conn) {
  const base = candidatosJidRemitente(null, conn, [who].filter(Boolean))
  const p = buscarParticipanteGrupo(participants, who, conn)
  const delParticipante = jidsParticipante(p, conn)
  return [...new Set([...base, ...delParticipante].filter(Boolean))]
}

export function esRemitenteMuteado(mutedList, m, conn, participants) {
  if (!Array.isArray(mutedList) || !mutedList.length) return false

  const idsRemitente = candidatosJidRemitente(m, conn)
  if (jidsSeSolapan(idsRemitente, mutedList)) return true

  const p = buscarParticipanteGrupo(participants, m, conn)
  if (p && jidsSeSolapan(jidsParticipante(p, conn), mutedList)) return true

  return false
}

export function quitarCoincidenciasMuteadas(mutedList, targetJids) {
  if (!Array.isArray(mutedList)) return []
  const objetivos = Array.isArray(targetJids) ? targetJids : [targetJids]
  return mutedList.filter(j => !jidsSeSolapan([j], objetivos))
}

/**
 * Busca el participante que corresponde al mensaje / jid.
 * @param {Array} participants
 * @param {object|string|string[]} mOrJid - mensaje, jid, o lista de jids
 * @param {object} conn
 */
export function buscarParticipanteGrupo(participants, mOrJid, conn) {
  if (!Array.isArray(participants) || !participants.length) return null

  let objetivos = []
  if (mOrJid && typeof mOrJid === 'object' && !Array.isArray(mOrJid) && (mOrJid.key || mOrJid.sender)) {
    objetivos = candidatosJidRemitente(mOrJid, conn)
  } else if (Array.isArray(mOrJid)) {
    objetivos = candidatosJidRemitente(null, conn, mOrJid)
  } else if (mOrJid) {
    objetivos = candidatosJidRemitente(null, conn, [mOrJid])
  }

  if (!objetivos.length) return null

  const indice = obtenerIndiceParticipantes(participants, conn)
  let mejorCoincidencia = null
  const considerar = (entrada) => {
    if (entrada && (!mejorCoincidencia || entrada.posicion < mejorCoincidencia.posicion)) {
      mejorCoincidencia = entrada
    }
  }

  for (const jid of objetivos) {
    considerar(indice.porJid.get(jid))
    const digitos = digitosUsuario(jid)
    if (digitos.length < 6) continue
    const tipo = tipoJid(jid)
    if (tipo === 'lid') considerar(indice.porLid.get(digitos))
    else if (tipo === 'pn') considerar(indice.porPn.get(digitos))
  }
  return mejorCoincidencia?.participante || null
}

function esJidLid(jid = '') {
  return String(jid).endsWith('@lid') || String(jid).endsWith('@hosted.lid')
}

function esJidPn(jid = '') {
  return String(jid).endsWith('@s.whatsapp.net') || String(jid).endsWith('@c.us')
}

async function expandirJidsPorMapeo(conn, jids) {
  const expandidos = new Set(jids)
  const lidMapping = conn?.signalRepository?.lidMapping
  if (!lidMapping) return [...expandidos]

  for (const jid of jids) {
    try {
      if (esJidLid(jid)) {
        const pn = await lidMapping.getPNForLID?.(jid)
        if (pn) expandidos.add(decodificarSiPosible(conn, pn))
      } else if (esJidPn(jid)) {
        const lid = await lidMapping.getLIDForPN?.(jid)
        if (lid) expandidos.add(decodificarSiPosible(conn, lid))
      }
    } catch (error) {
      console.warn(`No se pudo resolver el identificador del participante ${jid}:`, error?.message || error)
    }
  }

  return [...expandidos]
}

export async function buscarParticipanteGrupoActual(conn, chatId, objetivo, participantesAnteriores = []) {
  const candidatos = candidatosJidRemitente(null, conn, Array.isArray(objetivo) ? objetivo : [objetivo])
  if (!candidatos.length) return { participante: null, participantes: participantesAnteriores }

  let metadataActual = null
  try {
    metadataActual = await conn.groupMetadata(chatId)
  } catch (error) {
    console.warn(`No se pudo actualizar la lista de participantes de ${chatId}:`, error?.message || error)
  }

  const participantes = metadataActual?.participants?.length
    ? metadataActual.participants
    : participantesAnteriores
  if (metadataActual?.participants?.length && conn?.chats?.[chatId]) {
    conn.chats[chatId].metadata = metadataActual
  }
  let participante = buscarParticipanteGrupo(participantes, candidatos, conn)
  if (participante) return { participante, participantes }

  const candidatosExpandidos = await expandirJidsPorMapeo(conn, candidatos)
  participante = buscarParticipanteGrupo(participantes, candidatosExpandidos, conn)
  return { participante, participantes }
}

export async function quitarParticipanteActual(conn, chatId, objetivo, participantesAnteriores = []) {
  if (!conn?.groupParticipantsUpdate || !chatId || !objetivo) {
    return { ok: false, reason: 'invalid_target', participante: null, participantes: participantesAnteriores }
  }

  const { participante, participantes } = await buscarParticipanteGrupoActual(
    conn,
    chatId,
    objetivo,
    participantesAnteriores
  )
  if (!participante) {
    return { ok: false, reason: 'not_in_group', participante: null, participantes }
  }

  const jid = participante.id || participante.jid || jidsParticipante(participante, conn)[0]
  if (!jid) return { ok: false, reason: 'missing_jid', participante, participantes }

  try {
    const resultado = await conn.groupParticipantsUpdate(chatId, [jid], 'remove')
    const fallido = Array.isArray(resultado) && resultado.find(entrada => {
      const status = Number(entrada?.status)
      return Number.isFinite(status) && status !== 200
    })
    if (fallido) {
      return {
        ok: false,
        reason: 'remove_failed',
        status: Number(fallido.status),
        participante,
        participantes
      }
    }
    return { ok: true, reason: null, participante, participantes }
  } catch (error) {
    console.error(`No se pudo expulsar ${jid} de ${chatId}:`, error?.message || error)
    return { ok: false, reason: 'remove_failed', participante, participantes, error }
  }
}

export function obtenerBanderasAdminParticipante(participants, mOrJid, conn) {
  const user = buscarParticipanteGrupo(participants, mOrJid, conn) || {}
  const isRAdmin = user?.admin === 'superadmin'
  const isAdmin = isRAdmin || user?.admin === 'admin'
  return { user, isRAdmin: !!isRAdmin, isAdmin: !!isAdmin }
}

export function buscarParticipanteBot(participants, conn) {
  const idsBot = [
    conn?.user?.jid,
    conn?.user?.id,
    conn?.user?.lid,
    conn?.phoneNumber,
    conn?.botNumber,
    conn?.authState?.creds?.me?.id,
    conn?.authState?.creds?.me?.jid,
    conn?.authState?.creds?.me?.lid,
  ].filter(Boolean)
  const hallado = buscarParticipanteGrupo(participants, idsBot, conn)
  if (hallado) return hallado
  if (!Array.isArray(participants) || !participants.length) return null

  const numeros = new Set(idsBot.map(digitosUsuario).filter(d => d.length >= 6))
  if (!numeros.size) return null
  for (const p of participants) {
    const delParticipante = jidsParticipante(p, conn).map(digitosUsuario)
    if (delParticipante.some(d => numeros.has(d))) return p
  }
  return null
}

export async function buscarParticipanteBotActual(conn, participants) {
  const idsBot = [
    conn?.user?.jid,
    conn?.user?.id,
    conn?.user?.lid,
    conn?.phoneNumber,
    conn?.botNumber,
    conn?.authState?.creds?.me?.id,
    conn?.authState?.creds?.me?.jid,
    conn?.authState?.creds?.me?.lid,
  ].filter(Boolean)
  const candidatos = new Set(idsBot.map(id => decodificarSiPosible(conn, id)))
  const lidMapping = conn?.signalRepository?.lidMapping

  for (const jid of candidatos) {
    try {
      if (tipoJid(jid) === 'lid') {
        const pn = await lidMapping?.getPNForLID?.(jid)
        if (pn) candidatos.add(decodificarSiPosible(conn, pn))
      } else if (tipoJid(jid) === 'pn') {
        const lid = await lidMapping?.getLIDForPN?.(jid)
        if (lid) candidatos.add(decodificarSiPosible(conn, lid))
      }
    } catch (error) {
      console.warn(`No se pudo resolver la identidad del bot ${jid}:`, error?.message || error)
    }
  }

  return buscarParticipanteGrupo(participants, [...candidatos], conn) ||
    buscarParticipanteBot(participants, conn)
}

export function esRolAdministrador(rol) {
  return rol === true || rol === 'admin' || rol === 'superadmin'
}

export function esParticipanteBotAdmin(participants, conn) {
  const bot = buscarParticipanteBot(participants, conn)
  return esRolAdministrador(bot?.admin)
}

export function recolectarConexionesBot(preferredConn) {
  const lista = []
  const vistos = new Set()
  const agregar = (c) => {
    if (!c?.sendMessage) return
    const id = c.user?.jid || c.user?.id || c
    if (vistos.has(id)) return
    vistos.add(id)
    lista.push(c)
  }
  agregar(preferredConn)
  agregar(global.conn)
  if (Array.isArray(global.conns)) global.conns.forEach(agregar)
  return lista
}

/** Devuelve la conexion (bot principal o sub-bot) que sea admin en el grupo. */
export function buscarConnBotAdmin(participants, preferredConn) {
  for (const c of recolectarConexionesBot(preferredConn)) {
    if (esParticipanteBotAdmin(participants, c)) return c
  }
  return null
}

export {
  jidsParticipante as participantJids,
  candidatosJidRemitente as senderJidCandidates,
  jidsSeSolapan as jidsOverlap,
  resolverJidsObjetivo as resolveTargetJids,
  esRemitenteMuteado as isSenderMuted,
  quitarCoincidenciasMuteadas as removeMutedMatches,
  buscarParticipanteGrupo as findGroupParticipant,
  buscarParticipanteGrupoActual as findCurrentGroupParticipant,
  quitarParticipanteActual as removeCurrentGroupParticipant,
  obtenerBanderasAdminParticipante as getParticipantAdminFlags,
  buscarParticipanteBot as findBotParticipant,
  buscarParticipanteBotActual as findCurrentBotParticipant,
  esRolAdministrador as isAdminRole,
  esParticipanteBotAdmin as isBotParticipantAdmin,
  recolectarConexionesBot as collectBotConnections,
  buscarConnBotAdmin as findAdminBotConn
}
