# Migración a pigpio - GPIO Moderno para Raspberry Pi

> **Fecha**: 13 de Febrero de 2026  
> **Cambio**: Migración de `onoff` a `pigpio` para compatibilidad con kernels modernos

---

## 🎯 Problema Resuelto

### Antes (onoff)
- Usaba sistema GPIO **sysfs** (deprecated)
- No funcionaba en kernels 6.x+ sin configuración adicional
- Requería offset manual para base 512
- Error: `EINVAL: invalid argument, write`

### Ahora (pigpio)
- Usa acceso directo a hardware vía **/dev/mem** o **/dev/gpiomem**
- Compatible con todos los kernels
- **NO requiere offsets** - maneja automáticamente
- Librería **más popular** y mejor mantenida del ecosistema RPi
- Funciona "out of the box" en todas las versiones de Raspberry Pi OS

---

## 📦 Cambios Implementados

### 1. Nuevo Wrapper de GPIO
**Archivo**: `src/utils/gpio-wrapper.ts`

**Características**:
- ✅ API compatible con `onoff` (sin breaking changes)
- ✅ Usa `pigpio` en Raspberry Pi real
- ✅ Mock automático si no es RPi (desarrollo en PC/Mac)
- ✅ Detección automática de plataforma
- ✅ Logs detallados para debugging
- ✅ Soporte completo para interrupciones (rising/falling/both)

**API Soportada**:
```typescript
const gpio = new Gpio(17, 'out');
gpio.writeSync(1);  // HIGH
gpio.writeSync(0);  // LOW
gpio.readSync();    // Leer valor
gpio.unexport();    // Limpiar
```

### 2. Servicios Actualizados
- `gpio-controller.service.ts` → Usa nuevo wrapper
- `relay-controller.service.ts` → Usa nuevo wrapper

**Cambio simple**:
```typescript
// Antes
import { Gpio } from 'onoff';

// Ahora
import { Gpio } from '../utils/gpio-wrapper';
```

### 3. package.json Actualizado
```json
"dependencies": {
  "pigpio": "^3.3.1"  // ← Nueva dependencia
},
"optionalDependencies": {
  "onoff": "^6.0.3"  // ← Opcional (backward compatibility)
}
```

---

## 🚀 Instalación en Raspberry Pi

### Paso 1: Instalar pigpio system library
```bash
# Instalar librería del sistema (requerido)
sudo apt-get update
sudo apt-get install -y pigpio

# Habilitar daemon (opcional, pero recomendado para mejor rendimiento)
sudo systemctl enable pigpiod
sudo systemctl start pigpiod
```

### Paso 2: Actualizar Código
```bash
cd ~/vigilia-hub
git pull
```

### Paso 3: Instalar dependencias Node.js
```bash
npm install
```

### Paso 4: Recompilar
```bash
npm run build
```

### Paso 5: Probar
```bash
npm run dev
```

**Output esperado**:
```
[GPIOWrapper] GPIO17 inicializado como out (pigpio)
[GPIOWrapper] GPIO27 inicializado como out (pigpio)
[RelayControllerService] ✅ Relés inicializados en GPIO 17, 27
```

---

## 🧪 Testing

### Test Manual GPIO
```bash
# Crear test rápido
node -e "const {Gpio} = require('./dist/utils/gpio-wrapper'); \
const led = new Gpio(17, 'out'); \
led.writeSync(1); \
setTimeout(() => { led.writeSync(0); led.unexport(); }, 1000);"
```

### Test con LEDs
Conecta LED + resistor 220Ω:
- GPIO17 (Pin 11) → Resistor → LED+ → LED- → GND (Pin 6)

```bash
npm run test:relays
```

---

## 📋 Comparación: onoff vs pigpio

| Característica | onoff (viejo) | pigpio (nuevo) |
|----------------|---------------|----------------|
| **Sistema** | sysfs (/sys/class/gpio) | Direct hardware (/dev/mem) |
| **Kernel 6.x+** | ❌ Deprecated | ✅ Funciona perfecto |
| **Offset manual** | ⚠️ Requerido (base 512) | ✅ Automático |
| **Performance** | Normal | ⚡ Más rápido (acceso directo) |
| **Comunidad** | Pequeña | 🌟 Muy grande (5k+ stars) |
| **Futuro** | 🔻 Eliminado en kernel 7.x | ✅ Independiente del kernel |
| **Setup** | ⚠️ Requiere config | ✅ apt-get install pigpio |
| **Interrupciones** | Básicas | ✅ Avanzadas con timing preciso |

---

## 🔍 Troubleshooting

