import { isInteractiveBaileysEnabled } from '../lib/baileys-dual.js'
import {
  buildFullMenuText,
  buildInteractiveMenuContent,
  buildCategoryInteractiveContent,
  buildListSections,
  buildMenuCategories,
  buildMenuHeader,
  buildCategoryResponse,
  buildNativeFlowPickerContent,
  extractMenuSelectionId,
  findMenuCategoryFromMessage,
  getMenuCategoryId,
  MENU_BUTTON_TEXT,
  resolveMenuContext,
} from '../lib/menu-categories.js'

/** chatId -> { key, at } del último menú interactivo enviado/editado */
const menusActivos = new Map()
const TTL_MENU_MS = 30 * 60 * 1000

function recordarMenuActivo(chatId, key) {
  if (!chatId || !key?.id) return
  menusActivos.set(chatId, { key, at: Date.now() })
}

function obtenerMenuActivo(chatId) {
  const entry = menusActivos.get(chatId)
  if (!entry?.key?.id) return null
  if (Date.now() - entry.at > TTL_MENU_MS) {
    menusActivos.delete(chatId)
    return null
  }
  return entry.key
}

function obtenerContextInfoSeleccion(m) {
  return (
    m?.msg?.contextInfo ||
    m?.message?.interactiveResponseMessage?.contextInfo ||
    m?.message?.listResponseMessage?.contextInfo ||
    m?.message?.buttonsResponseMessage?.contextInfo ||
    m?.message?.templateButtonReplyMessage?.contextInfo ||
    null
  )
}

/** Clave del mensaje del menú a editar (el que tiene la foto + botón). */
function resolverClaveEdicionMenu(m) {
  const ctx = obtenerContextInfoSeleccion(m)
  const stanzaId = ctx?.stanzaId || m?.quoted?.id
  if (stanzaId) {
    return {
      remoteJid: m.chat,
      fromMe: true,
      id: stanzaId,
    }
  }
  return obtenerMenuActivo(m.chat)
}

async function resolverImagenMenu(conn, imgPrincipal) {
  try {
    const tipo = await conn.getFile(imgPrincipal, true)
    const { res, data: archivo, filename: rutaArchivo, mime } = tipo
    if ((res && res.status !== 200) || !archivo || archivo.length <= 65536) {
      return { image: { url: imgPrincipal } }
    }
    return { image: { url: rutaArchivo }, mimetype: mime || 'image/jpeg' }
  } catch {
    return { image: { url: imgPrincipal } }
  }
}

async function enviarMenuInteractivo(conn, m, contexto, categorias, encabezado) {
  const medios = await resolverImagenMenu(conn, contexto.mainImg)
  const contenido = buildInteractiveMenuContent(contexto, categorias, encabezado, medios, m.sender)
  const enviado = await conn.sendMessageLia(m.chat, contenido, { quoted: m })
  if (enviado?.key) recordarMenuActivo(m.chat, enviado.key)
  return enviado
}

async function enviarRespuestaCategoria(conn, m, contexto, categorias, categoria) {
  const leyenda = buildCategoryResponse(categoria, contexto, { interactive: isInteractiveBaileysEnabled() })

  if (!isInteractiveBaileysEnabled()) {
    await conn.sendFile(m.chat, categoria.img, 'menu-cat.jpg', leyenda, m, null, {
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender],
      },
    })
    return
  }

  try {
    const medios = await resolverImagenMenu(conn, categoria.img)
    const contenido = buildCategoryInteractiveContent(contexto, categorias, leyenda, medios, m.sender)
    const claveEdit = resolverClaveEdicionMenu(m)

    if (claveEdit) {
      try {
        await conn.sendMessageLia(m.chat, { ...contenido, edit: claveEdit })
        recordarMenuActivo(m.chat, claveEdit)
        return
      } catch (errorEdit) {
        console.warn('[menú] Edición falló, enviando mensaje nuevo:', errorEdit?.message || errorEdit)
      }
    }

    const enviado = await conn.sendMessageLia(m.chat, contenido, { quoted: m })
    if (enviado?.key) recordarMenuActivo(m.chat, enviado.key)
  } catch (errorInteractivo) {
    console.error('Categoría interactiva falló:', errorInteractivo)
    await conn.sendFile(m.chat, categoria.img, 'menu-cat.jpg', leyenda, m, null, {
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender],
      },
    })
    try {
      await conn.sendMessageLia(
        m.chat,
        buildNativeFlowPickerContent(contexto, categorias),
        { quoted: m },
      )
    } catch (errorSelector) {
      console.error('Selector categorías (fallback) falló:', errorSelector)
    }
  }
}

