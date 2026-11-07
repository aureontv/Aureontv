# Control Hub Local Bridge

The bridge is the optional always-on component inside the home network. It is needed for devices that expose only local protocols or cannot be reached directly from the cloud.

## Required behavior
- Pair to a Control Hub account using a one-time, short-lived pairing code.
- Establish outbound TLS connections to the cloud; do not expose an inbound router port.
- Maintain an allowlist of explicitly paired devices.
- Discover only supported protocols and report model, firmware, capabilities and limitations.
- Execute only typed, allowlisted commands after verifying account ownership and device pairing.
- Send heartbeats and command results; never report a device online based only on a saved record.
- Store vendor tokens in the operating system secret store; never in browser storage or logs.
- Support revocation, update signing, replay protection and rate limits.

## Suggested implementation stages
1. Home Assistant integration/provider adapter for supported local devices.
2. Matter controller integration for Matter-certified devices.
3. Zigbee/Z-Wave adapters through a compatible coordinator.
4. Vendor-specific local/cloud adapters after reviewing each vendor's official API and terms.

## Network model
The bridge initiates an outbound authenticated connection to the cloud. The cloud never gets arbitrary access to the home LAN. Pairing must be confirmed by the user on both sides.

## Important
A bridge cannot make an unsupported appliance controllable. Infrared/RF control additionally needs compatible transmitter hardware and the correct device codes. Safety-critical appliances must not be operated automatically without manufacturer-supported safeguards.