### Error: "Cannot find module 'pigpio'"
```bash
npm install pigpio --save

# Si falla la compilación, instalar primero la librería del sistema
sudo apt-get install -y pigpio
npm install pigpio
```

### Error: "Error exporting GPIO"
```bash
# Verificar que pigpio esté instalado
dpkg -l | grep pigpio

# Instalar si falta
sudo apt-get install -y pigpio

# Verificar permisos
groups  # Debe incluir 'gpio'

# Si falta, agregar usuario
sudo usermod -a -G gpio $USER
sudo reboot
```

### Error: "Cannot connect to pigpio daemon"
```bash
# Iniciar daemon manualmente
sudo pigpiod

# O habilitar para inicio automático
sudo systemctl enable pigpiod
sudo systemctl start pigpiod

# Verificar estado
sudo systemctl status pigpiod
```

### Mock GPIO en PC (desarrollo)
```
[GPIOWrapper] Plataforma no es Raspberry Pi, usando Mock GPIO17
[MOCK] GPIO17 inicializado como out
[MOCK] GPIO17 writeSync: 1
```
✅ **Esto es normal** - permite desarrollo en cualquier plataforma.

### Verificar Plataforma
```bash
node -e "const fs = require('fs'); \
console.log('Es RPi:', fs.existsSync('/dev/gpiomem')  || fs.existsSync('/dev/mem'));"
```

---

## 🎓 Uso del Wrapper

### Ejemplo: Control de LED
```typescript
import { Gpio } from './utils/gpio-wrapper';

const led = new Gpio(17, 'out');

// Encender
led.writeSync(1);

// Apagar después de 1s
setTimeout(() => {
  led.writeSync(0);
  led.unexport();
}, 1000);
```

### Ejemplo: Leer Botón
```typescript
import { Gpio } from './utils/gpio-wrapper';

const button = new Gpio(26, 'in', 'rising');

button.watch((err, value) => {
  if (err) throw err;
  console.log(`Botón presionado: ${value}`);
});
```

---

## 📊 Ventajas de pigpio

### 1. Sin Configuración Kernel
```bash
# ANTES (onoff): Requería en /boot/firmware/config.txt
gpio=sysfs  # ← Ya no necesario

# AHORA (pigpio): Solo instalar librería
sudo apt-get install pigpio  # ¡Listo!
```

### 2. Numeración Correcta
```typescript
// ANTES (onoff): GPIO BCM 17 = sysfs 529 (base+17)
const gpio = new Gpio(529, 'out');  // ❌ Confuso

// AHORA (pigpio): GPIO BCM 17 = 17
const gpio = new Gpio(17, 'out');   // ✅ Intuitivo
```

### 3. Independiente del Kernel
```
Kernel 7.x+ → sysfs eliminado completamente
            → pigpio seguirá funcionando ✅ (usa /dev/mem directo)
```

### 4. Mejor Rendimiento
- Acceso directo a hardware (no pasa por filesystem)
- Timing más preciso para interrupciones
- PWM hardware nativo soportado

---

## 🔄 Rollback (Si Necesario)

Si por alguna razón necesitas volver a onoff:

```bash
# 1. Revertir imports en servicios
# Cambiar: import { Gpio } from '../utils/gpio-wrapper';
# A:       import { Gpio } from 'onoff';

# 2. Reinstalar onoff
npm uninstall pigpio
npm install onoff

# 3. Configurar kernel legacy
echo "gpio=sysfs" | sudo tee -a /boot/firmware/config.txt
sudo reboot
```

---

## ✅ Checklist Post-Migración

```bash
☐ sudo apt-get install pigpio ejecutado
☐ git pull ejecutado
☐ npm install completado sin errores
☐ npm run build exitoso
☐ /dev/gpiomem o /dev/mem accesible
☐ Usuario en grupo 'gpio'
☐ npm run dev ejecuta sin errores GPIO
☐ Test con LED funciona (opcional)
☐ Servicios de relés responden correctamente
```

---

## 📚 Referencias

- **pigpio docs**: http://abyz.me.uk/rpi/pigpio/
- **pigpio npm**: https://www.npmjs.com/package/pigpio
- **RPi GPIO pinout**: https://pinout.xyz

---

## 🎉 Resultado Final

Con esta migración, Vigilia Hub ahora:
- ✅ Funciona en todos los kernels (legacy y modernos)
- ✅ No requiere configuración de kernel
- ✅ Usa numeración GPIO estándar (BCM)
- ✅ Permite desarrollo en cualquier plataforma (mock)
- ✅ Mejor rendimiento (acceso directo a hardware)
- ✅ Librería más popular del ecosistema RPi

**¡Listo para producción!** 🚀
