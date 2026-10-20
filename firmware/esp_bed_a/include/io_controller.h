#ifndef BED_A_IO_CONTROLLER_H
#define BED_A_IO_CONTROLLER_H

#include <Arduino.h>

class BedAController {
public:
    BedAController();
    void init();
    void update(); // เรียกใน loop() ทุกรอบ (~20ms)

    float readMoisture();
    uint8_t readHasPot();

    void setValve(uint8_t state);
    uint8_t getValveState() const;

    void setRemoteCommand(uint8_t state);

private:
    uint8_t valve_state;
    uint8_t has_pot;

    int last_raw_button;
    int debounced_button;
    unsigned long last_debounce_time;

    bool remote_override_active;
    unsigned long remote_override_start;
};

#endif // BED_A_IO_CONTROLLER_H
