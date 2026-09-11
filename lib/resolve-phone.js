/**
 * Resolución de número real (PN) desde LID / mensaje Baileys.
 * Prioridad según Baileys 7:
 * 1) número explícito (.code 521...)
 * 2) key.remoteJidAlt / key.participantAlt (PN que Baileys adjunta)
 * 3) signalRepository.lidMapping.getPNForLID(lid)
 * 4) participantes del grupo (phoneNumber / jid)
 * 5) mapeo ownerLid
 */

const CODIGOS_PAIS_VALIDOS = [
  '1', '7', '20', '27', '30', '31', '32', '33', '34', '36', '39', '40', '41', '43', '44', '45', '46', '47', '48', '49',
  '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '81', '82', '84', '86', '90',
  '91', '92', '93', '94', '95', '98', '211', '212', '213', '216', '218', '220', '221', '222', '223', '224', '225', '226',
  '227', '228', '229', '230', '231', '232', '233', '234', '235', '236', '237', '238', '239', '240', '241', '242', '243',
  '244', '245', '246', '248', '249', '250', '251', '252', '253', '254', '255', '256', '257', '258', '260', '261', '262',
  '263', '264', '265', '266', '267', '268', '269', '290', '291', '297', '298', '299', '350', '351', '352', '353', '354',
  '355', '356', '357', '358', '359', '370', '371', '372', '373', '374', '375', '376', '377', '378', '379', '380', '381',
  '382', '383', '385', '386', '387', '389', '420', '421', '423', '500', '501', '502', '503', '504', '505', '506', '507',
  '508', '509', '590', '591', '592', '593', '594', '595', '596', '597', '598', '599', '670', '672', '673', '674', '675',
  '676', '677', '678', '679', '680', '681', '682', '683', '685', '686', '687', '688', '689', '690', '691', '692', '850',
  '852', '853', '855', '856', '880', '886', '960', '961', '962', '963', '964', '965', '966', '967', '968', '970', '971',
  '972', '973', '974', '975', '976', '977', '978', '979', '992', '993', '994', '995', '996', '998'
]

export function esTelefonoWhatsAppValido(numero = '') {
  const n = String(numero).replace(/\D/g, '')
  const len = n.length
  if (len < 8 || len > 13) return false
  if (len > 10 && n.startsWith('9')) return false
  return CODIGOS_PAIS_VALIDOS.some((codigo) => n.startsWith(codigo))
}

export function esLidConocido(digits = '') {
  const n = String(digits).replace(/\D/g, '')
  if (!n) return false

  for (const [lid] of global.ownerLid || []) {
    if (String(lid).replace(/\D/g, '') === n) return true
  }

  return n.length >= 14
}

export function normalizarNumeroTelefono(phone = '') {
  let digitos = String(phone).replace(/\D/g, '')
  if (!digitos) return null

  if (digitos.includes(':')) digitos = digitos.split(':')[0]
  digitos = digitos.replace(/^0+/, '')

  if (digitos.startsWith('521') && digitos.length >= 12 && digitos.length <= 13) {

  } else if (digitos.startsWith('52') && !digitos.startsWith('521') && digitos.length === 12) {
    digitos = `521${digitos.slice(2)}`
  }

  if (!digitos || !esTelefonoWhatsAppValido(digitos)) return null
  return digitos
}

function decodificarSiPosible(conn, jid) {
  if (!jid) return ''
  try {
    return conn?.decodeJid?.(jid) || String(jid)
  } catch {
    return String(jid)
  }
}

function mismoUsuarioJid(a, b) {
  if (!a || !b) return false
  const na = String(a).split('@')[0].split(':')[0].replace(/\D/g, '')
  const nb = String(b).split('@')[0].split(':')[0].replace(/\D/g, '')
  return na.length > 5 && na === nb
}

function esJidPn(jid = '') {
  const j = String(jid)
  return j.endsWith('@s.whatsapp.net') || j.endsWith('@c.us') || j.endsWith('@hosted')
}

function esJidLid(jid = '') {
  const j = String(jid)
  return j.endsWith('@lid') || j.endsWith('@hosted.lid')
}

export function telefonoDesdeJid(jid = '') {
  const decodificado = String(jid || '').trim()
  if (!decodificado.includes('@')) return null

  const parteUsuario = decodificado.split('@')[0].split(':')[0]
  const digitos = parteUsuario.replace(/\D/g, '')
  if (!digitos || esLidConocido(digitos)) return null

  if (esJidPn(decodificado)) return normalizarNumeroTelefono(digitos)
  return null
}

function jidsAltDesdeMensaje(m) {
  if (!m) return []
  const keys = m.key || {}
  return [
    keys.participantAlt,
    keys.remoteJidAlt,
    m.participantAlt,
    m.remoteJidAlt,
    m.senderPn,
    m.participantPn
  ].filter(Boolean)
}

