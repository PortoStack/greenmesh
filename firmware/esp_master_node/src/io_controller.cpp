#include "io_controller.h"
#include "config.h"

#define PIN_POT_LIGHT      PIN_ANALOG_DEFAULT   // GPIO 34: ADC1 เซ็นเซอร์วัดความเข้มแสง (LDR Photoresistor Sensor / 0-100%)
#define PIN_BTN_LOW_WATER  PIN_DIGITAL_DEFAULT  // GPIO 25: สวิตช์จำลองระดับน้ำในถังต่ำ (Slide Switch / Low = Alert)
#define PIN_LED_GROW_LIGHT PIN_OUTPUT_DEFAULT   // GPIO 2: หลอด LED แสดงสถานะไฟปลูกพืช (Purple LED)

UtilityController::UtilityController() 
    : light_state(0),
      water_low(0),
      last_raw_button(HIGH),
      debounced_button(HIGH),
      last_debounce_time(0),
      remote_override_active(false),
      remote_override_start(0) {}

void UtilityController::init() {
    pinMode(PIN_POT_LIGHT, INPUT);
    pinMode(PIN_BTN_LOW_WATER, INPUT_PULLUP);
    pinMode(PIN_LED_GROW_LIGHT, OUTPUT);
    digitalWrite(PIN_LED_GROW_LIGHT, LOW);
}

float UtilityController::readLight() {
    // อ่านค่า ADC1 (0 - 4095) แปลงเป็นเปอร์เซ็นต์ความเข้มแสง (0.0 - 100.0%)
    int raw_analog = analogRead(PIN_POT_LIGHT);
    return (raw_analog / 4095.0f) * 100.0f;
}

uint8_t UtilityController::readWaterLow() {
    return water_low;
}

void UtilityController::setGrowLight(uint8_t state) {
    light_state = state ? 1 : 0;
    digitalWrite(PIN_LED_GROW_LIGHT, light_state ? HIGH : LOW);
}

uint8_t UtilityController::getGrowLightState() const {
    return light_state;
}

void UtilityController::setRemoteCommand(uint8_t state) {
    setGrowLight(state);
    remote_override_active = true;
    remote_override_start = millis();
    Serial.printf("[utility] Remote Command applied: Grow Light -> %d\n", light_state);
}

void UtilityController::update() {
    unsigned long now = millis();
    float light = readLight();

    // 1. อ่านและแก้สวิตช์กระดอน (Debounce) ของสวิตช์/ปุ่มน้ำต่ำ (INPUT_PULLUP: LOW = น้ำต่ำฉุกเฉิน, HIGH = ปกติ)
    int reading = digitalRead(PIN_BTN_LOW_WATER);
    if (reading != last_raw_button) {
        last_debounce_time = now;
        last_raw_button = reading;
    }

    if ((now - last_debounce_time) >= BUTTON_DEBOUNCE_MS) {
        if (reading != debounced_button) {
            debounced_button = reading;
            uint8_t new_water_low = (debounced_button == LOW) ? 1 : 0;
            if (new_water_low != water_low) {
                water_low = new_water_low;
                if (water_low) {
                    Serial.println("[utility] 🚨 ตรวจพบระดับน้ำในถังต่ำ (LOW WATER ALERT)!");
                } else {
                    Serial.println("[utility] 💧 ระดับน้ำในถังกลับสู่ภาวะปกติ (NORMAL)");
                }
            }
        }
    }

    // 2. ตรวจสอบการหมดเวลาของ Remote Override
    if (remote_override_active) {
        if (now - remote_override_start >= MANUAL_OVERRIDE_TIMEOUT) {
            remote_override_active = false;
            Serial.println("[utility] ⏱️ หมดเวลา Remote Override กลับสู่การควบคุมอัตโนมัติ");
        }
    }

    // 3. กฎควบคุมอัตโนมัติตามเกณฑ์แสง (Section 8: แสง < 30% เปิดไฟ, แสง > 40% ปิดไฟ)
    if (!remote_override_active) {
        if (light < THRESHOLD_LIGHT_MIN) {
            if (light_state == 0) {
                setGrowLight(1);
                Serial.printf("[utility] 💡 แสงน้อย (%.1f%% < %.1f%%) -> เปิดโคมไฟปลูกพืชอัตโนมัติ\n",
                              light, THRESHOLD_LIGHT_MIN);
            }
        } else if (light > THRESHOLD_LIGHT_MAX) {
            if (light_state == 1) {
                setGrowLight(0);
                Serial.printf("[utility] ☀️ แสงสว่างเพียงพอ (%.1f%% > %.1f%%) -> ปิดโคมไฟปลูกพืชอัตโนมัติ\n",
                              light, THRESHOLD_LIGHT_MAX);
            }
        }
        // ช่วงระหว่าง 30% ถึง 40% เป็น Hysteresis คงสถานะเดิมไว้
    }
}
