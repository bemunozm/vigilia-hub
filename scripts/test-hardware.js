#!/usr/bin/env node

/**
 * VIGILIA-HUB GPIO HARDWARE TEST SUITE
 * 
 * Script de validación automática de todos los componentes de hardware.
 * Ejecutar DESPUÉS de completar el montaje físico del circuito.
 * 
 * Uso:
 *   sudo node scripts/test-hardware.js
 * 
 * ⚠️ ADVERTENCIA: Este script controla GPIO reales.
 *    Solo ejecutar con hardware correctamente instalado.
 */

const Gpio = require('onoff').Gpio;
const readline = require('readline');

// Colores para output terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// Configuración de pines (debe coincidir con .env)
const config = {
  relays: {
    pin1: 17, // RELAY_PIN_1 - Audio OUT
    pin2: 27, // RELAY_PIN_2 - Audio IN
  },
  multiplexor: {
    s0: 5,
    s1: 6,
    s2: 13,
    s3: 19,
    sig: 26,
  },
  audio: {
    detect: 21, // KY-037 digital output
  },
};

// Estado del test
const testResults = {
  passed: 0,
  failed: 0,
  skipped: 0,
  tests: [],
};

// Helper: Prompt usuario
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// Helper: Delay
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper: Logs coloridos
function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, status, details = '') {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
  const color = status === 'pass' ? 'green' : status === 'fail' ? 'red' : 'yellow';
  
  log(`${icon} ${name}`, color);
  if (details) log(`   ${details}`, 'cyan');
  
  testResults.tests.push({ name, status, details });
  if (status === 'pass') testResults.passed++;
  else if (status === 'fail') testResults.failed++;
  else testResults.skipped++;
}

// Helper: Banner
function printBanner() {
  console.clear();
  log('═══════════════════════════════════════════════════════', 'cyan');
  log('     VIGILIA-HUB HARDWARE TEST SUITE v1.0.0           ', 'bright');
  log('═══════════════════════════════════════════════════════', 'cyan');
  log('');
}

// Helper: Resumen final
function printSummary() {
  log('');
  log('═══════════════════════════════════════════════════════', 'cyan');
  log(`     TEST SUMMARY: ${testResults.passed} passed, ${testResults.failed} failed, ${testResults.skipped} skipped`, 'bright');
  log('═══════════════════════════════════════════════════════', 'cyan');
  
  if (testResults.failed === 0) {
    log('');
    log('🎉 ¡TODOS LOS TESTS PASARON! Hardware correctamente instalado.', 'green');
    log('');
    log('Próximos pasos:', 'cyan');
    log('  1. Configurar .env con variables de entorno', 'reset');
    log('  2. Ejecutar: npm run build', 'reset');
    log('  3. Ejecutar: npm run dev', 'reset');
    log('  4. Verificar logs de servicios', 'reset');
  } else {
    log('');
    log('⚠️  ALGUNOS TESTS FALLARON. Revisar hardware.', 'red');
    log('');
    log('Troubleshooting:', 'cyan');
    log('  - Verificar conexiones de cables Dupont', 'reset');
    log('  - Revisar continuidad con multímetro', 'reset');
    log('  - Consultar docs/hardware/HARDWARE_INSTALLATION.md', 'reset');
  }
  log('');
}

// ============================================================
// TEST 1: Verificar permisos GPIO
// ============================================================
async function testGPIOPermissions() {
  log('\n[TEST 1] Verificando permisos GPIO...', 'yellow');
  
  try {
    // Intentar acceder a GPIO sin permisos especiales
    const testPin = new Gpio(4, 'out');
    testPin.writeSync(0);
    testPin.unexport();
    
    logTest('Permisos GPIO', 'pass', 'Usuario tiene acceso a /sys/class/gpio');
    return true;
  } catch (error) {
    logTest('Permisos GPIO', 'fail', `Error: ${error.message}`);
    log('   Solución: sudo usermod -a -G gpio $USER && sudo reboot', 'yellow');
    return false;
  }
}

