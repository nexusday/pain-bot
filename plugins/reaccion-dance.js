import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'dance',
  comandos: ['dance', 'danzar'],
  opcional: true,
  texto: (remitente, objetivo) => objetivo
    ? `${remitente} está bailando con ${objetivo} 🎶`
    : `${remitente} está bailando 🎶`,
})

export default handler
