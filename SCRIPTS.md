# Scripts Disponibles - Vigilia Hub

Documentación completa de todos los scripts disponibles en el proyecto.

## 📋 Scripts de NPM

### Build y Ejecución

```bash
# Compilar TypeScript a JavaScript
npm run build

# Iniciar en producción (código compilado)
npm start

# Desarrollo con hot reload
npm run dev

# Producción con variable de entorno
npm run start:prod
```

### Testing

```bash
# Ejecutar todos los tests unitarios
npm test

# Tests en modo watch (reejecutar en cambios)
npm run test:watch

# Tests con reporte de coverage
npm run test:coverage

# Tests de hardware - Relés
npm run test:relays

# Tests de hardware - Teclado
npm run test:keypad
```

---

## 🛠️ Scripts de Sistema

Ubicación: `scripts/`

### Health Check

```bash
./scripts/health-check.sh
```

**Propósito:** Verifica el estado completo del sistema.

**Verificaciones:**
- ✅ Servicio systemd activo
- ✅ GPIO exportados (17, 27)
- ✅ Audio USB detectado
- ✅ Conectividad (Internet, DNS, Backend)
- ✅ Recursos (CPU temp, memoria, disco)
- ✅ Logs sin errores recientes
- ✅ Variables de entorno configuradas
- ✅ NTP sincronizado

**Salida:**
```
═══════════════════════════════════════════════
🏥 Vigilia Hub - Health Check
═══════════════════════════════════════════════
✓ Servicio vigilia-hub está activo
✓ GPIO 17 exportado
✓ Tarjeta de audio USB detectada
✓ Conectividad a Internet OK
✓ Temperatura CPU OK: 42.5°C
...
✅ Sistema completamente saludable
```

**Exit codes:**
- `0`: Sistema saludable o con warnings menores
- `1`: Sistema con errores críticos

**Uso en cron:**
```bash
# crontab -e
*/15 * * * * /opt/vigilia-hub/scripts/health-check.sh >> /var/log/vigilia-health.log 2>&1
```

---

### Backup

```bash
./scripts/backup.sh
```

**Propósito:** Crea backup completo de configuración y datos.

**Incluye:**
- Archivo `.env`
- Caché de unidades (`data/ai-units.json`)
- Logs recientes (últimos 3 días)
- Información del sistema

**Ubicación:** `/opt/vigilia-hub/backups/`

**Nombre:** `vigilia-hub-backup-YYYYMMDD_HHMMSS.tar.gz`

**Retención:** 7 días (backups más antiguos se eliminan automáticamente)

**Salida:**
```
═══════════════════════════════════════════════
💾 Vigilia Hub - Backup Automático
═══════════════════════════════════════════════
✓ Archivo .env respaldado
✓ Caché de unidades respaldado
✓ 5 archivos de log respaldados
✓ Backup creado: vigilia-hub-backup-20260212_143022.tar.gz (2.3M)
```

**Automatización:**
```bash
# Backup diario a las 3 AM
# crontab -e
0 3 * * * /opt/vigilia-hub/scripts/backup.sh
```

---

### Restore

```bash
sudo ./scripts/restore.sh
```

**Propósito:** Restaura configuración desde un backup.

**Proceso:**
1. Muestra backups disponibles
2. Usuario selecciona backup a restaurar
3. Confirma operación
4. Detiene servicio
5. Crea backup de emergencia de config actual
6. Extrae y restaura archivos
7. Reinicia servicio

**Interactivo:**
```
📂 Backups disponibles:
  [1] 12/02/2026 14:30:22 (2.3M)
  [2] 11/02/2026 03:00:15 (2.1M)
  [3] 10/02/2026 03:00:12 (2.2M)

Selecciona el número del backup a restaurar (1-3): 1
```

**Seguridad:**
- Requiere `sudo`
- Crea backup de emergencia antes de restaurar
- Confirma operación con el usuario
- Verifica estado del servicio después

---

### Monitor

```bash
./scripts/monitor.sh
```

**Propósito:** Dashboard en tiempo real del sistema.

**Actualización:** Cada 5 segundos

**Información mostrada:**
- Estado del servicio (ACTIVO/INACTIVO)
- Uptime del servicio
- Temperatura CPU
- Uso de CPU y memoria
- Uso de disco
- Estado de audio USB
- Estado de GPIO (17, 27)
- Conectividad (Internet, Backend)
- Errores recientes (últimos 5min)
- Últimas 3 líneas de log

**Interfaz:**
```
═══════════════════════════════════════════════
📊 Vigilia Hub - Monitor en Tiempo Real
═══════════════════════════════════════════════

🔧 Estado del Servicio
──────────────────────────────────────────────
Estado:        ● ACTIVO
Iniciado:      2026-02-12 08:30

💻 Recursos del Sistema
──────────────────────────────────────────────
Temperatura:   45.2°C
CPU:           12.5%
Memoria:       35.2%
Disco:         45% usado

🔌 Estado de GPIO
──────────────────────────────────────────────
GPIO 17:       LOW  (Citófono normal)
GPIO 27:       LOW  (Citófono normal)

...
Actualización cada 5s | Ctrl+C para salir
```

