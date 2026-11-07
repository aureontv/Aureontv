/**
 * Control Hub provider adapter contract.
 * Each adapter must implement only capabilities actually supported by its device.
 * Keep manufacturer credentials on a trusted server/bridge, never in browser code.
 */
export type Capability =
  | "power" | "volume" | "mute" | "input" | "brightness"
  | "temperature" | "playback" | "channel" | "position";

export type DeviceDescriptor = {
  id: string;
  manufacturer: string;
  model: string;
  category: string;
  protocol: string;
  firmware?: string;
};

export type DiscoveryResult = {
  descriptor: DeviceDescriptor;
  capabilities: Capability[];
  support: "verified" | "partial" | "unknown";
  limitations: string[];
};

export type DeviceCommand =
  | { type: "power_on" | "power_off" | "mute" | "play_pause" | "next" | "previous" }
  | { type: "volume_set"; value: number }
  | { type: "brightness_set"; value: number }
  | { type: "temperature_set"; value: number }
  | { type: "input_select"; input: string };

export interface ProviderAdapter {
  readonly id: string;
  readonly displayName: string;
  discover(): Promise<DiscoveryResult[]>;
  getCapabilities(device: DeviceDescriptor): Promise<Capability[]>;
  execute(device: DeviceDescriptor, command: DeviceCommand): Promise<{ accepted: boolean; providerCommandId?: string }>;
  getStatus(device: DeviceDescriptor): Promise<{ online: boolean; checkedAt: string }>;
}
