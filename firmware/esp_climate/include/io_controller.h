#ifndef CLIMATE_IO_CONTROLLER_H
#define CLIMATE_IO_CONTROLLER_H

#include <Arduino.h>

class ClimateController {
public:
    ClimateController();
    void init();
    void update(); // เรียกใน loop() ทุกรอบ (~20ms)

    float readTemperature();
    uint8_t readFanRequest(); // คืนค่า 1 เมื่อมีการกดปุ่มขอเปิดพัดลม

    void setFanState(uint8_t state);
    uint8_t getFanState() const;

    void setRemoteCommand(uint8_t state); // เมื่อได้รับคำสั่งจาก MQTT/ESP-NOW

private:
    uint8_t fan_state;

    // ระบบ Debounce และตรวจจับการกดปุ่ม
    int last_raw_button;
    int debounced_button;
    unsigned long last_debounce_time;

    // คำขอเปิดพัดลมเฉพาะจุด (Manual Pulse Request)
    uint8_t fan_request_flag;
    bool manual_pulse_active;
    unsigned long manual_pulse_start;

    // คำสั่ง Remote Override จากเกตเวย์
    bool remote_override_active;
    unsigned long remote_override_start;
};

#endif // CLIMATE_IO_CONTROLLER_H
