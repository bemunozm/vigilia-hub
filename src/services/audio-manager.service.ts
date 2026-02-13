import { spawn, ChildProcess } from 'child_process';
import { Logger } from '../utils/logger';

export class AudioManagerService {
  private readonly logger = new Logger(AudioManagerService.name);
  
  private captureProcess: ChildProcess | null = null;
  private playbackProcess: ChildProcess | null = null;
  
  private readonly SAMPLE_RATE_CAPTURE: number;
  private readonly SAMPLE_RATE_OUTPUT: number;
  private readonly CHANNELS: number;
  private readonly DEVICE_NAME: string;

  constructor() {
    this.SAMPLE_RATE_CAPTURE = parseInt(process.env.AUDIO_SAMPLE_RATE_CAPTURE || '48000', 10);
    this.SAMPLE_RATE_OUTPUT = parseInt(process.env.AUDIO_SAMPLE_RATE_OUTPUT || '24000', 10);
    this.CHANNELS = parseInt(process.env.AUDIO_CHANNELS || '1', 10);
    this.DEVICE_NAME = process.env.AUDIO_DEVICE || 'hw:1,0';

    this.logger.log(`✅ Audio Manager inicializado: ${this.DEVICE_NAME} @ ${this.SAMPLE_RATE_CAPTURE}Hz`);
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
      '-D', this.DEVICE_NAME,
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
      '-D', this.DEVICE_NAME,
      '-f', 'S16_LE',
      '-c', this.CHANNELS.toString(),
      '-r', this.SAMPLE_RATE_OUTPUT.toString(),
      '-t', 'raw',
      '--buffer-time=50000'
    ]);

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
   * Escribe datos de audio al proceso de playback
   */
  writePlayback(audioData: Buffer): void {
    if (this.playbackProcess?.stdin?.writable) {
      this.playbackProcess.stdin.write(audioData);
    }
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
