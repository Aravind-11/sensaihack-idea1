# SensAI Mission Control XR

A WebXR-powered 3D mission control dashboard for visualizing autonomous agent decision-making in real time. Built for the PICO headset, this app renders a procedural city environment where AI-driven vehicles navigate, think, and interact — with full audit log transparency and tamper-evident integrity verification.

## Features

- **3D Agent Visualization** — Each autonomous vehicle is rendered in a procedural city with real-time "thought bubbles" showing intent, perception, and speed.
- **Tamper-Evident Audit Logs** — Every agent event (OBSERVE / THINK / ACTION) is cryptographically chained using SHA-256 and HMAC via the Web Crypto API. One-click integrity verification.
- **Replay Scrubber** — Rewind and fast-forward the entire simulation tick-by-tick to inspect agent behavior at any point in time.
- **AI Audit Diagnosis** — An automated diagnostic system analyzes agent logs for anomalies: low confidence decisions, excessive speed, high interaction density.
- **Agent Interpretability Panel** — Click any agent card to drill into its current state: position, intent, perception, confidence, and speed.
- **Multiple Scenarios** — Switch between City Merge, Highway, and Roundabout driving scenarios with distinct road layouts and agent behaviors.
- **WebXR Ready** — Enter immersive VR on a PICO headset (or any WebXR-capable browser). Includes WASD keyboard locomotion for desktop testing.
- **Performance Modes** — Toggle between Low / Medium / High rendering quality to match your hardware.

## Tech Stack

- **React 19** + **TypeScript** + **Vite**
- **@react-three/fiber** — React renderer for Three.js
- **@react-three/drei** — Helpers (OrbitControls, Text, Sky, Grid, etc.)
- **@react-three/xr** — WebXR integration
- **Three.js** — 3D rendering engine
- **Web Crypto API** — Browser-native cryptographic log verification

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (accessible on local network for headset testing)
npm run dev -- --host
```

Open `http://localhost:5173` in your browser, or on a PICO headset via ADB reverse:

```bash
adb reverse tcp:5173 tcp:5173
# Then open http://localhost:5173 in PICO Browser
```

## Project Structure

```
src/
├── App.tsx                    # Main scene, XR setup, world geometry, agent rendering
├── audit/
│   ├── clientLog.ts           # Tamper-evident log chain (Web Crypto API)
│   ├── diagnostics.ts         # AI audit diagnosis engine
│   └── replay.ts              # State reconstruction & interaction extraction
├── components/
│   ├── MissionControl.tsx     # HUD panel: logs, scrubber, agent cards, diagnosis
│   └── SpatialAgent.tsx       # 3D agent with car body, thought text, vision cone
└── types/
    └── audit.ts               # TypeScript types for events, payloads, agent state
```

## Build for Production

```bash
npm run build
npm run preview
```
