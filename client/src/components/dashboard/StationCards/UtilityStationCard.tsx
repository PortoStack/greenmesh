"use client";

import React, { useState } from "react";
import {
  RiSunLine,
  RiDropLine,
  RiLightbulbLine,
  RiSpeedUpLine,
  RiAlertFill,
  RiSaveLine,
  RiShieldCheckLine,
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
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSmoothValue } from "@/hooks/use-smooth-value";
import { Actuator, Node, SystemConfig } from "@/types/greenhouse";

interface UtilityStationCardProps {
  node: Node;
  pumpActuator: Actuator;
  lightActuator: Actuator;
  config: SystemConfig;
  isWaterLow: boolean;
  isSubmitting: boolean;
  onToggleActuator: (actuatorId: string, currentCoil: number) => Promise<unknown>;
  onSaveThresholds: (thresholds: Partial<SystemConfig>) => Promise<unknown>;
}

export function UtilityStationCard({
  node,
  pumpActuator,
  lightActuator,
  config,
  isWaterLow,
  isSubmitting,
  onToggleActuator,
  onSaveThresholds,
}: UtilityStationCardProps) {
  const [lightMin, setLightMin] = useState<number>(config?.light_min ?? 30);
  const [lightMax, setLightMax] = useState<number>(config?.light_max ?? 40);
  const [hasChanged, setHasChanged] = useState<boolean>(false);

  React.useEffect(() => {
    if (!hasChanged) {
      setLightMin(config?.light_min ?? 30);
      setLightMax(config?.light_max ?? 40);
    }
  }, [config?.light_min, config?.light_max, hasChanged]);

  const rawLight = node?.analog_value ?? 0;
  const light = useSmoothValue(rawLight);
  const isPumpRunning = pumpActuator?.running === 1 || pumpActuator?.coil === 1;
  const isLightRunning = lightActuator?.running === 1 || lightActuator?.coil === 1;

  const handleSave = async () => {
    await onSaveThresholds({ light_min: lightMin, light_max: lightMax });
    setHasChanged(false);
  };

  return (
    <Card className="flex flex-col justify-between border-border/80 bg-card shadow-sm transition-all hover:border-primary/40">
      <div>
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <RiSunLine className="size-5 text-amber-400" />
                <CardTitle className="text-base font-semibold">
                  ระบบแสง ถังน้ำ และปั๊มส่วนกลาง (Utility & Pump)
                </CardTitle>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  ESP32 #4 + Slaves 1, 3
                </Badge>
              </div>
              <CardDescription className="text-xs mt-0.5">
                ตรวจวัดความเข้มแสง ระดับน้ำในถัง และควบคุมปั๊ม/โคมไฟปลูกพืช
              </CardDescription>
            </div>

            <Badge
              variant={node?.online ? "outline" : "destructive"}
              className={`text-[10px] ${node?.online ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : ""}`}
            >
              {node?.online ? "ONLINE" : "OFFLINE"}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 pt-4">
          {/* Emergency Alert Banner if Water is Low */}
          {isWaterLow && (
            <Alert variant="destructive" className="border-destructive/50 bg-destructive/10 animate-pulse py-2">
              <RiAlertFill className="size-4" />
              <AlertTitle className="text-xs font-bold">ภาวะฉุกเฉิน: ระดับน้ำในถังต่ำ!</AlertTitle>
              <AlertDescription className="text-[11px]">
                เซ็นเซอร์ตรวจพบน้ำในถังต่ำ ระบบได้ตัดการทำงานของปั๊มน้ำและปิดวาล์ว A/B ทั้งหมดเพื่อความปลอดภัย
              </AlertDescription>
            </Alert>
          )}

          {/* Water Tank Status */}
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <span className="text-muted-foreground font-medium flex items-center gap-1.5">
              <RiDropLine className="size-4 text-sky-400" />
              ระดับน้ำในถังพัก (Water Level):
            </span>
            {isWaterLow ? (
              <Badge variant="destructive" className="gap-1 text-xs">
                <RiAlertFill className="size-3.5" /> ระดับน้ำต่ำ (ตัดน้ำ)
              </Badge>
            ) : (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 gap-1 text-xs">
                <RiShieldCheckLine className="size-3.5" /> ระดับน้ำปกติ
              </Badge>
            )}
          </div>

          {/* Modbus Slave 1: Water Pump Control */}
          <div
            id="actuator-pump"
            className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 p-3 shadow-2xs transition-all"
          >
            <div>
              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                <RiSpeedUpLine className="size-4 text-sky-400" />
                <span>ปั๊มน้ำส่วนกลาง (Modbus Slave 1)</span>
              </div>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                {isPumpRunning ? (
                  <>
                    <RiCheckboxCircleFill className="size-3 text-sky-400 inline-block shrink-0" />
                    <span>ปั๊มกำลังสูบน้ำจ่ายระบบ</span>
                  </>
                ) : (
                  <>
                    <RiCloseCircleLine className="size-3 text-muted-foreground inline-block shrink-0" />
                    <span>ปั๊มหยุดการทำงาน</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold ${
                  isPumpRunning ? "text-sky-400" : "text-muted-foreground"
                }`}
              >
                {isPumpRunning ? "RUNNING" : "STOP"}
              </span>
              <Switch
                checked={isPumpRunning}
                disabled={isSubmitting || (isWaterLow && !isPumpRunning)}
                onCheckedChange={() => onToggleActuator("pump", pumpActuator?.coil ?? 0)}
                aria-label="Toggle Water Pump"
              />
            </div>
          </div>

          {/* Main Sensor Gauge: Light Intensity */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <RiSunLine className="size-4 text-amber-300" />
                {node?.analog_label || "ความเข้มแสง (Light Intensity)"}
              </span>
              <span className="text-base font-bold text-amber-300 tabular-nums">
                {light.toFixed(1)} {node?.analog_unit || "%"}
              </span>
            </div>

            <Progress value={Math.min(100, Math.max(0, light))}>
              <ProgressTrack className="h-2.5 bg-muted">
                <ProgressIndicator className="h-full bg-amber-400 transition-all duration-300" />
              </ProgressTrack>
            </Progress>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
              <span>เกณฑ์เปิดไฟ (มืด): &lt;{lightMin}%</span>
              <span>เกณฑ์ปิดไฟ (สว่าง): &gt;{lightMax}%</span>
            </div>
          </div>

          {/* Modbus Slave 3: Grow Light Control */}
          <div
            id="actuator-light"
            className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 p-3 shadow-2xs transition-all"
          >
            <div>
              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                <RiLightbulbLine className="size-4 text-amber-300" />
                <span>โคมไฟปลูกพืช (Modbus Slave 3)</span>
              </div>
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                {isLightRunning ? (
                  <>
                    <RiCheckboxCircleFill className="size-3 text-amber-500 inline-block shrink-0" />
                    <span>โคมไฟเปิดส่องสว่าง</span>
                  </>
                ) : (
                  <>
                    <RiCloseCircleLine className="size-3 text-muted-foreground inline-block shrink-0" />
                    <span>ปิดไฟ</span>
                  </>
                )}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold ${
                  isLightRunning ? "text-amber-300" : "text-muted-foreground"
                }`}
              >
                {isLightRunning ? "ON" : "OFF"}
              </span>
              <Switch
                checked={isLightRunning}
                disabled={isSubmitting}
                onCheckedChange={() => onToggleActuator("light", lightActuator?.coil ?? 0)}
                aria-label="Toggle Grow Light"
              />
            </div>
          </div>

          {/* Threshold Sliders for Light */}
          <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-3">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>ตั้งค่าเกณฑ์แสงสว่างอัตโนมัติ</span>
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

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>เปิดไฟเมื่อแสงน้อยกว่า (Min):</span>
                <span className="font-semibold text-amber-300">{lightMin}%</span>
              </div>
              <Slider
                min={10}
                max={45}
                value={[lightMin]}
                onValueChange={(val) => {
                  setLightMin(Array.isArray(val) ? val[0] : val);
                  setHasChanged(true);
                }}
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>ปิดไฟเมื่อแสงสว่างเกิน (Max):</span>
                <span className="font-semibold text-amber-300">{lightMax}%</span>
              </div>
              <Slider
                min={30}
                max={70}
                value={[lightMax]}
                onValueChange={(val) => {
                  setLightMax(Array.isArray(val) ? val[0] : val);
                  setHasChanged(true);
                }}
              />
            </div>
          </div>
        </CardContent>
      </div>

      <CardFooter className="border-t border-border/40 pt-2 pb-2 text-[10px] text-muted-foreground flex justify-between">
        <span>Packet Seq: #{node?.seq ?? 0}</span>
        <span>
          Pump Logic: ปั๊มเปิดเมื่อวาล์วเปิดและน้ำไม่ต่ำ
        </span>
      </CardFooter>
    </Card>
  );
}
