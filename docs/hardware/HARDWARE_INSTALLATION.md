# Guía de Instalación de Hardware - Vigilia Hub

> **Tiempo estimado**: 3-4 horas (primera vez)  
> **Dificultad**: Intermedia  
> **Herramientas requeridas**: Multímetro digital, destornillador, pinzas

---

## 📦 Lista de Materiales (Checklist)

### Componentes Principales

- [ ] **Raspberry Pi 3 Model B** (1GB RAM)
- [ ] **Protoboard** (830 puntos mínimo)
- [ ] **Cables Dupont** macho-hembra (40 piezas, 20cm)

### Componentes Adquiridos

- [ ] **LM2596S Buck Converter** (Step-Down DC-DC)
- [ ] **Relé 5V 2 canales optoacoplado** (×2 módulos)
- [ ] **CD74HC4067** (Multiplexor 16 canales)
- [ ] **Teclado 4×4** tipo membrana
- [ ] **KY-037** (Sensor de sonido con micrófono)
- [ ] **Altavoz 8Ω 0.5W**
- [ ] **Kit Componentes Electrónicos M**

### Adicionales Recomendados

- [ ] **USB Sound Card** (tarjeta de audio USB - CRÍTICO para audio real)
- [ ] **Tarjeta microSD** (16GB+ con Raspberry Pi OS instalado)
- [ ] **Fuente 12V DC** (simulando citófono, 1A mínimo)
- [ ] **Cables audio 3.5mm** (para altavoz y micrófono)

### Herramientas

- [ ] **Multímetro digital** (obligatorio)
- [ ] **Destornillador pequeño** (para ajustar LM2596S)
- [ ] **Pinzas** (opcional, ayuda con cables)
- [ ] **Marcador permanente** (etiquetar cables)
- [ ] **Cinta aislante** (opcional)

---

## ⚠️ ADVERTENCIAS DE SEGURIDAD

### 🚨 ANTES DE COMENZAR - LEA COMPLETAMENTE

1. **NUNCA conectar 5V a GPIO pins** - Solo alimentar POWER RAILS
2. **Verificar polaridad** antes de cada conexión (VCC/GND)
3. **Ajustar LM2596S ANTES** de conectar a Raspberry Pi
4. **Desconectar fuente** al realizar cambios de cableado
5. **No cortocircuitar** VCC con GND (puede dañar componentes)
6. **Usar 3.3V para CD74HC4067**, nunca 5V
7. **Verificar continuidad** con multímetro antes de energizar

### Daños comunes evitables:

| Acción | Consecuencia | Costo |
|--------|--------------|-------|
| 5V en GPIO pins | RPi destruida | ~$35 USD |
| LM2596S mal ajustado (>5.2V) | RPi destruida | ~$35 USD |
| 5V en CD74HC4067 | GPIO26 dañado | ~$35 USD |
| Cortocircuito en protoboard | Componentes quemados | Variable |

**💡 TIP:** Tomar **fotos en cada paso** para poder revisar conexiones más tarde.

---

## 📋 Fase 1: Preparación y Verificación

### Paso 1.1: Inspeccionar Componentes

**Verificar que todos los componentes estén completos:**

```
LM2596S:
- [ ] 4 pines (IN+, IN-, OUT+, OUT-)
- [ ] Potenciómetro dorado (ajuste de voltaje)
- [ ] LED indicador (enciende con entrada)

Relés (cada módulo):
- [ ] 6 pines señal (VCC, GND, IN1, IN2)
- [ ] 6 pines carga (COM1, NO1, NC1, COM2, NO2, NC2)
- [ ] 2 LEDs indicadores (uno por canal)
- [ ] Optoacopladores visibles (chips negros)

CD74HC4067:
- [ ] 24 pines en total
- [ ] Marcado "4067" visible
- [ ] Sin pines doblados

Teclado 4×4:
- [ ] 8 cables saliendo (4 filas + 4 columnas)
- [ ] 16 teclas [1-9, 0, *, #, A-D]
- [ ] Membrana sin roturas

KY-037:
- [ ] 4 pines (VCC, GND, AO, DO)
- [ ] LED rojo (poder)
- [ ] LED azul (detección)
- [ ] Potenciómetro azul (sensibilidad)
```

### Paso 1.2: Preparar Workspace

1. Mesa de trabajo **limpia y seca**
2. Buena iluminación
3. Multímetro calibrado (probar con batería 9V)
4. Cables Dupont organizados por color
5. Etiquetas o marcador para identificar cables

