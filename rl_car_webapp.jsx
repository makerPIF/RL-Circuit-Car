import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, RotateCcw, Download, Upload, Settings, Car, Zap, Trophy } from 'lucide-react';

// ============================================================
// 환경 클래스
// ============================================================
class CircuitEnvironment {
  constructor(obstacleSize = 30, roadWidth = 40) {
    this.SCALE = 1;
    this.obstacleSizeCm = obstacleSize;
    this.roadWidthCm = roadWidth;
    this.updateDimensions();
    this.reset();
  }

  updateDimensions() {
    const totalSizeCm = this.obstacleSizeCm + this.roadWidthCm * 2;
    this.width = totalSizeCm * this.SCALE;
    this.height = totalSizeCm * this.SCALE;
    this.obstacleSize = this.obstacleSizeCm * this.SCALE;
    this.obstacleX = this.width / 2;
    this.obstacleY = this.height / 2;
    this.roadWidth = this.roadWidthCm * this.SCALE;
    this.carLength = 15 * this.SCALE;
    this.carWidth = 10 * this.SCALE;
    this.sensorRange = 50 * this.SCALE;
    this.checkpoints = [
      [this.width / 2, this.roadWidth / 2],
      [this.width - this.roadWidth / 2, this.height / 2],
      [this.width / 2, this.height - this.roadWidth / 2],
      [this.roadWidth / 2, this.height / 2],
    ];
  }

  reset() {
    this.carX = this.width / 2;
    this.carY = this.height - this.roadWidth / 2;
    this.carAngle = -90;
    this.steps = 0;
    this.maxSteps = 1000;
    this.checkpointPassed = [false, false, false, false];
    this.lastCheckpoint = -1;
    this.lapsCompleted = 0;
    this.done = false;
    this.collision = false;
    return this.getState();
  }

  getSensorReadings() {
    const readings = [];
    const sensorAngles = [-45, 0, 45];
    
    for (const angleOffset of sensorAngles) {
      const angleRad = (this.carAngle + angleOffset) * Math.PI / 180;
      let distance = this.sensorRange;
      
      for (let d = 1; d <= this.sensorRange; d += 1) {
        const testX = this.carX + d * Math.cos(angleRad);
        const testY = this.carY + d * Math.sin(angleRad);
        
        if (testX < 0 || testX > this.width || testY < 0 || testY > this.height) {
          distance = d;
          break;
        }
        
        const halfObs = this.obstacleSize / 2;
        if (testX >= this.obstacleX - halfObs && testX <= this.obstacleX + halfObs &&
            testY >= this.obstacleY - halfObs && testY <= this.obstacleY + halfObs) {
          distance = d;
          break;
        }
      }
      readings.push(distance);
    }
    return readings;
  }

  discretizeDistance(distCm) {
    if (distCm < 10) return 0;
    if (distCm < 20) return 1;
    if (distCm < 30) return 2;
    if (distCm < 40) return 3;
    return 4;
  }

  getState() {
    const readings = this.getSensorReadings();
    return readings.map(r => this.discretizeDistance(r));
  }

  step(action) {
    this.steps++;
    const oldX = this.carX;
    const oldY = this.carY;
    
    let moveSpeed = 1.2;
    const turnAngle = 8;
    const sharpTurn = 15;
    
    if (action === 1) this.carAngle -= turnAngle;
    else if (action === 2) this.carAngle += turnAngle;
    else if (action === 3) { this.carAngle -= sharpTurn; moveSpeed = 0.8; }
    else if (action === 4) { this.carAngle += sharpTurn; moveSpeed = 0.8; }
    
    this.carAngle = ((this.carAngle % 360) + 360) % 360;
    
    const angleRad = this.carAngle * Math.PI / 180;
    this.carX += moveSpeed * Math.cos(angleRad);
    this.carY += moveSpeed * Math.sin(angleRad);
    
    const distMoved = Math.sqrt((this.carX - oldX) ** 2 + (this.carY - oldY) ** 2);
    const collision = this.checkCollision();
    const checkpointReward = this.checkCheckpoints();
    const reward = this.calculateReward(collision, checkpointReward, distMoved);
    
    if (collision) {
      this.done = true;
      this.collision = true;
    } else if (this.steps >= this.maxSteps) {
      this.done = true;
    }
    
    return [this.getState(), reward, this.done];
  }