// ============================================================
// TEST 2: Verificar módulos de relés
// ============================================================
async function testRelays() {
  log('\n[TEST 2] Probando módulos de relés...', 'yellow');
  
  let relay1, relay2;
  
  try {
    // Inicializar relés
    relay1 = new Gpio(config.relays.pin1, 'out');
    relay2 = new Gpio(config.relays.pin2, 'out');
    
    // Estado inicial LOW
    relay1.writeSync(0);
    relay2.writeSync(0);
    await delay(500);
    
    logTest('Inicialización de relés', 'pass', `GPIO${config.relays.pin1} y GPIO${config.relays.pin2}`);
    
    // Test Relay 1
    log('   Activando Relé 1 (GPIO17)...', 'cyan');
    relay1.writeSync(1);
    await delay(500);
    
    const answer1 = await question('   ¿Escuchaste el CLICK y viste el LED del Relé 1? (s/n): ');
    if (answer1.toLowerCase() === 's') {
      logTest('Relé 1 - Activación', 'pass', 'Click audible + LED encendido');
    } else {
      logTest('Relé 1 - Activación', 'fail', 'No se detectó conmutación');
    }
    
    // Desactivar Relay 1
    relay1.writeSync(0);
    await delay(500);
    
    const answer2 = await question('   ¿El LED del Relé 1 se APAGÓ? (s/n): ');
    if (answer2.toLowerCase() === 's') {
      logTest('Relé 1 - Desactivación', 'pass', 'LED apagado correctamente');
    } else {
      logTest('Relé 1 - Desactivación', 'fail', 'LED no se apagó');
    }
    
    // Test Relay 2
    log('   Activando Relé 2 (GPIO27)...', 'cyan');
    relay2.writeSync(1);
    await delay(500);
    
    const answer3 = await question('   ¿Escuchaste el CLICK y viste el LED del Relé 2? (s/n): ');
    if (answer3.toLowerCase() === 's') {
      logTest('Relé 2 - Activación', 'pass', 'Click audible + LED encendido');
    } else {
      logTest('Relé 2 - Activación', 'fail', 'No se detectó conmutación');
    }
    
    // Desactivar Relay 2
    relay2.writeSync(0);
    await delay(500);
    
    // Test conmutación simultánea
    log('   Activando AMBOS relés simultáneamente...', 'cyan');
    relay1.writeSync(1);
    relay2.writeSync(1);
    await delay(500);
    
    const answer4 = await question('   ¿Ambos LEDs están ENCENDIDOS? (s/n): ');
    if (answer4.toLowerCase() === 's') {
      logTest('Relés - Activación simultánea', 'pass', 'Ambos relés activos');
    } else {
      logTest('Relés - Activación simultánea', 'fail', 'No activaron correctamente');
    }
    
    // Desactivar todo
    relay1.writeSync(0);
    relay2.writeSync(0);
    
    // Cleanup
    relay1.unexport();
    relay2.unexport();
    
    return true;
  } catch (error) {
    logTest('Módulo de relés', 'fail', `Error: ${error.message}`);
    if (relay1) relay1.unexport();
    if (relay2) relay2.unexport();
    return false;
  }
}