### Paso 1.3: Preparar Raspberry Pi

**Si es primera instalación:**

```bash
# 1. Flashear Raspberry Pi OS Lite en microSD
# Usar Raspberry Pi Imager: https://www.raspberrypi.com/software/

# 2. Habilitar SSH (crear archivo vacío en boot/)
touch /boot/ssh

# 3. Configurar WiFi (crear wpa_supplicant.conf en boot/)
cat > /boot/wpa_supplicant.conf << EOF
country=CL
ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
update_config=1

network={
    ssid="TU_WIFI"
    psk="TU_PASSWORD"
    key_mgmt=WPA-PSK
}
EOF

# 4. Primer boot (conectar con SSH)
ssh pi@raspberrypi.local
# Password por defecto: raspberry

# 5. Actualizar sistema
sudo apt update && sudo apt upgrade -y

# 6. Instalar Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 7. Instalar dependencias GPIO
sudo apt install -y wiringpi git
```

---

## 🔧 Fase 2: Montaje del Circuito de Alimentación

### Paso 2.1: Ajustar LM2596S (CRÍTICO)

**⚠️ HACER ESTO ANTES DE CONECTAR A RASPBERRY PI**

```
┌─────────────────────────────────────────┐
│   AJUSTE DEL LM2596S BUCK CONVERTER     │
├─────────────────────────────────────────┤
│                                         │
│  1. Conectar 12V DC a IN+ y IN-        │
│  2. Conectar multímetro a OUT+ y OUT-  │
│  3. Encender fuente 12V                 │
│  4. Girar potenciómetro lentamente      │
│  5. Ajustar hasta leer EXACTAMENTE 5.0V│
│  6. Desconectar fuente                  │
│                                         │
│  LED del LM2596S debe ENCENDER          │
│  Multímetro debe marcar 5.00V ± 0.05V  │
│                                         │
└─────────────────────────────────────────┘
```

**Procedimiento detallado:**

1. **Preparar fuente 12V**:
   - Conectar cable rojo a **IN+** del LM2596S
   - Conectar cable negro a **IN-** del LM2596S

2. **Preparar multímetro**:
   - Modo: DC Voltage (escala 20V)
   - Cable rojo a **OUT+** del LM2596S
   - Cable negro a **OUT-** del LM2596S

3. **Energizar y ajustar**:
   - Encender fuente 12V
   - LED del LM2596S debe encender (rojo)
   - Leer voltaje inicial (probablemente 1-3V)
   - Con destornillador pequeño, girar potenciómetro **SENTIDO HORARIO** (aumenta V)
   - Ajustar hasta **5.00V** exactos
   - Si se pasa, girar **ANTI-HORARIO** (disminuye V)

4. **Verificación final**:
   ```
   Voltaje OUT: 5.00V ✅ (rango aceptable: 4.95V - 5.05V)
   Voltaje OUT: 5.20V ❌ (demasiado alto - PELIGROSO)
   Voltaje OUT: 4.80V ❌ (demasiado bajo - RPi no bootea)
   ```

5. **Apagar fuente** y **desconectar multímetro**

### Paso 2.2: Instalar Power Rails en Protoboard

