#include <Arduino.h>
#include "protocol.h"
#include "config.h"
#include "io_controller.h"
#include "espnow_client.h"

// โหนดประจำระบบระบายอากาศและสภาพแวดล้อม
#define NODE_ID "climate"

static ClimateController io;
static EspNowClient     comms;

// Callback เมื่อได้รับคำสั่งเปิด-ปิดพัดลมจากเกตเวย์
void onCommandReceived(uint32_t command_id, uint8_t output) {
    io.setRemoteCommand(output);
    comms.sendStateAck(command_id, io.getFanState());
}

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(500);
    Serial.println("\n--- [GreenMesh] ESP32 #3: Climate Node Starting ---");

    io.init();
    comms.init(NODE_ID, MAC_CLIMATE, onCommandReceived);
}

void loop() {
    comms.loop();
    io.update(); // ประมวลผล Debounce ปุ่มกด และกฎเกณฑ์อุณหภูมิควบคุมพัดลมอัตโนมัติ

    static unsigned long last_telemetry_time = 0;
    unsigned long now = millis();

    // ส่ง Telemetry ตามรอบเวลาที่กำหนด (อุณหภูมิ, ปุ่มขอพัดลม, สถานะพัดลม)
    if (now - last_telemetry_time >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_time = now;
        comms.sendTelemetry(io.readTemperature(), io.readFanRequest(), io.getFanState());
    }

    delay(20);
}