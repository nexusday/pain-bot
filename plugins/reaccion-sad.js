import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'cry',
  comandos: ['sad', 'triste'],
  opcional: true,
  texto: (remitente, objetivo) => objetivo
    ? `${remitente} se puso triste por ${objetivo} 😢`
    : `${remitente} se puso triste 😢`,
})

export default handler
