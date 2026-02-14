import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { Logger } from '../utils/logger';

interface CachedUnit {
  houseNumber: string;
  hasAI: boolean;
  familyId: string;
  lastSync?: string;
}

export class LocalCacheService {
  private readonly logger = new Logger(LocalCacheService.name);
  private readonly CACHE_FILE = path.join(__dirname, '../../data/ai-units.json');
  private cache: Map<string, CachedUnit> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;

  async initialize() {
    this.logger.log('Inicializando cache local...');
    
    // Crear directorio si no existe
    const dataDir = path.dirname(this.CACHE_FILE);
    await fs.mkdir(dataDir, { recursive: true });

    // Cargar cache desde disco
    try {
      const data = await fs.readFile(this.CACHE_FILE, 'utf-8');
      const units: CachedUnit[] = JSON.parse(data);
      
      units.forEach(unit => {
        this.cache.set(unit.houseNumber, unit);
      });
      
      this.logger.log(`✅ Cache cargado desde disco: ${this.cache.size} unidades con IA`);
      
      // SIEMPRE sincronizar al inicio para tener datos frescos
      this.logger.log('🔄 Sincronizando cache al iniciar...');
      await this.syncWithBackend();
      
    } catch (error) {
      this.logger.warn('Cache vacío, sincronizando por primera vez...');
      await this.syncWithBackend();
    }
  }

  /**
   * Decisión LOCAL en <50ms (sin llamada HTTP)
   */
  shouldInterceptCall(houseNumber: string): boolean {
    const unit = this.cache.get(houseNumber);
    
    if (unit && unit.hasAI) {
      this.logger.log(`✅ Casa ${houseNumber} tiene IA habilitada (cache local)`);
      return true;
    }
    
    this.logger.log(`❌ Casa ${houseNumber} NO tiene IA o no encontrada en cache`);
    return false;
  }

  /**
   * Sincronización con backend
   */
  async syncWithBackend(): Promise<void> {
    const backendUrl = process.env.BACKEND_URL;
    const hubSecret = process.env.HUB_SECRET;

    if (!backendUrl || !hubSecret) {
      this.logger.error('BACKEND_URL o HUB_SECRET no configurado');
      return;
    }

    try {
      this.logger.log('🔄 Sincronizando con backend...');
      
      const response = await axios.get(`${backendUrl}/api/v1/units/ai-enabled`, {
        headers: { 'X-Hub-Secret': hubSecret },
        timeout: 5000,
      });

      const units: CachedUnit[] = response.data;

      // Actualizar cache en memoria
      this.cache.clear();
      units.forEach(unit => {
        this.cache.set(unit.houseNumber, {
          ...unit,
          lastSync: new Date().toISOString(),
        });
      });

      // Persistir a disco
      await fs.writeFile(
        this.CACHE_FILE,
        JSON.stringify([...this.cache.values()], null, 2)
      );

      this.logger.log(`✅ Cache sincronizado: ${this.cache.size} unidades`);
      
    } catch (error) {
      if (axios.isAxiosError(error)) {
        this.logger.error(`Error sincronizando cache: ${error.message}`);
      } else {
        this.logger.error('Error sincronizando cache', error);
      }
    }
  }

  /**
   * Sincronización periódica
   */
  startPeriodicSync() {
    const interval = parseInt(process.env.CACHE_SYNC_INTERVAL_MS || '300000', 10);
    
    this.syncInterval = setInterval(() => {
      this.syncWithBackend();
    }, interval);

    this.logger.log(`🔄 Sincronización automática cada ${interval / 1000}s`);
  }

  /**
   * Obtener todas las unidades en cache
   */
  getAllUnits(): CachedUnit[] {
    return [...this.cache.values()];
  }

  /**
   * Limpieza
   */
  cleanup() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}
