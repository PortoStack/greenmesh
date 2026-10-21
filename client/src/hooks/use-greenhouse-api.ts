"use client";

import { useCallback, useState } from "react";

import { sendCommand, updateSystemConfig } from "@/lib/api";
import { Command, CommandResponse, SystemConfig } from "@/types/greenhouse";

export interface UseGreenhouseApiProps {
  onOptimisticNode?: (nodeId: string, output: number) => void;
  onOptimisticActuator?: (actuatorId: string, coil: number) => void;
  onOptimisticConfig?: (config: Partial<SystemConfig>) => void;
  onRefresh?: () => Promise<void>;
  sendWebSocketCommand?: (cmd: Command) => boolean;
}

export function useGreenhouseApi({
  onOptimisticNode,
  onOptimisticActuator,
  onOptimisticConfig,
  onRefresh,
  sendWebSocketCommand,
}: UseGreenhouseApiProps = {}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastResponse, setLastResponse] = useState<CommandResponse | null>(
    null,
  );
  const [apiError, setApiError] = useState<string | null>(null);

  const toggleNodeOutput = useCallback(
    async (nodeId: string, currentOutput: number) => {
      const nextOutput = currentOutput === 1 ? 0 : 1;
      onOptimisticNode?.(nodeId, nextOutput);
      setIsSubmitting(true);
      setApiError(null);

      try {
        const cmd: Command = {
          target_type: "node",
          target_id: nodeId,
          output: nextOutput,
          source: "web_dashboard",
        };

        // Ultra-low latency path: send over open WebSocket if available
        if (sendWebSocketCommand && sendWebSocketCommand(cmd)) {
          const fastResp: CommandResponse = {
            success: true,
            message: `Sent command to ${nodeId} via WebSocket`,
            command_id: Date.now(),
            timestamp: new Date().toISOString(),
          };
          setLastResponse(fastResp);
          return fastResp;
        }

        // Fallback path: HTTP REST API
        const res = await sendCommand(cmd);
        setLastResponse(res);
        return res;
      } catch (err) {
        // Rollback optimistic update on failure
        onOptimisticNode?.(nodeId, currentOutput);
        const msg =
          err instanceof Error ? err.message : "Failed to toggle node";
        setApiError(msg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [onOptimisticNode, sendWebSocketCommand],
  );

  const toggleActuatorCoil = useCallback(
    async (actuatorId: string, currentCoil: number) => {
      const nextCoil = currentCoil === 1 ? 0 : 1;
      onOptimisticActuator?.(actuatorId, nextCoil);
      setIsSubmitting(true);
      setApiError(null);

      try {
        const cmd: Command = {
          target_type: "actuator",
          target_id: actuatorId,
          output: nextCoil,
          source: "web_dashboard",
        };

        // Ultra-low latency path: send over open WebSocket if available
        if (sendWebSocketCommand && sendWebSocketCommand(cmd)) {
          const fastResp: CommandResponse = {
            success: true,
            message: `Sent command to ${actuatorId} via WebSocket`,
            command_id: Date.now(),
            timestamp: new Date().toISOString(),
          };
          setLastResponse(fastResp);
          return fastResp;
        }

        // Fallback path: HTTP REST API
        const res = await sendCommand(cmd);
        setLastResponse(res);
        return res;
      } catch (err) {
        // Rollback optimistic update
        onOptimisticActuator?.(actuatorId, currentCoil);
        const msg =
          err instanceof Error ? err.message : "Failed to toggle actuator";
        setApiError(msg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [onOptimisticActuator, sendWebSocketCommand],
  );

  const setSystemMode = useCallback(
    async (autoMode: boolean) => {
      onOptimisticConfig?.({ auto_mode: autoMode });
      setIsSubmitting(true);
      setApiError(null);

      try {
        const res = await updateSystemConfig({ auto_mode: autoMode });
        if (res?.config) {
          onOptimisticConfig?.(res.config);
        }
        return res;
      } catch (err) {
        onOptimisticConfig?.({ auto_mode: !autoMode });
        const msg =
          err instanceof Error ? err.message : "Failed to change system mode";
        setApiError(msg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [onOptimisticConfig],
  );

  const saveThresholds = useCallback(
    async (thresholds: Partial<SystemConfig>) => {
      onOptimisticConfig?.(thresholds);
      setIsSubmitting(true);
      setApiError(null);

      try {
        const res = await updateSystemConfig(thresholds);
        if (res?.config) {
          onOptimisticConfig?.(res.config);
        }
        return res;
      } catch (err) {
        onRefresh?.();
        const msg =
          err instanceof Error ? err.message : "Failed to save thresholds";
        setApiError(msg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [onOptimisticConfig, onRefresh],
  );

  const triggerEmergencyStop = useCallback(async () => {
    setIsSubmitting(true);
    setApiError(null);

    // Turn off pump and valves immediately
    onOptimisticActuator?.("pump", 0);
    onOptimisticNode?.("bed_a", 0);
    onOptimisticNode?.("bed_b", 0);

    const cmds: Command[] = [
      {
        target_type: "actuator",
        target_id: "pump",
        output: 0,
        source: "emergency_stop",
      },
      {
        target_type: "node",
        target_id: "bed_a",
        output: 0,
        source: "emergency_stop",
      },
      {
        target_type: "node",
        target_id: "bed_b",
        output: 0,
        source: "emergency_stop",
      },
    ];

    try {
      if (sendWebSocketCommand) {
        for (const cmd of cmds) {
          sendWebSocketCommand(cmd);
        }
      } else {
        await Promise.allSettled(cmds.map((cmd) => sendCommand(cmd)));
      }
      await onRefresh?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Emergency command failed";
      setApiError(msg);
    } finally {
      setIsSubmitting(false);
    }
  }, [onOptimisticActuator, onOptimisticNode, onRefresh, sendWebSocketCommand]);

  const toggleWaterLow = useCallback(
    async (currentLow: boolean) => {
      const nextLow = !currentLow;
      setIsSubmitting(true);
      setApiError(null);

      try {
        const cmd: Command = {
          target_type: "node",
          target_id: "water_low",
          output: nextLow ? 1 : 0,
          source: "web_dashboard",
        };

        if (sendWebSocketCommand && sendWebSocketCommand(cmd)) {
          const fastResp: CommandResponse = {
            success: true,
            message: `Toggled water_low to ${nextLow}`,
            command_id: Date.now(),
            timestamp: new Date().toISOString(),
          };
          setLastResponse(fastResp);
          return fastResp;
        }

        const res = await sendCommand(cmd);
        setLastResponse(res);
        return res;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to toggle water level";
        setApiError(msg);
        throw err;
      } finally {
        setIsSubmitting(false);
      }
    },
    [sendWebSocketCommand],
  );

  return {
    isSubmitting,
    lastResponse,
    apiError,
    toggleNodeOutput,
    toggleActuatorCoil,
    setSystemMode,
    saveThresholds,
    triggerEmergencyStop,
    toggleWaterLow,
  };
}
