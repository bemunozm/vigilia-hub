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
    this.SCAN_INTERVAL_MS = parseInt(process.env.SCAN_INTERVAL_MS || '30', 10); // Más frecuente (30ms) para detectar teclas rápidas
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
      // 1. Monitorear Hook Switch Físico para colgar
      if (this.isAnalogCallActive) {
        if (this.gpioController.isHangupDetected()) {
          this.logger.log('📞 Colgado detectado - Finalizando llamada analógica');
          this.endAnalogCall();
        }
      }

      if (this.state === AudioState.AI_INTERCEPT && !this.isEstablishingAIConnection) {
        if (this.gpioController.isHangupDetected()) {
          this.logger.log('📞 Colgado detectado - Finalizando conversación IA');
          this.endAICall();
        }
      }

      // 2. Leer teclado matricial SIEMPRE (Delegar el bloqueo de comportamiento a handleKeyPress)
      const key = await this.gpioController.scanKeypad();
      
      if (key !== null) {
        this.handleKeyPress(key);
      }
    }, this.SCAN_INTERVAL_MS);
  }

  /**
   * Maneja presión de tecla con anti-rebote estricto a nivel de aplicación
   */
  private handleKeyPress(key: string): void {
    const now = Date.now();
    
    // Ignorar si hace menos de 300ms se presionó LA MISMA TECLA (doble lectura accidental por vibración)
    if (key === this.keypadBuffer.slice(-1) && (now - this.lastSignalTime) < 300) {
        return;
    }
    this.lastSignalTime = now;

    // Cancelar el timeout anterior
    if (this.keypadTimeout) {
      clearTimeout(this.keypadTimeout);
    }

    // Si estamos en cooldown, ignorar teclas
    if (this.state === AudioState.COOLDOWN) {
      return;
    }

    // MODO LABORATORIO: Permitir colgar llamadas activas usando la tecla '*'
    if (this.state === AudioState.AI_INTERCEPT || this.isAnalogCallActive) {
        if (key === '*') {
            this.logger.log('🛑 Tecla de aborto (*) presionada: Colgando llamada manualmente');
            if (this.state === AudioState.AI_INTERCEPT) this.endAICall();
            if (this.isAnalogCallActive) this.endAnalogCall();
        }
        return; // Ignorar el resto de teclas mientras hay llamada
    }

    // Si el router no está listo para escuchar botones (ej. conectando), ignorar
    if (this.state !== AudioState.TRANSPARENT && this.state !== AudioState.SCANNING_KEYPAD) {
       return;
    }

    // Transición a SCANNING_KEYPAD si estábamos en TRANSPARENT
    if (this.state === AudioState.TRANSPARENT) {
      this.setState(AudioState.SCANNING_KEYPAD);
    }

    // Procesar la tecla
    if (key === '#') {
      // Fin de marcación confirmado
      if (this.keypadBuffer.length > 0) {
          this.processHouseNumber();
      } else {
          this.logger.warn('⚠️ Se presionó # pero no hay número marcado');
      }
    } else if (key === '*') {
      // Cancelar / Borrar marcación actual
      this.clearKeypadBuffer();
      this.logger.log('🗑️ Marcación cancelada (Tecla *)');
      this.returnToTransparent();
    } else {
      // Es un dígito '0'-'9', 'A'-'D'
      this.keypadBuffer += key;
      this.logger.log(`\x1b[36m👉 Marcando... [ ${this.keypadBuffer} ]\x1b[0m`);
    }

    // Timeout: Solo limpia el buffer si pasa mucho tiempo (15s), pero NO LLAMA SOLO.
    this.keypadTimeout = setTimeout(() => {
      if (this.keypadBuffer.length > 0) {
        this.logger.warn('⏰ Demasiado tiempo sin confirmar con #, borrando número');
        this.clearKeypadBuffer();
        this.returnToTransparent();
      }
    }, 15000); // 15 segundos para apretar el #
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
      await this.conciergeClient.startConversation(houseNumber);
      
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

    // Notificar fin de audio para rehabilitar micrófono
    this.conciergeClient.onAudioResponseDone(() => {
      // Pequeño delay para permitir que el buffer de audio (aplay) se vacíe
      setTimeout(() => {
        this.echoSuppression.notifySpeakerInactive();
      }, 500);
    });

    // Manejar interrupción (Barge-in): Cuando usuario habla, cortar audio actual
    this.conciergeClient.onSpeechStarted(() => {
        this.logger.log('🛑 Usuario interrumpió - Cortando playback');
        this.audioManager.interruptPlayback();
        this.echoSuppression.notifySpeakerInactive(); // Rehabilitar mic inmediatamente (aunque debería estarlo)
    });

    // Manejar finalización natural o forzada por la IA (tool call 'finalizar_llamada')
    this.conciergeClient.onConversationEnded(() => {
        this.logger.log('📞 IA finalizó la conversación - Cortando citófono físico');
        
        // Ejecutamos la salida asíncrona sin bloquear el hilo actual
        // exitAIInterceptState apagará relés, detendrá audio y entrará en COOLDOWN
        this.exitAIInterceptState().catch(err => {
            this.logger.error('Error al forzar salida de AI_INTERCEPT:', err);
        });
    });
  }

  /**
   * Sale de modo AI_INTERCEPT
   */
  private async exitAIInterceptState(): Promise<void> {
    this.logger.log('🛑 Saliendo de AI_INTERCEPT');
    this.isEstablishingAIConnection = false; // Resetear flag
    
    // Finalizar conversación y audio inmediatamente
    this.conciergeClient.endConversation();
    this.audioManager.stopCapture();
    this.audioManager.stopPlayback();
    
    // Esperar a que el parlante se quede callado antes de devolver la línea a la calle
    await this.sleep(400); 

    // Desactivar relés 
    await this.relayController.disableInterception();
    this.logger.log('🔌 Relés apagados (Citófono normal activado)');
    
    // Entrar en cooldown largo (evita que rebotes del micrófono disparen algo más)
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
