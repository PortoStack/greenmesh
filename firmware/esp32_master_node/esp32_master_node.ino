/**
 * ============================================================================
 * โครงงาน: GreenMesh - Smart Greenhouse System (ESP32 #4: Master Gateway Node)
 * วิชา: 305432 Sensor Network Term Project
 * หน้าที่: ตรวจวัดระดับแสง, ตรวจระดับน้ำต่ำ, ควบคุมไฟปลูกพืช, 
 *          และทำหน้าที่เป็น สะพานสื่อสาร (Gateway) แปลง ESP-NOW <-> MQTT
 * 
 * ข้อกำหนดตามโจทย์:
 *  - ใช้งาน analogRead() อ่านค่าความเข้มแสงจำลองที่ GPIO 34 (ADC1)
 *  - ใช้งาน digitalRead() อ่านค่าสวิตช์ตรวจจับน้ำต่ำที่ GPIO 25 (Digital In)
 *  - ใช้งาน digitalWrite() ควบคุมหลอด LED แสดงสถานะไฟปลูกพืชที่ GPIO 2 (Output)
 *  - ใช้งานการสื่อสารโปรโตคอล ESP-NOW รับส่งข้อมูลกับโหนดลูกทั้ง 3 บอร์ด
 *  - ใช้งานการสื่อสารโปรโตคอล MQTT เชื่อมต่อไปยัง Mosquitto Broker และเกตเวย์กลาง
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <PubSubClient.h>

#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

#include "config.h"
#include "protocol.h"

#define NODE_ID "utility"

// --- ตัวแปรและสถานะประจำโหนด Utility ---
static uint8_t  grow_light_state = 0;     // 0 = ไฟดับ, 1 = ไฟสว่าง
static uint8_t  water_low = 0;            // 0 = ระดับน้ำปกติ, 1 = น้ำในถังต่ำ (Alert)
static int      last_raw_button = HIGH;
static int      debounced_button = HIGH;
static unsigned long last_debounce_time = 0;

static bool     feedback_blink_active = false;
static unsigned long feedback_blink_end = 0;

static bool     remote_override_active = false;
static unsigned long remote_override_start = 0;

static uint32_t local_seq = 0;

// --- คิวพักข้อมูล FreeRTOS ป้องกันปัญหา Concurrency ระหว่าง Wi-Fi Task และ Main Loop ---
static QueueHandle_t telemetry_queue = nullptr;
static QueueHandle_t state_queue = nullptr;

// --- Wi-Fi & MQTT Client ---
static WiFiClient   wifiClient;
static PubSubClient mqttClient(wifiClient);
static String       mqttClientId;

// ============================================================================
// ฟังก์ชันอ่านค่าและควบคุม I/O ฮาร์ดแวร์ตามโจทย์
// ============================================================================

// ข้อ 8.5: ใช้งาน analogRead() อ่านค่า Analog Input (ความเข้มแสง 0.0 - 100.0%)
float readLight() {
    int raw_analog = analogRead(PIN_ANALOG_DEFAULT); // GPIO 34 (ADC1 0-4095)
    return (raw_analog / 4095.0f) * 100.0f;
}

// ข้อ 8.6: ใช้งาน digitalRead() อ่านค่า Digital Input (สวิตช์จำลองน้ำต่ำ)
uint8_t readWaterLow() {
    return water_low;
}

// ข้อ 8.7: ใช้งาน digitalWrite() ควบคุม Digital Output (LED ไฟปลูกพืช)
void setGrowLight(uint8_t state) {
    grow_light_state = state ? 1 : 0;
    if (!feedback_blink_active) {
        digitalWrite(PIN_OUTPUT_DEFAULT, grow_light_state ? HIGH : LOW); // GPIO 2
    }
}

void triggerFeedbackBlink(unsigned long now) {
    feedback_blink_active = true;
    feedback_blink_end = now + 150;
    digitalWrite(PIN_OUTPUT_DEFAULT, HIGH);
}

// ============================================================================
// ฟังก์ชัน MQTT Bridge
// ============================================================================

bool publishTelemetry(const char* node_id, float analog_val, uint8_t digital_val, uint8_t out_state, uint32_t seq) {
    if (!mqttClient.connected()) return false;

    char topic[64];
    snprintf(topic, sizeof(topic), "greenhouse/%s/telemetry", node_id);

    char payload[256];
    snprintf(payload, sizeof(payload),
             "{\"node_id\":\"%s\",\"analog\":%.1f,\"digital\":%d,\"output\":%d,\"seq\":%u}",
             node_id, analog_val, digital_val, out_state, seq);

    bool ok = mqttClient.publish(topic, payload);
    if (ok) {
        Serial.printf("[MQTT] 🚀 Telemetry Published -> %s: %s\n", topic, payload);
    }
    return ok;
}

bool publishState(const char* node_id, uint8_t out_state, bool online) {
    if (!mqttClient.connected()) return false;

    char topic[64];
    snprintf(topic, sizeof(topic), "greenhouse/%s/state", node_id);

    char payload[128];
    snprintf(payload, sizeof(payload),
             "{\"node_id\":\"%s\",\"output\":%d,\"online\":%s}",
             node_id, out_state, online ? "true" : "false");

    return mqttClient.publish(topic, payload);
}

// ส่งต่อคำสั่งจาก MQTT ไปยังโหนดลูกผ่าน ESP-NOW
void sendEspNowCommand(const char* target_node_id, uint32_t cmd_id, uint8_t output) {
    EspNowPayload payload;
    memset(&payload, 0, sizeof(payload));
    strncpy(payload.node_id, target_node_id, sizeof(payload.node_id) - 1);
    payload.msg_type = MSG_TYPE_COMMAND;
    payload.analog = 0;
    payload.digital = 0;
    payload.output = output;
    payload.seq = 0;
    payload.command_id = cmd_id;

    uint8_t target_mac[6];
#if USE_BROADCAST_ESPNOW
    memcpy(target_mac, BROADCAST_MAC_ADDRESS, 6);
#else
    if (strcmp(target_node_id, "bed_a") == 0) memcpy(target_mac, MAC_BED_A, 6);
    else if (strcmp(target_node_id, "bed_b") == 0) memcpy(target_mac, MAC_BED_B, 6);
    else if (strcmp(target_node_id, "climate") == 0) memcpy(target_mac, MAC_CLIMATE, 6);
    else memcpy(target_mac, BROADCAST_MAC_ADDRESS, 6);
#endif

    esp_err_t res = esp_now_send(target_mac, (uint8_t*)&payload, sizeof(payload));
    Serial.printf("[Gateway -> ESP-NOW] Forwarded Cmd #%u to '%s' (Output=%d) Result: %d\n",
                  cmd_id, target_node_id, output, res);
}

// Callback เมื่อได้รับข้อความ Command จาก MQTT Broker
void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    char msg[length + 1];
    memcpy(msg, payload, length);
    msg[length] = '\0';

    Serial.printf("[MQTT Inbound] Topic: %s, Msg: %s\n", topic, msg);

    char target_node[32] = {0};
    if (sscanf(topic, "greenhouse/%31[^/]/command", target_node) != 1) return;

    // Simple JSON extraction for command_id and output
    uint32_t cmd_id = 0;
    uint8_t out_val = 0;
    char *cmd_ptr = strstr(msg, "\"command_id\":");
    if (cmd_ptr) sscanf(cmd_ptr, "\"command_id\":%u", &cmd_id);
    char *out_ptr = strstr(msg, "\"output\":");
    if (out_ptr) sscanf(out_ptr, "\"output\":%hhu", &out_val);

    if (strcmp(target_node, NODE_ID) == 0) {
        setGrowLight(out_val);
        remote_override_active = true;
        remote_override_start = millis();
        publishState(NODE_ID, grow_light_state, true);
        Serial.printf("[%s] Local Grow Light Command applied -> %d\n", NODE_ID, grow_light_state);
    } else {
        sendEspNowCommand(target_node, cmd_id, out_val);
    }
}

void reconnectMqtt() {
    static unsigned long last_retry = 0;
    if (millis() - last_retry < 5000) return;
    last_retry = millis();

    Serial.printf("[MQTT] Connecting to broker %s:%d (ID: %s)...", MQTT_HOST, MQTT_PORT, mqttClientId.c_str());
    if (wifiClient.connected()) wifiClient.stop();

    if (mqttClient.connect(mqttClientId.c_str(), MQTT_USER, MQTT_PASS)) {
        Serial.println(" Connected! ✅");
        mqttClient.subscribe("greenhouse/+/command");
        Serial.println("[MQTT] Subscribed to greenhouse/+/command");
    } else {
        Serial.printf(" Failed, rc=%d. Will retry in 5s\n", mqttClient.state());
    }
}

// ============================================================================
// ฟังก์ชันสื่อสาร ESP-NOW Gateway
// ============================================================================

#if (defined(ESP_ARDUINO_VERSION_MAJOR) && (ESP_ARDUINO_VERSION_MAJOR >= 3)) || (defined(ESP_IDF_VERSION_MAJOR) && (ESP_IDF_VERSION_MAJOR >= 5))
void onEspNowRecv(const esp_now_recv_info_t *recv_info, const uint8_t *incomingData, int len) {
    const uint8_t *mac = recv_info ? recv_info->src_addr : nullptr;
#else
void onEspNowRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
#endif
    if (len < (int)sizeof(EspNowPayload)) return;

    EspNowPayload payload;
    memcpy(&payload, incomingData, sizeof(EspNowPayload));

    Serial.printf("[Gateway ESP-NOW] 📥 Recv from '%s': Analog=%.1f, Digital=%d, Out=%d (Seq #%u)\n",
                  payload.node_id, payload.analog, payload.digital, payload.output, payload.seq);

    if (payload.msg_type == MSG_TYPE_TELEMETRY) {
        if (telemetry_queue != nullptr) {
            if (xQueueSend(telemetry_queue, &payload, 0) != pdTRUE) {
                Serial.printf("[Gateway] ⚠️ Telemetry Queue Full! Dropped packet from %s\n", payload.node_id);
            }
        }
    } else if (payload.msg_type == MSG_TYPE_STATE) {
        if (state_queue != nullptr) {
            xQueueSend(state_queue, &payload, 0);
        }
    }
}

void initEspNowGateway() {
    if (esp_now_init() != ESP_OK) {
        Serial.println("[Gateway] ❌ ESP-NOW Gateway init failed!");
        return;
    }
    Serial.println("[Gateway] ✅ ESP-NOW Gateway Initialized");

    esp_now_register_recv_cb(onEspNowRecv);

    // เพิ่ม Broadcast Peer ไว้สำหรับส่งคำสั่ง
    esp_now_peer_info_t peerInfo;
    memset(&peerInfo, 0, sizeof(peerInfo));
    peerInfo.channel = WiFi.channel();
    peerInfo.encrypt = false;
    memcpy(peerInfo.peer_addr, BROADCAST_MAC_ADDRESS, 6);
    esp_now_add_peer(&peerInfo);
}

// ============================================================================
// Arduino IDE Standard Setup & Loop
// ============================================================================

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(500);
    Serial.println("\n=======================================================");
    Serial.println("  [GreenMesh] ESP32 #4: Master Gateway Node (Arduino IDE)");
    Serial.println("=======================================================");

    telemetry_queue = xQueueCreate(20, sizeof(EspNowPayload));
    state_queue = xQueueCreate(10, sizeof(EspNowPayload));

    pinMode(PIN_ANALOG_DEFAULT, INPUT);
    pinMode(PIN_DIGITAL_DEFAULT, INPUT_PULLUP);
    pinMode(PIN_OUTPUT_DEFAULT, OUTPUT);
    digitalWrite(PIN_OUTPUT_DEFAULT, LOW);

    // 1. เชื่อมต่อ Wi-Fi
    WiFi.mode(WIFI_STA);
#if WOKWI_SIMULATION
    esp_wifi_set_mac(WIFI_IF_STA, const_cast<uint8_t*>(MAC_MASTER));
#endif
    Serial.printf("[Wi-Fi] Connecting to '%s'...\n", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 25) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[Wi-Fi] Connected! IP: %s (Channel: %d)\n",
                      WiFi.localIP().toString().c_str(), WiFi.channel());
    } else {
        Serial.println("\n[Wi-Fi] Connection failed or timed out (will retry)");
    }

    // 2. เริ่มต้น MQTT Client
    mqttClientId = "ESP32-Gateway-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    mqttClient.setServer(MQTT_HOST, MQTT_PORT);
    mqttClient.setCallback(onMqttMessage);
    mqttClient.setBufferSize(512);

    // 3. เริ่มต้น ESP-NOW
    initEspNowGateway();
}

void loop() {
    unsigned long now = millis();

    // จัดการการเชื่อมต่อ Wi-Fi และ MQTT
    if (WiFi.status() == WL_CONNECTED) {
        if (!mqttClient.connected()) {
            reconnectMqtt();
        } else {
            mqttClient.loop();
        }
    } else {
        static unsigned long last_wifi_reconnect = 0;
        if (now - last_wifi_reconnect > 5000) {
            last_wifi_reconnect = now;
            WiFi.reconnect();
        }
    }

    // ดึงแพ็กเก็ต Telemetry จากโหนดลูกใน FreeRTOS Queue ส่งขึ้น MQTT
    EspNowPayload item;
    while (telemetry_queue != nullptr && xQueueReceive(telemetry_queue, &item, 0) == pdTRUE) {
        publishTelemetry(item.node_id, item.analog, item.digital, item.output, item.seq);
        mqttClient.loop();
        delay(5);
    }

    // ดึง State ACK จากโหนดลูกในคิวส่งขึ้น MQTT
    while (state_queue != nullptr && xQueueReceive(state_queue, &item, 0) == pdTRUE) {
        publishState(item.node_id, item.output, true);
        mqttClient.loop();
        delay(5);
    }

    // ตรวจสอบระดับแสงและสวิตช์น้ำต่ำของตัวเอง
    float light = readLight(); // ใช้งาน analogRead()

    // 1. ตรวจสอบสวิตช์น้ำต่ำ (ใช้งาน digitalRead())
    int reading = digitalRead(PIN_DIGITAL_DEFAULT);
    if (reading != last_raw_button) {
        last_debounce_time = now;
        last_raw_button = reading;
    }

    if ((now - last_debounce_time) >= BUTTON_DEBOUNCE_MS) {
        if (reading != debounced_button) {
            debounced_button = reading;
            if (debounced_button == LOW) {
                water_low = water_low ? 0 : 1; // สลับสถานะน้ำต่ำ
                triggerFeedbackBlink(now);
                Serial.printf("[%s] 🚨 Toggle Water Status -> %s (%d)\n",
                              NODE_ID, water_low ? "น้ำต่ำฉุกเฉิน (Alert)" : "ระดับน้ำปกติ (Normal)", water_low);
            }
        }
    }

    if (feedback_blink_active) {
        if (now >= feedback_blink_end) {
            feedback_blink_active = false;
            digitalWrite(PIN_OUTPUT_DEFAULT, grow_light_state ? HIGH : LOW);
        }
    }

    if (remote_override_active && (now - remote_override_start >= MANUAL_OVERRIDE_TIMEOUT)) {
        remote_override_active = false;
        Serial.printf("[%s] ℹ️ Manual Override expired. Returning to local auto mode\n", NODE_ID);
    }

    // 2. ลอจิกเปิด-ปิดไฟปลูกพืชอัตโนมัติตามระดับแสง (Section 8)
    if (!remote_override_active) {
        if (light < THRESHOLD_LIGHT_MIN) {
            if (grow_light_state == 0) {
                setGrowLight(1); // ใช้งาน digitalWrite()
                Serial.printf("[%s] 💡 แสงน้อย (%.1f%% < %.1f%%) -> เปิดไฟปลูกพืช\n",
                              NODE_ID, light, THRESHOLD_LIGHT_MIN);
            }
        } else if (light > THRESHOLD_LIGHT_MAX) {
            if (grow_light_state == 1) {
                setGrowLight(0); // ใช้งาน digitalWrite()
                Serial.printf("[%s] ☀️ แสงสว่างเพียงพอ (%.1f%% > %.1f%%) -> ปิดไฟปลูกพืช\n",
                              NODE_ID, light, THRESHOLD_LIGHT_MAX);
            }
        }
    }

    // 3. ส่งข้อมูล Telemetry ของตัวเอง (utility) ขึ้น MQTT ทุกๆ 2 วินาที
    static unsigned long last_telemetry_time = 0;
    if (now - last_telemetry_time >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_time = now;
        local_seq++;
        publishTelemetry(NODE_ID, light, water_low, grow_light_state, local_seq);
    }

    delay(20);
}