```
┌────────────────────────────────────────────────────┐
│         PROTOBOARD - POWER RAILS                   │
├────────────────────────────────────────────────────┤
│                                                    │
│  [+5V]  ████████████████████████████████████      │ ← Rail Rojo
│  [GND]  ████████████████████████████████████      │ ← Rail Azul/Negro
│  [3.3V] ████████████████████████████████████      │ ← Rail Naranja
│                                                    │
│  ▲           ▲             ▲                       │
│  │           │             │                       │
│  LM2596S     RPi Pin 2     RPi Pin 1               │
│  OUT+        (5V)          (3.3V)                  │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Conexiones:**

1. **Rail 5V (rojo superior)**:
   - Cable desde **LM2596S OUT+** a rail **+5V**
   - Este rail alimentará: Relés, RPi Pin 2

2. **Rail GND (azul/negro inferior)**:
   - Cable desde **LM2596S OUT-** a rail **GND**
   - Cable desde **RPi Pin 6** (GND) a rail **GND**
   - Este rail es **COMMON GROUND** para todo

3. **Rail 3.3V (rojo secundario o naranja)**:
   - Cable desde **RPi Pin 1** (3.3V) a rail **3.3V**
   - Este rail alimentará: CD74HC4067, KY-037

**⚠️ IMPORTANTE:** El rail 5V **NO** se conecta directamente a RPi. Solo alimenta:
- Módulos de relés (VCC)
- Opcionalmente, Pin 2 de RPi (entrada de poder)

---

## 🎚️ Fase 3: Instalación de Módulos de Relés

### Paso 3.1: Módulo Relé 1 (Audio Interception)

**Ubicación sugerida:** Centro-izquierda de protoboard

```
┌──────────────────────────────┐
│   MÓDULO RELÉ 1 - CONEXIONES │
├──────────────────────────────┤
│                              │
│  Lado Señal (6 pines):       │
│  VCC  ← [Rail 5V]            │
│  GND  ← [Rail GND]           │
│  IN1  ← [Cable a RPi Pin 11] │
│  IN2  ← [Cable a RPi Pin 13] │
│                              │
│  Lado Carga (6 pines):       │
│  COM1 ← [Audio OUT Citófono] │
│  NO1  → [Audio IN Casa]      │
│  NC1  → [Audio IN RPi]       │
│  COM2 ← [Mic Casa]           │
│  NO2  → [Audio IN Citófono]  │
│  NC2  → [Audio OUT RPi]      │
│                              │
└──────────────────────────────┘
```

**Paso a paso:**

1. **Insertar módulo en protoboard** (filas centrales)

2. **Conexiones de señal**:
   ```
   Relé VCC → Cable rojo → Rail 5V
   Relé GND → Cable negro → Rail GND
   Relé IN1 → Cable amarillo → RPi GPIO17 (Pin 11)
   Relé IN2 → Cable naranja → RPi GPIO27 (Pin 13)
   ```

3. **Etiquetar cables**:
   - Cable amarillo: "RELAY1_IN1_GPIO17"
   - Cable naranja: "RELAY1_IN2_GPIO27"

4. **NO CONECTAR** polo de carga aún (se hará en Fase 7 - Integración)

### Paso 3.2: Módulo Relé 2 (Reservado - Opcional)

**Si deseas instalar el segundo módulo:**

```
Relé 2 VCC → Rail 5V
Relé 2 GND → Rail GND
Relé 2 IN1 → RPi GPIO22 (Pin 15)
Relé 2 IN2 → RPi GPIO23 (Pin 16)
```

**Etiquetar:**
- "RELAY2_IN1_GPIO22"
- "RELAY2_IN2_GPIO23"

---

## 🎹 Fase 4: Instalación del Multiplexor y Teclado

### Paso 4.1: Montar CD74HC4067

**Ubicación sugerida:** Centro-derecha de protoboard

```
┌────────────────────────────────────────┐
│      CD74HC4067 - CONEXIONES           │
├────────────────────────────────────────┤
│                                        │
│  Alimentación:                         │
│  Pin 24 (VCC) ← [Rail 3.3V] ⚠️        │
│  Pin 12 (GND) ← [Rail GND]            │
│  Pin 15 (EN)  ← [Rail GND] (siempre)  │
│                                        │
│  Control:                              │
│  Pin 10 (S0) ← [RPi GPIO5 - Pin 29]   │
│  Pin 11 (S1) ← [RPi GPIO6 - Pin 31]   │
│  Pin 14 (S2) ← [RPi GPIO13 - Pin 33]  │
│  Pin 13 (S3) ← [RPi GPIO19 - Pin 35]  │
│                                        │
│  Señal:                                │
│  Pin 1 (SIG) → [RPi GPIO26 - Pin 37]  │
│                                        │
│  Canales (C0-C15): Ver Paso 4.2       │
│                                        │
└────────────────────────────────────────┘
```

**Procedimiento:**

1. **Insertar CD74HC4067** en protoboard:
   - Montar a caballo sobre la ranura central
   - Pines 1-12 en un lado, 13-24 en el otro
   - Dejar espacio para cables

2. **Alimentación**:
   ```bash
   # ⚠️ CRÍTICO: Usar 3.3V, NO 5V
   Pin 24 (VCC) → Cable rojo corto → Rail 3.3V
   Pin 12 (GND) → Cable negro corto → Rail GND
   Pin 15 (EN)  → Cable negro corto → Rail GND  # Enable permanente
   ```

3. **Pines de control** (S0-S3):
   ```
   Pin 10 (S0) → Cable violeta → RPi Pin 29 (GPIO5)
   Pin 11 (S1) → Cable gris → RPi Pin 31 (GPIO6)
   Pin 14 (S2) → Cable blanco → RPi Pin 33 (GPIO13)
   Pin 13 (S3) → Cable marrón → RPi Pin 35 (GPIO19)
   ```

4. **Pin de señal**:
   ```
   Pin 1 (SIG) → Cable verde → RPi Pin 37 (GPIO26)
   ```

5. **Etiquetar todos los cables** con marcador permanente

### Paso 4.2: Conectar Teclado 4×4

**Identificar pines del teclado:**

```
Vista del conector (8 pines):
┌───────────────────────────────┐
│  1  2  3  4  5  6  7  8       │
│  │  │  │  │  │  │  │  │       │
│  R1 R2 R3 R4 C1 C2 C3 C4      │
└───────────────────────────────┘
```

**Mapeando lógica del teclado:**

El teclado es una matriz donde cada tecla conecta una fila con una columna:

```
       C1    C2    C3    C4
    ┌────┬────┬────┬────┐
