import { Gpio } from 'pigpio';

console.log('Iniciando prueba de hardware: Módulo de Relé 1 y GPIO (Setup de Laboratorio)...');
console.log('⚠️ ADVERTENCIA: Usando Lógica INVERSA (Active LOW) para módulo optoacoplado.');

// Mapeo físico
const RELAY_1_PIN = 17;
const RELAY_2_PIN = 27;

// Alias de estados para no confundirnos mentalmente
const RELAY_ON = 0;   // LOW activa el relé
const RELAY_OFF = 1;  // HIGH desactiva el relé

// Inicializar pines como salida
const relay1 = new Gpio(RELAY_1_PIN, { mode: Gpio.OUTPUT });
const relay2 = new Gpio(RELAY_2_PIN, { mode: Gpio.OUTPUT });

// HARD CONSTRAINT #1: Estado seguro inicial (Modo transparente)
relay1.digitalWrite(RELAY_OFF);
relay2.digitalWrite(RELAY_OFF);

console.log('Relés inicializados exitosamente y forzados al estado OFF seguro (HIGH - 3.3V).');
console.log('Ejecutando conmutación de prueba ciclada...\n');

let isIntercepting = false;

// Rutina de prueba: Alternar el estado lógico cada 2 segundos
const testInterval = setInterval(() => {
  isIntercepting = !isIntercepting;
  
  // Escribir el nuevo estado lógico INVERTIDO al hardware
  const hardwareState = isIntercepting ? RELAY_ON : RELAY_OFF;
  relay1.digitalWrite(hardwareState);
  relay2.digitalWrite(hardwareState);
  
  if (isIntercepting) {
    console.log(`[+] Mando 0V (LOW) ---> ¡CLACK! El LED del relé debe estar ON (Modo IA)`);
  } else {
    console.log(`[-] Mando 3.3V (HIGH) ---> ¡CLACK! El LED del relé debe estar OFF (Modo Normal)`);
  }
}, 2000);

// Apagar automáticamente a los 11 segundos
setTimeout(() => {
  clearInterval(testInterval);
  relay1.digitalWrite(RELAY_OFF);
  relay2.digitalWrite(RELAY_OFF);
  console.log('\nPrueba exitosa. Limpieza de hardware finalizada (Dejando en OFF).');
  process.exit(0);
}, 11000);

// Manejar un Ctrl+C abrupto
process.on('SIGINT', () => {
  console.log('\nAbortado manualmente. Forzando relés a OFF (HIGH)...');
  clearInterval(testInterval);
  relay1.digitalWrite(RELAY_OFF);
  relay2.digitalWrite(RELAY_OFF);
  process.exit(0);
});
