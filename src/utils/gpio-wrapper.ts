/**
 * GPIO Wrapper usando pigpio (librería moderna para Raspberry Pi)
 * Auto-detecta plataforma y simula en desarrollo
 */

import { Logger } from './logger';

const logger = new Logger('GPIOWrapper');

// Tipos
export type Direction = 'in' | 'out' | 'high' | 'low';
export type Edge = 'none' | 'rising' | 'falling' | 'both';
export type Value = 0 | 1;
export type PullMode = 'up' | 'down'; // Resistores pull

/**
 * Clase GPIO única que detecta plataforma y usa pigpio o simula
 */
export class Gpio {
  private gpio: number;
  private isRealHardware: boolean = false;
  private pigpioGpio: any = null;
  private mockValue: Value = 0;
  private watchCallback: ((err: Error | null | undefined, value: Value) => void) | null = null;

  constructor(
    gpio: number,
    direction: Direction,
    edge?: Edge,
    pullMode?: PullMode // 'up' o 'down' para inputs
  ) {
    this.gpio = gpio;

    // Intentar usar hardware real
    try {
      const fs = require('fs');
      const hasGpioDevice = fs.existsSync('/dev/gpiomem') || fs.existsSync('/dev/mem');
      
      if (hasGpioDevice) {
        const Pigpio = require('pigpio').Gpio;
        const mode = direction === 'in' ? Pigpio.INPUT : Pigpio.OUTPUT;
        
        // Configurar pull resistor según parámetro o default
        let pudConfig = Pigpio.PUD_OFF;
        if (direction === 'in') {
          pudConfig = pullMode === 'up' ? Pigpio.PUD_UP : Pigpio.PUD_DOWN;
        }
        
        this.pigpioGpio = new Pigpio(gpio, {
          mode: mode,
          pullUpDown: pudConfig
        });

        // Valor inicial para outputs
        if (direction === 'out' || direction === 'high' || direction === 'low') {
          const value = direction === 'high' ? 1 : 0;
          this.pigpioGpio.digitalWrite(value);
        }

        // Edge detection para inputs
        if (direction === 'in' && edge && edge !== 'none') {
          this.pigpioGpio.enableAlert();
        }

        this.isRealHardware = true;
        logger.debug(`GPIO${gpio} inicializado como ${direction} (pigpio)`);
      } else {
        throw new Error('Dispositivo GPIO no encontrado');
      }
    } catch (error: any) {
      this.isRealHardware = false;
      logger.debug(`[MOCK] GPIO${gpio} inicializado como ${direction}`);
    }
  }

  read(callback?: (err: Error | null | undefined, value: Value) => void): Value {
    const value = this.readSync();
    if (callback) {
      setTimeout(() => callback(null, value), 0);
    }
    return value;
  }

  readSync(): Value {
    if (this.isRealHardware) {
      try {
        return this.pigpioGpio.digitalRead() as Value;
      } catch (error) {
        logger.error(`Error leyendo GPIO${this.gpio}:`, error);
        return 0;
      }
    } else {
      logger.debug(`[MOCK] GPIO${this.gpio} read: ${this.mockValue}`);
      return this.mockValue;
    }
  }

  write(value: Value, callback?: (err: Error | null | undefined) => void): void {
    this.writeSync(value);
    if (callback) {
      setTimeout(() => callback(null), 0);
    }
  }

  writeSync(value: Value): void {
    if (this.isRealHardware) {
      try {
        this.pigpioGpio.digitalWrite(value);
      } catch (error) {
        logger.error(`Error escribiendo GPIO${this.gpio}:`, error);
      }
    } else {
      this.mockValue = value;
      logger.debug(`[MOCK] GPIO${this.gpio} write: ${value}`);
    }
  }

  watch(callback: (err: Error | null | undefined, value: Value) => void): void {
    if (this.isRealHardware) {
      this.watchCallback = callback;
      this.pigpioGpio.on('alert', (level: number) => {
        if (this.watchCallback) {
          this.watchCallback(null, level as Value);
        }
      });
    } else {
      logger.debug(`[MOCK] GPIO${this.gpio} watch registrado`);
    }
  }

  unwatch(callback?: (err: Error | null | undefined, value: Value) => void): void {
    if (this.isRealHardware) {
      if (callback && this.watchCallback === callback) {
        this.pigpioGpio.removeAllListeners('alert');
        this.watchCallback = null;
      } else if (!callback) {
        this.pigpioGpio.removeAllListeners('alert');
        this.watchCallback = null;
      }
    } else {
      logger.debug(`[MOCK] GPIO${this.gpio} unwatch`);
    }
  }

  unwatchAll(): void {
    if (this.isRealHardware) {
      this.pigpioGpio.removeAllListeners('alert');
      this.watchCallback = null;
    } else {
      logger.debug(`[MOCK] GPIO${this.gpio} unwatchAll`);
    }
  }

  unexport(): void {
    if (this.isRealHardware) {
      try {
        this.unwatchAll();
        logger.debug(`GPIO${this.gpio} liberado`);
      } catch (error) {
        logger.error(`Error liberando GPIO${this.gpio}:`, error);
      }
    } else {
      logger.debug(`[MOCK] GPIO${this.gpio} unexport`);
    }
  }
}