R1  │  1 │  2 │  3 │  A │
    ├────┼────┼────┼────┤
R2  │  4 │  5 │  6 │  B │
    ├────┼────┼────┼────┤
R3  │  7 │  8 │  9 │  C │
    ├────┼────┼────┼────┤
R4  │  * │  0 │  # │  D │
    └────┴────┴────┴────┘
```

**Conexión estratégica:**

Necesitamos que cada combinación Fila×Columna mapee a un canal único del CD74HC4067.

**Solución:** Conectar cada fila a su grupo de 4 canales contiguos:

```
Teclado Pin 1 (R1) → MUX C0, C1, C2, C3
Teclado Pin 2 (R2) → MUX C4, C5, C6, C7
Teclado Pin 3 (R3) → MUX C8, C9, C10, C11
Teclado Pin 4 (R4) → MUX C12, C13, C14, C15
```

**Conexiones físicas:**

| Teclado Pin | Función | MUX Pins | Código Color Sugerido |
|-------------|---------|----------|-----------------------|
| 1 (R1) | Fila 1 | C0, C1, C2, C3 | Rojo (4 cables) |
| 2 (R2) | Fila 2 | C4, C5, C6, C7 | Naranja (4 cables) |
| 3 (R3) | Fila 3 | C8, C9, C10, C11 | Amarillo (4 cables) |
| 4 (R4) | Fila 4 | C12, C13, C14, C15 | Verde (4 cables) |
| 5 (C1) | Columna 1 | Común a todas | Azul (común) |
| 6 (C2) | Columna 2 | Común a todas | Violeta (común) |
| 7 (C3) | Columna 3 | Común a todas | Gris (común) |
| 8 (C4) | Columna 4 | Común a todas | Blanco (común) |

**Implementación práctica:**

1. **Filas (R1-R4)**: Cada fila se conecta a 4 canales del MUX mediante un bus común
   ```
   Ejemplo R1 (Pin 1 del teclado):
   - Conectar a protoboard rail temporal
   - Desde ese rail, 4 cables a MUX C0, C1, C2, C3
   ```

2. **Columnas (C1-C4)**: Detectan cuál columna se presionó
   ```
   Estrategia: Usar resistencias pull-down
   - C1 conecta a GND via 10kΩ
   - Al presionar tecla, se cierra circuito R×C
   - MUX detecta cambio de estado
   ```

**⚠️ IMPORTANTE:** Este es el cableado más complejo. Tomar tiempo y verificar cada conexión.

---

## 🎤 Fase 5: Instalación del Sistema de Audio

### Paso 5.1: Montar KY-037 (Sensor de Sonido)

**Ubicación:** Esquina inferior derecha de protoboard

```
┌──────────────────────────────┐
│    KY-037 - CONEXIONES       │
├──────────────────────────────┤
│                              │
│  VCC  ← [Rail 3.3V]          │
│  GND  ← [Rail GND]           │
│  AO   → [No conectar]        │
│  DO   → [RPi Pin 40-GPIO21]  │
│                              │
│  LED Rojo: Power ON          │
│  LED Azul: Detección activa  │
│  Potenciómetro: Sensibilidad │
│                              │
└──────────────────────────────┘
```

**Conexiones:**

1. **Alimentación**:
   ```
   KY-037 VCC → Cable rojo → Rail 3.3V
   KY-037 GND → Cable negro → Rail GND
   ```

2. **Salida digital**:
   ```
   KY-037 DO → Cable amarillo → RPi Pin 40 (GPIO21)
   ```

3. **Pin AO (análogo)**: **NO conectar** - RPi no tiene ADC

4. **Verificar LEDs**:
   - LED rojo debe encender al alimentar
   - LED azul parpadea al detectar sonido

5. **Ajustar sensibilidad**:
   - Girar potenciómetro completamente ANTI-HORARIO (menos sensible)
   - Probar haciendo ruido cerca
   - Ajustar hasta que LED azul reaccione a voz normal

### Paso 5.2: Conectar Altavoz

**⚠️ NOTA**: El altavoz NO se conecta directamente a GPIO. Requiere:
- **USB Sound Card** (tarjeta de audio USB)
- O módulo amplificador (PAM8403, MAX98357A)

**Opción A: USB Sound Card (RECOMENDADO)**

```
┌─────────────────────────────────────┐
│     USB Sound Card Típica          │
├─────────────────────────────────────┤
│                                     │
│  USB Plug → RPi USB Port            │
│                                     │
│  Output 3.5mm → Altavoz             │
│  Input 3.5mm  → Micrófono externo   │
│                                     │
│  Drivers: Auto-detect en Linux      │
│  Device: plughw:1,0                 │
│                                     │
└─────────────────────────────────────┘
```

**Conexión:**
1. Insertar USB Sound Card en puerto USB de RPi
2. Conectar altavoz 8Ω al jack 3.5mm OUTPUT
3. Verificar detección:
   ```bash
   aplay -l
   # Debe aparecer: card 1: Device [USB Audio Device]
   ```

**Opción B: PWM desde GPIO (Audio básico, baja calidad)**

```bash
# Solo para pruebas simples, NO para producción
# RPi Pin 12 (GPIO18) tiene PWM
# Conectar altavoz via transistor NPN + resistencia

