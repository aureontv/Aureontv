# Android native integration

## What the Android build contains
- The Capacitor wrapper loads the same AUREON TV web interface and its existing app.js; it is not a separate remote-control website.
- The native ControlHubTV plugin scans the local Wi-Fi network using DNS-SD/mDNS for advertised LG webOS, Samsung, Google Cast and Android TV service types.
- LG webOS discovery also uses SSDP/UPnP. When the TV is selected, AUREON TV requests its on-screen authorization, obtains its SSAP client key and opens the dedicated pointer-input WebSocket for directional navigation and OK/Back/Home commands.
- LG pointer-socket destinations are checked against the discovered TV's private LAN address. The certificate fingerprint is pinned for secure WebSocket connections.
- Samsung currently attempts the legacy local remote-control WebSocket on port 8001 and waits for the TV's channel-connection event. Newer models that require WSS/8002 are not yet supported by this adapter.
- Google Cast and Android TV service discovery is present, but pairing and commands for those platforms are not implemented yet.
- Sonic models are supported only when their underlying TV platform/protocol is identified and implemented; a brand label alone is not enough.

## Compatibility and honest status
- DNS-SD/SSDP discovery depends on the TV advertising a supported service and the router allowing local multicast.
- Discovery does not guarantee that every detected device can be controlled.
- LG webOS remote navigation requires the TV to grant its pointer-input socket during pairing. If the permission is denied or the socket cannot be opened, the app reports the issue rather than showing a connected remote that cannot navigate.
- Samsung model generations and firmware differ. This adapter currently uses the legacy non-TLS LAN endpoint only.
- A successful socket send means the command was accepted by the local WebSocket, not that the TV physically completed the action.
- The PWA hosted in Chrome cannot run this native discovery plugin. The Android APK built from this repository includes the same AUREON TV interface plus the native local-network module.

## Build and test
The workflow .github/workflows/android-apk.yml creates the Capacitor Android project, registers the native TV plugin, adds the network permissions and builds a debug APK. A successful build still needs installation on an Android phone and testing against a real TV. The Android phone and TV must be on the same reachable Wi-Fi network. The first LG pairing must be approved on the television screen.

## Privacy and security
- Discovery is limited to local/private network addresses.
- Pairing is explicit; no TV account password is requested.
- No router port forwarding is required.
- Do not paste TV pairing codes or Home Assistant tokens into chats.
- The PWA and APK use the same web interface; the APK is required only for the native network discovery path.
