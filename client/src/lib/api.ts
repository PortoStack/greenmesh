import {
  Command,
  CommandResponse,
  SystemConfig,
  SystemEvent,
  SystemSnapshot,
  TelemetryPoint,
} from "@/types/greenhouse";

export function getBaseApiUrl(): string {
  if (typeof window !== "undefined") {
    // If NEXT_PUBLIC_API_URL is configured, prefer it, otherwise use current origin or localhost:1880
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL;
    }
    // Direct connection to Node-RED on port 1880
    return `${window.location.protocol}//${window.location.hostname}:1880`;
  }
  return process.env.NEXT_PUBLIC_API_URL || "http://localhost:1880";
}

export function getApiUrl(endpoint: string): string {
  const base = getBaseApiUrl();
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}

export function getWebSocketUrl(endpoint = "/api/ws"): string {
  if (typeof window !== "undefined") {
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    if (process.env.NEXT_PUBLIC_WS_URL) {
      return `${process.env.NEXT_PUBLIC_WS_URL}${cleanEndpoint}`;
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.hostname}:1880${cleanEndpoint}`;
  }
  return "ws://localhost:1880/api/ws";
}

export async function fetchSnapshot(): Promise<SystemSnapshot> {
  const res = await fetch(getApiUrl("/api/status"), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch status: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchTelemetryHistory(
  nodeId?: string,
  limit = 40,
): Promise<TelemetryPoint[]> {
  const params = new URLSearchParams();
  if (nodeId) params.append("node_id", nodeId);
  params.append("limit", limit.toString());

  const res = await fetch(getApiUrl(`/api/telemetry/history?${params.toString()}`), {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch telemetry history: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchEvents(limit = 50): Promise<SystemEvent[]> {
  const res = await fetch(getApiUrl(`/api/events?limit=${limit}`), {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch events: ${res.statusText}`);
  }
  return res.json();
}

export async function sendCommand(cmd: Command): Promise<CommandResponse> {
  const res = await fetch(getApiUrl("/api/commands"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Command failed: ${errorText || res.statusText}`);
  }
  return res.json();
}

export async function updateSystemConfig(
  config: Partial<SystemConfig>,
): Promise<{ success: boolean; config: SystemConfig }> {
  const res = await fetch(getApiUrl("/api/config"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Update config failed: ${errorText || res.statusText}`);
  }
  return res.json();
}
