# Android native integration

## Implemented in this repository
- Capacitor plugin `ControlHubTVPlugin.kt` performs DNS-SD/mDNS discovery for advertised LG webOS, Samsung, Google Cast and Android TV service types.
- LG webOS adapter attempts the local WebSocket registration flow on port 3000 and waits for the TV registration response.
- Samsung adapter attempts the legacy local remote-control WebSocket on port 8001 and waits for the TV's channel connection event.
- Remote commands are sent only through a session created after the corresponding protocol reports authorization/connection.
- Pairing requests time out after 45 seconds. A failed or unsupported protocol is reported as an error.

## Important compatibility limits
- DNS-SD discovery is not universal. A TV may be on the same Wi-Fi and still not advertise one of the searched service types.
- LG models that require the secure webOS endpoint (commonly port 3001) are not yet handled by this adapter.
- Samsung models that require WSS on port 8002 are not yet handled. The app deliberately does not disable TLS certificate validation to force a connection.
- Samsung model generations and regional firmware differ. A successful WebSocket send means the command was queued by the socket, not that the TV physically executed it.
- Google Cast and Android TV service discovery is visible, but pairing and commands for those platforms are not implemented yet.
- Sonic is not classified as a protocol by brand name; its underlying platform must be identified from actual discovery results or its model number.

## Build
The GitHub Actions workflow `.github/workflows/android-apk.yml` generates a Capacitor Android project, adds OkHttp for WebSocket transport, registers this plugin and builds a debug APK. A successful build still requires installation on an Android phone and tests against real TV models.

## Permissions and security
- Discovery runs on the local network and requires the phone and TV to share a reachable LAN.
- Pairing must be accepted on the television when the platform asks for it.
- No manufacturer account password is requested or stored.
- The Samsung adapter uses only the non-TLS legacy endpoint; it never accepts all TLS certificates.
- The current Android app does not yet include a background service or iOS plugin.