**Salir:** `Ctrl+C`

---

## 📝 Configuración de Cron

### Backup Automático

```bash
# Editar crontab
crontab -e

# Agregar línea (backup diario a las 3 AM)
0 3 * * * /opt/vigilia-hub/scripts/backup.sh
```

### Health Check Periódico

```bash
# Health check cada 15 minutos
*/15 * * * * /opt/vigilia-hub/scripts/health-check.sh >> /var/log/vigilia-health.log 2>&1

# Health check cada hora con alertas
0 * * * * /opt/vigilia-hub/scripts/health-check.sh || echo "Vigilia Hub health check FAILED" | mail -s "Alert" admin@example.com
```

### Limpieza de Logs

```bash
# Limpiar logs antiguos (>30 días) cada domingo a las 2 AM
0 2 * * 0 find /opt/vigilia-hub/logs -name "*.log" -mtime +30 -delete
```

---

## 🔧 Scripts de Desarrollo

### Compilación Watch

```bash
# Terminal 1: Compilar TypeScript en watch mode
npx tsc --watch

# Terminal 2: Ejecutar con nodemon
npx nodemon dist/main.js
```

### Test Watch

```bash
# Reejecutar tests en cambios
npm run test:watch

# Test específico en watch
npm run test:watch -- local-cache.service.spec.ts
```

### Lint (si configurado)

```bash
# Verificar código
npm run lint

# Auto-fix
npm run lint:fix
```

---

## 📊 Ejemplos de Uso

### Monitoreo Continuo

```bash
# Terminal 1: Monitor en tiempo real
./scripts/monitor.sh

# Terminal 2: Logs en tiempo real
sudo journalctl -u vigilia-hub -f

# Terminal 3: Tests periódicos
watch -n 60 './scripts/health-check.sh'
```

### Debugging

```bash
# Ver últimos errores
sudo journalctl -u vigilia-hub -p err -n 50

# Ver logs de una hora específica
sudo journalctl -u vigilia-hub --since "2026-02-12 14:00" --until "2026-02-12 15:00"

# Seguir logs con filtro
sudo journalctl -u vigilia-hub -f | grep ERROR
```

### Backup y Restore

```bash
# Crear backup antes de actualización
./scripts/backup.sh

# Actualizar código
git pull origin main
npm install
npm run build

# Si algo falla, restaurar
sudo ./scripts/restore.sh
```

### Performance Testing

```bash
# Test de carga del caché
npm test -- local-cache.service.spec.ts -t "Performance"

# Verificar uso de CPU durante operación
./scripts/monitor.sh
# (En otra terminal)
npm run test:keypad
```

---

## 🚨 Scripts de Emergencia

### Forzar Restart

```bash
#!/bin/bash
# emergency-restart.sh

sudo systemctl stop vigilia-hub
sleep 2

# Liberar GPIO
for pin in 17 27 5 6 13 19 26; do
  echo $pin | sudo tee /sys/class/gpio/unexport 2>/dev/null
done

sudo systemctl start vigilia-hub
```

### Verificación Completa

```bash
#!/bin/bash
# full-check.sh

echo "=== Health Check ==="
./scripts/health-check.sh

echo ""
echo "=== Test Relays ==="
npm run test:relays

echo ""
echo "=== Test Keypad ==="
npm run test:keypad

echo ""
echo "=== Unit Tests ==="
npm test
```

### Reset a Estado Conocido

```bash
#!/bin/bash
# reset-to-working-state.sh

# Detener servicio
sudo systemctl stop vigilia-hub

# Restaurar último backup bueno
sudo ./scripts/restore.sh

# Limpiar GPIO
for pin in 17 27 5 6 13 19 26; do
  echo $pin | sudo tee /sys/class/gpio/unexport 2>/dev/null
done

# Limpiar logs
rm -f /opt/vigilia-hub/logs/*.log

# Reiniciar
sudo systemctl start vigilia-hub
sudo systemctl status vigilia-hub
```

---

## 📚 Documentación Adicional

- [README.md](c:\PROYECTOS\Taller de Titulo\vigilia-hub\README.md) - Documentación principal
- [INSTALLATION.md](c:\PROYECTOS\Taller de Titulo\vigilia-hub\INSTALLATION.md) - Guía de instalación completa
- [TESTING.md](c:\PROYECTOS\Taller de Titulo\vigilia-hub\TESTING.md) - Guía de testing
- [DEPLOYMENT.md](c:\PROYECTOS\Taller de Titulo\vigilia-hub\DEPLOYMENT.md) - Configuración de producción
- [QUICK_REFERENCE.md](c:\PROYECTOS\Taller de Titulo\vigilia-hub\QUICK_REFERENCE.md) - Referencia rápida

---

**Vigilia Hub Scripts Guide v1.0.0**  
Última actualización: Febrero 2026
