import WebSocket from 'ws';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { WebSocketClientService } from './websocket-client.service';

/**
 * Cliente para OpenAI Realtime API usando WebSocket directo
 * Réplica exacta del flujo del frontend (DigitalConciergeView.tsx)
 * 
 * Implementación: WebSocket nativo (ws library)
 * Referencia: https://platform.openai.com/docs/api-reference/realtime
 */
export class ConciergeClientService {
  private readonly logger = new Logger(ConciergeClientService.name);
  private ws: WebSocket | null = null;
  private currentSessionId: string | null = null;
  private conversationActive = false;
  private backendUrl: string;
  private audioHandlers: ((audioBuffer: Buffer) => void)[] = [];
  private audioDoneHandlers: (() => void)[] = [];
  private speechStartedHandlers: (() => void)[] = [];
  private targetHouse: string | null = null;
  private isInterrupted = false;
  
  // Configuración del modelo Realtime (versión GA estable)
  private readonly REALTIME_MODEL = 'gpt-realtime-mini-2025-12-15';
  private readonly REALTIME_WS_URL = 'wss://api.openai.com/v1/realtime';

  constructor(
    private readonly websocketClient: WebSocketClientService
  ) {
    const backendUrl = process.env.BACKEND_API_URL;
    
    if (!backendUrl) {
      throw new Error('BACKEND_API_URL no configurado en .env');
    }

    this.backendUrl = backendUrl;
    this.logger.log('✅ Concierge Client inicializado (WebSocket nativo)');
    this.logger.log(`📡 Backend URL: ${this.backendUrl}`);
    this.logger.log(`🤖 Modelo: ${this.REALTIME_MODEL}`);
  }

  /**
   * Conecta a OpenAI Realtime API usando WebSocket directo
   */
  async connect(): Promise<void> {
    try {
      let ephemeralToken: string;
      let sessionId: string;

      // 🔍 DEBUG: Permitir uso directo de API Key para descartar problemas de tokens efímeros
      if (process.env.DEBUG_OPENAI_KEY) {
        this.logger.warn('⚠️ MODO DEBUG ACTIVADO: Usando API Key directa (Bypassing Backend) ⚠️');
        ephemeralToken = process.env.DEBUG_OPENAI_KEY;
        sessionId = `debug_${Date.now()}`;
        this.currentSessionId = sessionId;
      } else {
        this.logger.log('🎫 Solicitando token efímero al backend...');
        
        // Obtener token efímero y sessionId del backend
        const response = await axios.post(`${this.backendUrl}/api/v1/concierge/session/start`, {
          socketId: this.websocketClient.getSocketId(),
        });

        ephemeralToken = response.data.ephemeralToken;
        sessionId = response.data.sessionId;
        this.currentSessionId = sessionId;
        this.logger.log(`✅ Token efímero obtenido. SessionId: ${sessionId}`);
      }
      
      this.logger.log('🤖 Conectando a OpenAI Realtime API via WebSocket...');

      // Construir URL con modelo y headers según documentación OpenAI
      const wsUrl = `${this.REALTIME_WS_URL}?model=${this.REALTIME_MODEL}`;
      
      // Crear WebSocket con headers de autorización
      this.ws = new WebSocket(wsUrl, {
        headers: {
          'Authorization': `Bearer ${ephemeralToken}`,
        }
      });

      // Configurar event handlers
      this.setupEventHandlers();

      // Esperar a que el WebSocket esté abierto
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout esperando conexión WebSocket'));
        }, 10000);

        this.ws!.on('open', () => {
          clearTimeout(timeout);
          this.logger.log('✅ WebSocket conectado a OpenAI Realtime API');
          this.configureSession();
          resolve();
        });

