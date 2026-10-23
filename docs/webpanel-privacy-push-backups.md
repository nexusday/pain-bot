# IP privadas, notificaciones y migraciones — panel 1.9.0

## Privacidad de usuarios

En **Roles**, el permiso `admin.users.ip` permite ver IP en usuarios,
vinculaciones y auditoría. Sin él, el servidor elimina esos datos de las
respuestas, incluidos campos anidados o JSON dentro de la auditoría: no es
solo un cambio visual. Por defecto no se concede a administradores secundarios.
El principal siempre puede verlos.
Esto controla el panel y la API, no el acceso por SSH o a archivos del servidor.
Tampoco puede retirar información que alguien haya visto antes de restringirla.

Un administrador con gestión de roles pero sin permiso de IP no puede
concedérselo, asignarse un rol que lo tenga, modificar ese rol ni tomar una
cuenta con dicho permiso cambiando su contraseña. El permiso para gestionar
roles sigue siendo de alta confianza y conviene concederlo con cuidado.

## Notificaciones push

- Permisos de administración: `admin.notifications` para enviar y consultar
  destinatarios; `admin.notifications.settings` para configurar la tarjeta.
  Concede ambos si esa persona también va a administrar el intervalo.
- En **Notificaciones** se puede enviar título, mensaje y enlace interno a
  todos los suscritos o a usuarios seleccionados. Se incluyen buscador,
  paginación, estado por usuario y un historial de campañas.
- Los envíos se guardan en SQLite y se procesan de cuatro en cuatro. No se
  abren miles de conexiones de golpe. Un reinicio recupera los pendientes;
  el `tag` de campaña ayuda a agrupar posibles reintentos. No hay garantía de
  lectura ni de entrega exactamente una vez.
- «Aceptadas» significa aceptadas por el servicio push, no vistas por el
  destinatario. Un dispositivo puede estar apagado, sin red o con restricciones
  del sistema operativo. La caducidad de entrega es de 24 horas.
- Máximo cinco campañas pendientes, 10000 dispositivos por campaña y veinte
  dispositivos registrados por cuenta. Las suscripciones solo pueden apuntar
  a servicios push conocidos, no a servidores internos o URL arbitrarias.

### Consentimiento y recordatorios

La tarjeta flotante tiene **Activar avisos** y **Ahora no**. El permiso nativo
se solicita únicamente al pulsar el botón, nunca automáticamente al entrar.
El intervalo de recordatorio es configurable entre 5 minutos y 30 días;
por defecto, 24 horas. Puede desactivarse la tarjeta sin impedir la activación
manual desde **Mi cuenta**.

El estado vive en `panel_push_devices`, relacionado con el usuario:
permiso comunicado por el navegador, datos de suscripción necesarios para
Web Push, estado activo, última comprobación y próximo recordatorio. La
suscripción y sus claves se guardan en la base para enviar; **no** se devuelven
al listado de administradores. La base SQLite debe permanecer privada.

Se comprueba el permiso al entrar, recuperar el foco y cuando el navegador
notifica un cambio mientras está abierto. También se revisa periódicamente,
evitando escrituras innecesarias. Un 404/410 del proveedor desactiva la
suscripción caducada en la base. Cerrar sesión elimina la suscripción de esa
sesión y el cliente también intenta cancelarla en el navegador.

**Límite inevitable:** no existe una API universal que avise inmediatamente al
servidor cuando el usuario bloquea las notificaciones y cierra el navegador.
Se muestra la última comprobación conocida y se actualiza al volver o al
recibir una respuesta del proveedor. No debe interpretarse como seguimiento
en tiempo real del dispositivo.

Se requiere HTTPS y un navegador compatible con Service Worker y Push API.
En iPhone/iPad puede requerirse instalar el panel en la pantalla de inicio.
Las claves VAPID se generan y persisten en `panel_meta`; no se regeneran en
cada arranque. Si cambian, el cliente intenta renovar su suscripción respetando
el permiso concedido. El aviso manual explica cómo desbloquear el permiso
si el navegador lo ha denegado.

## Copias de seguridad y cambio de servidor

La sección **Copias** es exclusiva del principal, incluso si otro admin tiene
gestión de roles. Exportar o preparar una importación exige confirmar la
contraseña actual del panel, además de la contraseña de la copia.

### Qué se exporta

1. Usuarios del panel, sus IDs, hashes y sales de contraseña, roles, correos,
   verificación, estado y ajustes. Incluye ajustes privados como SMTP y claves
   VAPID: por eso el archivo se cifra obligatoriamente.
2. Todas las colecciones confirmadas de la base global SQLite, no solo monedas:
   usuarios de WhatsApp, chats, matrimonios, inventarios, ajustes y colecciones
   adicionales conservan sus identificadores y relaciones.
3. Preferencias de notificaciones por dispositivo. Las suscripciones activas
   se revalidan al volver al panel; no se reenvían campañas antiguas.

