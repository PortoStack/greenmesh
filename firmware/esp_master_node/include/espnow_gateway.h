#ifndef ESPNOW_GATEWAY_H
#define ESPNOW_GATEWAY_H

#include <Arduino.h>
#include <functional>
#include <esp_now.h>
#include "protocol.h"
#include "config.h"

typedef std::function<void(const EspNowPayload& payload)> GatewayTelemetryCallback;
typedef std::function<void(const EspNowPayload& payload)> GatewayStateCallback;

class EspNowGateway {
public:
    EspNowGateway();
    bool init(GatewayTelemetryCallback on_telemetry, GatewayStateCallback on_state);
    bool sendCommand(const char* target_node_id, uint32_t command_id, uint8_t output);

private:
    static void onDataRecvStatic(const uint8_t *mac, const uint8_t *data, int len);
    static void onDataSentStatic(const uint8_t *mac, esp_now_send_status_t status);
    void handleDataRecv(const uint8_t *mac, const uint8_t *data, int len);

    static EspNowGateway* instance;
    GatewayTelemetryCallback telemetry_cb;
    GatewayStateCallback state_cb;
    esp_now_peer_info_t broadcast_peer;
    uint32_t command_seq;
};

#endif // ESPNOW_GATEWAY_H
