"use client";

import React, { useEffect, useState } from "react";
import {
  RiCollapseDiagonalLine,
  RiEqualizerLine,
  RiExpandDiagonalLine,
  RiFileList3Line,
  RiLineChartLine,
} from "@remixicon/react";

import { BedStationCard } from "@/components/dashboard/StationCards/BedStationCard";
import { ClimateStationCard } from "@/components/dashboard/StationCards/ClimateStationCard";
import { UtilityStationCard } from "@/components/dashboard/StationCards/UtilityStationCard";
import { SystemEventLog } from "@/components/dashboard/SystemEventLog";
import { TelemetryCharts } from "@/components/dashboard/TelemetryCharts";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  SystemConfig,
  SystemSnapshot,
  TelemetryPoint,
} from "@/types/greenhouse";

export type DrawerTab = "controls" | "charts" | "events";

interface DashboardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: DrawerTab;
  onTabChange: (tab: DrawerTab) => void;
  scrollTargetId?: string | null;
  snapshot: SystemSnapshot;
  telemetryHistory: Record<string, TelemetryPoint[]>;
  isSubmitting: boolean;
  onToggleNodeOutput: (
    nodeId: string,
    currentOutput: number,
  ) => Promise<unknown>;
  onToggleActuatorCoil: (
    actuatorId: string,
    currentCoil: number,
  ) => Promise<unknown>;
  onSaveThresholds: (thresholds: Partial<SystemConfig>) => Promise<unknown>;
  onToggleWaterLow?: (currentLow: boolean) => Promise<unknown>;
}

