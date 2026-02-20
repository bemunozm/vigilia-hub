# Mapeo de Pines GPIO - Vigilia Hub

> **Hardware**: Raspberry Pi 3 Model B  
> **GPIO Standard**: BCM (Broadcom numbering)  
> **Voltaje GPIO**: 3.3V (⚠️ NO 5V tolerante)

---

## 📍 Tabla Completa de Conexiones

### Raspberry Pi 3 B - 40 Pin GPIO Header

```
┌─────────────────────────────────────────────────────────────┐
│        Raspberry Pi 3 GPIO Pinout (Vista Superior)          │
│                                                             │
│    3V3  (1) ● ● (2)  5V     ← Alimentación                 │
│  GPIO2  (3) ● ● (4)  5V     ← Alimentación                 │
│  GPIO3  (5) ● ● (6)  GND    ← Tierra                       │
│  GPIO4  (7) ● ● (8)  GPIO14                                │
│    GND  (9) ● ● (10) GPIO15                                │
│ GPIO17 (11) ● ● (12) GPIO18                                │
│ GPIO27 (13) ● ● (14) GND    ← Tierra                       │
│ GPIO22 (15) ● ● (16) GPIO23                                │
│   3V3  (17) ● ● (18) GPIO24                                │
│ GPIO10 (19) ● ● (20) GND    ← Tierra                       │
│  GPIO9 (21) ● ● (22) GPIO25                                │
│ GPIO11 (23) ● ● (24) GPIO8                                 │
│    GND (25) ● ● (26) GPIO7                                 │
│  GPIO0 (27) ● ● (28) GPIO1                                 │
│  GPIO5 (29) ● ● (30) GND    ← Tierra                       │
│  GPIO6 (31) ● ● (32) GPIO12                                │
│ GPIO13 (33) ● ● (34) GND    ← Tierra                       │
│ GPIO19 (35) ● ● (36) GPIO16                                │
│ GPIO26 (37) ● ● (38) GPIO20                                │
│    GND (39) ● ● (40) GPIO21                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔌 Asignación de Pines por Función

### 1. Alimentación (Power Supply)

| Pin Físico | Función | Voltaje | Conectado a | Corriente Máx | Notas |
|------------|---------|---------|-------------|---------------|-------|
| **2** | 5V Power | 5.0V | LM2596S OUT+ | 3A | Entrada principal |
| **4** | 5V Power | 5.0V | Relé Módulo 1 VCC | 3A | Rail 5V |
| **1** | 3.3V Power | 3.3V | CD74HC4067 VCC | 50mA | ⚠️ Max 50mA total |
| **17** | 3.3V Power | 3.3V | KY-037 VCC | 50mA | Mismo rail que Pin 1 |
| **6** | GND | 0V | Common Ground | - | Rail negativo |
| **9** | GND | 0V | Relé Módulo 1 GND | - | Protoboard GND |
| **14** | GND | 0V | Relé Módulo 2 GND | - | Protoboard GND |
| **20** | GND | 0V | CD74HC4067 GND | - | Protoboard GND |
| **25** | GND | 0V | KY-037 GND | - | Protoboard GND |
| **39** | GND | 0V | Reservado | - | Disponible |

**⚠️ ADVERTENCIAS CRÍTICAS:**
- **Pin 1 y 17 (3.3V)**: Máximo **50mA combinados** - NO sobrecargar
- **Pin 2 y 4 (5V)**: Protegidos por LM2596S (3A máx)
- **NUNCA** conectar 5V a pines GPIO (solo a VCC de módulos 5V compatibles)

---

### 2. Control de Relés (Audio Interception)

| GPIO BCM | Pin Físico | Dirección | Conectado a | Función | Estado Inicial | Activo en |
|----------|------------|-----------|-------------|---------|----------------|-----------|
| **GPIO17** | **11** | OUTPUT | Relé 1 - IN1 | Audio OUT Intercept | LOW (0V) | HIGH = IA activa |
| **GPIO27** | **13** | OUTPUT | Relé 1 - IN2 | Audio IN Intercept | LOW (0V) | HIGH = IA activa |
| **GPIO22** | **15** | OUTPUT | Relé 2 - IN1 | Reservado (Door?) | LOW (0V) | Futuro |
| **GPIO23** | **16** | OUTPUT | Relé 2 - IN2 | Reservado (Camera?) | LOW (0V) | Futuro |

**Configuración en código:**
```typescript
// src/services/relay-controller.service.ts
const relay1Pin = parseInt(process.env.RELAY_PIN_1 || '17', 10);
const relay2Pin = parseInt(process.env.RELAY_PIN_2 || '27', 10);

