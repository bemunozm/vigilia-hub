import OpenAI from 'openai';
import WebSocket from 'ws';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { WebSocketClientService } from './websocket-client.service';

/**
 * Cliente para OpenAI Realtime API usando WebSocket directo
 * Se conecta a través del backend para obtener tokens efímeros
 * 
 * Implementación: WebSocket manual (método oficial para Node.js server-to-server)
 * Referencia: https://developers.openai.com/api/docs/guides/realtime-websocket
 */
export class ConciergeClientService {
  private readonly logger = new Logger(ConciergeClientService.name);
  private ws: WebSocket | null = null;
  private openaiClient: OpenAI | null = null;
  private currentSessionId: string | null = null;
  private conversationActive = false;
  private backendUrl: string;
  private audioHandlers: ((audioBuffer: Buffer) => void)[] = [];
  
  // Configuración del modelo Realtime GA
  private readonly REALTIME_MODEL = 'gpt-realtime';

  constructor(
    private readonly websocketClient: WebSocketClientService
  ) {
    const backendUrl = process.env.BACKEND_API_URL;
    
    if (!backendUrl) {
      throw new Error('BACKEND_API_URL no configurado en .env');
    }

    this.backendUrl = backendUrl;
    this.logger.log('✅ Concierge Client inicializado (WebSocket directo)');
    this.logger.log(`📡 Backend URL: ${this.backendUrl}`);
    this.logger.log(`🤖 Modelo: ${this.REALTIME_MODEL}`);
  }

