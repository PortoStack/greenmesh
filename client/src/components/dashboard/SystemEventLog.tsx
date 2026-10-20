"use client";

import React, { useState } from "react";
import {
  RiFileList3Line,
  RiAlertFill,
  RiCheckFill,
  RiInformationLine,
  RiFilter3Line,
} from "@remixicon/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EventLevel, SystemEvent } from "@/types/greenhouse";

interface SystemEventLogProps {
  events: SystemEvent[];
}

export function SystemEventLog({ events }: SystemEventLogProps) {
  const [filterLevel, setFilterLevel] = useState<string>("ALL");

  const filteredEvents = events.filter((evt) => {
    if (filterLevel === "ALL") return true;
    return evt.level === filterLevel;
  });

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? "--:--:--" : d.toLocaleTimeString("th-TH");
    } catch {
      return "--:--:--";
    }
  };

  const getLevelBadge = (level: EventLevel | string) => {
    switch (level) {
      case "DANGER":
        return (
          <Badge variant="destructive" className="gap-1 text-[10px] font-semibold">
            <RiAlertFill className="size-3" /> DANGER
          </Badge>
        );
      case "WARNING":
        return (
          <Badge
            variant="outline"
            className="border-amber-500/40 text-amber-400 bg-amber-500/10 gap-1 text-[10px] font-semibold"
          >
            <RiAlertFill className="size-3" /> WARNING
          </Badge>
        );
      case "SUCCESS":
        return (
          <Badge
            variant="outline"
            className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 gap-1 text-[10px] font-semibold"
          >
            <RiCheckFill className="size-3" /> SUCCESS
          </Badge>
        );
      case "INFO":
      default:
        return (
          <Badge
            variant="outline"
            className="border-sky-500/40 text-sky-400 bg-sky-500/10 gap-1 text-[10px] font-semibold"
          >
            <RiInformationLine className="size-3" /> INFO
          </Badge>
        );
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case "bed_a":
        return "ESP32 #1 (แปลง A)";
      case "bed_b":
        return "ESP32 #2 (แปลง B)";
      case "climate":
        return "ESP32 #3 (สภาพอากาศ)";
      case "utility":
        return "ESP32 #4 (น้ำ/แสง)";
      case "pump":
        return "Modbus #1 (ปั๊มน้ำ)";
      case "fan":
        return "Modbus #2 (พัดลม)";
      case "light":
        return "Modbus #3 (ไฟปลูกพืช)";
      case "system":
        return "System Gateway";
      default:
        return source;
    }
  };

  return (
    <Card className="border-border/80 bg-card shadow-md">
      <CardHeader className="pb-3 border-b border-border/40 flex-row items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <RiFileList3Line className="size-5 text-primary" />
            <CardTitle className="text-base font-semibold">
              บันทึกเหตุการณ์และการแจ้งเตือนระบบ (Real-time Event & Alert Log)
            </CardTitle>
          </div>
          <CardDescription className="text-xs mt-0.5">
            ประวัติการทำงานของกฎอัตโนมัติ การส่งคำสั่ง และการแจ้งเตือนความปลอดภัย
          </CardDescription>
        </div>

        {/* Severity Filter Buttons */}
        <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/60">
          <Button
            variant={filterLevel === "ALL" ? "default" : "ghost"}
            size="xs"
            onClick={() => setFilterLevel("ALL")}
            className="text-[11px] h-6 px-2"
          >
            ทั้งหมด ({events.length})
          </Button>
          <Button
            variant={filterLevel === "DANGER" ? "destructive" : "ghost"}
            size="xs"
            onClick={() => setFilterLevel("DANGER")}
            className="text-[11px] h-6 px-2"
          >
            ฉุกเฉิน
          </Button>
          <Button
            variant={filterLevel === "WARNING" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setFilterLevel("WARNING")}
            className="text-[11px] h-6 px-2 text-amber-400"
          >
            คำเตือน
          </Button>
          <Button
            variant={filterLevel === "SUCCESS" ? "outline" : "ghost"}
            size="xs"
            onClick={() => setFilterLevel("SUCCESS")}
            className="text-[11px] h-6 px-2 text-emerald-400"
          >
            สำเร็จ
          </Button>
          <Button
            variant={filterLevel === "INFO" ? "outline" : "ghost"}
            size="xs"
            onClick={() => setFilterLevel("INFO")}
            className="text-[11px] h-6 px-2 text-sky-400"
          >
            ข้อมูล
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <div className="max-h-[320px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card/95 backdrop-blur-xs border-b border-border/60">
              <TableRow>
                <TableHead className="w-[100px] text-xs">เวลา</TableHead>
                <TableHead className="w-[110px] text-xs">ระดับ</TableHead>
                <TableHead className="w-[160px] text-xs">อุปกรณ์ต้นทาง</TableHead>
                <TableHead className="text-xs">รายละเอียดเหตุการณ์</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="h-24 text-center text-xs text-muted-foreground"
                  >
                    ยังไม่มีข้อมูลเหตุการณ์ในระบบ
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((evt) => (
                  <TableRow key={evt.id} className="text-xs hover:bg-muted/20">
                    <TableCell className="font-mono text-muted-foreground tabular-nums">
                      {formatTimestamp(evt.timestamp)}
                    </TableCell>
                    <TableCell>{getLevelBadge(evt.level)}</TableCell>
                    <TableCell className="font-medium text-foreground">
                      <span className="rounded-md border border-border/40 bg-muted/30 px-1.5 py-0.5 text-[11px]">
                        {getSourceLabel(evt.source)}
                      </span>
                    </TableCell>
                    <TableCell className="text-foreground/90 font-normal">
                      {evt.message}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
