const handler = async (m, { conn, args, isOwner }) => {
  if (global.processRole !== 'primary' || !isOwner) {
    return conn.reply(m.chat, 'Este comando solo puede usarse por un owner desde el bot principal.', m)
  }

  if (args[0] && Number(args[0]) !== 1) {
    return conn.reply(
      m.chat,
      'El modo /pri 2 fue retirado. Solo existe /pri 1: el principal va separado y todos los sub-bots comparten un único proceso.',
      m
    )
  }

  return conn.reply(
    m.chat,
    'Modo activo: /pri 1. El bot principal tiene su propio proceso y todos los sub-bots comparten un único proceso.',
    m
  )
}

handler.help = ['pri']
handler.tags = ['owner']
handler.command = ['pri']
handler.owner = true

export default handler
