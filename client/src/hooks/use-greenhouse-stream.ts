"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchSnapshot, fetchTelemetryHistory, getApiUrl, getWebSocketUrl } from "@/lib/api";
import { INITIAL_SNAPSHOT } from "@/lib/constants";
import {
  Actuator,
  Command,
  Node,
  SystemConfig,
  SystemEvent,
  SystemSnapshot,
  TelemetryPoint,
} from "@/types/greenhouse";

export type TransportType = "websocket" | "sse" | "offline";

export interface GreenhouseStreamState {
  snapshot: SystemSnapshot;
  telemetryHistory: Record<string, TelemetryPoint[]>;
  isConnected: boolean;
  isConnecting: boolean;
  transport: TransportType;
  lastHeartbeat: Date | null;
  error: string | null;
  refresh: () => Promise<void>;
  updateOptimisticNode: (nodeId: string, outputState: number) => void;
  updateOptimisticActuator: (actuatorId: string, coil: number) => void;
  updateOptimisticConfig: (newConfig: Partial<SystemConfig>) => void;
  sendWebSocketCommand: (cmd: Command) => boolean;
}

export function useGreenhouseStream(): GreenhouseStreamState {
  const [snapshot, setSnapshot] = useState<SystemSnapshot>(INITIAL_SNAPSHOT);
  const [telemetryHistory, setTelemetryHistory] = useState<
    Record<string, TelemetryPoint[]>
  >({
    bed_a: [],
    bed_b: [],
    climate: [],
    utility: [],
  });
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [transport, setTransport] = useState<TransportType>("offline");
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Load initial telemetry points for charts
  const loadInitialHistory = useCallback(async () => {
    try {
      const [histA, histB, histClimate, histUtility] = await Promise.allSettled(
        [
          fetchTelemetryHistory("bed_a", 30),
          fetchTelemetryHistory("bed_b", 30),
          fetchTelemetryHistory("climate", 30),
          fetchTelemetryHistory("utility", 30),
        ],
      );

      if (isMountedRef.current) {
        setTelemetryHistory({
          bed_a: histA.status === "fulfilled" ? histA.value : [],
          bed_b: histB.status === "fulfilled" ? histB.value : [],
          climate: histClimate.status === "fulfilled" ? histClimate.value : [],
          utility: histUtility.status === "fulfilled" ? histUtility.value : [],
        });
      }
    } catch {
      // Ignore initial history failure
    }
  }, []);

  // Refresh manually
  const refresh = useCallback(async () => {
    try {
      const data = await fetchSnapshot();
      if (isMountedRef.current) {
        setSnapshot(data);
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to refresh");
      }
    }
  }, []);

  // Optimistic UI updates
  const updateOptimisticNode = useCallback(
    (nodeId: string, outputState: number) => {
      setSnapshot((prev) => {
        const existing = prev.nodes[nodeId];
        if (!existing) return prev;
        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [nodeId]: {
              ...existing,
              output_state: outputState,
            },
          },
        };
      });
    },
    [],
  );

  const updateOptimisticActuator = useCallback(
    (actuatorId: string, coil: number) => {
      setSnapshot((prev) => {
        const existing = prev.actuators[actuatorId];
        if (!existing) return prev;
        return {
          ...prev,
          actuators: {
            ...prev.actuators,
            [actuatorId]: {
              ...existing,
              coil,
              running: coil,
            },
          },
        };
      });
    },
    [],
  );

  const updateOptimisticConfig = useCallback(
    (newConfig: Partial<SystemConfig>) => {
      setSnapshot((prev) => ({
        ...prev,
        config: {
          ...prev.config,
          ...newConfig,
        },
      }));
    },
    [],
  );

  // Send command instantly over WebSocket if connected
  const sendWebSocketCommand = useCallback((cmd: Command): boolean => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(
          JSON.stringify({
            type: "command",
            target_type: cmd.target_type,
            target_id: cmd.target_id,
            output: cmd.output,
            mode: cmd.mode,
          }),
        );
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  // Shared event dispatcher
  const handleEventData = useCallback((eventType: string, data: any) => {
    if (!isMountedRef.current || !data) return;

    switch (eventType) {
      case "init":
      case "snapshot":
        setSnapshot(data as SystemSnapshot);
        break;

      case "node": {
        const node = data as Node;
        setSnapshot((prev) => ({
          ...prev,
          nodes: {
            ...prev.nodes,
            [node.id]: node,
          },
        }));
        break;
      }

      case "actuator": {
        const actuator = data as Actuator;
        setSnapshot((prev) => ({
          ...prev,
          actuators: {
            ...prev.actuators,
            [actuator.id]: actuator,
          },
        }));
        break;
      }

      case "telemetry": {
        const point = data as TelemetryPoint;
        setTelemetryHistory((prev) => {
          const currentList = prev[point.node_id] || [];
          const updated = [...currentList, point].slice(-40);
          return {
            ...prev,
            [point.node_id]: updated,
          };
        });
        break;
      }

      case "event": {
        const event = data as SystemEvent;
        setSnapshot((prev) => {
          const currentEvents = prev.recent_events || [];
          return {
            ...prev,
            recent_events: [event, ...currentEvents].slice(0, 100),
          };
        });
        break;
      }

      case "config": {
        const cfg = data as SystemConfig;
        setSnapshot((prev) => ({
          ...prev,
          config: cfg,
        }));
        break;
      }
    }
    setLastHeartbeat(new Date());
  }, []);

  const handleEventDataRef = useRef(handleEventData);
  useEffect(() => {
    handleEventDataRef.current = handleEventData;
  });

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  const loadInitialHistoryRef = useRef(loadInitialHistory);
  useEffect(() => {
    loadInitialHistoryRef.current = loadInitialHistory;
  });

  // Unified Connection Manager: WebSocket First -> SSE Fallback
  useEffect(() => {
    isMountedRef.current = true;

    // Load initial snapshot and historical charts
    refreshRef.current();
    loadInitialHistoryRef.current();

    function connectSSE() {
      if (!isMountedRef.current) return;
      // Close any previous event source
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const streamUrl = getApiUrl("/api/stream");
      setIsConnecting(true);

      try {
        const es = new EventSource(streamUrl);
        eventSourceRef.current = es;

        es.onopen = () => {
          if (!isMountedRef.current) return;
          setIsConnected(true);
          setIsConnecting(false);
          setTransport("sse");
          setError(null);
          setLastHeartbeat(new Date());
        };

        es.onerror = () => {
          if (!isMountedRef.current) return;
          setIsConnected(false);
          setIsConnecting(false);
          setTransport("offline");
          es.close();

          // Attempt retry after 3 seconds (tries WebSocket again first)
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connect();
            }
          }, 3000);
        };

        const events = ["init", "node", "actuator", "telemetry", "event", "config"];
        events.forEach((evt) => {
          es.addEventListener(evt, (e: MessageEvent) => {
            try {
              const parsed = JSON.parse(e.data);
              handleEventDataRef.current(evt, parsed);
            } catch {
              // ignore parse error
            }
          });
        });
      } catch (err) {
        if (isMountedRef.current) {
          setIsConnected(false);
          setIsConnecting(false);
          setTransport("offline");
          setError(err instanceof Error ? err.message : "SSE Connection error");
        }
      }
    }

    function connectWebSocket() {
      if (!isMountedRef.current) return;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      const wsUrl = getWebSocketUrl("/api/ws");
      setIsConnecting(true);

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMountedRef.current) return;
          // Successfully upgraded to ultra-low latency WebSocket!
          setIsConnected(true);
          setIsConnecting(false);
          setTransport("websocket");
          setError(null);
          setLastHeartbeat(new Date());

          // Start ping heartbeat every 10s
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: "ping" }));
            }
          }, 10000);

          // Close fallback SSE if it was open
          if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
          }
        };

        ws.onmessage = (e: MessageEvent) => {
          if (!isMountedRef.current) return;
          try {
            const msg = JSON.parse(e.data);
            const eventType = msg.event || msg.type;
            if (eventType && eventType !== "pong" && msg.data) {
              handleEventDataRef.current(eventType, msg.data);
            } else if (msg.type === "pong") {
              setLastHeartbeat(new Date());
            }
          } catch {
            // ignore parse error
          }
        };

        ws.onerror = () => {
          // Error will trigger onclose automatically, avoiding duplicate connectSSE calls
        };

        ws.onclose = () => {
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          if (!isMountedRef.current) return;

          setIsConnected(false);
          setTransport("offline");

          // Clean fallback to SSE with 1s debounce to prevent flapping loops
          if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connectSSE();
            }
          }, 1000);
        };
      } catch {
        // Fall back to SSE on exception
        connectSSE();
      }
    }

    function connect() {
      // Prefer WebSocket, fall back to SSE
      connectWebSocket();
    }

    connect();

    return () => {
      isMountedRef.current = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
      }
    };
  }, []);

  return {
    snapshot,
    telemetryHistory,
    isConnected,
    isConnecting,
    transport,
    lastHeartbeat,
    error,
    refresh,
    updateOptimisticNode,
    updateOptimisticActuator,
    updateOptimisticConfig,
    sendWebSocketCommand,
  };
}
