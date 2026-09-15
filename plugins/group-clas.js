import { findGroupParticipant, jidsParticipante, jidsSeSolapan } from '../lib/group-participant.js'

function asegurarDb(chatId) {
  if (!global.db.data.clasificacion) global.db.data.clasificacion = {}
  if (!global.db.data.clasificacion[chatId]) {
    global.db.data.clasificacion[chatId] = { equipos: [] }
  }
  if (!Array.isArray(global.db.data.clasificacion[chatId].equipos)) {
    global.db.data.clasificacion[chatId].equipos = []
  }
  return global.db.data.clasificacion[chatId]
}

async function guardarDb() {
  try {
    await global.db.write?.()
  } catch {}
}

function mezclar(lista) {
  const arr = [...lista]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function etiqueta(jid) {
  return `@${String(jid).split('@')[0]}`
}

function jidBot(conn) {
  return conn.decodeJid?.(conn.user?.jid || conn.user?.id) || conn.user?.jid || ''
}

function idsAsignados(data) {
  const set = new Set()
  for (const eq of data.equipos) {
    for (const jid of eq.miembros || []) set.add(String(jid))
  }
  return set
}

function encontrarEquipoDe(data, jid, conn, participants) {
  const objetivo = participants.find(p =>
    jidsSeSolapan(jidsParticipante(p, conn), [jid])
  )
  const candidatos = objetivo
    ? jidsParticipante(objetivo, conn)
    : [jid]

  for (let i = 0; i < data.equipos.length; i++) {
    const miembros = data.equipos[i].miembros || []
    for (const mJid of miembros) {
      if (jidsSeSolapan([mJid], candidatos)) {
        return { indice: i, equipo: data.equipos[i], miembroJid: mJid }
      }
    }
  }
  return null
}

function poolDisponible(participants, conn, data) {
  const bot = jidBot(conn)
  const usados = idsAsignados(data)
  return (participants || [])
    .filter(p => {
      if (!p?.id) return false
      const ids = jidsParticipante(p, conn)
      if (ids.some(id => id === bot)) return false
      if (ids.some(id => usados.has(String(id)))) return false
      for (const usado of usados) {
        if (jidsSeSolapan([usado], ids)) return false
      }
      return true
    })
    .map(p => p.id)
}

function textoEquipo(equipo, indiceVisible) {
  const miembros = equipo.miembros || []
  let texto = `*EQUIPO ${indiceVisible}*\n`
  texto += `› Integrantes: *${miembros.length}*\n\n`
  miembros.forEach((jid, i) => {
    texto += `${i + 1}. ${etiqueta(jid)}\n`
  })
  return texto.trim()
}

function resumenEquipos(data) {
  const total = data.equipos.length
  const personas = data.equipos.reduce((n, e) => n + (e.miembros?.length || 0), 0)
  let texto = `*CLASIFICACIÓN DEL GRUPO*\n\n`
  texto += `› Equipos: *${total}*\n`
  texto += `› Personas asignadas: *${personas}*\n\n`
  data.equipos.forEach((eq, i) => {
    texto += `*Equipo ${i + 1}* → ${eq.miembros?.length || 0} miembros\n`
  })
  return texto.trim()
}

function ayuda(usedPrefix, command) {
  return `*[❗] Clasificación de equipos*

*Crear:*
> ${usedPrefix + command} 3|13
→ 3 equipos de 13 personas (random)

*Ver:*
> ${usedPrefix + command} lista
> ${usedPrefix + command} ver

*Quitar de un equipo:*
> ${usedPrefix + command} quitar @usuario

*Mover a otro equipo:*
> ${usedPrefix + command} mover @usuario 2

*Agregar a un equipo:*
> ${usedPrefix + command} add @usuario 1

*Borrar todo:*
> ${usedPrefix + command} reset

Solo owners y admins del grupo.`
}

function esAdminOOwner(m, conn, isAdmin, participants) {
  const usuario = findGroupParticipant(participants, m, conn) || {}
  const esSuperAdmin = usuario?.admin == 'superadmin' || false
  const esAdminManual =
    Boolean(isAdmin) || esSuperAdmin || usuario?.admin == 'admin' || false

  const esOwnerManual =
    global.owner?.some(
      ([numero]) =>
        String(numero).replace(/[^0-9]/g, '') + '@s.whatsapp.net' === m.sender
    ) ||
    global.ownerLid?.some(
      ([numero]) => String(numero).replace(/[^0-9]/g, '') + '@lid' === m.sender
    ) ||
    m.sender === conn.user?.jid

  return esAdminManual || esSuperAdmin || esOwnerManual
}

async function enviarEquipo(conn, chat, equipo, indiceVisible, quoted) {
  const miembros = equipo.miembros || []
  await conn.sendMessage(
    chat,
    {
      text: textoEquipo(equipo, indiceVisible),
      contextInfo: {
        ...global.rcanal?.contextInfo,
        mentionedJid: miembros
      }
    },
    { quoted }
  )
}

let handler = async (m, { conn, args, text, participants, isAdmin, usedPrefix, command }) => {
  if (!m.isGroup) {
    return conn.reply(m.chat, '[❗] Este comando solo puede usarse en grupos.', m)
  }

  const metadatos =
    (conn.chats[m.chat] || {}).metadata ||
    (await conn.groupMetadata(m.chat).catch(_ => null)) ||
    {}
  const partes = metadatos.participants || participants || []

  if (!esAdminOOwner(m, conn, isAdmin, partes)) {
    return conn.reply(m.chat, '[❗] Solo owners y administradores del grupo.', m)
  }

  const data = asegurarDb(m.chat)
  const sub = String(args[0] || '').toLowerCase().trim()
  const entrada = String(text || args.join(' ') || '').trim()

  if (!entrada) {
    return conn.reply(m.chat, ayuda(usedPrefix, command), m)
  }

  if (['lista', 'list', 'ver', 'show', 'status'].includes(sub)) {
    if (!data.equipos.length) {
      return conn.reply(m.chat, '[❗] No hay equipos guardados en este grupo.', m)
    }
    await conn.reply(m.chat, resumenEquipos(data), m)
    for (let i = 0; i < data.equipos.length; i++) {
      await enviarEquipo(conn, m.chat, data.equipos[i], i + 1, m)
    }
    return
  }

  if (['reset', 'resetear', 'borrar', 'clear', 'limpiar'].includes(sub)) {
    data.equipos = []
    await guardarDb()
    return conn.reply(m.chat, '✅ Clasificación borrada. Ya no hay equipos en este grupo.', m)
  }

  if (['quitar', 'remove', 'eliminar', 'sacar'].includes(sub)) {
    const quien = m.mentionedJid?.[0]
    if (!quien) {
      return conn.reply(
        m.chat,
        `*[❗] Menciona al usuario.*\n> ${usedPrefix + command} quitar @usuario`,
        m
      )
    }
    const hallado = encontrarEquipoDe(data, quien, conn, partes)
    if (!hallado) {
      return conn.reply(m.chat, '[❗] Ese usuario no está en ningún equipo.', m)
    }
    hallado.equipo.miembros = hallado.equipo.miembros.filter(j => j !== hallado.miembroJid)
    if (!hallado.equipo.miembros.length) {
      data.equipos.splice(hallado.indice, 1)
    }
    await guardarDb()
    return conn.sendMessage(
      m.chat,
      {
        text: `✅ ${etiqueta(quien)} fue quitado del *Equipo ${hallado.indice + 1}*.`,
        contextInfo: {
          ...global.rcanal?.contextInfo,
          mentionedJid: [quien]
        }
      },
      { quoted: m }
    )
  }

  if (['mover', 'move', 'cambiar', 'change'].includes(sub)) {
    const quien = m.mentionedJid?.[0]
    const numEquipo = args.map(a => parseInt(a, 10)).find(n => Number.isFinite(n) && n >= 1)
    if (!quien || !numEquipo) {
      return conn.reply(
        m.chat,
        `*[❗] Uso:*\n> ${usedPrefix + command} mover @usuario 2`,
        m
      )
    }
    const hallado = encontrarEquipoDe(data, quien, conn, partes)
    if (!hallado) {
      return conn.reply(m.chat, '[❗] Ese usuario no está en ningún equipo.', m)
    }
    if (numEquipo > data.equipos.length) {
      return conn.reply(
        m.chat,
        `*[❗] Solo hay ${data.equipos.length} equipo(s).*`,
        m
      )
    }
    const destino = numEquipo - 1
    if (destino === hallado.indice) {
      return conn.reply(m.chat, '[❗] Ya está en ese equipo.', m)
    }
    const jidGuardado = hallado.miembroJid
    const equipoDestino = data.equipos[destino]
    hallado.equipo.miembros = hallado.equipo.miembros.filter(j => j !== jidGuardado)
    equipoDestino.miembros.push(jidGuardado)
    if (!hallado.equipo.miembros.length) {
      data.equipos.splice(hallado.indice, 1)
    }
    await guardarDb()
    const nuevoIndice =
      data.equipos.findIndex(e => (e.miembros || []).includes(jidGuardado)) + 1
    return conn.sendMessage(
      m.chat,
      {
        text: `✅ ${etiqueta(quien)} movido al *Equipo ${nuevoIndice || numEquipo}*.`,
        contextInfo: {
          ...global.rcanal?.contextInfo,
          mentionedJid: [quien]
        }
      },
      { quoted: m }
    )
  }

  if (['add', 'agregar', 'meter'].includes(sub)) {
    const quien = m.mentionedJid?.[0]
    const numEquipo = args.map(a => parseInt(a, 10)).find(n => Number.isFinite(n) && n >= 1)
    if (!quien || !numEquipo) {
      return conn.reply(
        m.chat,
        `*[❗] Uso:*\n> ${usedPrefix + command} add @usuario 1`,
        m
      )
    }
    if (encontrarEquipoDe(data, quien, conn, partes)) {
      return conn.reply(
        m.chat,
        `[❗] Ya está en un equipo. Usa *${usedPrefix + command} mover @usuario N*.`,
        m
      )
    }
    if (numEquipo > data.equipos.length) {
      return conn.reply(
        m.chat,
        `*[❗] Solo hay ${data.equipos.length} equipo(s).* Crea equipos primero.`,
        m
      )
    }
    data.equipos[numEquipo - 1].miembros.push(quien)
    await guardarDb()
    return conn.sendMessage(
      m.chat,
      {
        text: `✅ ${etiqueta(quien)} agregado al *Equipo ${numEquipo}*.`,
        contextInfo: {
          ...global.rcanal?.contextInfo,
          mentionedJid: [quien]
        }
      },
      { quoted: m }
    )
  }

  const match = entrada.match(/^(\d+)\s*[|xX,/]\s*(\d+)$/)
  if (!match) {
    return conn.reply(m.chat, ayuda(usedPrefix, command), m)
  }

  const cantidadEquipos = parseInt(match[1], 10)
  const porEquipo = parseInt(match[2], 10)

  if (!Number.isFinite(cantidadEquipos) || !Number.isFinite(porEquipo) || cantidadEquipos < 1 || porEquipo < 1) {
    return conn.reply(m.chat, '[❗] Usa números válidos. Ejemplo: *3|13*', m)
  }
  if (cantidadEquipos > 50 || porEquipo > 200) {
    return conn.reply(m.chat, '[❗] Números demasiado altos.', m)
  }

  const disponibles = poolDisponible(partes, conn, data)
  const necesarios = cantidadEquipos * porEquipo

  if (!disponibles.length) {
    const totalAsignados = idsAsignados(data).size
    return conn.sendMessage(
      m.chat,
      {
        text:
          `✅ *Todos están en equipos.*\n\n` +
          `› Equipos: *${data.equipos.length}*\n` +
          `› Personas asignadas: *${totalAsignados}*\n\n` +
          `Usa *${usedPrefix + command} lista* para verlos o *${usedPrefix + command} reset* para borrar.`,
        contextInfo: { ...global.rcanal?.contextInfo }
      },
      { quoted: m }
    )
  }

  if (disponibles.length < necesarios) {
    return conn.reply(
      m.chat,
      `*[❗] No hay suficientes libres.*\n\n` +
        `› Necesitas: *${necesarios}* (${cantidadEquipos}×${porEquipo})\n` +
        `› Disponibles (sin equipo): *${disponibles.length}*\n` +
        `› Ya en equipos: *${idsAsignados(data).size}*\n\n` +
        `Baja la cantidad o usa *${usedPrefix + command} reset*.`,
      m
    )
  }

  const mezclados = mezclar(disponibles)
  const nuevos = []
  let cursor = 0
  for (let i = 0; i < cantidadEquipos; i++) {
    const miembros = mezclados.slice(cursor, cursor + porEquipo)
    cursor += porEquipo
    nuevos.push({
      id: data.equipos.length + i + 1,
      miembros
    })
  }

  data.equipos.push(...nuevos)
  await guardarDb()

  const libresDespues = poolDisponible(partes, conn, data).length
  const inicio = data.equipos.length - nuevos.length

  await conn.reply(
    m.chat,
    `✅ Se crearon *${nuevos.length}* equipos de *${porEquipo}*.\n` +
      `› Total equipos: *${data.equipos.length}*\n` +
      `› Aún libres: *${libresDespues}*`,
    m
  )

  for (let i = 0; i < nuevos.length; i++) {
    await enviarEquipo(conn, m.chat, nuevos[i], inicio + i + 1, m)
  }

  if (libresDespues === 0) {
    await conn.reply(
      m.chat,
      `🏁 *Todos están en equipos.*\n› Total: *${data.equipos.length}* equipos.`,
      m
    )
  }
}

handler.help = [
  '#clas 3|13 → crear equipos',
  '#clas lista → ver equipos',
  '#clas quitar @user',
  '#clas mover @user N',
  '#clas reset'
]
handler.tags = ['grupo', 'admins']
handler.command = ['clas', 'clasificacion', 'equipos', 'teams']
handler.group = true
handler.admin = true

export default handler
