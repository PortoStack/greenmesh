# 📱 Arduino IDE Firmware Guide for GreenMesh (ESP32)

คู่มือการเปิด คอมไพล์ และอัปโหลดโปรแกรมไมโครคอนโทรลเลอร์ ESP32 ทั้ง 4 บอร์ดด้วย **Arduino IDE** (ตามข้อกำหนดข้อ 4 ของรายวิชา 305432 Sensor Network Term Project)

---

## 📂 โครงสร้างโฟลเดอร์สำหรับ Arduino IDE

```text
arduino_ide/
├── esp_bed_a/              # ESP32 #1: แปลงผัก A
│   ├── esp_bed_a.ino       # สเก็ตช์หลักแปลงผัก A
│   ├── config.h            # การตั้งค่า Wi-Fi, Pins, เกณฑ์อัตโนมัติ
│   └── protocol.h          # โครงสร้างแพ็กเก็ต ESP-NOW
├── esp_bed_b/              # ESP32 #2: แปลงผัก B
│   ├── esp_bed_b.ino
│   ├── config.h
│   └── protocol.h
├── esp_climate/            # ESP32 #3: สภาพแวดล้อมและพัดลมระบายอากาศ
│   ├── esp_climate.ino
│   ├── config.h
│   └── protocol.h
└── esp_master_node/        # ESP32 #4: โหนดส่วนกลาง แสง/น้ำ และ ESP-NOW <-> MQTT Gateway
    ├── esp_master_node.ino
    ├── config.h
    └── protocol.h
```

---

## ⚙️ 1. การเตรียมโปรแกรม Arduino IDE

1. ติดตั้ง **Arduino IDE** (เวอร์ชัน 2.x หรือ 1.8.x)
2. ติดตั้งบอร์ด ESP32:
   - ไปที่ `File` -> `Preferences`
   - ในช่อง `Additional boards manager URLs` ใส่:  
     `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - ไปที่ `Tools` -> `Board` -> `Boards Manager...` -> ค้นหา `esp32` โดย **Espressif Systems** แล้วกด **Install**
3. ติดตั้ง Library ที่จำเป็น (สำหรับโหนด Master `esp_master_node`):
   - ไปที่ `Tools` -> `Manage Libraries...`
   - ค้นหา `PubSubClient` โดย **Nick O'Leary** แล้วกด **Install**

---

## 🔌 2. การตั้งค่าก่อน Upload ลงบอร์ด ESP32

เมื่อเปิดไฟล์ `.ino` ใดๆ ให้ตั้งค่าในเมนู `Tools`:
- **Board:** `ESP32 Dev Module` (หรือรุ่นของบอร์ดที่คุณใช้งาน)
- **Upload Speed:** `921600` หรือ `115200`
- **Flash Frequency:** `80MHz`
- **Port:** เลือกพอร์ต COM หรือ `/dev/cu.usbserial-*` ที่ต่อกับบอร์ด ESP32 ตัวนั้น

> 💡 **การแก้ไข Wi-Fi:** ก่อน Upload บอร์ด Master ให้เปิดแท็บ `config.h` แล้วแก้ `WIFI_SSID`, `WIFI_PASSWORD` และ `MQTT_HOST` (IP เครื่องคอมพิวเตอร์ที่รัน Mosquitto) ให้ตรงกับวงเครือข่ายของคุณ

---

## 📋 3. รายการฟังก์ชันและขา I/O ของทั้ง 4 บอร์ด (ครบตามเกณฑ์ข้อ 8.1 - 8.8)

| บอร์ด | ฟังก์ชัน Analog (`analogRead`) | ฟังก์ชัน Digital In (`digitalRead`) | ฟังก์ชัน Digital Out (`digitalWrite`) | โปรโตคอลการสื่อสาร |
|---|---|---|---|---|
| **ESP32 #1 (`esp_bed_a`)** | GPIO 34 (ความชื้นดิน A: 0.0 - 100.0%) | GPIO 25 (สวิตช์ตรวจกระถาง A) | GPIO 2 (LED วาล์ว A) | ESP-NOW Client |
| **ESP32 #2 (`esp_bed_b`)** | GPIO 34 (ความชื้นดิน B: 0.0 - 100.0%) | GPIO 25 (สวิตช์ตรวจกระถาง B) | GPIO 2 (LED วาล์ว B) | ESP-NOW Client |
| **ESP32 #3 (`esp_climate`)** | GPIO 34 (อุณหภูมิ: 15.0 - 50.0°C) | GPIO 25 (ปุ่มขอเปิดพัดลมเฉพาะจุด) | GPIO 2 (LED พัดลมระบายอากาศ) | ESP-NOW Client |
| **ESP32 #4 (`esp_master_node`)** | GPIO 34 (เซ็นเซอร์วัดแสง LDR: 0.0 - 100.0%) | GPIO 25 (สวิตช์จำลองน้ำในถังต่ำ) | GPIO 2 (LED ไฟปลูกพืช) | ESP-NOW Gateway + MQTT Client |
