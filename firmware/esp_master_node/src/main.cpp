#include <Arduino.h>
#include "protocol.h"
#include "config.h"
#include "io_controller.h"
#include "espnow_gateway.h"
#include "mqtt_bridge.h"

#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

// โหนดประจำสถานีส่วนกลาง แสง/น้ำ และสะพานสื่อสาร
#define NODE_ID "utility"

static UtilityController io;
static EspNowGateway     gateway;
static uint32_t          local_seq = 0;

// คิวพักข้อมูลเพื่อแยกงานระหว่าง Wi-Fi Interrupt Task (ESP-NOW) กับ Main Loop Task (MQTT TCP)
static QueueHandle_t telemetry_queue = nullptr;
static QueueHandle_t state_queue = nullptr;

// เมื่อได้รับ Telemetry จากโหนดลูกผ่าน ESP-NOW -> แค่เก็บลงคิวในหน่วยความจำ (Thread-Safe, รวดเร็ว ไม่แตะ TCP Socket)
void onChildTelemetry(const EspNowPayload& payload) {
    if (telemetry_queue != nullptr) {
        if (xQueueSend(telemetry_queue, &payload, 0) != pdTRUE) {
            Serial.printf("[Gateway] ⚠️ Telemetry queue full! Dropped packet from %s\n", payload.node_id);
        }
    }
}

// เมื่อได้รับ State ACK จากโหนดลูกผ่าน ESP-NOW -> เก็บลงคิว
void onChildState(const EspNowPayload& payload) {
    if (state_queue != nullptr) {
        xQueueSend(state_queue, &payload, 0);
    }
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

    // สร้าง FreeRTOS Queues สำหรับรับส่งข้อมูลข้าม Context
    telemetry_queue = xQueueCreate(20, sizeof(EspNowPayload));
    state_queue = xQueueCreate(10, sizeof(EspNowPayload));

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

    // ประมวลผลแพ็กเก็ต Telemetry จากโหนดลูกที่อยู่ในคิว และส่งขึ้น MQTT อย่างปลอดภัยใน Main Thread
    EspNowPayload item;
    while (telemetry_queue != nullptr && xQueueReceive(telemetry_queue, &item, 0) == pdTRUE) {
        MqttBridge::getInstance().publishTelemetry(item.node_id,
                                                   item.analog,
                                                   item.digital,
                                                   item.output,
                                                   item.seq);
        MqttBridge::getInstance().loop();
        delay(5);
    }

    // ประมวลผล State ACK จากโหนดลูกที่อยู่ในคิว
    while (state_queue != nullptr && xQueueReceive(state_queue, &item, 0) == pdTRUE) {
        MqttBridge::getInstance().publishState(item.node_id, item.output, true);
        MqttBridge::getInstance().loop();
        delay(5);
    }

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