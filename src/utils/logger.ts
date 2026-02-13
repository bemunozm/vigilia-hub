import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';

// Crear directorio de logs si no existe
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Formato personalizado
const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ level, message, timestamp, stack, service }) => {
    const prefix = service ? `[${service}]` : '';
    if (stack) {
      return `${timestamp} ${level.toUpperCase()} ${prefix} ${message}\n${stack}`;
    }
    return `${timestamp} ${level.toUpperCase()} ${prefix} ${message}`;
  })
);

// Crear logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: customFormat,
  transports: [
    // Consola
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        customFormat
      ),
    }),
    // Archivo de logs generales
    new winston.transports.File({
      filename: path.join(logsDir, 'vigilia-hub.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Archivo de errores
    new winston.transports.File({
      filename: path.join(logsDir, 'errors.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

export class Logger {
  constructor(private context: string) {}

  log(message: string, ...args: any[]) {
    logger.info(message, { service: this.context, ...args });
  }

  error(message: string, error?: any) {
    if (error instanceof Error) {
      logger.error(message, { 
        service: this.context, 
        stack: error.stack,
        error: error.message 
      });
    } else {
      logger.error(message, { service: this.context, error });
    }
  }

  warn(message: string, ...args: any[]) {
    logger.warn(message, { service: this.context, ...args });
  }

  debug(message: string, ...args: any[]) {
    logger.debug(message, { service: this.context, ...args });
  }
}
