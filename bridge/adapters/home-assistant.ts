/**
 * Home Assistant bridge adapter scaffold.
 * Run only inside the trusted home bridge. Keep the long-lived token in the OS
 * secret store; never pass it to the browser or log it.
 */
export type HAEntity = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
};

export class HomeAssistantAdapter {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly allowedEntities: Set<string>,
  ) {
    const parsed = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported Home Assistant URL");
    if (!token || token.length < 20) throw new Error("Missing Home Assistant token");
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    });
    if (!response.ok) throw new Error(`Home Assistant request failed: ${response.status}`);
    return response;
  }

  async listEntities(): Promise<HAEntity[]> {
    const response = await this.request("/api/states");
    const entities = await response.json() as HAEntity[];
    return entities.filter((item) => this.allowedEntities.has(item.entity_id));
  }

  async callService(domain: string, service: string, entityId: string, data: Record<string, unknown> = {}) {
    if (!this.allowedEntities.has(entityId)) throw new Error("Entity is not paired/allowlisted");
    const allowedServices: Record<string, string[]> = {
      homeassistant: ["turn_on", "turn_off", "toggle"],
      light: ["turn_on", "turn_off", "toggle"],
      switch: ["turn_on", "turn_off", "toggle"],
      media_player: ["turn_on", "turn_off", "toggle", "media_play_pause", "volume_set", "volume_mute", "select_source"],
      climate: ["turn_on", "turn_off", "set_temperature"],
    };
    if (!allowedServices[domain]?.includes(service)) throw new Error("Service is not allowed by this adapter");
    return this.request(`/api/services/${encodeURIComponent(domain)}/${encodeURIComponent(service)}`, {
      method: "POST",
      body: JSON.stringify({ ...data, entity_id: entityId }),
    });
  }
}