Altavoz+ → Transistor Collector
Altavoz- → GND
GPIO18 → Resistor 1kΩ → Transistor Base
Transistor Emitter → GND
```

---

## 🔌 Fase 6: Conexión Final a Raspberry Pi

### Paso 6.1: Preparar Cables Dupont

**Organizar por función:**

| Grupo | Cantidad | Color Sugerido | Destino |
|-------|----------|----------------|---------|
| Power 5V | 1 | Rojo grueso | Pin 2 |
| Ground | 5 | Negro | Pins 6,9,14,20,25 |
| Power 3.3V | 1 | Rojo delgado | Pin 1 |
| Relés | 2-4 | Amarillo/Naranja | Pins 11,13,(15,16) |
| MUX Control | 4 | Violeta/Gris/Blanco/Marrón | Pins 29,31,33,35 |
| MUX Signal | 1 | Verde | Pin 37 |
| Audio Detect | 1 | Amarillo claro | Pin 40 |

### Paso 6.2: Conexión Sistemática

**APAGAR** todo antes de conectar. Proceder en este orden:

1. **Ground primero** (establece tierra común):
   ```
   RPi Pin 6 (GND) → Protoboard Rail GND
   RPi Pin 9 (GND) → Protoboard Rail GND (refuerzo)
   ```

2. **Alimentación 3.3V**:
   ```
   RPi Pin 1 (3.3V) → Protoboard Rail 3.3V
   ```

3. **Alimentación 5V**:
   ```
   RPi Pin 2 (5V) → Protoboard Rail 5V
   ```

4. **Relés** (outputs):
   ```
   RPi Pin 11 (GPIO17) → Relé 1 IN1
   RPi Pin 13 (GPIO27) → Relé 1 IN2
   ```

5. **Multiplexor control** (outputs):
   ```
   RPi Pin 29 (GPIO5)  → MUX S0
   RPi Pin 31 (GPIO6)  → MUX S1
   RPi Pin 33 (GPIO13) → MUX S2
   RPi Pin 35 (GPIO19) → MUX S3
   ```

6. **Multiplexor señal** (input):
   ```
   RPi Pin 37 (GPIO26) → MUX SIG
   ```

7. **Audio detect** (input):
   ```
   RPi Pin 40 (GPIO21) → KY-037 DO
   ```

### Paso 6.3: Verificación Visual

**Checklist de conexiones:**

- [ ] Todas las tierras conectadas entre sí
- [ ] No hay cables cruzados
- [ ] Cables bien insertados (click audible en Dupont)
- [ ] No hay cables sueltos tocando otros pines
- [ ] Colores consistentes (rojo=+, negro=GND)
- [ ] Ningún cable toca componentes metálicos
- [ ] Protoboard estable, no se mueve

**Fotografiar el montaje** desde múltiples ángulos para referencia.

---

## ⚡ Fase 7: Primera Energización y Tests

### Paso 7.1: Test de Alimentación (Sin RPi)

**Objetivo:** Verificar voltajes antes de energizar RPi

1. **Conectar 12V DC a LM2596S** (IN+/IN-)

2. **Medir voltajes con multímetro**:
   ```
   Rail 5V a GND:  Debe medir 5.00V ± 0.05V ✅
   Rail 3.3V a GND: Sin RPi, debe medir 0V aún ✅
   VCC Relé 1:     Debe medir 5.00V ✅
   VCC CD74HC4067: Sin RPi, 0V aún ✅
   ```

3. **LEDs del módulo relé**:
   - No deben encender (IN1/IN2 están sin señal)

4. **Si todo correcto**: Apagar fuente, proceder a Paso 7.2

### Paso 7.2: Primera Energización con RPi

**⚠️ ÚLTIMA VERIFICACIÓN:**
- [ ] Voltajes correctos (5V y 0V donde corresponde)
- [ ] Todas las tierras conectadas
- [ ] No hay cortocircuitos visibles
- [ ] Cables bien conectados
- [ ] Multímetro listo para medir

**Procedimiento:**

1. **Enchufar fuente 12V**

2. **Observar LEDs de RPi**:
   - LED rojo (poder): Debe encender inmediatamente ✅
   - LED verde (actividad): Debe parpadear al bootear ✅

3. **Si RPi NO enciende**:
   - ❌ APAGAR inmediatamente
   - Verificar voltaje en Pin 2 (debe ser 5V)
   - Verificar GND conectado
   - Revisar LM2596S ajustado correctamente

4. **Si RPi enciende correctamente**:
   - Esperar 30-60 segundos (boot completo)
   - Verificar conexión SSH:
     ```bash
     ssh pi@raspberrypi.local
     ```

5. **Medir voltajes con RPi ON**:
   ```
   Rail 5V:   5.00V ✅
   Rail 3.3V: 3.30V ✅ (ahora alimentado por RPi)
   Pin 1 RPi: 3.30V ✅
   Pin 2 RPi: 5.00V ✅
   ```

### Paso 7.3: Test de GPIO Individuales

**Instalar herramientas de test:**

```bash
# Conectar por SSH
ssh pi@raspberrypi.local

