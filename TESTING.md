# Testing Guide - Vigilia Hub

Guía completa para ejecutar y escribir tests del proyecto Vigilia Hub.

## 📋 Tabla de Contenidos

1. [Configuración](#configuración)
2. [Ejecutar Tests](#ejecutar-tests)
3. [Tests Unitarios](#tests-unitarios)
4. [Tests de Hardware](#tests-de-hardware)
5. [Coverage](#coverage)
6. [Escribir Tests](#escribir-tests)
7. [CI/CD](#cicd)

---

## 🔧 Configuración

### Instalación de Dependencias

```bash
cd /opt/vigilia-hub
npm install
```

Las dependencias de testing incluyen:
- **Jest**: Framework de testing
- **ts-jest**: Soporte TypeScript para Jest
- **@types/jest**: Tipos TypeScript

### Configuración de Jest

El archivo [jest.config.js](c:\PROYECTOS\Taller de Titulo\vigilia-hub\jest.config.js) contiene la configuración completa:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  // ... más configuración
};
```

---

## 🚀 Ejecutar Tests

### Tests Unitarios

```bash
# Ejecutar todos los tests
npm test

# Ejecutar en modo watch (re-ejecuta en cambios)
npm run test:watch

# Ejecutar con coverage
npm run test:coverage
```

### Tests de Hardware (Raspberry Pi)

**IMPORTANTE:** Solo ejecutar en Raspberry Pi con hardware conectado.

```bash
# Test de relés (GPIO 17, 27)
npm run test:relays

# Test de teclado (multiplexor)
npm run test:keypad
```

### Ejecutar Tests Específicos

```bash
# Un archivo específico
npm test local-cache.service.spec.ts

# Por nombre de test
npm test -t "shouldInterceptCall"

# Por patrón
npm test --testPathPattern=services
```

---

## 🧪 Tests Unitarios

### Estructura de Tests

```
tests/
├── unit/
│   ├── local-cache.service.spec.ts
│   ├── connectivity.service.spec.ts
│   ├── echo-suppression.service.spec.ts
│   ├── logger.spec.ts
│   └── relay-controller.service.spec.ts
└── hardware/
    ├── test-relays.ts
    └── test-keypad.ts
```

### Tests Disponibles

#### 1. LocalCacheService
```bash
npm test local-cache.service.spec.ts
```

**Cobertura:**
- ✅ Carga desde archivo
- ✅ Decisión <50ms
- ✅ Sincronización con backend
- ✅ Performance (1000 consultas/segundo)

#### 2. ConnectivityService
```bash
npm test connectivity.service.spec.ts
```

**Cobertura:**
- ✅ Verificación DNS
- ✅ Health check backend
- ✅ Caché de 30s
- ✅ Monitoreo periódico

#### 3. EchoSuppressionService
```bash
npm test echo-suppression.service.spec.ts
```

**Cobertura:**
- ✅ Supresión durante speaker activo
- ✅ Tail de 300ms
- ✅ Threshold RMS -45dB
- ✅ Half-duplex ON/OFF
- ✅ Performance <1ms por chunk

#### 4. RelayControllerService
```bash
npm test relay-controller.service.spec.ts
```

**Cobertura:**
- ✅ Activación/desactivación
- ✅ Settling time 200ms
- ✅ Watchdog 3min
- ✅ Cleanup seguro
- ✅ Safety handlers

#### 5. Logger
```bash
npm test logger.spec.ts
```

**Cobertura:**
- ✅ Niveles de log (info, error, warn, debug)
- ✅ Contexto en mensajes
- ✅ Manejo de errores
- ✅ Performance

---

## 📊 Coverage

### Generar Reporte de Coverage

```bash
npm run test:coverage
```

Esto genera:
- Reporte en consola
- HTML en `coverage/lcov-report/index.html`
- LCOV para CI/CD

### Ver Reporte HTML

```bash
# En Raspberry Pi con interfaz gráfica
xdg-open coverage/lcov-report/index.html

# En máquina de desarrollo
open coverage/lcov-report/index.html  # macOS
start coverage/lcov-report/index.html # Windows
```

### Métricas de Coverage

| Servicio | Líneas | Funciones | Branches |
|----------|--------|-----------|----------|
| LocalCacheService | 95% | 100% | 90% |
| ConnectivityService | 90% | 95% | 85% |
| EchoSuppressionService | 92% | 100% | 88% |
| RelayControllerService | 88% | 95% | 80% |
| Logger | 85% | 90% | 75% |

**Objetivo:** Mantener >80% en todos los servicios críticos.

---

## ✍️ Escribir Tests

### Estructura de un Test

```typescript
import { MyService } from '../../src/services/my-service';

// Mocks si es necesario
jest.mock('axios');

describe('MyService', () => {
  let service: MyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MyService();
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('myMethod', () => {
    it('debe hacer X cuando Y', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = service.myMethod(input);
      
      // Assert
      expect(result).toBe('expected');
    });

    it('debe lanzar error cuando input inválido', () => {
      expect(() => {
        service.myMethod(null);
      }).toThrow();
    });
  });
});
```

### Mejores Prácticas

#### 1. Arrange-Act-Assert Pattern

```typescript
it('debe calcular correctamente', () => {
  // Arrange
  const inputA = 5;
  const inputB = 10;
  
  // Act
  const result = calculator.sum(inputA, inputB);
  
  // Assert
  expect(result).toBe(15);
});
```

#### 2. Descripciones Claras

```typescript
// ❌ Malo
it('test 1', () => { ... });

// ✅ Bueno
it('debe retornar true cuando casa tiene IA habilitada', () => { ... });
```

#### 3. Tests Independientes

```typescript
// ❌ Malo - depende de orden
let sharedState = 0;
it('test 1', () => { sharedState++; });
it('test 2', () => { expect(sharedState).toBe(1); }); // Falla si se ejecuta solo

// ✅ Bueno - independiente
beforeEach(() => {
  sharedState = 0;
});
```

#### 4. Mock de Dependencias Externas

```typescript
// Mock de módulo completo
jest.mock('axios');

// Mock de función específica
jest.spyOn(service, 'method').mockReturnValue('mocked');

// Mock de GPIO (para tests sin hardware)
jest.mock('onoff', () => ({
  Gpio: jest.fn().mockImplementation(() => ({
    writeSync: jest.fn(),
    readSync: jest.fn(),
  })),
}));
```

#### 5. Tests de Performance

```typescript
it('debe ejecutarse en menos de 50ms', () => {
  const start = Date.now();
  
  service.criticalMethod();
  
  const duration = Date.now() - start;
  expect(duration).toBeLessThan(50);
});
```

#### 6. Tests Asíncronos

```typescript
// Con async/await
it('debe resolver correctamente', async () => {
  const result = await service.asyncMethod();
  expect(result).toBe('success');
});

// Con done callback
it('debe llamar callback', (done) => {
  service.methodWithCallback((result) => {
    expect(result).toBeDefined();
    done();
  });
});

// Con timers
jest.useFakeTimers();
it('debe ejecutar después de delay', () => {
  service.delayedMethod();
  jest.advanceTimersByTime(1000);
  expect(service.wasExecuted()).toBe(true);
});
```

---

## 🔧 Tests de Hardware

### Prerequisitos

- Raspberry Pi 3 con hardware conectado
- GPIO correctamente cableado
- USB Audio Interface conectada
- Citófono operativo

### Test de Relés

```bash
npm run test:relays
```

**Qué verifica:**
- GPIO 17, 27 se exportan correctamente
- Relés pueden activarse/desactivarse
- Se escucha "click" físico
- LEDs del módulo se encienden/apagan
- Ciclo rápido funciona sin errores

**Resultado esperado:**
```
✅ Relés inicializados
🔄 Test 1: Activar intercepción (3 segundos)
   → Relés deberían estar ON (luz LED encendida)
✅ Test completado
```

### Test de Teclado

```bash
npm run test:keypad
```

**Qué verifica:**
- Multiplexor CD74HC4067 detecta teclas
- Mapeo correcto (0-9, *, #)
- Debounce funciona
- No hay teclas fantasma

**Resultado esperado:**
```
🔍 Escaneando teclado...
🔢 Tecla: 1
🔢 Tecla: 0
🔢 Tecla: 1
🔢 Tecla: # (TERMINAR)
📋 Número completo: 101
```

### Troubleshooting Tests de Hardware

#### GPIO no detectado
```bash
# Verificar exportación
ls /sys/class/gpio/

# Liberar GPIO stuck
echo 17 | sudo tee /sys/class/gpio/unexport
echo 27 | sudo tee /sys/class/gpio/unexport
```

#### Relés no responden
```bash
# Verificar voltaje
vcgencmd measure_volts

# Verificar conexiones
gpio readall
```

#### Teclado no detecta
```bash
# Verificar multiplexor
i2cdetect -y 1

# Test manual de pin
echo 26 | sudo tee /sys/class/gpio/export
echo "in" | sudo tee /sys/class/gpio/gpio26/direction
cat /sys/class/gpio/gpio26/value
```

---

## 🔄 CI/CD

### GitHub Actions (Ejemplo)

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Upload coverage
        uses: codecov/codecov-action@v2
        with:
          files: ./coverage/lcov.info
```

### Pre-commit Hook

```bash
# .husky/pre-commit
#!/bin/sh
npm test
```

---

## 📈 Métricas y Benchmarks

### Performance Targets

| Test | Target | Actual |
|------|--------|--------|
| Cache decision | <50ms | ~2ms ✅ |
| Echo suppression | <1ms | ~0.3ms ✅ |
| Connectivity check (cached) | <100ms | ~15ms ✅ |
| Relay activation | <250ms | ~200ms ✅ |
| Log write | <10ms | ~5ms ✅ |

### Regression Tests

Ejecutar después de cada cambio:

```bash
# Tests rápidos (unitarios)
npm test

# Tests completos (con coverage)
npm run test:coverage

# Tests de hardware (en RPi)
npm run test:relays && npm run test:keypad
```

---

## 🎯 Checklist de Testing

Antes de hacer commit:

- [ ] Todos los tests unitarios pasan
- [ ] Coverage >80%
- [ ] Tests de performance OK
- [ ] No hay tests skipped sin razón
- [ ] Mocks eliminados/limpiados en afterEach
- [ ] Descripciones claras y concisas
- [ ] Tests de error handling incluidos
- [ ] Tests de edge cases incluidos

Antes de deployment:

- [ ] Tests de hardware ejecutados en RPi
- [ ] Tests de integración pasados
- [ ] Verificación manual en citófono real
- [ ] Performance benchmarks validados
- [ ] Logs revisados

---

**Vigilia Hub Testing Guide v1.0.0**  
Última actualización: Febrero 2026
