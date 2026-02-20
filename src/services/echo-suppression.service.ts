import { Logger } from '../utils/logger';

export class EchoSuppressionService {
  private readonly logger = new Logger(EchoSuppressionService.name);
  
  private readonly RMS_THRESHOLD_DB: number;
  private readonly SUPPRESSION_TAIL_MS: number;
  private readonly HALF_DUPLEX_ENABLED: boolean;
  
  private lastSpeakerTimeMs = 0;
  private isSpeakerActive = false;

  constructor() {
    this.RMS_THRESHOLD_DB = parseFloat(process.env.RMS_THRESHOLD_DB || '-45');
    this.SUPPRESSION_TAIL_MS = parseInt(process.env.SUPPRESSION_TAIL_MS || '300', 10);
    this.HALF_DUPLEX_ENABLED = process.env.HALF_DUPLEX_ENABLED !== 'false';

    this.logger.log(`✅ Echo Suppression inicializado (Half-duplex: ${this.HALF_DUPLEX_ENABLED})`);
  }

  /**
   * Notifica que el speaker está reproduciendo audio
   */
  notifySpeakerActive(): void {
    this.isSpeakerActive = true;
    this.lastSpeakerTimeMs = Date.now();
  }

  /**
   * Notifica que el speaker dejó de reproducir
   */
  notifySpeakerInactive(): void {
    this.isSpeakerActive = false;
    this.lastSpeakerTimeMs = Date.now();
  }

  /**
   * Valida si un chunk de audio debe ser enviado o suprimido
   * @param audioBuffer Buffer con muestras PCM16
   * @returns true si debe enviarse, false si se suprime (eco detectado)
   */
  shouldSendAudio(audioBuffer: Buffer): boolean {
    if (!this.HALF_DUPLEX_ENABLED) {
      return true; // Sin supresión
    }

    // Regla 1: Si el speaker está activo, suprimir micrófono
    if (this.isSpeakerActive) {
      return false;
    }

    // Regla 2: Durante la "cola" después del speaker (300ms)
    const timeSinceSpeaker = Date.now() - this.lastSpeakerTimeMs;
    if (timeSinceSpeaker < this.SUPPRESSION_TAIL_MS) {
      return false;
    }

    // Regla 3: Verificar volumen RMS del micrófono
    const rms = this.calculateRMS(audioBuffer);
    const rmsDb = this.linearToDb(rms);

    if (rmsDb < this.RMS_THRESHOLD_DB) {
      // Volumen muy bajo, suprimir (es ruido de fondo o eco residual)
      return false;
    }

    // Audio válido del usuario
    return true;
  }

  /**
   * Calcula RMS (Root Mean Square) de un buffer PCM16
   */
  private calculateRMS(buffer: Buffer): number {
    let sumSquares = 0;
    const numSamples = buffer.length / 2; // PCM16 = 2 bytes por muestra

    for (let i = 0; i < buffer.length; i += 2) {
      const sample = buffer.readInt16LE(i);
      const normalized = sample / 32768.0; // Normalizar a [-1, 1]
      sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / numSamples);
  }

  /**
   * Convierte valor lineal a dB
   */
  private linearToDb(value: number): number {
    if (value <= 0) return -Infinity;
    return 20 * Math.log10(value);
  }

  /**
   * Obtiene tiempo desde último speaker (para debug)
   */
  getTimeSinceSpeaker(): number {
    return Date.now() - this.lastSpeakerTimeMs;
  }
}