  checkCollision() {
    const carRadius = Math.min(this.carLength, this.carWidth) / 2;
    
    if (this.carX - carRadius < 0 || this.carX + carRadius > this.width ||
        this.carY - carRadius < 0 || this.carY + carRadius > this.height) {
      return true;
    }
    
    const halfObs = this.obstacleSize / 2;
    const closestX = Math.max(this.obstacleX - halfObs, Math.min(this.carX, this.obstacleX + halfObs));
    const closestY = Math.max(this.obstacleY - halfObs, Math.min(this.carY, this.obstacleY + halfObs));
    const distToObs = Math.sqrt((this.carX - closestX) ** 2 + (this.carY - closestY) ** 2);
    
    return distToObs < carRadius;
  }

  checkCheckpoints() {
    let reward = 0;
    const checkpointRadius = 12;
    
    for (let i = 0; i < this.checkpoints.length; i++) {
      const [cx, cy] = this.checkpoints[i];
      const dist = Math.sqrt((this.carX - cx) ** 2 + (this.carY - cy) ** 2);
      
      if (dist < checkpointRadius && !this.checkpointPassed[i]) {
        const expectedNext = (this.lastCheckpoint + 1) % 4;
        if (i === expectedNext) {
          this.checkpointPassed[i] = true;
          this.lastCheckpoint = i;
          reward = 20;
          
          if (this.checkpointPassed.every(p => p)) {
            this.lapsCompleted++;
            this.checkpointPassed = [false, false, false, false];
            reward = 100;
          }
        }
      }
    }
    return reward;
  }

  calculateReward(collision, checkpointReward, distMoved) {
    if (collision) return -100;
    let reward = checkpointReward + distMoved * 0.1;
    const readings = this.getSensorReadings();
    const balance = Math.abs(readings[0] - readings[2]);
    if (balance < 5) reward += 1;
    else if (balance < 10) reward += 0.5;
    const minDist = Math.min(...readings);
    if (minDist < 10) reward -= 5;
    else if (minDist < 15) reward -= 2;
    return reward;
  }
}

// ============================================================
// Q-Learning 에이전트
// ============================================================
class QLearningAgent {
  constructor(lr = 0.15, gamma = 0.95, epsilonDecay = 0.995) {
    this.learningRate = lr;
    this.discountFactor = gamma;
    this.epsilon = 1.0;
    this.epsilonDecay = epsilonDecay;
    this.epsilonMin = 0.01;
    this.nStates = 125;
    this.nActions = 5;
    this.qTable = Array(this.nStates).fill(null).map(() => Array(this.nActions).fill(0));
    this.episodeRewards = [];
    this.episodeLaps = [];
    this.epsilonHistory = [];
  }

  getStateIndex(state) {
    return state[0] * 25 + state[1] * 5 + state[2];
  }

  chooseAction(state, training = true) {
    const stateIdx = this.getStateIndex(state);
    if (training && Math.random() < this.epsilon) {
      return Math.floor(Math.random() * this.nActions);
    }
    return this.qTable[stateIdx].indexOf(Math.max(...this.qTable[stateIdx]));
  }

  learn(state, action, reward, nextState, done) {
    const stateIdx = this.getStateIndex(state);
    const nextStateIdx = this.getStateIndex(nextState);
    const target = done ? reward : reward + this.discountFactor * Math.max(...this.qTable[nextStateIdx]);
    this.qTable[stateIdx][action] += this.learningRate * (target - this.qTable[stateIdx][action]);
  }

  decayEpsilon() {
    this.epsilon = Math.max(this.epsilonMin, this.epsilon * this.epsilonDecay);
  }

