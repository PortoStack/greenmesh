# GreenMesh - Smart Greenhouse System

ระบบดูแลแปลงผักและโรงเรือนอัจฉริยะ (ESP32 + MQTT + Node-RED + Golang Fiber + Next.js)  
ออกแบบและพัฒนาตามข้อกำหนดใน [Smart_Greenhouse_Project_Proposal.md](../Smart_Greenhouse_Project_Proposal.md)

---

## 🏛️ สถาปัตยกรรมระบบ (Services Overview)

- **MQTT Broker**: `eclipse-mosquitto:2` (พอร์ต `1883` สำหรับ IoT/Node-RED/Server, พอร์ต `9001` WebSocket สำหรับ Dashboard)
- **Node-RED**: เกตเวย์ประมวลผลกฎอัตโนมัติและสะพานเชื่อมต่อ RS485 Modbus RTU 3 สถานี (พอร์ต `1880`)
- **Server (Backend)**: Golang Fiber v2 ด้วยโครงสร้าง **Clean Architecture** (พอร์ต `8080`)
  - จัดการสถานะโหนด ESP32 ทั้ง 4 ตัว และ Modbus Slaves ทั้ง 3 สถานี
  - รัน Watchdog ตรวจจับสถานะ Online/Offline (Heartbeat)
  - ประเมินกฎความปลอดภัยฉุกเฉิน (น้ำในถังต่ำ -> ตัดปั๊มและปิดวาล์วทันที แม้อยู่ในโหมด Manual)
  - ให้บริการ WebSocket Full-Duplex Gateway และ Server-Sent Events (SSE)
- **Client (Frontend)**: Next.js Dashboard แบบ Standalone พร้อม Tailwind CSS (พอร์ต `3000`)
- **Nginx (Reverse Proxy)**: รวมทางเข้า Client, Server API และ Node-RED (พอร์ต `80`)

---

## ⚡ สถาปัตยกรรม ESP32 Firmware (`greenmesh/firmware`)

ทุกโหนดพัฒนาด้วยภาษา C/C++ บนแพลตฟอร์ม ESP32 DevKit (PlatformIO) โดยเชื่อมต่อผ่านเครือข่ายไร้สาย **ESP-NOW** เข้าหา Master Gateway ซึ่งแปลงข้อความเป็น **MQTT** ส่งต่อไปยังเกตเวย์กลาง

```text
[ESP32 #1: esp_bed_a]       (MAC: 02:00:00:00:00:01) ──┐
[ESP32 #2: esp_bed_b]       (MAC: 02:00:00:00:00:02) ──┼─── (ESP-NOW Broadcast Ch.6) ──▶ [ESP32 #4: esp_master_node] (MAC: 02:00:00:00:00:04)
[ESP32 #3: esp_climate]     (MAC: 02:00:00:00:00:03) ──┘                                           │
                                                                                                    ├── (Wi-Fi: Wokwi-GUEST / Greenhouse_AP)
                                                                                                    ▼
                                                                                            [MQTT Broker (Port 1883)]
                                                                                                    │
                                                                                        +-----------+-----------+
                                                                                        │                       │
                                                                                    [Node-RED]           [Golang Server]
                                                                                        │                       │
                                                                                [Web Dashboard]         [Next.js Client]
```

### โครงสร้างโฟลเดอร์ Firmware

