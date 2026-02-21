import { Gpio } from '../utils/gpio-wrapper';
import { Logger } from '../utils/logger';

export class DoorControllerService {
  private readonly logger = new Logger(DoorControllerService.name);
  
  private doorRelay: Gpio | null = null;
  private gateRelay: Gpio | null = null;
  private isAvailable: boolean = false;
  
  private readonly DOOR_PULSE_MS = 3000;

  constructor() {
    const doorRelayPin = parseInt(process.env.RELAY_DOOR_PIN || '22', 10);
    const gateRelayPin = parseInt(process.env.RELAY_GATE_PIN || '23', 10);

    try {
      // Configurar relés como salida (LOW = Activado, HIGH = Desactivado)
      this.doorRelay = new Gpio(doorRelayPin, 'out');
      this.gateRelay = new Gpio(gateRelayPin, 'out');
      
      // Estado seguro por defecto: relés apagados (HIGH)
      this.doorRelay.writeSync(1);
      this.gateRelay.writeSync(1);
      
      this.isAvailable = true;
      this.logger.log(`✅ Controladores de puertas inicializados (Puerta: ${doorRelayPin}, Portón: ${gateRelayPin})`);
    } catch (error: any) {
      this.isAvailable = false;
      this.logger.warn(`⚠️ Relé de puerta no disponible (modo desarrollo)`);
      this.logger.debug(`Detalle error: ${error.message}`);
    }
  }

  /**
   * Abre la puerta principal (peatonal)
   * @param delayBeforeMs Tiempo a esperar antes de abrir (en milisegundos)
   */
  async openDoor(delayBeforeMs: number = 0): Promise<void> {
    if (!this.isAvailable) {
      this.logger.warn(`Simulando apertura de PUERTA PEATONAL (Hardware no disponible) - Delay: ${delayBeforeMs}ms`);
      return;
    }

    if (delayBeforeMs > 0) {
      this.logger.log(`⏳ Esperando ${delayBeforeMs}ms antes de abrir Puerta Peatonal...`);
      await this.delay(delayBeforeMs);
    }

    this.logger.log('🚪 Abriendo Puerta Peatonal...');
    
    try {
      // Activar relé (Active LOW)
      this.doorRelay!.writeSync(0);
      
      // Mantener presionado
      await this.delay(this.DOOR_PULSE_MS);
      
      // Soltar relé
      this.doorRelay!.writeSync(1);
      this.logger.log('✅ Puerta Peatonal cerrada (Relé desactivado)');
    } catch (error) {
      this.logger.error('Error al abrir la puerta peatonal', error);
      // Intentar forzar apagado seguro
      try { this.doorRelay?.writeSync(1); } catch (e) {}
    }
  }

  /**
   * Abre el portón vehicular
   * @param delayBeforeMs Tiempo a esperar antes de abrir (en milisegundos)
   */
  async openGate(delayBeforeMs: number = 0): Promise<void> {
    if (!this.isAvailable) {
      this.logger.warn(`Simulando apertura de PORTÓN VEHICULAR (Hardware no disponible) - Delay: ${delayBeforeMs}ms`);
      return;
    }

    if (delayBeforeMs > 0) {
      this.logger.log(`⏳ Esperando ${delayBeforeMs}ms antes de abrir Portón Vehicular...`);
      await this.delay(delayBeforeMs);
    }

    this.logger.log('🚗 Abriendo Portón Vehicular...');
    
    try {
      // Activar relé (Active LOW)
      this.gateRelay!.writeSync(0);
      
      // Mantener presionado
      await this.delay(this.DOOR_PULSE_MS);
      
      // Soltar relé
      this.gateRelay!.writeSync(1);
      this.logger.log('✅ Portón Vehicular cerrado (Relé desactivado)');
    } catch (error) {
      this.logger.error('Error al abrir el portón vehicular', error);
      // Intentar forzar apagado seguro
      try { this.gateRelay?.writeSync(1); } catch (e) {}
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup(): void {
    if (!this.isAvailable) return;
    try {
      this.doorRelay?.writeSync(1);
      this.gateRelay?.writeSync(1);
      this.doorRelay?.unexport();
      this.gateRelay?.unexport();
      this.logger.log('Relés de accesos limpiados');
    } catch (error) {}
  }
}
