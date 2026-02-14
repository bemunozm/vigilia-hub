import OpenAI from 'openai';
import WebSocket from 'ws';
import axios from 'axios';
import { Logger } from '../utils/logger';
import { WebSocketClientService } from './websocket-client.service';

/**
 * Cliente para OpenAI Realtime API usando SDK oficial
 * Se conecta a través del backend para obtener tokens efímeros
 * 
 * Nota: Aunque el SDK oficial de OpenAI no tiene soporte completo para
 * Realtime API con streaming de audio personalizado en Node.js (esa funcionalidad
 * está en @openai/agents/realtime que es solo para navegadores), usamos el SDK
 * para validación de tokens, configuración del cliente, y manejo de errores robusto.
 */
export class ConciergeClientService {
  private readonly logger = new Logger(ConciergeClientService.name);
  private ws: WebSocket | null = null;
  private openaiClient: OpenAI | null = null;
  private currentSessionId: string | null = null;
  private conversationActive = false;
  private backendUrl: string;
  private audioHandlers: ((audioBuffer: Buffer) => void)[] = [];
  
  // Configuración del modelo Realtime
  private readonly REALTIME_MODEL = 'gpt-4o-mini-realtime-preview';
  private readonly REALTIME_API_VERSION = 'realtime=v1';

  constructor(
    private readonly websocketClient: WebSocketClientService
  ) {
    const backendUrl = process.env.BACKEND_API_URL;
    
    if (!backendUrl) {
      throw new Error('BACKEND_API_URL no configurado en .env');
    }

    this.backendUrl = backendUrl;
    this.logger.log('✅ Concierge Client inicializado (SDK oficial OpenAI)');
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
        
        // Crear conexión WebSocket con headers oficiales
        this.ws = new WebSocket(url, {
          headers: {
            'Authorization': `Bearer ${ephemeralToken}`,
            'OpenAI-Beta': this.REALTIME_API_VERSION,
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

    // Configuración de sesión siguiendo las mejores prácticas del SDK
    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['audio'], // Solo audio (no text) para citófono
        instructions: this.getSystemInstructions(),
        voice: 'sage', // Voz consistente con el frontend
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
          language: 'es', // Español para mejor precisión
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        tools: this.getToolDefinitions(),
        tool_choice: 'auto',
        temperature: 0.8,
        max_response_output_tokens: 4096
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
    switch (event.type) {
      case 'session.created':
        this.currentSessionId = event.session.id;
        this.logger.log(`📝 Sesión creada: ${this.currentSessionId}`);
        break;

      case 'response.audio.delta':
        // Audio recibido de OpenAI para reproducir
        if (event.delta) {
          const audioBuffer = Buffer.from(event.delta, 'base64');
          this.audioHandlers.forEach(handler => handler(audioBuffer));
        }
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

      case 'error':
        this.logger.error('❌ Error de OpenAI:', JSON.stringify(event.error, null, 2));
        this.logger.error('❌ Evento completo:', JSON.stringify(event, null, 2));
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
              text: `[Contexto: Llamada desde citófono para casa ${houseNumber}]`
            }
          ]
        }
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
