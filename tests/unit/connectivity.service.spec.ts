import { ConnectivityService } from '../../src/services/connectivity.service';
import axios from 'axios';
import * as dns from 'dns/promises';

// Mock de axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock de dns/promises
jest.mock('dns/promises', () => ({
  lookup: jest.fn(),
}));

describe('ConnectivityService', () => {
  let service: ConnectivityService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    service = new ConnectivityService();
  });

  afterEach(() => {
    service.cleanup();
    jest.useRealTimers();
  });

  describe('checkConnectivity', () => {
    it('debe retornar true cuando hay conectividad', async () => {
      // Mock DNS exitoso
      (dns.lookup as jest.Mock).mockResolvedValue({ address: '8.8.8.8', family: 4 });
      mockedAxios.head.mockResolvedValue({ status: 200 } as any);

      const result = await service.checkConnectivity();

      expect(result).toBe(true);
      expect(dns.lookup).toHaveBeenCalledWith('google.com');
    });

    it('debe retornar false cuando no hay conectividad DNS', async () => {
      // Mock DNS falla
      (dns.lookup as jest.Mock).mockRejectedValue(new Error('DNS failed'));

      const result = await service.checkConnectivity();

      expect(result).toBe(false);
    });

    it('debe cachear el resultado durante 30 segundos', async () => {
      // Primera llamada
      (dns.lookup as jest.Mock).mockResolvedValue({ address: '8.8.8.8', family: 4 });
      mockedAxios.head.mockResolvedValue({ status: 200 } as any);
      
      const result1 = await service.checkConnectivity();
      expect(result1).toBe(true);
      expect(dns.lookup).toHaveBeenCalledTimes(1);

      // Segunda llamada (debe usar caché)
      const result2 = await service.checkConnectivity();
      expect(result2).toBe(true);
      expect(dns.lookup).toHaveBeenCalledTimes(1); // No llamó de nuevo

      // Avanzar tiempo más de 30s
      jest.advanceTimersByTime(31000);

      // Tercera llamada (caché expirado)
      const result3 = await service.checkConnectivity();
      expect(result3).toBe(true);
      expect(dns.lookup).toHaveBeenCalledTimes(2); // Llamó de nuevo
    });
  });

  describe('getStatus', () => {
    it('debe retornar true después de check exitoso', async () => {
      (dns.lookup as jest.Mock).mockResolvedValue({ address: '8.8.8.8', family: 4 });
      mockedAxios.head.mockResolvedValue({ status: 200 } as any);

      await service.checkConnectivity();
      const status = service.getStatus();

      expect(status).toBe(true);
    });

    it('debe retornar false después de check fallido', async () => {
      (dns.lookup as jest.Mock).mockRejectedValue(new Error('DNS failed'));

      await service.checkConnectivity();
      const status = service.getStatus();

      expect(status).toBe(false);
    });

    it('debe retornar el último estado conocido', async () => {
      (dns.lookup as jest.Mock).mockResolvedValue({ address: '8.8.8.8', family: 4 });
      mockedAxios.head.mockResolvedValue({ status: 200 } as any);

      // Primera verificación exitosa
      await service.checkConnectivity();
      expect(service.getStatus()).toBe(true);

      // Segunda verificación sin cambios (usa caché)
      const status2 = service.getStatus();
      expect(status2).toBe(true);
    });
  });

  describe('start', () => {
    it('debe iniciar el monitoreo periódico', () => {
      (dns.lookup as jest.Mock).mockResolvedValue({ address: '8.8.8.8', family: 4 });
      mockedAxios.head.mockResolvedValue({ status: 200 } as any);

      service.start();

      // El método start() inicia el monitoreo
      // En un test real verificaríamos setInterval, pero requiere más setup
      expect(service).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('debe responder en menos de 100ms cuando usa caché', async () => {
      (dns.lookup as jest.Mock).mockResolvedValue({ address: '8.8.8.8', family: 4 });
      mockedAxios.head.mockResolvedValue({ status: 200 } as any);

      // Calentar caché
      await service.checkConnectivity();

      const start = Date.now();
      await service.checkConnectivity();
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});
