# Universal compatibility strategy

Control Hub is designed to support many manufacturers and models through a common adapter interface. It cannot promise every device will work: manufacturers use different protocols, model generations, regions, firmware and authorization requirements.

## How compatibility is determined
A device is considered **available** only after the integration verifies:
1. Manufacturer and exact model (and firmware where relevant).
2. A documented or officially supported connection path.
3. User authorization and secure credential handling.
4. The actual capabilities exposed by that model.
5. A successful status check and safe test command.

## Connection paths
- Official cloud API: best for remote access when a manufacturer provides a supported API and account authorization.
- Local network API: requires a device reachable on the home LAN; remote access requires the paired bridge.
- Matter: requires a compatible Matter device and controller.
- Zigbee/Z-Wave: requires a compatible hub/coordinator and correct regional hardware.
- IR/RF: requires a compatible transmitter and device codes; usually limited to basic controls.
- Computer agent: requires a separately installed, user-authorized agent on the computer.

## Status meanings
- Planned: architecture/catalog entry only.
- Experimental: under development; not recommended for everyday control.
- Available: exact integration and tested model/capabilities verified.
- Unsupported: no safe, documented integration path currently available.

Brand names in the catalog indicate intended integration targets, not blanket support for all products made by that brand.