        this.ws!.on('error', (error: Error) => {
          clearTimeout(timeout);
          this.logger.error('❌ Error en WebSocket de OpenAI:', error);
          reject(error);
        });
      });

    } catch (error) {
      this.logger.error('❌ Error conectando a OpenAI:', error);
      if (axios.isAxiosError(error)) {
        this.logger.error(`Detalles del error HTTP: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
      }
      throw error;
    }
  }

  /**
   * Configura la sesión de OpenAI con parámetros optimizados
   * Estructura según documentación oficial de OpenAI Realtime API
   */
  private configureSession(): void {
    if (!this.ws) {
      this.logger.error('❌ No hay WebSocket para configurar');
      return;
    }

    // Configuración de sesión según documentación oficial
    // ESTRATEGIA DEBUG: Agregar type='realtime' aunque no debiera ser necesario para update, por si acaso es el param faltante.
    const sessionConfig = {
      type: 'session.update',
      session: {
        // CORRECCION CRITICA: El API rechaza "modalities", usa "modalities" en Beta pero "output_modalities" en GA WebSocket object?
        // El log del backend muestra "output_modalities": ["audio"].
        // Intentaremos usar "modalities" -> "output_modalities" (como estaba al inicio) ya que "modalities" falló.
        // Ademas mantenemos type='realtime' que solucionó el error de parametro requerido.
        type: 'realtime', 
        
        // modalities: ['audio', 'text'], // ESTO FALLÓ ("Unknown parameter")
        // Probamos sin modalities explícito para ver si toma default, o usamos output_modalities si queremos cambiarlo.
        // Vamos a comentar modalities para que no falle el update. Las tools deberían funcionar igual.
        // Si no hay texto, tal vez no pueda emitir function calls? 
        // Pero "output_modalities": ["audio"] es el default y function calling funciona con audio inputs.
        // Vamos a probar SIN este campo para asegurar que session.update pase sin error.
        
        // NOTA: Eliminamos 'voice' temporalmente porque lanza "Unknown parameter".
        // Usaremos la voz por defecto ('alloy') por ahora para asegurar conexión.
        
        instructions: this.getSystemInstructions(),
        
        // Estructura anidada 'audio' siguiendo RealtimeAudioConfig
        audio: {
          input: {
            // El formato debe ser un objeto con type 'audio/pcm' y rate 24000
            format: { 
              type: 'audio/pcm',
              rate: 24000
            },
            transcription: {
              // Usamos el modelo de transcripción optimizado para la versión Mini (whisper-1 puede tener rate limits estrictos)
              model: 'gpt-4o-mini-transcribe-2025-12-15', 
              language: 'es'
            },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
              create_response: true
            }
          },
          output: {
            // El formato de salida también debe ser objeto
            format: { 
              type: 'audio/pcm',
              rate: 24000
            },
            voice: 'sage'
          }
        },
        
        tools: this.getToolDefinitions(),
        tool_choice: 'auto',
      }
    };

    this.logger.log('📤 Enviando configuración de sesión:', JSON.stringify(sessionConfig, null, 2));
    this.sendEvent(sessionConfig);

    this.logger.log('📋 Sesión de OpenAI configurada exitosamente');
  }

  /**
   * Instrucciones del sistema para el Conserje Digital
   * Instrucciones base - el contexto específico se agrega después
   */
  private getSystemInstructions(): string {
    return 'Actúa como la interfaz de voz del sistema de control de acceso Vigilia. Espera instrucciones específicas del contexto.';
  }

  /**
   * Define las herramientas disponibles
   * Réplica exacta del frontend
   */
  private getToolDefinitions(): any[] {
    return [
      {
        type: 'function',
        name: 'guardar_datos_visitante',
        description: 'Guarda y formatea automáticamente los datos del visitante. El RUT se formatea a XX.XXX.XXX-X, el teléfono se limpia de caracteres especiales, y la patente se normaliza a mayúsculas.',
        parameters: {
          type: 'object',
          properties: {
            nombre: {
              type: 'string',
              description: 'Nombre completo del visitante tal como lo dijo'
            },
            rut: {
              type: 'string',
              description: 'RUT o pasaporte del visitante en cualquier formato (números, con/sin puntos o guión)'
            },
            telefono: {
              type: 'string',
              description: 'Teléfono del visitante en cualquier formato'
            },
            patente: {
              type: 'string',
              description: 'Patente del vehículo en cualquier formato'
            },
            motivo: {
              type: 'string',
              description: 'Motivo de la visita'
            },
            casa: {
              type: 'string',
              description: 'Número de casa/departamento de destino'
            }
          }
        }
      },
      {
        type: 'function',
        name: 'buscar_residente',
        description: 'Busca un residente por número o código de casa/departamento. Acepta múltiples formatos: números solos ("15"), con prefijos ("Casa 15"), o códigos alfanuméricos ("A-1234", "B-201"). Devuelve TODOS los residentes de la familia.',
        parameters: {
          type: 'object',
          properties: {
            casa: {
              type: 'string',
              description: 'Número, código o nombre de casa/departamento tal como lo dijo el visitante'
            }
          },
          required: ['casa']
        }
      },
      {
        type: 'function',
        name: 'notificar_residente',
        description: 'Envía una notificación push a TODOS los residentes de la familia para que aprueben o rechacen la visita',
        parameters: {
          type: 'object',
          properties: {
            residentes_ids: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Array con los IDs de TODOS los residentes a notificar (todos los miembros de la familia)'
            }
          },
          required: ['residentes_ids']
        }
      },
      {
        type: 'function',
        name: 'finalizar_llamada',
        description: 'Finaliza la llamada con el visitante. Usa esta herramienta SOLO después de despedirte completamente. NO menciones que estás finalizando la llamada, solo despídete naturalmente.',
        parameters: {
          type: 'object',
          properties: {}
        }
      }
    ];
  }

  /**
   * Método auxiliar para enviar eventos al WebSocket
   */
  private sendEvent(event: any): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.error('❌ WebSocket no está abierto, no se puede enviar evento');
      return;
    }

    const eventString = JSON.stringify(event);
    this.ws.send(eventString);
  }

  /**
   * Event handlers para WebSocket directo
   * Réplica exacta del frontend
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    // Mensaje recibido del WebSocket
    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const event = JSON.parse(data.toString());
        this.handleRealtimeEvent(event);
      } catch (error) {
        this.logger.error('❌ Error parseando mensaje de WebSocket:', error);
      }
    });

    // WebSocket cerrado
    this.ws.on('close', (code: number, reason: Buffer) => {
      this.logger.warn(`❌ Conexión a OpenAI cerrada - Código: ${code}, Razón: ${reason.toString()}`);
      this.conversationActive = false;
    });

    // Error en WebSocket
    this.ws.on('error', (error: Error) => {
      this.logger.error('❌ Error en WebSocket:', error);
    });
  }

  /**
   * Maneja eventos de la Realtime API
   */
  private handleRealtimeEvent(event: any): void {
    const { type } = event;

    // Filtrar eventos ruidosos (deltas)
    if (!type.includes('delta') && !type.includes('input_audio_buffer')) {
      this.logger.log(`📥 Evento: ${type}`, JSON.stringify(event, null, 2));
    }

    switch (type) {
      // Sesión
      case 'session.created':
        this.logger.log(`✅ Sesión creada: ${event.session?.id}`);
        break;

      case 'session.updated':
        this.logger.log('✅ Sesión actualizada correctamente');
        break;

      // Respuestas
      case 'response.created':
        this.logger.log(`🎬 Respuesta iniciada: ${event.response?.id}`);
        this.isInterrupted = false; // Nueva respuesta, resetear flag
        break;

      case 'response.done':
        this.logger.log(`✅ Respuesta completa: ${event.response?.id}`);
        this.logger.log('Detalles:', JSON.stringify(event.response, null, 2));
        break;

      case 'response.content_part.added':
        this.logger.log(`📝 Content part agregado: ${event.part?.type}`);
        break;

      case 'response.output_item.added':
        this.logger.log(`📝 Output item agregado: ${event.item?.type}`);
        break;

      case 'response.output_item.done':
        this.logger.log(`✅ Output item completado: ${event.item?.type}`);
        break;

      // Audio
      case 'response.audio.delta':
      case 'response.output_audio.delta':
        if (this.isInterrupted) {
          // Ignorar audio si el usuario interrumpió
          return;
        }
        this.logger.debug('🔊 Audio delta recibido');
        if (event.delta) {
          const audioBuffer = Buffer.from(event.delta, 'base64');
          this.audioHandlers.forEach(handler => handler(audioBuffer));
        }
        break;

      case 'response.audio.done':
      case 'response.output_audio.done':
        this.logger.log('✅ Audio completo recibido');
        this.audioDoneHandlers.forEach(handler => handler());
        break;

      // Transcripción
      case 'conversation.item.input_audio_transcription.completed':
        this.logger.log(`👤 Usuario: ${event.transcript}`);
        break;

      case 'conversation.item.input_audio_transcription.failed':
        // FIX: Concatenar error al mensaje para que el logger personalizado lo muestre
        this.logger.warn(`⚠️ Transcripción fallida: ${JSON.stringify(event.error, null, 2)}`);
        break;

      // VAD
      case 'input_audio_buffer.speech_started':
        this.logger.log('🎙️ Detectado inicio de habla del usuario');
        
        // Marcar como interrumpido para detener el flujo de audio localmente
        this.isInterrupted = true;
        
        // Notificar listeners para interrupción (barge-in) -> Mata el proceso de audio
        this.speechStartedHandlers.forEach(handler => handler());
        
        // Cancelar respuesta actual en el servidor para ahorrar tokens y ancho de banda
        this.sendEvent({ type: 'response.cancel' }); 
        break;

      case 'input_audio_buffer.speech_stopped':
        this.logger.log('🎙️ Detectado fin de habla del usuario');
        break;

      case 'input_audio_buffer.committed':
        this.logger.log('✅ Audio del usuario confirmado');
        break;

      // Tool calls
      case 'response.function_call_arguments.delta':
        // Acumular argumentos si es necesario
        break;

      case 'response.function_call_arguments.done':
        this.handleToolCall(event);
        break;

      // Errores
      case 'error':
        // Log detallado de CUALQUIER error
        this.logger.error('❌ Error de OpenAI (Detalle Completo):', JSON.stringify(event, null, 2));
        if (event.error?.code) {
             this.logger.error(`Error Code: ${event.error.code} - Message: ${event.error.message}`);
        }
        break;

      default:
        // Log de eventos no manejados (para debugging)
        if (!type.includes('delta')) {
          this.logger.debug(`📨 Evento no manejado: ${type}`);
        }
    }
  }

  /**
   * Maneja llamadas a herramientas
   */
  private async handleToolCall(event: any): Promise<void> {
    const { name, call_id, arguments: argsString } = event;
    
    let args: any;
    try {
      args = JSON.parse(argsString);
    } catch (error) {
      this.logger.error('Error parseando argumentos de tool call:', error);
      return;
    }

    this.logger.log(`🔧 Tool call: ${name}(${JSON.stringify(args)})`);

    try {
      let result: any;

      if (name === 'finalizar_llamada') {
        // Manejo local para finalizar_llamada
        this.logger.log('📞 Ejecutando tool local: finalizar_llamada');
        
        // Simular delay y desconexión
        setTimeout(() => {
          this.endConversation();
          // Opcional: desconectar completamente
          // this.disconnect(); 
        }, 4000); // 4 segundos para permitir despedida

        result = {
          finalizada: true,
          mensaje: 'OK. La llamada se cerrará automáticamente.'
        };
      } else {
        // Ejecutar tool en backend
        result = await this.websocketClient.executeTool(
          name,
          args,
          this.currentSessionId || 'unknown'
        );
      }

      // Enviar resultado de la herramienta
      this.sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id,
          output: JSON.stringify(result)
        }
      });

      // Solicitar que el modelo procese el resultado
      this.sendEvent({
        type: 'response.create'
      });

      this.logger.log(`✅ Tool ${name} completada`);
    } catch (error) {
      this.logger.error(`Error en tool ${name}:`, error);
      
      // Enviar error
      this.sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id,
          output: JSON.stringify({
            error: 'Error ejecutando herramienta',
            details: error instanceof Error ? error.message : 'Unknown error'
          })
        }
      });

      // Solicitar que el modelo procese el error
      this.sendEvent({
        type: 'response.create'
      });
    }
  }

  /**
   * Genera instrucciones detalladas para una casa específica
   * Mismo prompt que en DigitalConciergeView.tsx
   */
  private getDetailedInstructions(houseNumber: string): string {
    return `Eres Sofía, la conserje del Condominio San Lorenzo. Eres amable, cálida y conversacional. Tu trabajo es ayudar a los visitantes a ingresar al condominio de manera eficiente pero siempre con una sonrisa en la voz.

INFORMACIÓN INICIAL:
- El visitante ya marcó la casa de destino: ${houseNumber}
- YA conoces a dónde va, NO preguntes por la casa/departamento nuevamente

PERSONALIDAD:
- Habla de manera natural y amigable, como si conversaras con un vecino
- Usa expresiones chilenas cotidianas: "¿Cómo estás?", "Perfecto", "Genial", "Súper"
- Sé paciente y empática, especialmente si el visitante parece confundido
- Haz que la conversación fluya naturalmente, no como un formulario robótico

FLUJO DE CONVERSACIÓN (SIGUE ESTE ORDEN ESTRICTAMENTE):

1. SALUDO INICIAL (di esto EXACTAMENTE una sola vez):
   "¡Hola! Bienvenido al Condominio San Lorenzo. Mi nombre es Sofía y soy la conserje. Veo que deseas visitar la casa ${houseNumber}. ¿Cómo te llamas?"

2. RECOPILACIÓN DE DATOS (UNO POR UNO, en este orden):
   
   a) Nombre:
      - Espera la respuesta
      - Guarda con guardar_datos_visitante(nombre: "...")
      - Di: "Encantada [nombre]. ¿Me podrías dar tu RUT o pasaporte por favor?"
   
   b) RUT/Pasaporte:
      - Espera la respuesta
      - Guarda con guardar_datos_visitante(rut: "...")
      - Si el sistema responde con error (RUT inválido):
        * Di amablemente: "Disculpa, el RUT que escuché no parece ser válido. ¿Me lo podrías repetir por favor? Dilo dígito por dígito si es necesario."
        * Vuelve a intentar guardar el RUT
      - Si se guarda correctamente, di: "Perfecto. ¿Y un número de teléfono de contacto?"
   
   c) Teléfono:
      - Espera la respuesta
      - Guarda con guardar_datos_visitante(telefono: "...")
      - Di: "Genial. ¿Vienes en vehículo?"
   
   d) Vehículo (PREGUNTA PRIMERO):
      - Si dice SÍ: "¿Me podrías decir la patente del vehículo?"
        * Espera la respuesta
        * Guarda con guardar_datos_visitante(patente: "...")
      - Si dice NO: "Vale, sin problema."
        * NO preguntes por patente
        * NO llames a guardar_datos_visitante con el campo patente
        * Simplemente omite este dato y continúa
      - Luego di: "¿Cuál es el motivo de tu visita?"
   
   e) Motivo:
      - Espera la respuesta
      - Guarda con guardar_datos_visitante(motivo: "...")
      - Di: "Excelente, déjame buscar al residente."

