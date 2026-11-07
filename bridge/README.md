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


## Home Assistant rollout status

Home Assistant is the primary integration path for Control Hub. The current web interface only presents setup guidance; it does not yet pair with a Home Assistant instance or execute hardware commands.

### Prerequisites
- A Home Assistant instance on an always-on device in the home network.
- Supported devices added and working in Home Assistant first.
- A dedicated bridge process, deployed separately from the static web frontend, to maintain an outbound authenticated connection to Control Hub.

### Security requirements before enabling pairing
- Never request or store a Home Assistant long-lived access token in browser localStorage or frontend code.
- Store credentials only in the bridge's OS secret store.
- Pair only explicitly selected entities; do not expose unrestricted Home Assistant service calls.
- Require authenticated account ownership, short-lived one-time pairing, revocation, rate limiting and audit records.
- Keep the bridge connection outbound-only; do not ask users to open router ports.

### Current implementation status
- [x] Home Assistant adapter scaffold with entity allowlisting and limited service names.
- [x] User-facing setup and prerequisite guidance.
- [ ] Bridge runtime, secure pairing and heartbeat transport.
- [ ] End-to-end command delivery and result reporting.
- [ ] Verification against real hardware.

Do not mark devices online or commands completed until a real bridge heartbeat and device response have been verified.
