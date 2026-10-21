#include "mqtt_bridge.h"
#include <esp_wifi.h>
#include <ArduinoJson.h>

MqttBridge& MqttBridge::getInstance() {
    static MqttBridge instance;
    return instance;
}

MqttBridge::MqttBridge() 
    : command_cb(nullptr) {}

void MqttBridge::init(MqttCommandCallback on_cmd) {
    command_cb = on_cmd;
    mqtt_client.setClient(wifi_client);
    mqtt_client.setServer(MQTT_HOST, MQTT_PORT);
    mqtt_client.setCallback(MqttBridge::onMessageStatic);
    mqtt_client.setBufferSize(512);
    mqtt_client.setKeepAlive(30);
    mqtt_client.setSocketTimeout(15); // เพิ่ม timeout เป็น 15 วินาที เพื่อลดปัญหาเน็ตสะดุดแล้วตัดการเชื่อมต่อ

    // กำหนด Client ID คงที่ตลอดรอบการบูตนี้ (สุ่มรหัสเซสชันครั้งเดียวตอนบูต)
    client_id = "ESP32-Gateway-" + String((uint32_t)ESP.getEfuseMac(), HEX) + "-" + String(random(0x1000, 0xFFFF), HEX);
    Serial.printf("[MQTT] Initialized with Client ID: %s\n", client_id.c_str());
}

void MqttBridge::connectWifi() {
    Serial.printf("[Wi-Fi] Connecting to '%s'...\n", WIFI_SSID);
    WiFi.mode(WIFI_STA);

#if WOKWI_SIMULATION
    esp_wifi_set_mac(WIFI_IF_STA, const_cast<uint8_t*>(MAC_MASTER));
#endif

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
        Serial.println("\n[Wi-Fi] Connect failed or timed out (will retry in loop)");
    }
}

void MqttBridge::loop() {
    if (WiFi.status() != WL_CONNECTED) {
        static unsigned long last_wifi_retry = 0;
        if (millis() - last_wifi_retry > 5000) {
            last_wifi_retry = millis();
            WiFi.reconnect();
        }
        return;
    }

    if (!mqtt_client.connected()) {
        reconnectMqtt();
    } else {
        mqtt_client.loop();
    }
}

bool MqttBridge::publishTelemetry(const char* node_id, float analog, uint8_t digital, uint8_t output, uint32_t seq) {
    if (!mqtt_client.connected()) {
        Serial.printf("[MQTT] ⚠️ Cannot publish: Not connected to MQTT Broker (%s:%d)\n", MQTT_HOST, MQTT_PORT);
        return false;
    }

    char topic[64];
    snprintf(topic, sizeof(topic), "greenhouse/%s/telemetry", node_id);

    StaticJsonDocument<256> doc;
    doc["node_id"] = node_id;
    doc["analog"] = serialized(String(analog, 1));
    doc["digital"] = digital;
    doc["output"] = output;
    doc["seq"] = seq;

    char buffer[256];
    size_t len = serializeJson(doc, buffer);

    bool ok = mqtt_client.publish(topic, buffer, len);
    if (ok) {
        Serial.printf("[MQTT] 🚀 Published to %s: %s\n", topic, buffer);
    } else {
        Serial.printf("[MQTT] ❌ Failed to publish to %s\n", topic);
    }
    return ok;
}

bool MqttBridge::publishState(const char* node_id, uint8_t output, bool online) {
    if (!mqtt_client.connected()) {
        Serial.printf("[MQTT] ⚠️ Cannot publish: Not connected to MQTT Broker (%s:%d)\n", MQTT_HOST, MQTT_PORT);
        return false;
    }

    char topic[64];
    snprintf(topic, sizeof(topic), "greenhouse/%s/state", node_id);

    StaticJsonDocument<256> doc;
    doc["node_id"] = node_id;
    doc["output"] = output;
    doc["online"] = online;

    char buffer[256];
    size_t len = serializeJson(doc, buffer);

    bool ok = mqtt_client.publish(topic, buffer, len);
    if (ok) {
        Serial.printf("[MQTT] 🚀 Published State to %s: %s\n", topic, buffer);
    } else {
        Serial.printf("[MQTT] ❌ Failed to publish State to %s\n", topic);
    }
    return ok;
}

void MqttBridge::reconnectMqtt() {
    static unsigned long last_mqtt_retry = 0;
    if (millis() - last_mqtt_retry < 5000) return;
    last_mqtt_retry = millis();

    Serial.printf("[MQTT] Connecting to broker %s:%d (ID: %s)...", MQTT_HOST, MQTT_PORT, client_id.c_str());

    // ปิด TCP Socket เดิมอย่างปลอดภัยก่อนหากค้างอยู่
    if (wifi_client.connected()) {
        wifi_client.stop();
    }

    if (mqtt_client.connect(client_id.c_str(), MQTT_USER, MQTT_PASS)) {
        Serial.println(" Connected!");
        mqtt_client.subscribe("greenhouse/+/command");
        Serial.println("[MQTT] Subscribed to greenhouse/+/command");
    } else {
        Serial.printf(" Failed, rc=%d. Will retry in 5s\n", mqtt_client.state());
    }
}

void MqttBridge::onMessageStatic(char* topic, byte* payload, unsigned int length) {
    getInstance().handleMessage(topic, payload, length);
}

void MqttBridge::handleMessage(char* topic, byte* payload, unsigned int length) {
    if (length >= 512) {
        Serial.println("[MQTT Inbound] ⚠️ Payload too large, ignored");
        return;
    }

    char msg[length + 1];
    memcpy(msg, payload, length);
    msg[length] = '\0';

    Serial.printf("[MQTT Inbound] Topic: %s, Payload: %s\n", topic, msg);

    char node_id[32] = {0};
    if (sscanf(topic, "greenhouse/%31[^/]/command", node_id) != 1) {
        Serial.println("[MQTT Inbound] Failed to parse node_id from topic");
        return;
    }

    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, msg);
    if (error) {
        Serial.printf("[MQTT Inbound] JSON parse failed: %s\n", error.c_str());
        return;
    }

    uint64_t raw_cmd = doc["command_id"].as<uint64_t>();
    uint32_t command_id = (raw_cmd > 0) ? (uint32_t)(raw_cmd % 1000000) : (uint32_t)(doc["command_id"] | 0);
    uint8_t output = doc["output"] | 0;

    if (command_cb) {
        command_cb(node_id, command_id, output);
    }
}
