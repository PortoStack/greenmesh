#include "espnow_client.h"
#include <WiFi.h>
#include <esp_wifi.h>

EspNowClient* EspNowClient::instance = nullptr;

EspNowClient::EspNowClient() 
    : packet_seq(0), command_cb(nullptr)
#if WOKWI_SIMULATION
    , last_mqtt_retry(0)
#endif
{
    memset(node_id, 0, sizeof(node_id));
    memset(target_mac, 0, sizeof(target_mac));
    instance = this;
}

#if WOKWI_SIMULATION
void EspNowClient::onMqttMessageStatic(char* topic, byte* payload, unsigned int length) {
    if (instance) {
        instance->handleMqttMessage(topic, payload, length);
    }
}

void EspNowClient::handleMqttMessage(char* topic, byte* payload, unsigned int length) {
    char msg[length + 1];
    memcpy(msg, payload, length);
    msg[length] = '\0';

    Serial.printf("[%s Wokwi-MQTT] Inbound Topic: %s, Payload: %s\n", node_id, topic, msg);

    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, msg);
    if (error) {
        Serial.printf("[%s] JSON parse failed: %s\n", node_id, error.c_str());
        return;
    }

    uint32_t command_id = doc["command_id"] | 0;
    uint8_t output = doc["output"] | 0;

    if (command_cb) {
        command_cb(command_id, output);
    }
}

void EspNowClient::reconnectMqtt() {
    if (WiFi.status() != WL_CONNECTED) {
        return;
    }
    if (millis() - last_mqtt_retry < 5000) return;
    last_mqtt_retry = millis();

    Serial.printf("[%s] Connecting to MQTT broker %s:%d...\n", node_id, MQTT_HOST, MQTT_PORT);
    String clientId = "ESP32-" + String(node_id) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);

    if (mqtt_client.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
        Serial.printf("[%s] Connected to MQTT Broker!\n", node_id);
        char sub_topic[64];
        snprintf(sub_topic, sizeof(sub_topic), "greenhouse/%s/command", node_id);
        mqtt_client.subscribe(sub_topic);
        Serial.printf("[%s] Subscribed to %s\n", node_id, sub_topic);
    } else {
        Serial.printf("[%s] MQTT connect failed, rc=%d. Will retry in 5s\n", node_id, mqtt_client.state());
    }
}
#endif

bool EspNowClient::init(const char* id, const uint8_t* custom_mac, CommandCallback on_cmd) {
    strncpy(node_id, id, sizeof(node_id) - 1);
    command_cb = on_cmd;

    // เริ่มต้น Wi-Fi ในโหมด Station
    WiFi.mode(WIFI_STA);

#if WOKWI_SIMULATION
    if (custom_mac != nullptr) {
        esp_wifi_set_mac(WIFI_IF_STA, const_cast<uint8_t*>(custom_mac));
    }
#endif

    uint8_t active_channel = ESPNOW_WIFI_CHANNEL;

#if !WOKWI_SIMULATION
    // สำหรับฮาร์ดแวร์จริง: สแกนหาช่องสัญญาณของ Wi-Fi AP (WIFI_SSID) เพื่อจูนความถี่ให้ตรงกับ Gateway อัตโนมัติ
    if (strlen(WIFI_SSID) > 0) {
        Serial.printf("[%s] 🔍 Scanning Wi-Fi to locate AP '%s'...\n", node_id, WIFI_SSID);
        int n = WiFi.scanNetworks(false, false, false, 150);
        bool found = false;
        for (int i = 0; i < n; i++) {
            if (WiFi.SSID(i) == WIFI_SSID) {
                active_channel = WiFi.channel(i);
                found = true;
                Serial.printf("[%s] ✅ Found AP '%s' on Channel %d (RSSI: %d dBm)\n",
                              node_id, WIFI_SSID, active_channel, WiFi.RSSI(i));
                break;
            }
        }
        WiFi.scanDelete();
        if (!found) {
            Serial.printf("[%s] ⚠️ AP '%s' not found. Falling back to default Channel %d\n",
                          node_id, WIFI_SSID, ESPNOW_WIFI_CHANNEL);
        }
    }
#endif

    // บังคับกำหนด Wi-Fi Channel
    esp_wifi_set_promiscuous(true);
    esp_wifi_set_channel(active_channel, WIFI_SECOND_CHAN_NONE);
    esp_wifi_set_promiscuous(false);

    Serial.printf("[%s] Wi-Fi Radio Channel: %d, MAC: %s\n", 
                  node_id, active_channel, WiFi.macAddress().c_str());

    // 1. เริ่มต้น ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.printf("[%s] ESP-NOW init failed!\n", node_id);
    } else {
        esp_now_register_send_cb(EspNowClient::onDataSentStatic);
        esp_now_register_recv_cb(EspNowClient::onDataRecvStatic);

#if USE_BROADCAST_ESPNOW
        memcpy(target_mac, BROADCAST_MAC_ADDRESS, 6);
#else
        memcpy(target_mac, MASTER_MAC_ADDRESS, 6);
#endif

        memset(&peer_info, 0, sizeof(peer_info));
        memcpy(peer_info.peer_addr, target_mac, 6);
        peer_info.channel = active_channel;
        peer_info.encrypt = false;

        if (esp_now_add_peer(&peer_info) != ESP_OK) {
            Serial.printf("[%s] Failed to add ESP-NOW peer!\n", node_id);
        } else {
            Serial.printf("[%s] ESP-NOW Peer registered on Channel %d\n", node_id, active_channel);
        }
    }