  /**
   * Conecta a OpenAI Realtime API usando token efímero del backend
   */
  async connect(): Promise<void> {
    try {
      this.logger.log('🎫 Solicitando token efímero al backend...');
      
      // Obtener token efímero y sessionId del backend
      const response = await axios.post(`${this.backendUrl}/api/v1/concierge/session/start`, {
        socketId: this.websocketClient.getSocketId(),
      });

      const { sessionId, ephemeralToken } = response.data;
      this.currentSessionId = sessionId;

      this.logger.log(`✅ Token efímero obtenido. SessionId: ${sessionId}`);
      
      // Inicializar cliente de OpenAI con el token efímero
      this.openaiClient = new OpenAI({
        apiKey: ephemeralToken,
        dangerouslyAllowBrowser: false, // Asegurar que estamos en Node.js
      });
      
      this.logger.log('🤖 Conectando a OpenAI Realtime API...');

      return new Promise((resolve, reject) => {
        // Construir URL de WebSocket para Realtime API
        const url = `wss://api.openai.com/v1/realtime?model=${this.REALTIME_MODEL}`;
        
        // Crear conexión WebSocket con headers oficiales GA
        // Solo Authorization es necesario (NO OpenAI-Beta, ese era para versión beta)
        this.ws = new WebSocket(url, {
          headers: {
            'Authorization': `Bearer ${ephemeralToken}`,
          }
        });

        this.ws.on('open', () => {
          this.logger.log('✅ Conectado a OpenAI Realtime API');
          this.setupEventHandlers();
          this.configureSession();
          resolve();
        });

        this.ws.on('error', (error) => {
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
   */
  private configureSession(): void {
    if (!this.ws) {
      this.logger.error('❌ No hay conexión WebSocket para configurar');
      return;
    }

    // Configuración de sesión GA según documentación oficial
    // https://developers.openai.com/api/docs/guides/realtime-conversations#session-lifecycle-events
    const sessionConfig = {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: 'gpt-realtime',
        output_modalities: ['audio'], // Solo audio (no text) para citófono
        audio: {
          input: {
            format: {
              type: 'audio/pcm',
              rate: 24000, // 24kHz según nuestra configuración
            },
            turn_detection: {
              type: 'semantic_vad', // VAD semántico GA (sin parámetros adicionales)
            },
          },
          output: {
            format: {
              type: 'audio/pcm',
              rate: 24000, // Requerido: mismo rate que input
            },
            voice: 'sage', // Voz consistente con frontend
          },
        },
        instructions: this.getSystemInstructions(),
        tools: this.getToolDefinitions(),
        tool_choice: 'auto',
        // Nota: temperature y max_tokens se configuran por respuesta, no por sesión en GA
      }
    };

    try {
      this.ws.send(JSON.stringify(sessionConfig));
      this.logger.log('📋 Sesión de OpenAI configurada exitosamente');
    } catch (error) {
      this.logger.error('❌ Error al configurar sesión:', error);
      throw error;
    }
  }

  /**
   * Instrucciones del sistema para el Conserje Digital
   */
  private getSystemInstructions(): string {
    return `Eres el Conserje Digital de Vigilia, un sistema de seguridad residencial.

Tu rol es:
1. Atender llamadas desde el citófono de entrada del condominio
2. Identificar al visitante preguntando por su nombre y motivo de visita
3. Consultar a qué departamento/casa desea ir
4. Usar las herramientas disponibles para:
   - Buscar el número de departamento si el visitante dice "voy donde María"
   - Notificar al residente sobre la visita
   - Abrir la puerta SOLO si el residente autoriza

Comportamiento:
- Sé educado, profesional y conciso
- Si no tienes autorización, NO abras la puerta
- Si hay un problema técnico, pide al visitante que intente nuevamente o contacte al residente por otro medio
- Siempre confirma con el residente antes de abrir

Contexto técnico:
- Trabajas con audio de 24kHz mono PCM16
- Las respuestas de herramientas vienen del backend NestJS
- Eres la primera línea de seguridad del edificio`;
  }

  /**
   * Define las herramientas disponibles
   */
  private getToolDefinitions(): any[] {
    return [
      {
        type: 'function',
        name: 'searchResidentByName',
        description: 'Busca residentes por nombre cuando el visitante dice "voy donde Juan"',
        parameters: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Nombre del residente a buscar'
            }
          },
          required: ['name']
        }
      },
      {
        type: 'function',
        name: 'notifyResident',
        description: 'Notifica al residente que tiene una visita en el citófono',
        parameters: {
          type: 'object',
          properties: {
            unitId: {
              type: 'string',
              description: 'ID del departamento/casa'
            },
            visitorName: {
              type: 'string',
              description: 'Nombre del visitante'
            },
            reason: {
              type: 'string',
              description: 'Motivo de la visita'
            }
          },
          required: ['unitId', 'visitorName']
        }
      },
      {
        type: 'function',
        name: 'checkAuthorization',
        description: 'Verifica si el residente autorizó la entrada del visitante',
        parameters: {
          type: 'object',
          properties: {
            notificationId: {
              type: 'string',
              description: 'ID de la notificación enviada'
            }
          },
          required: ['notificationId']
        }
      },
      {
        type: 'function',
        name: 'openDoor',
        description: 'Abre la puerta de entrada. SOLO usar si hay autorización',
        parameters: {
          type: 'object',
          properties: {
            unitId: {
              type: 'string',
              description: 'ID del departamento que autorizó'
            },
            reason: {
              type: 'string',
              description: 'Razón de la apertura'
            }
          },
          required: ['unitId', 'reason']
        }
      }
    ];
  }

  /**
   * Event handlers de OpenAI
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const event = JSON.parse(data.toString());
        this.handleEvent(event);
      } catch (error) {
        this.logger.error('Error parseando mensaje de OpenAI', error);
      }
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      this.logger.warn(`Conexión a OpenAI cerrada - Código: ${code}, Razón: ${reason.toString()}`);
      this.conversationActive = false;
    });
  }

  /**
   * Procesa eventos de OpenAI
   */
  private async handleEvent(event: any): Promise<void> {
    // Log ALL events for debugging
    if (event.type !== 'response.audio.delta') { // No logear cada chunk de audio
      this.logger.debug(`📥 Evento recibido: ${event.type}`);
    }
    
    switch (event.type) {
      case 'session.created':
        this.currentSessionId = event.session.id;
        this.logger.log(`📝 Sesión creada: ${this.currentSessionId}`);
        break;

      case 'session.updated':
        this.logger.log('✅ Sesión actualizada correctamente');
        break;

      case 'response.created':
        this.logger.log(`🎬 Respuesta iniciada: ${event.response?.id}`);
        break;

      case 'response.output_item.added':
        this.logger.log(`📝 Item agregado: ${event.item?.type}`);
        break;

      case 'response.audio.delta':
        // Audio recibido de OpenAI para reproducir
        if (event.delta) {
          const audioBuffer = Buffer.from(event.delta, 'base64');
          this.audioHandlers.forEach(handler => handler(audioBuffer));
        }
        break;

      case 'response.audio.done':
        this.logger.log('✅ Audio completo recibido');
        break;

      case 'response.done':
        this.logger.log(`✅ Respuesta completa: ${event.response?.id}`);
        break;

      case 'conversation.item.input_audio_transcription.completed':
        this.logger.log(`👤 Usuario: ${event.transcript}`);
        break;

      case 'response.text.delta':
        this.logger.debug(`🤖 Asistente (texto): ${event.delta}`);
        break;

      case 'response.function_call_arguments.done':
        await this.handleToolCall(event);
        break;

      case 'input_audio_buffer.speech_started':
        this.logger.log('🎙️ Detectado inicio de habla del usuario');
        break;

      case 'input_audio_buffer.speech_stopped':
        this.logger.log('🎙️ Detectado fin de habla del usuario');
        break;

      case 'error':
        this.logger.error('❌ Error de OpenAI:');
        this.logger.error(`   Tipo: ${event.type}`);
        this.logger.error(`   Código: ${event.error?.code || 'N/A'}`);
        this.logger.error(`   Mensaje: ${event.error?.message || 'N/A'}`);
        this.logger.error(`   Evento completo: ${JSON.stringify(event, null, 2)}`);
        break;

      default:
        // Log other events for discovery
        if (!event.type.includes('delta')) {
          this.logger.debug(`📥 Evento no manejado: ${event.type}`);
        }
        break;
    }
  }

  /**
   * Maneja llamadas a herramientas
   */
  private async handleToolCall(event: any): Promise<void> {
    const { name, call_id, arguments: argsString } = event;
    const args = JSON.parse(argsString);

    this.logger.log(`🔧 Tool call: ${name}(${JSON.stringify(args)})`);

    try {
      const result = await this.websocketClient.executeTool(
        name,
        args,
        this.currentSessionId || 'unknown'
      );

      // Enviar resultado de vuelta a OpenAI
      if (this.ws) {
        this.ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id,
            output: JSON.stringify(result)
          }
        }));
      }

