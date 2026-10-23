# Revisión de aislamiento y seguridad del panel

## Alcance y límites

Objetivo autorizado: `https://serbot-pain.nexcodea.com`.
Se hicieron 16 peticiones públicas de bajo impacto, sin autenticación real,
sin crear cuentas, sin enviar correos y sin modificar datos en producción.
No se realizaron denegaciones de servicio, fuerza bruta, escaneos masivos ni
pruebas de 3.000 usuarios. Las pruebas de sobrecarga, concurrencia y permisos
se ejecutan únicamente contra servidores locales y bases temporales.

Esta revisión no certifica que el sitio carezca de vulnerabilidades. Un 401
en una ruta con una cadena SQL no demuestra por sí solo resistencia a SQLi:
solo demuestra que esa petición no superó la autenticación. No se han probado
con cuentas reales los permisos ni las operaciones administrativas en producción.

## Observaciones públicas anteriores al despliegue de las correcciones

| Comprobación | Resultado observado |
| --- | --- |
| Administración: ajustes, usuarios y roles sin sesión | 401 |
| Cookie de sesión inventada | 401 |
| Vincular un bot sin sesión | 401 |
| Registro con Origin ajeno y cuerpo vacío | 403, código `origin` |
| `.env`, `.git/HEAD`, SQLite y credenciales | 200 con el HTML de inicio; **no** se descargaron los archivos en estas pruebas |
| Ruta con traversal codificado | 400 del proxy |
| Estadísticas públicas | Exponían memoria, uptime y número de administradores |
| CSP, `X-Frame-Options`, `nosniff` | Presentes en respuestas de la aplicación |
| HSTS | No observado |
| Cabecera Server | Revela versión de nginx; depende del alojamiento |

## Cambios implementados

- El arranque normal de `main.js` inicia el HTTP en un proceso hijo dedicado,
  no en el proceso que atiende al principal. No carga los sockets ni la base
  de datos del bot en el hijo HTTP.
- Heap del proceso web: 256 MiB por defecto, configurable con
  `PAIN_WEB_HEAP_MB` (128–1024). Este es un límite de heap de V8, **no** un
  límite de toda la memoria residente, los buffers o la CPU del sistema.
- Reinicio independiente del HTTP, con espera progresiva. La prueba mata
  únicamente el hijo temporal y comprueba que cambia su PID, que el padre
  sigue vivo y que la sesión web continúa siendo válida.
- Comunicación local por IPC, no por un puerto administrativo público.
  Lista cerrada de operaciones, mensajes acotados, límite de solicitudes
  pendientes y tiempos de espera. No se acepta código o comandos arbitrarios.
- El principal recibe solicitudes solo para operaciones concretas de bots;
  las peticiones HTTP, contraseñas, SMTP y archivos web
  se procesan fuera de él. El estado del principal se publica cada 2 segundos,
  sin una consulta al padre por cada visitante.
- Vinculaciones: una preparación de código por vez y un máximo de ocho
  intentos activos en el puente. Las operaciones de bots siguen utilizando
  los controles y workers existentes; no se crean miles de sockets sin límite.
- Hasta 128 peticiones HTTP en curso; hasta ocho operaciones de autenticación
  y dos subidas de imagen concurrentes. Si se supera un cupo se responde 503
  con `Retry-After`, en lugar de acumular trabajo ilimitado.
- Tiempos límite explícitos para recibir cabeceras/cuerpos y para keep-alive.
- Estadísticas públicas sin métricas internas, agrupadas en una caché de
  cinco segundos; estado de sesiones compartido en caché de dos segundos.
- Archivos ocultos/traversal y archivos inexistentes devuelven error; ya no
  se disimulan con un 200 del inicio. Se comprueba también la ruta real para
  no servir enlaces simbólicos que salgan del directorio público.
- Revalidación ETag sin leer previamente el contenido completo del archivo.
- HSTS cuando la URL pública configurada usa HTTPS, sin `includeSubDomains`
  ni preload para no imponer HTTPS a otros servicios del dominio.
- Permiso separado `admin.sessions.config`: ver sesiones ajenas ya no
  permite editar su configuración. Los roles existentes no reciben este
  permiso automáticamente; puede concederse desde Roles.
- Un administrador sin gestión de roles no puede asignarse permisos que no
  tiene, ni tomar una cuenta superior cambiando su contraseña o eliminándola.
- Un choque de registro simultáneo devuelve 409, no un error interno 500.
- Los códigos de correo se consumen con una actualización atómica: dos
  restablecimientos simultáneos con el mismo código no pueden completarse
  ambos. La verificación comprueba también que el correo no haya cambiado.

## Límites del aislamiento

Un proceso separado protege frente a errores de JavaScript, bloqueo del event
loop del HTTP y agotamiento de su heap. **No es una sandbox ni un aislamiento
de máquina**: web y bots comparten host, disco, CPU, red y código del proyecto.
Una saturación del enlace o de la RAM total puede seguir afectando a ambos.
Las operaciones autorizadas de vinculación y control siguen trabajando con
el bot mediante el puente; no se promete que sean gratuitas en CPU.

Para garantías de recursos hacen falta límites del alojamiento/cgroups o
servicios en máquinas separadas, además de límites del proxy/WAF. El límite
de heap por sí solo no evita que un host se quede sin memoria total.

## Despliegue y ajustes del alojamiento

1. Actualizar el código y reiniciar una vez el proceso del bot para que
   `main.js` cargue el nuevo supervisor HTTP. Actualizar solo los JS del
   navegador no activa el aislamiento.
2. Comprobar que existe un PID adicional para `lib/webpanel/worker.js`.
3. Revisar que `PAIN_WEB_ADMIN_RESET` quede en `0` cuando no se necesite:
   el reinicio automático del HTTP no debe restablecer una contraseña.
4. Confirmar que el origen/puerto del panel no sea accesible por fuera del
   proxy autorizado. Configurar el proxy para sobrescribir las cabeceras
   de IP. La aplicación confía actualmente en `X-Forwarded-For` cuando
   `PAIN_WEB_TRUST_PROXY` está activo: un origen expuesto o una cadena de
   proxies mal configurada permitiría falsear esa IP y eludir límites.
   No se comprobó públicamente el acceso directo al origen.
5. En nginx: ocultar la versión con `server_tokens off`, aplicar límites
   de conexiones/peticiones y tamaños de subida adecuados. Comprobar HSTS
   también en los errores generados por el propio proxy.
6. Una vez desplegado, repetir las comprobaciones públicas y comprobar que
   ya no aparecen las métricas internas y que HSTS/404 están activos.

No se modificó la configuración de nginx, DNS, firewall ni del servidor
remoto desde esta sesión. Tampoco se afirma que estas correcciones ya estén
activas en la web pública hasta desplegarlas y verificarlas allí.

## Pruebas repetibles locales

```sh
node --test test/webpanel-security.test.js test/webpanel-isolation.test.js test/webpanel-ipc.test.js
node --test test/webpanel-*.test.js
```

La capacidad de 3.000 registros simultáneos sigue sin estar certificada:
requiere colas de correo persistentes, mediciones y dimensionamiento en un
entorno de carga separado. La protección de sobrecarga puede devolver un
503 deliberadamente; eso es distinto de garantizar que todos se registren
de inmediato.

Resultado local de esta revisión: **162 pruebas correctas de 162**. La prueba
de detección de workers, que antes dependía de los procesos reales del bot,
ahora utiliza un directorio temporal: ya no confunde actividad de producción
con un fallo del código ni escribe su archivo de prueba en ese directorio.
