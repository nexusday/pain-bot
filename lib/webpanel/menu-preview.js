import os from 'node:os'
import {
  construirCategoriasMenu,
  construirEncabezadoMenu,
  construirTextoMenuCompleto,
} from '../../lib/menu-categories.js'
import { IDIOMAS } from './subbot-config.js'

/**
 * Previsualización del menú tal y como lo verá el usuario en WhatsApp.
 * Usa las MISMAS funciones que arma el menú real, así que lo que se ve aquí
 * es exactamente lo que llega al chat.
 */

function totalPlugins() {
  if (Number.isFinite(global.webPanelPreview?.totalPlugins)) return global.webPanelPreview.totalPlugins
  try {
    return Object.values(global.plugins || {}).filter((plugin) => plugin?.help && plugin?.tags).length
  } catch {
    return 0
  }
}

export function construirPreviewMenu({ phone, config = {}, esPropietario = true } = {}) {
  const lang = IDIOMAS.includes(config.lang) ? config.lang : 'es'
  const ctx = {
    usedPrefix: '.',
    lang,
    nombreBot: config.name || global.namebot || 'PAIN BOT',
    mainImg: config.img || './storage/img/menu3.jpg',
    tipo: 'Sub Bot',
    userRole: esPropietario ? 'staff del bot' : 'usuario',
    ping: '—',
    botFormatUptime: '—',
    totalf: totalPlugins(),
    processRamMB: global.webPanelPreview?.processRamMB ?? Math.round(process.memoryUsage().rss / 1048576),
    totalRamMB: Math.round(os.totalmem() / 1048576),
    rentalLine: '',
    botonSoporte: null,
    linkSoporte: null,
    isOwner: esPropietario,
    isAdmin: false,
    esOwnerConfig: esPropietario,
    esPrincipal: false,
  }

  const categorias = construirCategoriasMenu(ctx)
  const texto = construirTextoMenuCompleto(
    { sender: `+${String(phone || '').replace(/\D/g, '')}@s.whatsapp.net` },
    ctx,
    categorias
  )

  return {
    lang,
    texto,
    nombreBot: ctx.nombreBot,
    categorias: categorias.map((categoria) => ({
      id: categoria.id,
      title: categoria.title,
      description: categoria.description || '',
    })),
  }
}
