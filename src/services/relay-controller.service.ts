import { Gpio } from '../utils/gpio-wrapper';
import { Logger } from '../utils/logger';

export class RelayControllerService {
  private readonly logger = new Logger(RelayControllerService.name);
  
  private audioRelay: Gpio | null = null;
  private isAvailable: boolean = false;
  
  private readonly MAX_INTERCEPT_TIME: number;
  private readonly RELAY_SETTLING_TIME_MS: number;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private isIntercepting = false;

  constructor() {
    const relayPin = parseInt(process.env.RELAY_PIN_1 || '17', 10);
    
    this.MAX_INTERCEPT_TIME = parseInt(process.env.MAX_INTERCEPT_TIME_MS || '180000', 10);
    this.RELAY_SETTLING_TIME_MS = parseInt(process.env.RELAY_SETTLING_TIME_MS || '200', 10);

    try {
      // Inicializar en estado seguro (LOW = citófono normal)
      this.audioRelay = new Gpio(relayPin, 'out');
      
      // Establecer estado inicial HIGH (OFF para Active LOW)
      this.audioRelay.writeSync(1);
      
      this.isAvailable = true;
      this.setupSafetyHandlers();
      
      this.logger.log(`✅ Relé de Audio inicializado en GPIO ${relayPin}`);
    } catch (error: any) {
      this.isAvailable = false;
      this.logger.warn(`⚠️ Relé de audio no disponible (modo desarrollo sin hardware)`);
      this.logger.debug(`Detalle error relé: ${error.message}`);
      // NO lanzar error - permitir ejecución en desarrollo
    }
  }
  
  /**
   * Verifica si hardware de relés está disponible
   */
  public isRelayAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Configura handlers de seguridad para shutdown
   */
  private setupSafetyHandlers() {
    const emergencyCleanup = (signal: string) => {
      this.logger.warn(`Señal ${signal} recibida, liberando GPIOs...`);
      this.forceDisableInterception();
      
      if (this.isAvailable) {
        try {
          this.audioRelay!.unexport();
        } catch (error) {
          // Ignorar
        }
      }
      
      setTimeout(() => process.exit(0), 100);
    };

    process.on('SIGINT', () => emergencyCleanup('SIGINT'));
    process.on('SIGTERM', () => emergencyCleanup('SIGTERM'));
    process.on('exit', () => {
      this.forceDisableInterception();
    });
    process.on('uncaughtException', (error) => {
      this.logger.error('EXCEPCIÓN NO CAPTURADA', error);
      emergencyCleanup('uncaughtException');
    });
    process.on('unhandledRejection', (reason) => {
      this.logger.error('PROMESA RECHAZADA', reason);
      emergencyCleanup('unhandledRejection');
    });
  }

  /**
   * Activa intercepción con protección contra "pop"
   */
  async enableInterception(): Promise<void> {
    if (!this.isAvailable) {
      this.logger.debug('Relés no disponibles (modo desarrollo)');
      return;
    }
    
    if (this.isIntercepting) {
      this.logger.warn('Ya está interceptando, ignorando');
      return;
    }

    this.logger.log('🔌 ACTIVANDO INTERCEPCIÓN (Relé ON)');
    
    // Activar relés (LOW para Active LOW)
    this.audioRelay!.writeSync(0);
    
    this.isIntercepting = true;

    // Esperar a que el relé se estabilice (evita el "pop")
    await this.delay(this.RELAY_SETTLING_TIME_MS);

    this.logger.log('✅ Relés estabilizados');

    // Watchdog: auto-desactivar después del timeout
    this.watchdogTimer = setTimeout(() => {
      this.logger.error('⏰ WATCHDOG TIMEOUT: Desactivando intercepción forzada');
      this.disableInterception();
    }, this.MAX_INTERCEPT_TIME);
  }

  /**
   * Desactiva intercepción suavemente
   */
  async disableInterception(): Promise<void> {
    if (!this.isAvailable) {
      return;
    }
    
    if (!this.isIntercepting) {
      return;
    }

    this.logger.log('🔓 DESACTIVANDO INTERCEPCIÓN (Relé OFF)');
    
    // Dar tiempo para que termine el audio final
    await this.delay(500);
    
    // Apagar relés (HIGH para Active LOW)
    this.audioRelay!.writeSync(1);
    
    this.isIntercepting = false;

    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    this.logger.log('✅ Vuelto a modo transparente');
  }

  /**
   * Fuerza desactivación sin checks (emergencias)
   */
  private forceDisableInterception(): void {
    if (!this.isAvailable) return;
    
    try {
      this.audioRelay!.writeSync(1); // HIGH (OFF)
      this.isIntercepting = false;
      
      if (this.watchdogTimer) {
        clearTimeout(this.watchdogTimer);
      }
    } catch (error) {
      // Ignorar errores en shutdown
    }
  }

  /**
   * Verifica si está interceptando
   */
  isActive(): boolean {
    return this.isIntercepting;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Limpieza
   */
  cleanup(): void {
    this.forceDisableInterception();
    
    if (!this.isAvailable) return;
    
    try {
      this.audioRelay!.unexport();
      this.logger.log('Relé de audio limpiado');
    } catch (error) {
      // Ignorar
    }
  }
}
