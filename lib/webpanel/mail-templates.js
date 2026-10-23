/**
 * Plantillas de correo editables desde el panel.
 *
 * Las variables se escriben entre dobles llaves, por ejemplo
 * `{{username}}` o `{{code}}`. En las plantillas HTML se escapan los valores
 * para que un nombre de usuario no pueda inyectar etiquetas.
 */

export const MAIL_VARIABLES = [
  { key: 'brand', label: 'Nombre del panel', example: 'Pain Bot' },
  { key: 'username', label: 'Usuario que recibe el correo', example: 'mi_usuario' },
  { key: 'email', label: 'Correo del usuario', example: 'usuario@correo.com' },
  { key: 'code', label: 'Código de 6 dígitos', example: '482913' },
  { key: 'minutes', label: 'Minutos de validez', example: '15' },
  { key: 'panel_url', label: 'Dirección del panel', example: 'https://panel.ejemplo.com' },
  { key: 'year', label: 'Año actual', example: '2026' },
]

const ESTILO = 'margin:0;padding:0;background:#0b0c0f;font-family:Inter,Segoe UI,Arial,sans-serif;color:#e8edf4'
const TARJETA = 'max-width:560px;margin:0 auto;padding:34px 28px;background:#141820;border:1px solid #252c38;border-radius:16px'
const BOTON = 'display:inline-block;padding:12px 22px;border-radius:10px;background:#4f8cff;color:#fff;text-decoration:none;font-weight:600'
const CODIGO = 'display:inline-block;margin:18px 0;padding:14px 22px;border-radius:12px;background:#0b0c0f;border:1px solid #303a4a;color:#fff;font-size:30px;letter-spacing:8px;font-weight:700'

function envolver(contenido) {
  return `<!doctype html><html lang="es"><body style="${ESTILO}">
  <div style="padding:34px 16px">
    <div style="${TARJETA}">
      <div style="font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#8ea0b8;margin-bottom:22px">{{brand}}</div>
      ${contenido}
      <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #252c38;color:#7f8fa6;font-size:12px;line-height:1.6">
        Este correo se envió automáticamente. Si no solicitaste esta acción, puedes ignorarlo.
      </p>
      <p style="margin:8px 0 0;color:#5f6d80;font-size:11px">© {{year}} {{brand}}</p>
    </div>
  </div>
</body></html>`
}

export const DEFAULT_MAIL_TEMPLATES = {
  verify: {
    label: 'Verificación de correo',
    description: 'Código que recibe el usuario al registrarse o cambiar de correo.',
    subject: 'Verifica tu correo en {{brand}}',
    html: envolver(`
      <h1 style="margin:0 0 12px;font-size:23px;line-height:1.25;color:#fff">Hola, {{username}}</h1>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#b9c5d6">
        Usa este código para verificar tu correo en <b style="color:#e8edf4">{{brand}}</b>:
      </p>
      <div style="${CODIGO}">{{code}}</div>
      <p style="margin:0;font-size:13px;line-height:1.7;color:#8ea0b8">
        El código caduca en <b style="color:#e8edf4">{{minutes}} minutos</b>.
        Escríbelo en la sección <b style="color:#e8edf4">Mi cuenta</b> del panel.
      </p>
      <p style="margin:18px 0 0"><a href="{{panel_url}}" style="${BOTON}">Abrir el panel</a></p>
    `),
    text: `Hola, {{username}}

Usa este código para verificar tu correo en {{brand}}:

{{code}}

El código caduca en {{minutes}} minutos. Escríbelo en la sección Mi cuenta del panel.
Panel: {{panel_url}}

Si no solicitaste esta verificación, ignora este correo.`,
  },

  reset: {
    label: 'Recuperar contraseña',
    description: 'Código para restablecer la contraseña olvidada.',
    subject: 'Restablece tu contraseña de {{brand}}',
    html: envolver(`
      <h1 style="margin:0 0 12px;font-size:23px;line-height:1.25;color:#fff">Hola, {{username}}</h1>
      <p style="margin:0 0 8px;font-size:14px;line-height:1.7;color:#b9c5d6">
        Recibimos una solicitud para restablecer la contraseña de tu cuenta en
        <b style="color:#e8edf4">{{brand}}</b>. Tu código es:
      </p>
      <div style="${CODIGO}">{{code}}</div>
      <p style="margin:0;font-size:13px;line-height:1.7;color:#8ea0b8">
        Caduca en <b style="color:#e8edf4">{{minutes}} minutos</b>.
        Si no fuiste tú, cambia tu contraseña desde el panel y revisa tu cuenta.
      </p>
      <p style="margin:18px 0 0"><a href="{{panel_url}}" style="${BOTON}">Ir al panel</a></p>
    `),
    text: `Hola, {{username}}

Recibimos una solicitud para restablecer tu contraseña en {{brand}}.

Tu código es: {{code}}

Caduca en {{minutes}} minutos y solo se puede usar una vez.
Si no fuiste tú, ignora este correo y cambia tu contraseña desde el panel.

Panel: {{panel_url}}`,
  },

  test: {
    label: 'Correo de prueba',
    description: 'Mensaje que se envía al probar la configuración SMTP.',
    subject: 'Prueba de correo de {{brand}}',
    html: envolver(`
      <h1 style="margin:0 0 12px;font-size:23px;line-height:1.25;color:#fff">Todo listo, {{username}}</h1>
      <p style="margin:0;font-size:14px;line-height:1.7;color:#b9c5d6">
        Este es un correo de prueba enviado desde <b style="color:#e8edf4">{{brand}}</b>.
        Si lo estás leyendo, el servidor SMTP está configurado correctamente.
      </p>
      <p style="margin:18px 0 0"><a href="{{panel_url}}" style="${BOTON}">Abrir el panel</a></p>
    `),
    text: `Todo listo, {{username}}

Este es un correo de prueba enviado desde {{brand}}. Si lo estás leyendo, el servidor SMTP está configurado correctamente.

Panel: {{panel_url}}`,
  },
}

export const MAIL_TEMPLATE_KEYS = Object.keys(DEFAULT_MAIL_TEMPLATES)

function escaparHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]))
}

function normalizarTexto(texto, porDefecto) {
  return typeof texto === 'string' && texto.trim() ? texto : porDefecto
}

/** Mezcla lo guardado con las plantillas por defecto sin perder campos nuevos. */
export function normalizarPlantillas(valor) {
  let datos = valor
  if (typeof valor === 'string') {
    try { datos = JSON.parse(valor) } catch { datos = {} }
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) datos = {}
  const salida = {}
  for (const key of MAIL_TEMPLATE_KEYS) {
    const base = DEFAULT_MAIL_TEMPLATES[key]
    const actual = datos[key] && typeof datos[key] === 'object' ? datos[key] : {}
    salida[key] = {
      ...base,
      subject: normalizarTexto(actual.subject, base.subject).slice(0, 200),
      html: normalizarTexto(actual.html, base.html),
      text: normalizarTexto(actual.text, base.text),
    }
  }
  return salida
}

/** Reemplaza `{{variable}}`; en HTML escapa los valores. */
export function renderizarPlantilla(texto, variables = {}, { html = false } = {}) {
  const valores = { ...variables }
  return String(texto || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (coincidencia, key) => {
    if (!(key in valores)) return coincidencia
    const valor = valores[key] == null ? '' : String(valores[key])
    return html ? escaparHtml(valor) : valor
  })
}

/** Convierte el HTML a texto plano razonable para el fallback del correo. */
export function htmlATexto(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
