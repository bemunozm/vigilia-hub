# Documentación de Hardware - Vigilia Hub

> **Simulación completa de sistema de intercepción de citófono**  
> **Hardware**: Raspberry Pi 3 Model B + Componentes electrónicos  
> **Fecha**: 13 de Febrero de 2026

---

## 📚 Índice de Documentación

### 🚀 EMPIEZA AQUÍ: [LABORATORY_SETUP.md](./LABORATORY_SETUP.md)
**Setup inicial para desarrollo SIN hardware completo**

> **👉 LEE ESTO PRIMERO si solo tienes RPi + protoboard + cables**

Incluye:
- Alimentación con micro-USB (NO requiere LM2596S en laboratorio)
- Setup de software completo (Node.js, GPIO, dependencias)
- Tests con LEDs simples (simular relés)
- Desarrollo sin hardware adicional (~60% del proyecto)
- Plan de incorporación gradual de componentes
- Qué puedes hacer HOY vs qué necesitas esperar

---

### 1. [CIRCUIT_DIAGRAM.md](./CIRCUIT_DIAGRAM.md)
**Diagramas de circuito detallados (PARA HARDWARE COMPLETO)**

Incluye:
- Esquemático general del sistema
- Diagrama de alimentación (LM2596S Buck Converter - **SOLO para instalación en citófono**)
- Conexiones de módulos de relés (intercepción de audio)
- Multiplexor CD74HC4067 + Teclado 4×4
- Sistema de audio (KY-037, USB Sound Card, Altavoz)
- Layout de protoboard
- Esquema de tierras (common ground)
- Consumo eléctrico y protecciones

### 2. [PIN_MAPPING.md](./PIN_MAPPING.md)
**Mapeo completo de GPIO**

Incluye:
- Tabla completa de 40 pines de Raspberry Pi 3
- Asignación por función (power, relés, MUX, audio)
- Configuración de código para cada GPIO
- Tabla de selección de canales del multiplexor
- Matriz de conexión del teclado 4×4
- Scripts de test individuales
- Troubleshooting de GPIO

### 3. [HARDWARE_INSTALLATION.md](./HARDWARE_INSTALLATION.md)
**Guía paso a paso de instalación**

Incluye:
- Lista de materiales completa (checklist)
- Advertencias de seguridad críticas
- 8 fases de montaje detalladas:
  1. Preparación y verificación
  2. Circuito de alimentación
  3. Módulos de relés
  4. Multiplexor y teclado
  5. Sistema de audio
  6. Conexión a Raspberry Pi
  7. Primera energización y tests
  8. Instalación del software
- Troubleshooting común
- Checklist final de validación

---

## 🛒 Lista de Materiales

### Hardware Principal
- **Raspberry Pi 3 Model B** (1GB RAM) - Ya en posesión ✅
- **Protoboard** 830 puntos - Ya en posesión ✅
- **Cables Dupont** macho-hembra - Ya en posesión ✅

### Componentes Adquiridos
- **LM2596S Buck Converter** (regulador 12V→5V) - ✅ Adquirido
- **Relés 5V 2 canales optoacoplados** (×2) - ✅ Adquirido
- **CD74HC4067 Multiplexor** 16 canales - ✅ Adquirido
- **Teclado 4×4** membrana - ✅ Adquirido
- **KY-037** sensor de sonido - ✅ Adquirido
- **Altavoz 8Ω 0.5W** - ✅ Adquirido
- **Kit Componentes Electrónicos M** - ✅ Adquirido

### Recomendado Adicional
- **USB Sound Card** (tarjeta audio USB) - ⚠️ **CRÍTICO para audio real**
  - RPi no tiene ADC nativo
  - KY-037 solo provee detección digital (umbral)
  - USB Audio Device permite captura/reproducción a 48kHz

---

## ⚡ Quick Start

### 1. Verificar Materiales
```bash
✅ Todos los componentes adquiridos
✅ Multímetro digital disponible
✅ Destornillador para ajustar LM2596S
✅ Raspberry Pi con OS instalado
```

### 2. Ajustar Buck Converter (CRÍTICO)
```
⚠️ HACER ANTES DE CONECTAR RASPBERRY PI
1. Conectar 12V a LM2596S IN+/IN-
2. Medir OUT+/OUT- con multímetro
3. Ajustar potenciómetro hasta 5.00V exactos
4. Desconectar fuente
```

### 3. Montar Circuito
Seguir guía completa en [HARDWARE_INSTALLATION.md](./HARDWARE_INSTALLATION.md)

