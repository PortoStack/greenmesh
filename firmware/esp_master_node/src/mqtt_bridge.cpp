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
    if (!mqtt_client.connected()) return false;

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

    return mqtt_client.publish(topic, buffer, len);
}

bool MqttBridge::publishState(const char* node_id, uint8_t output, bool online) {
    if (!mqtt_client.connected()) return false;

    char topic[64];
    snprintf(topic, sizeof(topic), "greenhouse/%s/state", node_id);

    StaticJsonDocument<256> doc;
    doc["node_id"] = node_id;
    doc["output"] = output;
    doc["online"] = online;

    char buffer[256];
    size_t len = serializeJson(doc, buffer);

    return mqtt_client.publish(topic, buffer, len);
}

void MqttBridge::reconnectMqtt() {
    static unsigned long last_mqtt_retry = 0;
    if (millis() - last_mqtt_retry < 5000) return;
    last_mqtt_retry = millis();

    Serial.printf("[MQTT] Connecting to broker %s:%d...", MQTT_HOST, MQTT_PORT);
    String clientId = "ESP32-Gateway-" + String((uint32_t)ESP.getEfuseMac(), HEX);

    if (mqtt_client.connect(clientId.c_str(), MQTT_USER, MQTT_PASS)) {
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

    uint32_t command_id = doc["command_id"] | 0;
    uint8_t output = doc["output"] | 0;

    if (command_cb) {
        command_cb(node_id, command_id, output);
    }
}
