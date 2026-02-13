import { Gpio } from '../utils/gpio-wrapper';
import { Logger } from '../utils/logger';

export class GPIOControllerService {
  private readonly logger = new Logger(GPIOControllerService.name);
  private muxControlPins: Gpio[] = [];
  private muxSignalPin: Gpio | null = null;
  private isAvailable: boolean = false;
  private keypadMap: { [key: string]: string } = {
    '0': '0', '1': '1', '2': '2', '3': '3',
    '4': '4', '5': '5', '6': '6', '7': '7',
    '8': '8', '9': '9', '10': '*', '11': '#'
  };

  constructor() {
    try {
      // Pines de control del multiplexor (S0-S3)
      this.muxControlPins = [5, 6, 13, 19].map(pin => new Gpio(pin, 'out'));
      
      // Pin de señal del multiplexor (conectado a teclado)
      this.muxSignalPin = new Gpio(26, 'in', 'rising');
      
      this.isAvailable = true;
      this.logger.log('✅ GPIO Multiplexor inicializado');
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
   * Selecciona un canal del multiplexor
   */
  private selectMuxChannel(channel: number): void {
    if (!this.isAvailable) return;
    this.muxControlPins[0].writeSync((channel & 0x01) as 0 | 1);
    this.muxControlPins[1].writeSync(((channel >> 1) & 0x01) as 0 | 1);
    this.muxControlPins[2].writeSync(((channel >> 2) & 0x01) as 0 | 1);
    this.muxControlPins[3].writeSync(((channel >> 3) & 0x01) as 0 | 1);
  }

  /**
   * Escanea el teclado matricial buscando teclas presionadas
   */
  async scanKeypad(): Promise<string | null> {
    if (!this.isAvailable) {
      this.logger.debug('GPIO no disponible, skipping keypad scan');
      return null;
    }
    
    try {
      for (let channel = 0; channel < 12; channel++) {
        this.selectMuxChannel(channel);
        await this.sleep(10); // Debounce
        
        if (this.muxSignalPin && this.muxSignalPin.readSync() === 1) {
          const key = this.keypadMap[channel.toString()];
          this.logger.debug(`🔢 Tecla presionada: ${key}`);
          return key;
        }
      }
    } catch (error) {
      this.logger.error('Error escaneando teclado', error);
    }
    
    return null;
  }

  /**
   * Delay helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Limpieza
   */
  cleanup(): void {
    if (!this.isAvailable) return;
    
    try {
      this.muxControlPins.forEach(pin => pin.unexport());
      if (this.muxSignalPin) {
        this.muxSignalPin.unexport();
      }
      this.logger.log('GPIO limpiado');
    } catch (error) {
      // Ignorar errores en cleanup
    }
  }
}
