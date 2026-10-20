#include <Arduino.h>
#include "protocol.h"
#include "config.h"
#include "io_controller.h"
#include "espnow_client.h"

// โหนดประจำแปลงผัก A
#define NODE_ID "bed_a"

static BedAController io;
static EspNowClient   comms;

// Callback เมื่อได้รับคำสั่งเปิด-ปิดวาล์ว A จากเกตเวย์
void onCommandReceived(uint32_t command_id, uint8_t output) {
    io.setRemoteCommand(output);
    comms.sendStateAck(command_id, io.getValveState());
}

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(500);
    Serial.println("\n--- [GreenMesh] ESP32 #1: Bed A Node Starting ---");

    io.init();
    comms.init(NODE_ID, MAC_BED_A, onCommandReceived);
}

void loop() {
    comms.loop();
    io.update(); // ประมวลผล Debounce สวิตช์กระถาง และเกณฑ์ความชื้นควบคุมวาล์วรดน้ำอัตโนมัติ

    static unsigned long last_telemetry_time = 0;
    unsigned long now = millis();

    // ส่ง Telemetry ตามรอบเวลาที่กำหนด (ค่าความชื้นดิน, มีกระถาง, สถานะวาล์ว)
    if (now - last_telemetry_time >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_time = now;
        comms.sendTelemetry(io.readMoisture(), io.readHasPot(), io.getValveState());
    }

    delay(20);
}