#include "io_controller.h"
#include "config.h"

#define PIN_POT_MOISTURE PIN_ANALOG_DEFAULT   // GPIO 34: ADC1 ตัวต้านทานปรับค่าความชื้นดินแปลง B (0.0 - 100.0%)
#define PIN_BTN_POT      PIN_DIGITAL_DEFAULT  // GPIO 25: สวิตช์สไลด์จำลองตรวจพบกระถางแปลง B (Slide Switch / Low = Placed)
#define PIN_LED_VALVE    PIN_OUTPUT_DEFAULT   // GPIO 2: หลอด LED แสดงสถานะโซลินอยด์วาล์ว B (Blue LED)

BedBController::BedBController() 
    : valve_state(0),
      has_pot(1), // เริ่มต้นมีกระถางเป็นค่ามาตรฐาน
      last_raw_button(HIGH),
      debounced_button(HIGH),
      last_debounce_time(0),
      feedback_blink_active(false),
      feedback_blink_end(0),
      remote_override_active(false),
      remote_override_start(0) {}

void BedBController::init() {
    pinMode(PIN_POT_MOISTURE, INPUT);
    pinMode(PIN_BTN_POT, INPUT_PULLUP);
    pinMode(PIN_LED_VALVE, OUTPUT);
    digitalWrite(PIN_LED_VALVE, LOW);

    // อ่านสถานะเริ่มต้นของปุ่มกดเพื่อป้องกันการเกิด Edge หลอกตอนบูต
    int initial_read = digitalRead(PIN_BTN_POT);
    last_raw_button = initial_read;
    debounced_button = initial_read;
    if (initial_read == LOW) {
        Serial.println("[bed_b] ⚠️ คำเตือน: ตรวจพบ GPIO 25 อยู่ที่สถานะ LOW ตั้งแต่เริ่มบูต (หากใช้ปุ่ม 4 ขา ให้ตรวจสอบว่าสายไม่ช็อตกัน)");
    }
}

float BedBController::readMoisture() {
    // อ่านค่า ADC1 (0 - 4095) แปลงเป็นเปอร์เซ็นต์ความชื้นดิน (0.0 - 100.0%)
    int raw_analog = analogRead(PIN_POT_MOISTURE);
    return (raw_analog / 4095.0f) * 100.0f;
}

uint8_t BedBController::readHasPot() {
    return has_pot;
}

void BedBController::triggerFeedbackBlink(unsigned long now) {
    feedback_blink_active = true;
    feedback_blink_end = now + 150;
    digitalWrite(PIN_LED_VALVE, HIGH);
}

void BedBController::setValve(uint8_t state) {
    valve_state = state ? 1 : 0;
    if (!feedback_blink_active) {
        digitalWrite(PIN_LED_VALVE, valve_state ? HIGH : LOW);
    }
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

    // 1. อ่านและแก้สวิตช์กระดอน (Debounce) ของสวิตช์/ปุ่มตรวจพบกระถาง (INPUT_PULLUP: LOW = กด)
    int reading = digitalRead(PIN_BTN_POT);
    if (reading != last_raw_button) {
        last_debounce_time = now;
        last_raw_button = reading;
    }

    if ((now - last_debounce_time) >= BUTTON_DEBOUNCE_MS) {
        if (reading != debounced_button) {
            debounced_button = reading;
            // เมื่อตรวจพบการกดปุ่ม (Falling Edge: LOW)
            if (debounced_button == LOW) {
                has_pot = has_pot ? 0 : 1; // สลับสถานะกระถาง (Toggle Mode สะดวกต่อการทดสอบบนเบรดบอร์ด)
                triggerFeedbackBlink(now);
                Serial.printf("[bed_b] 🔘 กดปุ่ม GPIO 25! สลับสถานะกระถาง -> %s (%d)\n",
                              has_pot ? "วางกระถางแล้ว (Placed)" : "ไม่มีกระถาง (Empty)", has_pot);

                if (has_pot && moisture >= THRESHOLD_MOISTURE_B_MIN) {
                    Serial.printf("[bed_b] ℹ️ ความชื้นปัจจุบัน %.1f%% (เกณฑ์เปิดวาล์ว < %.1f%%) -> วาล์วยังไม่เปิด (หมุน Potentiometer ลงเพื่อทดสอบเปิดวาล์ว)\n",
                                  moisture, THRESHOLD_MOISTURE_B_MIN);
                }
            }
        }
    }

    // จัดการไฟกระพริบยืนยันการกดปุ่ม (Visual Feedback 150ms)
    if (feedback_blink_active) {
        if (now >= feedback_blink_end) {
            feedback_blink_active = false;
            digitalWrite(PIN_LED_VALVE, valve_state ? HIGH : LOW);
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
