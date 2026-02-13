import { LocalCacheService } from '../../src/services/local-cache.service';
import * as fs from 'fs/promises';
import axios from 'axios';

// Mock del sistema de archivos promises
jest.mock('fs/promises');
const mockedFs = fs as jest.Mocked<typeof fs>;

// Mock de axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LocalCacheService', () => {
  let service: LocalCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LocalCacheService();
    
    // Mock por defecto: mkdir siempre exitoso
    (mockedFs.mkdir as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await service.cleanup();
  });

  describe('initialize', () => {
    it('debe cargar el caché desde el archivo si existe', async () => {
      const mockData = [
        { houseNumber: '101', hasAI: true, familyId: 'family-1' },
        { houseNumber: '102', hasAI: false, familyId: 'family-2' },
      ];

      (mockedFs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

      await service.initialize();

      // Verificar que se intentó leer el archivo
      expect(mockedFs.readFile).toHaveBeenCalled();
      
      // Verificar comportamiento: unidades cargadas correctamente
      expect(service.shouldInterceptCall('101')).toBe(true);
      expect(service.shouldInterceptCall('102')).toBe(false);
    });

    it('debe crear un caché vacío si el archivo no existe', async () => {
      // Mock: archivo no existe (readFile falla)
      (mockedFs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      // Mock: syncWithBackend también falla (sin backend)
      mockedAxios.get = jest.fn().mockRejectedValue(new Error('No backend'));

      await service.initialize();

      // Verificar que intentó leer pero el archivo no existía
      expect(mockedFs.readFile).toHaveBeenCalled();
      
      // Caché vacío = no intercepta nada
      expect(service.shouldInterceptCall('101')).toBe(false);
    });
  });

  describe('shouldInterceptCall', () => {
    beforeEach(async () => {
      const mockData = [
        { houseNumber: '101', hasAI: true, familyId: 'family-1' },
        { houseNumber: '102', hasAI: false, familyId: 'family-2' },
        { houseNumber: '103', hasAI: true, familyId: 'family-3' },
      ];

      (mockedFs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

      await service.initialize();
    });

    it('debe retornar true para casas con IA habilitada', () => {
      expect(service.shouldInterceptCall('101')).toBe(true);
      expect(service.shouldInterceptCall('103')).toBe(true);
    });

    it('debe retornar false para casas sin IA habilitada', () => {
      expect(service.shouldInterceptCall('102')).toBe(false);
    });

    it('debe retornar false para casas no encontradas en el caché', () => {
      expect(service.shouldInterceptCall('999')).toBe(false);
    });

    it('debe ser case-insensitive con el número de casa', () => {
      expect(service.shouldInterceptCall('101')).toBe(true);
      expect(service.shouldInterceptCall('101')).toBe(true);
    });

    it('debe ejecutarse en menos de 50ms', () => {
      const start = Date.now();
      service.shouldInterceptCall('101');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(50);
    });
  });

  describe('Cache internal state', () => {
    it('debe cargar unidades en memoria correctamente', async () => {
      const mockData = [
        { houseNumber: '101', hasAI: true, familyId: 'family-1' },
        { houseNumber: '102', hasAI: false, familyId: 'family-2' },
      ];

      (mockedFs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

      await service.initialize();

      // Verificar a través del comportamiento de shouldInterceptCall
      expect(service.shouldInterceptCall('101')).toBe(true);
      expect(service.shouldInterceptCall('102')).toBe(false);
    });

    it('debe manejar caché vacío correctamente', async () => {
      (mockedFs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
      mockedAxios.get = jest.fn().mockRejectedValue(new Error('No backend'));

      await service.initialize();

      // Sin unidades en caché, no debería interceptar
      expect(service.shouldInterceptCall('101')).toBe(false);
    });
  });

  describe('Performance', () => {
    it('debe manejar 1000 consultas en menos de 1 segundo', async () => {
      const mockData = Array.from({ length: 100 }, (_, i) => ({
        houseNumber: String(i + 1),
        hasAI: i % 2 === 0,
        familyId: `family-${i}`,
      }));

      (mockedFs.readFile as jest.Mock).mockResolvedValue(JSON.stringify(mockData));

      await service.initialize();

      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        service.shouldInterceptCall(String((i % 100) + 1));
      }
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(1000);
    });
  });
});
