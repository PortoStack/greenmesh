"use client";

import React, { useState } from "react";
import {
  RiPlantLine,
  RiDropLine,
  RiContrastDrop2Line,
  RiCheckFill,
  RiAlertFill,
  RiSaveLine,
  RiCheckboxCircleFill,
  RiCloseCircleLine,
} from "@remixicon/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Progress, ProgressTrack, ProgressIndicator } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { useSmoothValue } from "@/hooks/use-smooth-value";
import { Node, SystemConfig } from "@/types/greenhouse";

interface BedStationCardProps {
  nodeId: "bed_a" | "bed_b";
  node: Node;
  config: SystemConfig;
  isWaterLow: boolean;
  isSubmitting: boolean;
  onToggleValve: (nodeId: string, currentOutput: number) => Promise<unknown>;
  onSaveThresholds: (thresholds: Partial<SystemConfig>) => Promise<unknown>;
}

export function BedStationCard({
  nodeId,
  node,
  config,
  isWaterLow,
  isSubmitting,
  onToggleValve,
  onSaveThresholds,
}: BedStationCardProps) {
  const isBedA = nodeId === "bed_a";
  const title = isBedA ? "แปลงผัก A (Bed A)" : "แปลงผัก B (Bed B)";
  const hardwareId = isBedA ? "ESP32 #1" : "ESP32 #2";

  const currentMin = isBedA ? (config?.moisture_a_min ?? 35) : (config?.moisture_b_min ?? 35);
  const currentMax = isBedA ? (config?.moisture_a_max ?? 45) : (config?.moisture_b_max ?? 45);

  const [minVal, setMinVal] = useState<number>(currentMin);
  const [maxVal, setMaxVal] = useState<number>(currentMax);
  const [hasChanged, setHasChanged] = useState<boolean>(false);

  // Sync state if config updates from server (when not actively editing)
  React.useEffect(() => {
    if (!hasChanged) {
      setMinVal(currentMin);
      setMaxVal(currentMax);
    }
  }, [currentMin, currentMax, hasChanged]);

  const hasPot = node?.digital_value === 1;
  const isValveOpen = node?.output_state === 1;
  const rawMoisture = node?.analog_value ?? 0;
  const moisture = useSmoothValue(rawMoisture);

  const handleMinChange = (val: number | readonly number[]) => {
    const num = Array.isArray(val) ? val[0] : typeof val === "number" ? val : (val as readonly number[])[0];
    setMinVal(num);
    setHasChanged(true);
  };

  const handleMaxChange = (val: number | readonly number[]) => {
    const num = Array.isArray(val) ? val[0] : typeof val === "number" ? val : (val as readonly number[])[0];
    setMaxVal(num);
    setHasChanged(true);
  };

  const handleSave = async () => {
    const payload = isBedA
      ? { moisture_a_min: minVal, moisture_a_max: maxVal }
      : { moisture_b_min: minVal, moisture_b_max: maxVal };
    await onSaveThresholds(payload);
    setHasChanged(false);
  };

  // Determine moisture health color
  const isTooDry = moisture < minVal;
  const isOptimal = moisture >= minVal && moisture <= maxVal;

  return (
    <Card className="flex flex-col justify-between border-border/80 bg-card shadow-sm transition-all hover:border-primary/40">
      <div>
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <RiPlantLine className="size-5 text-primary" />
                <CardTitle className="text-base font-semibold">{title}</CardTitle>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {hardwareId}
                </Badge>
              </div>
              <CardDescription className="text-xs mt-0.5">
                {node?.description || "ตรวจวัดความชื้นดินและควบคุมวาล์วน้ำประจำแปลง"}
              </CardDescription>
            </div>

            {/* Online Badge */}
            <Badge
              variant={node?.online ? "outline" : "destructive"}
              className={`text-[10px] ${node?.online ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : ""}`}
            >
              {node?.online ? "ONLINE" : "OFFLINE"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* Main Sensor Gauge: Soil Moisture */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <RiDropLine className="size-4 text-sky-400" />
                {node?.analog_label || "ความชื้นดิน (Soil Moisture)"}
              </span>
              <span className="text-base font-bold text-primary tabular-nums">
                {moisture.toFixed(1)} {node?.analog_unit || "%"}
              </span>
            </div>

            <Progress value={Math.min(100, Math.max(0, moisture))}>
              <ProgressTrack className="h-2.5 bg-muted">
                <ProgressIndicator
                  className={`h-full transition-all duration-300 ${
                    isTooDry
                      ? "bg-amber-500"
                      : isOptimal
                        ? "bg-primary"
                        : "bg-sky-500"
                  }`}
                />
              </ProgressTrack>
            </Progress>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
              <span>เกณฑ์เปิดวาล์ว: &lt;{minVal}%</span>
              <span>เกณฑ์ปิดวาล์ว: &gt;{maxVal}%</span>
            </div>
          </div>

          {/* Digital Sensor: Pot Detection Status */}
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <span className="text-muted-foreground font-medium">สถานะกระถาง (Pot Switch):</span>
            {hasPot ? (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 gap-1 text-xs">
                <RiCheckFill className="size-3.5" /> ตรวจพบกระถาง
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1 text-xs">
                <RiAlertFill className="size-3.5" /> ไม่พบกระถาง (ตัดน้ำ)
              </Badge>
            )}
          </div>

          {/* Output Control: Electric Valve */}
          <div
            id={`actuator-valve_${nodeId === "bed_a" ? "a" : "b"}`}
            className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 p-3 shadow-2xs transition-all"
          >
            <div>
              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                <RiContrastDrop2Line className="size-4 text-primary" />
                <span>{node?.output_label || "วาล์วน้ำ (LED Valve)"}</span>
              </div>
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                {isValveOpen ? (
                  <>
                    <RiCheckboxCircleFill className="size-3 text-emerald-500" />
                    <span>กำลังเปิดจ่ายน้ำ</span>
                  </>
                ) : (
                  <>
                    <RiCloseCircleLine className="size-3 text-muted-foreground" />
                    <span>วาล์วปิดสนิท</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold ${
                  isValveOpen ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {isValveOpen ? "OPEN" : "CLOSED"}
              </span>
              <Switch
                checked={isValveOpen}
                disabled={isSubmitting || (isWaterLow && !isValveOpen)}
                onCheckedChange={() => onToggleValve(nodeId, node?.output_state ?? 0)}
                aria-label={`Toggle valve ${title}`}
              />
            </div>
          </div>

          {/* Threshold Configuration Sliders */}
          <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-3">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>ตั้งค่าเกณฑ์รดน้ำอัตโนมัติ (Thresholds)</span>
              {hasChanged && (
                <Button
                  variant="default"
                  size="xs"
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className="gap-1 text-[11px] h-6 px-2"
                >
                  <RiSaveLine className="size-3" /> บันทึก
                </Button>
              )}
            </div>

            {/* Min Threshold Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>เปิดวาล์วเมื่อดินแห้งกว่า (Min):</span>
                <span className="font-semibold text-primary">{minVal}%</span>
              </div>
              <Slider
                min={10}
                max={50}
                value={[minVal]}
                onValueChange={handleMinChange}
              />
            </div>

            {/* Max Threshold Slider */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>ปิดวาล์วเมื่อความชื้นถึง (Max):</span>
                <span className="font-semibold text-primary">{maxVal}%</span>
              </div>
              <Slider
                min={30}
                max={80}
                value={[maxVal]}
                onValueChange={handleMaxChange}
              />
            </div>
          </div>
        </CardContent>
      </div>

      <CardFooter className="border-t border-border/40 pt-2 pb-2 text-[10px] text-muted-foreground flex justify-between">
        <span>Packet Seq: #{node?.seq ?? 0}</span>
        <span>
          Auto Mode: {config.auto_mode ? "เปิดวาล์วเมื่อดินแห้ง" : "ควบคุมด้วยตนเอง"}
        </span>
      </CardFooter>
    </Card>
  );
}