export function DashboardDrawer({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  scrollTargetId,
  snapshot,
  telemetryHistory,
  isSubmitting,
  onToggleNodeOutput,
  onToggleActuatorCoil,
  onSaveThresholds,
  onToggleWaterLow,
}: DashboardDrawerProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Auto-scroll and highlight target station or actuator when opened via 3D click
  useEffect(() => {
    if (!isOpen || !scrollTargetId) return;

    // Small delay to allow drawer slide-in animation to mount and layout DOM
    const timer = setTimeout(() => {
      // Find element: check specific actuator switch first, then fallback to station card
      const targetEl =
        document.getElementById(`actuator-${scrollTargetId}`) ||
        document.getElementById(`station-${scrollTargetId}`);

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });

        // Add prominent pulsing accent ring highlight for 2.5 seconds
        targetEl.classList.add(
          "ring-2",
          "ring-primary",
          "ring-offset-2",
          "ring-offset-background",
          "animate-pulse"
        );

        const highlightTimer = setTimeout(() => {
          targetEl.classList.remove(
            "ring-2",
            "ring-primary",
            "ring-offset-2",
            "ring-offset-background",
            "animate-pulse"
          );
        }, 2500);

        return () => clearTimeout(highlightTimer);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [isOpen, scrollTargetId, activeTab]);

  // Dynamic width: when charts tab is selected or when manually expanded
  const widthStyle: React.CSSProperties = isExpanded
    ? { width: "100vw", maxWidth: "100vw" }
    : activeTab === "charts"
      ? { width: "min(1240px, 94vw)", maxWidth: "94vw" }
      : { width: "min(520px, 92vw)", maxWidth: "92vw" };

  const widthClass = isExpanded
    ? "!w-screen !max-w-none"
    : activeTab === "charts"
      ? "!w-full sm:!w-[760px] md:!w-[920px] lg:!w-[1100px] xl:!w-[1240px] !max-w-[94vw]"
      : "!w-full sm:!w-[460px] md:!w-[520px] !max-w-[92vw]";

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        style={widthStyle}
        className={`${widthClass} bg-background/95 backdrop-blur-xl border-l border-border/80 p-0 flex flex-col h-full shadow-2xl z-50 overflow-hidden transition-all duration-300`}
      >
        <SheetHeader className="px-6 pt-5 pb-3 border-b border-border/40 shrink-0">
          <div className="flex items-center justify-between pr-8">
            <div>
              <SheetTitle className="text-base font-bold text-foreground">
                GreenMesh SCADA Operations Console
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground mt-0.5">
                แผงควบคุมสถานี กราฟวิเคราะห์แนวโน้ม และประวัติเหตุการณ์
              </SheetDescription>
            </div>

            {/* Expand / Minimize Drawer Toggle Button */}
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => setIsExpanded((prev) => !prev)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={isExpanded ? "Collapse Drawer" : "Expand Drawer"}
                  >
                    {isExpanded ? (
                      <RiCollapseDiagonalLine className="size-4" />
                    ) : (
                      <RiExpandDiagonalLine className="size-4" />
                    )}
                  </Button>
                }
              />
              <TooltipContent>
                {isExpanded
                  ? "ย่อขนาดแผง Drawer"
                  : "ขยายแผง Drawer ให้กว้างขึ้น"}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Top Switcher Tabs with Pure Remix Icons */}
          <div className="pt-2">
            <Tabs
              value={activeTab}
              onValueChange={(val) => onTabChange(val as DrawerTab)}
            >
              <TabsList
                variant="default"
                className="grid grid-cols-3 w-full bg-muted/60 p-1"
              >
                <TabsTrigger
                  value="controls"
                  className="text-xs py-1.5 font-medium gap-1.5"
                >
                  <RiEqualizerLine className="size-3.5 text-primary" />
                  <span>สถานี & ควบคุม</span>
                </TabsTrigger>
                <TabsTrigger
                  value="charts"
                  className="text-xs py-1.5 font-medium gap-1.5"
                >
                  <RiLineChartLine className="size-3.5 text-sky-500" />
                  <span>กราฟวิเคราะห์</span>
                </TabsTrigger>
                <TabsTrigger
                  value="events"
                  className="text-xs py-1.5 font-medium gap-1.5"
                >
                  <RiFileList3Line className="size-3.5 text-amber-500" />
                  <span>บันทึกเหตุการณ์</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </SheetHeader>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {activeTab === "controls" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold uppercase tracking-wider text-foreground">
                  รายการสถานีและค่าเกณฑ์อัตโนมัติ (Station Thresholds)
                </span>
                <span>4 สถานี</span>
              </div>

              {/* Station Cards Grid: 1 Column as requested */}
              <div className="grid grid-cols-1 gap-4">
                <div id="station-bed_a" className="transition-all rounded-xl">
                  <BedStationCard
                    nodeId="bed_a"
                    node={snapshot.nodes.bed_a}
                    config={snapshot.config}
                    isWaterLow={snapshot.water_low}
                    isSubmitting={isSubmitting}
                    onToggleValve={onToggleNodeOutput}
                    onSaveThresholds={onSaveThresholds}
                  />
                </div>

                <div id="station-bed_b" className="transition-all rounded-xl">
                  <BedStationCard
                    nodeId="bed_b"
                    node={snapshot.nodes.bed_b}
                    config={snapshot.config}
                    isWaterLow={snapshot.water_low}
                    isSubmitting={isSubmitting}
                    onToggleValve={onToggleNodeOutput}
                    onSaveThresholds={onSaveThresholds}
                  />
                </div>

                <div id="station-climate" className="transition-all rounded-xl">
                  <ClimateStationCard
                    node={snapshot.nodes.climate}
                    actuator={snapshot.actuators.fan}
                    config={snapshot.config}
                    isSubmitting={isSubmitting}
                    onToggleFanActuator={onToggleActuatorCoil}
                    onToggleNodeOutput={onToggleNodeOutput}
                    onSaveThresholds={onSaveThresholds}
                  />
                </div>

                <div id="station-utility" className="transition-all rounded-xl">
                  <UtilityStationCard
                    node={snapshot.nodes.utility}
                    pumpActuator={snapshot.actuators.pump}
                    lightActuator={snapshot.actuators.light}
                    config={snapshot.config}
                    isWaterLow={snapshot.water_low}
                    isSubmitting={isSubmitting}
                    onToggleActuator={onToggleActuatorCoil}
                    onSaveThresholds={onSaveThresholds}
                    onToggleWaterLow={
                      onToggleWaterLow
                        ? () => onToggleWaterLow(snapshot.water_low)
                        : undefined
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "charts" && (
            <div className="space-y-4">
              <TelemetryCharts
                history={telemetryHistory}
                config={snapshot.config}
              />
            </div>
          )}

          {activeTab === "events" && (
            <div className="space-y-4">
              <SystemEventLog events={snapshot.recent_events || []} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