```text
firmware/
├── WOKWI_GUIDE.md                # คู่มือจำลองการทำงานบน Wokwi Simulator
├── common/                       # ส่วนกลางที่แชร์ใช้งานร่วมกันทุกโหนด
│   ├── protocol.h                # โครงสร้าง Packed Struct ของ ESP-NOW
│   └── config.h                  # คอนฟิก Wi-Fi, MQTT, ขา GPIO, MAC Address, Wokwi Mode
├── esp_bed_a/                    # ESP32 #1: แปลงผัก A
│   ├── diagram.json              # วงจร Wokwi (ความชื้นดิน A, สวิตช์กระถาง A, LED วาล์ว A)
│   ├── include/ & src/           # โค้ดควบคุม I/O และ ESP-NOW Client
│   └── platformio.ini & wokwi.toml
├── esp_bed_b/                    # ESP32 #2: แปลงผัก B
│   ├── diagram.json              # วงจร Wokwi (ความชื้นดิน B, สวิตช์กระถาง B, LED วาล์ว B)
│   ├── include/ & src/
│   └── platformio.ini & wokwi.toml
├── esp_climate/                  # ESP32 #3: สภาพแวดล้อมและระบายอากาศ
│   ├── diagram.json              # วงจร Wokwi (อุณหภูมิ, ปุ่มขอพัดลม, LED พัดลม)
│   ├── include/ & src/
│   └── platformio.ini & wokwi.toml
└── esp_master_node/              # ESP32 #4: แสง/น้ำ/ไฟ + Gateway ESP-NOW <-> MQTT
    ├── diagram.json              # วงจร Wokwi (LDR Sensor, สวิตช์น้ำต่ำ, LED ไฟปลูก)
    ├── include/ & src/           # โค้ด Gateway, MQTT Bridge, WiFi และ Local I/O
    └── platformio.ini & wokwi.toml
```

---

## 📋 รายการอุปกรณ์ของแต่ละ ESP32 (ฮาร์ดแวร์จริง & Wokwi Simulation)

> **ข้อควรระวังเรื่องขา ADC บน ESP32:** บอร์ด ESP32 ไม่สามารถใช้อ่านขา Analog ของกลุ่ม ADC2 (เช่น GPIO 0, 2, 4, 12-15, 25-27) ได้ขณะที่เปิดใช้งาน Wi-Fi หรือ ESP-NOW ดังนั้นโหนดทั้งหมดจึงถูกกำหนดให้ใช้กลุ่มขา **ADC1** เท่านั้น (ใช้ `GPIO 34`)

| บอร์ด         | โฟลเดอร์           | Node ID   | Analog In (`GPIO 34`)                                  | Digital In (`GPIO 25`)                                        | Output (`GPIO 2`)                      |
| ------------ | ----------------- | --------- | ------------------------------------------------------ | ------------------------------------------------------------- | -------------------------------------- |
| **ESP32 #1** | `esp_bed_a`       | `bed_a`   | **Potentiometer**<br>ความชื้นดิน A (0.0 - 100.0%)         | **Slide Switch**<br>ตรวจพบกระถาง A<br>*(ซ้าย: วาง / ขวา: ว่าง)* | **Blue LED**<br>โซลินอยด์วาล์ว A          |
| **ESP32 #2** | `esp_bed_b`       | `bed_b`   | **Potentiometer**<br>ความชื้นดิน B (0.0 - 100.0%)         | **Slide Switch**<br>ตรวจพบกระถาง B<br>*(ซ้าย: วาง / ขวา: ว่าง)* | **Blue LED**<br>โซลินอยด์วาล์ว B          |
| **ESP32 #3** | `esp_climate`     | `climate` | **Potentiometer**<br>อุณหภูมิ (15.0 - 50.0°C)             | **Yellow Pushbutton**<br>ปุ่มขอเปิดพัดลมเฉพาะจุด (Pulse)           | **Green LED**<br>สถานะพัดลมระบายอากาศ   |
| **ESP32 #4** | `esp_master_node` | `utility` | **Photoresistor (LDR)**<br>เซ็นเซอร์วัดแสง (0.0 - 100.0%) | **Slide Switch**<br>ระดับน้ำในถัง<br>*(ซ้าย: น้ำต่ำฉุกเฉิน / ขวา: ปกติ)*  | **Purple LED**<br>ไฟปลูกพืช (Grow Light) |

---

## 🕹️ การจำลองระบบด้วย Wokwi Simulator

