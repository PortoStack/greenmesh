#ifndef MQTT_BRIDGE_H
#define MQTT_BRIDGE_H

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <functional>
#include "protocol.h"
#include "config.h"

// Callback เมื่อมีคำสั่งส่งมาจาก MQTT ถึงโหนดใดๆ
typedef std::function<void(const char* target_node_id, uint32_t command_id, uint8_t output)> MqttCommandCallback;

class MqttBridge {
public:
    static MqttBridge& getInstance();

    void init(MqttCommandCallback on_cmd);
    void connectWifi();
    void loop();

    bool publishTelemetry(const char* node_id, float analog, uint8_t digital, uint8_t output, uint32_t seq);
    bool publishState(const char* node_id, uint8_t output, bool online = true);

private:
    MqttBridge();
    void reconnectMqtt();
    static void onMessageStatic(char* topic, byte* payload, unsigned int length);
    void handleMessage(char* topic, byte* payload, unsigned int length);

    WiFiClient wifi_client;
    PubSubClient mqtt_client;
    MqttCommandCallback command_cb;
};

#endif // MQTT_BRIDGE_H
