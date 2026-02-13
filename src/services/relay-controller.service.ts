import { Gpio } from 'onoff';
import { Logger } from '../utils/logger';

export class RelayControllerService {
  private readonly logger = new Logger(RelayControllerService.name);
  
  private audioRelay1: Gpio;
  private audioRelay2: Gpio;
  
  private readonly MAX_INTERCEPT_TIME: number;
  private readonly RELAY_SETTLING_TIME_MS: number;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private isIntercepting = false;

  constructor() {
    const relay1Pin = parseInt(process.env.RELAY_PIN_1 || '17', 10);
    const relay2Pin = parseInt(process.env.RELAY_PIN_2 || '27', 10);
    
    this.MAX_INTERCEPT_TIME = parseInt(process.env.MAX_INTERCEPT_TIME_MS || '180000', 10);
    this.RELAY_SETTLING_TIME_MS = parseInt(process.env.RELAY_SETTLING_TIME_MS || '200', 10);

    try {
      // Inicializar en estado seguro (LOW = citófono normal)
      this.audioRelay1 = new Gpio(relay1Pin, 'out');
      this.audioRelay2 = new Gpio(relay2Pin, 'out');
      
      // Establecer estado inicial LOW
      this.audioRelay1.writeSync(0);
      this.audioRelay2.writeSync(0);
      
      this.setupSafetyHandlers();
      
      this.logger.log(`✅ Relés inicializados en GPIO ${relay1Pin}, ${relay2Pin}`);
    } catch (error) {
      this.logger.error('Error inicializando relés', error);
      throw error;
    }
  }

  /**
   * Configura handlers de seguridad para shutdown
   */
  private setupSafetyHandlers() {
    const emergencyCleanup = (signal: string) => {
      this.logger.warn(`Señal ${signal} recibida, liberando GPIOs...`);
      this.forceDisableInterception();
      
      try {
        this.audioRelay1.unexport();
        this.audioRelay2.unexport();
      } catch (error) {
        // Ignorar
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
    if (this.isIntercepting) {
      this.logger.warn('Ya está interceptando, ignorando');
      return;
    }

    this.logger.log('🔌 ACTIVANDO INTERCEPCIÓN (Relés ON)');
    
    // Activar relés
    this.audioRelay1.writeSync(1);
    this.audioRelay2.writeSync(1);
    
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
    if (!this.isIntercepting) {
      return;
    }

    this.logger.log('🔓 DESACTIVANDO INTERCEPCIÓN (Relés OFF)');
    
    // Dar tiempo para que termine el audio final
    await this.delay(500);
    
    // Apagar relés
    this.audioRelay1.writeSync(0);
    this.audioRelay2.writeSync(0);
    
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
    try {
      this.audioRelay1.writeSync(0);
      this.audioRelay2.writeSync(0);
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
    
    try {
      this.audioRelay1.unexport();
      this.audioRelay2.unexport();
      this.logger.log('Relés limpiados');
    } catch (error) {
      // Ignorar
    }
  }
}
