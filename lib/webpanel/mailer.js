import nodemailer from 'nodemailer'
import {
  DEFAULT_MAIL_TEMPLATES,
  MAIL_TEMPLATE_KEYS,
  htmlATexto,
  normalizarPlantillas,
  renderizarPlantilla,
} from './mail-templates.js'

export class MailError extends Error {
  constructor(message, code = 'mail_error', status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

const CLAVES = {
  host: 'mail_host',
  port: 'mail_port',
  encryption: 'mail_encryption',
  user: 'mail_user',
  pass: 'mail_pass',
  from: 'mail_from',
  fromName: 'mail_from_name',
  mailer: 'mail_mailer',
}

const ENCRIPTACIONES = new Set(['ssl', 'starttls', 'none'])

function texto(valor, max = 300) {
  return String(valor ?? '').trim().slice(0, max)
}

function correoValido(valor) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(valor || '').trim())
}

export async function leerConfigCorreo(store) {
  const valores = {}
  for (const [campo, clave] of Object.entries(CLAVES)) {
    valores[campo] = await store.obtenerMeta(clave)
  }
  const encryption = ENCRIPTACIONES.has(valores.encryption) ? valores.encryption : 'ssl'
  const port = Number.parseInt(valores.port, 10)
  return {
    host: texto(valores.host, 200),
    port: Number.isFinite(port) && port > 0 && port <= 65535 ? port : 465,
    encryption,
    user: texto(valores.user, 320),
    pass: String(valores.pass || ''),
    from: texto(valores.from, 320),
    fromName: texto(valores.fromName, 120),
    mailer: valores.mailer === 'smtp' || !valores.mailer ? 'smtp' : texto(valores.mailer, 30),
  }
}

export function correoConfigurado(config) {
  return Boolean(config?.host && config?.user && config?.pass && config?.from && config?.mailer === 'smtp')
}

export function configCorreoPublica(config) {
  return {
    host: config.host,
    port: config.port,
    encryption: config.encryption,
    user: config.user,
    passwordSet: Boolean(config.pass),
    from: config.from,
    fromName: config.fromName,
    mailer: config.mailer,
    configured: correoConfigurado(config),
  }
}

export async function guardarConfigCorreo(store, body = {}) {
  const actual = await leerConfigCorreo(store)
  const host = body.host !== undefined ? texto(body.host, 200) : actual.host
  const user = body.user !== undefined ? texto(body.user, 320) : actual.user
  const from = body.from !== undefined ? texto(body.from, 320) : actual.from
  const fromName = body.fromName !== undefined ? texto(body.fromName, 120) : actual.fromName
  const encryption = body.encryption !== undefined ? texto(body.encryption, 20).toLowerCase() : actual.encryption
  const mailer = body.mailer !== undefined ? texto(body.mailer, 30).toLowerCase() : actual.mailer
  const port = body.port !== undefined ? Number.parseInt(body.port, 10) : actual.port
  const pass = body.password !== undefined ? String(body.password || '') : ''

  if (host && !/^[a-zA-Z0-9.-]+$/.test(host)) {
    throw new MailError('El servidor SMTP no es válido.', 'invalid_mail_host')
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new MailError('El puerto SMTP debe estar entre 1 y 65535.', 'invalid_mail_port')
  }
  if (!ENCRIPTACIONES.has(encryption)) {
    throw new MailError('El cifrado debe ser SSL, STARTTLS o ninguno.', 'invalid_mail_encryption')
  }
  if (mailer !== 'smtp') {
    throw new MailError('El tipo de correo debe ser SMTP.', 'invalid_mailer')
  }
  if (user && !correoValido(user)) {
    throw new MailError('El usuario SMTP debe ser un correo válido.', 'invalid_mail_user')
  }
  if (from && !correoValido(from)) {
    throw new MailError('El remitente debe ser un correo válido.', 'invalid_mail_from')
  }
  if (pass && pass.length > 500) {
    throw new MailError('La contraseña SMTP es demasiado larga.', 'invalid_mail_password')
  }

  await store.establecerMeta(CLAVES.host, host)
  await store.establecerMeta(CLAVES.port, port)
  await store.establecerMeta(CLAVES.encryption, encryption)
  await store.establecerMeta(CLAVES.user, user)
  await store.establecerMeta(CLAVES.from, from)
  await store.establecerMeta(CLAVES.fromName, fromName)
  await store.establecerMeta(CLAVES.mailer, mailer)
  // Si la contraseña llega vacía se conserva la que ya estaba guardada. Así el
  // formulario puede mostrar «••••••» sin devolver nunca la clave real.
  if (pass) await store.establecerMeta(CLAVES.pass, pass)
  return leerConfigCorreo(store)
}

