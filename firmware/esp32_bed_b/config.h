#ifndef GREENMESH_CONFIG_H
#define GREENMESH_CONFIG_H

#include <stdint.h>

#define WOKWI_SIMULATION 0

#if WOKWI_SIMULATION
#define ESPNOW_WIFI_CHANNEL 6
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""
#define MQTT_HOST "broker.emqx.io"
#define MQTT_PORT 1883
#define MQTT_USER ""
#define MQTT_PASS ""
#else
#define ESPNOW_WIFI_CHANNEL 1
#define WIFI_SSID "robot_club"
#define WIFI_PASSWORD "robot123"
#define MQTT_HOST "192.168.7.129"
#define MQTT_PORT 1883
#define MQTT_USER ""
#define MQTT_PASS ""
#endif

#define USE_BROADCAST_ESPNOW 1

static const uint8_t BROADCAST_MAC_ADDRESS[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
static const uint8_t MAC_BED_B[6] = {0x02, 0x00, 0x00, 0x00, 0x00, 0x02};
static const uint8_t MASTER_MAC_ADDRESS[6] = {0x02, 0x00, 0x00, 0x00, 0x00, 0x04};

#define PIN_ANALOG_DEFAULT  34 // ADC1_CH6 - ตัวต้านทานปรับค่าความชื้นดิน B
#define PIN_DIGITAL_DEFAULT 25 // Digital In - สวิตช์ตรวจพบกระถาง B
#define PIN_OUTPUT_DEFAULT  2  // Digital Out - LED แสดงสถานะวาล์ว B

#define TELEMETRY_INTERVAL_MS 2000
#define BUTTON_DEBOUNCE_MS    50
#define SERIAL_BAUD_RATE      115200

#define THRESHOLD_MOISTURE_B_MIN 35.0f // % ความชื้นต่ำ เปิดวาล์ว B
#define THRESHOLD_MOISTURE_B_MAX 45.0f // % ความชื้นเป้าหมาย ปิดวาล์ว B
#define MANUAL_OVERRIDE_TIMEOUT  30000

#endif // GREENMESH_CONFIG_H
