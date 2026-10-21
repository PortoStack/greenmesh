#!/usr/bin/env python3
"""
GreenMesh - Modbus RTU 3-Slave Simulator
======================================================
Simulates 3 Modbus RTU Slaves on RS485 Serial Ports:
  - Slave ID 1: สถานีปั๊มน้ำ (Water Pump Station)
  - Slave ID 2: สถานีพัดลมระบายอากาศ (Ventilation Fan Station)
  - Slave ID 3: สถานีโคมไฟปลูกพืช (Grow Light Station)

Compliant with: 305432 Sensor Network Term Project Specification
"""

import sys
import time
import argparse
import threading
from typing import Dict, Any

try:
    import serial
except ImportError:
    serial = None

# ANSI Color Codes for terminal display
RESET  = "\033[0m"
BOLD   = "\033[1m"
RED    = "\033[31m"
GREEN  = "\033[32m"
YELLOW = "\033[33m"
BLUE   = "\033[34m"
MAGENTA= "\033[35m"
CYAN   = "\033[36m"
WHITE  = "\033[37m"

def calc_crc16(data: bytes) -> bytes:
    """Calculates Modbus RTU 16-bit CRC."""
    crc = 0xFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 0x0001:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc.to_bytes(2, byteorder="little")

def verify_crc16(frame: bytes) -> bool:
    if len(frame) < 3:
        return False
    return calc_crc16(frame[:-2]) == frame[-2:]

class ModbusSlaveDevice:
    def __init__(self, slave_id: int, name: str, port: str, baudrate: int = 9600):
        self.slave_id = slave_id
        self.name = name
        self.port = port
        self.baudrate = baudrate
        self.running = False
        self.ser = None

        # Data Model (0-indexed offset)
        # Coils: 0 = Off, 1 = On
        self.coils = {0: 0}
        # Holding Registers: 0 = Mode (0:Manual, 1:Auto), 1 = Target
        self.holding_registers = {0: 1, 1: 0}
        # Input Registers: 0 = Running Status (0/1), 1 = Dynamic Value
        self.input_registers = {0: 0, 1: 0}

        # Station-specific default active values
        if slave_id == 1:   # Pump
            self.active_val = 15     # 15 L/min
            self.unit = "L/min"
        elif slave_id == 2: # Fan
            self.active_val = 1200   # 1200 RPM
            self.unit = "RPM"
        else:               # Light
            self.active_val = 80     # 80 Watts
            self.unit = "W"

    def handle_request(self, req: bytes) -> bytes:
        if len(req) < 4 or not verify_crc16(req):
            return b""

        target_id = req[0]
        if target_id != self.slave_id:
            return b""  # Ignore frames intended for other slaves on the RS485 bus

        fc = req[1]

        # -------------------------------------------------------------
        # FC 01: Read Coils (0x01)
        # -------------------------------------------------------------
        if fc == 0x01:
            addr = int.from_bytes(req[2:4], "big")
            count = int.from_bytes(req[4:6], "big")
            # Only support coil 0
            val = self.coils.get(addr, 0)
            byte_val = 1 if val else 0
            resp_body = bytes([self.slave_id, 0x01, 0x01, byte_val])
            return resp_body + calc_crc16(resp_body)

        # -------------------------------------------------------------
        # FC 03: Read Holding Registers (0x03)
        # -------------------------------------------------------------
        elif fc == 0x03:
            addr = int.from_bytes(req[2:4], "big")
            count = int.from_bytes(req[4:6], "big")
            data_bytes = bytearray()
            for i in range(count):
                reg_val = self.holding_registers.get(addr + i, 0)
                data_bytes.extend(reg_val.to_bytes(2, "big"))
            resp_body = bytes([self.slave_id, 0x03, len(data_bytes)]) + bytes(data_bytes)
            return resp_body + calc_crc16(resp_body)

        # -------------------------------------------------------------
        # FC 04: Read Input Registers (0x04)
        # -------------------------------------------------------------
        elif fc == 0x04:
            addr = int.from_bytes(req[2:4], "big")
            count = int.from_bytes(req[4:6], "big")
            data_bytes = bytearray()
            for i in range(count):
                reg_val = self.input_registers.get(addr + i, 0)
                data_bytes.extend(reg_val.to_bytes(2, "big"))
            resp_body = bytes([self.slave_id, 0x04, len(data_bytes)]) + bytes(data_bytes)
            return resp_body + calc_crc16(resp_body)

        # -------------------------------------------------------------
        # FC 05: Write Single Coil (0x05)
        # -------------------------------------------------------------
        elif fc == 0x05:
            addr = int.from_bytes(req[2:4], "big")
            raw_val = int.from_bytes(req[4:6], "big")
            # 0xFF00 = ON (1), 0x0000 = OFF (0)
            coil_state = 1 if raw_val == 0xFF00 else 0
            self.coils[addr] = coil_state

            # Automatically simulate device running state & sensor values
            if addr == 0:
                self.input_registers[0] = coil_state
                self.input_registers[1] = self.active_val if coil_state == 1 else 0

            status_str = f"{GREEN}ON 🟢{RESET}" if coil_state == 1 else f"{RED}OFF 🔴{RESET}"
            val_str = f"{self.input_registers[1]} {self.unit}"
            print(f"[{CYAN}Slave {self.slave_id}{RESET} - {YELLOW}{self.name}{RESET}] "
                  f"⚡ Coil 0 Set -> {status_str} | Status={coil_state}, Telemetry={val_str}")

            # Modbus standard echo response for FC05
            return req

        # -------------------------------------------------------------
        # FC 06: Write Single Holding Register (0x06)
        # -------------------------------------------------------------
        elif fc == 0x06:
            addr = int.from_bytes(req[2:4], "big")
            val = int.from_bytes(req[4:6], "big")
            self.holding_registers[addr] = val
            print(f"[{CYAN}Slave {self.slave_id}{RESET} - {YELLOW}{self.name}{RESET}] "
                  f"📝 Holding Register {addr} Set -> {val}")
            return req

        # Unsupported FC -> Exception 0x01 (Illegal Function)
        exc_body = bytes([self.slave_id, fc | 0x80, 0x01])
        return exc_body + calc_crc16(exc_body)

    def run_serial_loop(self):
        if serial is None:
            print(f"[{RED}ERROR{RESET}] pyserial is not installed! Run: pip install pyserial")
            return

        try:
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE,
                timeout=0.05
            )
            print(f"[{GREEN}READY{RESET}] Slave {self.slave_id} ({self.name}) listening on {BOLD}{self.port}{RESET} @ {self.baudrate} bps")
        except Exception as e:
            print(f"[{RED}FAILED{RESET}] Could not open port {self.port} for Slave {self.slave_id}: {e}")
            return

        self.running = True
        buf = bytearray()

        while self.running:
            try:
                waiting = self.ser.in_waiting
                if waiting > 0:
                    chunk = self.ser.read(waiting)
                    buf.extend(chunk)
                    # Modbus RTU frames have inter-frame silence >= 3.5 char times (~4ms at 9600)
                    time.sleep(0.01)
                    more = self.ser.in_waiting
                    if more > 0:
                        buf.extend(self.ser.read(more))

                    # Process frame if buffer has data
                    if len(buf) >= 4:
                        resp = self.handle_request(bytes(buf))
                        if resp:
                            time.sleep(0.005) # small turnaround delay
                            self.ser.write(resp)
                            self.ser.flush()
                        buf.clear()
                else:
                    time.sleep(0.01)
            except Exception as e:
                print(f"[{RED}ERROR{RESET}] Slave {self.slave_id} ({self.port}) error: {e}")
                time.sleep(1)

    def stop(self):
        self.running = False
        if self.ser and self.ser.is_open:
            self.ser.close()

