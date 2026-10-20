#include "io_controller.h"
#include "config.h"

#define PIN_POT_MOISTURE PIN_ANALOG_DEFAULT   // GPIO 34: ADC1 ตัวต้านทานปรับค่าความชื้นดินแปลง B (0.0 - 100.0%)
#define PIN_BTN_POT      PIN_DIGITAL_DEFAULT  // GPIO 25: สวิตช์สไลด์จำลองตรวจพบกระถางแปลง B (Slide Switch / Low = Placed)
#define PIN_LED_VALVE    PIN_OUTPUT_DEFAULT   // GPIO 2: หลอด LED แสดงสถานะโซลินอยด์วาล์ว B (Blue LED)

BedBController::BedBController() 
    : valve_state(0),
      has_pot(1), // เริ่มต้นมีกระถางเป็นค่ามาตรฐาน
      last_raw_button(LOW),
      debounced_button(LOW),
      last_debounce_time(0),
      remote_override_active(false),
      remote_override_start(0) {}

void BedBController::init() {
    pinMode(PIN_POT_MOISTURE, INPUT);
    pinMode(PIN_BTN_POT, INPUT_PULLUP);
    pinMode(PIN_LED_VALVE, OUTPUT);
    digitalWrite(PIN_LED_VALVE, LOW);
}

float BedBController::readMoisture() {
    // อ่านค่า ADC1 (0 - 4095) แปลงเป็นเปอร์เซ็นต์ความชื้นดิน (0.0 - 100.0%)
    int raw_analog = analogRead(PIN_POT_MOISTURE);
    return (raw_analog / 4095.0f) * 100.0f;
}

uint8_t BedBController::readHasPot() {
    return has_pot;
}

void BedBController::setValve(uint8_t state) {
    valve_state = state ? 1 : 0;
    digitalWrite(PIN_LED_VALVE, valve_state ? HIGH : LOW);
}

uint8_t BedBController::getValveState() const {
    return valve_state;
}

void BedBController::setRemoteCommand(uint8_t state) {
    setValve(state);
    remote_override_active = true;
    remote_override_start = millis();
    Serial.printf("[bed_b] Remote Command applied: Valve B -> %d\n", valve_state);
}

void BedBController::update() {
    unsigned long now = millis();
    float moisture = readMoisture();

    // 1. อ่านและแก้สวิตช์กระดอน (Debounce) ของสวิตช์/ปุ่มตรวจพบกระถาง (LOW = วางกระถาง, HIGH = ยกออก)
    int reading = digitalRead(PIN_BTN_POT);
    if (reading != last_raw_button) {
        last_debounce_time = now;
        last_raw_button = reading;
    }

    if ((now - last_debounce_time) >= BUTTON_DEBOUNCE_MS) {
        if (reading != debounced_button) {
            debounced_button = reading;
            uint8_t new_pot = (debounced_button == LOW) ? 1 : 0;
            if (new_pot != has_pot) {
                has_pot = new_pot;
                Serial.printf("[bed_b] 🪴 ตรวจพบสถานะกระถางแปลง B: %s\n", has_pot ? "วางกระถางแล้ว (Placed)" : "ไม่มีกระถาง (Empty)");
            }
        }
    }

    // 2. ตรวจสอบการหมดเวลาของ Remote Override
    if (remote_override_active) {
        if (now - remote_override_start >= MANUAL_OVERRIDE_TIMEOUT) {
            remote_override_active = false;
            Serial.println("[bed_b] ⏱️ หมดเวลา Remote Override กลับสู่การควบคุมอัตโนมัติ");
        }
    }

    // 3. กฎควบคุมอัตโนมัติตามเกณฑ์ (Section 8: ความชื้น < 35% & มีกระถาง -> เปิดวาล์ว; ความชื้น > 45% หรือไม่มีกระถาง -> ปิดวาล์ว)
    if (!remote_override_active) {
        if (moisture < THRESHOLD_MOISTURE_B_MIN && has_pot == 1) {
            if (valve_state == 0) {
                setValve(1);
                Serial.printf("[bed_b] 💧 ความชื้นต่ำ (%.1f%% < %.1f%%) & มีกระถาง -> เปิดวาล์ว B อัตโนมัติ\n",
                              moisture, THRESHOLD_MOISTURE_B_MIN);
            }
        } else if (moisture > THRESHOLD_MOISTURE_B_MAX || has_pot == 0) {
            if (valve_state == 1) {
                setValve(0);
                const char* reason = (has_pot == 0) ? "ไม่พบกระถาง" : "ความชื้นถึงเกณฑ์เป้าหมาย";
                Serial.printf("[bed_b] 🛑 %s (ความชื้น %.1f%%) -> ปิดวาล์ว B อัตโนมัติ\n",
                              reason, moisture);
            }
        }
        // ช่วงระหว่าง 35% ถึง 45% เป็น Hysteresis คงสถานะเดิมไว้
    }
}
