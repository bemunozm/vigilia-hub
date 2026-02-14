import { Logger } from '../utils/logger';
import { AudioManagerService } from './audio-manager.service';

/**
 * Servicio para generar y enviar tonos DTMF al módulo GT del citófono
 * Cuando interceptamos la señal, debemos reenviarla al GT para completar la llamada
 */
export class DTMFGeneratorService {
  private readonly logger = new Logger(DTMFGeneratorService.name);
  
  // Frecuencias DTMF estándar (Hz)
  private readonly DTMF_FREQUENCIES: { [key: string]: [number, number] } = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
  };

  private readonly TONE_DURATION_MS = 100;  // Duración de cada tono
  private readonly TONE_PAUSE_MS = 50;       // Pausa entre tonos

  constructor(private audioManager: AudioManagerService) {}

  /**
   * Genera y envía una secuencia DTMF al módulo GT
   * @param digits String de dígitos a enviar (ej: "15")
   */
  async sendDTMFSequence(digits: string): Promise<void> {
    this.logger.log(`📞 Enviando secuencia DTMF al módulo GT: ${digits}`);

    for (const digit of digits) {
      if (!this.DTMF_FREQUENCIES[digit]) {
        this.logger.warn(`⚠️ Dígito inválido para DTMF: ${digit}`);
        continue;
      }

      await this.generateDTMFTone(digit);
      await this.sleep(this.TONE_PAUSE_MS);
    }

    this.logger.log(`✅ Secuencia DTMF enviada completamente`);
  }

  /**
   * Genera un tono DTMF específico
   */
  private async generateDTMFTone(digit: string): Promise<void> {
    const [freq1, freq2] = this.DTMF_FREQUENCIES[digit];
    
    // Generar buffer con dos frecuencias combinadas
    const sampleRate = 48000; // Debe coincidir con AudioManager
    const numSamples = Math.floor((sampleRate * this.TONE_DURATION_MS) / 1000);
    const buffer = Buffer.alloc(numSamples * 2); // 16-bit PCM

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      
      // Combinar dos ondas sinusoidales
      const amplitude1 = Math.sin(2 * Math.PI * freq1 * t);
      const amplitude2 = Math.sin(2 * Math.PI * freq2 * t);
      const combined = (amplitude1 + amplitude2) / 2;
      
      // Convertir a 16-bit PCM
      const sample = Math.floor(combined * 32767 * 0.5); // 50% volumen
      buffer.writeInt16LE(sample, i * 2);
    }

    // Enviar a la línea de audio del citófono (speaker)
    this.audioManager.playChunk(buffer);
    
    await this.sleep(this.TONE_DURATION_MS);
  }

  /**
   * Helper para delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