function jidsCandidatosDesdeMensaje(m, conn, jid) {
  const lista = [
    ...jidsAltDesdeMensaje(m),
    jid,
    m?.sender,
    m?.participant,
    m?.key?.participant,
    m?.key?.remoteJid,

    !m?.isGroup ? m?.chat : null,
    !m?.isGroup ? m?.key?.remoteJid : null
  ]
  return [...new Set(lista.filter(Boolean).map(j => decodificarSiPosible(conn, j)))]
}

function esNumeroMarcador(value = '') {
  const crudo = String(value || '').trim()
  if (!crudo) return true
  if (!/\d{8,}/.test(crudo.replace(/\D/g, ''))) return true
  return /^(tunumero|tu.?numero|your.?number|acael|numero|number|xxx+)/i.test(crudo)
}

function telefonoDesdeMapeoOwner(jid = '') {
  const crudo = String(jid).split('@')[0].split(':')[0].replace(/\D/g, '')
  if (!crudo) return null

  for (let i = 0; i < (global.ownerLid || []).length; i++) {
    const entradaLid = global.ownerLid[i]
    const numLid = String(entradaLid?.[0] || '').replace(/\D/g, '')
    if (numLid && numLid === crudo) {
      const coincidenciaOwner = (global.owner || []).find(o => o[1] === entradaLid[1])
      const candidatos = [coincidenciaOwner?.[0], global.owner?.[0]?.[0]].filter(Boolean)
      for (const candidato of candidatos) {
        if (esNumeroMarcador(candidato)) continue
        const telefono = normalizarNumeroTelefono(candidato)
        if (telefono) return telefono
      }
    }
  }

  for (const [number] of global.owner || []) {
    if (esNumeroMarcador(number)) continue
    const limpio = String(number).replace(/\D/g, '')
    if (limpio === crudo) {
      const telefono = normalizarNumeroTelefono(number)
      if (telefono) return telefono
    }
  }

  for (const [number] of global.mods || []) {
    if (esNumeroMarcador(number)) continue
    const limpio = String(number).replace(/\D/g, '')
    if (limpio === crudo) {
      const telefono = normalizarNumeroTelefono(number)
      if (telefono) return telefono
    }
  }

  return null
}

/**
 * Método oficial Baileys: LID → PN vía signalRepository.lidMapping
 */
async function telefonoDesdeMapeoLid(lidJid, conn) {
  const lid = decodificarSiPosible(conn, lidJid)
  if (!lid || !esJidLid(lid)) return null

  const mapeo = conn?.signalRepository?.lidMapping
  if (!mapeo || typeof mapeo.getPNForLID !== 'function') return null

  try {
    const pnJid = await mapeo.getPNForLID(lid)
    if (!pnJid) return null
    return telefonoDesdeJid(decodificarSiPosible(conn, pnJid) || pnJid)
  } catch (e) {
    console.error('[resolve-phone] getPNForLID:', e?.message || e)
    return null
  }
}

async function telefonoDesdeParticipantesGrupo(lidOrPn, conn, preferredGroup = null, participantsHint = null) {
  const objetivo = decodificarSiPosible(conn, lidOrPn)
  const numObjetivo = String(objetivo).split('@')[0].split(':')[0].replace(/\D/g, '')
  if (!numObjetivo) return null

  const probarLista = async (list) => {
    if (!Array.isArray(list) || !list.length) return null

    for (const p of list) {
      const pid = decodificarSiPosible(conn, p.id)
      const pJid = p.jid ? decodificarSiPosible(conn, p.jid) : ''
      const pLid = p.lid
        ? decodificarSiPosible(conn, p.lid.includes('@') ? p.lid : `${p.lid}@lid`)
        : ''
      const pTelefonoCrudo = p.phoneNumber
        ? (String(p.phoneNumber).includes('@')
          ? String(p.phoneNumber)
          : `${String(p.phoneNumber).replace(/\D/g, '')}@s.whatsapp.net`)
        : ''

      try {
        const mapeo = conn?.signalRepository?.lidMapping
        if (mapeo?.storeLIDPNMappings) {
          if (esJidLid(pid) && esJidPn(pTelefonoCrudo)) {
            await mapeo.storeLIDPNMappings([{ lid: pid, pn: decodificarSiPosible(conn, pTelefonoCrudo) || pTelefonoCrudo }])
          } else if (esJidPn(pid) && esJidLid(pLid)) {
            await mapeo.storeLIDPNMappings([{ lid: pLid, pn: pid }])
          }
        }
      } catch {}

      const coincide =
        mismoUsuarioJid(pid, objetivo) ||
        mismoUsuarioJid(pJid, objetivo) ||
        mismoUsuarioJid(pLid, objetivo) ||
        mismoUsuarioJid(pTelefonoCrudo, objetivo) ||
        (pLid && pLid.split('@')[0].split(':')[0].replace(/\D/g, '') === numObjetivo) ||
        (pid && pid.split('@')[0].split(':')[0].replace(/\D/g, '') === numObjetivo)

      if (!coincide) continue

      for (const candidato of [pTelefonoCrudo, pJid, pid]) {
        const telefono = telefonoDesdeJid(candidato)
        if (telefono) return telefono
      }
    }
    return null
  }

  const desdeHint = await probarLista(participantsHint)
  if (desdeHint) return desdeHint

  const idsChat = []
  if (preferredGroup?.endsWith?.('@g.us')) idsChat.push(preferredGroup)
  for (const id of Object.keys(conn?.chats || {})) {
    if (id.endsWith('@g.us') && !idsChat.includes(id)) idsChat.push(id)
  }

  for (const chatId of idsChat) {
    try {
      const meta = await conn.groupMetadata(chatId).catch(() => conn.chats?.[chatId]?.metadata || null)
      const telefono = await probarLista(meta?.participants || [])
      if (telefono) return telefono
    } catch {}
  }

  return null
}