this.audioRelay1 = new Gpio(relay1Pin, 'out');
this.audioRelay2 = new Gpio(relay2Pin, 'out');

// Estado seguro inicial (modo transparente)
this.audioRelay1.writeSync(0); // LOW = NO cerrado
this.audioRelay2.writeSync(0); // LOW = NO cerrado
```

**Variables de entorno (.env):**
```bash
RELAY_PIN_1=17  # Citófono → Casa (Audio OUT)
RELAY_PIN_2=27  # Casa → Citófono (Audio IN)
RELAY_SETTLING_TIME_MS=200  # Tiempo de estabilización
MAX_INTERCEPT_TIME_MS=180000  # Watchdog: 3 minutos máximo
```

**Estados lógicos:**
- **LOW (0V, OFF)**: Relé desactivado → COM conectado a NO → **Modo Normal**
- **HIGH (3.3V, ON)**: Relé activado → COM conectado a NC → **Modo IA**

---

### 3. Multiplexor CD74HC4067 (Teclado)

| GPIO BCM | Pin Físico | Dirección | Conectado a | Función | Rango |
|----------|------------|-----------|-------------|---------|-------|
| **GPIO5** | **29** | OUTPUT | CD74HC4067 S0 | Bit selector 0 (LSB) | 0-1 |
| **GPIO6** | **31** | OUTPUT | CD74HC4067 S1 | Bit selector 1 | 0-1 |
| **GPIO13** | **33** | OUTPUT | CD74HC4067 S2 | Bit selector 2 | 0-1 |
| **GPIO19** | **35** | OUTPUT | CD74HC4067 S3 | Bit selector 3 (MSB) | 0-1 |
| **GPIO26** | **37** | INPUT | CD74HC4067 SIG | Señal lectora | Pull-UP |

**Configuración en código:**
```typescript
// src/services/gpio-controller.service.ts
// Pines de control del multiplexor (S0-S3)
this.muxControlPins = [5, 6, 13, 19].map(pin => new Gpio(pin, 'out'));

// Pin de señal del multiplexor
this.muxSignalPin = new Gpio(26, 'in', 'rising'); // Con pull-up interno
```

**Tabla de selección de canal:**

| Canal | S3 | S2 | S1 | S0 | Binario | Decimal | Tecla |
|-------|----|----|----|----|---------|---------|-------|
| C0    | 0  | 0  | 0  | 0  | 0000    | 0       | **1** |
| C1    | 0  | 0  | 0  | 1  | 0001    | 1       | **2** |
| C2    | 0  | 0  | 1  | 0  | 0010    | 2       | **3** |
| C3    | 0  | 0  | 1  | 1  | 0011    | 3       | **A** |
| C4    | 0  | 1  | 0  | 0  | 0100    | 4       | **4** |
| C5    | 0  | 1  | 0  | 1  | 0101    | 5       | **5** |
| C6    | 0  | 1  | 1  | 0  | 0110    | 6       | **6** |
| C7    | 0  | 1  | 1  | 1  | 0111    | 7       | **B** |
| C8    | 1  | 0  | 0  | 0  | 1000    | 8       | **7** |
| C9    | 1  | 0  | 0  | 1  | 1001    | 9       | **8** |
| C10   | 1  | 0  | 1  | 0  | 1010    | 10      | **9** |
| C11   | 1  | 0  | 1  | 1  | 1011    | 11      | **C** |
| C12   | 1  | 1  | 0  | 0  | 1100    | 12      | **\*** |
| C13   | 1  | 1  | 0  | 1  | 1101    | 13      | **0** |
| C14   | 1  | 1  | 1  | 0  | 1110    | 14      | **#** |
| C15   | 1  | 1  | 1  | 1  | 1111    | 15      | **D** |

**Algoritmo de selección:**
```typescript
selectChannel(channel: number): void {
  // Escribir cada bit en su pin correspondiente
  this.muxControlPins[0].writeSync((channel & 0x01) as 0 | 1);      // S0
  this.muxControlPins[1].writeSync(((channel >> 1) & 0x01) as 0 | 1); // S1
  this.muxControlPins[2].writeSync(((channel >> 2) & 0x01) as 0 | 1); // S2
  this.muxControlPins[3].writeSync(((channel >> 3) & 0x01) as 0 | 1); // S3
}
```

---

### 4. Audio (Detección de Sonido)

| GPIO BCM | Pin Físico | Dirección | Conectado a | Función | Tipo |
|----------|------------|-----------|-------------|---------|------|
| **GPIO21** | **40** | INPUT | KY-037 DO | Detección umbral | Pull-DOWN |

**⚠️ LIMITACIÓN:**
- KY-037 AO (salida análoga) **NO SE USA** porque RPi no tiene ADC
- Solo se usa la salida **digital (DO)** para detectar presencia de sonido
- Para audio real, se requiere **USB Sound Card**

**Configuración:**
```typescript
// Detección digital de audio (umbral)
const audioDetectPin = new Gpio(21, 'in', 'falling'); // Detecta flanco descendente

