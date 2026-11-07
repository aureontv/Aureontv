# Control Hub TV native integration

## Estado real
La interfaz web ya está preparada para consumir un plugin nativo llamado `ControlHubTV`, pero el plugin Android/iOS todavía no está implementado. Por eso la web no muestra dispositivos ficticios ni permite afirmar que un televisor esté vinculado.

## Contrato que espera la interfaz

- `discover()` devuelve `{ devices: DeviceCandidate[] }` encontrados realmente en la red local.
- `pair({ deviceId })` debe iniciar el flujo oficial del fabricante (código/confirmación en el TV cuando corresponda) y devolver `{ paired: true, connectionId, capabilities }` solo después de confirmación real.
- `sendCommand({ connectionId, command })` envía una orden compatible con el modelo y devuelve `{ accepted: true }` solo si el adaptador la aceptó.
- `unpair({ connectionId })` revoca la vinculación local.

La interfaz busca el plugin en `Capacitor.Plugins.ControlHubTV` o `window.ControlHubTV`.

## Descubrimiento por plataforma

### Android
Implementar descubrimiento de servicios locales con Android Network Service Discovery (`NsdManager`, basado en DNS-SD/mDNS), con permisos de red local adecuados a la versión de Android. El descubrimiento de servicios no identifica automáticamente cualquier televisor: cada protocolo debe resolver el dispositivo y consultar metadatos reales antes de mostrar marca/modelo.

Documentación: https://developer.android.com/reference/android/net/nsd/NsdManager

### iOS
Implementar Bonjour con Network framework o APIs DNS-SD, declarar `NSLocalNetworkUsageDescription` y los tipos Bonjour usados en `NSBonjourServices`, y respetar la autorización de red local del usuario.

Documentación: https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy

## Adaptadores de TV
Implementar y probar por separado, empezando por:
1. Google TV / Android TV: descubrimiento y emparejamiento oficial del dispositivo; no asumir que todos los fabricantes exponen el mismo protocolo.
2. LG webOS: protocolo local compatible y autorización en la pantalla del televisor.
3. Samsung Tizen / SmartThings: API oficial y OAuth/autorización del usuario; no asumir acceso LAN universal.

Cada adaptador debe declarar capacidades verificadas. No enviar comandos no soportados por el modelo.

## Seguridad
- No escanear ni controlar redes fuera de la red local autorizada por el usuario.
- No pedir contraseñas de cuentas de fabricantes en la web.
- No guardar tokens de fabricante en localStorage.
- No informar estado online ni éxito de comandos sin respuesta real del TV.
- La vinculación debe poder revocarse.


## Ruta de compatibilidad amplia mediante Home Assistant

La página web ahora puede conectarse directamente a la API WebSocket local de Home Assistant. El token se conserva solo en memoria de la pestaña y no se escribe en localStorage. La interfaz consulta estados y registros de entidades/dispositivos para mostrar televisores que Home Assistant ya haya descubierto e integrado.

- LG: la integración oficial webOS documenta compatibilidad con webOS 2.0 o posterior y requiere habilitar LG Connect Apps.
- Samsung: la integración oficial documenta Smart TVs Tizen de 2016 en adelante, además de modelos con sus APIs compatibles.
- Otras marcas: dependen de que Home Assistant tenga una integración para ese modelo o plataforma. No se puede prometer compatibilidad literal con todos los televisores; modelos antiguos, cerrados o sin API de red pueden requerir un hub IR compatible u otro método autorizado.

Los controles de volumen, encendido y reproducción usan servicios estándar de Home Assistant. Navegación (direcciones, inicio, atrás y menú) solo se envía si la integración expone una entidad `remote.*` vinculada al mismo dispositivo. Una solicitud exitosa significa que Home Assistant aceptó el servicio, no necesariamente que el televisor ejecutó físicamente cada acción.

Documentación de integraciones:
- https://www.home-assistant.io/integrations/webostv/
- https://www.home-assistant.io/integrations/samsungtv/
- https://www.home-assistant.io/integrations/


### Requisito de transporte para la web alojada

Como Control Hub se sirve mediante HTTPS, los navegadores bloquean la conexión WebSocket sin cifrar (`ws://`) hacia un Home Assistant local que solo ofrezca HTTP. Esta integración web exige una dirección de Home Assistant con HTTPS/WSS. Para una conexión local HTTP sin configurar TLS hará falta el puente nativo Android/iOS, que todavía no está implementado ni publicado.
