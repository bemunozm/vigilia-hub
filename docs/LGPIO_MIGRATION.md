# Migración a lgpio - GPIO Moderno para Raspberry Pi

> **Fecha**: 13 de Febrero de 2026  
> **Cambio**: Migración de `onoff` a `lgpio` para compatibilidad con kernels modernos

---

## 🎯 Problema Resuelto

### Antes (onoff)
- Usaba sistema GPIO **sysfs** (deprecated)
- No funcionaba en kernels 6.x+ sin configuración adicional
- Requería offset manual para base 512
- Error: `EINVAL: invalid argument, write`

### Ahora (lgpio)
- Usa sistema GPIO **moderno** (character device `/dev/gpiochip0`)
- Compatible con kernels 5.x, 6.x+
- **NO requiere offsets** - maneja automáticamente
- Funciona "out of the box" en Raspberry Pi OS Bookworm/Trixie

---

## 📦 Cambios Implementados

### 1. Nuevo Wrapper de GPIO
**Archivo**: `src/utils/gpio-wrapper.ts`

**Características**:
- ✅ API compatible con `onoff` (sin breaking changes)
- ✅ Usa `lgpio` en Raspberry Pi real
- ✅ Mock automático si no es RPi (desarrollo en PC/Mac)
- ✅ Detección automática de plataforma
- ✅ Logs detallados para debugging

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
  "lgpio": "^1.4.1"  // ← Nueva dependencia
},
"optionalDependencies": {
  "onoff": "^6.0.3"  // ← Opcional (backward compatibility)
}
```

---

## 🚀 Instalación en Raspberry Pi

### Paso 1: Actualizar Código
```bash
cd ~/vigilia-hub
git pull
```

### Paso 2: Instalar lgpio
```bash
# Desinstalar onoff (opcional)
npm uninstall onoff

# Instalar lgpio
npm install lgpio

# O simplemente
npm install
```

### Paso 3: Recompilar
```bash
npm run build
```

### Paso 4: Probar
```bash
npm run dev
```

**Output esperado**:
```
[GPIOWrapper] GPIO17 inicializado como out (lgpio)
[GPIOWrapper] GPIO27 inicializado como out (lgpio)
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

## 📋 Comparación: onoff vs lgpio

| Característica | onoff (viejo) | lgpio (nuevo) |
|----------------|---------------|---------------|
| **Sistema** | sysfs (/sys/class/gpio) | chardev (/dev/gpiochip) |
| **Kernel 6.x+** | ❌ Deprecated | ✅ Nativo |
| **Offset manual** | ⚠️ Requerido (base 512) | ✅ Automático |
| **Performance** | Normal | ⚡ Más rápido |
| **Futuro** | 🔻 Eliminado en kernel 7.x | ✅ Estándar |
| **Setup** | ⚠️ Requiere config | ✅ Plug & play |

---

## 🔍 Troubleshooting

### Error: "Cannot find module 'lgpio'"
```bash
npm install lgpio --save
```

### Error: "gpiochip_open failed"
```bash
# Verificar que existe
ls -la /dev/gpiochip*

# Verificar permisos
groups  # Debe incluir 'gpio'

# Si falta, agregar usuario
sudo usermod -a -G gpio $USER
sudo reboot
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
console.log('Es RPi:', fs.existsSync('/dev/gpiochip0'));"
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

## 📊 Ventajas de lgpio

### 1. Sin Configuración Adicional
```bash
# ANTES (onoff): Requería en /boot/firmware/config.txt
gpio=sysfs  # ← Ya no necesario

# AHORA (lgpio): Funciona directamente
# ¡Nada que configurar!
```

### 2. Numeración Correcta
```typescript
// ANTES (onoff): GPIO BCM 17 = sysfs 529 (base+17)
const gpio = new Gpio(529, 'out');  // ❌ Confuso

// AHORA (lgpio): GPIO BCM 17 = 17
const gpio = new Gpio(17, 'out');   // ✅ Intuitivo
```

### 3. Compatibilidad Futura
```
Kernel 7.x+ → sysfs eliminado completamente
            → lgpio seguirá funcionando ✅
```

---

## 🔄 Rollback (Si Necesario)

Si por alguna razón necesitas volver a onoff:

```bash
# 1. Revertir imports en servicios
# Cambiar: import { Gpio } from '../utils/gpio-wrapper';
# A:       import { Gpio } from 'onoff';

# 2. Reinstalar onoff
npm install onoff

# 3. Configurar kernel legacy
echo "gpio=sysfs" | sudo tee -a /boot/firmware/config.txt
sudo reboot
```

---

## ✅ Checklist Post-Migración

```bash
☐ git pull ejecutado
☐ npm install completado sin errores
☐ npm run build exitoso
☐ /dev/gpiochip0 existe y accesible
☐ Usuario en grupo 'gpio'
☐ npm run dev ejecuta sin errores GPIO
☐ Test con LED funciona (opcional)
☐ Servicios de relés responden correctamente
```

---

## 📚 Referencias

- **lgpio docs**: https://github.com/joan2937/lg
- **RPi GPIO pinout**: https://pinout.xyz
- **Linux GPIO chardev**: https://www.kernel.org/doc/html/latest/driver-api/gpio/

---

## 🎉 Resultado Final

Con esta migración, Vigilia Hub ahora:
- ✅ Funciona en kernels modernos (6.x+)
- ✅ No requiere configuración adicional
- ✅ Usa numeración GPIO estándar (BCM)
- ✅ Permite desarrollo en cualquier plataforma (mock)
- ✅ Está preparado para el futuro (kernel 7.x+)

**¡Listo para producción!** 🚀
