# Banco de horas premium

`maxHours` y `unlockHours` tienen funciones distintas:

1. Mientras el banco está abierto, los anuncios pueden sumar hasta `maxHours`.
2. Al alcanzar ese máximo, se bloquea la recarga.
3. Sigue bloqueada hasta que el tiempo restante baja a `unlockHours` o menos.
4. Entonces se reabre y permite volver a llenar el banco hasta `maxHours`, aunque
   los anuncios lo hagan superar otra vez `unlockHours`.

Ejemplo con máximo **24 h**, desbloqueo **9 h** y premio de **1 min**:

| Tiempo restante / situación | ¿Permite sumar? |
| --- | --- |
| Cargando por primera vez, 9 h 1 min | Sí |
| Acaba de alcanzar 24 h | No |
| Después de ese llenado, todavía quedan 12 h | No |
| Bajó a 9 h | Sí |
| Miró otro anuncio y ahora quedan 9 h 1 min | Sí |
| Volvió a alcanzar 24 h | No |

El bloqueo y el máximo asociado se guardan en `premium.adBankLocked` y
`premium.adBankMaxHours` en el config del sub-bot. No dependen de la sesión del
navegador ni de una variable en memoria. Leer el estado puede guardar una
transición de bloqueo/desbloqueo, pero no cambia el vencimiento, premios ni
personalizaciones. Los configs antiguos se reconocen de forma tolerante usando
el último reclamo si demuestra que se había llenado el banco.

Al ampliar el máximo desde Administración, se permite aprovechar la nueva
capacidad. Al reducirlo por debajo del saldo existente, la recarga se bloquea,
sin quitar horas ya ganadas. El frontend y la API usan el mismo estado; iniciar
o reclamar otro anuncio con el banco bloqueado se rechaza en el servidor.

`cooldownSeconds` es otra regla: una breve espera entre anuncios, independiente
del ciclo de horas. No cambia el estado abierto/cerrado del banco.
