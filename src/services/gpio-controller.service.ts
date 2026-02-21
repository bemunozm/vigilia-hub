import { Gpio } from '../utils/gpio-wrapper';
import { Logger } from '../utils/logger';

export class GPIOControllerService {
  private readonly logger = new Logger(GPIOControllerService.name);
  
  // Pines Directos Teclado 4x4
  private readonly ROW_PINS = [5, 6, 13, 19];
  private readonly COL_PINS = [26, 16, 20, 24];
  
  private rowGpios: Gpio[] = [];
  private colGpios: Gpio[] = [];
  private hangupPin: Gpio | null = null; // GPIO para detectar colgar
  private isAvailable: boolean = false;
  
  // Mapa Matricial del Teclado
  private readonly KEYPAD_MAP = [
    ['1', '2', '3', 'A'],
    ['4', '5', '6', 'B'],
    ['7', '8', '9', 'C'],
    ['*', '0', '#', 'D']
  ];

  // Variables para Debounce
  private lastKeyPressed: string | null = null;
  private lastKeyTime = 0;
  private readonly DEBOUNCE_TIME_MS = 300; 

  constructor() {
    try {
      // 1. Inicializar Filas como ENTRADAS (con Pull-Up interno)
      this.ROW_PINS.forEach(pin => {
        this.rowGpios.push(new Gpio(pin, 'in', 'none', 'up')); // GpioWrapper (onoff) mapping: { mode: 'in', edge: 'none', pullUpDown: 'up' }
      });
      
      // 2. Inicializar Columnas como SALIDAS (por defecto HIGH)
      this.COL_PINS.forEach(pin => {
        const gpio = new Gpio(pin, 'out');
        gpio.writeSync(1); // 3.3V
        this.colGpios.push(gpio);
      });
      
      // 3. Pin para detectar colgar (hook switch)
      const hangupGpio = parseInt(process.env.HANGUP_GPIO || '22', 10);
      this.hangupPin = new Gpio(hangupGpio, 'in', 'both', 'up'); // Pull-up para hook switch
      
      this.isAvailable = true;
      this.logger.log('✅ GPIO Teclado Matricial Directo inicializado');
      this.logger.log(`✅ GPIO Hangup inicializado en pin ${hangupGpio}`);
    } catch (error: any) {
      this.isAvailable = false;
      this.logger.warn('⚠️ GPIO no disponible (modo desarrollo sin hardware)');
      this.logger.debug(`Detalle error GPIO: ${error.message}`);
      // NO lanzar error - permitir ejecución en desarrollo
    }
  }
  
  /**
   * Verifica si el hardware GPIO está disponible
   */
  public isGPIOAvailable(): boolean {
    return this.isAvailable;
  }

  /**
   * Elimina selectMuxChannel y isSignalActive, ya no aplican.
   */

  /**
   * Escanea la matriz del teclado de forma directa
   */
  async scanKeypad(): Promise<string | null> {
    if (!this.isAvailable) {
      this.logger.debug('GPIO no disponible, skipping keypad scan');
      return null;
    }
    
    let detectedKey: string | null = null;
    
    try {
      // Pasamos columna por columna tirándola a LOW (0V)
      for (let c = 0; c < this.colGpios.length; c++) {
        // Tiramos la columna a LOW
        this.colGpios[c].writeSync(0);
        
        // Micro retardo para estabilización eléctrica (Sync)
        for (let j = 0; j < 500; j++) {}

        // Leemos cada fila
        for (let r = 0; r < this.rowGpios.length; r++) {
          if (this.rowGpios[r].readSync() === 0) {
            const key = this.KEYPAD_MAP[r][c];
            const now = Date.now();
            
            // Validar Debounce
            if (key !== this.lastKeyPressed || (now - this.lastKeyTime) > this.DEBOUNCE_TIME_MS) {
              this.lastKeyPressed = key;
              this.lastKeyTime = now;
              detectedKey = key;
            }
          }
        }

        // Devolvemos la columna a HIGH
        this.colGpios[c].writeSync(1);
        
        if (detectedKey) {
            break; // Si detectamos, cortamos el ciclo de columnas prematuramente
        }
      }

      // Si no detectamos nada, permitimos resetear la última tecla rápidamente
      if (!detectedKey && (Date.now() - this.lastKeyTime) > 50) {
        this.lastKeyPressed = null;
      }

      return detectedKey;
    } catch (error) {
      // Usar trace para no spamear console si hay error continuado de hardware
      this.logger.debug(`Error escaneando teclado matricial: ${(error as any).message}`);
    }
    
    return null;
  }

  /**
   * Detecta si se colgó el teléfono (hook switch)
   * LOW = colgado, HIGH = descolgado
   */
  isHangupDetected(): boolean {
    if (!this.isAvailable || !this.hangupPin) {
      return false;
    }
    
    try {
      // LOW = teléfono colgado
      return this.hangupPin.readSync() === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Limpieza
   */
  cleanup(): void {
    if (!this.isAvailable) return;
    
    try {
      this.rowGpios.forEach(pin => pin.unexport());
      this.colGpios.forEach(pin => pin.unexport());
      if (this.hangupPin) {
        this.hangupPin.unexport();
      }
      this.logger.log('GPIO limpiado');
    } catch (error) {
      // Ignorar errores en cleanup
    }
  }
}
