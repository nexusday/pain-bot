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

async function resolveMenuImage(conn, mainImg) {
  try {
    const type = await conn.getFile(mainImg, true)
    const { res, data: file, filename: pathFile, mime } = type
    if ((res && res.status !== 200) || !file || file.length <= 65536) {
      return { image: { url: mainImg } }
    }
    return { image: { url: pathFile }, mimetype: mime || 'image/jpeg' }
  } catch {
    return { image: { url: mainImg } }
  }
}

async function sendInteractiveMenu(conn, m, ctx, categories, header) {
  const media = await resolveMenuImage(conn, ctx.mainImg)
  const content = buildInteractiveMenuContent(ctx, categories, header, media, m.sender)
  await conn.sendMessageLia(m.chat, content, { quoted: m })
}

async function sendCategoryResponse(conn, m, ctx, categories, category) {
  const caption = buildCategoryResponse(category, ctx, { interactive: isInteractiveBaileysEnabled() })

  if (!isInteractiveBaileysEnabled()) {
    await conn.sendFile(m.chat, category.img, 'menu-cat.jpg', caption, m, null, {
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender],
      },
    })
    return
  }

  try {
    const media = await resolveMenuImage(conn, category.img)
    const content = buildCategoryInteractiveContent(ctx, categories, caption, media, m.sender)
    await conn.sendMessageLia(m.chat, content, { quoted: m })
  } catch (interactiveError) {
    console.error('Categoría interactiva falló:', interactiveError)
    await conn.sendFile(m.chat, category.img, 'menu-cat.jpg', caption, m, null, {
      contextInfo: {
        ...rcanal.contextInfo,
        mentionedJid: [m.sender],
      },
    })
    try {
      await conn.sendMessageLia(
        m.chat,
        buildNativeFlowPickerContent(ctx, categories),
        { quoted: m },
      )
    } catch (pickerError) {
      console.error('Selector categorías (fallback) falló:', pickerError)
    }
  }
}

const handler = async (m, { conn, usedPrefix }) => {
  try {
    const ctx = await resolveMenuContext(m, conn, usedPrefix)
    const categories = buildMenuCategories(ctx)
    const header = buildMenuHeader(m, ctx)

    if (!isInteractiveBaileysEnabled()) {
      const text = buildFullMenuText(m, ctx, categories)
      await conn.sendFile(m.chat, ctx.mainImg, 'thumbnail.jpg', text, m, null, {
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender],
        },
      })
      return
    }

    try {
      await sendInteractiveMenu(conn, m, ctx, categories, header)
    } catch (interactiveError) {
      console.error('Menú interactivo (imagen+botón) falló:', interactiveError)

      await conn.sendFile(m.chat, ctx.mainImg, 'thumbnail.jpg', header, m, null, {
        contextInfo: {
          ...rcanal.contextInfo,
          mentionedJid: [m.sender],
        },
      })

      try {
        await conn.sendMessageLia(
          m.chat,
          buildNativeFlowPickerContent(ctx, categories),
          { quoted: m },
        )
      } catch (pickerError) {
        console.error('Selector nativeFlow falló:', pickerError)
        if (!m.isGroup) {
          await conn.sendListLia(
            m.chat,
            '𓂃 ࣪ ִֶָ☾. 𝙼𝙴𝙽𝚄',
            '𓂃 ࣪ ִֶָ☾. 𝙴𝙻𝙸𝙶𝙴 𝚄𝙽𝙰 𝙲𝙰𝚃𝙴𝙶𝙾𝚁Í𝙰 𝚙𝚊𝚛𝚊 𝚟𝚎𝚛 𝚜𝚞𝚜 𝚌𝚘𝚖𝚊𝚗𝚍𝚘𝚜.',
            MENU_BUTTON_TEXT,
            buildListSections(categories),
            m,
            { footer: ctx.nombreBot },
          )
        }
      }
    }
  } catch (e) {
    console.error('Error en menú:', e)
    conn.sendMessage(m.chat, {
      text: 'Hubo un error al mostrar el menú.',
      contextInfo: {
        ...rcanal.contextInfo,
      },
    }, { quoted: m })
    throw e
  }
}

async function handleMenuCategorySelection(m, { conn, usedPrefix }) {
  if (m.fromMe) return false

  const rowId = extractMenuSelectionId(m)
  const isInteractiveReply = [
    'listResponseMessage',
    'interactiveResponseMessage',
    'buttonsResponseMessage',
  ].includes(m.mtype)

  if (!rowId && !isInteractiveReply) return false
  if (!rowId && isInteractiveReply) {
    const label = [m?.msg?.title, m?.text].filter(Boolean).join(' ')
    if (!label) return false
  } else if (!getMenuCategoryId(rowId)) {
    return false
  }

  const ctx = await resolveMenuContext(m, conn, usedPrefix)
  const categories = buildMenuCategories(ctx)
  const category = findMenuCategoryFromMessage(m, categories)
  if (!category) return false

  await sendCategoryResponse(conn, m, ctx, categories, category)

  m.commandExecuted = true
  return true
}

handler.all = async function (m, data) {
  try {
    await handleMenuCategorySelection(m, data)
  } catch (e) {
    console.error('Error en selección de menú:', e)
  }
}

handler.command = ['menu', 'help', 'menú']
export default handler
