# Parejas: tops y diario de matrimonio

Se mantienen `/marry`, `/divorce` y `/comip`. La unión de tops no mueve monedas,
no transfiere personajes y no cambia quién puede gastar o vender cada cosa.

## Comandos

- `/unip`: propone aparecer como pareja en los tops **globalmente**.
  Ambos deben estar en ese grupo y tener un matrimonio mutuo vigente.
- Solo la pareja destinataria puede responder `si`/`sí` o `no`, o usar
  `/unip si` y `/unip no`, durante un minuto. La solicitud se guarda en SQLite.
- `/unip estado`: muestra el estado global de la unión.
- `/unip off`: cualquiera puede desactivar la unión global sin permiso del otro.
- `/pareja`: muestra duración del matrimonio, unión global, suma informativa de
  saldos, racha y disponibilidad del premio.
- `/dma`: cualquiera reclama el diario de matrimonio **para ambos**.

## Tops

### Identidades de WhatsApp

Los matrimonios anteriores pueden estar guardados por teléfono (PN) o LID.
Los comandos resuelven sus equivalencias usando los datos del mensaje, metadata
del grupo y el mapeo oficial de Baileys antes de abrir la transacción SQLite.
Una ficha de registro vacía no debe ocultar el matrimonio guardado en otro alias
verificado de la misma persona. No se fusionan monedas, no se cambia la fecha
de boda y no se inventa una relación de vuelta cuando el otro usuario no la tiene.
El perfil resuelve la mención solo para mostrarla, sin reescribir el vínculo.

`/topcoins` agrupa los matrimonios que aceptaron la unión global con `/unip`.
Suma cartera + banco de ambos y muestra una sola fila «Pareja: X y Y», sin
repetirlos en puestos individuales. Se aplica desde cualquier grupo y también
por privado, aunque los cónyuges no estén en el grupo donde se consulta el top.
Solo deben coincidir en el grupo donde envían y aceptan la propuesta.

La autorización global se guarda en ambos usuarios en SQLite. Las propuestas
pendientes quedan invalidadas si cualquiera desactiva la unión desde otro grupo,
para que una aceptación antigua no pueda reactivarla. Las autorizaciones locales
de la versión anterior no se convierten automáticamente en globales: hace falta
un nuevo `/unip` con consentimiento explícito sobre el alcance global.

`/topharem` usa la misma autorización: suma valor y unidades y cuenta los tipos
de personaje distintos entre ambos. Nunca fusiona las colecciones.

Divorciarse o cambiar de matrimonio invalida automáticamente la unión antigua,
aunque vuelvan a casarse con la misma persona. `/comip` es independiente: esa
opción sí comparte un porcentaje de ganancias y conserva su funcionamiento.

## Diario

- Primer reclamo tras cumplir 24 horas de matrimonio; los antiguos matrimonios
  sin fecha no reciben una antigüedad inventada.
- Una entrega por pareja cada 24 horas en total, no por usuario, grupo ni bot.
  Un solo `/dma` suma el premio al saldo personal de **cada** cónyuge.
- Base: 2.000 por persona; +200 por día consecutivo hasta un máximo base de 4.000.
- Cada séptimo reclamo consecutivo añade 1.000 extra por persona (máximo 5.000).
- La racha se reinicia si pasan más de 48 horas desde el último reclamo. No se
  pagan retroactivamente todos los días sin reclamar.
- La comprobación de matrimonio, cooldown y pago a ambos es una transacción
  SQLite. Dos procesos o grupos que reclaman a la vez no duplican el premio.
- El cooldown individual se conserva tras divorciarse. No se puede cobrar de
  nuevo ese día cambiando de pareja. La nueva boda también exige 24 horas.
- `/dma` no aplica `/comip` porque ya paga a ambos de forma independiente.

El perfil muestra el estado global de los tops y el estado del diario. No se
modifica el `/daily` personal, que sigue siendo otro premio independiente.
