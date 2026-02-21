import { Gpio } from '../utils/gpio-wrapper';
import { Logger } from '../utils/logger';

export class DoorControllerService {
  private readonly logger = new Logger(DoorControllerService.name);
  
  private doorRelay: Gpio | null = null;
  private isAvailable: boolean = false;
  
  private readonly DOOR_PULSE_MS = 3000;

  constructor() {
    const doorRelayPin = parseInt(process.env.RELAY_DOOR_PIN || '27', 10);

    try {
      // Configurar relé como salida (LOW = Activado, HIGH = Desactivado)
      this.doorRelay = new Gpio(doorRelayPin, 'out');
      
      // Estado seguro por defecto: relé apagado (HIGH)
      this.doorRelay.writeSync(1);
      
      this.isAvailable = true;
      this.logger.log(`✅ Controlador de relé (Puerta/Portón) inicializado en GPIO ${doorRelayPin}`);
    } catch (error: any) {
      this.isAvailable = false;
      this.logger.warn(`⚠️ Relé de puerta no disponible (modo desarrollo)`);
      this.logger.debug(`Detalle error: ${error.message}`);
    }
  }

  /**
   * Abre la puerta principal (peatonal)
   */
  async openDoor(): Promise<void> {
    if (!this.isAvailable) {
      this.logger.warn('Simulando apertura de PUERTA PEATONAL (Hardware no disponible)');
      return;
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
   */
  async openGate(): Promise<void> {
    if (!this.isAvailable) {
      this.logger.warn('Simulando apertura de PORTÓN VEHICULAR (Hardware no disponible)');
      return;
    }

    this.logger.log('🚗 Abriendo Portón Vehicular (Vía Relé Principal)...');
    
    // Como tenemos solo un relé doble, usamos el mismo pulso físico para ambas puertas
    // (Cableadas en paralelo al mismo relé)
    try {
      this.doorRelay!.writeSync(0);
      await this.delay(this.DOOR_PULSE_MS);
      this.doorRelay!.writeSync(1);
      this.logger.log('✅ Portón Vehicular cerrado (Relé desactivado)');
    } catch (error) {
      this.logger.error('Error al abrir el portón vehicular', error);
      try { this.doorRelay?.writeSync(1); } catch (e) {}
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup(): void {
    if (!this.isAvailable) return;
    try {
      this.doorRelay?.writeSync(1);
      this.doorRelay?.unexport();
      this.logger.log('Relé de accesos limpiado');
    } catch (error) {}
  }
}
