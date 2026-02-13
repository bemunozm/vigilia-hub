/**
 * GPIO Wrapper usando lgpio (librería moderna para Raspberry Pi)
 * Compatible con API de onoff para migración fácil
 */

import { Logger } from './logger';

const logger = new Logger('GPIOWrapper');

// Tipos
export type Direction = 'in' | 'out' | 'high' | 'low';
export type Edge = 'none' | 'rising' | 'falling' | 'both';
export type Value = 0 | 1;

// Detección de plataforma
const isRaspberryPi = (): boolean => {
  try {
    const fs = require('fs');
    return fs.existsSync('/dev/gpiochip0');
  } catch {
    return false;
  }
};

/**
 * Mock GPIO para desarrollo en plataformas no-RPi
 */
class MockGpio {
  private gpio: number;
  private direction: Direction;
  private value: Value = 0;

  constructor(gpio: number, direction: Direction) {
    this.gpio = gpio;
    this.direction = direction;
    logger.debug(`[MOCK] GPIO${gpio} inicializado como ${direction}`);
  }

  read(callback?: (err: Error | null | undefined, value: Value) => void): Value {
    if (callback) {
      setTimeout(() => callback(null, this.value), 0);
    }
    return this.value;
  }

  readSync(): Value {
    logger.debug(`[MOCK] GPIO${this.gpio} read: ${this.value}`);
    return this.value;
  }

  write(value: Value, callback?: (err: Error | null | undefined) => void): void {
    this.value = value;
    logger.debug(`[MOCK] GPIO${this.gpio} write: ${value}`);
    if (callback) {
      setTimeout(() => callback(null), 0);
    }
  }

  writeSync(value: Value): void {
    this.value = value;
    logger.debug(`[MOCK] GPIO${this.gpio} writeSync: ${value}`);
  }

  watch(callback: (err: Error | null | undefined, value: Value) => void): void {
    logger.debug(`[MOCK] GPIO${this.gpio} watch registrado`);
  }

  unwatch(callback?: (err: Error | null | undefined, value: Value) => void): void {
    logger.debug(`[MOCK] GPIO${this.gpio} unwatch`);
  }

  unwatchAll(): void {
    logger.debug(`[MOCK] GPIO${this.gpio} unwatchAll`);
  }

  direction(): Direction {
    return this.direction;
  }

  setDirection(direction: Direction): void {
    this.direction = direction;
    logger.debug(`[MOCK] GPIO${this.gpio} direction: ${direction}`);
  }

  edge(): Edge {
    return 'none';
  }

  setEdge(edge: Edge): void {
    logger.debug(`[MOCK] GPIO${this.gpio} edge: ${edge}`);
  }

  activeLow(): boolean {
    return false;
  }

  setActiveLow(invert: boolean): void {
    logger.debug(`[MOCK] GPIO${this.gpio} activeLow: ${invert}`);
  }

  unexport(): void {
    logger.debug(`[MOCK] GPIO${this.gpio} unexport`);
  }
}

/**
 * GPIO Real usando lgpio
 */
class RealGpio {
  private gpio: number;
  private chip: any;
  private handle: number | null = null;
  private direction: Direction;
  private _edge: Edge = 'none';
  private isRaspberryPi: boolean = true;

  constructor(gpio: number, direction: Direction, edge?: Edge) {
    this.gpio = gpio;
    this.direction = direction;
    if (edge) this._edge = edge;

    try {
      // Lazy load lgpio
      const lgpio = require('lgpio');
      
      // Abrir gpiochip0 (el principal en RPi)
      this.handle = lgpio.gpiochip_open(0);
      
      if (this.handle < 0) {
        throw new Error(`No se pudo abrir gpiochip0: ${this.handle}`);
      }

      // Configurar GPIO según dirección
      if (direction === 'in') {
        lgpio.gpio_claim_input(this.handle, gpio);
        
        // Configurar edge detection si es necesario
        if (edge && edge !== 'none') {
          const edgeFlags = this.getEdgeFlags(edge);
          lgpio.gpio_claim_alert(this.handle, gpio, edgeFlags);
        }
      } else {
        // 'out', 'high', 'low'
        const initialValue = direction === 'high' ? 1 : 0;
        lgpio.gpio_claim_output(this.handle, gpio, initialValue);
      }

      logger.debug(`GPIO${gpio} inicializado como ${direction} (lgpio)`);
    } catch (error) {
      logger.error(`Error inicializando GPIO${gpio} con lgpio:`, error);
      throw error;
    }
  }