// ============================================================
// TEST 3: Verificar multiplexor CD74HC4067
// ============================================================
async function testMultiplexor() {
  log('\n[TEST 3] Probando multiplexor CD74HC4067...', 'yellow');
  
  let s0, s1, s2, s3, sig;
  
  try {
    // Inicializar pines de control
    s0 = new Gpio(config.multiplexor.s0, 'out');
    s1 = new Gpio(config.multiplexor.s1, 'out');
    s2 = new Gpio(config.multiplexor.s2, 'out');
    s3 = new Gpio(config.multiplexor.s3, 'out');
    sig = new Gpio(config.multiplexor.sig, 'in', 'both');
    
    logTest('Inicialización MUX', 'pass', 'Pines S0-S3 y SIG configurados');
    
    // Función para seleccionar canal
    function selectChannel(channel) {
      s0.writeSync((channel & 0x01));
      s1.writeSync(((channel >> 1) & 0x01));
      s2.writeSync(((channel >> 2) & 0x01));
      s3.writeSync(((channel >> 3) & 0x01));
    }
    
    // Test canales específicos
    const testChannels = [0, 5, 10, 15]; // Canales de prueba
    const channelMap = {
      0: 'Tecla 1',
      5: 'Tecla 5',
      10: 'Tecla 9',
      15: 'Tecla D',
    };
    
    for (const channel of testChannels) {
      log(`   Seleccionando canal ${channel} (${channelMap[channel]})...`, 'cyan');
      selectChannel(channel);
      await delay(300);
      
      log(`   PRESIONA la ${channelMap[channel]} en el teclado...`, 'bright');
      
      // Esperar lectura
      let detected = false;
      const timeout = 10000; // 10 segundos
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        const value = sig.readSync();
        if (value === 1) {
          detected = true;
          break;
        }
        await delay(50);
      }
      
      if (detected) {
        logTest(`MUX Canal ${channel}`, 'pass', `${channelMap[channel]} detectada correctamente`);
      } else {
        const skip = await question(`   No se detectó tecla. ¿Saltar este canal? (s/n): `);
        if (skip.toLowerCase() === 's') {
          logTest(`MUX Canal ${channel}`, 'skip', 'Usuario saltó prueba');
        } else {
          logTest(`MUX Canal ${channel}`, 'fail', 'Timeout esperando tecla');
        }
      }
    }
    
    // Cleanup
    s0.unexport();
    s1.unexport();
    s2.unexport();
    s3.unexport();
    sig.unexport();
    
    return true;
  } catch (error) {
    logTest('Multiplexor', 'fail', `Error: ${error.message}`);
    if (s0) s0.unexport();
    if (s1) s1.unexport();
    if (s2) s2.unexport();
    if (s3) s3.unexport();
    if (sig) sig.unexport();
    return false;
  }
}

// ============================================================
// TEST 4: Verificar sensor de audio KY-037
// ============================================================
async function testAudioSensor() {
  log('\n[TEST 4] Probando sensor de audio KY-037...', 'yellow');
  
  let audioPin;
  
  try {
    audioPin = new Gpio(config.audio.detect, 'in', 'both');
    
    logTest('Inicialización KY-037', 'pass', `GPIO${config.audio.detect} configurado como entrada`);
    
    log('   HAZ UN RUIDO FUERTE cerca del sensor (palmada, silbido)...', 'bright');
    log('   Esperando detección (10 segundos)...', 'cyan');
    
    let detected = false;
    const timeout = 10000;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const value = audioPin.readSync();
      if (value === 1) {
        detected = true;
        break;
      }
      await delay(50);
    }
    
    if (detected) {
      logTest('Detección de audio', 'pass', 'Sensor respondió correctamente');
      log('   ¿Viste el LED AZUL del KY-037 encender? Eso confirma detección.', 'cyan');
    } else {
      const answer = await question('   No se detectó sonido automáticamente. ¿Viste el LED azul encender? (s/n): ');
      if (answer.toLowerCase() === 's') {
        logTest('Detección de audio', 'pass', 'LED azul confirmado por usuario');
        log('   Nota: Ajustar potenciómetro del KY-037 para mejor sensibilidad', 'yellow');
      } else {
        logTest('Detección de audio', 'fail', 'Sensor no respondió');
      }
    }
    
    // Cleanup
    audioPin.unexport();
    
    return true;
  } catch (error) {
    logTest('Sensor de audio', 'fail', `Error: ${error.message}`);
    if (audioPin) audioPin.unexport();
    return false;
  }
}

