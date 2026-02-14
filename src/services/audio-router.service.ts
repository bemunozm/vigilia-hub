import { Logger } from '../utils/logger';
import { LocalCacheService } from './local-cache.service';
import { GPIOControllerService } from './gpio-controller.service';
import { RelayControllerService } from './relay-controller.service';
import { AudioManagerService } from './audio-manager.service';
import { EchoSuppressionService } from './echo-suppression.service';
import { ConciergeClientService } from './concierge-client.service';
import { DTMFGeneratorService } from './dtmf-generator.service';

/**
 * Máquina de Estados Finitos para el Audio Router
 */
enum AudioState {
  TRANSPARENT = 'TRANSPARENT',      // Citófono funcionando normal (sin interceptar)
  SCANNING_KEYPAD = 'SCANNING_KEYPAD', // Usuario marcando número
  AI_INTERCEPT = 'AI_INTERCEPT',    // IA atendiendo la llamada
  COOLDOWN = 'COOLDOWN'             // Periodo de espera antes de volver a TRANSPARENT
}

export class AudioRouterService {
  private readonly logger = new Logger(AudioRouterService.name);
  private state: AudioState = AudioState.TRANSPARENT;
  
  private keypadBuffer = '';
  private keypadTimeout: NodeJS.Timeout | null = null;
  private cooldownTimeout: NodeJS.Timeout | null = null;
  private scanInterval: NodeJS.Timeout | null = null;
  private lastSignalTime = 0;
  private lastDialedNumber: string = ''; // Guardar número marcado para reenvío
  private isAnalogCallActive = false; // Flag para monitorear colgar durante llamada analógica
  private isEstablishingAIConnection = false; // Flag para evitar monitorear colgar durante setup
  
  private readonly KEYPAD_TIMEOUT_MS: number;
  private readonly COOLDOWN_MS: number;
  private readonly SCAN_INTERVAL_MS: number;
  private readonly MAX_CONVERSATION_TIME_MS: number;
  private readonly DEBOUNCE_MS = 2000; // Evitar múltiples disparos
  
  private dtmfGenerator: DTMFGeneratorService;

  constructor(
    private readonly localCache: LocalCacheService,
    private readonly gpioController: GPIOControllerService,
    private readonly relayController: RelayControllerService,
    private readonly audioManager: AudioManagerService,
    private readonly echoSuppression: EchoSuppressionService,
    private readonly conciergeClient: ConciergeClientService
  ) {
    this.KEYPAD_TIMEOUT_MS = parseInt(process.env.KEYPAD_TIMEOUT_MS || '5000', 10);
    this.COOLDOWN_MS = parseInt(process.env.COOLDOWN_MS || '3000', 10);
    this.SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || '100', 10);
    this.MAX_CONVERSATION_TIME_MS = parseInt(process.env.MAX_CONVERSATION_TIME_MS || '180000', 10);