def main():
    parser = argparse.ArgumentParser(
        description="GreenMesh Modbus RTU 3-Slave Simulator (USB-RS485)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Linux:
  python3 slaves_runner.py --port1 /dev/ttyUSB1 --port2 /dev/ttyUSB2 --port3 /dev/ttyUSB3

  # Windows:
  python slaves_runner.py --port1 COM4 --port2 COM5 --port3 COM6

  # Run only Slave 1 (Pump):
  python3 slaves_runner.py --single 1 --port1 /dev/ttyUSB1
        """
    )
    parser.add_argument("--port1", type=str, default="/dev/ttyUSB1", help="Serial port for Slave 1: Pump (default: /dev/ttyUSB1 or COM4)")
    parser.add_argument("--port2", type=str, default="/dev/ttyUSB2", help="Serial port for Slave 2: Fan (default: /dev/ttyUSB2 or COM5)")
    parser.add_argument("--port3", type=str, default="/dev/ttyUSB3", help="Serial port for Slave 3: Light (default: /dev/ttyUSB3 or COM6)")
    parser.add_argument("--baud", type=int, default=9600, help="Baud rate (default: 9600)")
    parser.add_argument("--single", type=int, choices=[1, 2, 3], help="Run only one specific slave")

    args = parser.parse_args()

    print(f"\n{BOLD}{GREEN}==================================================================={RESET}")
    print(f"{BOLD}{GREEN}   GreenMesh - 3-Slave Modbus RTU RS485 Station Simulator          {RESET}")
    print(f"{BOLD}{GREEN}==================================================================={RESET}")
    print(f"  • Slave 1: สถานีปั๊มน้ำ (Pump)       -> Port: {BOLD}{args.port1}{RESET}")
    print(f"  • Slave 2: สถานีพัดลมระบายอากาศ (Fan) -> Port: {BOLD}{args.port2}{RESET}")
    print(f"  • Slave 3: สถานีไฟปลูกพืช (Grow Light)-> Port: {BOLD}{args.port3}{RESET}")
    print(f"  • Baudrate: {args.baud} | Parity: None | Stop Bits: 1 | Data: 8 bits\n")

    slaves = []
    if args.single is None or args.single == 1:
        slaves.append(ModbusSlaveDevice(1, "ปั๊มน้ำ (Pump)", args.port1, args.baud))
    if args.single is None or args.single == 2:
        slaves.append(ModbusSlaveDevice(2, "พัดลม (Fan)", args.port2, args.baud))
    if args.single is None or args.single == 3:
        slaves.append(ModbusSlaveDevice(3, "ไฟปลูกพืช (Light)", args.port3, args.baud))

    threads = []
    for slave in slaves:
        t = threading.Thread(target=slave.run_serial_loop, daemon=True)
        threads.append(t)
        t.start()

    print(f"{CYAN}Slaves are running in background. Press Ctrl+C to stop.{RESET}\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print(f"\n{YELLOW}Stopping all slaves...{RESET}")
        for slave in slaves:
            slave.stop()
        print(f"{GREEN}All slaves stopped safely.{RESET}")

if __name__ == "__main__":
    main()
