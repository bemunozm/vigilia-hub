# Changelog

Todos los cambios notables de este proyecto serán documentados en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-01-15

### Added
- Implementación inicial del Vigilia Hub para Raspberry Pi 3
- Máquina de estados finitos (FSM) con 4 estados: TRANSPARENT, SCANNING_KEYPAD, AI_INTERCEPT, COOLDOWN
- Integración con OpenAI Realtime API para conversaciones de voz
- Control de hardware GPIO para lectura de teclado matricial vía multiplexor CD74HC4067
- Control de relés dual para routing de audio (GPIO 17, 27)
- Audio manager con captura a 48kHz y conversión a 24kHz para OpenAI
- Sistema de supresión de eco half-duplex con detección de RMS
- Caché local con sincronización al backend cada 5min para decisiones <50ms
- Cliente WebSocket para conexión al backend NestJS
- Sistema de logging con Winston (console + file + errors con rotación)
- Monitor de conectividad con DNS + HTTPS health checks
- Watchdog timers para seguridad (auto-desactivación después de 3min)
- Múltiples handlers de shutdown (SIGINT, SIGTERM, uncaughtException, unhandledRejection)
- Scripts de testing para relés y teclado
- Configuración de servicio systemd para inicio automático
- Documentación completa:
  - README.md con arquitectura y uso
  - INSTALLATION.md con guía paso a paso
  - ARCHITECTURE.md con diagramas Mermaid
  - QUICK_REFERENCE.md con comandos comunes
- Script de instalación automática (install.sh)

### Technical Details
- TypeScript 5.7.2
- Node.js 18+
- Dependencies:
  - @openai/realtime-api-beta ^0.4.2
  - socket.io-client ^4.8.1
  - onoff ^6.0.3 (GPIO control)
  - winston ^3.17.0 (logging)
  - axios ^1.7.9 (HTTP client)
- Audio: ALSA (arecord/aplay) + Sox (sample rate conversion)
- GPIO: BCM numbering, pull-down resistors for keypad
- Relay: Normally Open (NO) configuration
- Audio format: PCM16 mono, 48kHz → 24kHz
- Echo suppression: RMS threshold -45dB, tail 300ms

### Security
- HUB_SECRET authentication for backend
- GPIO auto-release on crash/shutdown
- Watchdog timer prevents infinite intercept
- Systemd service with NoNewPrivileges
- Local cache fallback when offline

### Known Limitations
- Half-duplex only (no simultaneous talk)
- Requires 48kHz USB audio interface
- Raspberry Pi 3 minimum (for GPIO + audio processing)
- Maximum 3min conversation (watchdog timeout)

---

## [Unreleased]

### Planned Features
- Full-duplex audio with acoustic echo cancellation (AEC)
- Support for multiple concurrent calls
- Web dashboard for monitoring
- Remote configuration updates
- Audio quality metrics (SNR, latency)
- Support for other SBC (Orange Pi, Rock Pi)
- Docker container for easy deployment
- Metrics export (Prometheus)
- Unit testing suite
- CI/CD pipeline

---

## Version History

### [1.0.0] - 2025-01-15
Initial release

---

**Note**: This project follows semantic versioning:
- MAJOR version: Incompatible API/hardware changes
- MINOR version: New features (backward compatible)
- PATCH version: Bug fixes (backward compatible)
