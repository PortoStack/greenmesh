#ifndef GREENMESH_PROTOCOL_H
#define GREENMESH_PROTOCOL_H

#include <stdint.h>

// ประเภทข้อความสำหรับการสื่อสารผ่าน ESP-NOW
enum MessageType : uint8_t {
    MSG_TYPE_TELEMETRY = 1, // ข้อมูลเซ็นเซอร์จากโหนด -> เกตเวย์
    MSG_TYPE_COMMAND   = 2, // คำสั่งควบคุมจากเกตเวย์ -> โหนด
    MSG_TYPE_STATE     = 3  // สถานะตอบกลับ (ACK) จากโหนด -> เกตเวย์
};

// โครงสร้างแพ็กเก็ต ESP-NOW (Packed struct เพื่อให้ข้อมูลตรงกันทุกบอร์ด)
typedef struct __attribute__((packed)) {
    char node_id[16];      // รหัสประจำตัวโหนด: "bed_a", "bed_b", "climate", "utility"
    uint8_t msg_type;      // ชนิดข้อความ: MSG_TYPE_TELEMETRY, MSG_TYPE_COMMAND, MSG_TYPE_STATE
    float analog;          // ค่าเซ็นเซอร์จำลอง (ความชื้นดิน %, อุณหภูมิ °C, ความเข้มแสง %)
    uint8_t digital;       // สถานะดิจิทัลอินพุต (0 หรือ 1)
    uint8_t output;        // สถานะดิจิทัลเอาต์พุต (0 หรือ 1)
    uint32_t seq;          // เลขลำดับแพ็กเก็ต (Sequence Number)
    uint32_t command_id;   // เลขคำสั่งอ้างอิงจากเกตเวย์
} EspNowPayload;

#endif // GREENMESH_PROTOCOL_H
