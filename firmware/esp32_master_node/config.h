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
#define ESPNOW_WIFI_CHANNEL 8
#define WIFI_SSID "robot_club"
#define WIFI_PASSWORD "robot123"
#define MQTT_HOST "192.168.7.129"
#define MQTT_PORT 1883
#define MQTT_USER ""
#define MQTT_PASS ""
#endif

#define USE_BROADCAST_ESPNOW 1

static const uint8_t BROADCAST_MAC_ADDRESS[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};
static const uint8_t MAC_BED_A[6]   = {0x02, 0x00, 0x00, 0x00, 0x00, 0x01};
static const uint8_t MAC_BED_B[6]   = {0x02, 0x00, 0x00, 0x00, 0x00, 0x02};
static const uint8_t MAC_CLIMATE[6] = {0x02, 0x00, 0x00, 0x00, 0x00, 0x03};
static const uint8_t MAC_MASTER[6]  = {0x02, 0x00, 0x00, 0x00, 0x00, 0x04};

#define PIN_ANALOG_DEFAULT  34 // ADC1_CH6 - เซ็นเซอร์วัดความเข้มแสง (LDR Photoresistor / 0-100%)
#define PIN_DIGITAL_DEFAULT 25 // Digital In - สวิตช์จำลองระดับน้ำในถังต่ำ (Low = Alert)
#define PIN_OUTPUT_DEFAULT  2  // Digital Out - LED แสดงสถานะไฟปลูกพืช (Purple LED)

#define TELEMETRY_INTERVAL_MS 2000
#define BUTTON_DEBOUNCE_MS    50
#define SERIAL_BAUD_RATE      115200

#define THRESHOLD_LIGHT_MIN   30.0f // % แสงน้อย เปิดไฟปลูกพืช
#define THRESHOLD_LIGHT_MAX   40.0f // % แสงเพียงพอ ปิดไฟปลูกพืช
#define MANUAL_OVERRIDE_TIMEOUT 30000

#endif // GREENMESH_CONFIG_H
