export type TvCommand =
  | "power" | "mute" | "home" | "back" | "menu"
  | "up" | "down" | "left" | "right" | "select"
  | "volume_up" | "volume_down" | "play_pause";

export interface TvDeviceCandidate {
  id: string;
  name?: string;
  manufacturer?: string;
  model?: string;
  platform?: string;
  protocol?: string;
  address?: string;
}

export interface TvDiscoveryResult { devices: TvDeviceCandidate[] }
export interface TvPairResult {
  paired: boolean;
  connectionId?: string;
  capabilities?: TvCommand[];
}
export interface TvCommandResult { accepted: boolean }

export interface ControlHubTVPlugin {
  discover(): Promise<TvDiscoveryResult>;
  pair(options: { deviceId: string }): Promise<TvPairResult>;
  sendCommand(options: { connectionId: string; command: TvCommand }): Promise<TvCommandResult>;
  unpair(options: { connectionId: string }): Promise<void>;
}

declare global {
  interface Window { ControlHubTV?: ControlHubTVPlugin }
}
