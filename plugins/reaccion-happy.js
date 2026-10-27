import { crearReaccionDelirius } from '../lib/reacciones-delirius.js'

const handler = crearReaccionDelirius({
  tipo: 'happy',
  comandos: ['alegre', 'happy', 'feliz'],
  opcional: true,
  texto: (remitente, objetivo) => objetivo
    ? `${remitente} está feliz con ${objetivo} 😄`
    : `${remitente} está feliz 😄`,
})

export default handler