      this.logger.log(`✅ Tool ${name} completada`);
    } catch (error) {
      this.logger.error(`Error en tool ${name}`, error);
      
      // Enviar error a OpenAI
      if (this.ws) {
        this.ws.send(JSON.stringify({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id,
            output: JSON.stringify({
              error: 'Error ejecutando herramienta',
              details: error instanceof Error ? error.message : 'Unknown error'
            })
          }
        }));
      }
    }
  }

  /**
   * Inicia una conversación
   */
  startConversation(houseNumber: string): void {
    if (this.conversationActive) {
      this.logger.warn('Ya hay una conversación activa');
      return;
    }

    this.logger.log(`🎙️ Iniciando conversación para casa ${houseNumber}`);
    
    this.conversationActive = true;
    
    // Enviar mensaje inicial contextual
    if (this.ws) {
      this.ws.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: `[Contexto: Llamada desde citófono para casa ${houseNumber}. Saluda al visitante y pregunta su nombre y motivo de visita.]`
            }
          ]
        }
      }));
      
      // Solicitar que la IA responda (inicie la conversación)
      // Esto hace que la IA hable primero con un saludo
      this.ws.send(JSON.stringify({
        type: 'response.create'
      }));
    }
  }

  /**
   * Envía audio capturado del micrófono
   */
  sendAudio(audioBuffer: Buffer): void {
    if (!this.conversationActive || !this.ws) {
      return;
    }

    // Convertir Buffer a base64
    const base64Audio = audioBuffer.toString('base64');
    
    this.ws.send(JSON.stringify({
      type: 'input_audio_buffer.append',
      audio: base64Audio
    }));
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
    
    // Crear respuesta para procesar el audio pendiente
    if (this.ws) {
      this.ws.send(JSON.stringify({
        type: 'response.create'
      }));
    }
  }

  /**
   * Registra un handler para audio recibido de OpenAI
   */
  onAudioReceived(handler: (audioBuffer: Buffer) => void): void {
    this.audioHandlers.push(handler);
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
