# Setup de Laboratorio - Vigilia Hub

> **Situación**: Solo tienes Raspberry Pi 3, protoboard y cables Dupont  
> **Objetivo**: Comenzar desarrollo SIN esperar componentes adicionales  
> **Alimentación**: Fuente micro-USB estándar (NO requiere LM2596S)

---

## 🎯 ¿Qué puedes hacer AHORA?

Con solo RPi + protoboard + cables, puedes avanzar **~60% del proyecto**:

✅ Configurar todo el software  
✅ Desarrollar lógica de negocio  
✅ Probar GPIO con LEDs simples  
✅ Conectar al backend  
✅ Probar OpenAI Realtime API  
✅ Desarrollar tests unitarios  
✅ Simular componentes por software  

---

## ⚡ Fast Track: 5 Pasos para Empezar HOY

### Paso 1: Alimentar Raspberry Pi (5 minutos)

**En laboratorio, USA:**
- ✅ **Fuente micro-USB oficial** (5V 2.5A mínimo)
- ✅ Powerbank USB (si es de buena calidad)
- ✅ Adaptador de celular (Samsung, Apple - 2A+)

**🚫 NO uses LM2596S** - Solo es para instalación final en citófono (que tiene 12V)

```
┌─────────────────────────────────────┐
│      SETUP DE LABORATORIO           │
├─────────────────────────────────────┤
│                                     │
│  Enchufe 220V ──► Adaptador micro- │
│                   USB (5V 2.5A)     │
│                         │           │
│                         ▼           │
│                   ┌──────────┐      │
│                   │  RPi 3B  │      │
│                   └────┬─────┘      │
│                        │            │
│                    GPIO Pins        │
│                        │            │
│                   Protoboard        │
│                   (Para tests)      │
│                                     │
└─────────────────────────────────────┘
```

**Conectar:**
```bash
# 1. Insertar microSD con Raspberry Pi OS
# 2. Conectar cable micro-USB
# 3. Esperar LED rojo (power) encender
# 4. Esperar LED verde (activity) parpadear
# 5. Conectar por SSH
ssh pi@raspberrypi.local
```

---

### Paso 2: Instalar Software Base (15 minutos)

```bash
# --- ACTUALIZAR SISTEMA ---
sudo apt update && sudo apt upgrade -y

# --- NODE.JS 18+ ---
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
node --version  # Debe ser v18+

# --- HERRAMIENTAS GPIO ---
sudo apt install -y wiringpi git

# --- AUDIO (aunque no tengas hardware aún) ---
sudo apt install -y alsa-utils sox

# --- PERMISOS GPIO ---
sudo usermod -a -G gpio pi
sudo reboot
```

---

### Paso 3: Clonar Proyecto y Configurar (10 minutos)

```bash
# Conectar de nuevo después del reboot
ssh pi@raspberrypi.local

# Clonar repositorio
cd ~
git clone https://github.com/TU_USUARIO/vigilia-hub.git
cd vigilia-hub

# Instalar dependencias
npm install

# Configurar .env para desarrollo local
cp .env.example .env
nano .env
```

**Configuración .env para laboratorio:**
```bash
# Backend (puede ser localhost si corres backend local)
BACKEND_URL=http://localhost:3000
HUB_SECRET=dev_secret_123456

# Hub ID
HUB_ID=hub-lab-001
HUB_LOCATION=Laboratorio Test

# GPIO Pins (aunque no tengas hardware, define defaults)
RELAY_PIN_1=17
RELAY_PIN_2=27

# Audio (comentar si no tienes USB Sound Card aún)
# AUDIO_DEVICE=plughw:1,0
HARDWARE_SAMPLE_RATE=48000
TARGET_SAMPLE_RATE=24000

# Timeouts
RELAY_SETTLING_TIME_MS=200
MAX_INTERCEPT_TIME_MS=180000

# Logging MUY IMPORTANTE en desarrollo
LOG_LEVEL=debug
NODE_ENV=development
```

**Guardar**: `Ctrl+O`, `Enter`, `Ctrl+X`

---

### Paso 4: Compilar y Ejecutar (5 minutos)

```bash
# Compilar TypeScript
npm run build

# Ejecutar en modo desarrollo (con hot-reload)
npm run dev
```

**Logs esperados (algunos servicios fallarán, es normal):**
```
[Logger] ✅ Logger inicializado (nivel: debug)
[RelayControllerService] ✅ Relés inicializados en GPIO 17, 27
[GPIOControllerService] ❌ Error GPIO (normal, no hay MUX conectado)
[ConnectivityService] ✅ Conectividad verificada
[WebSocketClient] 🔗 Conectando a backend...
[WebSocketClient] ❌ Error conexión (normal si backend no corre)
```

