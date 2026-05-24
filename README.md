# 🚗 Circuit AI Car — Reinforcement Learning Simulator

> **Pumpkin Factory Makerspace · Student Rover Challenge Korea**

Train an AI car to autonomously navigate a circuit track using **Q-Learning**, then export the learned policy directly to **Arduino** firmware. Available as both a desktop application and a browser-based web app.

---

## 📌 Overview

This project provides a complete pipeline for teaching a small robot car to drive autonomously around a square circuit with a central obstacle — entirely through reinforcement learning, with no hand-coded rules.

The workflow is:

```
Train in Simulator  →  Export Policy  →  Flash to Arduino  →  Physical Car Runs
```

The car learns purely from sensor feedback (3 ultrasonic sensors) and a reward signal. Once training is complete, the learned Q-table is compiled into a compact Arduino-compatible C array and flashed to the hardware.

---

## 📁 Repository Structure

```
.
├── RLCAR_nambu.py        # Desktop simulator (Python / PyQt5)
├── rl_car_webapp.jsx     # Browser-based simulator (React)
└── README.md
```

---

## 🗺️ Environment Design

The simulation environment models a real physical track that can be built from cardboard or foam board.

```
┌─────────────────────┐
│  ←  Road Width →    │
│  ┌───────────────┐  │
│  │               │  │
│  │   Obstacle    │  │  ↕ Road Width
│  │  (variable)   │  │
│  │               │  │
│  └───────────────┘  │
└─────────────────────┘

Total Size = Obstacle Size + (Road Width × 2)
```

| Parameter | Default | Range |
|---|---|---|
| Obstacle size | 30 cm | 10 – 60 cm |
| Road width | 40 cm | 20 – 60 cm |
| Total track size | 110 × 110 cm | configurable |

The car starts at the bottom center of the track and must complete **laps** by passing through 4 sequential checkpoints (top, right, bottom, left).

---

## 🧠 Reinforcement Learning

### Algorithm: Tabular Q-Learning

Q-Learning is a model-free RL algorithm. The agent maintains a table (`Q-table`) mapping every `(state, action)` pair to an expected cumulative reward. At each step it updates this table using the Bellman equation:

```
Q(s, a) ← Q(s, a) + α × [ r + γ × max Q(s', a') − Q(s, a) ]
```

| Symbol | Meaning | Default |
|---|---|---|
| `α` (alpha) | Learning rate | 0.1 – 0.15 |
| `γ` (gamma) | Discount factor | 0.95 |
| `ε` (epsilon) | Exploration rate | starts at 1.0 |
| `ε decay` | Epsilon decay per episode | 0.995 |
| `ε min` | Minimum exploration | 0.01 |

### State Space

The car has **3 ultrasonic sensors** (left −45°, center 0°, right +45°), each reading distance in cm. Continuous distances are **discretized into 5 levels**:

| Level | Distance |
|---|---|
| 0 | < 10 cm |
| 1 | 10 – 20 cm |
| 2 | 20 – 30 cm |
| 3 | 30 – 40 cm |
| 4 | ≥ 40 cm |

Three sensors × 5 levels each → **5³ = 125 total states**

### Action Space

5 discrete actions:

| Action | Description | Turn Angle |
|---|---|---|
| 0 | Forward | 0° |
| 1 | Gentle Left | −8° |
| 2 | Gentle Right | +8° |
| 3 | Sharp Left | −15° (slower speed) |
| 4 | Sharp Right | +15° (slower speed) |

### Reward Function

| Event | Reward |
|---|---|
| Collision (wall or obstacle) | **−100** |
| Passing a checkpoint in order | **+20** |
| Completing a full lap | **+100** |
| Distance moved per step | **+0.1 × distance** |
| Sensor balance (left ≈ right, < 5 cm diff) | **+1.0** |
| Sensor balance (< 10 cm diff) | **+0.5** |
| Any sensor < 10 cm (near miss) | **−5** |
| Any sensor < 15 cm | **−2** |

The reward function encourages the car to: stay near the center of the road, avoid walls, pass checkpoints in order, and complete laps.

---

## 💻 Desktop Application — `RLCAR_nambu.py`

