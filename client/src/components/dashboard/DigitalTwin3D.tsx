"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  RiAlertFill,
  RiCompass3Line,
  RiDropLine,
  RiEqualizerLine,
  RiEyeLine,
  RiFileList3Line,
  RiLineChartLine,
  RiPlantLine,
  RiRestartLine,
  RiSunLine,
  RiTempHotLine,
  RiWindyLine,
} from "@remixicon/react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SystemSnapshot } from "@/types/greenhouse";

interface HoverTooltipData {
  id: string;
  title: string;
  subtitle: string;
  metricLabel: string;
  metricValue: string;
  statusLabel: string;
  statusColor: "emerald" | "amber" | "sky" | "rose";
  screenX: number;
  screenY: number;
}

interface DigitalTwin3DProps {
  snapshot: SystemSnapshot;
  onSelectDevice?: (deviceId: string, type: "node" | "actuator") => void;
  onOpenDrawerTab?: (tab: "controls" | "charts" | "events") => void;
}

export function DigitalTwin3D({
  snapshot,
  onSelectDevice,
  onOpenDrawerTab,
}: DigitalTwin3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // References to dynamic 3D elements for real-time animation
  const fanBladesRef = useRef<THREE.Group | null>(null);
  const fanLedRef = useRef<THREE.Mesh | null>(null);
  const growLightMeshesRef = useRef<THREE.Mesh[]>([]);
  const lightBeamsRef = useRef<THREE.Mesh[]>([]);
  const growSpotLightsRef = useRef<THREE.SpotLight[]>([]);
  const driverLedsRef = useRef<THREE.Mesh[]>([]);
  const waterMeshRef = useRef<THREE.Mesh | null>(null);
  const emergencyLightRef = useRef<THREE.PointLight | null>(null);
  const bedASprinklersRef = useRef<THREE.Points | null>(null);
  const bedBSprinklersRef = useRef<THREE.Points | null>(null);
  const valveALedRef = useRef<THREE.Mesh | null>(null);
  const valveBLedRef = useRef<THREE.Mesh | null>(null);

  // Hover Tooltip interactive state
  const [hoveredData, setHoveredData] = useState<HoverTooltipData | null>(null);
  const snapshotRef = useRef<SystemSnapshot>(snapshot);
  snapshotRef.current = snapshot;

  // 60 FPS Physics & Visual Interpolation Damping Refs
  const fanSpeedRef = useRef<number>(0);
  const waterLevelRef = useRef<number>(1.0);
  const lightIntensityRef = useRef<number>(0.3);

  // Active states from snapshot
  const bedA = snapshot.nodes.bed_a;
  const bedB = snapshot.nodes.bed_b;
  const climate = snapshot.nodes.climate;
  const utility = snapshot.nodes.utility;
  const pump = snapshot.actuators.pump;
  const fan = snapshot.actuators.fan;
  const light = snapshot.actuators.light;

  const isFanRunning = fan?.running === 1 || climate?.output_state === 1;
  const isLightOn = light?.running === 1 || utility?.output_state === 1;
  const isPumpRunning = pump?.running === 1;
  const isValveAOpen = bedA?.output_state === 1;
  const isValveBOpen = bedB?.output_state === 1;
  const isWaterLow = snapshot.water_low;

  // Real-time mutable state ref accessed by the 60 FPS animation loop
  const stateRef = useRef({
    isFanRunning,
    isLightOn,
    isPumpRunning,
    isValveAOpen,
    isValveBOpen,
    isWaterLow,
  });
  stateRef.current = {
    isFanRunning,
    isLightOn,
    isPumpRunning,
    isValveAOpen,
    isValveBOpen,
    isWaterLow,
  };

  // Camera preset positions (Inside Greenhouse Operator View)
  const setCameraView = (
    view: "overview" | "bed_a" | "bed_b" | "light" | "fan" | "tank",
  ) => {
    if (!controlsRef.current || !cameraRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;

    switch (view) {
      case "overview":
        // Elevated 3/4 Perspective View (Matching user's preferred overview angle)
        camera.position.set(-2.2, 6.4, 9.2);
        controls.target.set(-0.8, 1.2, -0.6);
        break;
      case "bed_a":
        camera.position.set(-1.8, 2.5, 3.6);
        controls.target.set(-2.4, 0.9, 0);
        break;
      case "bed_b":
        camera.position.set(1.8, 2.5, 3.6);
        controls.target.set(2.4, 0.9, 0);
        break;
      case "light":
        // Eye-level view under lighting gantry showing downward glow
        camera.position.set(0, 1.9, 4.2);
        controls.target.set(0, 2.2, 0);
        break;
      case "tank":
        // Direct head-on view of Industrial Reservoir Tank & Booster Pump Bay (100% Zero Bed Overlap)
        camera.position.set(-2.8, 1.9, 6.2);
        controls.target.set(-4.6, 1.3, 4.1);
        break;
      case "fan":
        // Eye-level view of industrial exhaust fan
        camera.position.set(0, 2.6, -1.2);
        controls.target.set(0, 3.2, -5.0);
        break;
    }
    controls.update();
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    growLightMeshesRef.current = [];
    lightBeamsRef.current = [];
    growSpotLightsRef.current = [];
    driverLedsRef.current = [];

    // 1. Scene setup with Bright Greenhouse Atmosphere (Light Mode)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdcecf8);
    scene.fog = new THREE.FogExp2(0xdcecf8, 0.012);

    // 2. Camera setup - Operator Interior Perspective
    const width = container.clientWidth;
    const height = container.clientHeight;
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 80);
    camera.position.set(-2.2, 6.4, 9.2);
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    container.appendChild(renderer.domElement);

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 1.5;
    controls.maxDistance = 20;
    controls.target.set(-0.8, 1.2, -0.6);
    controlsRef.current = controls;

    // 5. Bright Greenhouse Lighting (Natural Sunlight & Skylight)
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.3);
    scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(0xdff2fe, 0xe2e8f0, 1.6);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    // Warm Sunbeam penetrating greenhouse roof
    const sunLight = new THREE.DirectionalLight(0xfffaea, 2.8);
    sunLight.position.set(10, 18, 12);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 40;
    sunLight.shadow.camera.left = -10;
    sunLight.shadow.camera.right = 10;
    sunLight.shadow.camera.top = 10;
    sunLight.shadow.camera.bottom = -10;
    scene.add(sunLight);

    // Secondary soft fill light
    const fillLight = new THREE.DirectionalLight(0xbae6fd, 1.2);
    fillLight.position.set(-10, 12, -8);
    scene.add(fillLight);

    // 6. Flooring & Structural Foundation (NO roof / NO exterior pillars, grounded interior)
    // Subtle outer gravel surround
    const outerGroundGeo = new THREE.PlaneGeometry(32, 32);
    const outerGroundMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.9,
    });
    const outerGround = new THREE.Mesh(outerGroundGeo, outerGroundMat);
    outerGround.rotation.x = -Math.PI / 2;
    outerGround.position.y = -0.01;
    outerGround.receiveShadow = true;
    scene.add(outerGround);

    // Elevated Polished Concrete Foundation Slab
    const slabGeo = new THREE.BoxGeometry(11.8, 0.2, 10.8);
    const slabMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.5,
      metalness: 0.1,
    });
    const slab = new THREE.Mesh(slabGeo, slabMat);
    slab.position.set(0, 0.1, 0.2);
    slab.receiveShadow = true;
    scene.add(slab);

    // Foundation Perimeter Knee-walls (0.5m Curb + Low Polycarbonate Glass & Aluminum Top Rail)
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.7 });
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfdbfe,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      transmission: 0.7,
      thickness: 0.3,
    });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.3 });

    // Left perimeter knee-wall
    const leftCurb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.25, 10.6), curbMat);
    leftCurb.position.set(-5.81, 0.225, 0.2);
    scene.add(leftCurb);
    const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 10.6), glassMat);
    leftGlass.position.set(-5.81, 0.525, 0.2);
    scene.add(leftGlass);
    const leftRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 10.6), railMat);
    leftRail.position.set(-5.81, 0.725, 0.2);
    scene.add(leftRail);

    // Right perimeter knee-wall
    const rightCurb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.25, 10.6), curbMat);
    rightCurb.position.set(5.81, 0.225, 0.2);
    scene.add(rightCurb);
    const rightGlass = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 10.6), glassMat);
    rightGlass.position.set(5.81, 0.525, 0.2);
    scene.add(rightGlass);
    const rightRail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 10.6), railMat);
    rightRail.position.set(5.81, 0.725, 0.2);
    scene.add(rightRail);

    // Front perimeter knee-walls (Left and Right wings, leaving central entrance open)
    const frontCurbL = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.25, 0.18), curbMat);
    frontCurbL.position.set(-3.4, 0.225, 5.51);
    scene.add(frontCurbL);
    const frontGlassL = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.35, 0.04), glassMat);
    frontGlassL.position.set(-3.4, 0.525, 5.51);
    scene.add(frontGlassL);
    const frontRailL = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.05, 0.12), railMat);
    frontRailL.position.set(-3.4, 0.725, 5.51);
    scene.add(frontRailL);

    const frontCurbR = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.25, 0.18), curbMat);
    frontCurbR.position.set(3.4, 0.225, 5.51);
    scene.add(frontCurbR);
    const frontGlassR = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.35, 0.04), glassMat);
    frontGlassR.position.set(3.4, 0.525, 5.51);
    scene.add(frontGlassR);
    const frontRailR = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.05, 0.12), railMat);
    frontRailR.position.set(3.4, 0.725, 5.51);
    scene.add(frontRailR);

    // Central Non-slip Walkway (Terminates strictly inside the room at z: -4.9 to +5.3)
    const walkwayGeo = new THREE.BoxGeometry(2.0, 0.04, 10.2);
    const walkwayMat = new THREE.MeshStandardMaterial({
      color: 0xcfd8dc,
      roughness: 0.6,
      metalness: 0.2,
    });
    const walkway = new THREE.Mesh(walkwayGeo, walkwayMat);
    walkway.position.set(0, 0.22, 0.2);
    walkway.receiveShadow = true;
    scene.add(walkway);

    // Walkway Yellow Safety Guide Lines (Terminates strictly inside room)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    const line1 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 10.2), lineMat);
    line1.position.set(-0.95, 0.245, 0.2);
    scene.add(line1);

    const line2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.01, 10.2), lineMat);
    line2.position.set(0.95, 0.245, 0.2);
    scene.add(line2);

    // Drainage Grates in Walkway Floor (Cleanly spaced within z: -3.6 to +3.6)
    const grateMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.9,
    });
    [-3.6, -1.2, 1.2, 3.6].forEach((gz) => {
      const grate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.01, 0.6), grateMat);
      grate.position.set(0, 0.245, gz);
      scene.add(grate);
    });

    // Greenhouse Back Equipment Bulkhead Wall (For fan and pipes)
    const backWallGeo = new THREE.BoxGeometry(11.8, 5.0, 0.3);
    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x1a2636,
      roughness: 0.75,
      metalness: 0.3,
    });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, 2.6, -5.05);
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Aluminum Top Trim for Bulkhead Wall
    const wallTrim = new THREE.Mesh(
      new THREE.BoxGeometry(11.85, 0.08, 0.35),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85 })
    );
    wallTrim.position.set(0, 5.14, -5.05);
    scene.add(wallTrim);

    // 7. Elevated Plant Growing Troughs (Bed A: Left, Bed B: Right)
    const createSmartBed = (xPos: number, id: string, label: string) => {
      const group = new THREE.Group();
      group.name = id;

      // Steel Base Mounting Flanges under legs (Grounded to concrete slab)
      const flangeGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.03, 16);
      const flangeMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.85,
        roughness: 0.3,
      });
      [
        [-1.2, 0.015, -2.6],
        [1.2, 0.015, -2.6],
        [-1.2, 0.015, 2.6],
        [1.2, 0.015, 2.6],
      ].forEach(([fx, fy, fz]) => {
        const flange = new THREE.Mesh(flangeGeo, flangeMat);
        flange.position.set(fx, fy, fz);
        flange.receiveShadow = true;
        group.add(flange);
      });

      // Elevated Metal Support Legs
      const legGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.7);
      const legMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        metalness: 0.8,
      });
      [
        [-1.2, 0.35, -2.6],
        [1.2, 0.35, -2.6],
        [-1.2, 0.35, 2.6],
        [1.2, 0.35, 2.6],
      ].forEach(([lx, ly, lz]) => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, ly, lz);
        leg.castShadow = true;
        group.add(leg);
      });

      // Trough Container
      const troughGeo = new THREE.BoxGeometry(2.6, 0.45, 6.0);
      const troughMat = new THREE.MeshStandardMaterial({
        color: 0x273549,
        roughness: 0.5,
        metalness: 0.4,
      });
      const trough = new THREE.Mesh(troughGeo, troughMat);
      trough.position.set(0, 0.9, 0);
      trough.castShadow = true;
      trough.receiveShadow = true;
      group.add(trough);

      // Aluminum Protective Rim around Bed Trough
      const rimMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.25 });
      const rimF = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.03, 0.05), rimMat);
      rimF.position.set(0, 1.135, 3.01);
      group.add(rimF);
      const rimB = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.03, 0.05), rimMat);
      rimB.position.set(0, 1.135, -3.01);
      group.add(rimB);
      const rimL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 6.04), rimMat);
      rimL.position.set(-1.31, 1.135, 0);
      group.add(rimL);
      const rimR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 6.04), rimMat);
      rimR.position.set(1.31, 1.135, 0);
      group.add(rimR);

      // Rich Moist Organic Peat/Loam Soil Base (Clean Flat Surface)
      const soilBaseGeo = new THREE.BoxGeometry(2.45, 0.1, 5.85);
      const soilBaseMat = new THREE.MeshStandardMaterial({
        color: 0x241810, // Dark rich moist organic soil
        roughness: 0.95,
      });
      const soilBase = new THREE.Mesh(soilBaseGeo, soilBaseMat);
      soilBase.position.set(0, 1.13, 0);
      soilBase.receiveShadow = true;
      group.add(soilBase);

      // Modbus RS-485 Soil Moisture / Temp / EC Probe (Grounded firmly in soil)
      const probeGroup = new THREE.Group();
      // Soil surface is at y = 1.18. Position probe group right on top of soil surface.
      probeGroup.position.set(0.95, 1.18, 1.2);

      // 3 Stainless Steel Sensing Prongs penetrating deep into soil (negative y)
      const prongMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });
      [-0.016, 0, 0.016].forEach((px) => {
        const prong = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.12), prongMat);
        prong.position.set(px, -0.06, 0);
        probeGroup.add(prong);
      });

      // Probe Waterproof Epoxy Body (mostly inserted into soil, only top collar showing)
      const probeBody = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.018, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 })
      );
      probeBody.position.set(0, 0.01, 0);
      probeGroup.add(probeBody);

      // Probe Cyan Identification Band / Collar (resting right at soil level)
      const probeBand = new THREE.Mesh(
        new THREE.CylinderGeometry(0.019, 0.019, 0.015),
        new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.3 })
      );
      probeBand.position.set(0, 0.03, 0);
      probeGroup.add(probeBand);

      // Signal cable running flat and neat along the soil surface to the corner post (x=1.18, z=2.8)
      // Delta to front-right post: dx = 1.18 - 0.95 = 0.23, dz = 2.8 - 1.2 = 1.6
      const cableCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.04, 0),        // Top of probe gland
        new THREE.Vector3(0.03, 0.008, 0.15), // Drops right to soil surface
        new THREE.Vector3(0.12, 0.008, 0.55), // Lying flat on soil
        new THREE.Vector3(0.18, 0.008, 1.10), // Tracing bed rim
        new THREE.Vector3(0.22, 0.01, 1.45),  // Approaching corner post base
        new THREE.Vector3(0.23, 0.03, 1.58),  // Reaching post base flange
        new THREE.Vector3(0.23, 0.22, 1.59),  // Entering bottom gland of ESP32 enclosure
      ]);
      const cableMesh = new THREE.Mesh(
        new THREE.TubeGeometry(cableCurve, 20, 0.006, 6, false),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 })
      );
      probeGroup.add(cableMesh);

      // Industrial IP65 ESP32 Sensor Node Enclosure mounted on front-right structural post
      const nodeBoxMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.4 });
      const nodeBox = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.06), nodeBoxMat);
      nodeBox.position.set(0.23, 0.28, 1.59);
      probeGroup.add(nodeBox);

      // Enclosure Clear Front Lid
      const lidMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.2, metalness: 0.8 });
      const nodeLid = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 0.01), lidMat);
      nodeLid.position.set(0.23, 0.28, 1.555);
      probeGroup.add(nodeLid);

      // Node Status Heartbeat LED (Flashing green indicator)
      const nodeLed = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.9 })
      );
      nodeLed.position.set(0.21, 0.31, 1.545);
      probeGroup.add(nodeLed);

      group.add(probeGroup);

      // Detailed Crops: Realistic Multi-Petal Rosette Salad Greens
      // Bed A: Green Oak / Butterhead (Lush emerald green)
      // Bed B: Red Oak / Lollo Rossa (Burgundy ruby-red tipped leaves)
      const plantGroup = new THREE.Group();
      const isRedOak = id === "bed_b";

      const outerMat = new THREE.MeshStandardMaterial({
        color: isRedOak ? 0x701a75 : 0x16a34a,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      const midMat = new THREE.MeshStandardMaterial({
        color: isRedOak ? 0x9f1239 : 0x22c55e,
        roughness: 0.55,
        side: THREE.DoubleSide,
      });
      const heartMat = new THREE.MeshStandardMaterial({
        color: isRedOak ? 0xbe123c : 0x86efac,
        roughness: 0.5,
        side: THREE.DoubleSide,
      });

      const outerLeafGeo = new THREE.SphereGeometry(0.14, 8, 6, 0, Math.PI, 0, Math.PI / 1.8);
      const midLeafGeo = new THREE.SphereGeometry(0.11, 8, 6, 0, Math.PI, 0, Math.PI / 1.8);
      const heartGeo = new THREE.SphereGeometry(0.07, 7, 5);

      for (let r = -2.4; r <= 2.4; r += 0.8) {
        for (let c = -0.75; c <= 0.75; c += 0.75) {
          const plantHead = new THREE.Group();
          const jitterX = (Math.random() - 0.5) * 0.06;
          const jitterZ = (Math.random() - 0.5) * 0.06;
          const plantScale = 0.88 + Math.random() * 0.26;
          plantHead.position.set(c + jitterX, 1.20, r + jitterZ);
          plantHead.scale.set(plantScale, plantScale * 0.9, plantScale);

          // Tier 1: Outer Flared Leaves (5 spreading leaves)
          for (let i = 0; i < 5; i++) {
            const leafAngle = (i * Math.PI * 2) / 5 + (Math.random() - 0.5) * 0.2;
            const leaf = new THREE.Mesh(outerLeafGeo, outerMat);
            leaf.rotation.x = 0.55;
            leaf.rotation.y = leafAngle;
            leaf.scale.set(1.1, 0.45, 1.2);
            leaf.castShadow = true;
            plantHead.add(leaf);
          }

          // Tier 2: Mid Upright Leaves (4 leaves at 45 deg)
          for (let j = 0; j < 4; j++) {
            const midAngle = (j * Math.PI * 2) / 4 + Math.PI / 4;
            const midLeaf = new THREE.Mesh(midLeafGeo, midMat);
            midLeaf.position.set(0, 0.03, 0);
            midLeaf.rotation.x = 0.35;
            midLeaf.rotation.y = midAngle;
            midLeaf.scale.set(0.9, 0.5, 0.9);
            midLeaf.castShadow = true;
            plantHead.add(midLeaf);
          }

          // Tier 3: Center Heart Cluster
          const heart = new THREE.Mesh(heartGeo, heartMat);
          heart.position.set(0, 0.06, 0);
          heart.scale.set(1.0, 1.2, 1.0);
          plantHead.add(heart);

          plantGroup.add(plantHead);
        }
      }
      group.add(plantGroup);

      // Structural Upright Frame & Lighting Gantry (Firmly mounted to bed corners)
      const gantryMat = new THREE.MeshStandardMaterial({
        color: 0x475569, // Galvanized industrial steel
        metalness: 0.85,
        roughness: 0.25,
      });

      // 4 Heavy-duty upright structural steel posts at bed corners (rising from y = 1.13 to y = 2.48m)
      [-2.8, 2.8].forEach((rz) => {
        // Left upright post
        const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35), gantryMat);
        postL.position.set(-1.18, 1.8, rz);
        postL.castShadow = true;
        group.add(postL);

        // Mounting base flange under left post
        const flangeL = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02), gantryMat);
        flangeL.position.set(-1.18, 1.14, rz);
        group.add(flangeL);

        // Right upright post
        const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.35), gantryMat);
        postR.position.set(1.18, 1.8, rz);
        postR.castShadow = true;
        group.add(postR);

        // Mounting base flange under right post
        const flangeR = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02), gantryMat);
        flangeR.position.set(1.18, 1.14, rz);
        group.add(flangeR);

        // Mid-level horizontal crossbar (supports misting pipe at y = 1.88)
        const midBar = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.035, 0.035), gantryMat);
        midBar.position.set(0, 1.88, rz);
        midBar.castShadow = true;
        group.add(midBar);

        // Top structural arch crossbar at y = 2.48m
        const topBar = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.05, 0.05), gantryMat);
        topBar.position.set(0, 2.48, rz);
        topBar.castShadow = true;
        group.add(topBar);
      });

      // Center Longitudinal Lighting Rail (runs down center of bed at y = 2.48m from z = -2.8 to 2.8)
      const centerRail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, 5.7),
        gantryMat
      );
      centerRail.position.set(0, 2.48, 0);
      centerRail.castShadow = true;
      group.add(centerRail);

      // MeanWell Industrial LED Driver Box mounted on top of center rail
      const driverBox = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.07, 0.38),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85 })
      );
      driverBox.position.set(0, 2.55, -2.4);
      group.add(driverBox);

      // Driver Power Pilot Indicator LED (Green when light ON, dark when OFF)
      const driverLed = new THREE.Mesh(
        new THREE.SphereGeometry(0.02, 10, 10),
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x10b981,
          emissiveIntensity: 0.9,
        })
      );
      driverLed.position.set(0.08, 2.59, -2.3);
      driverLedsRef.current.push(driverLed);
      group.add(driverLed);

      // Main Horticultural Extruded Aluminum LED Fixture Bar (y = 2.40m directly over crops)
      const fixtureGeo = new THREE.BoxGeometry(0.35, 0.08, 5.5);
      const fixtureMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.9,
      });
      const fixture = new THREE.Mesh(fixtureGeo, fixtureMat);
      fixture.name = "light";
      fixture.position.set(0, 2.40, 0);
      fixture.castShadow = true;
      group.add(fixture);

      // 4 Rigid Steel Bracket Hangers clamping fixture to center rail
      [-2.1, -0.7, 0.7, 2.1].forEach((bz) => {
        const bracket = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.08, 0.06),
          new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85 })
        );
        bracket.position.set(0, 2.45, bz);
        group.add(bracket);
      });

      // Top Diffuser Glow Plate on fixture bar (visible from above camera angles)
      const topDiffuserGeo = new THREE.BoxGeometry(0.32, 0.015, 5.3);
      const topDiffuserMat = new THREE.MeshStandardMaterial({
        color: 0xfff1b8,
        emissive: 0xffaa55,
        emissiveIntensity: 0.25,
      });
      const topDiffuser = new THREE.Mesh(topDiffuserGeo, topDiffuserMat);
      topDiffuser.position.set(0, 2.445, 0);
      growLightMeshesRef.current.push(topDiffuser);
      group.add(topDiffuser);

      // LED Light Strip Face (Warm Horticultural Light Face Underneath)
      const stripGeo = new THREE.BoxGeometry(0.3, 0.015, 5.3);
      const stripMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffaa55,
        emissiveIntensity: 0.25,
      });
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(0, 2.355, 0);
      growLightMeshesRef.current.push(strip);
      group.add(strip);

      // Volumetric Downward Light Curtain (Visible warm-golden light curtain pouring onto crops)
      const beamGeo = new THREE.BoxGeometry(1.6, 1.15, 5.2);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xffedd5,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.position.set(0, 1.77, 0);
      lightBeamsRef.current.push(beamMesh);
      group.add(beamMesh);

      // Dedicated Downward Horticultural SpotLight for this Bed
      const bedSpot = new THREE.SpotLight(0xffedd5, 0, 8, Math.PI / 2.8, 0.6, 1.2);
      bedSpot.position.set(0, 2.4, 0);
      bedSpot.target.position.set(0, 1.1, 0);
      group.add(bedSpot.target);
      group.add(bedSpot);
      growSpotLightsRef.current.push(bedSpot);

      // Elevated Overhead Irrigation Pipe (Suspended safely above crops at y = 1.88)
      const pipeGeo = new THREE.CylinderGeometry(0.035, 0.035, 6.0);
      const pipeMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        metalness: 0.85,
        roughness: 0.2,
      });
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.rotation.x = Math.PI / 2;
      pipe.position.set(0, 1.88, 0);
      pipe.castShadow = true;
      group.add(pipe);

      // Vertical Plumbing Riser connecting floor supply up to overhead pipe at front (z = 2.85)
      const riserPipeGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.8);
      const riserPipe = new THREE.Mesh(riserPipeGeo, pipeMat);
      riserPipe.position.set(0, 0.98, 2.85);
      riserPipe.castShadow = true;
      group.add(riserPipe);

      // Top 90-degree Elbow connecting Riser to Overhead Pipe
      const topElbow = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 12, 12),
        pipeMat
      );
      topElbow.position.set(0, 1.88, 2.85);
      group.add(topElbow);

      // Industrial Brass Solenoid Valve on Vertical Riser
      const valveGroup = new THREE.Group();
      valveGroup.position.set(0, 1.25, 2.85);

      const brassMat = new THREE.MeshStandardMaterial({
        color: 0xd97706, // Industrial Brass
        metalness: 0.85,
        roughness: 0.25,
      });
      const valveBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), brassMat);
      valveGroup.add(valveBody);

      // Solenoid Coil on top of valve
      const coilMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.038, 0.11),
        new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 })
      );
      coilMesh.position.set(0, 0.1, 0);
      valveGroup.add(coilMesh);

      // Solenoid Valve LED Status Indicator
      const isThisValveOpen = id === "bed_a" ? isValveAOpen : isValveBOpen;
      const vLedMat = new THREE.MeshStandardMaterial({
        color: isThisValveOpen ? 0x10b981 : 0xef4444,
        emissive: isThisValveOpen ? 0x10b981 : 0x000000,
        emissiveIntensity: isThisValveOpen ? 0.9 : 0,
      });
      const vLed = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 10), vLedMat);
      vLed.position.set(0, 0.17, 0);
      if (id === "bed_a") {
        valveALedRef.current = vLed;
      } else {
        valveBLedRef.current = vLed;
      }
      valveGroup.add(vLed);
      group.add(valveGroup);

      // Bottom 90-degree Elbow at floor level (ready to receive supply pipe)
      const botElbow = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 12, 12),
        pipeMat
      );
      botElbow.position.set(0, 0.08, 2.85);
      group.add(botElbow);

      // Micro-Mist Spray Nozzles (Hanging down from overhead pipe)
      const nozzleGeo = new THREE.CylinderGeometry(0.02, 0.035, 0.08);
      const nozzleMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.9,
      });
      [-2.0, -1.0, 0, 1.0, 2.0].forEach((nz) => {
        const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        nozzle.position.set(0, 1.83, nz);
        group.add(nozzle);
      });

      // ESP32 Node & Sensor Controller Enclosure (Mounted on front-left riser post)
      const valveBoxGeo = new THREE.BoxGeometry(0.32, 0.35, 0.25);
      const valveBoxMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.7,
      });
      const valveBox = new THREE.Mesh(valveBoxGeo, valveBoxMat);
      valveBox.position.set(-1.15, 1.45, 2.8);
      group.add(valveBox);

      // Controller Status Lamp
      const ledGeo = new THREE.SphereGeometry(0.06, 12, 12);
      const ledMat = new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x10b981,
        emissiveIntensity: 0.5,
      });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(-1.15, 1.66, 2.8);
      group.add(led);

      // Sprinkler Water Mist Particles (Physical falling droplet column from overhead nozzles at 1.83m down to soil at 1.14m)
      const particleCount = 360;
      const particleGeo = new THREE.BufferGeometry();
      const posArray = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount * 3; i += 3) {
        posArray[i] = (Math.random() - 0.5) * 2.2;
        posArray[i + 1] = 1.14 + Math.random() * 0.69; // smoothly distributed between nozzle and soil
        posArray[i + 2] = (Math.random() - 0.5) * 5.2;
      }
      particleGeo.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
      const particleMat = new THREE.PointsMaterial({
        color: 0x38bdf8,
        size: 0.05,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
      });
      const particles = new THREE.Points(particleGeo, particleMat);
      group.add(particles);

      group.position.set(xPos, 0.2, 0);
      return { group, particles };
    };

    const bedAObj = createSmartBed(-2.4, "bed_a", "แปลงผัก A");
    scene.add(bedAObj.group);
    bedASprinklersRef.current = bedAObj.particles;

    const bedBObj = createSmartBed(2.4, "bed_b", "แปลงผัก B");
    scene.add(bedBObj.group);
    bedBSprinklersRef.current = bedBObj.particles;

    // 8. Water Tank & Modbus Pump Station (Front-Left Dedicated Utility Bay - 100% Zero Bed Overlap)
    const tankGroup = new THREE.Group();
    tankGroup.name = "utility";
    tankGroup.position.set(-4.6, 0.2, 4.1);

    // Heavy Concrete Equipment Pad on Slab (Sized 1.8m x 1.8m: x: -5.5 to -3.7, z: 3.2 to 5.0 - Strictly past Bed A)
    const equipPadGeo = new THREE.BoxGeometry(1.8, 0.15, 1.8);
    const equipPadMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.7,
    });
    const equipPad = new THREE.Mesh(equipPadGeo, equipPadMat);
    equipPad.position.set(0, 0.075, 0);
    equipPad.receiveShadow = true;
    tankGroup.add(equipPad);

    // 8.1 Industrial Clear Acrylic Reservoir Tank (ถังใสคริสตัลเคลียร์ มองทะลุเห็นระดับน้ำชัดเจน 100%)
    const tankBodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xf0f9ff,
      transparent: true,
      opacity: 0.28,
      roughness: 0.08,
      metalness: 0.02,
      transmission: 0.75,
      ior: 1.45,
      clearcoat: 1.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // Main Cylindrical Clear Tank Body (R: 0.75m, H: 2.3m)
    // renderOrder = 2 and depthWrite = false ensures inner water mass is never occluded
    const tankBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.75, 2.3, 32),
      tankBodyMat
    );
    tankBody.position.set(-0.25, 1.25, 0);
    tankBody.renderOrder = 2;
    tankBody.receiveShadow = true;
    tankGroup.add(tankBody);

    // Internal Dynamic Water Mass Body (Rendered with renderOrder = 1 & depthWrite: true so it draws before the acrylic shell)
    const tankWaterGeo = new THREE.CylinderGeometry(0.72, 0.72, 2.1, 32);
    const tankWaterMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.85,
      roughness: 0.15,
      metalness: 0.1,
      depthWrite: true,
    });
    const tankWater = new THREE.Mesh(tankWaterGeo, tankWaterMat);
    tankWater.position.set(-0.25, 1.2, 0);
    tankWater.renderOrder = 1;
    waterMeshRef.current = tankWater;
    tankGroup.add(tankWater);

    // Base Skirt Ring & 4 Hold-down Mounting Anchor Lugs (ยึดแน่นกับแท่นคอนกรีต - Industrial Slate Steel)
    const skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.82, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 })
    );
    skirt.position.set(-0.25, 0.14, 0);
    tankGroup.add(skirt);

    const anchorLugMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85 });
    for (let a = 0; a < 4; a++) {
      const angle = (a * Math.PI) / 2 + Math.PI / 4;
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), anchorLugMat);
      lug.position.set(
        -0.25 + Math.cos(angle) * 0.84,
        0.14,
        Math.sin(angle) * 0.84
      );
      lug.rotation.y = -angle;
      tankGroup.add(lug);
    }

    // 8.2 Domed Tank Roof & Screw-on Inspection Manhole Hatch (Industrial Slate Steel)
    const domeRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.76, 0.22, 32),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.4, metalness: 0.7 })
    );
    domeRoof.position.set(-0.25, 2.45, 0);
    tankGroup.add(domeRoof);

    // Black Threaded Inspection Manhole Lid with Turn-Handles
    const hatchLid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.09, 24),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 })
    );
    hatchLid.position.set(-0.25, 2.58, 0);
    tankGroup.add(hatchLid);

    // Gooseneck Air Breather Vent Pipe (ท่อหายใจคอหงส์กันสูญญากาศ)
    const ventPipe = new THREE.Mesh(
      new THREE.TorusGeometry(0.08, 0.016, 8, 20, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 })
    );
    ventPipe.position.set(-0.55, 2.62, 0);
    tankGroup.add(ventPipe);

    // Emergency Flashing Strobe Beacon on Hatch Top
    const beaconGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.22, 14);
    const beaconMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.25,
    });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(-0.25, 2.72, 0);
    tankGroup.add(beacon);

    const emergencyLight = new THREE.PointLight(0xef4444, 0, 8);
    emergencyLight.position.set(-0.25, 2.9, 0);
    emergencyLightRef.current = emergencyLight;
    tankGroup.add(emergencyLight);

    // 8.3 External Sight-Glass Water Level Gauge (หลอดแก้วใสแสดงระดับน้ำภายนอก พร้อมสเกลลิตร)
    const sightGroup = new THREE.Group();
    sightGroup.position.set(-0.25 + 0.76, 1.25, 0.25);

    // Clear Glass Outer Protection Tube
    const sightTube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 1.7, 16),
      new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.35,
        roughness: 0.05,
        transmission: 0.9,
      })
    );
    sightGroup.add(sightTube);

    // Internal Dynamic Water Level Column in Sight Glass
    const sightWaterGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.5, 16);
    const sightWaterMat = new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      transparent: true,
      opacity: 0.85,
    });
    const sightWater = new THREE.Mesh(sightWaterGeo, sightWaterMat);
    sightWater.position.set(0, 0, 0);
    sightGroup.add(sightWater);

    // Brass Top & Bottom Mounting Unions to Tank
    const unionMat = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85 });
    [0.85, -0.85].forEach((uy) => {
      const union = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.08), unionMat);
      union.position.set(0, uy, 0);
      sightGroup.add(union);

      const nipple = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.12), unionMat);
      nipple.rotation.z = Math.PI / 2;
      nipple.position.set(-0.06, uy, 0);
      sightGroup.add(nipple);
    });

    // Liter Measurement Scale Backing Plate (250L, 500L, 750L, 1000L)
    const scalePlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.015, 1.6, 0.06),
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3 })
    );
    scalePlate.position.set(0.025, 0, 0);
    sightGroup.add(scalePlate);
    tankGroup.add(sightGroup);

    // 8.4 Top Auto-Refill Inlet Water Pipe & Float Valve
    const inletMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });
    const topInletPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6), inletMat);
    topInletPipe.position.set(-0.75, 2.3, 0);
    tankGroup.add(topInletPipe);

    const topInletElbow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), inletMat);
    topInletElbow.position.set(-0.75, 2.6, 0);
    tankGroup.add(topInletElbow);

    const topInletOver = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.35), inletMat);
    topInletOver.rotation.z = Math.PI / 2;
    topInletOver.position.set(-0.58, 2.6, 0);
    tankGroup.add(topInletOver);

    // Bottom Sediment Drain Tap with Brass Spigot
    const drainTap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.14),
      unionMat
    );
    drainTap.rotation.x = Math.PI / 2;
    drainTap.position.set(-0.25, 0.22, 0.78);
    tankGroup.add(drainTap);

    // 8.5 Centrifugal Booster Pump with Finned Motor & Volute Casing (Modbus Slave 1)
    const pumpGroup = new THREE.Group();
    pumpGroup.name = "pump";
    pumpGroup.position.set(0.45, 0.15, 0);

    // Pump Cast-Iron Volute Casing (ทรงหอยโข่งกลม)
    const voluteGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.22, 24);
    const pumpMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a, // Heavy industrial blue enamel
      metalness: 0.75,
      roughness: 0.35,
    });
    const volute = new THREE.Mesh(voluteGeo, pumpMat);
    volute.rotation.z = Math.PI / 2;
    volute.position.set(-0.14, 0.28, 0);
    volute.castShadow = true;
    pumpGroup.add(volute);

    // Finned Electric Motor Body
    const motorGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.44, 20);
    const motor = new THREE.Mesh(motorGeo, pumpMat);
    motor.rotation.z = Math.PI / 2;
    motor.position.set(0.18, 0.28, 0);
    motor.castShadow = true;
    pumpGroup.add(motor);

    // Rear Motor Fan Shroud
    const fanShroud = new THREE.Mesh(
      new THREE.CylinderGeometry(0.205, 0.205, 0.1, 20),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 })
    );
    fanShroud.rotation.z = Math.PI / 2;
    fanShroud.position.set(0.42, 0.28, 0);
    pumpGroup.add(fanShroud);

    // Motor Terminal Junction Box on top
    const termBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.1, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 })
    );
    termBox.position.set(0.18, 0.52, 0);
    pumpGroup.add(termBox);

    // Stainless Steel Round Pressure Gauge
    const gaugeStem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12), unionMat);
    gaugeStem.position.set(-0.14, 0.54, 0);
    pumpGroup.add(gaugeStem);

    const gaugeDial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.09, 0.04, 20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 })
    );
    gaugeDial.rotation.x = Math.PI / 2;
    gaugeDial.position.set(-0.14, 0.64, 0.02);
    pumpGroup.add(gaugeDial);

    tankGroup.add(pumpGroup);

    // Bottom Suction Pipe with Brass Ball Valve & Red Lever Handle (from tank bottom to pump suction)
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Industrial slate-grey pressure PVC/PE
      metalness: 0.85,
      roughness: 0.25,
    });

    const suctionPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.42), pipeMat);
    suctionPipe.rotation.z = Math.PI / 2;
    suctionPipe.position.set(0.08, 0.28, 0);
    tankGroup.add(suctionPipe);

    // Brass Ball Valve Body
    const ballValve = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), unionMat);
    ballValve.position.set(0.08, 0.28, 0);
    tankGroup.add(ballValve);

    // Red Lever Handle on Ball Valve
    const leverMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
    const valveLever = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.015, 0.16), leverMat);
    valveLever.position.set(0.08, 0.35, 0.06);
    tankGroup.add(valveLever);

    // Output discharge pipe from pump head leading out towards aisle
    const pumpOutletPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.7), pipeMat);
    pumpOutletPipe.rotation.z = Math.PI / 2;
    pumpOutletPipe.position.set(0.8, 0.42, 0);
    tankGroup.add(pumpOutletPipe);

    // Inline Industrial Disc Filter & Backwash Canister at Pump Discharge
    const filterGroup = new THREE.Group();
    filterGroup.position.set(0.82, 0.42, 0);
    const filterBody = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.26, 16),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.8, roughness: 0.3 })
    );
    filterGroup.add(filterBody);
    const filterBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.1, 14),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.6 })
    );
    filterBowl.position.set(0, -0.15, 0);
    filterGroup.add(filterBowl);
    tankGroup.add(filterGroup);

    scene.add(tankGroup);

    // Complete Ground Distribution Piping Network (World Coordinates)
    // Runs from pump discharge down to slab, connects Bed A and Bed B seamlessly
    const plumbingGroup = new THREE.Group();

    // 1. Vertical drop from pump discharge (x: -3.8, y: 0.62, z: 4.1) down to slab (y = 0.28)
    const dropPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34), pipeMat);
    dropPipe.position.set(-3.8, 0.45, 4.1);
    plumbingGroup.add(dropPipe);

    const dropElbow = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 12), pipeMat);
    dropElbow.position.set(-3.8, 0.28, 4.1);
    plumbingGroup.add(dropElbow);

    // 2. Supply pipe running along slab edge from z = 4.1 to z = 2.85 (length: 1.25m)
    const legZ = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.25), pipeMat);
    legZ.rotation.x = Math.PI / 2;
    legZ.position.set(-3.8, 0.28, 3.475);
    plumbingGroup.add(legZ);

    const cornerElbow = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 12), pipeMat);
    cornerElbow.position.set(-3.8, 0.28, 2.85);
    plumbingGroup.add(cornerElbow);

    // 3. Pipe running along X from x = -3.8 to Bed A riser at x = -2.4 (length: 1.4m)
    const legToBedA = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 1.4), pipeMat);
    legToBedA.rotation.z = Math.PI / 2;
    legToBedA.position.set(-3.1, 0.28, 2.85);
    plumbingGroup.add(legToBedA);

    // Tee-fitting at Bed A riser
    const teeBedA = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), pipeMat);
    teeBedA.position.set(-2.4, 0.28, 2.85);
    plumbingGroup.add(teeBedA);

    // 4. Main crossover pipe running across from Bed A (x = -2.4) to Bed B (x = 2.4) at z = 2.85
    const crossoverPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 4.8), pipeMat);
    crossoverPipe.rotation.z = Math.PI / 2;
    crossoverPipe.position.set(0, 0.28, 2.85);
    plumbingGroup.add(crossoverPipe);

    // End-elbow at Bed B riser
    const teeBedB = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), pipeMat);
    teeBedB.position.set(2.4, 0.28, 2.85);
    plumbingGroup.add(teeBedB);

    // 5. Industrial Floor Ramp Protector over Central Walkway (x: -1.0 to 1.0 at z = 2.85)
    // High-visibility OSHA safety yellow-and-black floor bridge protecting the pipe
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.8,
    });
    const rampBase = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.065, 0.32), rampMat);
    rampBase.position.set(0, 0.25, 2.85);
    rampBase.receiveShadow = true;
    plumbingGroup.add(rampBase);

    // Safety yellow alert stripe on ramp
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 });
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.07, 0.07), stripeMat);
    stripe.position.set(0, 0.255, 2.85);
    plumbingGroup.add(stripe);

    scene.add(plumbingGroup);

    // 9. Back Wall Industrial Ventilation Fan Station (Deep Shroud + 5 Aerofoil Blades + Wind Swirl)
    const fanGroup = new THREE.Group();
    fanGroup.name = "climate";
    fanGroup.position.set(0, 3.2, -4.88);

    // 9.1 Outer Heavy Square Wall Mounting Frame
    const fanBoxGeo = new THREE.BoxGeometry(2.4, 2.4, 0.22);
    const fanBoxMat = new THREE.MeshStandardMaterial({
      color: 0xd1d5db,
      metalness: 0.85,
      roughness: 0.25,
    });
    const fanBox = new THREE.Mesh(fanBoxGeo, fanBoxMat);
    fanBox.castShadow = true;
    fanGroup.add(fanBox);

    // 9.2 Hazard Warning Borders (High-visibility Industrial Amber/Black)
    const hazardMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.4 });
    const hazardTop = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.08, 0.25), hazardMat);
    hazardTop.position.set(0, 1.2, 0);
    fanGroup.add(hazardTop);

    const hazardBottom = new THREE.Mesh(new THREE.BoxGeometry(2.44, 0.08, 0.25), hazardMat);
    hazardBottom.position.set(0, -1.2, 0);
    fanGroup.add(hazardBottom);

    // Corner Mounting Bolt Plates (4 corners)
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9 });
    [
      [-1.05, 1.05],
      [1.05, 1.05],
      [-1.05, -1.05],
      [1.05, -1.05],
    ].forEach(([bx, by]) => {
      const boltPlate = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.26), boltMat);
      boltPlate.position.set(bx, by, 0);
      fanGroup.add(boltPlate);
    });

    // 9.3 Deep Hollow Cylindrical Barrel Vent Shroud (Creates real visual depth into wall)
    const shroudOuterGeo = new THREE.CylinderGeometry(0.98, 0.98, 0.28, 36, 1, true);
    const shroudMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.8,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });
    const shroudOuter = new THREE.Mesh(shroudOuterGeo, shroudMat);
    shroudOuter.rotation.x = Math.PI / 2;
    shroudOuter.position.z = 0.02;
    fanGroup.add(shroudOuter);

    // Dark Cavity Backplate (Gives deep black tunnel contrast behind blades)
    const cavityBack = new THREE.Mesh(
      new THREE.CircleGeometry(0.96, 36),
      new THREE.MeshBasicMaterial({ color: 0x050b14 })
    );
    cavityBack.position.z = -0.11;
    fanGroup.add(cavityBack);

    // 9.4 Central Electric Motor Hub & Bullet Nose Cone
    const motorHubGeo = new THREE.CylinderGeometry(0.25, 0.28, 0.24, 24);
    const motorHubMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.25,
    });
    const motorHub = new THREE.Mesh(motorHubGeo, motorHubMat);
    motorHub.rotation.x = Math.PI / 2;
    motorHub.position.set(0, 0, 0.02);
    fanGroup.add(motorHub);

    // Aerodynamic Bullet Nose Cone
    const noseCone = new THREE.Mesh(
      new THREE.ConeGeometry(0.25, 0.24, 24),
      new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.9, roughness: 0.2 })
    );
    noseCone.rotation.x = Math.PI / 2;
    noseCone.position.set(0, 0, 0.2);
    fanGroup.add(noseCone);

    // 9.5 Iconic 5-Blade Aerofoil Turbine Propeller (Visible & distinctly sculpted)
    const bladesGroup = new THREE.Group();
    bladesGroup.position.set(0, 0, 0.06);

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9,
      metalness: 0.92,
      roughness: 0.18,
    });
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15, // safety yellow tip for instant fan recognition
      roughness: 0.3,
      metalness: 0.6,
    });

    for (let i = 0; i < 5; i++) {
      const bladeArm = new THREE.Group();
      bladeArm.rotation.z = (i * (Math.PI * 2)) / 5;

      // Curved Aerofoil Blade
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.58, 0.028), bladeMat);
      blade.position.set(0, 0.42, 0);
      blade.rotation.y = 0.56; // 32-degree aerodynamic attack pitch angle
      blade.castShadow = true;
      bladeArm.add(blade);

      // Yellow Tip
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.03), tipMat);
      tip.position.set(0, 0.74, 0);
      tip.rotation.y = 0.56;
      bladeArm.add(tip);

      bladesGroup.add(bladeArm);
    }
    fanGroup.add(bladesGroup);
    fanBladesRef.current = bladesGroup;

    // 9.6 Protective See-Through Safety Grille Rings (Concentric circles, 100% see-through)
    const grilleGroup = new THREE.Group();
    grilleGroup.position.z = 0.17;
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });

    [0.35, 0.65, 0.94].forEach((radius) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 36), wireMat);
      grilleGroup.add(ring);
    });

    // 8 Radial Spokes
    for (let s = 0; s < 8; s++) {
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.94), wireMat);
      spoke.rotation.z = (s * Math.PI) / 4;
      spoke.position.set(
        Math.cos((s * Math.PI) / 4 + Math.PI / 2) * 0.47,
        Math.sin((s * Math.PI) / 4 + Math.PI / 2) * 0.47,
        0
      );
      grilleGroup.add(spoke);
    }
    fanGroup.add(grilleGroup);

    // 9.7 External Control Enclosure & Status Indicator
    const ctrlBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, 0.42, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 })
    );
    ctrlBox.position.set(1.36, -0.3, 0.02);
    fanGroup.add(ctrlBox);

    const ledMat = new THREE.MeshStandardMaterial({
      color: isFanRunning ? 0x10b981 : 0x64748b,
      emissive: isFanRunning ? 0x10b981 : 0x000000,
      emissiveIntensity: isFanRunning ? 0.9 : 0,
    });
    const ledMesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 14), ledMat);
    ledMesh.position.set(1.36, -0.2, 0.11);
    fanLedRef.current = ledMesh;
    fanGroup.add(ledMesh);

    scene.add(fanGroup);

    // 10. Horticultural Grow Light Fixtures (Actuator: light) are firmly integrated on overhead bed gantries


    // 11. Raycaster Click & Hover Telemetry Inspection
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const handleCanvasClick = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        let target: THREE.Object3D | null = intersects[0].object;
        while (target && !target.name && target.parent && target.parent !== scene) {
          target = target.parent;
        }

        if (target?.name === "bed_a") {
          onSelectDevice?.("bed_a", "node");
        } else if (target?.name === "bed_b") {
          onSelectDevice?.("bed_b", "node");
        } else if (target?.name === "climate") {
          onSelectDevice?.("climate", "node");
        } else if (target?.name === "utility") {
          onSelectDevice?.("utility", "node");
        } else if (target?.name === "pump") {
          onSelectDevice?.("pump", "actuator");
        } else if (target?.name === "light") {
          onSelectDevice?.("light", "actuator");
        }
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      if (intersects.length > 0) {
        let target: THREE.Object3D | null = intersects[0].object;
        while (target && !target.name && target.parent && target.parent !== scene) {
          target = target.parent;
        }

        const name = target?.name;
        if (name && ["bed_a", "bed_b", "climate", "utility", "pump", "light"].includes(name)) {
          renderer.domElement.style.cursor = "pointer";
          const snap = snapshotRef.current;
          const cfg = snap.config;
          const bA = snap.nodes.bed_a;
          const bB = snap.nodes.bed_b;
          const clim = snap.nodes.climate;
          const util = snap.nodes.utility;
          const pmp = snap.actuators.pump;
          const fn = snap.actuators.fan;
          const lit = snap.actuators.light;

          const isWaterL = snap.water_low;
          const isFanR = fn?.running === 1 || clim?.output_state === 1;
          const isLightR = lit?.running === 1 || util?.output_state === 1;
          const isPumpR = pmp?.running === 1;
          const isValveAR = bA?.output_state === 1;
          const isValveBR = bB?.output_state === 1;

          let info: HoverTooltipData | null = null;

          if (name === "utility" || name === "pump") {
            info = {
              id: "utility",
              title: "ถังพักน้ำและปั๊มสูบจ่าย (Utility)",
              subtitle: "ถังใสอะคริลิก Food-grade & Booster Pump",
              metricLabel: "ระดับน้ำในถัง",
              metricValue: isWaterL ? "18% (วิกฤต/ใกล้หมด!)" : "78% (ปกติ 780L)",
              statusLabel: isPumpR ? "ปั๊มน้ำ: กำลังสูบจ่าย (ON)" : "ปั๊มน้ำ: สแตนด์บาย (OFF)",
              statusColor: isWaterL ? "rose" : isPumpR ? "emerald" : "sky",
              screenX: e.clientX - rect.left,
              screenY: e.clientY - rect.top,
            };
          } else if (name === "climate") {
            info = {
              id: "climate",
              title: "พัดลมระบายอากาศ (Exhaust Fan)",
              subtitle: "ใบพัดเทอร์ไบน์ 5 แฉก มอเตอร์ความเร็วรอบสูง",
              metricLabel: "อุณหภูมิโรงเรือน",
              metricValue: `${(clim?.analog_value ?? 0).toFixed(1)}°C (เกณฑ์: ${cfg.temp_high}°C)`,
              statusLabel: isFanR ? "พัดลม: กำลังระบายอากาศ (ON)" : "พัดลม: สแตนด์บาย (OFF)",
              statusColor: isFanR ? "amber" : "sky",
              screenX: e.clientX - rect.left,
              screenY: e.clientY - rect.top,
            };
          } else if (name === "bed_a") {
            info = {
              id: "bed_a",
              title: "แปลงผัก A (Green Oak)",
              subtitle: "ระบบรดน้ำพ่นหมอกและเซนเซอร์ความชื้นดิน",
              metricLabel: "ความชื้นดินแปลง A",
              metricValue: `${(bA?.analog_value ?? 0).toFixed(1)}% (เกณฑ์: ${cfg.moisture_a_min}%)`,
              statusLabel: isValveAR ? "สปริงเกลอร์: กำลังรดน้ำ (ON)" : "สปริงเกลอร์: ปิดวาล์ว (OFF)",
              statusColor: isValveAR ? "emerald" : "sky",
              screenX: e.clientX - rect.left,
              screenY: e.clientY - rect.top,
            };
          } else if (name === "bed_b") {
            info = {
              id: "bed_b",
              title: "แปลงผัก B (Red Oak)",
              subtitle: "ระบบรดน้ำพ่นหมอกและเซนเซอร์ความชื้นดิน",
              metricLabel: "ความชื้นดินแปลง B",
              metricValue: `${(bB?.analog_value ?? 0).toFixed(1)}% (เกณฑ์: ${cfg.moisture_b_min}%)`,
              statusLabel: isValveBR ? "สปริงเกลอร์: กำลังรดน้ำ (ON)" : "สปริงเกลอร์: ปิดวาล์ว (OFF)",
              statusColor: isValveBR ? "emerald" : "sky",
              screenX: e.clientX - rect.left,
              screenY: e.clientY - rect.top,
            };
          } else if (name === "light") {
            info = {
              id: "light",
              title: "โคมไฟปลูกพืช (Grow Light LED)",
              subtitle: "Full-Spectrum Horticultural LED Gantry",
              metricLabel: "ความเข้มแสงในโรงเรือน",
              metricValue: `${(util?.analog_value ?? 0).toFixed(1)}% (เกณฑ์: ${cfg.light_min}%)`,
              statusLabel: isLightR ? "โคมไฟ: เปิดสังเคราะห์แสง (ON)" : "โคมไฟ: ปิดพักโคม (OFF)",
              statusColor: isLightR ? "amber" : "sky",
              screenX: e.clientX - rect.left,
              screenY: e.clientY - rect.top,
            };
          }

          setHoveredData(info);
          return;
        }
      }

      renderer.domElement.style.cursor = "grab";
      setHoveredData(null);
    };

    const handlePointerLeave = () => {
      renderer.domElement.style.cursor = "default";
      setHoveredData(null);
    };

    renderer.domElement.addEventListener("click", handleCanvasClick);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerleave", handlePointerLeave);

    // 12. Resize Observer
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 13. Animation Loop
    let animationId: number;
    let clock = new THREE.Clock();

    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      controls.update();

      const {
        isFanRunning: activeFan,
        isLightOn: activeLight,
        isPumpRunning: activePump,
        isValveAOpen: activeValveA,
        isValveBOpen: activeValveB,
        isWaterLow: activeWaterLow,
      } = stateRef.current;

      // 1. Fan motor with natural acceleration and coasting inertia (clean turbine, no wind clutter)
      const targetFanSpeed = activeFan ? 24.0 : 0.0;
      fanSpeedRef.current = THREE.MathUtils.lerp(
        fanSpeedRef.current,
        targetFanSpeed,
        Math.min(1, delta * 2.8),
      );

      if (fanBladesRef.current && fanSpeedRef.current > 0.005) {
        fanBladesRef.current.rotation.z += delta * fanSpeedRef.current;
      }

      // 2. Clear Tank Dynamic Water Mass Lerp & Physical Slosh Wave
      const targetWaterFraction = activeWaterLow ? 0.22 : 1.0;
      waterLevelRef.current = THREE.MathUtils.lerp(
        waterLevelRef.current,
        targetWaterFraction,
        Math.min(1, delta * 2.5),
      );

      if (waterMeshRef.current) {
        const fraction = waterLevelRef.current;
        waterMeshRef.current.scale.set(1, fraction, 1);
        // Base of water cylinder is at y = 0.15 (just above concrete pad). Full height = 2.1m.
        // Center at fraction f is: 0.15 + (2.1 * f) / 2
        const centerY = 0.15 + (2.1 * fraction) / 2;
        const slosh = activePump ? Math.sin(time * 8.0) * 0.012 : 0;
        waterMeshRef.current.position.y = centerY + slosh;

        const waterMat = waterMeshRef.current.material as THREE.MeshStandardMaterial;
        const targetColor = activeWaterLow ? new THREE.Color(0xef4444) : new THREE.Color(0x0ea5e9);
        waterMat.color.lerp(targetColor, Math.min(1, delta * 3.5));
      }

      // 3. Grow Light Smooth Dimming, Volumetric Beam, and 360-degree Emissive Fade
      const targetLightIntensity = activeLight ? 3.5 : 0.0;
      lightIntensityRef.current = THREE.MathUtils.lerp(
        lightIntensityRef.current,
        targetLightIntensity,
        Math.min(1, delta * 4.0),
      );

      // Dedicated Dual-bed Spotlights
      growSpotLightsRef.current.forEach((spot) => {
        spot.intensity = (lightIntensityRef.current / 3.5) * 4.8;
      });

      // Volumetric God-ray Light Curtains
      lightBeamsRef.current.forEach((beam) => {
        const mat = beam.material as THREE.MeshBasicMaterial;
        mat.opacity = (lightIntensityRef.current / 3.5) * 0.22;
      });

      // 360-degree Top Diffuser & Underside Strip Emissive
      growLightMeshesRef.current.forEach((mesh) => {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = lightIntensityRef.current * 0.75;
      });

      // Driver Box Power Pilot LEDs
      driverLedsRef.current.forEach((led) => {
        const mat = led.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = activeLight ? 0.9 : 0;
        mat.color.setHex(activeLight ? 0x10b981 : 0x334155);
      });

      // 4. Sprinkler Falling Raindrop Physics (Water droplets fall physically onto soil)
      if (bedASprinklersRef.current) {
        const mat = bedASprinklersRef.current.material as THREE.PointsMaterial;
        mat.opacity = THREE.MathUtils.lerp(
          mat.opacity,
          activeValveA ? 0.85 : 0.0,
          Math.min(1, delta * 4.5),
        );
        if (mat.opacity > 0.01) {
          const geo = bedASprinklersRef.current.geometry;
          const pos = geo.attributes.position.array as Float32Array;
          for (let i = 1; i < pos.length; i += 3) {
            pos[i] -= delta * 1.8; // Gravity fall
            if (pos[i] < 1.14) {
              pos[i] = 1.83; // Respawn at nozzle height
              pos[i - 1] = (Math.random() - 0.5) * 2.2;
              pos[i + 1] = (Math.random() - 0.5) * 5.2;
            }
          }
          geo.attributes.position.needsUpdate = true;
        }
      }

      if (bedBSprinklersRef.current) {
        const mat = bedBSprinklersRef.current.material as THREE.PointsMaterial;
        mat.opacity = THREE.MathUtils.lerp(
          mat.opacity,
          activeValveB ? 0.85 : 0.0,
          Math.min(1, delta * 4.5),
        );
        if (mat.opacity > 0.01) {
          const geo = bedBSprinklersRef.current.geometry;
          const pos = geo.attributes.position.array as Float32Array;
          for (let i = 1; i < pos.length; i += 3) {
            pos[i] -= delta * 1.8; // Gravity fall
            if (pos[i] < 1.14) {
              pos[i] = 1.83; // Respawn at nozzle height
              pos[i - 1] = (Math.random() - 0.5) * 2.2;
              pos[i + 1] = (Math.random() - 0.5) * 5.2;
            }
          }
          geo.attributes.position.needsUpdate = true;
        }
      }

      // 5. Emergency Low Water Strobe Light
      if (emergencyLightRef.current && activeWaterLow) {
        const pulse = (Math.sin(time * 10) + 1) * 2.0;
        emergencyLightRef.current.intensity = pulse;
      } else if (emergencyLightRef.current) {
        emergencyLightRef.current.intensity = 0;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("click", handleCanvasClick);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Hardware Status Indicators when Snapshot changes
  useEffect(() => {
    // 1. Industrial Fan Status LED
    if (fanLedRef.current) {
      const ledMat = fanLedRef.current.material as THREE.MeshStandardMaterial;
      if (isFanRunning) {
        ledMat.color.setHex(0x10b981);
        ledMat.emissive.setHex(0x10b981);
        ledMat.emissiveIntensity = 0.9;
      } else {
        ledMat.color.setHex(0x64748b);
        ledMat.emissive.setHex(0x000000);
        ledMat.emissiveIntensity = 0;
      }
    }

    // 5. Industrial Solenoid Valve LEDs on Bed Risers
    if (valveALedRef.current) {
      const mat = valveALedRef.current.material as THREE.MeshStandardMaterial;
      mat.color.setHex(isValveAOpen ? 0x10b981 : 0xef4444);
      mat.emissive.setHex(isValveAOpen ? 0x10b981 : 0x000000);
      mat.emissiveIntensity = isValveAOpen ? 0.9 : 0;
    }
    if (valveBLedRef.current) {
      const mat = valveBLedRef.current.material as THREE.MeshStandardMaterial;
      mat.color.setHex(isValveBOpen ? 0x10b981 : 0xef4444);
      mat.emissive.setHex(isValveBOpen ? 0x10b981 : 0x000000);
      mat.emissiveIntensity = isValveBOpen ? 0.9 : 0;
    }
  }, [
    isFanRunning,
    isLightOn,
    isPumpRunning,
    isValveAOpen,
    isValveBOpen,
    isWaterLow,
  ]);

  return (
    <div className="relative h-full w-full overflow-hidden select-none">
      {/* Top Left Floating Digital Twin Badge */}
      <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="border-primary/50 bg-background/80 text-primary backdrop-blur-md px-3 py-1.5 text-xs font-semibold gap-1.5 shadow-md"
        >
          <RiCompass3Line className="size-4 text-primary animate-spin-slow" />
          IMMERSIVE 3D GREENHOUSE (OPEN INTERIOR)
        </Badge>
        {isWaterLow && (
          <Badge
            variant="destructive"
            className="animate-pulse text-xs font-semibold gap-1 shadow-md"
          >
            <RiAlertFill className="size-4" /> WATER LOW ALARM
          </Badge>
        )}
      </div>

      {/* Top Right Camera Presets */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-background/80 backdrop-blur-md p-1.5 rounded-2xl border border-border/80 shadow-lg">
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setCameraView("overview")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <RiRestartLine className="size-3 text-primary" /> ภาพรวม
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setCameraView("bed_a")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <RiPlantLine className="size-3 text-emerald-400" /> แปลง A
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setCameraView("bed_b")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <RiPlantLine className="size-3 text-cyan-400" /> แปลง B
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setCameraView("light")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <RiSunLine className="size-3 text-amber-300" /> ไฟปลูกพืช
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setCameraView("tank")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <RiDropLine className="size-3 text-sky-400" /> ถังน้ำ/ปั๊ม
        </Button>
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setCameraView("fan")}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          <RiTempHotLine className="size-3 text-amber-400" /> พัดลม
        </Button>
      </div>

      {/* Fullscreen 3D Canvas */}
      <div
        ref={mountRef}
        className="h-full w-full min-h-[calc(100vh-60px)] cursor-grab active:cursor-grabbing"
      />

      {/* Interactive 3D Model Telemetry Hover Tooltip */}
      {hoveredData && (
        <div
          className="absolute pointer-events-none z-30 transition-all duration-75 ease-out"
          style={{
            left: Math.min(
              hoveredData.screenX + 16,
              (mountRef.current?.clientWidth ?? 800) - 270
            ),
            top: Math.max(
              16,
              Math.min(
                hoveredData.screenY - 24,
                (mountRef.current?.clientHeight ?? 600) - 160
              )
            ),
          }}
        >
          <div className="flex flex-col gap-1.5 rounded-2xl border border-primary/40 bg-background/90 backdrop-blur-xl px-4 py-3 shadow-2xl min-w-[240px] max-w-[290px]">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-1.5">
              <div className="flex items-center gap-1.5 font-semibold text-xs text-foreground">
                {hoveredData.id === "utility" && <RiDropLine className="size-4 text-sky-400" />}
                {hoveredData.id === "climate" && <RiTempHotLine className="size-4 text-amber-400" />}
                {(hoveredData.id === "bed_a" || hoveredData.id === "bed_b") && (
                  <RiPlantLine className="size-4 text-emerald-400" />
                )}
                {hoveredData.id === "light" && <RiSunLine className="size-4 text-amber-300" />}
                <span>{hoveredData.title}</span>
              </div>
              <span
                className={`size-2 rounded-full ${
                  hoveredData.statusColor === "emerald"
                    ? "bg-emerald-400 animate-pulse"
                    : hoveredData.statusColor === "amber"
                    ? "bg-amber-400 animate-pulse"
                    : hoveredData.statusColor === "rose"
                    ? "bg-rose-500 animate-ping"
                    : "bg-sky-400"
                }`}
              />
            </div>

            {/* Subtitle / Description */}
            <p className="text-[11px] text-muted-foreground/80 leading-tight">
              {hoveredData.subtitle}
            </p>

            {/* Live Telemetry Value & Percentage */}
            <div className="flex items-baseline justify-between gap-2 mt-0.5 rounded-lg bg-muted/40 px-2.5 py-1.5 border border-border/40">
              <span className="text-[11px] text-muted-foreground font-medium">
                {hoveredData.metricLabel}
              </span>
              <span className="text-xs font-bold text-primary tabular-nums">
                {hoveredData.metricValue}
              </span>
            </div>

            {/* Hardware Status */}
            <div className="flex items-center justify-between text-[11px] pt-0.5">
              <span className="text-muted-foreground">สถานะ:</span>
              <span
                className={`font-semibold ${
                  hoveredData.statusColor === "emerald"
                    ? "text-emerald-400"
                    : hoveredData.statusColor === "amber"
                    ? "text-amber-400"
                    : hoveredData.statusColor === "rose"
                    ? "text-rose-400 font-bold"
                    : "text-sky-400"
                }`}
              >
                {hoveredData.statusLabel}
              </span>
            </div>

            <p className="text-[10px] text-muted-foreground/60 italic pt-1 border-t border-border/30">
              คลิกเพื่อเปิดดูรายละเอียดและการตั้งค่า
            </p>
          </div>
        </div>
      )}

      {/* Bottom Floating Interactive HUD Overlays */}
      <div className="absolute bottom-5 inset-x-5 z-20 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        {/* Left Side: Live Hardware Pins */}
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          {/* Bed A Live Pin */}
          <button
            onClick={() => onSelectDevice?.("bed_a", "node")}
            className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/85 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-primary hover:scale-105 shadow-md"
          >
            <span
              className={`size-2.5 rounded-full ${
                isValveAOpen
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-muted-foreground/40"
              }`}
            />
            <span>แปลง A:</span>
            <span className="font-bold text-primary tabular-nums">
              {bedA?.analog_value.toFixed(1) ?? 0}%
            </span>
          </button>

          {/* Bed B Live Pin */}
          <button
            onClick={() => onSelectDevice?.("bed_b", "node")}
            className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/85 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-primary hover:scale-105 shadow-md"
          >
            <span
              className={`size-2.5 rounded-full ${
                isValveBOpen
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-muted-foreground/40"
              }`}
            />
            <span>แปลง B:</span>
            <span className="font-bold text-primary tabular-nums">
              {bedB?.analog_value.toFixed(1) ?? 0}%
            </span>
          </button>

          {/* Climate Live Pin */}
          <button
            onClick={() => onSelectDevice?.("climate", "node")}
            className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/85 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-amber-400 hover:scale-105 shadow-md"
          >
            <span
              className={`size-2.5 rounded-full ${
                isFanRunning
                  ? "bg-amber-400 animate-pulse"
                  : "bg-muted-foreground/40"
              }`}
            />
            <span>อุณหภูมิ:</span>
            <span className="font-bold text-amber-400 tabular-nums">
              {climate?.analog_value.toFixed(1) ?? 0}°C
            </span>
          </button>

          {/* Light Live Pin */}
          <button
            onClick={() => onSelectDevice?.("utility", "node")}
            className="flex items-center gap-1.5 rounded-xl border border-border/80 bg-background/85 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-amber-300 hover:scale-105 shadow-md"
          >
            <span
              className={`size-2.5 rounded-full ${
                isLightOn
                  ? "bg-amber-300 animate-pulse"
                  : "bg-muted-foreground/40"
              }`}
            />
            <span>ความเข้มแสง:</span>
            <span className="font-bold text-amber-300 tabular-nums">
              {utility?.analog_value.toFixed(1) ?? 0}%
            </span>
          </button>
        </div>

        {/* Right Side: Quick Action Drawers Button Group */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <Button
            variant="default"
            size="sm"
            onClick={() => onOpenDrawerTab?.("controls")}
            className="shadow-md gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
          >
            <RiEqualizerLine className="size-3.5" />
            <span>แผงควบคุมสถานี</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenDrawerTab?.("charts")}
            className="shadow-md gap-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-medium"
          >
            <RiLineChartLine className="size-3.5 text-sky-500" />
            <span>กราฟวิเคราะห์</span>
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenDrawerTab?.("events")}
            className="shadow-md gap-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs font-medium"
          >
            <RiFileList3Line className="size-3.5 text-amber-500" />
            <span>บันทึกเหตุการณ์</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
