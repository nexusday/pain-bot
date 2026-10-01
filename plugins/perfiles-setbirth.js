let handler = async (m, { conn, args, command, usedPrefix }) => {
  const textoAyuda = `
[❗] Debes ingresar una fecha válida para tu cumpleaños\n> *Ejemplo:* ${usedPrefix + command} 01/10/2009 (día/mes/año)\n> El día y el mes no pueden ser 00.`.trim()

  const fecha = args.join(' ').trim()
  if (!fecha) return conn.reply(m.chat, textoAyuda, m, rcanal)

  const coincidencia = fecha.match(/^(0?[1-9]|[12][0-9]|3[01])[\/\-](0?[1-9]|1[0-2])(?:[\/\-](\d{4}))?$/)
  if (!coincidencia) return conn.reply(m.chat, textoAyuda, m, rcanal)

  const [, diaTexto, mesTexto, anioTexto] = coincidencia
  const dia = Number(diaTexto)
  const mes = Number(mesTexto)
  const anio = anioTexto ? Number(anioTexto) : null
  const fechaValidacion = new Date(Date.UTC(anio || 2000, mes - 1, dia))
  if (
    fechaValidacion.getUTCDate() !== dia ||
    fechaValidacion.getUTCMonth() !== mes - 1 ||
    (anio && fechaValidacion.getUTCFullYear() !== anio)
  ) {
    return conn.reply(m.chat, textoAyuda, m, rcanal)
  }

  const usuarios = global.db.data.users
  const usuario = usuarios[m.sender] || (usuarios[m.sender] = {})
  if (usuario.birth && usuario.birth !== 'No registrado') {
    return conn.reply(m.chat, `[❗] Ya has establecido tu cumpleaños\n> Si deseas borrarlo, usa: *#delbirth*`, m, rcanal)
  }

  usuario.birth = `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}${anio ? `/${anio}` : ''}`
  return conn.reply(m.chat, `Tu cumpleaños se guardó como *${usuario.birth}* y ya aparecerá en tu perfil.`, m, rcanal)
}

handler.help = ['#setbirth + [fecha]\n→ Guarda tu fecha de nacimiento en tu perfil de usuario']
handler.tags = ['perfiles']
handler.command = ['setbirth']
export default handler
