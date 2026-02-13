# Diagrama de Circuito - Vigilia Hub

> **Fecha**: 13 de Febrero de 2026  
> **Hardware**: Raspberry Pi 3 Model B (1GB RAM)  
> **Voltaje Producción**: 12V DC (citófono) → 5V DC (regulado con LM2596S)  
> **Voltaje Laboratorio**: 5V DC (micro-USB directo)

---

## ⚠️ IMPORTANTE: Dos Configuraciones de Alimentación

### 🔬 **LABORATORIO / DESARROLLO**
```
Enchufe 220V ──► Adaptador micro-USB (5V 2.5A) ──► Raspberry Pi
```
- ✅ **USA ESTO si estás en laboratorio**
- NO requiere LM2596S
- Fuente micro-USB estándar (oficial RPi o 2.5A+)
- Ver: [LABORATORY_SETUP.md](./LABORATORY_SETUP.md)

### 🏢 **PRODUCCIÓN / INSTALACIÓN EN CITÓFONO**
```
Citófono 12V ──► LM2596S (regulador) ──► 5V ──► Raspberry Pi
```
- ✅ **USA ESTO solo cuando instales en citófono real**
- Requiere LM2596S Buck Converter
- Se documenta en esta guía (abajo)

---

## 📐 Diagrama General del Sistema

```
┌─────────────────────────────────────────────────────────────────────┐
│                       SISTEMA VIGILIA-HUB                           │
│                                                                     │
│  12V DC Input (Citófono)                                          │
│         │                                                           │
│         ▼                                                           │
│  ┌──────────────┐                                                  │
│  │ LM2596S Buck │  5V DC Output                                    │
│  │  Converter   ├──────────────┐                                   │
│  └──────────────┘              │                                   │
│                                ▼                                   │
│                    ┌────────────────────────┐                      │
│                    │   Raspberry Pi 3 B     │                      │
│                    │      (BCM Pinout)      │                      │
│                    └┬──────────────────────┬┘                      │
│                     │  GPIO Connections    │                       │
│        ┌────────────┼──────────────────────┼────────────┐         │
│        │            │                      │            │          │
│        ▼            ▼                      ▼            ▼          │
│  ┌─────────┐  ┌──────────┐         ┌──────────┐  ┌─────────┐    │
│  │ Relay   │  │  CD74HC  │         │  Teclado │  │  Audio  │    │
│  │ Module  │  │   4067   │         │   4x4    │  │  System │    │
│  │ 2×2ch   │  │   MUX    │         │ Membrana │  │         │    │
│  └─────────┘  └──────────┘         └──────────┘  └─────────┘    │
│       │             │                                   │          │
│       ▼             ▼                                   ▼          │
│  Audio Lines    Button Matrix                   Speaker + Mic     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔌 Alimentación (Power Supply)

### LM2596S Buck Converter Configuration

```
┌──────────────────────────────────┐
│     LM2596S BUCK CONVERTER       │
│  (Regulador Step-Down DC-DC)     │
├──────────────────────────────────┤
│                                  │
│  IN+  ◄─── 12V DC (Citófono)    │
│  IN-  ◄─── GND (Citófono)       │
│                                  │
│  OUT+ ───► 5V DC (RPi GPIO Pin 2)│
│  OUT- ───► GND   (RPi GPIO Pin 6)│
│                                  │
│  [Potenciómetro: Ajustar a 5.0V] │
└──────────────────────────────────┘
```

**⚠️ IMPORTANTE:**
1. Ajustar el potenciómetro del LM2596S **ANTES** de conectar a la RPi
2. Usar multímetro para verificar **exactamente 5.0V** en OUT+/OUT-
3. **Nunca exceder 5.2V** - puede dañar permanentemente la Raspberry Pi
4. Corriente máxima: 3A (suficiente para RPi + periféricos)

**Especificaciones:**
- Voltaje entrada: 12V DC ±10%
- Voltaje salida: 5.0V DC (ajustable)
- Corriente máxima: 3A
- Eficiencia: ~92%
- Protección: Sobrecorriente y cortocircuito

---

## 🎚️ Módulo de Relés (Audio Interception)

### Relé 1: Intercepción de Audio OUT (Citófono → Casa)

```
┌──────────────────────────────────────────────┐
│          RELÉ 1 - CANAL 1 y 2                │
│       (Módulo 5V 2 Canales Optoacoplado)     │
├──────────────────────────────────────────────┤
│                                              │
│  VCC  ◄─── 5V     (RPi Pin 4)               │
│  GND  ◄─── GND    (RPi Pin 9)               │
│  IN1  ◄─── GPIO17 (RPi Pin 11) - Audio OUT  │
│  IN2  ◄─── GPIO27 (RPi Pin 13) - Audio IN   │
│                                              │
│  Relay 1 (CH1):                              │
│  ├─ COM  ◄──── Citófono Audio OUT           │
│  ├─ NO   ────► Casa Audio IN (Normal)       │
│  └─ NC   ────► RPi Audio OUT (Intercept)    │
│                                              │
│  Relay 2 (CH2):                              │
│  ├─ COM  ◄──── Casa Micrófono               │
│  ├─ NO   ────► Citófono Audio IN (Normal)   │
│  └─ NC   ────► RPi Audio IN (Intercept)     │
│                                              │
└──────────────────────────────────────────────┘
```

**Estados del Relé:**
- **LOW (0V)**: Relé abierto - `COM` conectado a `NO` - **Modo Transparente**
- **HIGH (5V)**: Relé cerrado - `COM` conectado a `NC` - **Modo Intercepción**

**Modo Normal (Relés OFF):**
```
Citófono Audio OUT ──[COM-NO]──► Casa Audio IN
Casa Micrófono     ──[COM-NO]──► Citófono Audio IN
                   (Conexión directa)