Se puede elegir panel, base global o ambos. La exportación utiliza snapshots
coherentes de cada base; no es una transacción simultánea entre ambas y no
incluye cambios que los procesos aún no hayan confirmado en SQLite.

**No se exportan** carpetas `sessions/` o `Serbot/`, credenciales de WhatsApp,
conexiones y asignaciones temporales de bots, cookies web, códigos de correo
ni la cola antigua de notificaciones. La importación tampoco borra credenciales
que ya existan en el servidor de destino: usa un destino limpio si no quieres
conservar conexiones previas.

### Contraseñas y cifrado

Los usuarios entrarán con sus claves habituales: `scrypt` guarda la sal dentro
del hash. No depende del dominio, la IP ni del secreto de cookies del servidor.
No se descifran ni se exportan contraseñas en texto plano. Las sesiones web
anteriores no se conservan: habrá que iniciar sesión otra vez.

El archivo `.painbackup` se cifra con AES-256-GCM, clave derivada mediante
scrypt, sal e IV aleatorios y autenticación de integridad. Una contraseña
incorrecta o un archivo modificado se rechazan antes de restaurar. Mínimo
12 caracteres para la contraseña de la copia. Si se pierde, no hay mecanismo
para recuperar el contenido cifrado.

Límite de esta interfaz: 32 MiB de datos JSON descifrados y 48 MiB de archivo
subido. Para bases mayores, utiliza copias SQLite offline completas y un
procedimiento de migración dimensionado para ese tamaño. No copies únicamente
un `.sqlite` de una base activa sin tener en cuenta su WAL.

### Procedimiento recomendado

1. En el servidor anterior, descarga **Usuarios del panel y base global**.
   Guarda archivo y contraseña fuera del servidor. Hazlo antes de eliminar
   el proyecto: una base borrada no se puede recuperar sin una copia previa.
2. Instala la misma versión o una compatible en el servidor nuevo y ejecuta
   `npm install`. Configura el dominio, HTTPS y un administrador inicial.
3. Entra como principal del servidor nuevo, abre **Copias**, selecciona el
   archivo, confirma ambas contraseñas y prepara la importación. Esto valida
   los datos y deja una preparación local cifrada; todavía no reemplaza nada.
4. Detén **todo el servicio del bot**, incluido el supervisor, los workers y
   la web. No uses solo «reiniciar el principal»: el supervisor podría volver
   a levantar procesos. Ejecuta desde la carpeta del proyecto el comando
   exacto que muestra el panel:

   ```sh
   node scripts/panel-backup.js restore --id IDENTIFICADOR
   ```

5. Configura `PAIN_WEB_ADMIN_USER` con el nombre del principal de la copia y
   `PAIN_WEB_ADMIN_RESET=0`. De otro modo el entorno podría crear otro dueño
   o reemplazar una contraseña restaurada.
6. Inicia el servicio y comprueba un acceso, saldos y relaciones. Los usuarios
   podrán volver a vincular sus bots. Si cambia el dominio, deberán conceder
   el permiso de notificaciones en el nuevo dominio.

La preparación está cifrada con el secreto local del servidor de destino:
no muevas solo ese archivo a otro servidor ni borres `webpanel.secret` antes
de aplicarla. Para otro destino, utiliza la copia descargada y su contraseña.
Las preparaciones no aplicadas caducan y se retiran al preparar otra después
de siete días; se permiten cinco simultáneas. La copia descargada no caduca.

### Protección al restaurar

Las versiones nuevas publican leases de proceso y un bloqueo de restauración.
El comando se niega a aplicar mientras detecta procesos activos. Actualiza y
reinicia una vez el servicio para activar esos controles; procesos antiguos o
programas externos que escriban directamente en SQLite también deben detenerse.

Se preparan y validan bases candidatas completas antes del primer reemplazo.
Los originales, sus WAL/SHM y los registros transitorios quedan en
`storage/restore-recovery/IDENTIFICADOR/` con un manifiesto. No publiques ni
separes sus archivos: contienen datos privados y deben conservarse juntos.

Antes del primer reemplazo se escribe un diario. Si la restauración se
interrumpe, los procesos no arrancan automáticamente sobre una mezcla de
bases. Consulta el identificador en `storage/restore.lock/journal.json` y usa:

```sh
node scripts/panel-backup.js recover --id IDENTIFICADOR-DE-LA-RESTAURACION
```

Si el reemplazo no terminó, se revierten los cambios pendientes; si ya terminó,
se finaliza la liberación del bloqueo. No borres el bloqueo a ciegas. Un fallo
de disco o permisos puede necesitar revisión manual usando el manifiesto.

## Validación

Hay pruebas de eliminación de IP en varias rutas, delegación de permisos,
protección SSRF, revocación y caducidad de push con transporte simulado,
cifrado y archivo modificado, restauración en otro destino, acceso con la misma
contraseña, saldos y matrimonios preservados, exclusión de sesiones y bloqueo
de arranque ante una restauración interrumpida. Los envíos reales dependen del
proveedor y del consentimiento del navegador; no se enviaron campañas a
usuarios de producción durante el desarrollo.