ระบบรองรับการจำลอง ESP32 ทั้ง 4 ตัวพร้อมกันผ่าน **Wokwi Simulator**:

### การสลับโหมดจำลอง (Wokwi vs Hardware จริง)
กำหนดในไฟล์ [`firmware/common/config.h`](firmware/common/config.h):
```cpp
// 1 = จำลองบน Wokwi (ใช้ Wi-Fi "Wokwi-GUEST", Channel 6, Custom MACs)
// 0 = ใช้งานฮาร์ดแวร์ ESP32 จริง (ใช้ Wi-Fi "Greenhouse_AP", Channel 1, Hardware MACs)
#define WOKWI_SIMULATION 1
```

### ขั้นตอนการรันบน VS Code:
1. ติดตั้งส่วนขยาย **Wokwi Simulator** และ **PlatformIO IDE** ใน VS Code
2. ขอ Token เชื่อมต่อเครือข่าย: กด `Cmd + Shift + P` -> เลือก `Wokwi: Request Network Access Token`
3. คอมไพล์เฟิร์มแวร์: รันคำสั่ง `make firmware-build` หรือกด Build ใน PlatformIO
4. เปิดไฟล์ `diagram.json` ของโหนดที่ต้องการ (เช่น [`firmware/esp_master_node/diagram.json`](firmware/esp_master_node/diagram.json)) แล้วกดปุ่ม **Start Simulation (Play สีเขียว 🟢)**
5. สามารถเปิดหลายโหนดพร้อมกันแบบ Split Editor เพื่อทดสอบการส่ง ESP-NOW ข้ามโหนดได้แบบเรียลไทม์

> 📖 ดูคู่มือการจำลองและตั้งค่าแบบละเอียดได้ที่ [WOKWI_GUIDE.md](firmware/WOKWI_GUIDE.md)

---

## 🛠️ คำสั่ง Make (Makefile)

สามารถรันคำสั่ง `make` ได้จากโฟลเดอร์ `greenmesh/`:

### Docker Management

```bash
# ดูรายการคำสั่งทั้งหมด
make help

# Build Docker images ทั้งหมด (Client & Server)
make build

# Build และเปิดใช้งาน service ทั้งหมดในเบื้องหลัง (-d)
make up-build

# เปิดใช้งาน service ที่ build ไว้แล้ว (ครบทั้งระบบ)
make up

# เปิดเฉพาะ MQTT Broker (1883, 9001) และ Node-RED (1880) สำหรับทดสอบ IoT
make up-iot

# หยุดการทำงานของ container ทั้งหมด
make down

# ดูสถานะ container
make ps

# ดู logs แบบเรียลไทม์
make logs
make logs-mqtt
make logs-nodered
make logs-server
make logs-client

# ลบ container, volumes และ networks
make clean
```

### Firmware (PlatformIO)

```bash
# Build เฟิร์มแวร์ ESP32 ทั้ง 4 โหนดพร้อมกันในคำสั่งเดียว
make firmware-build

# Build เฉพาะ Master Gateway Node (esp_master_node)
make firmware-build-master

# ล้างแคชการ Build ของ PlatformIO ทุกโหนด
make firmware-clean
```

### Local Development

```bash
# รัน Next.js Client สำหรับ dev ในเครื่อง
make client-dev

# Build Next.js Client ในเครื่อง
make client-build

# รัน Golang Fiber Server ในเครื่อง
make server-dev

# Build Binary Golang Server ในเครื่อง
make server-build

# รัน Unit Tests ของ Server
make server-test
```

---

## 📡 การออกแบบ MQTT Topic (ตามข้อ 6)

