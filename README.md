# GreenMesh - Smart Greenhouse System

ระบบดูแลแปลงผักและโรงเรือนอัจฉริยะ (ESP32 + MQTT + Node-RED + Next.js)  
ออกแบบและพัฒนาตามข้อกำหนดใน [Smart_Greenhouse_Project_Proposal.md](../Smart_Greenhouse_Project_Proposal.md) และข้อกำหนดวิชา 305432 Sensor Network Term Project

---

## 🏛️ สถาปัตยกรรมระบบ (Services Overview)

ระบบถูกออกแบบให้เป็น **Lean & Clean Architecture** ตรงตามโครงสร้างในเอกสารโจทย์ข้อกำหนดรายวิชา (ไดอะแกรมหน้า 5):

- **MQTT Broker**: `eclipse-mosquitto:2` (พอร์ต `1883` สำหรับ IoT/Node-RED, พอร์ต `9001` WebSocket สำหรับ Dashboard)
- **Node-RED (Main Back end)**: เกตเวย์หลักตัวเดียวของระบบ (พอร์ต `1880`)
  - **Rule Engine**: ประมวลผลกฎอัตโนมัติตาม Section 8 (ความชื้นต่ำเปิดวาล์วและสั่งปั๊ม, น้ำต่ำหยุดฉุกเฉิน)
  - **Modbus RTU Master**: ควบคุมและอ่านสถานะอุปกรณ์ผ่านบัส RS485 3 สถานี (ปั๊มน้ำ, พัดลม, ไฟ)
  - **API to Front end**: ให้บริการ REST API (`/api/status`, `/api/commands`, `/api/config`) และ WebSocket Stream (`/api/ws`)
  - **Watchdog**: ตรวจสอบสถานะการเชื่อมต่อ Online/Offline ของ ESP32 อัตโนมัติ (15s timeout)
- **Client (Frontend)**: Next.js Dashboard แบบ Standalone พร้อม Tailwind CSS (พอร์ต `3000`)
- **Modbus Slave Simulator (`modbus/`)**: สคริปต์ Python จำลอง Slave RS485 ทั้ง 3 สถานี รองรับการเปิด Serial Ports USB จริง 3 พอร์ตพร้อมกัน

---

## ⚡ สถาปัตยกรรมเครือข่ายและการสื่อสาร

```text
[ESP32 #1: esp32_bed_a]       (MAC: 02:00:00:00:00:01) ──┐
[ESP32 #2: esp32_bed_b]       (MAC: 02:00:00:00:00:02) ──┼─── (ESP-NOW Broadcast Ch.1 / Ch.6) ──▶ [ESP32 #4: esp32_master_node]
[ESP32 #3: esp32_climate]     (MAC: 02:00:00:00:00:03) ──┘                                                      │
                                                                                                              ├── (Wi-Fi AP)
                                                                                                              ▼
                                                                                                      [MQTT Broker (1883)]
                                                                                                              │
                                                                                                              ▼
                                                                                                [Node-RED: Main Back end (1880)]
                                                                                                 ├── Modbus RTU Master (RS485 Bus)
                                                                                                 └── API to Front end (HTTP/WS)
                                                                                                              │
                                                                                                              ▼
                                                                                                    [Next.js Dashboard (3000)]
```

---

## ⚡ โครงสร้างเฟิร์มแวร์ Arduino IDE (`greenmesh/firmware/`)

ทุกโหนดพัฒนาด้วยภาษา **C/C++ บน Arduino IDE** ตามข้อกำหนดข้อ 4 ของรายวิชา โดยแต่ละโหนดถูกแยกโฟลเดอร์เป็นอิสระ มีไฟล์ `.ino`, `config.h` และ `protocol.h` บรรจุอยู่ภายในโฟลเดอร์ของตัวเอง สามารถดับเบิลคลิกเปิดและคอมไพล์ใน Arduino IDE ได้ทันที:

```text
firmware/
├── README.md                     # คู่มือการติดตั้งและคอมไพล์บน Arduino IDE
├── WOKWI_GUIDE.md                # คู่มือการจำลองบน Wokwi Simulator
├── esp32_bed_a/                  # ESP32 #1: แปลงผัก A
│   ├── esp32_bed_a.ino           # โค้ดหลักแปลง A (ความชื้นดิน, สวิตช์กระถาง, วาล์ว A)
│   ├── config.h                  # คอนฟิกขา GPIO, Wi-Fi, เกณฑ์อัตโนมัติ
│   └── protocol.h                # โครงสร้าง Packed Struct ของ ESP-NOW
├── esp32_bed_b/                  # ESP32 #2: แปลงผัก B
│   ├── esp32_bed_b.ino           # โค้ดหลักแปลง B (ความชื้นดิน, สวิตช์กระถาง, วาล์ว B)
│   ├── config.h
│   └── protocol.h
├── esp32_climate/                # ESP32 #3: สภาพแวดล้อมและระบายอากาศ
│   ├── esp32_climate.ino         # โค้ดหลัก (อุณหภูมิ, ปุ่มขอเปิดพัดลม, พัดลม)
│   ├── config.h
│   └── protocol.h
└── esp32_master_node/            # ESP32 #4: แสง/น้ำ/ไฟ + Gateway ESP-NOW <-> MQTT
    ├── esp32_master_node.ino     # โค้ดหลัก (เซ็นเซอร์แสง LDR, สวิตช์น้ำต่ำ, ไฟปลูก, MQTT Bridge)
    ├── config.h
    └── protocol.h
```