# Instalar wiringpi
sudo apt install -y wiringpi

# Verificar GPIO disponibles
gpio readall
```

**Test 1: Activar Relé 1**

```bash
# Configurar GPIO17 como output
gpio -g mode 17 out

# Activar relé (HIGH)
gpio -g write 17 1

# OBSERVAR: LED del relé 1 debe ENCENDER
# ESCUCHAR: Click audible del relé

# Desactivar relé (LOW)
gpio -g write 17 0

# OBSERVAR: LED del relé 1 debe APAGAR
```

**Test 2: Leer Sensor de Audio**

```bash
# Configurar GPIO21 como input
gpio -g mode 21 in

# Leer estado
gpio -g read 21
# Resultado: 0 o 1

# Hacer ruido cerca del KY-037
# LED azul del sensor debe encender

# Leer de nuevo
gpio -g read 21
# Debe cambiar a 1 cuando hay sonido
```

**Test 3: Multiplexor (Seleccionar Canal 0)**

```bash
# Configurar pines de control como output
gpio -g mode 5 out   # S0
gpio -g mode 6 out   # S1
gpio -g mode 13 out  # S2
gpio -g mode 19 out  # S3

# Configurar pin de señal como input con pull-up
gpio -g mode 26 in
gpio -g mode 26 up

# Seleccionar canal 0 (binario 0000)
gpio -g write 5 0
gpio -g write 6 0
gpio -g write 13 0
gpio -g write 19 0

# Presionar tecla "1" en el teclado
# Leer señal
gpio -g read 26
# Debe cambiar de 1 a 0 cuando se presiona
```

---

## 🚀 Fase 8: Instalación del Software vigilia-hub

### Paso 8.1: Clonar Repositorio

```bash
# Conectar por SSH
ssh pi@raspberrypi.local

# Instalar Git
sudo apt install -y git

# Clonar proyecto
cd ~
git clone https://github.com/TU_USUARIO/vigilia-hub.git
cd vigilia-hub

# Instalar dependencias
npm install
```

### Paso 8.2: Configurar Variables de Entorno

```bash
# Copiar template de .env
cp .env.example .env