| ทิศทาง    | หัวข้อ Topic                           | ตัวอย่าง Payload                                                      | คำอธิบาย                                                        |
| -------- | ------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------- |
| Inbound  | `greenhouse/<node_id>/telemetry`     | `{"node_id":"bed_a","analog":28.5,"digital":1,"output":0,"seq":15}` | ข้อมูลเซ็นเซอร์จาก ESP32 (`bed_a`, `bed_b`, `climate`, `utility`) |
| Outbound | `greenhouse/<node_id>/command`       | `{"command_id":101,"output":1}`                                     | คำสั่งควบคุม Output ของ ESP32                                     |
| Inbound  | `greenhouse/<node_id>/state`         | `{"node_id":"bed_a","output":1,"online":true}`                      | สถานะตอบกลับจาก ESP32                                          |
| Inbound  | `greenhouse/actuator/<type>/state`   | `{"slave_id":1,"type":"pump","coil":1,"running":1}`                 | สถานะตอบกลับจาก Modbus Slave ผ่าน Node-RED                      |
| Outbound | `greenhouse/actuator/<type>/command` | `{"command":"SET_COIL","coil":1}`                                   | คำสั่งควบคุม Modbus Slave (ปั๊ม, พัดลม, ไฟ)                          |
| Inbound  | `greenhouse/alerts`                  | `{"level":"DANGER","source":"utility","message":"..."}`             | ข้อความแจ้งเตือนฉุกเฉิน                                            |
| Outbound | `greenhouse/system/config`           | `{"auto_mode":true,"moisture_a_min":35,...}`                        | บรอดแคสต์ค่าเกณฑ์ให้ Node-RED                                     |

---

## 🌐 API Endpoints สำหรับ Next.js Client

### Real-Time Streaming & Bidirectional Control
- `GET /api/ws`: **WebSocket Full-Duplex Gateway** (Ultra Real-time Stream & Direct Command ACK, Latency < 1ms)
- `GET /api/stream`: **Server-Sent Events (SSE)** ส่งข้อมูลเรียลไทม์ (Automatic Fallback เมื่อ WebSocket ไม่พร้อมใช้งาน)

### REST APIs
- `GET /api/status`: ดึง Snapshot ภาพรวมทั้งระบบ (โหนด, สถานี, ค่าเกณฑ์, แจ้งเตือนล่าสุด)
- `GET /api/nodes`: ดึงสถานะโหนด ESP32 ทั้ง 4 ตัว
- `GET /api/nodes/:id`: ดึงสถานะโหนดรายตัว (`bed_a`, `bed_b`, `climate`, `utility`)
- `GET /api/actuators`: ดึงสถานะอุปกรณ์ Modbus Slaves (`pump`, `fan`, `light`)
- `GET /api/actuators/:type`: ดึงสถานะอุปกรณ์รายตัว
- `GET /api/telemetry/history?node_id=bed_a&limit=50`: ประวัติข้อมูลสำหรับแสดงกราฟบน Next.js
- `GET /api/events?limit=50`: ประวัติเหตุการณ์และการแจ้งเตือน
- `GET /api/config`: ดึงการตั้งค่าโหมด Auto/Manual และค่าเกณฑ์
- `PUT /api/config`: อัปเดตค่าเกณฑ์และโหมดการทำงาน
- `POST /api/commands`: ส่งคำสั่ง Manual สั่งเปิด-ปิดวาล์ว, ปั๊ม, พัดลม, ไฟ
- `GET /api/simulator/status`: ตรวจสอบสถานะการทำงานและค่าอ่านจำลองของ Simulator Engine
- `POST /api/simulator/start`: เริ่มต้นรัน Background Sensor Simulation
- `POST /api/simulator/stop`: หยุดพัก Background Sensor Simulation
- `POST /api/simulator/scenario`: ฉีดสถานการณ์จำลอง (`normal`, `water_low`, `pot_removed`, `heatwave`)
- `POST /api/simulator/telemetry`: จำลองส่งค่าเซ็นเซอร์แบบกำหนดเองเพื่อทดสอบ
- `POST /api/simulator/reset`: รีเซ็ตสถานะระบบและตัวจำลองกลับสู่ค่าเริ่มต้น
- `GET /health` หรือ `GET /api/health`: Health Check