3. BÚSQUEDA Y NOTIFICACIÓN:
   - Llama buscar_residente(casa: "${houseNumber}")
   - Si encuentra residentes:
     * El sistema devuelve un array "residentes" con TODOS los miembros de la familia
     * Extrae los IDs de TODOS los residentes del array
     * Llama notificar_residente(residentes_ids: ["id1", "id2", ...]) con TODOS los IDs
     * IMPORTANTE: Al llamar notificar_residente, la visita se crea AUTOMÁTICAMENTE en estado pendiente
     * Si hay múltiples residentes, di: "Perfecto, le he enviado una notificación a todos los residentes de la casa. Estoy esperando su respuesta."
     * Si hay un solo residente, di: "Perfecto, le he enviado una notificación a [nombre del residente]. Estoy esperando su respuesta."
   - Si NO encuentra:
     * Di: "Lo siento, no encuentro registrado a ningún residente en la casa ${houseNumber}. ¿Estás seguro del número?"

4. ESPERA DE RESPUESTA:
   - Después de decir que estás esperando, NO digas NADA más
   - NO menciones palabras como "silencio", "espera en silencio", etc.
   - Simplemente DETENTE y espera
   - El SISTEMA te enviará automáticamente un mensaje cuando el residente responda

5. RESPUESTA DEL RESIDENTE (cuando recibas la notificación del sistema):
   - Si APROBÓ:
     * La visita YA FUE CREADA y ahora está ACTIVA automáticamente
     * NO necesitas llamar ninguna herramienta adicional
     * Di con entusiasmo: "¡Buenas noticias [nombre]! El residente ha aprobado tu visita. Puedes ingresar al condominio. ¡Que tengas un excelente día!"
     * INMEDIATAMENTE después de este mensaje, llama finalizar_llamada()
   - Si RECHAZÓ:
     * La visita fue automáticamente marcada como RECHAZADA
     * NO necesitas llamar ninguna herramienta adicional
     * Di con empatía: "Lo lamento [nombre], pero el residente no puede recibirte en este momento. Te sugiero contactarlo directamente. Que tengas buen día."
     * INMEDIATAMENTE después de este mensaje, llama finalizar_llamada()

