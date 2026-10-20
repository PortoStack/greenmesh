"use client";

import React from "react";
import {
  RiCheckFill,
  RiCloseFill,
  RiCpuLine,
  RiRouterLine,
  RiSignalTowerLine,
} from "@remixicon/react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Actuator, Node } from "@/types/greenhouse";

interface NetworkTopologyBarProps {
  nodes: Record<string, Node>;
  actuators: Record<string, Actuator>;
  onSelectDevice?: (deviceId: string, type: "node" | "actuator") => void;
}

export function NetworkTopologyBar({
  nodes,
  actuators,
  onSelectDevice,
}: NetworkTopologyBarProps) {
  const nodeList = [
    {
      id: "bed_a",
      label: "ESP32 #1: แปลง A",
      role: "ความชื้น A + วาล์ว A",
      protocol: "ESP-NOW",
      node: nodes.bed_a,
      isNode: true,
    },
    {
      id: "bed_b",
      label: "ESP32 #2: แปลง B",
      role: "ความชื้น B + วาล์ว B",
      protocol: "ESP-NOW",
      node: nodes.bed_b,
      isNode: true,
    },
    {
      id: "climate",
      label: "ESP32 #3: สภาพอากาศ",
      role: "อุณหภูมิ + ปุ่มพัดลม",
      protocol: "ESP-NOW",
      node: nodes.climate,
      isNode: true,
    },
    {
      id: "utility",
      label: "ESP32 #4: Bridge/Utility",
      role: "แสง + น้ำต่ำ + MQTT",
      protocol: "MQTT Bridge",
      node: nodes.utility,
      isNode: true,
    },
    {
      id: "pump",
      label: "Slave 1: ปั๊มน้ำ",
      role: "RS485 Modbus RTU",
      protocol: "RS485",
      actuator: actuators.pump,
      isNode: false,
    },
    {
      id: "fan",
      label: "Slave 2: พัดลม",
      role: "RS485 Modbus RTU",
      protocol: "RS485",
      actuator: actuators.fan,
      isNode: false,
    },
    {
      id: "light",
      label: "Slave 3: ไฟปลูกพืช",
      role: "RS485 Modbus RTU",
      protocol: "RS485",
      actuator: actuators.light,
      isNode: false,
    },
  ];

  function formatTime(isoStr?: string) {
    if (!isoStr) return "--:--:--";
    const d = new Date(isoStr);
    return isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString("th-TH");
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <RiSignalTowerLine className="size-4 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hardware Network Topology & Node Heartbeat
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground">
          4 ESP32 (ESP-NOW/MQTT) + 3 Modbus RTU Slaves
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {nodeList.map((item) => {
          const isOnline = item.isNode
            ? (item.node?.online ?? false)
            : item.actuator != null;
          const lastSeen = item.isNode
            ? item.node?.last_seen
            : item.actuator?.last_updated;
          const seq = item.isNode ? item.node?.seq : null;
          const outputState = item.isNode
            ? item.node?.output_state === 1
            : item.actuator?.running === 1;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger>
                <Card
                  onClick={() =>
                    onSelectDevice?.(item.id, item.isNode ? "node" : "actuator")
                  }
                  className={`group relative flex flex-col justify-between p-2.5 transition-all cursor-pointer hover:border-primary/50 hover:shadow-md ${
                    isOnline
                      ? "bg-card border-border/80"
                      : "bg-muted/10 border-destructive/30 opacity-75"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                      {isOnline ? (
                        <span className="relative flex size-2">
                          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                        </span>
                      ) : (
                        <span className="size-2 rounded-full bg-destructive" />
                      )}
                      <span className="truncate">{item.label}</span>
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1 py-0 ${
                        item.protocol === "MQTT Bridge"
                          ? "border-primary/40 text-primary bg-primary/10"
                          : item.protocol === "ESP-NOW"
                            ? "border-cyan-500/40 text-cyan-400 bg-cyan-500/10"
                            : "border-amber-500/40 text-amber-400 bg-amber-500/10"
                      }`}
                    >
                      {item.protocol}
                    </Badge>
                  </div>

                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="truncate">{item.role}</span>
                    {outputState ? (
                      <span className="inline-flex items-center gap-0.5 font-medium text-emerald-400">
                        <RiCheckFill className="size-3" /> ON
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-muted-foreground/60">
                        <RiCloseFill className="size-3" /> OFF
                      </span>
                    )}
                  </div>

                  <div className="mt-1 border-t border-border/40 pt-1 flex items-center justify-between text-[10px] text-muted-foreground/80 tabular-nums">
                    <span>{formatTime(lastSeen)}</span>
                    {seq != null && <span>#{seq}</span>}
                  </div>
                </Card>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1 text-xs">
                  <p className="font-semibold text-foreground">{item.label}</p>
                  <p>โปรโตคอล: {item.protocol}</p>
                  <p>
                    สถานะ:{" "}
                    {isOnline
                      ? "Online (เชื่อมต่อปกติ)"
                      : "Offline (ขาดการเชื่อมต่อ)"}
                  </p>
                  <p>อัปเดตล่าสุด: {formatTime(lastSeen)}</p>
                  {seq != null && <p>Sequence Number: #{seq}</p>}
                  <p className="text-[10px] text-primary pt-1">
                    คลิกเพื่อดูรายละเอียดเชิงลึก
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
