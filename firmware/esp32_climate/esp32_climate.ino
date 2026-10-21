/**
 * ============================================================================
 * โครงงาน: GreenMesh - Smart Greenhouse System (ESP32 #3: Climate Node)
 * วิชา: 305432 Sensor Network Term Project
 * หน้าที่: ตรวจวัดอุณหภูมิโรงเรือน, ปุ่มขอเปิดพัดลมเฉพาะจุด, และควบคุมพัดลม
 * 
 * ข้อกำหนดตามโจทย์:
 *  - ใช้งาน analogRead() อ่านค่าอุณหภูมิจำลองจาก Potentiometer ที่ GPIO 34 (ADC1)
 *  - ใช้งาน digitalRead() อ่านค่าปุ่มกดขอเปิดพัดลมที่ GPIO 25 (Digital In)
 *  - ใช้งาน digitalWrite() ควบคุมหลอด LED แสดงสถานะพัดลมระบายอากาศที่ GPIO 2 (Output)
 *  - ใช้งานการสื่อสารโปรโตคอล ESP-NOW ส่ง Telemetry และรับคำสั่งควบคุม
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

#include "config.h"
#include "protocol.h"

#define NODE_ID "climate"

// --- ตัวแปรและสถานะประจำโหนด ---
static uint8_t  fan_state = 0;            // 0 = พัดลมหยุด, 1 = พัดลมหมุน
static int      last_raw_button = HIGH;
static int      debounced_button = HIGH;
static unsigned long last_debounce_time = 0;

static uint8_t  fan_request_flag = 0;
static bool     manual_pulse_active = false;
static unsigned long manual_pulse_start = 0;

static bool     remote_override_active = false;
static unsigned long remote_override_start = 0;

static uint32_t packet_seq = 0;
static uint8_t  target_mac[6];

// ============================================================================
// ฟังก์ชันอ่านค่าและควบคุม I/O ฮาร์ดแวร์ตามโจทย์
// ============================================================================

// ข้อ 8.5: ใช้งาน analogRead() อ่านค่า Analog Input (อุณหภูมิ 15.0 - 50.0 °C)
float readTemperature() {
    int raw_analog = analogRead(PIN_ANALOG_DEFAULT);      // GPIO 34 (ADC1 0-4095)
    return 15.0f + (raw_analog / 4095.0f) * 35.0f;       // คำนวณเป็น 15.0 - 50.0 °C
}

// ข้อ 8.6: ใช้งาน digitalRead() อ่านค่า Digital Input (ปุ่มขอเปิดพัดลม)
uint8_t readFanRequest() {
    return (debounced_button == LOW || manual_pulse_active || fan_request_flag) ? 1 : 0;
}

// ข้อ 8.7: ใช้งาน digitalWrite() ควบคุม Digital Output (LED พัดลม)
void setFanState(uint8_t state) {
    fan_state = state ? 1 : 0;
    digitalWrite(PIN_OUTPUT_DEFAULT, fan_state ? HIGH : LOW); // GPIO 2
}

// ============================================================================
// ฟังก์ชันสื่อสาร ESP-NOW
// ============================================================================

void sendTelemetry(float analog_val, uint8_t digital_val, uint8_t out_state) {
    packet_seq++;
    EspNowPayload payload;
    memset(&payload, 0, sizeof(payload));
    strncpy(payload.node_id, NODE_ID, sizeof(payload.node_id) - 1);
    payload.msg_type = MSG_TYPE_TELEMETRY;
    payload.analog = analog_val;
    payload.digital = digital_val;
    payload.output = out_state;
    payload.seq = packet_seq;
    payload.command_id = 0;

    esp_err_t result = esp_now_send(target_mac, (uint8_t*)&payload, sizeof(payload));
    if (result == ESP_OK) {
        Serial.printf("[%s] 📡 Telemetry #%u Sent: Temp=%.1f°C, FanReq=%d, FanLED=%d\n",
                      NODE_ID, packet_seq, analog_val, digital_val, out_state);
    } else {
        Serial.printf("[%s] ❌ Telemetry send failed! Error code: %d\n", NODE_ID, result);
    }
}

void sendStateAck(uint32_t cmd_id, uint8_t current_state) {
    EspNowPayload payload;
    memset(&payload, 0, sizeof(payload));
    strncpy(payload.node_id, NODE_ID, sizeof(payload.node_id) - 1);
    payload.msg_type = MSG_TYPE_STATE;
    payload.analog = readTemperature();
    payload.digital = readFanRequest();
    payload.output = current_state;
    payload.seq = ++packet_seq;
    payload.command_id = cmd_id;

    esp_now_send(target_mac, (uint8_t*)&payload, sizeof(payload));
    Serial.printf("[%s] 📤 Sent State ACK for Cmd #%u: Fan=%d\n", NODE_ID, cmd_id, current_state);
}

void onDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
    if (len < (int)sizeof(EspNowPayload)) return;

    EspNowPayload payload;
    memcpy(&payload, incomingData, sizeof(EspNowPayload));

    if (payload.msg_type == MSG_TYPE_COMMAND) {
        if (strcmp(payload.node_id, NODE_ID) == 0 || strcmp(payload.node_id, "all") == 0) {
            Serial.printf("[%s] 📥 Inbound Command: Cmd #%u, Output=%d\n",
                          NODE_ID, payload.command_id, payload.output);
            
            setFanState(payload.output);
            remote_override_active = true;
            remote_override_start = millis();
            if (payload.output == 0) {
                manual_pulse_active = false;
                fan_request_flag = 0;
            }
            
            sendStateAck(payload.command_id, fan_state);
        }
    }
}

void initEspNow() {
    WiFi.mode(WIFI_STA);

#if WOKWI_SIMULATION
    esp_wifi_set_mac(WIFI_IF_STA, const_cast<uint8_t*>(MAC_CLIMATE));
#endif

    uint8_t channel = ESPNOW_WIFI_CHANNEL;
#if !WOKWI_SIMULATION
    if (strlen(WIFI_SSID) > 0) {
        Serial.printf("[%s] 🔍 Scanning Wi-Fi to locate AP '%s'...\n", NODE_ID, WIFI_SSID);
        int n = WiFi.scanNetworks(false, false, false, 150);
        for (int i = 0; i < n; i++) {
            if (WiFi.SSID(i) == WIFI_SSID) {
                channel = WiFi.channel(i);
                Serial.printf("[%s] ✅ Found AP '%s' on Channel %d\n", NODE_ID, WIFI_SSID, channel);
                break;
            }
        }
        WiFi.scanDelete();
    }
#endif

    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(channel, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);

    if (esp_now_init() != ESP_OK) {
        Serial.printf("[%s] ❌ ESP-NOW init failed!\n", NODE_ID);
        return;
    }
    Serial.printf("[%s] ✅ ESP-NOW Initialized on Channel %d\n", NODE_ID, channel);

    esp_now_register_recv_cb(onDataRecv);

    esp_now_peer_info_t peerInfo;
    memset(&peerInfo, 0, sizeof(peerInfo));
    peerInfo.channel = channel;
    peerInfo.encrypt = false;

#if USE_BROADCAST_ESPNOW
    memcpy(target_mac, BROADCAST_MAC_ADDRESS, 6);
#else
    memcpy(target_mac, MASTER_MAC_ADDRESS, 6);
#endif
    memcpy(peerInfo.peer_addr, target_mac, 6);

    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        Serial.printf("[%s] ⚠️ Failed to add ESP-NOW peer\n", NODE_ID);
    }
}

// ============================================================================
// Arduino IDE Standard Setup & Loop
// ============================================================================

void setup() {
    Serial.begin(SERIAL_BAUD_RATE);
    delay(500);
    Serial.println("\n=======================================================");
    Serial.println("  [GreenMesh] ESP32 #3: Climate Node Starting (Arduino IDE)");
    Serial.println("=======================================================");

    pinMode(PIN_ANALOG_DEFAULT, INPUT);
    pinMode(PIN_DIGITAL_DEFAULT, INPUT_PULLUP);
    pinMode(PIN_OUTPUT_DEFAULT, OUTPUT);
    digitalWrite(PIN_OUTPUT_DEFAULT, LOW);

    initEspNow();
}

void loop() {
    unsigned long now = millis();
    float temp = readTemperature(); // ใช้งาน analogRead()

    // 1. ตรวจสอบและ Debounce ปุ่มกดขอเปิดพัดลมเฉพาะจุด (ใช้งาน digitalRead())
    int reading = digitalRead(PIN_DIGITAL_DEFAULT);
    if (reading != last_raw_button) {
        last_debounce_time = now;
        last_raw_button = reading;
    }

    if ((now - last_debounce_time) >= BUTTON_DEBOUNCE_MS) {
        if (reading != debounced_button) {
            debounced_button = reading;
            if (debounced_button == LOW) { // มีการกดปุ่มขอเปิดพัดลม
                manual_pulse_active = true;
                manual_pulse_start = now;
                fan_request_flag = 1;
                setFanState(1); // ใช้งาน digitalWrite() เปิดพัดลมทันที
                Serial.printf("[%s] 🔘 กดปุ่มขอเปิดพัดลมเฉพาะจุด! เปิดทำงานชั่วคราว %d วินาที\n",
                              NODE_ID, MANUAL_FAN_PULSE_MS / 1000);
            }
        }
    }

    // จัดการหน่วงเวลาดับพัดลมเมื่อครบ 15 วินาทีจากการกดปุ่มขอเปิดพัดลม
    if (manual_pulse_active && (now - manual_pulse_start >= MANUAL_FAN_PULSE_MS)) {
        manual_pulse_active = false;
        fan_request_flag = 0;
        Serial.printf("[%s] ⏱️ หมดเวลา Pulse พัดลมเฉพาะจุด (15s) -> คืนสู่การควบคุมอัตโนมัติ\n", NODE_ID);
    }

    // เคลียร์ Manual Override จากเกตเวย์เมื่อครบ 30 วินาที
    if (remote_override_active && (now - remote_override_start >= MANUAL_OVERRIDE_TIMEOUT)) {
        remote_override_active = false;
        Serial.printf("[%s] ℹ️ Manual Override expired. Returning to local auto mode\n", NODE_ID);
    }

    // 2. ลอจิกควบคุมพัดลมระบายอากาศอัตโนมัติตามอุณหภูมิ (Section 8)
    if (!remote_override_active && !manual_pulse_active) {
        if (temp > THRESHOLD_TEMP_HIGH) {
            if (fan_state == 0) {
                setFanState(1); // ใช้งาน digitalWrite()
                Serial.printf("[%s] 🌡️ อุณหภูมิสูง (%.1f°C > %.1f°C) -> เปิดพัดลม\n",
                              NODE_ID, temp, THRESHOLD_TEMP_HIGH);
            }
        } else if (temp < THRESHOLD_TEMP_LOW) {
            if (fan_state == 1) {
                setFanState(0); // ใช้งาน digitalWrite()
                Serial.printf("[%s] ❄️ อุณหภูมิเย็น (%.1f°C < %.1f°C) -> ปิดพัดลม\n",
                              NODE_ID, temp, THRESHOLD_TEMP_LOW);
            }
        }
    }

    // 3. ส่ง Telemetry ตามรอบเวลา
    static unsigned long last_telemetry_time = 0;
    if (now - last_telemetry_time >= TELEMETRY_INTERVAL_MS) {
        last_telemetry_time = now;
        sendTelemetry(temp, readFanRequest(), fan_state);
    }

    delay(20);
}