Fases:
1. ✅ Preparación (30 min)
2. ✅ Alimentación (15 min)
3. ✅ Relés (20 min)
4. ✅ Multiplexor + Teclado (45 min)
5. ✅ Audio (15 min)
6. ✅ Conexión RPi (30 min)
7. ✅ Tests (30 min)
8. ✅ Software (20 min)

**Tiempo total estimado**: 3-4 horas

### 4. Validar Instalación
```bash
# Test rápido de GPIO
ssh pi@raspberrypi.local
gpio readall

# Activar relé
gpio -g write 17 1
# LED del relé debe encender ✅

# Leer sensor audio
gpio -g read 21
# Hacer ruido, debe cambiar a 1 ✅
```

---

## 🔌 Arquitectura del Sistema

```
┌──────────────────────────────────────────────────────────┐
│                  VIGILIA-HUB HARDWARE                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  12V DC (Citófono) ──► LM2596S ──► 5V DC               │
│                                      │                   │
│                                      ▼                   │
│                        ┌─────────────────────┐          │
│                        │  Raspberry Pi 3 B   │          │
│                        └┬──────────┬─────────┘          │
│                         │          │                     │
│              ┌──────────┴───┐   ┌─┴──────────┐         │
│              │ GPIO Control │   │ USB Audio  │         │
│              └┬───────┬─────┘   └────────────┘         │
│               │       │                                  │
│         ┌─────┴─┐  ┌─┴──────┐                          │
│         │ Relés │  │  MUX   │                          │
│         │ 2×2ch │  │ 4067   │                          │
│         └───┬───┘  └──┬─────┘                          │
│             │         │                                  │
│             ▼         ▼                                  │
│      Audio Lines   Teclado 4×4                          │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Flujo de Datos

**Modo Normal (Relés OFF)**:
```
Citófono ──[Relé NO]──► Casa
Casa     ──[Relé NO]──► Citófono
         (Audio directo)
```

**Modo IA (Relés ON)**:
```
Citófono ──[Relé NC]──► RPi Audio IN ──► OpenAI API
RPi Audio OUT ──[Relé NC]──► Casa     ◄── OpenAI API
         (Audio procesado por IA)
```

---

## 🎯 Funcionalidades Implementadas

### 1. Intercepción de Audio
- ✅ 2 relés para control bidireccional
- ✅ Modo transparente (bypass) por defecto
- ✅ Conmutación a IA bajo demanda
- ✅ Watchdog de seguridad (180s máx)
- ✅ Settling time anti-pop (200ms)

### 2. Detección de Timbre
- ✅ Sensor KY-037 con ajuste de sensibilidad
- ✅ Salida digital para GPIO21
- ⚠️ Salida análoga requiere ADC externo o USB Sound

### 3. Interfaz de Teclado
- ✅ Matriz 4×4 (16 teclas)
- ✅ Multiplexor CD74HC4067 (economiza GPIO)
- ✅ 16 canales mapeados a teclas individuales
- ✅ Lectura por escaneo de canales

### 4. Sistema de Audio
- ✅ Reproducción via USB Sound Card
- ✅ Captura a 48kHz, resample a 24kHz (OpenAI)
- ✅ Altavoz 8Ω para salida
- ⚠️ Micrófono externo recomendado (jack 3.5mm)

---

## ⚠️ Advertencias Críticas

### 🔥 PUEDE DAÑAR HARDWARE

1. **LM2596S mal ajustado** (>5.2V) → **RPi destruida**
2. **5V en GPIO pins** → **GPIO quemados**
3. **CD74HC4067 con 5V** → **GPIO26 destruido**
4. **Cortocircuito VCC-GND** → **Componentes quemados**
5. **Polaridad invertida** → **Componentes destruidos**

### ✅ Buenas Prácticas

- ✅ Medir voltajes **ANTES** de conectar RPi
- ✅ Usar **multímetro** para todas las verificaciones
- ✅ **Desconectar fuente** al realizar cambios
- ✅ **Fotografiar** cada etapa del montaje
- ✅ **Etiquetar** todos los cables
- ✅ **Verificar continuidad** de GND
- ✅ **Probar componentes** individualmente primero

---

## 🧪 Tests de Validación

### Hardware
```bash
# 1. Voltajes
Medir 5.00V en rail 5V ✅
Medir 3.30V en rail 3.3V ✅
Medir 0V en todos los GND ✅

# 2. Relés
gpio -g write 17 1  # LED ON + Click ✅
gpio -g write 17 0  # LED OFF ✅

# 3. MUX + Teclado
Seleccionar canal 0-15 ✅
Presionar tecla → GPIO26 cambia ✅

# 4. Audio
speaker-test -D plughw:1,0 ✅
arecord -D plughw:1,0 test.wav ✅
```

### Software
```bash
# 1. Compilar
npm install ✅
npm run build ✅