---

## 📋 รายการอุปกรณ์ของแต่ละ ESP32 (ครบตามข้อกำหนด 8.1 - 8.8)

> **ข้อควรระวังเรื่องขา ADC บน ESP32:** บอร์ด ESP32 ไม่สามารถใช้อ่านขา Analog ของกลุ่ม ADC2 (เช่น GPIO 0, 2, 4, 12-15, 25-27) ได้ขณะที่เปิดใช้งาน Wi-Fi หรือ ESP-NOW ดังนั้นโหนดทั้งหมดจึงถูกกำหนดให้ใช้กลุ่มขา **ADC1** เท่านั้น (ใช้ `GPIO 34`)

| บอร์ด | โฟลเดอร์ | Node ID | Analog In (`analogRead` @ `GPIO 34`) | Digital In (`digitalRead` @ `GPIO 25`) | Output (`digitalWrite` @ `GPIO 2`) | โปรโตคอลการสื่อสาร |
|---|---|---|---|---|---|---|
| **ESP32 #1** | `esp32_bed_a` | `bed_a` | **Potentiometer**<br>ความชื้นดิน A (0.0 - 100.0%) | **Slide Switch / Button**<br>ตรวจพบกระถาง A | **Blue LED**<br>โซลินอยด์วาล์ว A | ESP-NOW Client |
| **ESP32 #2** | `esp32_bed_b` | `bed_b` | **Potentiometer**<br>ความชื้นดิน B (0.0 - 100.0%) | **Slide Switch / Button**<br>ตรวจพบกระถาง B | **Blue LED**<br>โซลินอยด์วาล์ว B | ESP-NOW Client |
| **ESP32 #3** | `esp32_climate` | `climate` | **Potentiometer**<br>อุณหภูมิ (15.0 - 50.0°C) | **Yellow Pushbutton**<br>ปุ่มขอเปิดพัดลมเฉพาะจุด (Pulse) | **Green LED**<br>สถานะพัดลมระบายอากาศ | ESP-NOW Client |
| **ESP32 #4** | `esp32_master_node` | `utility` | **Photoresistor (LDR)**<br>เซ็นเซอร์วัดแสง (0.0 - 100.0%) | **Slide Switch**<br>จำลองระดับน้ำในถังต่ำ (Low = Alert) | **Purple LED**<br>ไฟปลูกพืช (Grow Light) | ESP-NOW Gateway + MQTT Client |

---

## 🔌 เครือข่าย Modbus RTU บน RS485 (ข้อ 5, 6, 8.12 - 8.14)

ใช้ตัวแปลง USB-RS485 จำนวน 4 ตัว ต่อขนานร่วมกันบนสายสัญญาณ Differential A/B บัสเดียวกัน:
- **Master (1 พอร์ต):** Node-RED เชื่อมต่อ Serial Port (เช่น `/dev/ttyUSB0` หรือ `COM3`)
- **Slaves (3 พอร์ต):** สคริปต์ `modbus/slaves_runner.py` จำลองสถานี:
  - **Slave ID 1:** ปั๊มน้ำ (Pump Station)
  - **Slave ID 2:** พัดลมระบายอากาศ (Exhaust Fan Station)
  - **Slave ID 3:** โคมไฟปลูกพืช (Grow Light Station)

### ตาราง Address และ Register ของ Slave ทั้ง 3 สถานี:
| Slave ID | สถานี | Register ชนิด | Address (Offset 0) | คำอธิบาย |
|:---:|---|---|:---:|---|
| **1** | ปั๊มน้ำ (Pump) | Coil | `0` | สั่งเปิด/ปิดปั๊มน้ำ (0 = ปิด, 1 = เปิด) |
| **1** | ปั๊มน้ำ (Pump) | Input Register | `0` | สถานะการทำงานจริง (0 = ปิด, 1 = ทำงาน) |
| **1** | ปั๊มน้ำ (Pump) | Input Register | `1` | อัตราการไหลจำลอง (15 L/min เมื่อเปิด) |
| **2** | พัดลม (Fan) | Coil | `0` | สั่งเปิด/ปิดพัดลม (0 = ปิด, 1 = เปิด) |
| **2** | พัดลม (Fan) | Input Register | `0` | สถานะการทำงานจริง (0 = ปิด, 1 = หมุน) |
| **2** | พัดลม (Fan) | Input Register | `1` | ความเร็วรอบจำลอง (1200 RPM เมื่อเปิด) |
| **3** | ไฟปลูกพืช (Light) | Coil | `0` | สั่งเปิด/ปิดไฟปลูก (0 = ปิด, 1 = เปิด) |
| **3** | ไฟปลูกพืช (Light) | Input Register | `0` | สถานะการทำงานจริง (0 = ปิด, 1 = สว่าง) |
| **3** | ไฟปลูกพืช (Light) | Input Register | `1` | กำลังไฟฟ้าจำลอง (80 W เมื่อเปิด) |

