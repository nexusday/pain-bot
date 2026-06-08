const VALID_COUNTRY_CODES = [
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

export function isValidWhatsAppPhone(numero = '') {
  const n = String(numero).replace(/\D/g, '')
  const len = n.length
  if (len < 8 || len > 13) return false
  if (len > 10 && n.startsWith('9')) return false
  return VALID_COUNTRY_CODES.some((codigo) => n.startsWith(codigo))
}

export function isKnownLid(digits = '') {
  const n = String(digits).replace(/\D/g, '')
  if (!n) return false

  for (const [lid] of global.ownerLid || []) {
    if (String(lid).replace(/\D/g, '') === n) return true
  }

  return n.length >= 14
}

export function normalizePhoneNumber(phone = '') {
  let digits = String(phone).replace(/\D/g, '')
  if (!digits || !isValidWhatsAppPhone(digits)) return null

  if (digits.startsWith('52') && digits.length === 12) {
    digits = `521${digits.slice(2)}`
  } else if (digits.startsWith('52') && digits.length > 12) {
    digits = `521${digits.slice(2)}`
  } else if (digits.startsWith('0')) {
    digits = digits.replace(/^0/, '')
  }

  return isValidWhatsAppPhone(digits) ? digits : null
}

function sameJidUser(a, b) {
  if (!a || !b) return false
  const na = String(a).split('@')[0].replace(/\D/g, '')
  const nb = String(b).split('@')[0].replace(/\D/g, '')
  return na.length > 5 && na === nb
}

function phoneFromJid(jid = '') {
  const decoded = String(jid).trim()
  if (!decoded.includes('@')) return null

  const digits = decoded.split('@')[0].replace(/\D/g, '')
  if (!digits || isKnownLid(digits)) return null

  if (decoded.endsWith('@s.whatsapp.net') || decoded.endsWith('@c.us')) {
    return normalizePhoneNumber(digits)
  }

  return null
}

function altJidsFromMessage(m) {
  if (!m) return []
  return [
    m.key?.remoteJidAlt,
    m.key?.participantAlt
  ].filter(Boolean)
}

function phoneFromOwnerMapping(jid = '') {
  const raw = String(jid).split('@')[0].replace(/\D/g, '')
  if (!raw) return null

  for (let i = 0; i < (global.ownerLid || []).length; i++) {
    const lidEntry = global.ownerLid[i]
    const lidNum = String(lidEntry?.[0] || '').replace(/\D/g, '')
    if (lidNum && lidNum === raw) {
      const ownerMatch = (global.owner || []).find(o => o[1] === lidEntry[1])
      if (ownerMatch?.[0]) return normalizePhoneNumber(ownerMatch[0])
      if (global.owner?.[0]?.[0]) return normalizePhoneNumber(global.owner[0][0])
    }
  }

  for (const [number] of global.owner || []) {
    const clean = String(number).replace(/\D/g, '')
    if (clean === raw) return normalizePhoneNumber(number)
  }

  for (const [number] of global.mods || []) {
    const clean = String(number).replace(/\D/g, '')
    if (clean === raw) return normalizePhoneNumber(number)
  }

  return null
}

async function collectUserJids(m, conn, seeds = []) {
  const jids = new Set()
  const add = (jid) => {
    if (!jid || typeof jid !== 'string') return
    const decoded = conn.decodeJid(jid)
    if (!decoded || decoded === 'status@broadcast' || decoded.endsWith('@g.us')) return
    jids.add(decoded)
  }

  for (const seed of seeds) add(seed)

  if (m?.isGroup) {
    try {
      const meta = conn.chats?.[m.chat]?.metadata || await conn.groupMetadata(m.chat).catch(() => null)
      const targets = [...jids]
      for (const p of meta?.participants || []) {
        const pid = conn.decodeJid(p.id)
        if (targets.some(t => t === pid || sameJidUser(t, pid))) {
          add(pid)
          if (p.phoneNumber) add(`${String(p.phoneNumber).replace(/\D/g, '')}@s.whatsapp.net`)
          if (p.lid) add(p.lid.includes('@') ? p.lid : `${p.lid}@lid`)
        }
      }
    } catch {}
  }

  const resolved = []
  for (const jid of jids) {
    if (!jid.includes('@lid') || !m?.isGroup) {
      resolved.push(jid)
      continue
    }
    try {
      const real = await Promise.race([
        String.prototype.resolveLidToRealJid.call(jid, m.chat, conn),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000))
      ])
      if (typeof real === 'string' && real) resolved.push(conn.decodeJid(real))
    } catch {}
    resolved.push(jid)
  }

  return [...new Set(resolved)]
}

