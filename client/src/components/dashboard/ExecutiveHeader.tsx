"use client";

import React from "react";
import {
  RiAlarmWarningLine,
  RiAlertFill,
  RiEqualizerLine,
  RiFileList3Line,
  RiLineChartLine,
  RiPlantLine,
  RiRefreshLine,
  RiWifiLine,
  RiWifiOffLine,
} from "@remixicon/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SystemConfig, SystemSnapshot } from "@/types/greenhouse";

interface ExecutiveHeaderProps {
  snapshot: SystemSnapshot;
  isConnected: boolean;
  isConnecting: boolean;
  isSubmitting: boolean;
  transport?: "websocket" | "sse" | "offline";
  onToggleMode: (autoMode: boolean) => Promise<unknown>;
  onEmergencyStop: () => Promise<void>;
  onRefresh: () => Promise<void>;
  onOpenDrawerTab?: (tab: "controls" | "charts" | "events") => void;
  onToggleWaterLow?: (currentLow: boolean) => Promise<unknown>;
}

export function ExecutiveHeader({
  snapshot,
  isConnected,
  isConnecting,
  isSubmitting,
  transport = "sse",
  onToggleMode,
  onEmergencyStop,
  onRefresh,
  onOpenDrawerTab,
  onToggleWaterLow,
}: ExecutiveHeaderProps) {
  const isAutoMode = snapshot.config?.auto_mode ?? true;
  const isWaterLow = snapshot.water_low;

  // Calculate online hardware count
  const espNodes = Object.values(snapshot.nodes || {});
  const onlineEspCount = espNodes.filter((n) => n.online).length;
  const totalEspCount = espNodes.length || 4;

  const actuators = Object.values(snapshot.actuators || {});
  const activeActuatorsCount = actuators.filter((a) => a.running === 1).length;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Brand & Project Identity */}
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <RiPlantLine className="size-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-lg font-bold tracking-tight text-foreground sm:text-xl">
                GreenMesh
              </h1>
              <Badge
                variant="outline"
                className="border-primary/30 text-primary text-[10px] tracking-wider uppercase"
              >
                IoT SCADA
              </Badge>
              {isWaterLow && (
                <Button
                  variant="destructive"
                  size="xs"
                  onClick={() =>
                    onToggleWaterLow
                      ? onToggleWaterLow(true)
                      : onOpenDrawerTab?.("controls")
                  }
                  className="animate-pulse gap-1 text-[11px] h-6 px-2 shadow-sm font-semibold hover:bg-destructive/80 cursor-pointer"
                  title="คลิกเพื่อปลดล็อกสถานะน้ำต่ำ (Reset Water Low)"
                >
                  <RiAlertFill className="size-3" />
                  WATER LOW (คลิกปลดล็อก)
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground hidden sm:block">
              ระบบดูแลแปลงผักและโรงเรือนอัจฉริยะ (ESP-NOW + MQTT + Modbus RTU)
            </p>
          </div>
        </div>

        {/* Live System Status & Action Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          {/* Connection Status Badge */}
          <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs">
            {isConnected ? (
              <>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-emerald-400 font-medium flex items-center gap-1">
                  <RiWifiLine className="size-3.5" />{" "}
                  {transport === "websocket" ? "LIVE WS" : "LIVE SSE"}
                </span>
              </>
            ) : isConnecting ? (
              <>
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-amber-400 font-medium">
                  CONNECTING...
                </span>
              </>
            ) : (
              <>
                <span className="size-2 rounded-full bg-destructive" />
                <span className="text-destructive font-medium flex items-center gap-1">
                  <RiWifiOffLine className="size-3.5" /> OFFLINE
                </span>
              </>
            )}
            <span className="text-border">|</span>
            <span className="text-muted-foreground text-[11px] tabular-nums">
              ESP32 {onlineEspCount}/{totalEspCount} Online
            </span>
          </div>

          {/* Master Auto / Manual Toggle Switch */}
          <div className="flex items-center gap-2 rounded-xl border border-border/80 bg-card px-3 py-1.5 shadow-xs">
            <span className="text-xs font-medium text-muted-foreground">
              Mode:
            </span>
            <span
              className={`text-xs font-semibold ${
                isAutoMode ? "text-primary" : "text-amber-400"
              }`}
            >
              {isAutoMode ? "AUTO" : "MANUAL"}
            </span>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Switch
                    checked={isAutoMode}
                    onCheckedChange={(checked) => onToggleMode(checked)}
                    disabled={isSubmitting}
                    size="sm"
                    aria-label="Toggle system automation mode"
                  />
                }
              />
              <TooltipContent>
                {isAutoMode
                  ? "ระบบทำงานอัตโนมัติตามกฎและค่าเกณฑ์ (ข้อ 8)"
                  : "โหมดควบคุมด้วยตนเอง (Manual Override)"}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Quick Drawer Shortcuts */}
          {onOpenDrawerTab && (
            <div className="hidden md:flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/60">
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onOpenDrawerTab("controls")}
                className="text-xs h-7 px-2.5 font-medium hover:text-foreground gap-1.5"
              >
                <RiEqualizerLine className="size-3.5 text-primary" />
                <span>ควบคุม</span>
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onOpenDrawerTab("charts")}
                className="text-xs h-7 px-2.5 font-medium hover:text-foreground gap-1.5"
              >
                <RiLineChartLine className="size-3.5 text-sky-500" />
                <span>กราฟ</span>
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => onOpenDrawerTab("events")}
                className="text-xs h-7 px-2.5 font-medium hover:text-foreground gap-1.5"
              >
                <RiFileList3Line className="size-3.5 text-amber-500" />
                <span>เหตุการณ์</span>
              </Button>
            </div>
          )}

          {/* Emergency Stop Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={onEmergencyStop}
                  disabled={isSubmitting}
                  className="gap-1.5 font-semibold shadow-sm transition-all hover:brightness-110 active:scale-95"
                >
                  <RiAlertFill className="size-4" />
                  <span>EMERGENCY STOP</span>
                </Button>
              }
            />
            <TooltipContent>
              ตัดการทำงานของปั๊มน้ำ (Modbus Slave 1) และปิดวาล์ว A/B
              ทันทีเพื่อความปลอดภัย
            </TooltipContent>
          </Tooltip>

          {/* Manual Refresh Button */}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={onRefresh}
                  disabled={isSubmitting}
                  aria-label="Refresh data"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <RiRefreshLine
                    className={`size-4 ${isSubmitting ? "animate-spin text-primary" : ""}`}
                  />
                </Button>
              }
            />
            <TooltipContent>รีเฟรชข้อมูลล่าสุดจากเซิร์ฟเวอร์</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}
