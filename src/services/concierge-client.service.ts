import OpenAI from 'openai';
import { OpenAIRealtimeWS } from 'openai/realtime/ws';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { WebSocketClientService } from './websocket-client.service';

/**
 * Cliente para OpenAI Realtime API usando SDK oficial
 * Se conecta a través del backend para obtener tokens efímeros
 * 
 * Implementación: OpenAIRealtimeWS (SDK oficial para Node.js server-to-server)
 * Referencia: https://github.com/openai/openai-node/blob/main/realtime.md
 */
export class ConciergeClientService {
  private readonly logger = new Logger(ConciergeClientService.name);
  private realtimeSession: OpenAIRealtimeWS | null = null;
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
    this.logger.log('✅ Concierge Client inicializado (SDK oficial)');
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
      
      this.logger.log('🤖 Conectando a OpenAI Realtime API...');

      // Crear cliente OpenAI con token efímero
      const client = new OpenAI({
        apiKey: ephemeralToken,
      });

      // Crear sesión Realtime usando el SDK oficial
      this.realtimeSession = new OpenAIRealtimeWS({
        model: this.REALTIME_MODEL
      }, client);

      // Configurar event handlers
      this.setupEventHandlers();

      // Esperar a que el WebSocket esté abierto
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout esperando conexión WebSocket'));
        }, 10000);

        this.realtimeSession!.socket.on('open', () => {
          clearTimeout(timeout);
          this.logger.log('✅ Conectado a OpenAI Realtime API');
          this.configureSession();
          resolve();
        });

        this.realtimeSession!.socket.on('error', (error: Error) => {
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
   */
  private configureSession(): void {
    if (!this.realtimeSession) {
      this.logger.error('❌ No hay sesión Realtime para configurar');
      return;
    }

    // Configurar sesión usando el SDK con formato GA correcto
    const sessionConfig = {
      type: 'session.update' as const,
      session: {
        type: 'realtime' as const,
        output_modalities: ['audio'] as ('audio' | 'text')[],
        instructions: this.getSystemInstructions(),
        tools: this.getToolDefinitions(),
        tool_choice: 'auto' as const,
        audio: {
          output: {
            voice: 'sage',
          }
        }
      }
    };

    this.logger.log('📤 Enviando configuración:', JSON.stringify(sessionConfig, null, 2));
    this.realtimeSession.send(sessionConfig);

    this.logger.log('📋 Sesión de OpenAI configurada exitosamente');
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
   * Event handlers usando SDK de OpenAI
   */
  private setupEventHandlers(): void {
    if (!this.realtimeSession) return;

    // IMPORTANTE: Capturar TODOS los eventos para debugging
    this.realtimeSession.on('event', (event: any) => {
      if (!event.type.includes('delta') && !event.type.includes('input_audio_buffer')) {
        this.logger.log(`📥 Evento: ${event.type}`, JSON.stringify(event, null, 2));
      }
    });

    // Handler de errores (MUY IMPORTANTE)
    this.realtimeSession.on('error', (error: any) => {
      this.logger.error('❌ Error de OpenAI:', error);
    });

    // Sesión creada
    this.realtimeSession.on('session.created', (event: any) => {
      this.currentSessionId = event.session.id;
      this.logger.log(`📝 Sesión creada: ${this.currentSessionId}`);
    });

    // Sesión actualizada
    this.realtimeSession.on('session.updated', (event: any) => {
      this.logger.log('✅ Sesión actualizada correctamente');
      this.logger.log('Configuración:', JSON.stringify(event.session, null, 2));
    });

    // Respuesta iniciada
    this.realtimeSession.on('response.created', (event: any) => {
      this.logger.log(`🎬 Respuesta iniciada: ${event.response?.id}`);
      this.logger.log('Respuesta:', JSON.stringify(event.response, null, 2));
    });

    // Item agregado
    this.realtimeSession.on('response.content_part.added', (event: any) => {
      this.logger.log(`📝 Content part agregado: ${event.part?.type}`);
      this.logger.log('Part:', JSON.stringify(event.part, null, 2));
    });

    // Output item agregado
    this.realtimeSession.on('response.output_item.added', (event: any) => {
      this.logger.log(`📝 Output item agregado: ${event.item?.type}`);
      this.logger.log('Item:', JSON.stringify(event.item, null, 2));
    });

    // Output item completado
    this.realtimeSession.on('response.output_item.done', (event: any) => {
      this.logger.log(`✅ Output item completado: ${event.item?.type}`);
    });

    // Evento de audio delta (chunks de audio PCM)
    this.realtimeSession.on('response.output_audio.delta', (event: any) => {
      this.logger.log('🔊 Audio delta recibido');
      if (event.delta) {
        const audioBuffer = Buffer.from(event.delta, 'base64');
        this.audioHandlers.forEach(handler => handler(audioBuffer));
      }
    });

    // Audio completado
    this.realtimeSession.on('response.output_audio.done', () => {
      this.logger.log('✅ Audio completo recibido');
    });

    // Respuesta completa
    this.realtimeSession.on('response.done', (event: any) => {
      this.logger.log(`✅ Respuesta completa: ${event.response?.id}`);
      this.logger.log('Status Details:', JSON.stringify(event.response?.status_details, null, 2));
      this.logger.log('Usage:', JSON.stringify(event.response?.usage, null, 2));
    });

    // Transcripción de entrada
    this.realtimeSession.on('conversation.item.input_audio_transcription.completed', (event: any) => {
      this.logger.log(`👤 Usuario: ${event.transcript}`);
    });

    // Texto de respuesta
    this.realtimeSession.on('response.output_text.delta', (event: any) => {
      this.logger.debug(`🤖 Asistente (texto): ${event.delta}`);
    });

    // Tool calls
    this.realtimeSession.on('response.function_call_arguments.done', async (event: any) => {
      await this.handleToolCall(event);
    });

    // VAD eventos
    this.realtimeSession.on('input_audio_buffer.speech_started', () => {
      this.logger.log('🎙️ Detectado inicio de habla del usuario');
    });

    this.realtimeSession.on('input_audio_buffer.speech_stopped', () => {
      this.logger.log('🎙️ Detectado fin de habla del usuario');
    });

    // Cierre de conexión
    this.realtimeSession.socket.on('close', (code: number, reason: Buffer) => {
      this.logger.warn(`Conexión a OpenAI cerrada - Código: ${code}, Razón: ${reason.toString()}`);
      this.conversationActive = false;
    });
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

      // Enviar resultado usando el SDK
      if (this.realtimeSession) {
        this.realtimeSession.send({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id,
            output: JSON.stringify(result)
          }
        });
      }

      this.logger.log(`✅ Tool ${name} completada`);
    } catch (error) {
      this.logger.error(`Error en tool ${name}`, error);
      
      // Enviar error usando el SDK
      if (this.realtimeSession) {
        this.realtimeSession.send({
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
    
    // Enviar mensaje inicial contextual usando el SDK
    if (this.realtimeSession) {
      this.realtimeSession.send({
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
      });
      
      // Solicitar respuesta de la IA
      this.logger.log('📤 Solicitando respuesta...');
      this.realtimeSession.send({
        type: 'response.create',
        response: {
          output_modalities: ['audio'],
        }
      });
    }
  }

  /**
   * Envía audio capturado del micrófono
   */
  sendAudio(audioBuffer: Buffer): void {
    if (!this.conversationActive || !this.realtimeSession) {
      return;
    }

    // Convertir Buffer a base64
    const base64Audio = audioBuffer.toString('base64');
    
    this.realtimeSession.send({
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
    
    // Crear respuesta para procesar el audio pendiente
    if (this.realtimeSession) {
      this.realtimeSession.send({
        type: 'response.create',
        response: {
          output_modalities: ['audio'],
        }
      });
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

    if (this.realtimeSession) {
      this.realtimeSession.close();
      this.realtimeSession = null;
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