# Editar configuración
nano .env
```

**Configuración mínima:**

```bash
# Backend (ajustar a tu servidor)
BACKEND_URL=http://TU_SERVIDOR:3000
HUB_SECRET=tu_secret_muy_seguro_123456

# Hub ID
HUB_ID=hub-test-001
HUB_LOCATION=Casa Simulación

# GPIO Pins (verificar que coincidan con hardware)
RELAY_PIN_1=17
RELAY_PIN_2=27

# Audio Device (USB Sound Card)
AUDIO_DEVICE=plughw:1,0

# Sample Rates
HARDWARE_SAMPLE_RATE=48000
TARGET_SAMPLE_RATE=24000

# Logging
LOG_LEVEL=debug
NODE_ENV=development
```

**Guardar**: `Ctrl+O`, `Enter`, `Ctrl+X`

### Paso 8.3: Compilar y Ejecutar

```bash
# Compilar TypeScript
npm run build

# Ejecutar en modo desarrollo (con logs)
npm run dev

# O ejecutar en producción
npm start
```

**Logs esperados:**

```
[RelayControllerService] ✅ Relés inicializados en GPIO 17, 27
[GPIOControllerService] ✅ GPIO Multiplexor inicializado
[ConnectivityService] ✅ Conectividad verificada
[WebSocketClient] 🔗 Conectando a backend...
[WebSocketClient] ✅ Conectado exitosamente
```

### Paso 8.4: Test de Funcionalidad Completa

**Test A: Activar IA manualmente**

```bash
# En otra terminal SSH
ssh pi@raspberrypi.local

# Activar relés vía comando
gpio -g write 17 1
gpio -g write 27 1

# Verificar logs en terminal principal
# Debe mostrar: "🔌 ACTIVANDO INTERCEPCIÓN (Relés ON)"

# Desactivar
gpio -g write 17 0
gpio -g write 27 0
```

**Test B: Detección de timbre simulado**

```bash
# Hacer ruido prolongado cerca del KY-037
# Sensor debe detectar → LED azul enciende
# Logs deben mostrar: "🔔 Timbre detectado"
```

**Test C: Lectura de teclado**

```bash
# Presionar teclas del teclado 4×4
# Logs deben mostrar:
# "Tecla presionada: 1" (canal 0)
# "Tecla presionada: 5" (canal 5)
# etc.
```

---

## 🐞 Troubleshooting Común

### Problema: RPi no enciende

**Síntomas:** LED rojo no enciende, nada en HDMI

**Soluciones:**
1. Verificar voltaje LM2596S: debe ser **exactamente 5.0V**
2. Verificar conexión Pin 2 (5V) y Pin 6 (GND)
3. Probar alimentar RPi directamente con fuente micro-USB oficial

### Problema: Relés no conmutan

**Síntomas:** LED del relé no enciende, no se escucha click

**Soluciones:**
1. Medir voltaje en VCC del relé: debe ser **5V**
2. Medir voltaje en IN1/IN2 al activar GPIO:
   - LOW: 0V
   - HIGH: 3.3V (suficiente para optoacoplador)
3. Verificar continuidad GND entre RPi y relé
4. Probar relé con comando directo:
   ```bash
   gpio -g write 17 1
   ```

### Problema: Teclado no responde

**Síntomas:** GPIO26 siempre lee mismo valor, no detecta teclas

**Soluciones:**
1. Verificar CD74HC4067 alimentado con **3.3V** (NO 5V)
2. Verificar pin EN del MUX conectado a **GND**
3. Probar selección de canales:
   ```bash
   # Canal 5 = binario 0101
   gpio -g write 5 1   # S0 = 1
   gpio -g write 6 0   # S1 = 0
   gpio -g write 13 1  # S2 = 1
   gpio -g write 19 0  # S3 = 0
   
   # Presionar tecla "5" físicamente
   gpio -g read 26  # Debe cambiar
   ```
4. Verificar continuidad de cables del teclado
5. Probar teclas con multímetro (modo continuidad)

### Problema: Audio no funciona

**Síntomas:** No se escucha nada en altavoz, no captura micrófono

**Soluciones:**
1. Verificar USB Sound Card detectada:
   ```bash
   aplay -l
   lsusb  # Debe aparecer "Audio Device"
   ```
2. Probar reproducción:
   ```bash
   speaker-test -D plughw:1,0 -c 2
   ```
3. Probar captura:
   ```bash
   arecord -D plughw:1,0 -f S16_LE -r 48000 test.wav
   # Hacer ruido por 5s, luego Ctrl+C
   aplay test.wav
   ```
4. Verificar en .env:
   ```bash
   AUDIO_DEVICE=plughw:1,0
   ```

### Problema: GPIO permissions

**Síntomas:** Error "Permission denied" al acceder GPIO

**Soluciones:**
```bash
# Agregar usuario a grupo gpio
sudo usermod -a -G gpio pi