#if WOKWI_SIMULATION
    // สำหรับ Wokwi Simulation: ต่อ Wi-Fi เข้า Wokwi-GUEST และเซ็ตอัป MQTT ตรง เพื่อให้ส่งข้อมูลข้ามหน้าต่าง VS Code ได้
    Serial.printf("[%s] Connecting to Wi-Fi '%s' for Wokwi multi-window simulation...\n", node_id, WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    mqtt_client.setClient(wifi_client);
    mqtt_client.setServer(MQTT_HOST, MQTT_PORT);
    mqtt_client.setCallback(EspNowClient::onMqttMessageStatic);
    mqtt_client.setBufferSize(512);
#endif

    Serial.printf("[%s] Client initialized successfully\n", node_id);
    return true;
}

void EspNowClient::loop() {
#if WOKWI_SIMULATION
    if (WiFi.status() == WL_CONNECTED) {
        if (!mqtt_client.connected()) {
            reconnectMqtt();
        } else {
            mqtt_client.loop();
        }
    }
#endif
}

bool EspNowClient::sendTelemetry(float analog, uint8_t digital, uint8_t output) {
    packet_seq++;

    // 1. ส่งผ่าน ESP-NOW
    EspNowPayload payload;
    memset(&payload, 0, sizeof(payload));
    strncpy(payload.node_id, node_id, sizeof(payload.node_id) - 1);
    payload.msg_type = MSG_TYPE_TELEMETRY;
    payload.analog = analog;
    payload.digital = digital;
    payload.output = output;
    payload.seq = packet_seq;

    esp_now_send(target_mac, (uint8_t*)&payload, sizeof(payload));
    Serial.printf("[%s] Telemetry sent: Analog=%.1f, Digital=%d, Output=%d (seq=%u)\n",
                  node_id, analog, digital, output, packet_seq);

#if WOKWI_SIMULATION
    // 2. ถ้าอยู่ในโหมด Wokwi Simulation ให้ส่งขึ้น MQTT ไปยัง Server ด้วย
    if (mqtt_client.connected()) {
        char topic[64];
        snprintf(topic, sizeof(topic), "greenhouse/%s/telemetry", node_id);

        StaticJsonDocument<256> doc;
        doc["node_id"] = node_id;
        doc["analog"] = serialized(String(analog, 1));
        doc["digital"] = digital;
        doc["output"] = output;
        doc["seq"] = packet_seq;

        char buffer[256];
        size_t len = serializeJson(doc, buffer);
        mqtt_client.publish(topic, buffer, len);
    }
#endif

    return true;
}

bool EspNowClient::sendStateAck(uint32_t command_id, uint8_t output) {
    // 1. ส่งผ่าน ESP-NOW
    EspNowPayload ack;
    memset(&ack, 0, sizeof(ack));
    strncpy(ack.node_id, node_id, sizeof(ack.node_id) - 1);
    ack.msg_type = MSG_TYPE_STATE;
    ack.output = output;
    ack.command_id = command_id;
    ack.seq = ++packet_seq;

    esp_now_send(target_mac, (uint8_t*)&ack, sizeof(ack));
    Serial.printf("[%s] State ACK sent: Output=%d (cmd_id=%u)\n", node_id, output, command_id);

#if WOKWI_SIMULATION
    // 2. ถ้าอยู่ในโหมด Wokwi Simulation ให้ส่ง State ขึ้น MQTT ด้วย
    if (mqtt_client.connected()) {
        char topic[64];
        snprintf(topic, sizeof(topic), "greenhouse/%s/state", node_id);

        StaticJsonDocument<256> doc;
        doc["node_id"] = node_id;
        doc["output"] = output;
        doc["online"] = true;

        char buffer[256];
        size_t len = serializeJson(doc, buffer);
        mqtt_client.publish(topic, buffer, len);
    }
#endif

    return true;
}

void EspNowClient::onDataRecvStatic(const uint8_t *mac, const uint8_t *data, int len) {
    if (instance) {
        instance->handleDataRecv(mac, data, len);
    }
}

void EspNowClient::onDataSentStatic(const uint8_t *mac, esp_now_send_status_t status) {
    // Send status callback
}

void EspNowClient::handleDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
    if (len != sizeof(EspNowPayload)) {
        return;
    }

    EspNowPayload incoming;
    memcpy(&incoming, data, sizeof(EspNowPayload));

    // ตรวจสอบว่าเป็นข้อความ Command ที่ส่งมายังโหนดตัวเองหรือไม่
    if (strcmp(incoming.node_id, node_id) == 0 && incoming.msg_type == MSG_TYPE_COMMAND) {
        Serial.printf("[%s] Inbound ESP-NOW Command #%u: Set Output -> %d\n", node_id, incoming.command_id, incoming.output);
        if (command_cb) {
            command_cb(incoming.command_id, incoming.output);
        }
    }
}
