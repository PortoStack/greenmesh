#ifndef GREENMESH_CONFIG_H
#define GREENMESH_CONFIG_H

#include <stdint.h>

// ========================================================
// 0. Simulation Mode Toggle (Wokwi vs Hardware)
// ========================================================
// 1 = ใช้งานใน Wokwi Simulation
// 0 = ใช้งานกับฮาร์ดแวร์ ESP32 จริง (ค่าเริ่มต้นสำหรับการต่อจริง)
#define WOKWI_SIMULATION 0

// ========================================================
// 1. Wi-Fi & ESP-NOW Configuration
// ========================================================
#if WOKWI_SIMULATION
#define ESPNOW_WIFI_CHANNEL 6
#define WIFI_SSID "Wokwi-GUEST"
#define WIFI_PASSWORD ""
#define MQTT_HOST "broker.emqx.io"
#define MQTT_PORT 1883
#define MQTT_USER ""
#define MQTT_PASS ""
#else
// การตั้งค่าสำหรับฮาร์ดแวร์จริงในห้องปฏิบัติการ (ปรับให้ตรงกับ Wi-Fi Router และ IP เครื่อง Server)
#define ESPNOW_WIFI_CHANNEL 8
#define WIFI_SSID "robot_club"
#define WIFI_PASSWORD "robot123"
#define MQTT_HOST "192.168.7.129"
#define MQTT_PORT 1883
#define MQTT_USER ""
#define MQTT_PASS ""
#endif

// โหมดการส่ง ESP-NOW (1 = Broadcast ส่ง FF:FF:FF:FF:FF:FF, 0 = Unicast เจาะจง MAC)
#define USE_BROADCAST_ESPNOW 1

// Broadcast MAC Address
static const uint8_t BROADCAST_MAC_ADDRESS[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Custom MAC Addresses สำหรับแต่ละโหนด
static const uint8_t MAC_BED_A[6]   = {0x02, 0x00, 0x00, 0x00, 0x00, 0x01};
static const uint8_t MAC_BED_B[6]   = {0x02, 0x00, 0x00, 0x00, 0x00, 0x02};
static const uint8_t MAC_CLIMATE[6] = {0x02, 0x00, 0x00, 0x00, 0x00, 0x03};
static const uint8_t MAC_MASTER[6]  = {0x02, 0x00, 0x00, 0x00, 0x00, 0x04};
static const uint8_t MASTER_MAC_ADDRESS[6] = {0x02, 0x00, 0x00, 0x00, 0x00, 0x04};

// ========================================================
// 2. Hardware Pin Mappings (ESP-WROOM-32)
// ========================================================
// ต้องใช้ ADC1 สำหรับอ่าน Analog เพื่อไม่ให้ชนกับ Wi-Fi/ESP-NOW
#define PIN_ANALOG_DEFAULT  34 // ADC1_CH6 (Analog In) - ตัวต้านทานปรับค่าความชื้นดิน
#define PIN_DIGITAL_DEFAULT 25 // Digital In (Internal Pullup) - สวิตช์ตรวจพบกระถาง
#define PIN_OUTPUT_DEFAULT  2  // Digital Out (On-board / External LED) - LED แสดงสถานะวาล์ว

// ========================================================
// 3. Timing & System Constants
// ========================================================
#define TELEMETRY_INTERVAL_MS 2000 // ส่งข้อมูลเซ็นเซอร์ทุกๆ 2 วินาที
#define BUTTON_DEBOUNCE_MS    50   // หน่วงเวลาแก้สวิตช์กระดอน (Debounce)
#define SERIAL_BAUD_RATE      115200

// ========================================================
// 4. Automated Greenhouse Thresholds
// ========================================================
#define THRESHOLD_MOISTURE_A_MIN 35.0f // % ความชื้นต่ำ เปิดวาล์ว A
#define THRESHOLD_MOISTURE_A_MAX 45.0f // % ความชื้นเป้าหมาย ปิดวาล์ว A
#define MANUAL_OVERRIDE_TIMEOUT  30000 // 30 วินาที

#endif // GREENMESH_CONFIG_H