IMPORTANTE: Después de dar el mensaje de aprobación o rechazo, DEBES llamar a finalizar_llamada() sin decir nada más. No esperes respuesta del visitante.

REGLAS IMPORTANTES:
- NO te saltes pasos del flujo
- NO repitas preguntas que ya hiciste
- Espera la respuesta del visitante antes de continuar
- Guarda cada dato INMEDIATAMENTE después de recibirlo
- SIEMPRE incluye casa: "${houseNumber}" al guardar datos
- NO inventes respuestas del residente
- Después de notificar, espera EN SILENCIO (no digas que estás en silencio)
- Acepta datos en cualquier formato (el sistema los formatea automáticamente)`;
  }

  /**
   * Inicia una conversación con el número de casa marcado
   */
  startConversation(houseNumber: string): void {
    if (this.conversationActive) {
      this.logger.warn('Ya hay una conversación activa');
      return;
    }

    this.logger.log(`🎙️ Iniciando conversación para casa ${houseNumber}`);
    
    this.conversationActive = true;
    this.targetHouse = houseNumber;
    
    // Agregar mensaje del sistema con contexto de la casa específica
    // Según documentación: usar conversation.item.create para updates mid-stream
    this.logger.log('📤 Agregando contexto de la casa al sistema...');
    this.sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: this.getDetailedInstructions(houseNumber)
          }
        ]
      }
    });
    
    // Solicitar respuesta inicial con instrucciones específicas
    this.logger.log('📤 Solicitando respuesta inicial...');
    this.sendEvent({
      type: 'response.create',
      response: {
        instructions: `El visitante ya marcó la casa ${houseNumber}. Saluda brevemente y pregunta: ¿Cómo te llamas?`
      }
    });
  }

  /**
   * Envía audio capturado del micrófono
   */
  sendAudio(audioBuffer: Buffer): void {
    if (!this.conversationActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    // Convertir Buffer a base64
    const base64Audio = audioBuffer.toString('base64');
    
    this.sendEvent({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    });
  }

  /**
   * Finaliza conversación
   */
  endConversation(): void {
    if (!this.conversationActive) {
      return;
    }

    this.logger.log('🛑 Finalizando conversación');
    
    this.conversationActive = false;
    this.targetHouse = null;
    
    // Crear respuesta para procesar el audio pendiente
    this.sendEvent({
      type: 'response.create'
    });
  }

  /**
   * Registra un handler para audio recibido de OpenAI
   */
  onAudioReceived(handler: (audioBuffer: Buffer) => void): void {
    this.audioHandlers.push(handler);
  }

  /**
   * Registra un handler para cuando finaliza la reproducción de audio
   */
  onAudioResponseDone(handler: () => void): void {
    this.audioDoneHandlers.push(handler);
  }

  /**
   * Registra un handler para cuando el usuario empieza a hablar (interrupción)
   */
  onSpeechStarted(handler: () => void): void {
    this.speechStartedHandlers.push(handler);
  }

  /**
   * Verifica si hay conversación activa
   */
  isActive(): boolean {
    return this.conversationActive;
  }

  /**
   * Desconecta de OpenAI y notifica al backend
   */
  async disconnect(): Promise<void> {
    if (this.conversationActive) {
      this.endConversation();
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Notificar al backend que finalizó la sesión
    if (this.currentSessionId) {
      try {
        await axios.post(`${this.backendUrl}/api/v1/concierge/session/${this.currentSessionId}/end`, {
          finalStatus: 'completed',
        });
        this.logger.log(`✅ Sesión ${this.currentSessionId} finalizada en el backend`);
      } catch (error: any) {
        this.logger.error(`Error finalizando sesión en backend: ${error.message}`);
      }
      this.currentSessionId = null;
    }
    
    this.logger.log('Desconectado de OpenAI');
  }

  /**
   * Limpieza
   */
  async cleanup(): Promise<void> {
    await this.disconnect();
  }
}