const handler = async (m, { conn, usedPrefix }) => {
  try {
    const contexto = await resolveMenuContext(m, conn, usedPrefix)
    const categorias = buildMenuCategories(contexto)
    const encabezado = buildMenuHeader(m, contexto)

    if (!isInteractiveBaileysEnabled()) {
      const texto = buildFullMenuText(m, contexto, categorias)
      await conn.sendFile(m.chat, contexto.mainImg, 'thumbnail.jpg', texto, m, null, {
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender],
        },
      })
      return
    }

    try {
      await enviarMenuInteractivo(conn, m, contexto, categorias, encabezado)
    } catch (errorInteractivo) {
      console.error('Menú interactivo (imagen+botón) falló:', errorInteractivo)

      await conn.sendFile(m.chat, contexto.mainImg, 'thumbnail.jpg', encabezado, m, null, {
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender],
        },
      })

      try {
        await conn.sendMessageLia(
          m.chat,
          buildNativeFlowPickerContent(contexto, categorias),
          { quoted: m },
        )
      } catch (errorSelector) {
        console.error('Selector nativeFlow falló:', errorSelector)
        if (!m.isGroup) {
          await conn.sendListLia(
            m.chat,
            '𓂃 ࣪ ִֶָ☾. 𝙼𝙴𝙽𝚄',
            '𓂃 ࣪ ִֶָ☾. 𝙴𝙻𝙸𝙶𝙴 𝚄𝙽𝙰 𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰 𝚙𝚊𝚛𝚊 𝚟𝚎𝚛 𝚜𝚞𝚜 𝚌𝚘𝚖𝚊𝚗𝚍𝚘𝚜.',
            MENU_BUTTON_TEXT,
            buildListSections(categorias),
            m,
            { footer: contexto.nombreBot },
          )
        }
      }
    }
  } catch (error) {
    console.error('Error en menú:', error)
    conn.sendMessage(m.chat, {
      text: 'Hubo un error al mostrar el menú.',
      contextInfo: {
        ...rcanal.contextInfo,
      },
    }, { quoted: m })
    throw error
  }
}

async function manejarSeleccionCategoriaMenu(m, { conn, usedPrefix }) {
  if (m.fromMe) return false

  const idFila = extractMenuSelectionId(m)
  const esRespuestaInteractiva = [
    'listResponseMessage',
    'interactiveResponseMessage',
    'buttonsResponseMessage',
  ].includes(m.mtype)

  if (!idFila && !esRespuestaInteractiva) return false
  if (!idFila && esRespuestaInteractiva) {
    const etiqueta = [m?.msg?.title, m?.text].filter(Boolean).join(' ')
    if (!etiqueta) return false
  } else if (!getMenuCategoryId(idFila)) {
    return false
  }

  const contexto = await resolveMenuContext(m, conn, usedPrefix)
  const categorias = buildMenuCategories(contexto)
  const categoria = findMenuCategoryFromMessage(m, categorias)
  if (!categoria) return false

  await enviarRespuestaCategoria(conn, m, contexto, categorias, categoria)

  m.commandExecuted = true
  return true
}

handler.all = async function (m, data) {
  try {
    await manejarSeleccionCategoriaMenu(m, data)
  } catch (error) {
    console.error('Error en selección de menú:', error)
  }
}

handler.command = ['menu', 'help', 'menú']
export default handler
