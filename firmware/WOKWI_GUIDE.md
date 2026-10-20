# คู่มือการจำลอง ESP32 4 บอร์ดพร้อมกันบน Wokwi Simulator (GreenMesh)

คู่มือนี้แนะนำขั้นตอนการจำลอง ESP32 ทั้ง 4 โหนดของระบบโรงเรือนอัจฉริยะ ผ่าน **ESP-NOW** ข้ามโหนด และส่งต่อเข้า **Wi-Fi / MQTT** เพื่อเชื่อมต่อไปยัง Node-RED และ Backend Dashboard

---

## 🏛️ 1. สถาปัตยกรรมการจำลอง (4 Nodes)

```text
[ESP32 #1: esp_bed_a]       (MAC: 02:00:00:00:00:01) ──┐
[ESP32 #2: esp_bed_b]       (MAC: 02:00:00:00:00:02) ──┼─── (ESP-NOW Broadcast Ch.6) ──▶ [ESP32 #4: esp_master_node] (MAC: 02:00:00:00:00:04)
[ESP32 #3: esp_climate]     (MAC: 02:00:00:00:00:03) ──┘                                           │
                                                                                                    ├── (Wi-Fi: Wokwi-GUEST Ch.6)
                                                                                                    ▼
                                                                                            [MQTT Broker (Port 1883)]
                                                                                                    │
                                                                                        +-----------+-----------+
                                                                                        │                       │
                                                                                    [Node-RED]           [Golang Server]
                                                                                        │                       │
                                                                                [Web Dashboard]         [Next.js Client]
```

---

## 📋 2. รายการอุปกรณ์จำลองของแต่ละ ESP32 (ตามข้อเสนอโครงงาน)

ทุกบอร์ดใช้ขากำหนดแบบมาตรฐาน ESP32 (`GPIO 34` สำหรับ Analog, `GPIO 25` สำหรับ Digital In, `GPIO 2` สำหรับ Digital Out) โดยมีอุปกรณ์จำลองบน Wokwi ดังนี้:

| บอร์ด | หน้าที่ตามโครงงาน | Analog Input (`GPIO 34`) | Digital Input (`GPIO 25`) | Output (`GPIO 2`) |
|---|---|---|---|---|
| **ESP32 #1**<br>`esp_bed_a` | แปลงผัก A | **Potentiometer**<br>จำลองความชื้นดิน (0.0 - 100.0%) | **Slide Switch**<br>จำลองกระถาง A<br>(ซ้าย: วางกระถาง / ขวา: ว่าง) | **Blue LED**<br>โซลินอยด์วาล์วรดน้ำ A |
| **ESP32 #2**<br>`esp_bed_b` | แปลงผัก B | **Potentiometer**<br>จำลองความชื้นดิน (0.0 - 100.0%) | **Slide Switch**<br>จำลองกระถาง B<br>(ซ้าย: วางกระถาง / ขวา: ว่าง) | **Blue LED**<br>โซลินอยด์วาล์วรดน้ำ B |
| **ESP32 #3**<br>`esp_climate` | อุณหภูมิ & ระบายอากาศ | **Potentiometer**<br>จำลองอุณหภูมิ (15.0 - 50.0°C) | **Yellow Pushbutton**<br>ปุ่มกดขอเปิดพัดลมเฉพาะจุด (Pulse) | **Green LED**<br>สถานะพัดลมระบายอากาศ |
| **ESP32 #4**<br>`esp_master_node` | แสง, น้ำ & Gateway | **Photoresistor Sensor (LDR)**<br>เซ็นเซอร์วัดแสงสว่าง (0.0 - 100.0%) | **Slide Switch**<br>จำลองระดับน้ำในถัง<br>(ซ้าย: น้ำต่ำฉุกเฉิน / ขวา: น้ำปกติ) | **Purple LED**<br>หลอดไฟปลูกพืช (Grow Light) |

---

## 🔑 2. ข้อกำหนดสำคัญสำหรับการจำลองหลายบอร์ด (Multi-Node Wokwi)

