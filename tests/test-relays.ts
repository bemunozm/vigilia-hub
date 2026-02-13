import * as dotenv from 'dotenv';
import { RelayControllerService } from '../src/services/relay-controller.service';

dotenv.config();

console.log('═══════════════════════════════════════════════');
console.log('🧪 TEST DE RELÉS - Vigilia Hub');
console.log('═══════════════════════════════════════════════');
console.log('');
console.log('Este script probará los relés con un patrón ON/OFF');
console.log('Deberías escuchar "clicks" del relay module');
console.log('');

const relay = new RelayControllerService();

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  try {
    console.log('✅ Relés inicializados');
    await sleep(2000);

    console.log('');
    console.log('🔄 Test 1: Activar intercepción (3 segundos)');
    await relay.enableInterception();
    console.log('   → Relés deberían estar ON (luz LED encendida)');
    await sleep(3000);

    console.log('');
    console.log('🔄 Test 2: Desactivar intercepción');
    await relay.disableInterception();
    console.log('   → Relés deberían estar OFF (luz LED apagada)');
    await sleep(2000);

    console.log('');
    console.log('🔄 Test 3: Ciclo rápido 5 veces');
    for (let i = 1; i <= 5; i++) {
      console.log(`   Ciclo ${i}/5`);
      await relay.enableInterception();
      await sleep(500);
      await relay.disableInterception();
      await sleep(500);
    }

    console.log('');
    console.log('✅ Test completado');
    console.log('');
    console.log('Si escuchaste los clicks y viste las luces LED,');
    console.log('entonces los relés están funcionando correctamente.');
  } catch (error) {
    console.error('❌ Error en test:', error);
  } finally {
    relay.cleanup();
    console.log('');
    console.log('🧹 Limpieza completada');
    process.exit(0);
  }
}

runTest();
