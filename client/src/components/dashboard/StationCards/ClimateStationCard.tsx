"use client";

import React, { useState } from "react";
import {
  RiTempHotLine,
  RiWindyLine,
  RiHandHeartLine,
  RiSaveLine,
  RiSpeedUpLine,
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
import { Actuator, Node, SystemConfig } from "@/types/greenhouse";

interface ClimateStationCardProps {
  node: Node;
  actuator: Actuator;
  config: SystemConfig;
  isSubmitting: boolean;
  onToggleFanActuator: (actuatorId: string, currentCoil: number) => Promise<unknown>;
  onToggleNodeOutput: (nodeId: string, currentOutput: number) => Promise<unknown>;
  onSaveThresholds: (thresholds: Partial<SystemConfig>) => Promise<unknown>;
}

export function ClimateStationCard({
  node,
  actuator,
  config,
  isSubmitting,
  onToggleFanActuator,
  onToggleNodeOutput,
  onSaveThresholds,
}: ClimateStationCardProps) {
  const [tempHigh, setTempHigh] = useState<number>(config?.temp_high ?? 32);
  const [tempLow, setTempLow] = useState<number>(config?.temp_low ?? 30);
  const [hasChanged, setHasChanged] = useState<boolean>(false);

  React.useEffect(() => {
    if (!hasChanged) {
      setTempHigh(config?.temp_high ?? 32);
      setTempLow(config?.temp_low ?? 30);
    }
  }, [config?.temp_high, config?.temp_low, hasChanged]);

  const rawTemp = node?.analog_value ?? 0;
  const temp = useSmoothValue(rawTemp);
  const isButtonPressed = node?.digital_value === 1;
  const isEspFanLedOn = node?.output_state === 1;
  const isModbusFanRunning = actuator?.running === 1 || actuator?.coil === 1;

  const handleSave = async () => {
    await onSaveThresholds({ temp_high: tempHigh, temp_low: tempLow });
    setHasChanged(false);
  };

  const isHot = temp > tempHigh;
  const isCool = temp < tempLow;

  return (
    <Card className="flex flex-col justify-between border-border/80 bg-card shadow-sm transition-all hover:border-amber-500/40">
      <div>
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <RiTempHotLine className="size-5 text-amber-500" />
                <CardTitle className="text-base font-semibold">
                  สภาพอากาศและการระบายอากาศ (Climate & Fan)
                </CardTitle>
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  ESP32 #3 + Modbus Slave 2
                </Badge>
              </div>
              <CardDescription className="text-xs mt-0.5">
                ตรวจวัดอุณหภูมิโรงเรือนและควบคุมพัดลมระบายอากาศอัตโนมัติ
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
          {/* Main Temperature Gauge */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium text-foreground">
                <RiTempHotLine className="size-4 text-amber-500" />
                {node?.analog_label || "อุณหภูมิโรงเรือน (Temperature)"}
              </span>
              <span className="text-base font-bold text-amber-400 tabular-nums">
                {temp.toFixed(1)} {node?.analog_unit || "°C"}
              </span>
            </div>

            <Progress value={Math.min(100, Math.max(0, (temp / 50) * 100))}>
              <ProgressTrack className="h-2.5 bg-muted">
                <ProgressIndicator
                  className={`h-full transition-all duration-300 ${
                    isHot ? "bg-red-500" : isCool ? "bg-sky-400" : "bg-amber-400"
                  }`}
                />
              </ProgressTrack>
            </Progress>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
              <span>เกณฑ์เปิดพัดลม (ร้อน): &gt;{tempHigh}°C</span>
              <span>เกณฑ์ปิดพัดลม (เย็น): &lt;{tempLow}°C</span>
            </div>
          </div>

          {/* Digital Sensor: Manual Request Button from ESP32 */}
          <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs">
            <span className="text-muted-foreground font-medium flex items-center gap-1">
              <RiHandHeartLine className="size-3.5 text-primary" />
              ปุ่มขอเปิดพัดลมเฉพาะจุด (Fan Button):
            </span>
            {isButtonPressed ? (
              <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 gap-1 text-xs">
                มีการกดขอเปิดพัดลม
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground/80 text-xs">
                ปกติ (ไม่มีการกด)
              </Badge>
            )}
          </div>

          {/* Actuator Control: Ventilation Fan (Modbus Slave 2 + ESP32 LED) */}
          <div
            id="actuator-fan"
            className="flex items-center justify-between rounded-xl border border-border/60 bg-card/60 p-3 shadow-2xs transition-all"
          >
            <div>
              <div className="flex items-center gap-1.5 font-medium text-xs text-foreground">
                <RiWindyLine className="size-4 text-amber-400" />
                <span>พัดลมระบายอากาศ (Modbus Slave 2)</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  Modbus:
                  {isModbusFanRunning ? (
                    <>
                      <RiCheckboxCircleFill className="size-3 text-amber-500" />
                      <span>RUNNING</span>
                    </>
                  ) : (
                    <>
                      <RiCloseCircleLine className="size-3 text-muted-foreground" />
                      <span>STOPPED</span>
                    </>
                  )}
                </span>
                <span>•</span>
                <span>ESP32 LED: {isEspFanLedOn ? "ON" : "OFF"}</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-semibold ${
                  isModbusFanRunning ? "text-amber-400" : "text-muted-foreground"
                }`}
              >
                {isModbusFanRunning ? "ON" : "OFF"}
              </span>
              <Switch
                checked={isModbusFanRunning}
                disabled={isSubmitting}
                onCheckedChange={() => onToggleFanActuator("fan", actuator?.coil ?? 0)}
                aria-label="Toggle Ventilation Fan"
              />
            </div>
          </div>

          {/* Threshold Sliders */}
          <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-3">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>ตั้งค่าเกณฑ์อุณหภูมิพัดลมอัตโนมัติ</span>
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

            {/* High Temp Threshold */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>เปิดพัดลมเมื่ออุณหภูมิเกิน (Temp High):</span>
                <span className="font-semibold text-amber-400">{tempHigh}°C</span>
              </div>
              <Slider
                min={26}
                max={45}
                value={[tempHigh]}
                onValueChange={(val) => {
                  setTempHigh(Array.isArray(val) ? val[0] : val);
                  setHasChanged(true);
                }}
              />
            </div>

            {/* Low Temp Threshold */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>ปิดพัดลมเมื่อเย็นลงต่ำกว่า (Temp Low):</span>
                <span className="font-semibold text-sky-400">{tempLow}°C</span>
              </div>
              <Slider
                min={20}
                max={32}
                value={[tempLow]}
                onValueChange={(val) => {
                  setTempLow(Array.isArray(val) ? val[0] : val);
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
          Auto Mode: {config.auto_mode ? "เปิดพัดลมเมื่อร้อนเกินเกณฑ์" : "ควบคุมด้วยตนเอง"}
        </span>
      </CardFooter>
    </Card>
  );
}
