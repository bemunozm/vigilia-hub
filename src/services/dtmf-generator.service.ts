import { Logger } from '../utils/logger';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Servicio para generar y enviar tonos DTMF al módulo GT del citófono
 * Genera archivo WAV temporal y reproduce con aplay
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
  private readonly SAMPLE_RATE = 48000;      // Sample rate del hardware
  private readonly AUDIO_DEVICE: string;

  constructor() {
    this.AUDIO_DEVICE = process.env.AUDIO_DEVICE || 'plughw:CARD=Headphones,DEV=0';
  }

  /**
   * Genera y envía una secuencia DTMF al módulo GT
   * @param digits String de dígitos a enviar (ej: "15")
   */
  async sendDTMFSequence(digits: string): Promise<void> {
    this.logger.log(`📞 Enviando secuencia DTMF al módulo GT: ${digits}`);

    const tmpFile = `/tmp/dtmf_${Date.now()}.raw`;

    try {
      // Generar archivo PCM completo
      const audioBuffer = this.generateDTMFFile(digits);
      fs.writeFileSync(tmpFile, audioBuffer);

      // Reproducir con aplay
      await this.playDTMFFile(tmpFile);
      
      this.logger.log(`✅ Secuencia DTMF enviada completamente`);
    } catch (error: any) {
      // Si no hay dispositivo de audio, continuar sin DTMF
      this.logger.warn(`⚠️ No se pudo enviar DTMF (sin dispositivo audio): ${error.message}`);
      this.logger.log(`ℹ️ En producción con hardware real, esta señal se enviará al módulo GT`);
    } finally {
      // Limpiar archivo temporal
      try {
        fs.unlinkSync(tmpFile);
      } catch (e) {
        // Ignorar
      }
    }
  }

  /**
   * Genera buffer PCM con toda la secuencia DTMF
   */
  private generateDTMFFile(digits: string): Buffer {
    const buffers: Buffer[] = [];

    for (const digit of digits) {
      if (!this.DTMF_FREQUENCIES[digit]) {
        this.logger.warn(`⚠️ Dígito inválido para DTMF: ${digit}`);
        continue;
      }

      // Generar tono
      buffers.push(this.generateDTMFTone(digit));
      
      // Generar silencio entre tonos
      buffers.push(this.generateSilence(this.TONE_PAUSE_MS));
    }

    return Buffer.concat(buffers);
  }

  /**
   * Genera un tono DTMF específico
   */
  private generateDTMFTone(digit: string): Buffer {
    const [freq1, freq2] = this.DTMF_FREQUENCIES[digit];
    
    const numSamples = Math.floor((this.SAMPLE_RATE * this.TONE_DURATION_MS) / 1000);
    const buffer = Buffer.alloc(numSamples * 2); // 16-bit PCM

    for (let i = 0; i < numSamples; i++) {
      const t = i / this.SAMPLE_RATE;
      
      // Combinar dos ondas sinusoidales
      const amplitude1 = Math.sin(2 * Math.PI * freq1 * t);
      const amplitude2 = Math.sin(2 * Math.PI * freq2 * t);
      const combined = (amplitude1 + amplitude2) / 2;
      
      // Convertir a 16-bit PCM con volumen alto (80%)
      const sample = Math.floor(combined * 32767 * 0.8);
      buffer.writeInt16LE(sample, i * 2);
    }

    return buffer;
  }

  /**
   * Genera silencio
   */
  private generateSilence(durationMs: number): Buffer {
    const numSamples = Math.floor((this.SAMPLE_RATE * durationMs) / 1000);
    return Buffer.alloc(numSamples * 2); // Silencio = todos ceros
  }

  /**
   * Reproduce archivo DTMF con aplay
   */
  private playDTMFFile(filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const aplay = spawn('aplay', [
        '-D', this.AUDIO_DEVICE,
        '-f', 'S16_LE',
        '-c', '1',
        '-r', this.SAMPLE_RATE.toString(),
        '-t', 'raw',
        filePath
      ]);

      aplay.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`aplay falló con código ${code}`));
        }
      });

      aplay.on('error', (error) => {
        reject(error);
      });
    });
  }
}
