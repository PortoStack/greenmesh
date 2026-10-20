#include <Arduino.h>
#include "protocol.h"
#include "config.h"
#include "io_controller.h"
#include "espnow_gateway.h"
#include "mqtt_bridge.h"

// โหนดประจำสถานีส่วนกลาง แสง/น้ำ และสะพานสื่อสาร
#define NODE_ID "utility"

static UtilityController io;
static EspNowGateway     gateway;
static uint32_t          local_seq = 0;

// เมื่อได้รับ Telemetry จากโหนดลูกผ่าน ESP-NOW -> ส่งต่อขึ้น MQTT
void onChildTelemetry(const EspNowPayload& payload) {
    Serial.printf("[Gateway] Forwarding Telemetry from %s to MQTT\n", payload.node_id);
    MqttBridge::getInstance().publishTelemetry(payload.node_id,
                                               payload.analog,
                                               payload.digital,
                                               payload.output,
                                               payload.seq);
}

// เมื่อได้รับ State ACK จากโหนดลูกผ่าน ESP-NOW -> ส่งต่อขึ้น MQTT
void onChildState(const EspNowPayload& payload) {
    Serial.printf("[Gateway] Forwarding State ACK from %s to MQTT (output=%d)\n", payload.node_id, payload.output);
    MqttBridge::getInstance().publishState(payload.node_id, payload.output, true);
}

// เมื่อได้รับ Command จาก MQTT -> ถ้าเป็น utility จัดการเอง ถ้าเป็นลูกส่งต่อผ่าน ESP-NOW
void onMqttCommand(const char* target_node_id, uint32_t command_id, uint8_t output) {
    Serial.printf("[Gateway] Inbound MQTT Command: target=%s, cmd_id=%u, output=%d\n",
                  target_node_id, command_id, output);

    if (strcmp(target_node_id, NODE_ID) == 0) {
        io.setRemoteCommand(output);
        MqttBridge::getInstance().publishState(NODE_ID, io.getGrowLightState(), true);
    } else {
        gateway.sendCommand(target_node_id, command_id, output);
    }
}

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(500);
    Serial.println("\n=======================================================");
    Serial.println("  [GreenMesh] ESP32 #4: Master Gateway Starting");
    Serial.println("=======================================================");

    io.init();

    // 1. เชื่อมต่อ Wi-Fi และเตรียม MQTT
    MqttBridge::getInstance().init(onMqttCommand);
    MqttBridge::getInstance().connectWifi();

    // 2. เริ่มต้นระบบ ESP-NOW Gateway
    if (!gateway.init(onChildTelemetry, onChildState)) {
        Serial.println("[Gateway] ESP-NOW Gateway init failed!");
    }
}

void loop() {
    static unsigned long last_telemetry_time = 0;
    unsigned long now = millis();

    // วนลูปบริการเครือข่าย Wi-Fi และ MQTT
    MqttBridge::getInstance().loop();
    io.update(); // ประมวลผล Debounce สวิตช์น้ำต่ำ และเกณฑ์แสงควบคุมโคมไฟปลูกพืชอัตโนมัติ

    // ส่ง Telemetry ของตัวเอง (utility) ขึ้น MQTT ทุกๆ 2 วินาที
    if (now - last_telemetry_time >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_time = now;
        local_seq++;

        MqttBridge::getInstance().publishTelemetry(NODE_ID,
                                                   io.readLight(),
                                                   io.readWaterLow(),
                                                   io.getGrowLightState(),
                                                   local_seq);
    }

    delay(20);
}