1. **Wokwi Network Access Token (จำเป็นสำหรับการสื่อสารข้ามแท็บบน Wokwi.com)**:
   - เข้าสู่ระบบที่ [wokwi.com](https://wokwi.com)
   - ไปที่โปรไฟล์ของคุณ -> ส่วน **Wokwi Club / Network Access** เพื่อคัดลอก Token
   - ใส่ Token ใน `wokwi.toml` หรือในการตั้งค่า Wokwi เพื่อให้บอร์ดจำลองทั้ง 4 ตัวเชื่อมต่อเข้าสู่วงเครือข่ายเสมือนเดียวกัน (Virtual L2 Network)
2. **Wi-Fi Channel ต้องตรงกัน (Channel 6)**:
   - เครือข่ายจำลอง `Wokwi-GUEST` บน Wokwi จะทำงานบน **Wi-Fi Channel 6** เสมอ
   - โค้ดของทุกโหนดถูกตั้งค่าใน [config.h](file:///Users/porto/Workspace/Study/sensor-network/term_project/greenmesh/firmware/common/config.h) ให้ใช้ `ESPNOW_WIFI_CHANNEL 6` อัตโนมัติเมื่อ `#define WOKWI_SIMULATION 1`
3. **Custom MAC Address เฉพาะตัว**:
   - ป้องกันปัญหา Virtual ESP32 บูตขึ้นมาด้วย MAC ซ้ำกัน
   - `esp_bed_a` -> `02:00:00:00:00:01`
   - `esp_bed_b` -> `02:00:00:00:00:02`
   - `esp_climate` -> `02:00:00:00:00:03`
   - `esp_master_node` -> `02:00:00:00:00:04`

---

## 🌐 3. วิธีการรันผ่าน Wokwi.com (4 Browser Tabs)

### ขั้นตอนที่ 1: เตรียมโปรเจกต์บน Wokwi.com
เปิด [wokwi.com](https://wokwi.com/projects/new/esp32) ทั้งหมด 4 แท็บบนเบราว์เซอร์:

| แท็บที่      | ชื่อโปรเจกต์             | สิ่งที่ต้องคัดลอกลงใน Wokwi                                                                                                                                                                                            |
| --------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **แท็บ 1** | `GreenMesh - Bed A`   | คัดลอก `diagram.json` จาก `firmware/esp_bed_a/`<br>สร้างแท็บไฟล์ `protocol.h`, `config.h`<br>และใส่โค้ด `src/main.cpp` ลงใน `sketch.ino`                                                                               |
| **แท็บ 2** | `GreenMesh - Bed B`   | คัดลอก `diagram.json` จาก `firmware/esp_bed_b/`<br>ไฟล์ `protocol.h`, `config.h`, `src/main.cpp`                                                                                                                   |
| **แท็บ 3** | `GreenMesh - Climate` | คัดลอก `diagram.json` จาก `firmware/esp_climate/`<br>ไฟล์ `protocol.h`, `config.h`, `src/main.cpp`                                                                                                                 |
| **แท็บ 4** | `GreenMesh - Gateway` | คัดลอก `diagram.json` จาก `firmware/esp_master_node/`<br>ติดตั้ง Libraries ใน Library Manager: `PubSubClient`, `ArduinoJson`<br>คัดลอก `espnow_handler.h`, `mqtt_handler.h`, `protocol.h`, `config.h`, `src/main.cpp` |

### ขั้นตอนที่ 2: ตั้งค่า Token ใน `wokwi.toml`
ในแท็บไฟล์ `wokwi.toml` ของแต่ละโปรเจกต์ ให้ใส่:
```toml
[wokwi]
version = 1
networkToken = "YOUR_WOKWI_CLUB_TOKEN_HERE"
```

### ขั้นตอนที่ 3: เริ่มต้นจำลอง
1. กดปุ่ม **Start Simulation (Play)** ที่ **แท็บ 4 (Gateway Node)** ก่อน เพื่อรอรับการเชื่อมต่อ
2. กดปุ่ม **Start Simulation** ที่ **แท็บ 1, 2, 3**
3. สังเกต Serial Monitor:
   - แท็บ 1-3 จะพิมพ์ `Sent msg_type=1 seq=...`
   - แท็บ 4 จะพิมพ์ `[Gateway] Forwarding Telemetry from bed_a to MQTT`

---

## 💻 4. วิธีการรันผ่าน VS Code (Wokwi Extension)

1. ติดตั้งส่วนขยาย **Wokwi Simulator** ใน VS Code
2. กด `F1` แล้วพิมพ์ `Wokwi: Request Network Access Token` เพื่อลงชื่อเข้าใช้
3. เลือกคอมไพล์โปรเจกต์ใน PlatformIO ผ่านเมนูด้านล่าง (เช่น `esp_master_node`)
4. เปิดไฟล์ [diagram.json](file:///Users/porto/Workspace/Study/sensor-network/term_project/greenmesh/firmware/esp_master_node/diagram.json) แล้วกดปุ่ม **Start Simulation**

---

## 🔄 5. การสลับกลับไปใช้งานฮาร์ดแวร์จริง ESP32

เมื่อต้องการต่อวงจรจริงกับบอร์ด ESP-WROOM-32 ทั้ง 4 ตัวในห้องทดลอง ให้แก้ไขไฟล์ [firmware/common/config.h](file:///Users/porto/Workspace/Study/sensor-network/term_project/greenmesh/firmware/common/config.h) เพียงจุดเดียว:

```cpp
// เปลี่ยนจาก 1 เป็น 0:
#define WOKWI_SIMULATION 0
```

ระบบจะเปลี่ยนการตั้งค่ากลับมาเป็น:
- Wi-Fi Channel: 1
- Wi-Fi SSID: `Greenhouse_AP`
- MQTT Host: `192.168.1.100` (คอมพิวเตอร์ในห้องทดลอง)
- ใช้ Hardware MAC Address ดั้งเดิมจากชิป ESP32
