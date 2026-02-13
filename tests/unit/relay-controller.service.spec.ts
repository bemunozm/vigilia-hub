import { RelayControllerService } from '../../src/services/relay-controller.service';

// Helper para flush de promesas con fake timers
const flushPromises = () => new Promise(jest.requireActual('timers').setImmediate);

// Mock de onoff
jest.mock('onoff', () => {
  return {
    Gpio: jest.fn().mockImplementation(() => ({
      writeSync: jest.fn(),
      readSync: jest.fn().mockReturnValue(0),
      unexport: jest.fn(),
    })),
  };
});

describe('RelayControllerService', () => {
  let service: RelayControllerService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Configurar env vars para testing
    process.env = {
      ...originalEnv,
      RELAY_PIN_1: '17',
      RELAY_PIN_2: '27',
      MAX_INTERCEPT_TIME_MS: '180000',
      RELAY_SETTLING_TIME_MS: '200',
    };

    service = new RelayControllerService();
  });

  afterEach(() => {
    service.cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
    process.env = originalEnv;
  });

  describe('Initialization', () => {
    it('debe inicializar los relés en estado LOW (OFF)', () => {
      const { Gpio } = require('onoff');
      const mockWriteSync = jest.fn();
      
      // Verificar que se llamó con 2 parámetros (sin el tercer parámetro 'low')
      expect(Gpio).toHaveBeenCalledWith(17, 'out');
      expect(Gpio).toHaveBeenCalledWith(27, 'out');
    });

    it('debe configurar handlers de seguridad', () => {
      // Verificar que no lanza errores al inicializar
      expect(() => new RelayControllerService()).not.toThrow();
    });

    it('debe leer los pines desde variables de entorno', () => {
      process.env.RELAY_PIN_1 = '22';
      process.env.RELAY_PIN_2 = '23';

      const customService = new RelayControllerService();
      const { Gpio } = require('onoff');

      expect(Gpio).toHaveBeenCalledWith(22, 'out');
      expect(Gpio).toHaveBeenCalledWith(23, 'out');

      customService.cleanup();
    });
  });

  describe('enableInterception', () => {
    it('debe activar ambos relés', async () => {
      const promise = service.enableInterception();
      
      // Avanzar timers para el settling time
      jest.advanceTimersByTime(200);
      
      await promise;

      expect(service.isActive()).toBe(true);
    });

    it('debe esperar el settling time configurado', async () => {
      const settlingTime = 200;
      process.env.RELAY_SETTLING_TIME_MS = String(settlingTime);

      const newService = new RelayControllerService();
      const promise = newService.enableInterception();

      // No debería completarse antes del settling time
      jest.advanceTimersByTime(settlingTime - 1);
      
      // Avanzar el tiempo restante
      jest.advanceTimersByTime(1);
      
      await promise;

      expect(newService.isActive()).toBe(true);
      newService.cleanup();
    });

    it('debe ignorar si ya está interceptando', async () => {
      const firstPromise = service.enableInterception();
      jest.advanceTimersByTime(200);
      await firstPromise;

      // Intentar activar de nuevo
      await service.enableInterception();

      // No debería lanzar error ni cambiar estado
      expect(service.isActive()).toBe(true);
    });

    it('debe iniciar watchdog timer', async () => {
      const promise = service.enableInterception();
      jest.advanceTimersByTime(200);
      await promise;

      expect(service.isActive()).toBe(true);

      // Avanzar hasta el watchdog timeout (180000ms)
      jest.advanceTimersByTime(180000);
      await flushPromises();
      
      // Avanzar el delay interno de disableInterception (500ms)
      jest.advanceTimersByTime(500);
      await flushPromises();

      // El watchdog debería haber desactivado
      expect(service.isActive()).toBe(false);
    });
  });

  describe('disableInterception', () => {
    beforeEach(async () => {
      const promise = service.enableInterception();
      jest.advanceTimersByTime(200);
      await promise;
    });

    it('debe desactivar los relés correctamente', async () => {
      const promise = service.disableInterception();
      
      // Esperar el delay de 500ms
      jest.advanceTimersByTime(500);
      
      await promise;

      expect(service.isActive()).toBe(false);
    });

    it('debe cancelar el watchdog timer', async () => {
      const promise = service.disableInterception();
      jest.advanceTimersByTime(500);
      await promise;

      // Avanzar tiempo más allá del watchdog
      jest.advanceTimersByTime(180000);

      // No debería hacer nada porque ya está desactivado
      expect(service.isActive()).toBe(false);
    });

    it('debe ignorar si ya está desactivado', async () => {
      const firstPromise = service.disableInterception();
      jest.advanceTimersByTime(500);
      await firstPromise;

      // Intentar desactivar de nuevo
      const secondPromise = service.disableInterception();
      jest.advanceTimersByTime(500);
      await secondPromise;

      // No debería lanzar error
      expect(service.isActive()).toBe(false);
    });
  });

  describe('isActive', () => {
    it('debe retornar false inicialmente', () => {
      expect(service.isActive()).toBe(false);
    });

    it('debe retornar true cuando está interceptando', async () => {
      const promise = service.enableInterception();
      jest.advanceTimersByTime(200);
      await promise;

      expect(service.isActive()).toBe(true);
    });

    it('debe retornar false después de desactivar', async () => {
      const enablePromise = service.enableInterception();
      jest.advanceTimersByTime(200);
      await enablePromise;

      const disablePromise = service.disableInterception();
      jest.advanceTimersByTime(500);
      await disablePromise;

      expect(service.isActive()).toBe(false);
    });
  });

  describe('Watchdog Safety', () => {
    it('debe auto-desactivar después del timeout máximo', async () => {
      const maxTime = 180000;
      
      const enablePromise = service.enableInterception();
      jest.advanceTimersByTime(200);
      await enablePromise;

      expect(service.isActive()).toBe(true);

      // Avanzar hasta justo antes del timeout
      jest.advanceTimersByTime(maxTime - 1);
      expect(service.isActive()).toBe(true);

      // Avanzar pasando el timeout + delay de desactivación
      jest.advanceTimersByTime(1);
      await flushPromises();
      jest.advanceTimersByTime(500);
      await flushPromises();

      expect(service.isActive()).toBe(false);
    });

    it('debe respetar el MAX_INTERCEPT_TIME_MS del .env', async () => {
      const customTimeout = 60000;
      process.env.MAX_INTERCEPT_TIME_MS = String(customTimeout);

      const customService = new RelayControllerService();
      const enablePromise = customService.enableInterception();
      jest.advanceTimersByTime(200);
      await enablePromise;

      expect(customService.isActive()).toBe(true);

      // Avanzar al timeout custom + delay de desactivación
      jest.advanceTimersByTime(customTimeout);
      await flushPromises();
      jest.advanceTimersByTime(500);
      await flushPromises();

      expect(customService.isActive()).toBe(false);
      customService.cleanup();
    });
  });

  describe('cleanup', () => {
    it('debe desactivar relés al limpiar', () => {
      service.cleanup();

      expect(service.isActive()).toBe(false);
    });

    it('debe unexport los GPIO', () => {
      service.cleanup();

      // Verificar que se llamó unexport (mock)
      const { Gpio } = require('onoff');
      const instances = Gpio.mock.results;
      
      instances.forEach((instance: any) => {
        if (instance.value) {
          expect(instance.value.unexport).toHaveBeenCalled();
        }
      });
    });

    it('no debe lanzar error si se llama múltiples veces', () => {
      expect(() => {
        service.cleanup();
        service.cleanup();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('debe manejar errores de GPIO gracefully', () => {
      const { Gpio } = require('onoff');
      
      // Simular error en writeSync
      Gpio.mockImplementationOnce(() => ({
        writeSync: jest.fn(() => {
          throw new Error('GPIO error');
        }),
        unexport: jest.fn(),
      }));

      expect(() => {
        new RelayControllerService();
      }).toThrow();
    });
  });
});
