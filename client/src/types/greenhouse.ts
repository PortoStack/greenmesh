export type NodeID = "bed_a" | "bed_b" | "climate" | "utility";
export type ActuatorID = "pump" | "fan" | "light";

export type EventLevel = "INFO" | "WARNING" | "DANGER" | "SUCCESS";

export interface Node {
  id: NodeID | string;
  name: string;
  description: string;
  analog_label: string;
  analog_unit: string;
  analog_value: number;
  digital_label: string;
  digital_value: number; // 0 | 1
  output_label: string;
  output_state: number; // 0 | 1
  seq: number;
  online: boolean;
  last_seen: string;
}

export interface Actuator {
  id: ActuatorID | string;
  slave_id: number;
  type: ActuatorID | string;
  name: string;
  coil: number; // 0 | 1
  mode: number; // 0 = Manual, 1 = Auto
  target: number;
  running: number; // 0 | 1
  simulated_value: number;
  last_updated: string;
}

export interface TelemetryPoint {
  node_id: string;
  analog: number;
  digital: number;
  output: number;
  timestamp: string;
}

export interface Command {
  command_id?: number;
  target_type: "node" | "actuator";
  target_id: string;
  output: number; // 0 | 1
  mode?: number;
  source?: string;
}

export interface CommandResponse {
  success: boolean;
  message: string;
  command_id: number;
  timestamp: string;
}

export interface SystemConfig {
  auto_mode: boolean;
  moisture_a_min: number;
  moisture_a_max: number;
  moisture_b_min: number;
  moisture_b_max: number;
  temp_high: number;
  temp_low: number;
  light_min: number;
  light_max: number;
  last_modified: string;
}

export interface SystemEvent {
  id: string;
  timestamp: string;
  level: EventLevel;
  source: string;
  message: string;
}

export interface SystemSnapshot {
  config: SystemConfig;
  nodes: Record<string, Node>;
  actuators: Record<string, Actuator>;
  recent_events: SystemEvent[];
  water_low: boolean;
  emergency: boolean;
  server_time: string;
}