export async function cargarPlantillas(store) {
  return normalizarPlantillas(await store.obtenerMeta('mail_templates'))
}

export async function guardarPlantillas(store, datos) {
  const plantillas = normalizarPlantillas(datos)
  for (const key of MAIL_TEMPLATE_KEYS) {
    if (!plantillas[key]?.subject?.trim()) {
      plantillas[key].subject = DEFAULT_MAIL_TEMPLATES[key].subject
    }
    if (!plantillas[key]?.html?.trim()) {
      plantillas[key].html = DEFAULT_MAIL_TEMPLATES[key].html
    }
    if (!plantillas[key]?.text?.trim()) {
      plantillas[key].text = htmlATexto(plantillas[key].html)
    }
  }
  await store.establecerMeta('mail_templates', JSON.stringify(plantillas))
  return plantillas
}

export function crearTransporte(config) {
  if (!correoConfigurado(config)) {
    throw new MailError('El correo todavía no está configurado.', 'mail_not_configured', 409)
  }
  const secure = config.encryption === 'ssl'
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    requireTLS: config.encryption === 'starttls',
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: 12_000,
    greetingTimeout: 10_000,
    socketTimeout: 25_000,
    tls: { rejectUnauthorized: true },
  })
}

function remitente(config) {
  const nombre = String(config.fromName || '').replace(/["\r\n]/g, '').trim()
  return nombre ? `"${nombre}" <${config.from}>` : config.from
}

export async function enviarCorreo(config, { to, subject, html, text }) {
  const destino = texto(to, 320)
  if (!correoValido(destino)) {
    throw new MailError('El correo de destino no es válido.', 'invalid_recipient')
  }
  if (!html && !text) {
    throw new MailError('El correo no tiene contenido.', 'empty_mail')
  }
  const transporte = crearTransporte(config)
  try {
    return await transporte.sendMail({
      from: remitente(config),
      to: destino,
      subject: texto(subject, 200) || 'Notificación',
      html: html || undefined,
      text: text || (html ? htmlATexto(html) : undefined),
    })
  } catch (error) {
    throw new MailError(
      `No se pudo enviar el correo: ${error?.response || error?.message || 'error SMTP'}`,
      'mail_send_failed',
      502
    )
  } finally {
    try { transporte.close() } catch {}
  }
}

export function variablesCorreo({ brand, username, email, code, minutes, panelUrl, year } = {}) {
  return {
    brand: brand || 'Pain Bot',
    username: username || '',
    email: email || '',
    code: String(code || ''),
    minutes: String(minutes ?? ''),
    panel_url: panelUrl || '',
    year: String(year || new Date().getFullYear()),
  }
}

export async function enviarPlantilla(store, key, { to, variables = {} } = {}) {
  if (!MAIL_TEMPLATE_KEYS.includes(key)) {
    throw new MailError('Plantilla de correo desconocida.', 'invalid_template')
  }
  const config = await leerConfigCorreo(store)
  if (!correoConfigurado(config)) {
    throw new MailError('El correo todavía no está configurado.', 'mail_not_configured', 409)
  }
  const plantillas = await cargarPlantillas(store)
  const plantilla = plantillas[key]
  const asunto = renderizarPlantilla(plantilla.subject, variables)
  const html = renderizarPlantilla(plantilla.html, variables, { html: true })
  const texto = renderizarPlantilla(plantilla.text || htmlATexto(html), variables)
  return enviarCorreo(config, { to, subject: asunto, html, text: texto })
}

export async function enviarCorreoPrueba(store, { to, brand, panelUrl, username } = {}) {
  return enviarPlantilla(store, 'test', {
    to,
    variables: variablesCorreo({
      brand,
      panelUrl,
      username: username || to,
      email: to,
      year: new Date().getFullYear(),
    }),
  })
}
