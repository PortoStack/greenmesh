# 🔌 GreenMesh - Modbus RTU (RS485) Hardware & Simulator Guide

คู่มือการต่อสายและการใช้งานเครือข่าย **RS485 Modbus RTU 4 พอร์ต** สำหรับโครงงาน Sensor Network Term Project:
- **Master (1 พอร์ต):** Node-RED Gateway
- **Slave (3 พอร์ต):** สคริปต์ `slaves_runner.py` จำลองสถานีปั๊มน้ำ, พัดลมระบายอากาศ, และไฟปลูกพืช

---

## 🛠️ 1. ผังการต่อสายฮาร์ดแวร์ (A/B Differential Bus Wiring)

ตัวแปลง USB-RS485 ทั้ง 4 ตัว ต่อขนานร่วมกันบนบัส 2 สาย (Differential A/B):

```text
    [ คอมพิวเตอร์ Gateway / PC ]
    ├── USB Port 1 ──▶ USB-RS485 #1 (Master: Node-RED)
    ├── USB Port 2 ──▶ USB-RS485 #2 (Slave ID 1: ปั๊มน้ำ)
    ├── USB Port 3 ──▶ USB-RS485 #3 (Slave ID 2: พัดลม)
    └── USB Port 4 ──▶ USB-RS485 #4 (Slave ID 3: ไฟปลูกพืช)

                สายบัส RS485 (ต่อขนานกันทุกตัว)
        A (D+) ────────────────────────┬─────────────┬─────────────┬─────────────┐
                                       │ A           │ A           │ A           │ A
                                  [Master #1]   [Slave 1 #2]  [Slave 2 #3]  [Slave 3 #4]
                                       │ B           │ B           │ B           │ B
        B (D-) ────────────────────────┴─────────────┴─────────────┴─────────────┘
        GND    ─────────────────────────────── (ต่อสายดินร่วมกันทุกตัว) ───────────┘
```

* **ขั้ว A (D+):** ต่อขนานถึงกันทั้ง 4 ตัว
* **ขั้ว B (D-):** ต่อขนานถึงกันทั้ง 4 ตัว
* **ขั้ว GND:** ต่อเชื่อมกันทุกตัวเพื่อให้อ้างอิงแรงดันระดับเดียวกัน ลด Noise รบกวน
* **Termination Resistor (ถ้ามี):** ต่อตัวต้านทาน $120\,\Omega$ คร่อมระหว่างขั้ว A และ B ที่ปลายสายทั้งสองด้าน

---

## 🔍 2. วิธีตรวจสอบชื่อพอร์ต Serial

### บน Linux / Raspberry Pi:
```bash
# ดูรายการพอร์ต USB Serial ทั้งหมด
ls -l /dev/ttyUSB*
# ตัวอย่างผลลัพธ์: /dev/ttyUSB0, /dev/ttyUSB1, /dev/ttyUSB2, /dev/ttyUSB3
```
* สมมติให้ `/dev/ttyUSB0` เป็น **Master**
* และ `/dev/ttyUSB1`, `/dev/ttyUSB2`, `/dev/ttyUSB3` เป็น **Slave 1, 2, 3**

### บน Windows:
1. กด `Win + X` -> เลือก **Device Manager (ตัวจัดการอุปกรณ์)**
2. ดูที่หัวข้อ **Ports (COM & LPT)**
3. จะเห็นพอร์ต เช่น `COM3`, `COM4`, `COM5`, `COM6`
* สมมติให้ `COM3` เป็น **Master**
* และ `COM4`, `COM5`, `COM6` เป็น **Slave 1, 2, 3**

---

## 🚀 3. วิธีการรัน Modbus Slave Simulator

### ติดตั้ง dependencies:
```bash
pip install -r requirements.txt
# หรือ
pip install pyserial
```

### การรันจำลองพร้อมกันทั้ง 3 Slaves:
* **บน Linux:**
  ```bash
  python3 slaves_runner.py --port1 /dev/ttyUSB1 --port2 /dev/ttyUSB2 --port3 /dev/ttyUSB3
  ```
* **บน Windows:**
  ```bash
  python slaves_runner.py --port1 COM4 --port2 COM5 --port3 COM6
  ```

---

## 📊 4. ตาราง Address และ Register ของ Slave ทั้ง 3 ตัว

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
