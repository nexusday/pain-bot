import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'smile',
  comandos: ['reir', 'risa'],
  opcional: true,
  texto: (remitente, objetivo) => objetivo
    ? `${remitente} se está riendo con ${objetivo} 😂`
    : `${remitente} se está riendo 😂`,
})

export default handler
