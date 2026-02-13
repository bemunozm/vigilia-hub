import * as dotenv from 'dotenv';
import { GPIOControllerService } from '../src/services/gpio-controller.service';

dotenv.config();

console.log('═══════════════════════════════════════════════');
console.log('🧪 TEST DE TECLADO - Vigilia Hub');
console.log('═══════════════════════════════════════════════');
console.log('');
console.log('Este script escaneará el teclado continuamente');
console.log('Presiona teclas en el citófono para verificar');
console.log('Presiona Ctrl+C para salir');
console.log('');

const gpio = new GPIOControllerService();
let running = true;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scan() {
  console.log('✅ GPIO inicializado');
  console.log('🔍 Escaneando teclado...');
  console.log('');

  let lastKey: string | null = null;
  let buffer = '';

  while (running) {
    const key = await gpio.scanKeypad();
    
    if (key && key !== lastKey) {
      lastKey = key;
      
      if (key === '#') {
        console.log(`🔢 Tecla: ${key} (TERMINAR)`);
        console.log(`📋 Número completo: ${buffer}`);
        console.log('');
        buffer = '';
      } else if (key === '*') {
        console.log(`🔢 Tecla: ${key} (CANCELAR)`);
        buffer = '';
        console.log('');
      } else {
        console.log(`🔢 Tecla: ${key}`);
        buffer += key;
      }
    } else if (!key) {
      lastKey = null;
    }
    
    await sleep(100);
  }
}

process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 Deteniendo test...');
  running = false;
  gpio.cleanup();
  console.log('🧹 Limpieza completada');
  process.exit(0);
});

scan().catch((error) => {
  console.error('❌ Error:', error);
  gpio.cleanup();
  process.exit(1);
});
