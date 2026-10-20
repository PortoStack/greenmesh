"use client";

import React from "react";
import {
  RiCpuLine,
  RiRouterLine,
  RiCloseLine,
  RiCheckFill,
  RiAlertFill,
  RiFlashlightLine,
  RiCheckboxCircleFill,
  RiCloseCircleLine,
} from "@remixicon/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Actuator, Node } from "@/types/greenhouse";

interface DeviceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId: string | null;
  deviceType: "node" | "actuator" | null;
  node?: Node;
  actuator?: Actuator;
  isWaterLow: boolean;
  isSubmitting: boolean;
  onToggleNodeOutput?: (nodeId: string, currentOutput: number) => Promise<unknown>;
  onToggleActuator?: (actuatorId: string, currentCoil: number) => Promise<unknown>;
}

export function DeviceDetailModal({
  isOpen,
  onClose,
  deviceId,
  deviceType,
  node,
  actuator,
  isWaterLow,
  isSubmitting,
  onToggleNodeOutput,
  onToggleActuator,
}: DeviceDetailModalProps) {
  if (!isOpen || !deviceId) return null;

  const isNode = deviceType === "node" && node != null;
  const isActuator = deviceType === "actuator" && actuator != null;

  const title = isNode
    ? node.name
    : isActuator
      ? actuator.name
      : deviceId;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md border-border/80 bg-card text-card-foreground">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
              {isNode ? <RiCpuLine className="size-5" /> : <RiRouterLine className="size-5" />}
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
              <DialogDescription className="text-xs">
                {isNode ? node.description : `RS485 Modbus RTU Slave #${actuator?.slave_id}`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2 text-xs">
          {/* Hardware Connection Specs */}
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div>
              <span className="text-muted-foreground block text-[11px]">Hardware ID:</span>
              <span className="font-semibold text-foreground">{deviceId}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[11px]">Protocol:</span>
              <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                {isNode ? "ESP-NOW / MQTT" : "RS485 Modbus RTU"}
              </Badge>
            </div>
            {isNode && (
              <>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Packet Sequence:</span>
                  <span className="font-mono text-foreground font-medium">#{node.seq}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Online Status:</span>
                  <Badge variant={node.online ? "outline" : "destructive"} className="text-[10px]">
                    {node.online ? "Online (Healthy)" : "Offline"}
                  </Badge>
                </div>
              </>
            )}
            {isActuator && (
              <>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Modbus Slave ID:</span>
                  <span className="font-mono text-foreground font-medium">ID {actuator.slave_id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[11px]">Modbus Mode:</span>
                  <span className="font-medium text-foreground">{actuator.mode === 1 ? "Auto" : "Manual"}</span>
                </div>
              </>
            )}
          </div>

          {/* Sensor Values if Node */}
          {isNode && (
            <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Analog Input ({node.analog_label}):</span>
                <span className="text-sm font-bold text-primary tabular-nums">
                  {node.analog_value.toFixed(1)} {node.analog_unit}
                </span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Digital Input ({node.digital_label}):</span>
                <span className="font-medium text-foreground">
                  {node.digital_value === 1 ? (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px]">
                      HIGH (1)
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      LOW (0)
                    </Badge>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Control Output & Interlock Status */}
          <div className="rounded-xl border border-border/60 bg-card p-3 flex items-center justify-between">
            <div>
              <span className="font-medium text-foreground block">
                {isNode ? `Output Control (${node.output_label})` : `Coil 0 (${actuator?.name ?? ""})`}
              </span>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                {(isNode ? node.output_state === 1 : (actuator?.running ?? 0) === 1) ? (
                  <>
                    <RiCheckboxCircleFill className="size-3.5 text-emerald-500 inline-block shrink-0" />
                    <span>อุปกรณ์กำลังทำงาน (Active)</span>
                  </>
                ) : (
                  <>
                    <RiCloseCircleLine className="size-3.5 text-muted-foreground inline-block shrink-0" />
                    <span>อุปกรณ์หยุดทำงาน (Inactive)</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={isNode ? node.output_state === 1 : actuator?.running === 1}
                disabled={
                  isSubmitting ||
                  (isWaterLow &&
                    (deviceId === "pump" || deviceId === "bed_a" || deviceId === "bed_b"))
                }
                onCheckedChange={() => {
                  if (isNode && onToggleNodeOutput) {
                    onToggleNodeOutput(node.id, node.output_state);
                  } else if (isActuator && onToggleActuator) {
                    onToggleActuator(actuator.id, actuator.coil);
                  }
                }}
              />
            </div>
          </div>

          {/* Emergency Safety Notice */}
          {isWaterLow && (deviceId === "pump" || deviceId === "bed_a" || deviceId === "bed_b") && (
            <div className="flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
              <RiAlertFill className="size-4 shrink-0" />
              <span>
                ความปลอดภัย: น้ำในถังต่ำ ไม่อนุญาตให้เปิดปั๊มหรือวาล์วจนกว่าระดับน้ำจะกลับสู่ปกติ
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} className="w-full sm:w-auto">
            ปิดหน้าต่าง
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
