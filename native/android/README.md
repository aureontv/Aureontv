# Android native integration (initial transport layer)

This folder contains the first Android Capacitor plugin source for local DNS-SD
service discovery. It is **not yet a complete Android app or a working TV remote**.

## Included
- `ControlHubTVPlugin.kt`: bounded NSD discovery for common advertised service
  types associated with LG webOS, Samsung, Google Cast and Android TV.
- Discovery returns only services actually resolved on the local network.

## Not included / not claimed
- This does not discover every television. Many TVs do not advertise these
  service types, and NSD is not a universal SSDP scanner.
- Pairing and command sending deliberately return an explicit error. A service
  advertisement is not authentication and must never be presented as a paired TV.
- LG webOS, Samsung Tizen/SmartThings, and Android TV require separate,
  model-appropriate pairing, authorization, transport, and command adapters.
- The repository currently has no Capacitor Android project, Gradle wrapper,
  or installed Android build configuration. This source must be integrated,
  registered, built, installed on a real Android phone, and tested against the
  user's TV before the feature can be called functional.

## Integration requirements
1. Add Capacitor Android to the root app and generate the Android project.
2. Copy this class into the Android app module's source tree and register it
   with the Capacitor bridge (or convert it into a standalone Capacitor plugin).
3. Verify local-network permissions and service visibility on each supported
   Android version.
4. Implement and test each vendor adapter. Never mark a TV paired until its
   on-screen authorization has completed and the adapter has a valid session.
