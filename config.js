/* By Sunkovv
*/



import './lib/load-env.js'
import { watchFile, unwatchFile } from 'fs' 
import chalk from 'chalk'
import { fileURLToPath } from 'url'
// El premium de los sub-bots cambia `moneda`, `canal` y `rcanal` por mensaje.
// Esto los convierte en propiedades del contexto: lo que ves aquí abajo sigue
// siendo el valor por defecto, y un sub-bot premium usa el suyo sin tocar al
// resto de sub-bots que comparten el mismo proceso.
import { instalarContextoPremium } from './lib/premium.js'

instalarContextoPremium()


// CAMBIA POR EL NUMERO O TU wa.me/@usuario DEL OWNER
// Ejemplos válidos:
//   ['51999999999', 'Sunkovv', true]
//   ['wa.me/@Sunkovv', 'Sunkovv', true]
//   ['@Sunkovv', 'Sunkovv', true]
global.owner = [
  ['wa.me/@Sunkovv', 'Sunkovv', true]
]

//  ACA PON EL LID DEL OWNER DEL BOT PARA QUE TE HAGA CASO COMO OWNER EL BOT, USA EL COMANDO /ID EN TU 
//PRIVADO PARA SACAR TU LID
global.ownerLid = [
  ['198119006412828', 'Sunkovv', true],
  ['258196690227436', 'Linnight', true]
]

global.sessions = 'Sessions'
global.bot = 'Serbot' 
global.AFBots = true

global.packname = '𝗣𝗔𝗜𝗡 𝗕𝗢𝗧 𝗠𝗗'
global.namebot = '𝗣𝗔𝗜𝗡 𝗕𝗢𝗧 𝗠𝗗'
global.author = 'Sunkovv'
// Moneda global. Un sub-bot premium puede usar la suya (panel → Premium).
global.moneda = 'USD'


// Etiqueta de canal en mensajes (rcanal). Obtén el JID con: .canalid <link del canal>
// Ejemplo: global.canal = { jid: '120363423390538090@newsletter', name: 'Pain Community' }
// También acepta link: global.canal = 'https://whatsapp.com/channel/XXXXXXXX'
global.canal = { jid: '120363405059433072@newsletter', name: 'Nexo Community' }

// Canales que el bot y sub-bots siguen al conectar.
// Puedes usar el JID (recomendado) o el link del canal:
// ch1: '120363405059433072@newsletter'
global.ch = {
ch1: '120363405059433072@newsletter',
}

// Canal para logs/anuncios de sub-bots. El bot y sub-bots también lo siguen al conectar.
global.logssubbots = '120363430965244922@newsletter'

// true = botones/listas con @itsliaaa/baileys | false = solo @whiskeysockets/baileys
global.baileysInteractive = true

// ── Panel web de vinculación ────────────────────────────────────────────────
// El proceso principal levanta un servidor HTTP en `port` (la allocation de
// Pterodactyl). El dominio NO está fijo en el código: se arma con
// `subdomain` + `domain`, y puedes sobreescribir todo con variables PAIN_WEB_*.
//
//   subdomain: 'pain'          -> https://pain.nexcodea.com
//   domain:    'nexcodea.com'  -> el dominio base
//   publicUrl: ''              -> si lo defines, manda sobre subdomain+domain
//
// En Pterodactyl: asigna el puerto 10022 y apunta el subdominio al nodo.
// Si usas Cloudflare/proxy, activa "trustProxy" para leer X-Forwarded-*.
global.webPanel = {
  enabled: true,
  host: '0.0.0.0',
  port: 10022,
  subdomain: process.env.PAIN_WEB_SUBDOMAIN || 'pain',
  domain: process.env.PAIN_WEB_DOMAIN || 'nexcodea.com',
  publicUrl: process.env.PAIN_WEB_PUBLIC_URL || '',
  // Si sirves el panel directamente por el puerto (sin proxy), pon
  // includePort: true para que la URL pública incluya :10022. Con reverse
  // proxy (recomendado) se omite y queda https://subdominio.dominio.
  includePort: process.env.PAIN_WEB_INCLUDE_PORT === '1',
  brandName: process.env.PAIN_WEB_BRAND || 'PAIN BOT MD',
  // Cuenta administradora inicial. La contraseña NO se escribe aquí: se lee
  // de PAIN_WEB_ADMIN_PASS (.env local o Startup → Environment en Pterodactyl).
  // Si queda vacía, se genera una aleatoria y se guarda en
  // storage/webpanel-admin.txt.
  adminUser: process.env.PAIN_WEB_ADMIN_USER || 'admin',
  adminPass: process.env.PAIN_WEB_ADMIN_PASS || '',
  adminReset: process.env.PAIN_WEB_ADMIN_RESET === '1',
  sessionSecret: process.env.PAIN_WEB_SECRET || '',
  trustProxy: process.env.PAIN_WEB_TRUST_PROXY !== '0',
  cookieName: process.env.PAIN_WEB_COOKIE || 'pain_panel',
  // Registro: puedes cerrarlo o exigir un código de invitación.
  allowRegistration: process.env.PAIN_WEB_ALLOW_REGISTER !== '0',
  requireInvite: process.env.PAIN_WEB_REQUIRE_INVITE === '1',
  inviteCode: process.env.PAIN_WEB_INVITE || '',
  // Límites anti-abuso del emparejamiento.
  sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
  pairTtlMs: 180_000,
  codeTtlMs: 90_000,
  maxPairAttemptsPerHour: Number.parseInt(process.env.PAIN_WEB_MAX_LINKS_HOUR, 10) || 8,
  maxPairAttemptsPerDay: Number.parseInt(process.env.PAIN_WEB_MAX_LINKS_DAY, 10) || 30,
  maxPairAttemptsPerIpPerHour: Number.parseInt(process.env.PAIN_WEB_MAX_LINKS_IP_HOUR, 10) || 20,
}

global.mods =   []
global.prems = []

global.multiplier = 69 
global.maxwarn = '2'

// APIS QUE USA EL BOT EN GLOBAL(NO BORRES)
global.APIs = {
vreden: { url: "https://api.vreden.web.id", key: null },
delirius: { url: "https://api.delirius.online", key: null },
alex: { url: "https://alex-api-scraper2-1.onrender.com", key: "ALEX-93F60DF06184B790FDFE98E8F5D8C520" },
zenzxz: { url: "https://api.zenzxz.my.id", key: null },
siputzx: { url: "https://api.siputzx.my.id", key: null },
qasim: {
  url: "https://api.qasimdev.dpdns.org",
  key: "qasim-dev",
  openRouterKey: process.env.OPENROUTER_API_KEY || null
},
kronix: {
  url: "https://kronix-apis.nexcodea.com",
  key: "9003f3f5e589987e589073bd9965ac73a00663acb136b73b9b30f601e37c52e4"
}
}

import { syncRcanalFromConfig } from './lib/newsletter-rcanal.js'
syncRcanalFromConfig()

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
  unwatchFile(file)
  console.log(chalk.redBright("Update 'config.js'"))
  import(`${file}?update=${Date.now()}`)
})