// ============================================================
// TEST 5: Verificar alimentación
// ============================================================
async function testPowerSupply() {
  log('\n[TEST 5] Verificando alimentación...', 'yellow');
  
  log('   Este test requiere medición manual con multímetro.', 'cyan');
  log('');
  log('   Medir los siguientes voltajes:', 'bright');
  log('   1. Rail 5V a GND: debe ser 5.00V ±0.05V', 'reset');
  log('   2. Rail 3.3V a GND: debe ser 3.30V ±0.05V', 'reset');
  log('   3. Pin 2 RPi (5V) a Pin 6 (GND): debe ser 5.00V', 'reset');
  log('   4. Pin 1 RPi (3.3V) a Pin 6 (GND): debe ser 3.30V', 'reset');
  log('');
  
  const answer1 = await question('   ¿Rail 5V mide 5.00V ±0.05V? (s/n): ');
  if (answer1.toLowerCase() === 's') {
    logTest('Voltaje 5V', 'pass', 'Rail 5V dentro de rango');
  } else {
    logTest('Voltaje 5V', 'fail', '⚠️ CRÍTICO: Ajustar LM2596S inmediatamente');
  }
  
  const answer2 = await question('   ¿Rail 3.3V mide 3.30V ±0.05V? (s/n): ');
  if (answer2.toLowerCase() === 's') {
    logTest('Voltaje 3.3V', 'pass', 'Rail 3.3V dentro de rango');
  } else {
    logTest('Voltaje 3.3V', 'fail', 'Verificar conexión desde RPi Pin 1');
  }
  
  return true;
}

// ============================================================
// TEST 6: Verificar continuidad de tierra
// ============================================================
async function testGroundContinuity() {
  log('\n[TEST 6] Verificando continuidad de tierra (GND)...', 'yellow');
  
  log('   Este test requiere multímetro en modo CONTINUIDAD (beep).', 'cyan');
  log('');
  log('   Verificar continuidad entre:', 'bright');
  log('   1. RPi Pin 6 (GND) ⟷ Protoboard Rail GND', 'reset');
  log('   2. LM2596S OUT- ⟷ Protoboard Rail GND', 'reset');
  log('   3. Relé GND ⟷ Protoboard Rail GND', 'reset');
  log('   4. CD74HC4067 GND ⟷ Protoboard Rail GND', 'reset');
  log('   5. KY-037 GND ⟷ Protoboard Rail GND', 'reset');
  log('');
  log('   TODAS deben tener continuidad (beep del multímetro)', 'yellow');
  log('');
  
  const answer = await question('   ¿TODAS las tierras tienen continuidad? (s/n): ');
  if (answer.toLowerCase() === 's') {
    logTest('Continuidad GND', 'pass', 'Common ground verificado');
  } else {
    logTest('Continuidad GND', 'fail', '⚠️ CRÍTICO: Conectar todas las tierras');
  }
  
  return true;
}

// ============================================================
// MAIN: Ejecutar todos los tests
// ============================================================
async function main() {
  printBanner();
  
  log('⚠️  ADVERTENCIA', 'yellow');
  log('Este script controla GPIO reales de la Raspberry Pi.', 'reset');
  log('Asegúrate de que el hardware esté correctamente instalado.', 'reset');
  log('');
  
  const proceed = await question('¿Continuar con los tests? (s/n): ');
  if (proceed.toLowerCase() !== 's') {
    log('Tests cancelados.', 'yellow');
    rl.close();
    return;
  }
  
  try {
    // Ejecutar tests en secuencia
    await testGPIOPermissions();
    await testPowerSupply();
    await testGroundContinuity();
    await testRelays();
    await testMultiplexor();
    await testAudioSensor();
    
    // Mostrar resumen
    printSummary();
    
  } catch (error) {
    log('');
    log(`❌ Error fatal durante tests: ${error.message}`, 'red');
    log(error.stack, 'red');
  } finally {
    rl.close();
  }
}

// Manejo de señales para cleanup
process.on('SIGINT', () => {
  log('\n\n⚠️  Test interrumpido por usuario. Limpiando GPIO...', 'yellow');
  
  // Intentar liberar todos los GPIO
  try {
    const { Gpio } = require('onoff');
    Gpio.unexportAll();
  } catch (error) {
    // Ignorar errores en cleanup
  }
  
  rl.close();
  process.exit(0);
});

// Ejecutar
if (require.main === module) {
  main().catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });
}

module.exports = { main };
