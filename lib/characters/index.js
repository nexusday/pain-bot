import { obtenerPersonajeAleatorio, descargarImagenPersonaje } from './catalog.js'
import {
  obtenerOferta,
  establecerOferta,
  limpiarOferta,
  intentarIniciarTiro,
  finalizarTiro,
  segundosRestantesOferta,
  TIRO_COOLDOWN_MS,
} from './offers.js'
import {
  obtenerUsuarioParaChars,
  obtenerCantidadPoseida,
  obtenerMonedero,
  cobrarMonedas,
  agregarPersonaje,
  encontrarIndicePersonaje,
  valorColeccion,
  contarUnidades,
  contarTipos,
  obtenerSlotsHarem,
  asegurarUsuarioChars,
  cantidadDisponible,
  reservarParaPublicacion,
  liberarReservaPublicacion,
  obtenerTopHarem,
  regalarPersonajeDeSlot,
} from './collection.js'
import { formatearDinero, formatearBarraCombate } from './rarity.js'
import {
  renderizarAlbumHarem,
  renderizarAlbumMercado,
  construirCaptionHarem,
  construirCaptionTienda,
} from './album.js'
import {
  crearPublicacion,
  listarPublicacionesActivas,
  listarTiendaParaAlbum,
  comprarPublicacion,
  cancelarPublicacion,
  sincronizarPublicacionesVendedor,
  listarActivasPorVendedor,
  mismoJid,
  PRECIO_MIN_PUBLICACION,
} from './shop.js'

export function construirCaptionPersonaje(personaje, extra = {}) {
  const lineas = [
    `🎴 *PERSONAJE EN OFERTA*`,
    ``,
    `> ・ Nombre: *${personaje.name}*`,
    `> ・ Anime: *${personaje.anime}*`,
    `> ・ Rareza: *${personaje.rarityLabel}*`,
    `> ・ Precio: *${formatearDinero(personaje.price)}*`,
    `> ・ HP: *${personaje.hp || personaje.maxHp || '?'}* / *${personaje.maxHp || '?'}*`,
    `> ・ Poder: *${personaje.power || '?'}*`,
    `> ・ ID: \`${personaje.id}\``,
  ]
  if (extra.secondsLeft != null) lineas.push(`> ・ Tiempo: *${extra.secondsLeft}s*`)
  if (extra.note) lineas.push(``, extra.note)
  return lineas.join('\n')
}

async function resolverPayloadImagen(personaje) {
  if (personaje?.imageBuffer && Buffer.isBuffer(personaje.imageBuffer)) return personaje.imageBuffer
  return descargarImagenPersonaje(personaje)
}

async function enviarTarjetaPersonaje(conn, chat, { character, caption, buttons, quoted, mentionedJid }) {
  const imagen = await resolverPayloadImagen(character)
  const contenido = {
    image: imagen,
    caption,
    footer: global.packname || 'Pain Characters',
    buttons: buttons || [],
    contextInfo: {
      ...(global.rcanal?.contextInfo || {}),
      ...(mentionedJid?.length ? { mentionedJid } : {}),
    },
  }

  try {
    if (typeof conn.sendMessageLia === 'function' && buttons?.length) {
      return await conn.sendMessageLia(chat, contenido, { quoted })
    }
  } catch (e) {
    console.error('char interactive:', e?.message || e)
  }

  return conn.sendMessage(chat, {
    image: imagen,
    caption,
    contextInfo: contenido.contextInfo,
  }, { quoted })
}

async function enviarAlbum(conn, chat, { image, caption, buttons, quoted }) {
  const contenido = {
    image,
    caption,
    footer: global.packname || 'Pain Characters',
    buttons: buttons || [],
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }
  try {
    if (typeof conn.sendMessageLia === 'function' && buttons?.length) {
      return await conn.sendMessageLia(chat, contenido, { quoted })
    }
  } catch (e) {
    console.error('album interactive:', e?.message || e)
  }
  return conn.sendMessage(chat, {
    image,
    caption,
    contextInfo: contenido.contextInfo,
  }, { quoted })
}

