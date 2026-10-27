import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'angry',
  comandos: ['angry', 'enojado'],
  opcional: true,
  texto: (remitente, objetivo) => objetivo
    ? `${remitente} se está enojando con ${objetivo} 😠`
    : `${remitente} se está enojando 😠`,
})

export default handler