/**
 * En algunos forks onWhatsApp devuelve { jid, lid } para un PN.
 * Baileys oficial NO acepta LID en onWhatsApp.
 */
async function telefonoDesdeOnWhatsAppPn(jid, conn) {
  if (!conn || typeof conn.onWhatsApp !== 'function') return null
  const decodificado = decodificarSiPosible(conn, jid)
  if (!decodificado || esJidLid(decodificado)) return null
  if (!esJidPn(decodificado) && !esTelefonoWhatsAppValido(String(decodificado).split('@')[0])) return null

  try {
    const resultado = await conn.onWhatsApp(decodificado)
    const entrada = resultado?.[0]
    if (!entrada?.jid) return null
    return telefonoDesdeJid(entrada.jid) || telefonoDesdeJid(decodificarSiPosible(conn, entrada.jid))
  } catch {
    return null
  }
}

export async function resolverNumeroTelefono(jid, conn, explicitPhone = null, m = null, options = {}) {
  const manual = normalizarNumeroTelefono(explicitPhone)
  if (manual && !esLidConocido(manual)) return manual

  const pistaParticipantes = options.participants || null
  const candidatos = jidsCandidatosDesdeMensaje(m, conn, jid)

  const conjeturaAutor = m?.key?.participantAlt || m?.key?.remoteJidAlt || m?.key?.participant || m?.key?.remoteJid
  if (conjeturaAutor) candidatos.unshift(decodificarSiPosible(conn, conjeturaAutor))

  for (const candidato of [...new Set(candidatos)]) {
    const telefono = telefonoDesdeJid(candidato)
    if (telefono) return telefono
  }

  for (const candidato of [...new Set(candidatos)]) {
    if (!esJidLid(candidato)) continue
    const telefono = await telefonoDesdeMapeoLid(candidato, conn)
    if (telefono) return telefono
  }

  const groupId = m?.isGroup ? (m.chat || m.key?.remoteJid) : (options.groupId || null)
  for (const candidato of [...new Set(candidatos)]) {
    const telefono = await telefonoDesdeParticipantesGrupo(candidato, conn, groupId, pistaParticipantes)
    if (telefono) return telefono
  }

  if (groupId?.endsWith?.('@g.us')) {
    for (const candidato of [...new Set(candidatos)]) {
      if (!esJidLid(candidato)) continue
      try {
        const real = await Promise.race([
          String.prototype.resolveLidToRealJid.call(candidato, groupId, conn, 1, 0),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
        ])
        const telefono = telefonoDesdeJid(decodificarSiPosible(conn, real))
        if (telefono) return telefono
      } catch {}
    }
  }

  for (const candidato of [...new Set(candidatos)]) {
    const telefono = telefonoDesdeMapeoOwner(candidato)
    if (telefono) return telefono
  }

  for (const candidato of [...new Set(candidatos)]) {
    const telefono = await telefonoDesdeOnWhatsAppPn(candidato, conn)
    if (telefono) return telefono
  }

  return null
}

export function extraerTelefonoDeArgs(args = []) {
  for (const arg of args) {
    if (!arg || /^(code|--code)$/i.test(String(arg).trim())) continue
    const telefono = normalizarNumeroTelefono(arg)
    if (telefono && !esLidConocido(telefono)) return telefono
  }
  return null
}

export function obtenerJidRespuestaPrivada(m, conn) {
  return decodificarSiPosible(conn, m?.chat) || m?.chat || m?.key?.remoteJid || ''
}

export async function enviarRespuestaPrivada(m, conn, text, options = {}) {
  const jid = obtenerJidRespuestaPrivada(m, conn)
  const { contextInfo, ...rest } = options
  return conn.sendMessage(jid, {
    text,
    ...(contextInfo ? { contextInfo } : {}),
    ...rest
  }, { quoted: m })
}

export {
  esTelefonoWhatsAppValido as isValidWhatsAppPhone,
  esLidConocido as isKnownLid,
  normalizarNumeroTelefono as normalizePhoneNumber,
  telefonoDesdeJid as phoneFromJid,
  resolverNumeroTelefono as resolvePhoneNumber,
  extraerTelefonoDeArgs as extractPhoneFromArgs,
  obtenerJidRespuestaPrivada as getPrivateReplyJid,
  enviarRespuestaPrivada as sendPrivateReply
}
