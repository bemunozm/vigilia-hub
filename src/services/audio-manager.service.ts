import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../utils/logger';

export class AudioManagerService {
  private readonly logger = new Logger(AudioManagerService.name);
  
  private captureProcess: ChildProcess | null = null;
  private playbackProcess: ChildProcess | null = null;
  
  private readonly SAMPLE_RATE_CAPTURE: number;
  private readonly SAMPLE_RATE_OUTPUT: number;
  private readonly CHANNELS: number;
  private readonly AUDIO_DEVICE: string;  // Para reproducción (audífonos)
  private readonly CAPTURE_DEVICE: string; // Para captura (micrófono)

  constructor() {
    this.SAMPLE_RATE_CAPTURE = parseInt(process.env.SAMPLE_RATE || '48000', 10);
    this.SAMPLE_RATE_OUTPUT = parseInt(process.env.TARGET_SAMPLE_RATE || '24000', 10);
    this.CHANNELS = parseInt(process.env.AUDIO_CHANNELS || '1', 10);
    this.AUDIO_DEVICE = process.env.AUDIO_DEVICE || 'plughw:CARD=Headphones,DEV=0';
    this.CAPTURE_DEVICE = process.env.CAPTURE_DEVICE || 'plughw:CARD=Device,DEV=0';

    this.logger.log(`✅ Audio Manager inicializado:`);
    this.logger.log(`   📢 Reproducción: ${this.AUDIO_DEVICE} @ ${this.SAMPLE_RATE_CAPTURE}Hz`);
    this.logger.log(`   🎤 Captura: ${this.CAPTURE_DEVICE} @ ${this.SAMPLE_RATE_CAPTURE}Hz → ${this.SAMPLE_RATE_OUTPUT}Hz`);
  }

  /**
   * Inicia captura de audio con conversión de sample rate
   * Captura a 48kHz y baja a 24kHz para OpenAI
   */
  startCapture(onData: (audioChunk: Buffer) => void): void {
    if (this.captureProcess) {
      this.logger.warn('Captura ya activa');
      return;
    }

    this.logger.log(`🎤 Iniciando captura: ${this.SAMPLE_RATE_CAPTURE}Hz → ${this.SAMPLE_RATE_OUTPUT}Hz`);

    // arecord con downsample usando sox (alternativa a librería)
    // Captura en formato raw PCM16 mono
    this.captureProcess = spawn('arecord', [
      '-D', this.CAPTURE_DEVICE, // Usar CAPTURE_DEVICE (micrófono USB)
      '-f', 'S16_LE',
      '-c', this.CHANNELS.toString(),
      '-r', this.SAMPLE_RATE_CAPTURE.toString(),
      '-t', 'raw',
      '--buffer-time=50000', // 50ms buffer
      '--period-time=10000'  // 10ms periodo
    ]);

    // Sox para downsample 48kHz → 24kHz
    const soxProcess = spawn('sox', [
      '-t', 'raw',
      '-r', this.SAMPLE_RATE_CAPTURE.toString(),
      '-b', '16',
      '-e', 'signed-integer',
      '-c', this.CHANNELS.toString(),
      '-',  // stdin
      '-t', 'raw',
      '-r', this.SAMPLE_RATE_OUTPUT.toString(),
      '-b', '16',
      '-e', 'signed-integer',
      '-c', this.CHANNELS.toString(),
      '-'   // stdout
    ]);

    // Pipe: arecord → sox → callback
    this.captureProcess.stdout?.pipe(soxProcess.stdin);
    
    soxProcess.stdout?.on('data', (chunk: Buffer) => {
      onData(chunk);
    });

    this.captureProcess.stderr?.on('data', (data) => {
      this.logger.debug(`arecord stderr: ${data}`);
    });

    soxProcess.stderr?.on('data', (data) => {
      this.logger.debug(`sox stderr: ${data}`);
    });

    this.captureProcess.on('close', (code) => {
      this.logger.warn(`Proceso de captura cerrado con código ${code}`);
      this.captureProcess = null;
    });

    soxProcess.on('close', (code) => {
      this.logger.warn(`Proceso sox cerrado con código ${code}`);
    });
  }

  /**
   * Detiene captura de audio
   */
  stopCapture(): void {
    if (this.captureProcess) {
      this.logger.log('🛑 Deteniendo captura');
      this.captureProcess.kill('SIGTERM');
      this.captureProcess = null;
    }
  }

