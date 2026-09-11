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
  await conn.sendMessageLia(m.chat, contenido, { quoted: m })
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
    await conn.sendMessageLia(m.chat, contenido, { quoted: m })
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
