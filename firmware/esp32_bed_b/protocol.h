#ifndef GREENMESH_PROTOCOL_H
#define GREENMESH_PROTOCOL_H

#include <stdint.h>

enum MessageType : uint8_t {
    MSG_TYPE_TELEMETRY = 1,
    MSG_TYPE_COMMAND   = 2,
    MSG_TYPE_STATE     = 3
};

typedef struct __attribute__((packed)) {
    char node_id[16];
    uint8_t msg_type;
    float analog;
    uint8_t digital;
    uint8_t output;
    uint32_t seq;
    uint32_t command_id;
} EspNowPayload;

#endif // GREENMESH_PROTOCOL_H