export async function tirarPersonaje(m, conn, usedPrefix = '.') {
  const inicio = intentarIniciarTiro(m.sender)
  if (!inicio.ok) {
    if (inicio.reason === 'cooldown' || inicio.reason === 'busy') {
      const sec = Math.ceil((inicio.left || 1500) / 1000)
      await conn.sendMessage(m.chat, {
        text: `[⏳] Espera *${sec}s* para tirar otro personaje.`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
    }
    return
  }

  try {
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    const { user } = obtenerUsuarioParaChars(m.sender, conn)
    const pilasPoseidas = (user.characters || []).map(c => ({
      id: c.id,
      qty: c.qty || 1,
    }))
    const personaje = await obtenerPersonajeAleatorio({ ownedStacks: pilasPoseidas })
    personaje.imageBuffer = await descargarImagenPersonaje(personaje)

    const oferta = establecerOferta(m.chat, personaje, m.sender)

    const ownedQty = obtenerCantidadPoseida(user, personaje.id)
    const p = usedPrefix || '.'
    const caption = construirCaptionPersonaje(personaje, {
      secondsLeft: segundosRestantesOferta(oferta),
      note: ownedQty > 0
        ? `> Ya tienes este personaje *(x${ownedQty})*. Puedes comprar otra copia.\n> Toca *Comprar* o usa *${p}claim*`
        : `> Toca *Comprar* o escribe *${p}claim*`,
    })

    await enviarTarjetaPersonaje(conn, m.chat, {
      character: personaje,
      caption,
      quoted: m,
      buttons: [
        { text: `Comprar · ${personaje.price}`, id: `${p}claim` },
        { text: 'Mi harem', id: `${p}harem` },
        { text: 'Otro tiro', id: `${p}w` },
      ],
    })

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
  } finally {
    finalizarTiro(m.sender)
  }
}

export async function reclamarPersonaje(m, conn, usedPrefix = '.') {
  const oferta = obtenerOferta(m.chat)
  if (!oferta) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No hay personaje en oferta.\n> Tira uno con *${usedPrefix}w*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const personaje = oferta.character
  const { user } = obtenerUsuarioParaChars(m.sender, conn)
  const monedero = obtenerMonedero(user)

  if (monedero < personaje.price) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Te faltan monedas.\n> Precio: *${formatearDinero(personaje.price)}*\n> Tu saldo: *${formatearDinero(monedero)}*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  if (!cobrarMonedas(user, personaje.price)) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No se pudo cobrar el personaje.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const agregado = agregarPersonaje(user, personaje)
  limpiarOferta(m.chat)

  const caption = [
    `✅ *¡Personaje comprado!*`,
    ``,
    `> ・ ${personaje.name}`,
    `> ・ ${personaje.rarityLabel}`,
    `> ・ Pagaste: *${formatearDinero(personaje.price)}*`,
    `> ・ ID: \`${personaje.id}\``,
    `> ・ Ahora tienes: *x${agregado.qty}*`,
    `> ・ Harem: *${contarTipos(user)}* tipos · *${contarUnidades(user)}* unidades`,
    ``,
    `> *${usedPrefix}harem* · *${usedPrefix}vender <n°> <precio>*`,
  ].join('\n')

  await enviarTarjetaPersonaje(conn, m.chat, {
    character: personaje,
    caption,
    quoted: m,
    mentionedJid: [m.sender],
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tirar otro', id: `${usedPrefix}w` },
    ],
  })
}

export async function mostrarHarem(m, conn, usedPrefix = '.') {
  const { user } = obtenerUsuarioParaChars(m.sender, conn)
  sincronizarPublicacionesVendedor(user, m.sender)
  asegurarUsuarioChars(user)

  if (!user.characters.length) {
    await conn.sendMessage(m.chat, {
      text: `🎴 *Tu harem está vacío*\n\n> Tira con *${usedPrefix}w* y compra con *${usedPrefix}claim*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

  const slots = obtenerSlotsHarem(user)
  const valor = valorColeccion(user)
  const caption = construirCaptionHarem(slots, valor, usedPrefix)
  const album = await renderizarAlbumHarem(slots, {
    title: 'HAREM',
    subtitle: `${contarTipos(user)} tipos · ${contarUnidades(user)} uds · ${formatearDinero(valor)}`,
  })

  await enviarAlbum(conn, m.chat, {
    image: album,
    caption,
    quoted: m,
    buttons: [
      { text: 'Tirar w', id: `${usedPrefix}w` },
      { text: 'Tienda G', id: `${usedPrefix}tiendag` },
    ],
  })

  await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
}

export async function listarPersonajeEnVenta(m, conn, usedPrefix = '.', slotQuery = '', priceRaw = '') {
  const { user } = obtenerUsuarioParaChars(m.sender, conn)
  sincronizarPublicacionesVendedor(user, m.sender)

  if (!user.characters.length) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No tienes personajes para publicar.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const idx = encontrarIndicePersonaje(user, slotQuery)
  const precio = Math.floor(Number(String(priceRaw).replace(/[^\d]/g, '')) || 0)

  if (idx < 0 || !precio) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}vender <n°> <precio>*\n> Ejemplo: *${usedPrefix}vender 1 5000*\n> Revisa tus slots en *${usedPrefix}harem*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  if (precio < PRECIO_MIN_PUBLICACION) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Precio mínimo: *${formatearDinero(PRECIO_MIN_PUBLICACION)}*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const pila = user.characters[idx]
  const libres = cantidadDisponible(pila)
  if (libres < 1) {
    await conn.sendMessage(m.chat, {
      text: [
        `[❗] *${pila.name}* ya está en venta.`,
        `> Tienes *x${pila.qty}* · listadas *${pila.listed || 0}* · libres *0*`,
        `> Necesitas otra copia, o cancela con *${usedPrefix}cancelarg <orden>*`,
      ].join('\n'),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const reservado = reservarParaPublicacion(user, idx, 1)
  if (!reservado.ok) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No hay unidades libres para publicar.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const sellerName = m.pushName || m.name || user.name || 'Usuario'
  const creado = crearPublicacion({
    sellerJid: m.sender,
    sellerName,
    character: reservado.character,
    price: precio,
  })

  if (!creado.ok) {
    liberarReservaPublicacion(user, reservado.character.id, 1)
    await conn.sendMessage(m.chat, {
      text: `[❗] No se pudo publicar.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const listing = creado.listing
  const leftFree = cantidadDisponible(pila)
  const caption = [
    `📌 *Publicado en Tienda G*`,
    ``,
    `> ・ ${listing.name}`,
    `> ・ Orden: *#${listing.order}*`,
    `> ・ Precio: *${formatearDinero(listing.price)}*`,
    `> ・ Vendedor: *${listing.sellerName}*`,
    `> ・ En harem: *EN VENTA* · libres *${leftFree}* / *${pila.qty}*`,
    ``,
    `> Cancelar: *${usedPrefix}cancelarg ${listing.order}*`,
    `> Ver tienda: *${usedPrefix}tiendag*`,
  ].join('\n')

  await enviarTarjetaPersonaje(conn, m.chat, {
    character: reservado.character,
    caption,
    quoted: m,
    buttons: [
      { text: 'Cancelar', id: `${usedPrefix}cancelarg ${listing.order}` },
      { text: 'Tienda G', id: `${usedPrefix}tiendag` },
      { text: 'Mi harem', id: `${usedPrefix}harem` },
    ],
  })
}

export async function cancelarVentaPersonaje(m, conn, usedPrefix = '.', orderRaw = '') {
  const orden = Math.floor(Number(String(orderRaw).replace(/[^\d]/g, '')) || 0)
  if (!orden) {
    const mias = listarActivasPorVendedor(m.sender)
    const pista = mias.length
      ? `\n\nTus órdenes:\n${mias.slice(0, 10).map(l => `> *${l.order}* · ${l.name} · ${formatearDinero(l.price)}`).join('\n')}`
      : `\n> No tienes publicaciones activas.`
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}cancelarg <orden>*${pista}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const resultado = cancelarPublicacion(orden, m.sender, conn)
  if (!resultado.ok) {
    const mapa = {
      not_found: 'No existe esa orden.',
      sold: 'Esa orden ya no está activa (vendida o cancelada).',
      forbidden: 'Solo el dueño puede cancelar esa publicación.',
    }
    await conn.sendMessage(m.chat, {
      text: `[❗] ${mapa[resultado.reason] || 'No se pudo cancelar.'}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const l = resultado.listing
  const caption = [
    `❎ *Publicación cancelada*`,
    ``,
    `> ・ Orden: *#${l.order}*`,
    `> ・ ${l.name}`,
    `> ・ Volvió a tu harem (ya no está en venta)`,
    ``,
    `> *${usedPrefix}harem* · *${usedPrefix}tiendag*`,
  ].join('\n')

  await enviarTarjetaPersonaje(conn, m.chat, {
    character: resultado.character,
    caption,
    quoted: m,
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tienda G', id: `${usedPrefix}tiendag` },
    ],
  })
}

export async function mostrarTiendaChars(m, conn, usedPrefix = '.') {
  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

  const activas = listarPublicacionesActivas()
  const grupos = listarTiendaParaAlbum(49)
  const caption = construirCaptionTienda(activas, usedPrefix)

  if (!grupos.length) {
    await conn.sendMessage(m.chat, {
      text: caption,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
    return
  }

  const album = await renderizarAlbumMercado(grupos, {
    title: 'TIENDA G',
    subtitle: `${activas.length} órdenes activas`,
  })

  await enviarAlbum(conn, m.chat, {
    image: album,
    caption,
    quoted: m,
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tirar w', id: `${usedPrefix}w` },
    ],
  })

  await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
}

export async function comprarDeTiendaChars(m, conn, usedPrefix = '.', orderRaw = '') {
  const orden = Math.floor(Number(String(orderRaw).replace(/[^\d]/g, '')) || 0)
  if (!orden) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}comprarg <orden>*\n> Ejemplo: *${usedPrefix}comprarg 12*\n> Órdenes en *${usedPrefix}tiendag*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const resultado = comprarPublicacion(orden, m.sender, conn)
  if (!resultado.ok) {
    const mapa = {
      not_found: 'No existe esa orden.',
      sold: 'Esa orden ya está agotada.',
      own: 'No puedes comprar tu propia publicación.',
      no_money: `Te faltan monedas. Precio: *${formatearDinero(resultado.need)}* · Saldo: *${formatearDinero(resultado.have)}*`,
      charge_fail: 'No se pudo cobrar.',
    }
    await conn.sendMessage(m.chat, {
      text: `[❗] ${mapa[resultado.reason] || 'No se pudo comprar.'}`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const l = resultado.listing
  const caption = [
    `🛒 *Compra exitosa*`,
    ``,
    `> ・ Orden: *#${l.order}*`,
    `> ・ ${l.name}`,
    `> ・ Pagaste: *${formatearDinero(l.price)}*`,
    `> ・ Vendedor: *${l.sellerName}*`,
    `> ・ El dinero fue al dueño`,
    ``,
    `> *${usedPrefix}harem* · *${usedPrefix}tiendag*`,
  ].join('\n')

  await enviarTarjetaPersonaje(conn, m.chat, {
    character: {
      id: l.charId,
      name: l.name,
      image: l.image,
      rarityLabel: l.rarityLabel,
      price: l.price,
      anime: l.anime,
    },
    caption,
    quoted: m,
    mentionedJid: [m.sender, l.sellerJid].filter(Boolean),
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tienda G', id: `${usedPrefix}tiendag` },
    ],
  })

  try {
    await conn.sendMessage(resultado.sellerJid || l.sellerJid, {
      text: `💰 *Vendiste en Tienda G*\n\n> Orden *#${l.order}* · ${l.name}\n> Recibiste *${formatearDinero(l.price)}*\n> Comprador: @${m.sender.split('@')[0]}`,
      mentions: [m.sender],
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    })
  } catch {}
}

export async function mostrarTopHarem(m, conn, usedPrefix = '.', limitRaw = '') {
  const limite = Math.floor(Number(String(limitRaw).replace(/[^\d]/g, '')) || 10)
  const top = obtenerTopHarem(limite)

  if (!top.length) {
    await conn.sendMessage(m.chat, {
      text: `🎴 *TOP HAREM*\n\n> Aún no hay colecciones.\n> Empieza con *${usedPrefix}w* y *${usedPrefix}claim*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const mentions = []
  const bloques = top.map((fila, i) => {
    const pos = i + 1
    const tag = `@${String(fila.jid).split('@')[0]}`
    mentions.push(fila.jid)
    return [
      `*#${pos}* ${tag}`,
      `> 𓂃 ࣪ ִֶָ☾.  ${fila.name}`,
      `> 𓂃 ࣪ ִֶָ☾.  Tipos: *${fila.types}* · Unidades: *${fila.units}*`,
      `> 𓂃 ࣪ ִֶָ☾.  Valor: *${formatearDinero(fila.value)}*`,
    ].join('\n')
  })

  const caption = [
    `🎴 *TOP HAREM*`,
    `> Ordenado por valor total del catálogo`,
    `> Top *${top.length}*`,
    ``,
    ...bloques,
    ``,
    `> Tu colección: *${usedPrefix}harem*`,
  ].join('\n')

  await conn.sendMessage(m.chat, {
    text: caption,
    mentions,
    contextInfo: { ...(global.rcanal?.contextInfo || {}) },
  }, { quoted: m })
}

export async function verPersonajeHarem(m, conn, usedPrefix = '.', slotRaw = '') {
  const { user } = obtenerUsuarioParaChars(m.sender, conn)
  sincronizarPublicacionesVendedor(user, m.sender)

  if (!user.characters.length) {
    await conn.sendMessage(m.chat, {
      text: `🎴 *Tu harem está vacío*\n\n> Tira con *${usedPrefix}w* y compra con *${usedPrefix}claim*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const idx = encontrarIndicePersonaje(user, slotRaw)
  if (idx < 0) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}vharem <n°>*\n> Ejemplo: *${usedPrefix}vharem 1*\n> Revisa el orden en *${usedPrefix}harem*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const slots = obtenerSlotsHarem(user)
  const c = slots[idx]
  const libres = Math.max(0, (c.qty || 1) - (c.listed || 0))
  const barra = formatearBarraCombate(c.hp || c.maxHp, c.maxHp, 12)
  const notaListada = (c.listed || 0) > 0
    ? `\n> 𓂃 ࣪ ִֶָ☾.  En venta: *${c.listed}* · Libres: *${libres}*`
    : ''

  const caption = [
    `🎴 *FICHA HAREM*`,
    ``,
    `*#${c.slot}* ${c.name}`,
    `> 𓂃 ࣪ ִֶָ☾.  Anime: *${c.anime}*`,
    `> 𓂃 ࣪ ִֶָ☾.  Rareza: *${c.rarityLabel}*`,
    `> 𓂃 ࣪ ִֶָ☾.  Costo: *${formatearDinero(c.price)}*`,
    `> 𓂃 ࣪ ִֶָ☾.  Unidades: *x${c.qty}*`,
    notaListada,
    ``,
    `> 𓂃 ࣪ ִֶָ☾.  HP: *${c.hp || c.maxHp}* / *${c.maxHp}*`,
    `> 𓂃 ࣪ ִֶָ☾.  [${barra}]`,
    `> 𓂃 ࣪ ִֶָ☾.  Poder: *${c.power}*`,
    `> 𓂃 ࣪ ִֶָ☾.  ID: \`${c.id}\``,
    ``,
    `> Dar: *${usedPrefix}darhr @user ${c.slot}*`,
    `> Vender: *${usedPrefix}vender ${c.slot} <precio>*`,
  ].filter(Boolean).join('\n')

  await enviarTarjetaPersonaje(conn, m.chat, {
    character: c,
    caption,
    quoted: m,
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
      { text: 'Tirar w', id: `${usedPrefix}w` },
    ],
  })
}

export async function regalarPersonajeHarem(m, conn, usedPrefix = '.', args = []) {
  const { user: deUsuario } = obtenerUsuarioParaChars(m.sender, conn)
  sincronizarPublicacionesVendedor(deUsuario, m.sender)

  const parseado = parsearDestinoYSlotRegalo(m, args)
  const targetJid = parseado.targetJid
  const slotNum = parseado.slot

  if (!targetJid || !slotNum) {
    await conn.sendMessage(m.chat, {
      text: `[❗] Uso: *${usedPrefix}darhr @usuario <n°>*\n> Ejemplo: *${usedPrefix}darhr @user 1*\n> El número es el orden de *${usedPrefix}harem* (ej. #1, #2…)`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  if (mismoJid(targetJid, m.sender)) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No puedes regalarte un personaje a ti mismo.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const idx = slotNum - 1
  if (idx < 0 || idx >= deUsuario.characters.length) {
    await conn.sendMessage(m.chat, {
      text: `[❗] No tienes el slot *#${slotNum}* en tu harem.\n> Tienes *${deUsuario.characters.length}* tipo(s). Revisa *${usedPrefix}harem*`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const pila = deUsuario.characters[idx]
  const libres = cantidadDisponible(pila)
  if (libres < 1) {
    const listed = Number(pila.listed) || 0
    const ordenes = listarActivasPorVendedor(m.sender)
      .filter(l => String(l.charId) === String(pila.id))
      .map(l => l.order)
    const orderTxt = ordenes.length
      ? `\n> Órdenes activas: *${ordenes.map(o => `#${o}`).join(', ')}*\n> Cancela con *${usedPrefix}cancelarg ${ordenes[0]}*`
      : `\n> Cancela la venta con *${usedPrefix}cancelarg <orden>*`

    await conn.sendMessage(m.chat, {
      text: [
        `[❗] *${pila.name}* (slot *#${slotNum}*) está *EN VENTA*.`,
        `> Unidades: *x${pila.qty}* · En venta: *${listed}* · Libres: *0*`,
        `> No puedes regalarlo mientras esté publicado.${orderTxt}`,
      ].join('\n'),
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const { user: aUsuario } = obtenerUsuarioParaChars(targetJid, conn)
  const resultado = regalarPersonajeDeSlot(deUsuario, aUsuario, idx)

  if (!resultado.ok) {
    if (resultado.reason === 'listed') {
      await conn.sendMessage(m.chat, {
        text: `[❗] *${resultado.name}* está en venta.\n> Cancela primero con *${usedPrefix}cancelarg <orden>* o usa otra copia libre.`,
        contextInfo: { ...(global.rcanal?.contextInfo || {}) },
      }, { quoted: m })
      return
    }
    await conn.sendMessage(m.chat, {
      text: `[❗] No se pudo regalar ese personaje.`,
      contextInfo: { ...(global.rcanal?.contextInfo || {}) },
    }, { quoted: m })
    return
  }

  const c = resultado.character
  const caption = [
    `🎁 *Personaje regalado*`,
    ``,
    `> 𓂃 ࣪ ִֶָ☾.  ${c.name}`,
    `> 𓂃 ࣪ ִֶָ☾.  Slot: *#${slotNum}*`,
    `> 𓂃 ࣪ ִֶָ☾.  De: @${m.sender.split('@')[0]}`,
    `> 𓂃 ࣪ ִֶָ☾.  Para: @${String(targetJid).split('@')[0]}`,
    `> 𓂃 ࣪ ִֶָ☾.  Rareza: *${c.rarityLabel}*`,
    `> 𓂃 ࣪ ִֶָ☾.  HP: *${c.maxHp}* · Poder: *${c.power}*`,
    `> 𓂃 ࣪ ִֶָ☾.  Valor: *${formatearDinero(c.price)}*`,
  ].join('\n')

  await enviarTarjetaPersonaje(conn, m.chat, {
    character: c,
    caption,
    quoted: m,
    mentionedJid: [m.sender, targetJid],
    buttons: [
      { text: 'Mi harem', id: `${usedPrefix}harem` },
    ],
  })
}

/**
 * Separa @usuario del número de slot.
 * Bug previo: el teléfono del mention se tomaba como slot.
 */
function parsearDestinoYSlotRegalo(m, args = []) {
  const ctxMentions = m.message?.extendedTextMessage?.contextInfo?.mentionedJid
    || m.msg?.contextInfo?.mentionedJid
    || []
  const mentioned = [...(m.mentionedJid || []), ...ctxMentions].filter(Boolean)
  const targetJid = mentioned[0] || null

  const mentionDigits = new Set(
    mentioned.map(j => String(j).split('@')[0].split(':')[0].replace(/\D/g, '')).filter(d => d.length >= 6)
  )

  const rawArgs = (args || []).map(a => String(a || '').trim()).filter(Boolean)

  // Quita tokens que son el @mention (el número largo del usuario)
  const withoutMentions = rawArgs.filter(a => {
    if (a.startsWith('@')) {
      const d = a.replace(/[^\d]/g, '')
      if (mentionDigits.has(d) || d.length >= 8) return false
    }
    const onlyDigits = a.replace(/[^\d]/g, '')
    if (onlyDigits.length >= 8 && mentionDigits.has(onlyDigits)) return false
    if (onlyDigits.length >= 10 && !mentionDigits.size) {
      // número tipo teléfono sin mention parseado: no es slot de harem
      return false
    }
    return true
  })

  let slot = null
  for (const a of withoutMentions) {
    const d = a.replace(/[^\d]/g, '')
    if (/^\d{1,3}$/.test(d)) {
      const n = parseInt(d, 10)
      if (n >= 1 && n <= 500) {
        slot = n
        break
      }
    }
  }

  // Fallback: último número corto del texto completo
  if (!slot && m.text) {
    const matches = String(m.text).match(/(?:^|\s)(\d{1,3})(?=\s|$)/g) || []
    for (let i = matches.length - 1; i >= 0; i--) {
      const n = parseInt(String(matches[i]).trim(), 10)
      if (n >= 1 && n <= 500) {
        slot = n
        break
      }
    }
  }

  return { targetJid, slot }
}

export {
  construirCaptionPersonaje as buildCharacterCaption,
  tirarPersonaje as rollCharacter,
  reclamarPersonaje as claimCharacter,
  mostrarHarem as showHarem,
  listarPersonajeEnVenta as listCharacterForSale,
  cancelarVentaPersonaje as cancelCharacterSale,
  mostrarTiendaChars as showCharShop,
  comprarDeTiendaChars as buyFromCharShop,
  mostrarTopHarem as showTopHarem,
  verPersonajeHarem as viewHaremCharacter,
  regalarPersonajeHarem as giftHaremCharacter,
  obtenerPersonajeAleatorio as fetchRandomCharacter,
  obtenerOferta as getOffer,
  formatearDinero as formatMoney,
  TIRO_COOLDOWN_MS as ROLL_COOLDOWN_MS,
}
