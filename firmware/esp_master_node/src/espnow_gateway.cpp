#include "espnow_gateway.h"
#include <WiFi.h>
#include <esp_wifi.h>

EspNowGateway* EspNowGateway::instance = nullptr;

EspNowGateway::EspNowGateway() 
    : telemetry_cb(nullptr), state_cb(nullptr), command_seq(0) {
    instance = this;
}

bool EspNowGateway::init(GatewayTelemetryCallback on_telemetry, GatewayStateCallback on_state) {
    telemetry_cb = on_telemetry;
    state_cb = on_state;

    // เริ่มต้น ESP-NOW
    if (esp_now_init() != ESP_OK) {
        Serial.println("[ESP-NOW Gateway] Failed to initialize ESP-NOW");
        return false;
    }

    esp_now_register_recv_cb(EspNowGateway::onDataRecvStatic);
    esp_now_register_send_cb(EspNowGateway::onDataSentStatic);

    // ดึง Channel ปัจจุบันของ Wi-Fi ที่เกตเวย์กำลังใช้งาน
    uint8_t active_channel = WiFi.channel();
    if (active_channel == 0) {
        active_channel = ESPNOW_WIFI_CHANNEL;
    }

    // ลงทะเบียน Broadcast Peer
    memset(&broadcast_peer, 0, sizeof(broadcast_peer));
    memcpy(broadcast_peer.peer_addr, BROADCAST_MAC_ADDRESS, 6);
    broadcast_peer.channel = active_channel;
    broadcast_peer.encrypt = false;

    if (esp_now_add_peer(&broadcast_peer) != ESP_OK) {
        Serial.printf("[ESP-NOW Gateway] Failed to add broadcast peer on channel %d\n", active_channel);
        return false;
    }

    Serial.printf("[ESP-NOW Gateway] Initialized on Wi-Fi Channel: %d (MAC: %s)\n",
                  active_channel, WiFi.macAddress().c_str());
    return true;
}

bool EspNowGateway::sendCommand(const char* target_node_id, uint32_t command_id, uint8_t output) {
    EspNowPayload cmd;
    memset(&cmd, 0, sizeof(cmd));
    strncpy(cmd.node_id, target_node_id, sizeof(cmd.node_id) - 1);
    cmd.msg_type = MSG_TYPE_COMMAND;
    cmd.output = output;
    cmd.command_id = command_id;
    cmd.seq = ++command_seq;

    esp_err_t res = esp_now_send(BROADCAST_MAC_ADDRESS, (uint8_t*)&cmd, sizeof(cmd));
    if (res == ESP_OK) {
        Serial.printf("[ESP-NOW Gateway] Dispatched command #%u to %s (output=%d)\n", 
                      command_id, target_node_id, output);
        return true;
    } else {
        Serial.printf("[ESP-NOW Gateway] Error dispatching command to %s (err=0x%x)\n", 
                      target_node_id, res);
        return false;
    }
}

void EspNowGateway::onDataRecvStatic(const uint8_t *mac, const uint8_t *data, int len) {
    if (instance) {
        instance->handleDataRecv(mac, data, len);
    }
}

void EspNowGateway::onDataSentStatic(const uint8_t *mac, esp_now_send_status_t status) {
    // Status tracking if needed
}

void EspNowGateway::handleDataRecv(const uint8_t *mac, const uint8_t *data, int len) {
    if (len != sizeof(EspNowPayload)) {
        return;
    }

    EspNowPayload payload;
    memcpy(&payload, data, sizeof(EspNowPayload));

    if (payload.msg_type == MSG_TYPE_TELEMETRY && telemetry_cb) {
        telemetry_cb(payload);
    } else if (payload.msg_type == MSG_TYPE_STATE && state_cb) {
        state_cb(payload);
    }
}
