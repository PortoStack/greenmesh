#include "io_controller.h"
#include "config.h"

#define PIN_POT_TEMP     PIN_ANALOG_DEFAULT   // GPIO 34: ADC1 ตัวต้านทานปรับค่าจำลองอุณหภูมิ (15.0 - 50.0°C)
#define PIN_BTN_FAN_REQ  PIN_DIGITAL_DEFAULT  // GPIO 25: ปุ่มกดขอเปิดพัดลมเฉพาะจุด (Pushbutton / Low = Pulse Req)
#define PIN_LED_FAN      PIN_OUTPUT_DEFAULT   // GPIO 2: หลอด LED แสดงสถานะพัดลม (Green LED)

ClimateController::ClimateController() 
    : fan_state(0),
      last_raw_button(HIGH),
      debounced_button(HIGH),
      last_debounce_time(0),
      fan_request_flag(0),
      manual_pulse_active(false),
      manual_pulse_start(0),
      remote_override_active(false),
      remote_override_start(0) {}

void ClimateController::init() {
    pinMode(PIN_POT_TEMP, INPUT);
    pinMode(PIN_BTN_FAN_REQ, INPUT_PULLUP);
    pinMode(PIN_LED_FAN, OUTPUT);
    digitalWrite(PIN_LED_FAN, LOW);

    // อ่านสถานะเริ่มต้นของปุ่มกดเพื่อป้องกันการเกิด Edge หลอกตอนบูต
    int initial_read = digitalRead(PIN_BTN_FAN_REQ);
    last_raw_button = initial_read;
    debounced_button = initial_read;
    if (initial_read == LOW) {
        Serial.println("[climate] ⚠️ คำเตือน: ตรวจพบ GPIO 25 อยู่ที่สถานะ LOW ตั้งแต่เริ่มบูต (หากใช้ปุ่ม 4 ขา ให้ตรวจสอบว่าสายไม่ช็อตกัน)");
    }
}

float ClimateController::readTemperature() {
    // อ่านค่า ADC1 (0 - 4095) แปลงเป็นอุณหภูมิ (15.0°C - 50.0°C)
    int raw_analog = analogRead(PIN_POT_TEMP);
    return 15.0f + (raw_analog / 4095.0f) * 35.0f;
}

uint8_t ClimateController::readFanRequest() {
    // ส่งสถานะว่ามีการกดขอเปิดพัดลมหรือไม่ (1 เมื่อกดปุ่มหรืออยู่ในช่วง manual pulse)
    return (debounced_button == LOW || manual_pulse_active || fan_request_flag) ? 1 : 0;
}

void ClimateController::setFanState(uint8_t state) {
    fan_state = state ? 1 : 0;
    digitalWrite(PIN_LED_FAN, fan_state ? HIGH : LOW);
}

uint8_t ClimateController::getFanState() const {
    return fan_state;
}

void ClimateController::setRemoteCommand(uint8_t state) {
    setFanState(state);
    remote_override_active = true;
    remote_override_start = millis();
    if (state == 0) {
        manual_pulse_active = false;
        fan_request_flag = 0;
    }
    Serial.printf("[climate] Remote Command applied: Fan -> %d\n", fan_state);
}

void ClimateController::update() {
    unsigned long now = millis();
    float current_temp = readTemperature();

    // 1. อ่านและแก้สวิตช์กระดอน (Debounce) ของปุ่มกด (INPUT_PULLUP: LOW = กด)
    int reading = digitalRead(PIN_BTN_FAN_REQ);
    if (reading != last_raw_button) {
        last_debounce_time = now;
        last_raw_button = reading;
    }

    if ((now - last_debounce_time) >= BUTTON_DEBOUNCE_MS) {
        if (reading != debounced_button) {
            debounced_button = reading;

            // ตรวจพบจังหวะกดปุ่มลง (Falling Edge: LOW)
            if (debounced_button == LOW) {
                fan_request_flag = 1;
                manual_pulse_active = true;
                manual_pulse_start = now;
                remote_override_active = false;
                setFanState(1);
                Serial.printf("[climate] 🔘 กดปุ่ม GPIO 25 (ขอเปิดพัดลม)! สั่งเปิดพัดลมเฉพาะจุดทันที (Pulse %d วินาที)\n",
                              MANUAL_FAN_PULSE_MS / 1000);
            }
        }
    }

    // 2. ตรวจสอบการหมดเวลาของ Manual Pulse Request (Section 8: กติกาคืนสถานะ)
    if (manual_pulse_active) {
        if (now - manual_pulse_start >= MANUAL_FAN_PULSE_MS) {
            manual_pulse_active = false;
            fan_request_flag = 0;
            Serial.println("[climate] ⏱️ หมดเวลา Pulse ขอเปิดพัดลม คืนสถานะสู่การควบคุมตามเกณฑ์อุณหภูมิ");
        }
    }

    // 3. ตรวจสอบการหมดเวลาของ Remote Override
    if (remote_override_active) {
        if (now - remote_override_start >= MANUAL_OVERRIDE_TIMEOUT) {
            remote_override_active = false;
            Serial.println("[climate] ⏱️ หมดเวลา Remote Override กลับสู่การควบคุมอัตโนมัติ");
        }
    }

    // 4. การควบคุมอัตโนมัติตามเกณฑ์อุณหภูมิ (Section 8: ร้อน > 32°C เปิดพัดลม, เย็น < 30°C ปิดพัดลม)
    if (!manual_pulse_active && !remote_override_active) {
        if (current_temp > THRESHOLD_TEMP_HIGH) {
            if (fan_state == 0) {
                setFanState(1);
                Serial.printf("[climate] 🌡️ อุณหภูมิสูง (%.1f°C > %.1f°C) -> เปิดพัดลมอัตโนมัติ\n",
                              current_temp, THRESHOLD_TEMP_HIGH);
            }
        } else if (current_temp < THRESHOLD_TEMP_LOW) {
            if (fan_state == 1) {
                setFanState(0);
                Serial.printf("[climate] ❄️ อุณหภูมิลดลงสู่เกณฑ์ปกติ (%.1f°C < %.1f°C) -> ปิดพัดลมอัตโนมัติ\n",
                              current_temp, THRESHOLD_TEMP_LOW);
            }
        }
        // ระหว่าง 30.0°C - 32.0°C เป็นช่วง Hysteresis คงสถานะเดิมไว้ ป้องกันการติด-ดับถี่
    }
}
