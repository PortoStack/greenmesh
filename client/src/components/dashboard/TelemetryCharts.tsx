"use client";

import React, { useState } from "react";
import {
  RiDropLine,
  RiLineChartLine,
  RiSunLine,
  RiTempHotLine,
} from "@remixicon/react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SystemConfig, TelemetryPoint } from "@/types/greenhouse";

interface TelemetryChartsProps {
  history: Record<string, TelemetryPoint[]>;
  config: SystemConfig;
}

export function TelemetryCharts({ history, config }: TelemetryChartsProps) {
  const [activeTab, setActiveTab] = useState<string>("all");
  const chartHeightClass = activeTab === "all" ? "h-[260px]" : "h-[360px]";

  const bedAHistory = history.bed_a || [];
  const bedBHistory = history.bed_b || [];
  const climateHistory = history.climate || [];
  const utilityHistory = history.utility || [];

  // Format data points for charts
  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return isNaN(d.getTime())
        ? ""
        : d.toLocaleTimeString("th-TH", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          });
    } catch {
      return "";
    }
  };

  // Combine Bed A and Bed B history into a synchronized dataset
  const maxBedLen = Math.max(bedAHistory.length, bedBHistory.length);
  const moistureData = Array.from({ length: maxBedLen }, (_, i) => {
    const ptA = bedAHistory[i];
    const ptB = bedBHistory[i];
    return {
      time: formatTime(
        ptA?.timestamp || ptB?.timestamp || new Date().toISOString(),
      ),
      bed_a: ptA ? Number(ptA.analog.toFixed(1)) : null,
      bed_b: ptB ? Number(ptB.analog.toFixed(1)) : null,
    };
  });

  const tempData = climateHistory.map((pt) => ({
    time: formatTime(pt.timestamp),
    temp: Number(pt.analog.toFixed(1)),
  }));

  const lightData = utilityHistory.map((pt) => ({
    time: formatTime(pt.timestamp),
    light: Number(pt.analog.toFixed(1)),
  }));

  return (
    <Card className="border-border/80 bg-card shadow-md overflow-x-auto">
      <CardHeader className="pb-3 border-b border-border/40 flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <RiLineChartLine className="size-5 text-primary" />
            <CardTitle className="text-base font-semibold">
              แนวโน้มข้อมูลเซ็นเซอร์แบบ Real-time (Telemetry Trend Charts)
            </CardTitle>
          </div>
          <CardDescription className="text-xs mt-0.5">
            กราฟประวัติแสดงค่าความชื้นดิน อุณหภูมิ และแสงสว่าง
            เทียบกับเกณฑ์อัตโนมัติ (Reference Lines)
          </CardDescription>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as string)}
        >
          <TabsList variant="default" className="h-8 text-xs bg-muted/60">
            <TabsTrigger value="all" className="text-xs px-2.5 py-1">
              แสดงทั้งหมด
            </TabsTrigger>
            <TabsTrigger value="moisture" className="text-xs px-2.5 py-1">
              ความชื้นดิน (A & B)
            </TabsTrigger>
            <TabsTrigger value="climate" className="text-xs px-2.5 py-1">
              อุณหภูมิ (°C)
            </TabsTrigger>
            <TabsTrigger value="light" className="text-xs px-2.5 py-1">
              ความเข้มแสง (%)
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="pt-4 space-y-6">
        {/* View Mode: All Charts (3 Columns / Responsive Grid) */}
        {(activeTab === "all" || activeTab === "moisture") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-foreground">
                <RiDropLine className="size-4 text-sky-400" />
                ความชื้นดินแปลง A vs แปลง B (% Soil Moisture)
              </span>
              <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                  <span className="size-2 rounded-full bg-emerald-500 inline-block" />{" "}
                  แปลง A
                </span>
                <span className="flex items-center gap-1 font-medium text-cyan-600 dark:text-cyan-400">
                  <span className="size-2 rounded-full bg-cyan-500 inline-block" />{" "}
                  แปลง B
                </span>
                <span className="border-l border-border pl-2 font-mono text-amber-600 dark:text-amber-400">
                  เกณฑ์แปลง A: {config?.moisture_a_min ?? 35}% - {config?.moisture_a_max ?? 45}%
                </span>
                <span className="border-l border-border pl-2 font-mono text-sky-600 dark:text-sky-400">
                  เกณฑ์แปลง B: {config?.moisture_b_min ?? 35}% - {config?.moisture_b_max ?? 45}%
                </span>
              </div>
            </div>

            <div className={`${chartHeightClass} w-full rounded-xl border border-border/40 bg-muted/5 p-2`}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={200}
              >
                <LineChart
                  data={moistureData}
                  margin={{ top: 12, right: 25, left: -15, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    opacity={0.08}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="currentColor"
                    opacity={0.5}
                    fontSize={10}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="currentColor"
                    opacity={0.5}
                    fontSize={10}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                  {/* Min and Max Reference Threshold Lines (Positioned on left so numbers never clip off the right edge) */}
                  <ReferenceLine
                    y={config?.moisture_a_min ?? 35}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: `เกณฑ์ต่ำ Min: ${config?.moisture_a_min ?? 35}%`,
                      fill: "#f59e0b",
                      fontSize: 10,
                      fontWeight: 600,
                      position: "insideTopLeft",
                    }}
                  />
                  <ReferenceLine
                    y={config?.moisture_a_max ?? 45}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{
                      value: `เกณฑ์สูง Max: ${config?.moisture_a_max ?? 45}%`,
                      fill: "#10b981",
                      fontSize: 10,
                      fontWeight: 600,
                      position: "insideBottomLeft",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bed_a"
                    name="แปลง A (%)"
                    stroke="#22c55e"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="bed_b"
                    name="แปลง B (%)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* View Mode: Temperature */}
        {(activeTab === "all" || activeTab === "climate") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-foreground">
                <RiTempHotLine className="size-4 text-amber-500" />
                อุณหภูมิโรงเรือน (°C Temperature)
              </span>
              <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                  <span className="size-2 rounded-full bg-amber-500 inline-block" />{" "}
                  อุณหภูมิ
                </span>
                <span className="border-l border-border pl-2 font-mono text-red-500">
                  เกณฑ์เปิดพัดลม: &gt;{config?.temp_high ?? 32}°C
                </span>
                <span className="font-mono text-sky-500">
                  เกณฑ์ปิดพัดลม: &lt;{config?.temp_low ?? 30}°C
                </span>
              </div>
            </div>

            <div className={`${chartHeightClass} w-full rounded-xl border border-border/40 bg-muted/5 p-2`}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={200}
              >
                <LineChart
                  data={tempData}
                  margin={{ top: 12, right: 25, left: -15, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    opacity={0.08}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="currentColor"
                    opacity={0.5}
                    fontSize={10}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[15, 45]}
                    stroke="currentColor"
                    opacity={0.5}
                    fontSize={10}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                  <ReferenceLine
                    y={config?.temp_high ?? 32}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    label={{
                      value: `เกณฑ์เปิดพัดลม: >${config?.temp_high ?? 32}°C`,
                      fill: "#ef4444",
                      fontSize: 10,
                      fontWeight: 600,
                      position: "insideTopLeft",
                    }}
                  />
                  <ReferenceLine
                    y={config?.temp_low ?? 30}
                    stroke="#38bdf8"
                    strokeDasharray="4 4"
                    label={{
                      value: `เกณฑ์ปิดพัดลม: <${config?.temp_low ?? 30}°C`,
                      fill: "#38bdf8",
                      fontSize: 10,
                      fontWeight: 600,
                      position: "insideBottomLeft",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="temp"
                    name="อุณหภูมิ (°C)"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* View Mode: Light Intensity */}
        {(activeTab === "all" || activeTab === "light") && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-foreground">
                <RiSunLine className="size-4 text-amber-300" />
                ความเข้มแสงโรงเรือน (% Light Intensity)
              </span>
              <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                  <span className="size-2 rounded-full bg-amber-400 inline-block" />{" "}
                  ความเข้มแสง
                </span>
                <span className="border-l border-border pl-2 font-mono text-amber-600 dark:text-amber-400">
                  เกณฑ์เปิดไฟ: &lt;{config?.light_min ?? 30}%
                </span>
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  เกณฑ์ปิดไฟ: &gt;{config?.light_max ?? 40}%
                </span>
              </div>
            </div>

            <div className={`${chartHeightClass} w-full rounded-xl border border-border/40 bg-muted/5 p-2`}>
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                minHeight={200}
              >
                <LineChart
                  data={lightData}
                  margin={{ top: 12, right: 25, left: -15, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="currentColor"
                    opacity={0.08}
                  />
                  <XAxis
                    dataKey="time"
                    stroke="currentColor"
                    opacity={0.5}
                    fontSize={10}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    stroke="currentColor"
                    opacity={0.5}
                    fontSize={10}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      color: "var(--foreground)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                      fontSize: "12px",
                    }}
                    itemStyle={{ color: "var(--foreground)" }}
                  />
                  <ReferenceLine
                    y={config?.light_min ?? 30}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: `เกณฑ์เปิดไฟ: <${config?.light_min ?? 30}%`,
                      fill: "#f59e0b",
                      fontSize: 10,
                      fontWeight: 600,
                      position: "insideBottomLeft",
                    }}
                  />
                  <ReferenceLine
                    y={config?.light_max ?? 40}
                    stroke="#10b981"
                    strokeDasharray="4 4"
                    label={{
                      value: `เกณฑ์ปิดไฟ: >${config?.light_max ?? 40}%`,
                      fill: "#10b981",
                      fontSize: 10,
                      fontWeight: 600,
                      position: "insideTopLeft",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="light"
                    name="ความเข้มแสง (%)"
                    stroke="#fde047"
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    activeDot={{ r: 4 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