  private getEdgeFlags(edge: Edge): number {
    const lgpio = require('lgpio');
    switch (edge) {
      case 'rising':
        return lgpio.RISING_EDGE;
      case 'falling':
        return lgpio.FALLING_EDGE;
      case 'both':
        return lgpio.BOTH_EDGES;
      default:
        return 0;
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
    try {
      const lgpio = require('lgpio');
      const value = lgpio.gpio_read(this.handle, this.gpio);
      return value as Value;
    } catch (error) {
      logger.error(`Error leyendo GPIO${this.gpio}:`, error);
      return 0;
    }
  }

  write(value: Value, callback?: (err: Error | null | undefined) => void): void {
    this.writeSync(value);
    if (callback) {
      setTimeout(() => callback(null), 0);
    }
  }

  writeSync(value: Value): void {
    try {
      const lgpio = require('lgpio');
      lgpio.gpio_write(this.handle, this.gpio, value);
    } catch (error) {
      logger.error(`Error escribiendo GPIO${this.gpio}:`, error);
    }
  }

  watch(callback: (err: Error | null | undefined, value: Value) => void): void {
    logger.warn('watch() no implementado aún para lgpio');
  }

  unwatch(callback?: (err: Error | null | undefined, value: Value) => void): void {
    logger.debug(`GPIO${this.gpio} unwatch`);
  }

  unwatchAll(): void {
    logger.debug(`GPIO${this.gpio} unwatchAll`);
  }

  direction(): Direction {
    return this.direction;
  }

  setDirection(direction: Direction): void {
    logger.warn('setDirection() no soportado en lgpio después de inicialización');
  }

  edge(): Edge {
    return this._edge;
  }

  setEdge(edge: Edge): void {
    logger.warn('setEdge() no soportado en lgpio después de inicialización');
  }

  activeLow(): boolean {
    return false;
  }

  setActiveLow(invert: boolean): void {
    logger.warn('setActiveLow() no soportado en lgpio');
  }

  unexport(): void {
    try {
      if (this.handle !== null) {
        const lgpio = require('lgpio');
        lgpio.gpio_free(this.handle, this.gpio);
        lgpio.gpiochip_close(this.handle);
        this.handle = null;
        logger.debug(`GPIO${this.gpio} liberado`);
      }
    } catch (error) {
      logger.error(`Error liberando GPIO${this.gpio}:`, error);
    }
  }
}

/**
 * Gpio class que usa lgpio en RPi o mock en otras plataformas
 * API compatible con onoff para migración fácil
 */
export class Gpio {
  private impl: MockGpio | RealGpio;

  constructor(
    gpio: number,
    direction: Direction,
    edge?: Edge,
    options?: any
  ) {
    if (isRaspberryPi()) {
      try {
        this.impl = new RealGpio(gpio, direction, edge);
      } catch (error) {
        logger.warn(`No se pudo usar GPIO real, usando mock: ${error.message}`);
        this.impl = new MockGpio(gpio, direction);
      }
    } else {
      logger.info(`Plataforma no es Raspberry Pi, usando Mock GPIO${gpio}`);
      this.impl = new MockGpio(gpio, direction);
    }
  }

  read(callback?: (err: Error | null | undefined, value: Value) => void): Value {
    return this.impl.read(callback);
  }

  readSync(): Value {
    return this.impl.readSync();
  }

  write(value: Value, callback?: (err: Error | null | undefined) => void): void {
    this.impl.write(value, callback);
  }

  writeSync(value: Value): void {
    this.impl.writeSync(value);
  }

  watch(callback: (err: Error | null | undefined, value: Value) => void): void {
    this.impl.watch(callback);
  }

  unwatch(callback?: (err: Error | null | undefined, value: Value) => void): void {
    this.impl.unwatch(callback);
  }

  unwatchAll(): void {
    this.impl.unwatchAll();
  }

  direction(): Direction {
    return this.impl.direction();
  }

  setDirection(direction: Direction): void {
    this.impl.setDirection(direction);
  }

  edge(): Edge {
    return this.impl.edge();
  }

  setEdge(edge: Edge): void {
    this.impl.setEdge(edge);
  }

  activeLow(): boolean {
    return this.impl.activeLow();
  }

  setActiveLow(invert: boolean): void {
    this.impl.setActiveLow(invert);
  }

  unexport(): void {
    this.impl.unexport();
  }
}