```

**Modo Intercepción IA (Relés ON):**
```
Citófono Audio OUT ──[COM-NC]──► RPi Audio IN  ──► OpenAI Realtime
RPi Audio OUT      ──[COM-NC]──► Casa Audio IN ◄── OpenAI Realtime
                   (Audio procesado por IA)
```

### Relé 2: Respaldo (Opcional - Futuro)

El segundo módulo de relés puede usarse para:
- Detección de timbre (Ringing detection)
- Control de apertura de puerta (Door Release)
- Conmutación de cámaras (Camera switching)

**Conexión sugerida:**
```
VCC  ◄─── 5V     (RPi Pin 2)
GND  ◄─── GND    (RPi Pin 14)
IN1  ◄─── GPIO22 (RPi Pin 15) - Reservado
IN2  ◄─── GPIO23 (RPi Pin 16) - Reservado
```

---

## 🎹 Teclado 4×4 + Multiplexor CD74HC4067

### Conexión del Multiplexor

```
┌─────────────────────────────────────────────────┐
│          CD74HC4067 16-Channel MUX              │
│            (Multiplexor/Demultiplexor)          │
├─────────────────────────────────────────────────┤
│                                                 │
│  VCC  ◄─── 3.3V  (RPi Pin 1)  [IMPORTANTE]    │
│  GND  ◄─── GND   (RPi Pin 20)                  │
│  EN   ◄─── GND   (Enable activo - siempre ON)  │
│                                                 │
│  Control Pins (Selección de canal):            │
│  S0   ◄─── GPIO5  (RPi Pin 29)                 │
│  S1   ◄─── GPIO6  (RPi Pin 31)                 │
│  S2   ◄─── GPIO13 (RPi Pin 33)                 │
│  S3   ◄─── GPIO19 (RPi Pin 35)                 │
│                                                 │
│  SIG  ───► GPIO26 (RPi Pin 37) [INPUT+PULLUP]  │
│                                                 │
│  Canales C0-C15:                                │
│  C0  ◄─── Teclado Fila 1 - Columna 1           │
│  C1  ◄─── Teclado Fila 1 - Columna 2           │
│  C2  ◄─── Teclado Fila 1 - Columna 3           │
│  C3  ◄─── Teclado Fila 1 - Columna 4           │
│  C4  ◄─── Teclado Fila 2 - Columna 1           │
│  C5  ◄─── Teclado Fila 2 - Columna 2           │
│  C6  ◄─── Teclado Fila 2 - Columna 3           │
│  C7  ◄─── Teclado Fila 2 - Columna 4           │
│  C8  ◄─── Teclado Fila 3 - Columna 1           │
│  C9  ◄─── Teclado Fila 3 - Columna 2           │
│  C10 ◄─── Teclado Fila 3 - Columna 3           │
│  C11 ◄─── Teclado Fila 3 - Columna 4           │
│  C12 ◄─── Teclado Fila 4 - Columna 1           │
│  C13 ◄─── Teclado Fila 4 - Columna 2           │
│  C14 ◄─── Teclado Fila 4 - Columna 3           │
│  C15 ◄─── Teclado Fila 4 - Columna 4           │
│                                                 │
└─────────────────────────────────────────────────┘
```

**⚠️ CRÍTICO: Usar 3.3V, NO 5V**
- El CD74HC4067 debe alimentarse con **3.3V** para compatibilidad con GPIO de RPi
- Los GPIO de Raspberry Pi son **3.3V tolerantes** - 5V los dañará

### Teclado Matricial 4×4

```
┌────────────────────────────────┐
│     TECLADO 4×4 MEMBRANA       │
│                                │
│   [1]  [2]  [3]  [A]          │
│   [4]  [5]  [6]  [B]          │
│   [7]  [8]  [9]  [C]          │
│   [*]  [0]  [#]  [D]          │
│                                │
│  8 pines de conexión:          │
│  Pin 1-4: Filas (R1-R4)       │
│  Pin 5-8: Columnas (C1-C4)    │
└────────────────────────────────┘

Mapeo de teclas a canales MUX:
┌────┬────┬────┬────┐
│ 1  │ 2  │ 3  │ A  │  → Fila 1
│ C0 │ C1 │ C2 │ C3 │
├────┼────┼────┼────┤
│ 4  │ 5  │ 6  │ B  │  → Fila 2
│ C4 │ C5 │ C6 │ C7 │
├────┼────┼────┼────┤
│ 7  │ 8  │ 9  │ C  │  → Fila 3
│ C8 │ C9 │ C10│ C11│
├────┼────┼────┼────┤
│ *  │ 0  │ #  │ D  │  → Fila 4
│ C12│ C13│ C14│ C15│
└────┴────┴────┴────┘
```

**Conexión de Matriz:**
```
Teclado Pin → MUX Channel
─────────────────────────
Fila 1 (R1) → C0, C1, C2, C3
Fila 2 (R2) → C4, C5, C6, C7
Fila 3 (R3) → C8, C9, C10, C11
Fila 4 (R4) → C12, C13, C14, C15

Cada botón conecta su fila con su columna cuando se presiona
```

---

## 🎤 Sistema de Audio

### Sensor de Sonido KY-037 (Micrófono)

```
┌──────────────────────────────┐
│   SENSOR KY-037 MICRÓFONO    │
│  (Análogo + Digital Output)  │
├──────────────────────────────┤
│                              │
│  VCC ◄─── 3.3V (RPi Pin 17)  │
│  GND ◄─── GND  (RPi Pin 25)  │
│  AO  ───► [NO USAR - RPi no  │
│           tiene ADC nativo]  │
│  DO  ───► GPIO21 (RPi Pin 40)│
│           [Detección umbral] │
│                              │
│  Potenciómetro:              │
│  - Ajustar sensibilidad      │
│  - LED indica activación     │
└──────────────────────────────┘
```

**⚠️ LIMITACIÓN IMPORTANTE:**
- La Raspberry Pi **NO tiene ADC** (Analog-to-Digital Converter)
- Solo podemos usar la salida **digital (DO)** del KY-037
- Para captura de audio real, se requiere:
  - **USB Sound Card** (recomendado)
  - O módulo ADC externo (MCP3008 con SPI)

**Alternativa Recomendada:**
```
USB Sound Card (Tarjeta de Audio USB)
├─ Entrada: Micrófono 3.5mm
└─ Salida: Altavoz 3.5mm

Dispositivo detectado como: plughw:1,0
Configurado en .env: AUDIO_DEVICE=plughw:1,0
```

### Altavoz 8Ω 0.5W

```
┌──────────────────────────────────┐
│      ALTAVOZ 8Ω 0.5W             │
│  (Conectado a USB Sound Card)    │
├──────────────────────────────────┤
│                                  │
│  Jack 3.5mm ◄─── USB Sound OUT   │
│  Speaker +  ────► Cable Rojo     │
│  Speaker -  ────► Cable Negro    │
│                                  │
│  Especificaciones:               │
│  - Impedancia: 8Ω               │
│  - Potencia: 0.5W (suficiente)  │
│  - Diámetro: ~28mm típico       │
└──────────────────────────────────┘
```

**Conexión de Audio Completo:**
```
┌─────────────────────────────────────────────┐
│            Flujo de Audio                   │
├─────────────────────────────────────────────┤
│                                             │
│  Citófono ──► [Relay 1] ──► USB Sound IN   │
│                │                            │
│                └──► Casa (modo normal)      │
│                                             │
│  RPi Audio Processing:                      │
│  USB IN ──► ALSA ──► Node.js ──► OpenAI    │
│  OpenAI ──► Node.js ──► ALSA ──► USB OUT   │
│                                             │
│  USB Sound OUT ──► [Relay 2] ──► Casa      │
│                    │                        │
│                    └──► Citófono (normal)   │
└─────────────────────────────────────────────┘
```

---

## 🔧 Protoboard Layout (Vista Superior)

```
┌──────────────────────────────── PROTOBOARD ─────────────────────────────────┐
│                                                                              │
│  Power Rails:                                                                │
│  [+] ████████████████████████████████████████ 5V (desde LM2596S)            │
│  [-] ████████████████████████████████████████ GND                           │
│  [+] ████████████████████████████████████████ 3.3V (desde RPi Pin 1)        │
│                                                                              │
│  ┌─────────────────────┐  ┌──────────────┐  ┌─────────────┐                │
│  │   CD74HC4067 MUX    │  │  Relay #1    │  │  KY-037     │                │
│  │  (16 canales)       │  │  (2 canales) │  │  Micrófono  │                │
│  └─────────────────────┘  └──────────────┘  └─────────────┘                │
│           ││││                   ││                 ││                       │
│           ││││                   ││                 ││                       │
│           ││││                   ││                 ││                       │
│  ┌────────┴┴┴┴───────────────────┴┴─────────────────┴┴─────────────┐       │
│  │                     Cables hacia Raspberry Pi                     │       │
│  └────────────────────────────────────────────────────────────────────┘       │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────┐           │
│  │  Teclado 4×4: Cables individuales numerados para matriz     │           │
│  │  [R1] [R2] [R3] [R4] [C1] [C2] [C3] [C4]                   │           │
│  └──────────────────────────────────────────────────────────────┘           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## ⚡ Esquema de Tierra (Ground)

**CRÍTICO: Todas las tierras deben estar conectadas juntas**

```
┌────────────────────────────────────────┐
│      COMMON GROUND (GND)               │
├────────────────────────────────────────┤
│                                        │
│  LM2596S OUT-   ──┬──► RPi GND Pins   │
│  Citófono GND   ──┤    (6,9,14,20,25) │
│  CD74HC4067 GND ──┤                    │
│  Relay Module GND─┤                    │
│  KY-037 GND     ──┤                    │
│  USB Sound GND  ──┘                    │
│                                        │
│  [Usar rail negativo de protoboard]   │
└────────────────────────────────────────┘
```

---

## 🔍 Verificación Pre-Conexión

### Checklist antes de energizar:

- [ ] LM2596S ajustado exactamente a **5.0V** (con multímetro)
- [ ] Todas las tierras (GND) conectadas entre sí
- [ ] CD74HC4067 alimentado con **3.3V** (NO 5V)
- [ ] Relés alimentados con **5V**
- [ ] Polaridad correcta en todos los componentes
- [ ] No hay cortocircuitos entre VCC y GND
- [ ] GPIO pins correctamente mapeados (ver PIN_MAPPING.md)
- [ ] USB Sound Card conectada a la RPi
- [ ] Cables Dupont bien insertados (click audible)

---

## 📊 Consumo Eléctrico Estimado

| Componente             | Corriente | Notas                    |
|------------------------|-----------|--------------------------|
| Raspberry Pi 3 B       | ~700mA    | En operación normal      |
| USB Sound Card         | ~100mA    | Durante transmisión      |
| Relés (2 módulos)      | ~150mA    | Cuando están activados   |
| CD74HC4067 MUX         | ~1mA      | Muy bajo consumo         |
| KY-037 Sensor          | ~5mA      | Mínimo                   |
| Altavoz                | ~50mA     | Reproduciendo audio      |
| **TOTAL**              | **~1A**   | **Picos hasta 1.5A**     |

**Margen de Seguridad:** LM2596S @ 3A es más que suficiente ✅

---

## 🛡️ Protecciones Implementadas

1. **Optoacopladores en relés**: Aislamiento eléctrico entre RPi y carga
2. **LM2596S con protección**: Sobrecorriente y cortocircuito
3. **Fusible sugerido**: 500mA en línea 5V (adicional, opcional)
4. **Pull-up resistors**: Internos de RPi activados en GPIO26 (teclado)
5. **Watchdog por software**: Desactivación automática de relés a 180s

---

## 📝 Notas Adicionales

### Sobre los componentes opcionales del Kit M:

El "Kit Componentes Electrónicos M" puede incluir:
- **Resistencias**: Para pull-up/pull-down adicionales (no crítico, RPi tiene internos)
- **Capacitores**: 100µF en línea 5V para estabilización (recomendado)
- **LEDs indicadores**: Para debug visual de estados
- **Diodos**: Protección contra corrientes inversas

### Mejoras futuras:

1. **ADC Externo (MCP3008)**: Para audio análogo real del KY-037
2. **Display LCD**: Mostrar estado del hub (IP, conexión, etc.)
3. **LEDs RGB**: Indicar modo (Normal=Verde, IA=Azul, Error=Rojo)
4. **Botón físico**: Reset/Calibración sin SSH

---

**Próximo documento**: [PIN_MAPPING.md](./PIN_MAPPING.md) - Tabla detallada de pines GPIO
