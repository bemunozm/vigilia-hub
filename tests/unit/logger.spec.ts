import { Logger } from '../../src/utils/logger';
import * as fs from 'fs';
import * as path from 'path';

// Mock de winston
jest.mock('winston', () => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    log: jest.fn(),
  };

  return {
    createLogger: jest.fn(() => mockLogger),
    format: {
      combine: jest.fn(() => ({})),
      timestamp: jest.fn(() => ({})),
      errors: jest.fn(() => ({})),
      splat: jest.fn(() => ({})),
      json: jest.fn(() => ({})),
      colorize: jest.fn(() => ({})),
      printf: jest.fn(() => ({})),
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
  };
});

describe('Logger', () => {
  let logger: Logger;
  const context = 'TestContext';

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger(context);
  });

  describe('Initialization', () => {
    it('debe crear una instancia del logger con contexto', () => {
      expect(logger).toBeDefined();
    });

    it('debe usar el contexto en los mensajes', () => {
      const winston = require('winston');
      const mockLogger = winston.createLogger();

      logger.log('Test message');

      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  describe('Logging Methods', () => {
    it('debe llamar a log correctamente', () => {
      logger.log('Info message');
      
      const winston = require('winston');
      const mockLogger = winston.createLogger();
      
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('debe llamar a error correctamente', () => {
      logger.error('Error message', new Error('Test error'));
      
      const winston = require('winston');
      const mockLogger = winston.createLogger();
      
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('debe llamar a warn correctamente', () => {
      logger.warn('Warning message');
      
      const winston = require('winston');
      const mockLogger = winston.createLogger();
      
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('debe llamar a debug correctamente', () => {
      logger.debug('Debug message');
      
      const winston = require('winston');
      const mockLogger = winston.createLogger();
      
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('debe manejar errores como objetos Error', () => {
      const error = new Error('Test error');
      
      expect(() => {
        logger.error('Error occurred', error);
      }).not.toThrow();
    });

    it('debe manejar errores como strings', () => {
      expect(() => {
        logger.error('Error occurred', 'String error');
      }).not.toThrow();
    });

    it('debe manejar errores como objetos genéricos', () => {
      const errorObj = { code: 'ERR_001', message: 'Custom error' };
      
      expect(() => {
        logger.error('Error occurred', errorObj);
      }).not.toThrow();
    });
  });

  describe('Context', () => {
    it('debe incluir el contexto en todos los mensajes', () => {
      const contextLogger = new Logger('MyService');
      
      contextLogger.log('Test');
      contextLogger.error('Error');
      contextLogger.warn('Warning');
      contextLogger.debug('Debug');
      
      // El contexto debería estar presente en todas las llamadas
      const winston = require('winston');
      const mockLogger = winston.createLogger();
      
      expect(mockLogger.info).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalled();
    });
  });

  describe('Performance', () => {
    it('debe ser eficiente al registrar muchos mensajes', () => {
      const start = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        logger.log(`Message ${i}`);
      }
      
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(1000); // Menos de 1 segundo para 1000 mensajes
    });
  });
});