    this.dtmfGenerator = new DTMFGeneratorService();
    this.logger.log('✅ Audio Router inicializado en estado TRANSPARENT');
  }

  /**
   * Inicia el router
   */
  async start(): Promise<void> {
    this.logger.log('🚀 Iniciando Audio Router...');
    
    // Asegurar estado inicial seguro
    await this.enterTransparentState();
    
    // Iniciar escaneo continuo del teclado
    this.startKeypadScanning();
  }

  /**
   * Escanea el teclado y detecta colgar continuamente
   * MODO PRUEBA: Detecta señal en GPIO 26 y marca casa "15" automáticamente
   */
  private startKeypadScanning(): void {
    this.scanInterval = setInterval(async () => {
      // Monitorear colgar durante llamada analógica
      if (this.isAnalogCallActive) {
        const hangupDetected = this.gpioController.isHangupDetected();
        if (hangupDetected) {
          this.logger.log('📞 Colgado detectado - Finalizando llamada analógica');
          this.endAnalogCall();
        }
        return; // No procesar teclas durante llamada activa
      }

      // Monitorear colgar durante conversación con IA (solo si ya está establecida)
      if (this.state === AudioState.AI_INTERCEPT && !this.isEstablishingAIConnection) {
        const hangupDetected = this.gpioController.isHangupDetected();
        if (hangupDetected) {
          this.logger.log('📞 Colgado detectado - Finalizando conversación IA');
          this.endAICall();
        }
        return; // No procesar teclas durante conversación IA
      }

      // Solo procesar teclas si estamos en TRANSPARENT y sin llamada activa
      if (this.state !== AudioState.TRANSPARENT) {
        return;
      }

      // MODO PRUEBA: En lugar de escanear multiplexor, detectar GPIO 26 directamente
      const signalDetected = this.gpioController.isSignalActive();
      
      if (signalDetected) {
        // Debounce: evitar múltiples disparos en 2 segundos
        const now = Date.now();
        if (now - this.lastSignalTime < this.DEBOUNCE_MS) {
          return;
        }
        this.lastSignalTime = now;

        this.logger.log('🔔 Señal detectada en GPIO 26 - Marcando casa 15 (modo prueba)');
        await this.processHouseNumberDirect('15');
      }
    }, this.SCAN_INTERVAL_MS);
  }

  /**
   * Maneja presión de tecla
   */
  private handleKeyPress(key: string): void {
    // Resetear timeout del teclado
    if (this.keypadTimeout) {
      clearTimeout(this.keypadTimeout);
    }

    // Si estamos en cooldown o AI, ignorar teclas
    if (this.state === AudioState.COOLDOWN || this.state === AudioState.AI_INTERCEPT) {
      return;
    }

    // Transición a SCANNING_KEYPAD si estábamos en TRANSPARENT
    if (this.state === AudioState.TRANSPARENT) {
      this.setState(AudioState.SCANNING_KEYPAD);
    }

    // Agregar tecla al buffer
    if (key === '#') {
      // Fin de marcación
      this.processHouseNumber();
    } else if (key === '*') {
      // Cancelar
      this.clearKeypadBuffer();
      this.returnToTransparent();
    } else {
      // Dígito
      this.keypadBuffer += key;
      this.logger.debug(`🔢 Buffer: ${this.keypadBuffer}`);
    }

    // Timeout: si no presionan # en 5s, procesar
    this.keypadTimeout = setTimeout(() => {
      if (this.keypadBuffer.length > 0) {
        this.processHouseNumber();
      } else {
        this.returnToTransparent();
      }
    }, this.KEYPAD_TIMEOUT_MS);
  }

  /**
   * Procesa el número de casa marcado
   * HAPPY PATH: Interceptar SIEMPRE primero, luego decidir camino
   */
  private async processHouseNumber(): Promise<void> {
    const houseNumber = this.keypadBuffer.trim();
    this.clearKeypadBuffer();
    await this.processHouseNumberDirect(houseNumber);
  }

  /**
   * Método público para pruebas: procesa marcación sin keypad físico
   * FLUJO: Interceptar SIEMPRE primero (evitar latencia), luego decidir
   */
  public async processHouseNumberDirect(houseNumber: string): Promise<void> {
    if (!houseNumber) {
      this.returnToTransparent();
      return;
    }

    this.logger.log(`🏠 Casa marcada: ${houseNumber}`);
    this.lastDialedNumber = houseNumber; // GUARDAR para reenvío posterior

    // PASO 1: INTERCEPTAR SEÑAL INMEDIATAMENTE (evita que suene citófono durante decisión)
    this.logger.log(`⚡ Interceptando señal para evaluar (evitar latencia)...`);
    await this.relayController.enableInterception();

    // PASO 2: Decisión rápida (<50ms) usando caché local
    const shouldUseAI = this.localCache.shouldInterceptCall(houseNumber);

    if (!shouldUseAI) {
      // Casa SIN IA: Reenviar DTMF y liberar para citófono GT normal
      await this.transferToAnalogPhone();
      return;
    }

    // PASO 3: Casa CON IA → Mantener interceptado y activar Conserje Digital
    this.logger.log(`🤖 Casa con IA - Iniciando Conserje Digital`);
    await this.continueAIInterceptState(houseNumber);
  }

  /**
   * Transfiere llamada a teléfono analógico (sin IA o derivación desde IA)
   * IMPORTANTE: Reenvía señal DTMF al módulo GT antes de liberar
   */
  private async transferToAnalogPhone(): Promise<void> {
    this.logger.log(`📞 Casa sin IA - Reenviando DTMF "${this.lastDialedNumber}" al módulo GT`);
    
    // PASO 1: Enviar tonos DTMF al módulo GT (genera archivo temporal y usa aplay)
    await this.dtmfGenerator.sendDTMFSequence(this.lastDialedNumber);
    
    // PASO 2: Liberar relés - ahora el módulo GT establece la llamada
    this.logger.log(`🔓 Liberando señal - citófono GT completará la llamada`);
    await this.relayController.disableInterception();
    
    // PASO 3: Activar monitoreo de colgar
    this.isAnalogCallActive = true;
    this.logger.log(`📞 Llamada analógica activa - Monitoreando GPIO colgar`);
    
    this.returnToTransparent();
    // Llamada ahora en curso entre visitante y residente vía citófono analógico
  }

  /**
   * Finaliza llamada analógica cuando se detecta colgar
   */
  private endAnalogCall(): void {
    this.isAnalogCallActive = false;
    this.lastDialedNumber = '';
    this.logger.log(`✅ Llamada analógica finalizada - Sistema listo para nueva llamada`);
  }
  /**
   * Finaliza conversación con IA cuando se detecta colgar
   */
  private endAICall(): void {
    this.logger.log('🛑 Finalizando conversación IA por colgar');
    this.exitAIInterceptState();
  }
  /**
   * Entra en modo TRANSPARENT (citófono normal)
   */
  private async enterTransparentState(): Promise<void> {
    this.setState(AudioState.TRANSPARENT);
    
    // Asegurar relés apagados
    await this.relayController.disableInterception();
    
    // Detener audio
    this.audioManager.stopCapture();
    this.audioManager.stopPlayback();
    
    this.logger.log('📡 Modo TRANSPARENT (citófono normal)');
  }

  /**
   * Continúa en modo AI_INTERCEPT (relés ya activados)
   * Los relés se activaron en processHouseNumber() para evitar delay
   */
  private async continueAIInterceptState(houseNumber: string): Promise<void> {
    this.setState(AudioState.AI_INTERCEPT);
    this.isEstablishingAIConnection = true; // Evitar monitorear colgar durante setup
    
    try {
      // Relés ya están activos desde processHouseNumber()
      // Solo esperamos el settling time
      await this.sleep(this.relayController['RELAY_SETTLING_TIME_MS'] || 200);
      
      // 1. Conectar a OpenAI (solicita token efímero al backend)
      this.logger.log('🔌 Conectando a OpenAI Realtime API...');
      await this.conciergeClient.connect();
      
      // 2. Iniciar conversación con contexto de casa
      this.conciergeClient.startConversation(houseNumber);
      
      // 3. Configurar pipeline de audio
      this.setupAudioPipeline();
      
      this.isEstablishingAIConnection = false; // Ahora sí monitorear colgar
      this.logger.log('🤖 Modo AI_INTERCEPT activo - Conversación iniciada');
      
      // 4. Timeout de seguridad
      setTimeout(() => {
        if (this.state === AudioState.AI_INTERCEPT) {
          this.logger.warn('⏰ Timeout de conversación, finalizando');
          this.exitAIInterceptState();
        }
      }, this.MAX_CONVERSATION_TIME_MS);
    } catch (error) {
      this.isEstablishingAIConnection = false; // Resetear flag en caso de error
      this.logger.error('Error en AI_INTERCEPT', error);
      await this.enterCooldownState();
    }
  }

  /**
   * Delay helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Configura pipeline bidireccional de audio
   */
  private setupAudioPipeline(): void {
    // Iniciar reproducción (aplay) explícitamente
    this.audioManager.startPlayback();

    // Captura: Micrófono → Echo Suppression → OpenAI
    this.audioManager.startCapture((audioChunk: Buffer) => {
      // Filtrar eco
      const shouldSend = this.echoSuppression.shouldSendAudio(audioChunk);
      
      if (shouldSend) {
        this.conciergeClient.sendAudio(audioChunk);
      }
    });

    // Playback: OpenAI → Speaker
    this.conciergeClient.onAudioReceived((audioBuffer: Buffer) => {
      // Notificar a echo suppression que el speaker está activo
      this.echoSuppression.notifySpeakerActive();
      
      // Reproducir
      this.audioManager.writePlayback(audioBuffer);
    });
  }

  /**
   * Sale de modo AI_INTERCEPT
   */
  private async exitAIInterceptState(): Promise<void> {
    this.logger.log('🛑 Saliendo de AI_INTERCEPT');
    this.isEstablishingAIConnection = false; // Resetear flag
    
    // Finalizar conversación
    this.conciergeClient.endConversation();
    
    // Detener audio
    this.audioManager.stopCapture();
    this.audioManager.stopPlayback();
    
    // Desactivar relés (con delay de 500ms para terminar audio)
    await this.relayController.disableInterception();
    
    // Entrar en cooldown
    await this.enterCooldownState();
  }

  /**
   * Entra en modo COOLDOWN (evita rebotes)
   */
  private async enterCooldownState(): Promise<void> {
    this.setState(AudioState.COOLDOWN);
    
    this.logger.log(`⏳ Modo COOLDOWN (${this.COOLDOWN_MS}ms)`);
    
    this.cooldownTimeout = setTimeout(() => {
      this.returnToTransparent();
    }, this.COOLDOWN_MS);
  }

  /**
   * Retorna a TRANSPARENT
   */
  private async returnToTransparent(): Promise<void> {
    await this.enterTransparentState();
  }

  /**
   * Cambia el estado de la FSM
   */
  private setState(newState: AudioState): void {
    const oldState = this.state;
    this.state = newState;
    
    this.logger.log(`🔄 Estado: ${oldState} → ${newState}`);
  }

  /**
   * Limpia el buffer del teclado
   */
  private clearKeypadBuffer(): void {
    this.keypadBuffer = '';
    
    if (this.keypadTimeout) {
      clearTimeout(this.keypadTimeout);
      this.keypadTimeout = null;
    }
  }

  /**
   * Obtiene el estado actual
   */
  getState(): AudioState {
    return this.state;
  }

  /**
   * Detiene el router
   */
  async stop(): Promise<void> {
    this.logger.log('🛑 Deteniendo Audio Router...');
    
    // Detener escaneo del teclado
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }

    // Limpiar timeouts
    if (this.keypadTimeout) clearTimeout(this.keypadTimeout);
    if (this.cooldownTimeout) clearTimeout(this.cooldownTimeout);

    // Volver a estado seguro
    await this.enterTransparentState();
  }

  /**
   * Limpieza
   */
  async cleanup(): Promise<void> {
    await this.stop();
    this.logger.log('Audio Router limpiado');
  }
}