audioDetectPin.watch((err, value) => {
  if (err) throw err;
  if (value === 0) {
    console.log('¡Sonido detectado!');
  }
});
```

**Audio Real (USB Sound Card):**
```bash
# Listar dispositivos de audio
arecord -l

# Configurar en .env
AUDIO_DEVICE=plughw:1,0  # Tarjeta USB (Card 1, Device 0)
HARDWARE_SAMPLE_RATE=48000
TARGET_SAMPLE_RATE=24000  # OpenAI Realtime requiere 24kHz
```

---

### 5. Pines Reservados (Futuro)

| GPIO BCM | Pin Físico | Dirección | Propósito Sugerido |
|----------|------------|-----------|--------------------|
| GPIO16 | 36 | OUTPUT | LED Status (RGB data) |
| GPIO20 | 38 | OUTPUT | Display SDA (I2C) |
| GPIO18 | 12 | PWM | Buzzer (alertas sonoras) |
| GPIO24 | 18 | INPUT | Sensor de puerta (reed switch) |
| GPIO25 | 22 | INPUT | Botón físico de reset |

---

## 🧪 Conexiones del Teclado 4×4

### Matriz de conexión detallada

```
┌──────────────────────────────────────────────────────┐
│         Teclado 4×4 Pin-out (8 pines)                │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Pin 1 (R1) ──► C0, C1, C2, C3   [Fila 1: 1,2,3,A] │
│  Pin 2 (R2) ──► C4, C5, C6, C7   [Fila 2: 4,5,6,B] │
│  Pin 3 (R3) ──► C8, C9, C10, C11 [Fila 3: 7,8,9,C] │
│  Pin 4 (R4) ──► C12, C13, C14, C15 [Fila 4: *,0,#,D]│
│                                                      │
│  Pin 5 (C1) ──► Todas las columnas 1                │
│  Pin 6 (C2) ──► Todas las columnas 2                │
│  Pin 7 (C3) ──► Todas las columnas 3                │
│  Pin 8 (C4) ──► Todas las columnas 4                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Conexión física:**

| Teclado Pin | Cable Color | Protoboard | CD74HC4067 | Función |
|-------------|-------------|------------|------------|---------|
| Pin 1 (R1) | Rojo | Rail + | C0-C3 | Fila 1 common |
| Pin 2 (R2) | Naranja | Rail + | C4-C7 | Fila 2 common |
| Pin 3 (R3) | Amarillo | Rail + | C8-C11 | Fila 3 common |
| Pin 4 (R4) | Verde | Rail + | C12-C15 | Fila 4 common |
| Pin 5 (C1) | Azul | Individual | Todas R×C1 | Columna 1 |
| Pin 6 (C2) | Violeta | Individual | Todas R×C2 | Columna 2 |
| Pin 7 (C3) | Gris | Individual | Todas R×C3 | Columna 3 |
| Pin 8 (C4) | Blanco | Individual | Todas R×C4 | Columna 4 |

**Lógica de escaneo:**

1. Conectar todas las **filas** a 3.3V (pull-up)
2. Conectar todas las **columnas** a GND (pull-down)
3. Para leer canal N del MUX:
   - Seleccionar canal N con S0-S3
   - Leer SIG en GPIO26
   - Si SIG = HIGH → tecla presionada en canal N
   - Si SIG = LOW → tecla no presionada

---

## 🔍 Validación de Conexiones

### Script de Test Individual

```bash
# Test GPIO Output (Relés)
gpio -g mode 17 out
gpio -g write 17 1  # Activar relé 1
gpio -g write 17 0  # Desactivar relé 1

# Test GPIO Input (Detección audio)
gpio -g mode 21 in
gpio -g mode 21 down  # Pull-down
gpio -g read 21  # Leer estado

# Test Multiplexor (Seleccionar canal 5)
gpio -g mode 5 out
gpio -g mode 6 out
gpio -g mode 13 out
gpio -g mode 19 out
gpio -g write 5 1   # S0 = 1
gpio -g write 6 0   # S1 = 0
gpio -g write 13 1  # S2 = 1
gpio -g write 19 0  # S3 = 0
# Canal 5 = binario 0101 = tecla "5"

gpio -g mode 26 in
gpio -g mode 26 up  # Pull-up
gpio -g read 26  # Leer si tecla presionada
```

### Test con Node.js

```javascript
// test-gpio.js
const Gpio = require('onoff').Gpio;

// Test Relay
const relay1 = new Gpio(17, 'out');
relay1.writeSync(1); // ON
setTimeout(() => relay1.writeSync(0), 1000); // OFF después de 1s

// Test Multiplexor
const s0 = new Gpio(5, 'out');
const s1 = new Gpio(6, 'out');
const s2 = new Gpio(13, 'out');
const s3 = new Gpio(19, 'out');
const sig = new Gpio(26, 'in', 'both');

// Seleccionar canal 0
s0.writeSync(0);
s1.writeSync(0);
s2.writeSync(0);
s3.writeSync(0);

sig.watch((err, value) => {
  console.log(`Canal 0 - Valor: ${value}`);
});
```

---

## ⚠️ Troubleshooting Común

### Problema: GPIO ya está en uso

```bash
# Error: "Device or resource busy"
# Solución: Liberar GPIO antes de usar

echo 17 > /sys/class/gpio/unexport
echo 27 > /sys/class/gpio/unexport
```

### Problema: Permisos insuficientes

```bash
# Error: "Permission denied"
# Solución: Agregar usuario a grupo gpio

sudo usermod -a -G gpio $USER
sudo reboot
```

### Problema: Relés no conmutan

- ✅ Verificar voltaje en VCC del módulo: debe ser **5V exactos**
- ✅ Verificar continuidad entre RPi GND y Relé GND
- ✅ Medir voltaje en IN1/IN2: debe alternar entre 0V y 3.3V
- ✅ LED del relé debe encender cuando GPIO = HIGH

### Problema: Teclado no responde

- ✅ Verificar CD74HC4067 alimentado con **3.3V** (NO 5V)
- ✅ PIN EN del MUX debe estar conectado a **GND** (enable activo)
- ✅ Verificar continuidad de cada cable del teclado
- ✅ Probar teclas una por una con multímetro (continuidad)

---

## 📊 Tabla Resumen (Quick Reference)

| Función | GPIO BCM | Pin Físico | Tipo | Voltaje | Notas |
|---------|----------|------------|------|---------|-------|
| **Relé Audio OUT** | 17 | 11 | OUT | 3.3V | Citófono → Casa |
| **Relé Audio IN** | 27 | 13 | OUT | 3.3V | Casa → Citófono |
| **Relé Reservado 1** | 22 | 15 | OUT | 3.3V | Futuro |
| **Relé Reservado 2** | 23 | 16 | OUT | 3.3V | Futuro |
| **MUX S0** | 5 | 29 | OUT | 3.3V | Selector bit 0 |
| **MUX S1** | 6 | 31 | OUT | 3.3V | Selector bit 1 |
| **MUX S2** | 13 | 33 | OUT | 3.3V | Selector bit 2 |
| **MUX S3** | 19 | 35 | OUT | 3.3V | Selector bit 3 |
| **MUX Señal** | 26 | 37 | IN | 3.3V | Lectura teclado |
| **Audio Detect** | 21 | 40 | IN | 3.3V | KY-037 digital |
| **Power 5V** | - | 2, 4 | PWR | 5.0V | Desde LM2596S |
| **Power 3.3V** | - | 1, 17 | PWR | 3.3V | Max 50mA |
| **Ground** | - | 6,9,14,20,25,39 | GND | 0V | Common |

---

## 🔗 Referencias

- [Raspberry Pi GPIO Pinout](https://pinout.xyz/)
- [onoff Library Documentation](https://github.com/fivdi/onoff)
- [CD74HC4067 Datasheet](https://www.ti.com/lit/ds/symlink/cd74hc4067.pdf)
- [WiringPi GPIO Tool](http://wiringpi.com/the-gpio-utility/)

---

**Próximo documento**: [HARDWARE_INSTALLATION.md](./HARDWARE_INSTALLATION.md) - Guía paso a paso de montaje físico