---

## 🛠️ คำสั่ง Make (Makefile)

สามารถรันคำสั่ง `make` ได้จากโฟลเดอร์ `greenmesh/`:

### Docker Services Management (MQTT Broker, Node-RED, Next.js Client)

```bash
# ดูรายการคำสั่งทั้งหมด
make help

# Build Docker image ของ Next.js Client
make build-client

# เปิดใช้งาน Service ทั้งหมดในเบื้องหลัง (-d)
make up

# Build ใหม่และเปิดใช้งาน Service ทั้งหมด
make up-build

# เปิดเฉพาะ MQTT Broker (1883, 9001) และ Node-RED (1880)
make up-iot

# หยุดการทำงานของ container ทั้งหมด
make down

# ดูสถานะ container
make ps

# ดู logs แบบเรียลไทม์
make logs
make logs-mqtt
make logs-nodered
make logs-client

# ล้าง container และ network
make clean
```

### Modbus RS485 Slave Simulator

```bash
# รัน Modbus Slave 3 พอร์ตบน Windows (ใช้พอร์ต COM4, COM5, COM6)
make modbus-slaves-win

# รัน Modbus Slave 3 พอร์ตพร้อมระบุพอร์ตเองอิสระ (Linux / Windows)
make modbus-slaves PORT1=COM3 PORT2=COM4 PORT3=COM5
make modbus-slaves PORT1=/dev/ttyUSB1 PORT2=/dev/ttyUSB2 PORT3=/dev/ttyUSB3
```

### Local Development (Next.js Client)

```bash
# ติดตั้ง dependencies ของ Next.js
make client-install

# รัน Next.js Client สำหรับ dev ในเครื่อง
make client-dev

# Build Next.js Client สำหรับ production
make client-build
```

---

## 📡 การออกแบบ MQTT Topic (ตามข้อ 6)

| ทิศทาง | หัวข้อ Topic | ตัวอย่าง Payload | คำอธิบาย |
|---|---|---|---|
| Inbound | `greenhouse/<node_id>/telemetry` | `{"node_id":"bed_a","analog":28.5,"digital":1,"output":0,"seq":15}` | ข้อมูลเซ็นเซอร์จาก ESP32 (`bed_a`, `bed_b`, `climate`, `utility`) |
| Outbound | `greenhouse/<node_id>/command` | `{"command_id":101,"output":1}` | คำสั่งควบคุม Output ของ ESP32 |
| Inbound | `greenhouse/<node_id>/state` | `{"node_id":"bed_a","output":1,"online":true}` | สถานะตอบกลับจาก ESP32 |
| Inbound | `greenhouse/actuator/<type>/state` | `{"slave_id":1,"type":"pump","coil":1,"running":1,"value":15}` | สถานะตอบกลับจาก Modbus Slave ผ่าน Node-RED |
| Outbound | `greenhouse/actuator/<type>/command` | `{"command":"SET_COIL","coil":1}` | คำสั่งควบคุม Modbus Slave (ปั๊ม, พัดลม, ไฟ) |
| Inbound | `greenhouse/alerts` | `{"level":"DANGER","source":"utility","message":"..."}` | ข้อความแจ้งเตือนฉุกเฉิน |
| Outbound | `greenhouse/system/config` | `{"auto_mode":true,"moisture_a_min":35,...}` | บรอดแคสต์ค่าเกณฑ์ให้ Node-RED |

---

## 🌐 API Endpoints ที่ให้บริการโดย Node-RED (พอร์ต 1880)

### Real-Time Streaming (WebSocket)
- `GET /api/ws`: **WebSocket Stream** ส่งข้อมูลสถานะโหนด, ข้อมูลเซ็นเซอร์, สถานะ Modbus Actuator และการแจ้งเตือนแบบเรียลไทม์หา Next.js Dashboard

### REST APIs
- `GET /api/status`: ดึง Snapshot ภาพรวมทั้งระบบ (โหนด, สถานี, ค่าเกณฑ์, แจ้งเตือนล่าสุด)
- `GET /api/nodes`: ดึงสถานะโหนด ESP32 ทั้ง 4 ตัว
- `GET /api/telemetry/history?node_id=bed_a&limit=40`: ประวัติข้อมูลสำหรับแสดงกราฟบน Next.js
- `GET /api/events`: ประวัติเหตุการณ์และการแจ้งเตือนล่าสุด
- `POST /api/commands`: ส่งคำสั่ง Manual สั่งเปิด-ปิดวาล์ว, ปั๊ม, พัดลม, ไฟ
- `PUT /api/config`: อัปเดตค่าเกณฑ์และโหมดการทำงาน Auto/Manual