A full-featured desktop simulator built with **Python + PyQt5**.

### Features

- Real-time animated simulation canvas
- Background training thread (non-blocking UI)
- Live training graphs: episode reward, laps per episode, epsilon decay, cumulative reward
- Full Q-table / policy viewer
- Pause / resume / stop training at any time
- Save & load model as JSON
- Export trained policy as ready-to-flash **Arduino `.ino` code**
- Adjustable environment: obstacle size, road width, all RL hyperparameters

### Requirements

```bash
pip install PyQt5 numpy matplotlib
```

### Run

```bash
python RLCAR_nambu.py
```

### Training workflow

1. Adjust obstacle size and road width to match your physical track
2. Set number of episodes and hyperparameters
3. Click **"학습 시작"** (Start Training)
4. Monitor progress in real time via graphs and the simulation view
5. Click **"아두이노 코드 저장"** (Save Arduino Code) to export `.ino` firmware
6. Optionally save the Q-table as JSON to reload later

---

## 🌐 Web Application — `rl_car_webapp.jsx`

A browser-based version of the same simulator, built with **React + HTML Canvas**. No installation required.

### Features

- Same Q-Learning core as the desktop app
- HTML Canvas rendering of the simulation (sensor rays, car, checkpoints)
- Slider-based settings panel (obstacle size, road width, episodes, α, γ)
- Start / Pause / Stop / Reset controls
- Test mode: watch the trained agent run without exploration
- Export Arduino code (copy to clipboard or download as `.ino`)
- Save model to JSON / load model from file
- Mobile-friendly layout — designed for use on tablets (Galaxy Tab, iPad, etc.)

### Usage

Drop `rl_car_webapp.jsx` into any React project, or use it with Claude.ai Artifacts, CodeSandbox, or similar environments.

```jsx
import RLCarSimulator from './rl_car_webapp';

export default function App() {
  return <RLCarSimulator />;
}
```

### Uploading to Arduino from a tablet (ArduinoDroid)

1. Install **ArduinoDroid** from the Play Store
2. Connect your Arduino via USB OTG cable
3. Open the downloaded `.ino` file in ArduinoDroid
4. Press Upload

> Supported boards: Arduino UNO, Arduino Nano · Requires USB OTG adapter

---

## 🤖 Arduino Firmware (Auto-Generated)

When you export the policy, the simulator generates a complete Arduino sketch containing the full learned policy as a `PROGMEM` array.

### Hardware pinout (default)

| Component | Pins |
|---|---|
| Left ultrasonic (TRIG / ECHO) | 2 / 3 |
| Center ultrasonic (TRIG / ECHO) | 4 / 5 |
| Right ultrasonic (TRIG / ECHO) | 6 / 7 |
| Left motor (ENA / IN1 / IN2) | 9 / 8 / 10 |
| Right motor (ENB / IN3 / IN4) | 11 / 12 / 13 |

### How it works on-device

```
Loop:
  1. Read 3 ultrasonic distances (cm)
  2. Discretize each into level 0–4
  3. Compute state index = left×25 + center×5 + right
  4. Look up action in POLICY[125] array (stored in flash)
  5. Execute motor command
  6. Repeat every 50 ms
```

Emergency stop: if any sensor reads < 5 cm, the car stops and backs up briefly before resuming.

---

## 📊 Training Tips

| Goal | Recommendation |
|---|---|
| Faster convergence | Increase learning rate (α = 0.2~0.3) |
| More stable policy | Increase episodes (500+) |
| Larger physical track | Increase obstacle size and road width to match |
| Better cornering | Increase epsilon decay (0.998) to explore longer |
| Transfer to hardware | After training, run test mode first, then export |

---

## 🏫 About

This project was developed at **Pumpkin Factory Makerspace** for the **Student Rover Challenge Korea** — an educational program that introduces students to AI, reinforcement learning, and embedded systems through hands-on robotics.

The design goal: a student with zero ML background can train an AI agent in minutes and watch it drive a real car.

---

## 📄 License

For educational and non-commercial use. Please credit **Pumpkin Factory Makerspace** if you use or adapt this project.
