#ifndef GREENMESH_CONFIG_H
#define GREENMESH_CONFIG_H

#include <stdint.h>

// ========================================================
// 0. Simulation Mode Toggle (Wokwi vs Hardware)
// ========================================================
// 1 = ใช้งานใน Wokwi Simulation (ใช้ Wi-Fi "Wokwi-GUEST", Custom MACs, Channel 6)
// 0 = ใช้งานกับฮาร์ดแวร์ ESP32 จริง (ใช้ Wi-Fi AP จริง, ฮาร์ดแวร์ MAC จากชิป)
#define WOKWI_SIMULATION 1

// ========================================================
// 1. Wi-Fi & ESP-NOW Configuration
// ========================================================
#if WOKWI_SIMULATION
  // บน Wokwi จำลอง Access Point "Wokwi-GUEST" จะล็อกอยู่ที่ Channel 6 เป็นค่ามาตรฐาน
  #define ESPNOW_WIFI_CHANNEL 6
  #define WIFI_SSID           "Wokwi-GUEST"
  #define WIFI_PASSWORD       ""
  
  // MQTT Broker สำหรับ Wokwi:
  // ตัวเลือก 1: "broker.emqx.io" หรือ "test.mosquitto.org" (Public Broker ทดสอบได้ทันที)
  // ตัวเลือก 2: IP เครื่องของคุณ เช่น "192.168.1.xxx" หรือ "10.0.2.2" (เมื่อใช้ Wokwi Network Token / Gateway)
  #define MQTT_HOST           "broker.emqx.io"
  #define MQTT_PORT           1883
  #define MQTT_USER           ""
  #define MQTT_PASS           ""
#else
  // การตั้งค่าสำหรับฮาร์ดแวร์จริงในห้องปฏิบัติการ
  #define ESPNOW_WIFI_CHANNEL 1
  #define WIFI_SSID           "Greenhouse_AP"
  #define WIFI_PASSWORD       "greenhouse123"
  #define MQTT_HOST           "192.168.1.100"  // IP เครื่องคอมพิวเตอร์ที่รัน Mosquitto
  #define MQTT_PORT           1883
  #define MQTT_USER           ""
  #define MQTT_PASS           ""
#endif

// โหมดการส่ง ESP-NOW (1 = Broadcast ส่ง FF:FF:FF:FF:FF:FF, 0 = Unicast เจาะจง MAC)
#define USE_BROADCAST_ESPNOW 1

// Broadcast MAC Address
static const uint8_t BROADCAST_MAC_ADDRESS[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Custom MAC Addresses สำหรับแต่ละโหนด (จำเป็นสำหรับการจำลองบน Wokwi ข้ามแท็บ)
static const uint8_t MAC_BED_A[6]   = {0x02, 0x00, 0x00, 0x00, 0x00, 0x01};
static const uint8_t MAC_BED_B[6]   = {0x02, 0x00, 0x00, 0x00, 0x00, 0x02};
static const uint8_t MAC_CLIMATE[6] = {0x02, 0x00, 0x00, 0x00, 0x00, 0x03};
static const uint8_t MAC_MASTER[6]  = {0x02, 0x00, 0x00, 0x00, 0x00, 0x04};

// Master ESP32 MAC address (ใช้เมื่อ USE_BROADCAST_ESPNOW = 0)
static const uint8_t MASTER_MAC_ADDRESS[6] = {0x02, 0x00, 0x00, 0x00, 0x00, 0x04};

// ========================================================
// 2. Hardware Pin Mappings (ESP-WROOM-32)
// ========================================================
// ข้อควรระวัง: ขา ADC2 ของ ESP32 (GPIO 0, 2, 4, 12-15, 25-27) ไม่สามารถใช้อ่าน Analog
// ได้ขณะที่เปิดใช้งาน Wi-Fi หรือ ESP-NOW ดังนั้นต้องใช้ขา ADC1 เสมอ:
// ADC1 Pins: GPIO 32, 33, 34, 35, 36 (VP), 39 (VN)
#define PIN_ANALOG_DEFAULT   34  // ADC1_CH6 (Input Only) - ตัวต้านทานปรับค่าจำลอง
#define PIN_DIGITAL_DEFAULT  25  // Digital In (พร้อม internal pull-up) - สวิตช์/ปุ่มกด
#define PIN_OUTPUT_DEFAULT   2   // Digital Out (On-board LED) - LED แสดงสถานะเอาต์พุต

// ========================================================
// 3. Timing & System Constants
// ========================================================
#define TELEMETRY_INTERVAL_MS 2000  // ส่งข้อมูลเซ็นเซอร์ทุกๆ 2 วินาที
#define BUTTON_DEBOUNCE_MS     50   // หน่วงเวลาแก้สวิตช์กระดอน (Debounce)
#define SERIAL_BAUD_RATE       115200

// ========================================================
// 4. Automated Greenhouse Thresholds & Timing (Proposal Section 8)
// ========================================================
#define THRESHOLD_MOISTURE_A_MIN  35.0f // % ความชื้นต่ำ เปิดวาล์ว A
#define THRESHOLD_MOISTURE_A_MAX  45.0f // % ความชื้นเป้าหมาย ปิดวาล์ว A
#define THRESHOLD_MOISTURE_B_MIN  35.0f // % ความชื้นต่ำ เปิดวาล์ว B
#define THRESHOLD_MOISTURE_B_MAX  45.0f // % ความชื้นเป้าหมาย ปิดวาล์ว B
#define THRESHOLD_TEMP_HIGH       32.0f // °C อุณหภูมิสูง เปิดพัดลม
#define THRESHOLD_TEMP_LOW        30.0f // °C อุณหภูมิเย็น ปิดพัดลม
#define THRESHOLD_LIGHT_MIN       30.0f // % แสงน้อย เปิดไฟปลูกพืช
#define THRESHOLD_LIGHT_MAX       40.0f // % แสงเพียงพอ ปิดไฟปลูกพืช

#define MANUAL_FAN_PULSE_MS       15000 // 15 วินาที: ระยะเวลาเปิดพัดลมเมื่อกดปุ่มขอเปิดพัดลมเฉพาะจุด
#define MANUAL_OVERRIDE_TIMEOUT   30000 // 30 วินาที: ระยะเวลาหน่วงคงสถานะเมื่อได้รับคำสั่ง Manual จากเกตเวย์

#endif // GREENMESH_CONFIG_H