**✅ Si ves logs y NO se crashea**: Todo bien, software funciona.

---

### Paso 5: Probar GPIO con LEDs (20 minutos)

**Materiales del "Kit Componentes Electrónicos M":**
- 2× LEDs (rojo y verde)
- 2× Resistencias 220Ω o 330Ω
- Cables Dupont
- Protoboard

#### Test 1: LED Simple (Simula Relé 1)

**Circuito:**
```
RPi GPIO17 (Pin 11) ──► Resistor 220Ω ──► LED+ ──► LED- ──► GND (Pin 6)
```

**Montaje:**
```
┌─────────────────────────────────────┐
│         PROTOBOARD                  │
├─────────────────────────────────────┤
│                                     │
│  Rail + (No usar)                   │
│  Rail - (GND) ◄──────────┐         │
│                           │         │
│  [Resistor 220Ω]──[LED+]─┤         │
│         ▲                 │         │
│         │                 │         │
│    Cable desde            │         │
│    RPi Pin 11        Cable desde    │
│    (GPIO17)          RPi Pin 6 (GND)│
│                                     │
└─────────────────────────────────────┘
```

**Paso a paso:**
1. Insertar resistor en protoboard (fila 10, columnas D-F)
2. Insertar LED:
   - **Pata larga (+, ánodo)** en fila 10, columna G
   - **Pata corta (-, cátodo)** en fila 12, columna G
3. Cable Negro: **RPi Pin 6 (GND)** → Fila 12, columna I → Rail GND
4. Cable Amarillo: **RPi Pin 11 (GPIO17)** → Fila 10, columna C

**Probar:**
```bash
# Configurar GPIO17 como output
gpio -g mode 17 out

# Encender LED (simula activar Relé 1)
gpio -g write 17 1
# ✅ LED debe ENCENDER

# Apagar LED
gpio -g write 17 0
# ✅ LED debe APAGAR

# Hacer parpadear (blink)
while true; do gpio -g write 17 1; sleep 0.5; gpio -g write 17 0; sleep 0.5; done
# Ctrl+C para detener
```

#### Test 2: Segundo LED (Simula Relé 2)

**Mismo circuito pero con GPIO27:**
```
RPi GPIO27 (Pin 13) ──► Resistor 220Ω ──► LED+ ──► LED- ──► GND (Pin 9)
```

**Probar:**
```bash
gpio -g mode 27 out
gpio -g write 27 1  # LED 2 ON
gpio -g write 27 0  # LED 2 OFF
```

#### Test 3: Control desde Node.js

**Crear archivo de prueba:**
```bash
nano ~/test-gpio-lab.js
```

**Código:**
```javascript
const Gpio = require('onoff').Gpio;

// Simular relés con LEDs
const led1 = new Gpio(17, 'out'); // Relé 1
const led2 = new Gpio(27, 'out'); // Relé 2

console.log('🔴 Test GPIO - Simulación de Relés');
console.log('Presiona Ctrl+C para salir');

let state = 0;

// Alternar LEDs cada segundo
const interval = setInterval(() => {
  state = state ? 0 : 1;
  
  led1.writeSync(state);
  led2.writeSync(state ? 0 : 1); // Invertido
  
  console.log(`LED1: ${state ? 'ON' : 'OFF'} | LED2: ${state ? 'OFF' : 'ON'}`);
}, 1000);

// Cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Deteniendo...');
  clearInterval(interval);
  led1.writeSync(0);
  led2.writeSync(0);
  led1.unexport();
  led2.unexport();
  process.exit();
});
```

**Ejecutar:**
```bash
node ~/test-gpio-lab.js
# Deberías ver LEDs alternando
# Ctrl+C para detener
```

✅ **Si funciona**: Tu código GPIO está correcto, cuando conectes los relés reales funcionarán igual.

---

## 🧪 Tests Avanzados (Sin Hardware Adicional)

### Test 4: Simular Multiplexor

Aunque no tengas el CD74HC4067, puedes probar la lógica:

```bash
nano ~/test-mux-simulation.js
```

```javascript
const Gpio = require('onoff').Gpio;

// Pines de control del MUX (sin hardware, solo prueban que GPIO funciona)
const s0 = new Gpio(5, 'out');
const s1 = new Gpio(6, 'out');
const s2 = new Gpio(13, 'out');
const s3 = new Gpio(19, 'out');

// Función para seleccionar canal (0-15)
function selectChannel(channel) {
  s0.writeSync((channel & 0x01));
  s1.writeSync(((channel >> 1) & 0x01));
  s2.writeSync(((channel >> 2) & 0x01));
  s3.writeSync(((channel >> 3) & 0x01));
  
  console.log(`Canal ${channel}: S3=${(channel>>3)&1} S2=${(channel>>2)&1} S1=${(channel>>1)&1} S0=${channel&1}`);
}

// Probar selección de todos los canales
console.log('🎛️ Simulación de Multiplexor CD74HC4067');
for (let i = 0; i < 16; i++) {
  selectChannel(i);
}

// Cleanup
s0.unexport();
s1.unexport();
s2.unexport();
s3.unexport();

console.log('✅ Lógica de multiplexor verificada');
```