async function phoneFromGroupParticipants(lidJid, conn) {
  const lidNum = String(lidJid).split('@')[0].replace(/\D/g, '')
  if (!lidNum) return null

  const chats = conn.chats || {}
  for (const chatId of Object.keys(chats)) {
    if (!chatId.endsWith('@g.us')) continue
    try {
      const meta = chats[chatId]?.metadata || await conn.groupMetadata(chatId).catch(() => null)
      for (const p of meta?.participants || []) {
        const pid = conn.decodeJid(p.id)
        const pLid = p.lid ? (p.lid.includes('@') ? p.lid : `${p.lid}@lid`) : null
        const pLidNum = pLid ? pLid.split('@')[0].replace(/\D/g, '') : ''

        const matches = pid === lidJid
          || pLid === lidJid
          || pLidNum === lidNum
          || sameJidUser(pid, lidJid)

        if (matches && p.phoneNumber) {
          const phone = normalizePhoneNumber(p.phoneNumber)
          if (phone) return phone
        }
      }
    } catch {}
  }

  return null
}

async function phoneFromOnWhatsApp(jid, conn) {
  if (!conn || typeof conn.onWhatsApp !== 'function') return null

  const candidates = new Set()
  const decoded = conn.decodeJid?.(jid) || jid
  if (decoded) candidates.add(decoded)

  const raw = String(decoded || jid).split('@')[0].replace(/\D/g, '')
  if (raw) {
    candidates.add(`${raw}@lid`)
    if (isValidWhatsAppPhone(raw)) candidates.add(`${raw}@s.whatsapp.net`)
  }

  for (const candidate of candidates) {
    try {
      const result = await conn.onWhatsApp(candidate)
      const entry = result?.[0]
      if (!entry?.jid) continue

      const phone = phoneFromJid(entry.jid)
      if (phone) return phone
    } catch {}
  }

  return null
}

export async function resolvePhoneNumber(jid, conn, explicitPhone = null, m = null) {
  const manual = normalizePhoneNumber(explicitPhone)
  if (manual && !isKnownLid(manual)) return manual

  for (const alt of altJidsFromMessage(m)) {
    const phone = phoneFromJid(conn?.decodeJid?.(alt) || alt)
    if (phone) return phone
  }

  const seeds = [
    jid,
    m?.sender,
    m?.chat,
    m?.participant,
    m?.key?.remoteJid,
    m?.key?.participant,
    ...altJidsFromMessage(m)
  ].filter(Boolean)

  const jids = m ? await collectUserJids(m, conn, seeds) : seeds.map(j => conn?.decodeJid?.(j) || j)

  for (const candidate of jids) {
    const phone = phoneFromJid(candidate)
    if (phone) return phone
  }

  for (const candidate of jids) {
    const phone = phoneFromOwnerMapping(candidate)
    if (phone) return phone
  }

  for (const candidate of jids) {
    const raw = String(candidate).split('@')[0]
    if (!String(candidate).includes('@lid') && !isKnownLid(raw)) continue
    const phone = await phoneFromGroupParticipants(candidate, conn)
    if (phone) return phone
  }

  for (const candidate of jids) {
    const phone = await phoneFromOnWhatsApp(candidate, conn)
    if (phone) return phone
  }

  return null
}

export function extractPhoneFromArgs(args = []) {
  for (const arg of args) {
    if (!arg || /^(code|--code)$/i.test(String(arg).trim())) continue
    const phone = normalizePhoneNumber(arg)
    if (phone && !isKnownLid(phone)) return phone
  }
  return null
}

export function getPrivateReplyJid(m, conn) {
  return conn?.decodeJid?.(m?.chat) || m?.chat || m?.key?.remoteJid || ''
}

export async function sendPrivateReply(m, conn, text, options = {}) {
  const jid = getPrivateReplyJid(m, conn)
  const { contextInfo, ...rest } = options
  return conn.sendMessage(jid, {
    text,
    ...(contextInfo ? { contextInfo } : {}),
    ...rest
  }, { quoted: m })
}