  /**
   * Inicia playback de audio
   * OpenAI envía 24kHz, reproducimos directo
   */
  startPlayback(): ChildProcess | null {
    if (this.playbackProcess) {
      this.logger.warn('Playback ya activo');
      return this.playbackProcess;
    }

    this.logger.log(`🔊 Iniciando playback: ${this.SAMPLE_RATE_OUTPUT}Hz`);

    // aplay reproduciendo PCM16 mono a 24kHz
    this.playbackProcess = spawn('aplay', [
      '-D', this.AUDIO_DEVICE, // Usar AUDIO_DEVICE (audífonos)
      '-f', 'S16_LE',
      '-c', this.CHANNELS.toString(),
      '-r', this.SAMPLE_RATE_OUTPUT.toString(),
      '-t', 'raw',
      '--buffer-time=50000'
    ]);

    // Manejo robusto de errores en stdin para prevenir EPIPE crashes
    this.playbackProcess.stdin?.on('error', (err: any) => {
        // Ignorar EPIPE ya que es esperado si matamos el proceso (Barge-in)
        if (err.code !== 'EPIPE') {
            this.logger.warn(`Error en stdin de playback: ${err.message}`);
        }
    });

    this.playbackProcess.stderr?.on('data', (data) => {
      this.logger.debug(`aplay stderr: ${data}`);
    });

    this.playbackProcess.on('close', (code) => {
      this.logger.warn(`Proceso de playback cerrado con código ${code}`);
      this.playbackProcess = null;
    });

    return this.playbackProcess;
  }

  /**
   * Detiene playback de audio
   */
  stopPlayback(): void {
    if (this.playbackProcess) {
      this.logger.log('🛑 Deteniendo playback');
      this.playbackProcess.kill('SIGTERM');
      this.playbackProcess = null;
    }
  }

  /**
   * Interrumpe la reproducción actual (útil para barge-in)
   * Mata el proceso actual (limpiando buffer) y reinicia uno nuevo
   */
  interruptPlayback(): void {
    if (this.playbackProcess) {
      this.logger.log('🛑 Interrumpiendo reproducción actual (Barge-in)');
      // Matar proceso forcefuly para vaciar buffer de hardware
      this.playbackProcess.kill('SIGKILL'); 
      this.playbackProcess = null;
    }
    // Reiniciar inmediatamente
    // NOTA: NO llamamos a startPlayback() aquí.
    // Dejamos que el próximo writePlayback() detecte que no hay proceso y lo inicie si es necesario, 
    // o mejor aun, dejamos que el flujo natural lo maneje.
    // Iniciar aplay sin datos causa un "pop" o delay esperando datos
    this.startPlayback(); 
  }

  /**
   * Escribe datos de audio al proceso de playback
   */
  writePlayback(audioData: Buffer): void {
    // Si no hay proceso de playback, iniciarlo on-demand
    if (!this.playbackProcess) {
       this.startPlayback();
    }

    // Verificación robusta antes de escribir
    if (!this.playbackProcess || 
        !this.playbackProcess.stdin || 
        this.playbackProcess.stdin.destroyed || 
        !this.playbackProcess.stdin.writable) {
      // Opcional: Log debug, pero evitando spam
      // this.logger.debug('Intento de escritura en stream cerrado o no válido');
      return;
    }

    try {
      this.playbackProcess.stdin.write(audioData, (error) => {
        if (error) {
          // Capturar EPIPE asíncrono y otros errores de escritura
          this.logger.debug(`Error callback escribiendo audio: ${error.message}`);
        }
      });
    } catch (error) {
      // Capturar errores síncronos
      this.logger.debug(`Excepción escribiendo audio: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  /**
   * Reproduce un chunk de audio sin mantener el proceso activo
   * Útil para tonos DTMF cortos
   */
  playChunk(audioData: Buffer): void {
    if (!this.playbackProcess) {
      // Si no hay playback activo, usar writePlayback después de iniciar
      this.logger.warn('Playback no activo, usando writePlayback requiere startPlayback previo');
      return;
    }
    this.writePlayback(audioData);
  }

  /**
   * Verifica si audio está activo
   */
  isCapturing(): boolean {
    return this.captureProcess !== null;
  }

  isPlaying(): boolean {
    return this.playbackProcess !== null;
  }

  /**
   * Limpieza
   */
  cleanup(): void {
    this.stopCapture();
    this.stopPlayback();
    this.logger.log('Audio limpiado');
  }
}