```bash
node ~/test-mux-simulation.js
```

✅ **Verifica que la lógica binaria funciona correctamente**.

---

### Test 5: Conectar al Backend (Mock)

Si no tienes el backend corriendo, puedes usar un mock:

```bash
# Instalar herramienta de mock WebSocket
npm install -g wscat

# En una terminal, crear servidor WebSocket mock
wscat -l 3000
```

**En otra terminal SSH:**
```bash
cd ~/vigilia-hub

# Editar .env para apuntar a localhost
nano .env
# Cambiar: BACKEND_URL=ws://localhost:3000

# Ejecutar hub
npm run dev
```

✅ **Deberías ver conexión exitosa en ambas terminales**.

---

## 📋 Checklist de Progreso en Laboratorio

### Fase 1: Software Base ✅
- [ ] Raspberry Pi OS instalado y actualizado
- [ ] Node.js 18+ funcionando
- [ ] vigilia-hub clonado
- [ ] npm install sin errores
- [ ] npm run build exitoso
- [ ] npm run dev ejecuta (aunque servicios fallen)

### Fase 2: GPIO Básico ✅
- [ ] Permisos GPIO configurados (grupo gpio)
- [ ] LEDs funcionan con gpio command
- [ ] LEDs funcionan con Node.js (onoff)
- [ ] Simulación de relés con LEDs OK

### Fase 3: Desarrollo de Lógica ✅
- [ ] Lógica de multiplexor verificada (sin hardware)
- [ ] Tests unitarios pasan (npm test)
- [ ] WebSocket conecta (aunque sea a mock)
- [ ] Logs estructurados funcionando

### Fase 4: Preparación para Hardware ⏳
- [ ] Documentación de hardware revisada
- [ ] Circuitos entendidos
- [ ] Código de servicios revisado
- [ ] Plan de conexión listo

---

## 🎓 Qué Desarrollar AHORA (Sin Hardware)

### 1. Lógica de Negocio

**Servicios que puedes desarrollar completamente:**

```typescript
// src/services/local-cache.service.ts
// ✅ Ya está completo - probar más casos

// src/services/connectivity.service.ts
// ✅ Funciona sin hardware - probar desconexiones

// src/services/websocket-client.service.ts
// ✅ Desarrollar protocolo de mensajes

// src/services/logger.ts
// ✅ Mejorar formato de logs
```

### 2. Tests Unitarios

```bash
# Ejecutar tests existentes
npm test

# Crear nuevos tests
nano src/services/__tests__/audio-router.spec.ts
```

### 3. Integración con Backend

**Si tienes acceso al backend:**
```bash
# En tu laptop/PC, clonar backend
git clone BACKEND_REPO
cd backend
npm install
npm run dev

# Obtener IP de tu laptop
ipconfig  # Windows
ifconfig  # Linux/Mac

# En RPi, editar .env
nano ~/vigilia-hub/.env
# BACKEND_URL=http://192.168.1.XXX:3000
```

### 4. Documentación

**Crear casos de uso:**
```bash
nano ~/vigilia-hub/docs/USE_CASES.md
```

**Documentar flujos:**
```bash
nano ~/vigilia-hub/docs/FLOWS.md
```

---

## 📦 Cuando Lleguen los Componentes

### Orden de Instalación Sugerido:

#### Semana 1: Relés (PRIORIDAD)
```
✅ Ya tienes: RPi, protoboard, cables
➕ Llegan: Relés 5V 2ch (×2)

Instalar primero:
1. Conectar relés según CIRCUIT_DIAGRAM.md
2. Probar activación con LEDs ya instalados
3. Medir voltajes con multímetro
4. Ejecutar: npm run test:hardware (solo sección relés)
```

#### Semana 2: Multiplexor + Teclado
```
➕ Llegan: CD74HC4067, Teclado 4×4

Instalar:
1. Montar MUX siguiendo PIN_MAPPING.md
2. Conectar teclado a canales MUX
3. Probar lectura de teclas
4. Ejecutar: npm run test:hardware (sección MUX)
```

