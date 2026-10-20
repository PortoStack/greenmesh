"use client";

import React, { useState } from "react";
import { RiSignalTowerLine } from "@remixicon/react";

import {
  DashboardDrawer,
  DrawerTab,
} from "@/components/dashboard/DashboardDrawer";
import { DigitalTwin3D } from "@/components/dashboard/DigitalTwin3D";
import { ExecutiveHeader } from "@/components/dashboard/ExecutiveHeader";
import { NetworkTopologyBar } from "@/components/dashboard/NetworkTopologyBar";
import { Button } from "@/components/ui/button";
import { useGreenhouseApi } from "@/hooks/use-greenhouse-api";
import { useGreenhouseStream } from "@/hooks/use-greenhouse-stream";

export default function HomePage() {
  // 1. Live WebSocket / SSE Stream Connection
  const {
    snapshot,
    telemetryHistory,
    isConnected,
    isConnecting,
    transport,
    refresh,
    updateOptimisticNode,
    updateOptimisticActuator,
    updateOptimisticConfig,
    sendWebSocketCommand,
  } = useGreenhouseStream();

  // 2. High-speed Command Handlers (WebSocket fast-path + REST fallback)
  const {
    isSubmitting,
    toggleNodeOutput,
    toggleActuatorCoil,
    setSystemMode,
    saveThresholds,
    triggerEmergencyStop,
  } = useGreenhouseApi({
    onOptimisticNode: updateOptimisticNode,
    onOptimisticActuator: updateOptimisticActuator,
    onOptimisticConfig: updateOptimisticConfig,
    onRefresh: refresh,
    sendWebSocketCommand,
  });

  // 3. Right-side Drawer State
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("controls");

  const handleOpenDrawer = (tab: DrawerTab) => {
    setDrawerTab(tab);
    setDrawerOpen(true);
  };

  // 4. Target element ID for smooth scrolling inside Drawer
  const [scrollTargetId, setScrollTargetId] = useState<string | null>(null);

  const handleSelectDevice = (deviceId: string, type: "node" | "actuator") => {
    // When clicking in 3D: Open Drawer directly to 'controls' tab and scroll to targeted station/actuator
    setScrollTargetId(deviceId);
    setDrawerTab("controls");
    setDrawerOpen(true);
  };


  // 5. Topology Quick Drawer / Collapse
  const [showTopology, setShowTopology] = useState<boolean>(false);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground flex flex-col select-none">
      {/* 1. Floating Top Glass Header */}
      <ExecutiveHeader
        snapshot={snapshot}
        isConnected={isConnected}
        isConnecting={isConnecting}
        isSubmitting={isSubmitting}
        transport={transport}
        onToggleMode={setSystemMode}
        onEmergencyStop={triggerEmergencyStop}
        onRefresh={refresh}
        onOpenDrawerTab={handleOpenDrawer}
      />

      {/* 2. Optional Floating Network Topology Bar Dropdown */}
      {showTopology && (
        <div className="absolute top-[60px] inset-x-4 z-30 mx-auto max-w-7xl animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <div className="rounded-2xl border border-border/80 bg-background/95 backdrop-blur-xl p-3 shadow-2xl">
            <NetworkTopologyBar
              nodes={snapshot.nodes}
              actuators={snapshot.actuators}
              onSelectDevice={handleSelectDevice}
            />
          </div>
        </div>
      )}

      {/* 3. Fullscreen Immersive 3D Greenhouse Digital Twin (Main Hero) */}
      <main className="relative flex-1 h-[calc(100vh-60px)] w-full overflow-hidden">
        <DigitalTwin3D
          snapshot={snapshot}
          onSelectDevice={handleSelectDevice}
          onOpenDrawerTab={handleOpenDrawer}
        />

        {/* Floating Toggle for Network Topology Bar at Top Center */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowTopology((prev) => !prev)}
            className="rounded-full border-border/80 bg-background/80 backdrop-blur-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground shadow-md transition-all gap-1.5"
          >
            <RiSignalTowerLine className="size-3.5 text-primary" />
            <span>
              {showTopology
                ? "ซ่อนผังฮาร์ดแวร์"
                : "ตรวจสอบสถานะ 7 โหนดฮาร์ดแวร์"}
            </span>
          </Button>
        </div>
      </main>

      {/* 4. Right-side Slide-over Sheet (Controls, Charts, Event Logs) */}
      <DashboardDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeTab={drawerTab}
        onTabChange={setDrawerTab}
        scrollTargetId={scrollTargetId}
        snapshot={snapshot}
        telemetryHistory={telemetryHistory}
        isSubmitting={isSubmitting}
        onToggleNodeOutput={toggleNodeOutput}
        onToggleActuatorCoil={toggleActuatorCoil}
        onSaveThresholds={saveThresholds}
      />
    </div>
  );
}
