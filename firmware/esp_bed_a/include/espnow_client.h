#ifndef ESPNOW_CLIENT_H
#define ESPNOW_CLIENT_H

#include <Arduino.h>
#include <functional>
#include <esp_now.h>
#include "protocol.h"
#include "config.h"

#if WOKWI_SIMULATION
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#endif

// ฟังก์ชัน Callback Type สำหรับรับคำสั่ง Output จาก Gateway
typedef std::function<void(uint32_t command_id, uint8_t output)> CommandCallback;

class EspNowClient {
public:
    EspNowClient();
    bool init(const char* node_id, const uint8_t* custom_mac, CommandCallback on_cmd);
    bool sendTelemetry(float analog, uint8_t digital, uint8_t output);
    bool sendStateAck(uint32_t command_id, uint8_t output);
    void loop();

private:
    static void onDataRecvStatic(const uint8_t *mac, const uint8_t *data, int len);
    static void onDataSentStatic(const uint8_t *mac, esp_now_send_status_t status);
    void handleDataRecv(const uint8_t *mac, const uint8_t *data, int len);

    static EspNowClient* instance;
    char node_id[16];
    uint8_t target_mac[6];
    uint32_t packet_seq;
    CommandCallback command_cb;
    esp_now_peer_info_t peer_info;

#if WOKWI_SIMULATION
    WiFiClient wifi_client;
    PubSubClient mqtt_client;
    unsigned long last_mqtt_retry;
    void reconnectMqtt();
    static void onMqttMessageStatic(char* topic, byte* payload, unsigned int length);
    void handleMqttMessage(char* topic, byte* payload, unsigned int length);
#endif
};

#endif // ESPNOW_CLIENT_H