# 2. Ejecutar
npm run dev
# Ver logs de servicios iniciando ✅

# 3. Test funcional
Activar relés → Audio interceptado ✅
Detectar timbre → Logs muestran evento ✅
Presionar teclas → Logs muestran tecla ✅
```

---

## 🔧 Troubleshooting Rápido

| Síntoma | Causa Probable | Solución |
|---------|----------------|----------|
| RPi no enciende | LM2596S mal ajustado | Medir voltaje, ajustar a 5.0V |
| Relés no conmutan | VCC sin 5V | Verificar conexión rail 5V |
| LED relé no enciende | GPIO no conectado | Verificar cable IN1/IN2 |
| Teclado no responde | MUX con 5V en vez de 3.3V | ⚠️ Cambiar a 3.3V inmediatamente |
| Audio no funciona | USB Sound no detectada | `aplay -l` verificar device |
| GPIO permission error | Usuario no en grupo gpio | `sudo usermod -a -G gpio pi` |

---

## 📊 Especificaciones Técnicas

### Consumo Eléctrico
| Componente | Corriente | Voltaje |
|------------|-----------|---------|
| Raspberry Pi 3 | ~700mA | 5V |
| USB Sound Card | ~100mA | 5V |
| Relés (activos) | ~150mA | 5V |
| CD74HC4067 | ~1mA | 3.3V |
| KY-037 | ~5mA | 3.3V |
| **TOTAL** | **~1A** | - |

**Margen de seguridad**: LM2596S @ 3A es suficiente ✅

### GPIO Utilizados
- **Outputs**: GPIO5, 6, 13, 17, 19, 27 (6 pines)
- **Inputs**: GPIO21, 26 (2 pines)
- **Power**: 5V (×2), 3.3V (×2), GND (×5)
- **Libres**: ~25 GPIO disponibles para expansión

---

## 📝 Notas de Desarrollo

### Limitaciones Actuales
- [ ] Audio análogo del KY-037 no se usa (falta ADC)
- [ ] Segundo módulo de relés sin función asignada
- [ ] Teclado detecta pero no procesa comandos aún
- [ ] No hay interfaz visual (display/LEDs)

### Mejoras Futuras
- [ ] Agregar ADC MCP3008 para audio análogo
- [ ] Display LCD I2C para status
- [ ] LEDs RGB para indicadores visuales
- [ ] Botón físico de emergency-stop
- [ ] Sensor de puerta (reed switch)
- [ ] Control de apertura de puerta (relé 2)

### Expansiones Posibles
- [ ] Cámara Pi v2 para visión
- [ ] GPS module para ubicación
- [ ] Sensor de temperatura/humedad
- [ ] Batería de respaldo (UPS)
- [ ] Conexión 4G/LTE (dongle USB)

---

## 🔗 Referencias Técnicas

### Datasheets
- [CD74HC4067 Multiplexor](https://www.ti.com/lit/ds/symlink/cd74hc4067.pdf)
- [LM2596 Buck Converter](https://www.ti.com/lit/ds/symlink/lm2596.pdf)
- [Raspberry Pi 3 Schematic](https://datasheets.raspberrypi.com/rpi3/raspberry-pi-3-b-reduced-schematics.pdf)

### Documentación Software
- [onoff GPIO Library](https://github.com/fivdi/onoff)
- [ALSA Audio](https://www.alsa-project.org/wiki/Main_Page)
- [WiringPi GPIO Tool](http://wiringpi.com/)

### Recursos Comunitarios
- [Raspberry Pi Forums](https://forums.raspberrypi.com/)
- [Stack Overflow - Raspberry Pi](https://stackoverflow.com/questions/tagged/raspberry-pi)
- [Electronics Stack Exchange](https://electronics.stackexchange.com/)

---

## ✅ Estado del Proyecto

**Documentación**: ✅ Completa  
**Componentes**: ✅ Todos adquiridos  
**Instalación**: ⏳ Pendiente (listo para comenzar)  
**Tests**: ⏳ Pendiente  
**Producción**: ⏳ Pendiente

---

## 📞 Soporte

**¿Problemas durante la instalación?**

1. Revisar sección **Troubleshooting** en cada documento
2. Verificar **Checklist de Verificación** antes de energizar
3. Tomar **fotos del montaje** para diagnóstico
4. Consultar **logs del sistema** (`npm run dev`)

**Recursos adicionales:**
- Documentación oficial: [README.md](../../README.md)
- Issues: Crear ticket en GitHub
- Diagramas: Todos los archivos en esta carpeta

---

**Última actualización**: 13 de Febrero de 2026  
**Autor**: Vigilia Team  
**Licencia**: MIT

¡Éxito con tu instalación! 🚀