#### Semana 3: Audio
```
➕ Llegan: KY-037, Altavoz, Kit componentes

Instalar:
1. KY-037 para detección digital
2. Altavoz via USB Sound Card (comprar aparte)
3. Probar captura/reproducción
4. Ejecutar: npm run test:hardware (sección audio)
```

#### Semana 4: Integración Final
```
✅ Todo conectado

1. Ejecutar: npm run test:hardware (suite completa)
2. Probar con backend real
3. Simular llamada de citófono
4. Ajustar parámetros (.env)
```

---

## 🚫 NO Necesitas Aún

### En Laboratorio NO uses:
- ❌ **LM2596S Buck Converter** - Solo para instalación en citófono real
- ❌ **Fuente 12V** - La RPi se alimenta por micro-USB
- ❌ **Cables de citófono** - Trabaja con mocks primero

### Cuando Instales en Citófono Real:
- ✅ Ahí sí usarás LM2596S para convertir 12V → 5V
- ✅ Conectarás líneas de audio reales
- ✅ Integrarás con AIPHONE GT

---

## 💡 Tips de Desarrollo

### 1. Usar VS Code Remote SSH
```bash
# En tu laptop/PC, instalar VS Code
# Instalar extensión "Remote - SSH"
# Conectar a: pi@raspberrypi.local

# Ahora editas código directamente en RPi desde tu PC
# ¡Mucho más cómodo!
```

### 2. Logs en Tiempo Real
```bash
# Terminal 1: Ejecutar hub
npm run dev

# Terminal 2: Ver logs filtrados
npm run dev 2>&1 | grep "ERROR"
npm run dev 2>&1 | grep "RelayController"
```

### 3. Git para Versionar
```bash
cd ~/vigilia-hub
git init
git add .
git commit -m "Setup inicial laboratorio"

# Crear branch de desarrollo
git checkout -b lab-development
```

### 4. Simular Timbre
```bash
# Sin hardware, simula detección de timbre
# Edita el servicio para aceptar trigger manual

# O crea endpoint HTTP simple
nano ~/trigger-test.js
```

```javascript
const http = require('http');

http.createServer((req, res) => {
  if (req.url === '/trigger-bell') {
    console.log('🔔 TIMBRE SIMULADO');
    // Aquí llamarías a tu lógica de hub
    res.end('Bell triggered\n');
  }
}).listen(8080);

console.log('Test server en http://localhost:8080/trigger-bell');
```

```bash
node ~/trigger-test.js &

# Probar
curl http://localhost:8080/trigger-bell
```

---

## 🎯 Meta: 2 Semanas de Lab

**Semana 1** (Solo RPi):
- ✅ Software 100% funcional
- ✅ Tests unitarios >80%
- ✅ GPIO básico con LEDs
- ✅ Conexión backend funcionando

**Semana 2** (Con primeros componentes):
- ✅ Relés reales funcionando
- ✅ Audio captura/reproducción
- ✅ Integración OpenAI API
- ✅ Demo funcional completo

---

## 📞 Troubleshooting Laboratorio

### Problema: RPi no bootea
**Causa**: MicroSD corrupta o fuente insuficiente  
**Solución**:
```bash
# Re-flashear SD con Raspberry Pi Imager
# Usar fuente 2.5A mínimo (no cargador de celular viejo)
```

### Problema: SSH no conecta
**Causa**: WiFi no configurado  
**Solución**:
```bash
# Conectar HDMI + teclado USB
# Configurar WiFi manualmente:
sudo raspi-config
# Opción 1: System Options → Wireless LAN
```

### Problema: GPIO permission denied
**Causa**: Usuario no en grupo gpio  
**Solución**:
```bash
sudo usermod -a -G gpio pi
sudo reboot
```

### Problema: npm install falla
**Causa**: Falta espacio o RAM  
**Solución**:
```bash
# Verificar espacio
df -h
# Debe tener >2GB libre

# Verificar RAM
free -h
# RPi 3 tiene 1GB, suficiente

# Limpiar cache
npm cache clean --force
rm -rf node_modules
npm install
```

---

## ✅ Resumen: Empieza YA

**Lo que PUEDES hacer hoy:**
1. ✅ Instalar software completo
2. ✅ Desarrollar lógica de negocio
3. ✅ Probar GPIO con LEDs simples
4. ✅ Conectar al backend
5. ✅ Escribir tests unitarios
6. ✅ Documentar casos de uso

**Lo que necesitas esperar:**
- ⏳ Relés reales (para intercepción real)
- ⏳ Multiplexor (para teclado)
- ⏳ Audio hardware (para OpenAI)

**Progreso posible SIN hardware adicional**: **~60%** 🎉

---

**Próximo paso**: Ejecuta el Paso 1 y comparte screenshot de `npm run dev` funcionando.

¡Manos a la obra! 🚀