  getPolicyTable() {
    const policy = [];
    for (let i = 0; i < 125; i++) {
      policy.push(this.qTable[i].indexOf(Math.max(...this.qTable[i])));
    }
    return policy;
  }

  toJSON() {
    return {
      qTable: this.qTable,
      epsilon: this.epsilon,
      episodeRewards: this.episodeRewards,
      episodeLaps: this.episodeLaps,
    };
  }

  fromJSON(data) {
    this.qTable = data.qTable;
    this.epsilon = data.epsilon || 0.01;
    this.episodeRewards = data.episodeRewards || [];
    this.episodeLaps = data.episodeLaps || [];
  }
}

// ============================================================
// 메인 컴포넌트
// ============================================================
export default function RLCarSimulator() {
  const canvasRef = useRef(null);
  const [env, setEnv] = useState(() => new CircuitEnvironment(30, 40));
  const [agent, setAgent] = useState(() => new QLearningAgent());
  
  // 설정
  const [obstacleSize, setObstacleSize] = useState(30);
  const [roadWidth, setRoadWidth] = useState(40);
  const [episodes, setEpisodes] = useState(300);
  const [learningRate, setLearningRate] = useState(0.15);
  const [discountFactor, setDiscountFactor] = useState(0.95);
  const [epsilonDecay, setEpsilonDecay] = useState(0.995);
  
  // 상태
  const [isTraining, setIsTraining] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [currentEpisode, setCurrentEpisode] = useState(0);
  const [totalLaps, setTotalLaps] = useState(0);
  const [avgReward, setAvgReward] = useState(0);
  const [status, setStatus] = useState('대기 중');
  const [showSettings, setShowSettings] = useState(false);
  const [showArduino, setShowArduino] = useState(false);
  const [arduinoCode, setArduinoCode] = useState('');
  
  const trainingRef = useRef(false);
  const pausedRef = useRef(false);
  const testingRef = useRef(false);

  // 캔버스 그리기
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const scale = canvas.width / env.width;
    
    // 배경
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 도로
    ctx.fillStyle = '#4a4a5a';
    ctx.fillRect(0, 0, env.width * scale, env.height * scale);
    
    // 장애물
    const halfObs = env.obstacleSize * scale / 2;
    const obsX = env.obstacleX * scale - halfObs;
    const obsY = env.obstacleY * scale - halfObs;
    const gradient = ctx.createLinearGradient(obsX, obsY, obsX + halfObs * 2, obsY + halfObs * 2);
    gradient.addColorStop(0, '#e74c3c');
    gradient.addColorStop(1, '#c0392b');
    ctx.fillStyle = gradient;
    ctx.fillRect(obsX, obsY, env.obstacleSize * scale, env.obstacleSize * scale);
    
    ctx.fillStyle = 'white';
    ctx.font = `${Math.max(10, 14 * scale / 5)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('장애물', env.obstacleX * scale, env.obstacleY * scale - 5);
    ctx.font = `${Math.max(8, 10 * scale / 5)}px sans-serif`;
    ctx.fillText(`${env.obstacleSizeCm}×${env.obstacleSizeCm}cm`, env.obstacleX * scale, env.obstacleY * scale + 12);
    
    // 체크포인트
    env.checkpoints.forEach(([cx, cy], i) => {
      ctx.beginPath();
      ctx.arc(cx * scale, cy * scale, 10, 0, Math.PI * 2);
      ctx.fillStyle = env.checkpointPassed[i] ? 'rgba(46, 204, 113, 0.7)' : 'rgba(241, 196, 15, 0.5)';
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = '10px sans-serif';
      ctx.fillText(String(i + 1), cx * scale, cy * scale + 4);
    });
    
    // 센서 레이
    const readings = env.getSensorReadings();
    const sensorAngles = [-45, 0, 45];
    sensorAngles.forEach((offset, i) => {
      const angleRad = (env.carAngle + offset) * Math.PI / 180;
      const endX = env.carX + readings[i] * Math.cos(angleRad);
      const endY = env.carY + readings[i] * Math.sin(angleRad);
      
      let color = 'rgba(0, 255, 0, 0.5)';
      if (readings[i] < 10) color = 'rgba(255, 0, 0, 0.8)';
      else if (readings[i] < 20) color = 'rgba(255, 165, 0, 0.7)';
      else if (readings[i] < 30) color = 'rgba(255, 255, 0, 0.6)';
      
      ctx.beginPath();
      ctx.moveTo(env.carX * scale, env.carY * scale);
      ctx.lineTo(endX * scale, endY * scale);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.beginPath();
      ctx.arc(endX * scale, endY * scale, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
    
    // 자동차
    ctx.save();
    ctx.translate(env.carX * scale, env.carY * scale);
    ctx.rotate((env.carAngle + 90) * Math.PI / 180);
    
    const carW = env.carWidth * scale;
    const carL = env.carLength * scale;
    
    const carGrad = ctx.createLinearGradient(-carW/2, -carL/2, carW/2, carL/2);
    carGrad.addColorStop(0, '#3498db');
    carGrad.addColorStop(1, '#2980b9');
    ctx.fillStyle = carGrad;
    ctx.beginPath();
    ctx.roundRect(-carW/2, -carL/2, carW, carL, 4);
    ctx.fill();
    
    // 헤드라이트
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(-carW/2 + 3, -carL/2, carW - 6, 6);
    
    // 바퀴
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(-carW/2 - 3, -carL/2 + 6, 5, 10);
    ctx.fillRect(carW/2 - 2, -carL/2 + 6, 5, 10);
    ctx.fillRect(-carW/2 - 3, carL/2 - 16, 5, 10);
    ctx.fillRect(carW/2 - 2, carL/2 - 16, 5, 10);
    
    ctx.restore();
    
    // 정보 표시
    ctx.fillStyle = 'white';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`센서: ${readings.map(r => r.toFixed(0)).join(' / ')} cm`, 8, 18);
    ctx.fillText(`스텝: ${env.steps} | 완주: ${env.lapsCompleted}바퀴`, 8, 34);
    
    const totalCm = env.obstacleSizeCm + env.roadWidthCm * 2;
    ctx.fillText(`환경: ${totalCm}×${totalCm}cm`, 8, canvas.height - 8);
  }, [env]);

  useEffect(() => {
    draw();
  }, [draw]);

  // 환경 업데이트
  useEffect(() => {
    const newEnv = new CircuitEnvironment(obstacleSize, roadWidth);
    setEnv(newEnv);
  }, [obstacleSize, roadWidth]);

  // 학습 시작
  const startTraining = async () => {
    const newAgent = new QLearningAgent(learningRate, discountFactor, epsilonDecay);
    setAgent(newAgent);
    setIsTraining(true);
    setIsPaused(false);
    setCurrentEpisode(0);
    setTotalLaps(0);
    setStatus('학습 중...');
    trainingRef.current = true;
    pausedRef.current = false;
    
    const trainEnv = new CircuitEnvironment(obstacleSize, roadWidth);
    let recentRewards = [];
    
    for (let ep = 0; ep < episodes && trainingRef.current; ep++) {
      while (pausedRef.current && trainingRef.current) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (!trainingRef.current) break;
      
      let state = trainEnv.reset();
      let totalReward = 0;
      
      while (!trainEnv.done && trainingRef.current) {
        while (pausedRef.current && trainingRef.current) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (!trainingRef.current) break;
        
        const action = newAgent.chooseAction(state, true);
        const [nextState, reward, done] = trainEnv.step(action);
        newAgent.learn(state, action, reward, nextState, done);
        state = nextState;
        totalReward += reward;
      }
      
      newAgent.decayEpsilon();
      newAgent.episodeRewards.push(totalReward);
      newAgent.episodeLaps.push(trainEnv.lapsCompleted);
      newAgent.epsilonHistory.push(newAgent.epsilon);
      
      recentRewards.push(totalReward);
      if (recentRewards.length > 50) recentRewards.shift();
      
      setCurrentEpisode(ep + 1);
      setTotalLaps(prev => prev + trainEnv.lapsCompleted);
      setAvgReward(recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length);
      
      // 시각화 업데이트 (10 에피소드마다)
      if (ep % 10 === 0) {
        env.carX = trainEnv.carX;
        env.carY = trainEnv.carY;
        env.carAngle = trainEnv.carAngle;
        env.checkpointPassed = [...trainEnv.checkpointPassed];
        env.lapsCompleted = trainEnv.lapsCompleted;
        env.steps = trainEnv.steps;
        draw();
        await new Promise(r => setTimeout(r, 1));
      }
    }
    
    setIsTraining(false);
    setStatus(`학습 완료! 총 ${newAgent.episodeLaps.reduce((a, b) => a + b, 0)}바퀴 완주`);
    trainingRef.current = false;
  };

  // 일시정지
  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setIsPaused(pausedRef.current);
    setStatus(pausedRef.current ? '일시정지' : '학습 중...');
  };

  // 중지
  const stopTraining = () => {
    trainingRef.current = false;
    setIsTraining(false);
    setStatus('학습 중지됨');
  };

  // 테스트
  const toggleTest = () => {
    if (isTesting) {
      testingRef.current = false;
      setIsTesting(false);
      setStatus('테스트 종료');
    } else {
      env.reset();
      testingRef.current = true;
      setIsTesting(true);
      setStatus('테스트 실행 중...');
      runTest();
    }
  };

  const runTest = async () => {
    while (testingRef.current && !env.done) {
      const state = env.getState();
      const action = agent.chooseAction(state, false);
      env.step(action);
      draw();
      await new Promise(r => setTimeout(r, 50));
    }
    
    if (env.done) {
      setStatus(env.collision ? `충돌! 완주: ${env.lapsCompleted}바퀴` : `시간초과! 완주: ${env.lapsCompleted}바퀴`);
      testingRef.current = false;
      setIsTesting(false);
    }
  };

  // 환경 리셋
  const resetEnv = () => {
    env.reset();
    draw();
    setStatus('환경 리셋됨');
  };

  // 아두이노 코드 생성
  const generateArduinoCode = () => {
    const policy = agent.getPolicyTable();
    const totalSize = obstacleSize + roadWidth * 2;
    
    const code = `/*
 * Circuit AI Car - Reinforcement Learning
 * Galaxy Tab Web App으로 학습됨
 * 
 * 환경 설정:
 * - 전체 크기: ${totalSize}x${totalSize}cm
 * - 장애물: ${obstacleSize}x${obstacleSize}cm
 * - 도로폭: ${roadWidth}cm
 * 
 * 호박공장메이커스페이스
 */

#include <avr/pgmspace.h>

#define TRIG_LEFT 2
#define ECHO_LEFT 3
#define TRIG_CENTER 4
#define ECHO_CENTER 5
#define TRIG_RIGHT 6
#define ECHO_RIGHT 7

#define ENA 9
#define IN1 8
#define IN2 10
#define ENB 11
#define IN3 12
#define IN4 13

#define MOTOR_SPEED 180
#define TURN_SPEED 160
#define SHARP_TURN_SPEED 200
#define SENSOR_TIMEOUT 30000

const uint8_t POLICY[125] PROGMEM = {
    ${policy.join(', ')}
};

long measureDistance(int trigPin, int echoPin) {
    digitalWrite(trigPin, LOW);
    delayMicroseconds(2);
    digitalWrite(trigPin, HIGH);
    delayMicroseconds(10);
    digitalWrite(trigPin, LOW);
    
    long duration = pulseIn(echoPin, HIGH, SENSOR_TIMEOUT);
    if (duration == 0) return 100;
    return constrain(duration * 0.034 / 2, 0, 100);
}

int discretize(long dist) {
    if (dist < 10) return 0;
    else if (dist < 20) return 1;
    else if (dist < 30) return 2;
    else if (dist < 40) return 3;
    else return 4;
}

int getAction(int left, int center, int right) {
    int idx = left * 25 + center * 5 + right;
    if (idx < 0 || idx >= 125) return 0;
    return pgm_read_byte(&POLICY[idx]);
}

void forward() {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
    analogWrite(ENA, MOTOR_SPEED);
    analogWrite(ENB, MOTOR_SPEED);
}

void turnLeft() {
    digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
    analogWrite(ENA, 0);
    analogWrite(ENB, TURN_SPEED);
}

void turnRight() {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
    analogWrite(ENA, TURN_SPEED);
    analogWrite(ENB, 0);
}

void sharpLeft() {
    digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
    digitalWrite(IN3, HIGH); digitalWrite(IN4, LOW);
    analogWrite(ENA, SHARP_TURN_SPEED);
    analogWrite(ENB, SHARP_TURN_SPEED);
}

void sharpRight() {
    digitalWrite(IN1, HIGH); digitalWrite(IN2, LOW);
    digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
    analogWrite(ENA, SHARP_TURN_SPEED);
    analogWrite(ENB, SHARP_TURN_SPEED);
}

void stopMotors() {
    digitalWrite(IN1, LOW); digitalWrite(IN2, LOW);
    digitalWrite(IN3, LOW); digitalWrite(IN4, LOW);
    analogWrite(ENA, 0); analogWrite(ENB, 0);
}

void setup() {
    Serial.begin(9600);
    Serial.println("Circuit AI Car Ready!");
    
    pinMode(TRIG_LEFT, OUTPUT); pinMode(ECHO_LEFT, INPUT);
    pinMode(TRIG_CENTER, OUTPUT); pinMode(ECHO_CENTER, INPUT);
    pinMode(TRIG_RIGHT, OUTPUT); pinMode(ECHO_RIGHT, INPUT);
    
    pinMode(ENA, OUTPUT); pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
    pinMode(ENB, OUTPUT); pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
    
    stopMotors();
    delay(2000);
}

void loop() {
    long dL = measureDistance(TRIG_LEFT, ECHO_LEFT);
    long dC = measureDistance(TRIG_CENTER, ECHO_CENTER);
    long dR = measureDistance(TRIG_RIGHT, ECHO_RIGHT);
    
    int sL = discretize(dL);
    int sC = discretize(dC);
    int sR = discretize(dR);
    
    // 긴급 정지
    if (dC < 5 || dL < 5 || dR < 5) {
        stopMotors();
        delay(100);
        digitalWrite(IN1, LOW); digitalWrite(IN2, HIGH);
        digitalWrite(IN3, LOW); digitalWrite(IN4, HIGH);
        analogWrite(ENA, MOTOR_SPEED);
        analogWrite(ENB, MOTOR_SPEED);
        delay(300);
        stopMotors();
        return;
    }
    
    int action = getAction(sL, sC, sR);
    
    switch (action) {
        case 0: forward(); break;
        case 1: turnLeft(); break;
        case 2: turnRight(); break;
        case 3: sharpLeft(); break;
        case 4: sharpRight(); break;
        default: forward();
    }
    
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint > 500) {
        Serial.print("D:"); Serial.print(dL);
        Serial.print("/"); Serial.print(dC);
        Serial.print("/"); Serial.print(dR);
        Serial.print(" A:"); Serial.println(action);
        lastPrint = millis();
    }
    
    delay(50);
}`;
    
    setArduinoCode(code);
    setShowArduino(true);
  };

  // 코드 복사
  const copyCode = () => {
    navigator.clipboard.writeText(arduinoCode);
    alert('코드가 클립보드에 복사되었습니다!');
  };

  // 코드 다운로드
  const downloadCode = () => {
    const blob = new Blob([arduinoCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'circuit_car.ino';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 모델 저장
  const saveModel = () => {
    const data = JSON.stringify(agent.toJSON());
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rl_model.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 모델 로드
  const loadModel = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result);
          agent.fromJSON(data);
          setStatus('모델 로드 완료!');
          alert('모델이 로드되었습니다!');
        } catch (err) {
          alert('모델 로드 실패: ' + err.message);
        }
      };
      reader.readAsText(file);
    }
  };

  const totalEnvSize = obstacleSize + roadWidth * 2;
  const canvasSize = Math.min(380, window.innerWidth - 32);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      <div className="max-w-2xl mx-auto">
        {/* 헤더 */}
        <div className="text-center mb-4">
          <h1 className="text-xl font-bold flex items-center justify-center gap-2">
            <Car className="w-6 h-6 text-blue-400" />
            순환 주행 AI 시뮬레이터
          </h1>
          <p className="text-gray-400 text-sm">호박공장메이커스페이스</p>
        </div>

        {/* 캔버스 */}
        <div className="flex justify-center mb-4">
          <canvas
            ref={canvasRef}
            width={canvasSize}
            height={canvasSize}
            className="border-2 border-blue-500 rounded-lg"
          />
        </div>

        {/* 상태 표시 */}
        <div className="bg-gray-800 rounded-lg p-3 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-yellow-400 font-semibold">{status}</span>
            <span className="text-gray-400">ε: {agent.epsilon.toFixed(3)}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="bg-gray-700 rounded p-2">
              <div className="text-blue-400 font-bold">{currentEpisode}/{episodes}</div>
              <div className="text-gray-400">에피소드</div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-green-400 font-bold">{totalLaps}</div>
              <div className="text-gray-400">총 완주</div>
            </div>
            <div className="bg-gray-700 rounded p-2">
              <div className="text-purple-400 font-bold">{avgReward.toFixed(1)}</div>
              <div className="text-gray-400">평균 보상</div>
            </div>
          </div>
          {isTraining && (
            <div className="mt-2">
              <div className="bg-gray-700 rounded-full h-3">
                <div 
                  className="bg-green-500 h-3 rounded-full transition-all"
                  style={{ width: `${(currentEpisode / episodes) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 제어 버튼 */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button
            onClick={startTraining}
            disabled={isTraining}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Play className="w-5 h-5" />
            <span>학습</span>
          </button>
          <button
            onClick={togglePause}
            disabled={!isTraining}
            className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 p-3 rounded-lg flex items-center justify-center gap-2"
          >
            {isPaused ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
            <span>{isPaused ? '계속' : '일시정지'}</span>
          </button>
          <button
            onClick={stopTraining}
            disabled={!isTraining}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Square className="w-5 h-5" />
            <span>중지</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={toggleTest}
            disabled={isTraining}
            className={`${isTesting ? 'bg-purple-600' : 'bg-blue-600'} hover:opacity-90 disabled:bg-gray-600 p-3 rounded-lg flex items-center justify-center gap-2`}
          >
            <Zap className="w-5 h-5" />
            <span>{isTesting ? '테스트 중지' : '테스트 실행'}</span>
          </button>
          <button
            onClick={resetEnv}
            className="bg-gray-600 hover:bg-gray-700 p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <RotateCcw className="w-5 h-5" />
            <span>환경 리셋</span>
          </button>
        </div>

        {/* 설정 및 내보내기 */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="bg-gray-700 hover:bg-gray-600 p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Settings className="w-5 h-5" />
            <span>설정</span>
          </button>
          <button
            onClick={generateArduinoCode}
            className="bg-orange-600 hover:bg-orange-700 p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            <span>아두이노 코드</span>
          </button>
        </div>

        {/* 모델 저장/로드 */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            onClick={saveModel}
            className="bg-indigo-600 hover:bg-indigo-700 p-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Download className="w-5 h-5" />
            <span>모델 저장</span>
          </button>
          <label className="bg-teal-600 hover:bg-teal-700 p-3 rounded-lg flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-5 h-5" />
            <span>모델 로드</span>
            <input type="file" accept=".json" onChange={loadModel} className="hidden" />
          </label>
        </div>

        {/* 설정 패널 */}
        {showSettings && (
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4" />
              환경 및 학습 설정
            </h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-400 mb-1">장애물 크기: {obstacleSize}cm</label>
                <input
                  type="range"
                  min="10"
                  max="60"
                  value={obstacleSize}
                  onChange={(e) => setObstacleSize(Number(e.target.value))}
                  disabled={isTraining}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">도로 폭: {roadWidth}cm</label>
                <input
                  type="range"
                  min="20"
                  max="60"
                  value={roadWidth}
                  onChange={(e) => setRoadWidth(Number(e.target.value))}
                  disabled={isTraining}
                  className="w-full"
                />
              </div>
              
              <div className="text-center text-sm text-blue-400">
                전체 환경: {totalEnvSize}×{totalEnvSize}cm
              </div>
              
              <hr className="border-gray-700" />
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">학습 횟수: {episodes}</label>
                <input
                  type="range"
                  min="50"
                  max="1000"
                  step="50"
                  value={episodes}
                  onChange={(e) => setEpisodes(Number(e.target.value))}
                  disabled={isTraining}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">학습률 (α): {learningRate}</label>
                <input
                  type="range"
                  min="0.01"
                  max="0.5"
                  step="0.01"
                  value={learningRate}
                  onChange={(e) => setLearningRate(Number(e.target.value))}
                  disabled={isTraining}
                  className="w-full"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">할인율 (γ): {discountFactor}</label>
                <input
                  type="range"
                  min="0.5"
                  max="0.99"
                  step="0.01"
                  value={discountFactor}
                  onChange={(e) => setDiscountFactor(Number(e.target.value))}
                  disabled={isTraining}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        )}

        {/* 아두이노 코드 패널 */}
        {showArduino && (
          <div className="bg-gray-800 rounded-lg p-4 mb-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold">아두이노 코드</h3>
              <button onClick={() => setShowArduino(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div className="bg-gray-900 rounded p-3 mb-3 max-h-60 overflow-y-auto">
              <pre className="text-xs text-green-400 whitespace-pre-wrap">{arduinoCode.slice(0, 2000)}...</pre>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={copyCode}
                className="bg-blue-600 hover:bg-blue-700 p-2 rounded flex items-center justify-center gap-2"
              >
                복사하기
              </button>
              <button
                onClick={downloadCode}
                className="bg-green-600 hover:bg-green-700 p-2 rounded flex items-center justify-center gap-2"
              >
                다운로드
              </button>
            </div>
            
            {/* 업로드 안내 */}
            <div className="mt-4 bg-gray-700 rounded p-3">
              <h4 className="font-bold text-yellow-400 mb-2">📱 갤럭시탭에서 아두이노 업로드 방법</h4>
              <ol className="text-sm space-y-2 text-gray-300">
                <li><span className="text-blue-400">1.</span> <strong>ArduinoDroid</strong> 앱 설치 (Play 스토어)</li>
                <li><span className="text-blue-400">2.</span> USB OTG 케이블로 아두이노 연결</li>
                <li><span className="text-blue-400">3.</span> 다운로드한 .ino 파일 열기</li>
                <li><span className="text-blue-400">4.</span> 업로드 버튼 누르기</li>
              </ol>
              <div className="mt-3 text-xs text-gray-400">
                * Arduino UNO/Nano 지원<br/>
                * USB OTG 어댑터 필요
              </div>
            </div>
          </div>
        )}

        {/* 도움말 */}
        <div className="bg-gray-800 rounded-lg p-4 text-sm">
          <h3 className="font-bold mb-2 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-400" />
            사용 방법
          </h3>
          <ol className="space-y-1 text-gray-400">
            <li>1. 설정에서 환경 크기 조정</li>
            <li>2. "학습" 버튼으로 AI 훈련 시작</li>
            <li>3. 학습 완료 후 "테스트 실행"으로 확인</li>
            <li>4. "아두이노 코드" 버튼으로 코드 생성</li>
            <li>5. ArduinoDroid 앱으로 업로드</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
