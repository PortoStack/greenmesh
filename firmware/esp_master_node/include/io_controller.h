#ifndef UTILITY_IO_CONTROLLER_H
#define UTILITY_IO_CONTROLLER_H

#include <Arduino.h>

class UtilityController {
public:
    UtilityController();
    void init();
    void update(); // เรียกใน loop() ทุกรอบ (~20ms)

    float readLight();
    uint8_t readWaterLow();

    void setGrowLight(uint8_t state);
    uint8_t getGrowLightState() const;

    void setRemoteCommand(uint8_t state);

private:
    uint8_t light_state;
    uint8_t water_low;

    int last_raw_button;
    int debounced_button;
    unsigned long last_debounce_time;

    bool remote_override_active;
    unsigned long remote_override_start;
};

#endif // UTILITY_IO_CONTROLLER_H