# Reiniciar
sudo reboot

# Verificar permisos
groups
# Debe incluir: gpio
```

---

## 📊 Checklist Final de Instalación

### Hardware

- [ ] LM2596S ajustado a 5.0V exactos
- [ ] Todas las tierras conectadas (common ground)
- [ ] Relés responden a GPIO (click audible)
- [ ] CD74HC4067 alimentado con 3.3V (NO 5V)
- [ ] Teclado detecta teclas correctamente
- [ ] KY-037 LED rojo encendido (power)
- [ ] KY-037 LED azul responde a sonido
- [ ] USB Sound Card detectada por RPi
- [ ] Altavoz conectado y funcional
- [ ] No hay cortocircuitos visibles
- [ ] Cables bien etiquetados

### Software

- [ ] Raspberry Pi OS actualizado
- [ ] Node.js 18+ instalado
- [ ] vigilia-hub clonado y compilado
- [ ] .env configurado correctamente
- [ ] npm install sin errores
- [ ] npm run build exitoso
- [ ] Logs muestran servicios iniciados
- [ ] Conexión WebSocket al backend OK
- [ ] GPIO pins responden correctamente

### Tests

- [ ] Relé 1 se activa y desactiva
- [ ] Relé 2 se activa y desactiva (opcional)
- [ ] Teclado lee todas las 16 teclas
- [ ] Sensor de audio detecta sonidos
- [ ] Audio OUT funcional (speaker-test)
- [ ] Audio IN funcional (arecord)
- [ ] Sistema completo ejecuta sin crashes
- [ ] Watchdog desactiva relés a 180s

---

## 🎓 Próximos Pasos

### Calibración

1. **Ajustar sensibilidad de KY-037**:
   - Probar con timbre real o simulado
   - Evitar falsos positivos (ruido ambiente)

2. **Calibrar volúmenes de audio**:
   ```bash
   alsamixer
   # Ajustar niveles de captura y reproducción
   ```

3. **Optimizar latencia**:
   - Reducir `RELAY_SETTLING_TIME_MS` si no hay "pop"
   - Monitorear latencia de OpenAI Realtime API

### Integración Real

1. **Conexión al citófono real** (cuando esté listo):
   - Identificar cables de audio del citófono
   - Conectar COM de relés a líneas reales
   - **Probar primero en modo monitor** (solo escucha, sin intercepción)

2. **Monitoreo continuo**:
   - Configurar systemd service
   - Logs rotativos
   - Alertas por Discord/Telegram

3. **Optimizaciones**:
   - Agregar display LCD para status
   - LEDs RGB indicadores de estado
   - Botón físico de emergency-stop

---

## 📚 Recursos Adicionales

- [Raspberry Pi GPIO Pinout Interactive](https://pinout.xyz/)
- [onoff Library Documentation](https://github.com/fivdi/onoff)
- [ALSA Audio Configuration](https://wiki.archlinux.org/title/Advanced_Linux_Sound_Architecture)
- [CD74HC4067 Datasheet](https://www.ti.com/lit/ds/symlink/cd74hc4067.pdf)
- [LM2596S Datasheet](https://www.ti.com/lit/ds/symlink/lm2596.pdf)

---

## ✅ ¡Instalación Completa!

Si llegaste hasta aquí y pasaste todos los tests, **¡felicitaciones!** 🎉

Tu sistema **vigilia-hub** está completamente funcional y listo para:
- Interceptar llamadas de citófono
- Procesar audio con OpenAI Realtime API
- Detectar eventos de timbre
- Leer entradas de teclado simulado

**Documentación complementaria:**
- [CIRCUIT_DIAGRAM.md](./CIRCUIT_DIAGRAM.md) - Esquemáticos detallados
- [PIN_MAPPING.md](./PIN_MAPPING.md) - Referencia rápida de pines

**¿Problemas?** Revisa la sección Troubleshooting o abre un issue en GitHub.

**¡Buen trabajo! 🚀**
