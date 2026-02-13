import * as dotenv from 'dotenv';
import { Logger } from './utils/logger';
import { LocalCacheService } from './services/local-cache.service';
import { ConnectivityService } from './services/connectivity.service';
import { GPIOControllerService } from './services/gpio-controller.service';
import { RelayControllerService } from './services/relay-controller.service';
import { AudioManagerService } from './services/audio-manager.service';
import { EchoSuppressionService } from './services/echo-suppression.service';
import { WebSocketClientService } from './services/websocket-client.service';
import { ConciergeClientService } from './services/concierge-client.service';
import { AudioRouterService } from './services/audio-router.service';

// Cargar variables de entorno
dotenv.config();

const logger = new Logger('Main');

/**
 * Sistema principal del HUB
 */
class VigiliaHubApplication {
  private localCache!: LocalCacheService;
  private connectivity!: ConnectivityService;
  private gpioController!: GPIOControllerService;
  private relayController!: RelayControllerService;
  private audioManager!: AudioManagerService;
  private echoSuppression!: EchoSuppressionService;
  private websocketClient!: WebSocketClientService;
  private conciergeClient!: ConciergeClientService;
  private audioRouter!: AudioRouterService;

  async initialize(): Promise<void> {
    logger.log('═══════════════════════════════════════════════');
    logger.log('🏢 VIGILIA HUB - Sistema de Citófono Inteligente');
    logger.log('═══════════════════════════════════════════════');
    logger.log('');

    try {
      // 1. Servicios de conectividad y caché
      logger.log('📡 Inicializando conectividad y caché...');
      this.connectivity = new ConnectivityService();
      this.localCache = new LocalCacheService();
      
      await Promise.all([
        this.connectivity.start(),
        this.localCache.initialize()
      ]);

      // 2. Controladores de hardware
      logger.log('🔌 Inicializando controladores de hardware...');
      this.gpioController = new GPIOControllerService();
      this.relayController = new RelayControllerService();
      this.audioManager = new AudioManagerService();
      this.echoSuppression = new EchoSuppressionService();

      // 3. Clientes de comunicación
      logger.log('☁️ Conectando a servicios externos...');
      this.websocketClient = new WebSocketClientService(this.connectivity);
      this.conciergeClient = new ConciergeClientService(this.websocketClient);

      await this.websocketClient.connect();
      // NOTA: conciergeClient se conecta bajo demanda cuando se inicia una conversación

      // 4. Audio Router (FSM)
      logger.log('🎛️ Inicializando Audio Router...');
      this.audioRouter = new AudioRouterService(
        this.localCache,
        this.gpioController,
        this.relayController,
        this.audioManager,
        this.echoSuppression,
        this.conciergeClient
      );

      await this.audioRouter.start();

      logger.log('');
      logger.log('✅ Sistema iniciado correctamente');
      logger.log('═══════════════════════════════════════════════');
      logger.log('');
      logger.log('Estado: TRANSPARENT (Citófono funcionando normal)');
      logger.log('Esperando marcación de números...');
      logger.log('');

      // Configurar handlers de limpieza
      this.setupCleanupHandlers();
    } catch (error) {
      logger.error('❌ Error inicializando el sistema', error);
      await this.cleanup();
      process.exit(1);
    }
  }

  /**
   * Configura handlers de shutdown
   */
  private setupCleanupHandlers(): void {
    const shutdown = async (signal: string) => {
      logger.log('');
      logger.log(`⚠️ Señal ${signal} recibida, cerrando sistema...`);
      await this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    process.on('uncaughtException', async (error) => {
      logger.error('EXCEPCIÓN NO CAPTURADA', error);
      await this.cleanup();
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason) => {
      logger.error('PROMESA RECHAZADA', reason);
      await this.cleanup();
      process.exit(1);
    });
  }

  /**
   * Limpieza de recursos
   */
  private async cleanup(): Promise<void> {
    logger.log('🧹 Limpiando recursos...');

    try {
      // Orden inverso de inicialización
      if (this.audioRouter) await this.audioRouter.cleanup();
      if (this.conciergeClient) await this.conciergeClient.cleanup();
      if (this.websocketClient) this.websocketClient.cleanup();
      if (this.audioManager) this.audioManager.cleanup();
      if (this.relayController) this.relayController.cleanup();
      if (this.gpioController) this.gpioController.cleanup();
      if (this.connectivity) this.connectivity.cleanup();
      if (this.localCache) await this.localCache.cleanup();

      logger.log('✅ Limpieza completada');
    } catch (error) {
      logger.error('Error durante limpieza', error);
    }
  }
}

/**
 * Punto de entrada
 */
async function main() {
  const app = new VigiliaHubApplication();
  await app.initialize();
}

main().catch((error) => {
  logger.error('Error fatal', error);
  process.exit(1);
});
