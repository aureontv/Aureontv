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
