const handler = async (m, { conn, args, isOwner }) => {
  if (global.processRole !== 'primary' || !isOwner) {
    return conn.reply(m.chat, 'Este comando solo puede usarse por un owner desde el bot principal.', m)
  }

  const mode = Number(args[0])
  if (mode !== 1 && mode !== 2) {
    return conn.reply(
      m.chat,
      'Uso: /pri 1 (dos procesos agrupados para sub-bots) o /pri 2 (un proceso por sub-bot).',
      m
    )
  }

  if (typeof process.send !== 'function') {
    return conn.reply(m.chat, 'El supervisor de procesos no está disponible.', m)
  }

  process.send({ type: 'set-mode', mode, authenticatedOwner: true }, (error) => {
    if (error) console.error('No se pudo enviar el cambio de modo al supervisor:', error.message)
  })
  return conn.reply(m.chat, `Solicitando /pri ${mode}; los procesos de sub-bots se reasignarán de forma gradual.`, m)
}

handler.help = ['pri <1|2>']
handler.tags = ['owner']
handler.command = ['pri']
handler.owner = true

export default handler
