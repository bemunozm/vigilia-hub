# Documentación de Deployment - Vigilia Hub

## 🏗️ Arquitectura de Deployment

```
┌─────────────────────────────────────────────────────────────────┐
│                         INFRAESTRUCTURA                          │
└─────────────────────────────────────────────────────────────────┘

                Internet
                   │
                   │ HTTPS
                   ▼
          ┌────────────────┐
          │  Cloud Backend │
          │   NestJS API   │
          │  (AWS/GCP/...)  │
          └────────┬───────┘
                   │
                   │ WebSocket (Port 3000)
                   │ HTTPS REST
                   │
    ┌──────────────┴──────────────┐
    │                             │
    │  Red Local Condominio       │
    │  (192.168.1.0/24)           │
    │                             │
    ├─────────────────────────────┼──────────────────┐
    │                             │                  │
    ▼                             ▼                  ▼
┌───────────────┐      ┌──────────────────┐    [Otros Hubs]
│ Raspberry Pi 3│      │   Router WiFi    │
│  Vigilia Hub  │◄─────┤   (Gateway)      │
│  10.0.0.50    │      │   10.0.0.1       │
└───────┬───────┘      └──────────────────┘
        │
        │ GPIO
        │
        ▼
┌───────────────────┐
│  Citófono AIPHONE │
│     GT System     │
│                   │
│  - GT-DB Panel    │
│  - GT-NSB Station │
│  - GT-10K Keypad  │
│  - GT-BC Audio    │
└───────────────────┘
```

---

## 🌐 Topología de Red

### Opción 1: Conexión Directa a Internet (Recomendada)

```
Internet ─► Router ─► Switch ─┬─► Raspberry Pi 3 (WiFi/Ethernet)
                              ├─► Otros dispositivos
                              └─► Backend (Cloud/Local)
```

**Ventajas:**
- Menor latencia
- Conexión estable
- Fácil de configurar

**Configuración:**
```bash
# /etc/dhcpcd.conf
interface eth0
static ip_address=192.168.1.50/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8 8.8.4.4
```

### Opción 2: Red Aislada con Gateway

```
Internet ─► Firewall ─► Red DMZ ─► Raspberry Pi 3
                           │
                           └─► VPN Tunnel ─► Backend
```

**Ventajas:**
- Mayor seguridad
- Aislamiento de red
- Control de tráfico

**Requiere:**
- VPN (WireGuard, OpenVPN)
- Firewall rules
- Gestión de certificados

---

## 🖥️ Configuración del Backend

### Variables de Entorno Backend

```bash
# .env en backend NestJS

# Hub Configuration
HUB_SECRET=your-super-secret-shared-key-change-me
HUB_HEARTBEAT_TIMEOUT_MS=60000

# WebSocket
WEBSOCKET_CORS_ORIGIN=* # O IP específica del Hub
WEBSOCKET_PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/vigilia
```

### Firewall Rules (Backend)

```bash
# Permitir conexiones del Hub
sudo ufw allow from 192.168.1.50 to any port 3000

# O si es IP pública del backend
sudo ufw allow 3000/tcp
```

---

## 📡 Configuración de Raspberry Pi

### IP Estática (Recomendada)

```bash
# /etc/dhcpcd.conf
interface wlan0  # O eth0 para Ethernet
static ip_address=192.168.1.50/24
static routers=192.168.1.1
static domain_name_servers=8.8.8.8 1.1.1.1

# Aplicar cambios
sudo systemctl restart dhcpcd
```

### DNS

```bash
# /etc/resolv.conf
nameserver 8.8.8.8
nameserver 8.8.4.4
```

### NTP (Sincronización de tiempo)

```bash
# Verificar NTP
timedatectl status

# Si no está sincronizado
sudo systemctl enable systemd-timesyncd
sudo systemctl start systemd-timesyncd
```

---

## 🔐 Seguridad

### 1. SSH Hardening

```bash
# /etc/ssh/sshd_config
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
Port 2222  # Cambiar puerto por defecto

# Aplicar
sudo systemctl restart ssh
```

### 2. Firewall Local

```bash
# Instalar UFW
sudo apt install -y ufw

# Reglas básicas
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 2222/tcp  # SSH
sudo ufw enable

# Verificar
sudo ufw status
```

### 3. Autenticación del Backend

El Hub se autentica con el backend usando **HUB_SECRET**:

```typescript
// Backend: src/hub/hub.gateway.ts
async handleConnection(client: Socket) {
  const { hubId, secret } = client.handshake.auth;
  
  if (secret !== process.env.HUB_SECRET) {
    client.disconnect();
    throw new UnauthorizedException('Invalid hub secret');
  }
}
```

### 4. TLS/SSL

Si el backend usa HTTPS:

```bash
# .env en Hub
BACKEND_URL=https://api.vigilia.com:3000

# Verificar certificados
curl -v https://api.vigilia.com:3000/health
```

---

## 📊 Monitoreo

### Logs

```bash
# Systemd journal
sudo journalctl -u vigilia-hub -f

# Archivos locales
tail -f /opt/vigilia-hub/logs/vigilia-hub.log
tail -f /opt/vigilia-hub/logs/errors.log
```

### Metrics

```bash
# CPU y temperatura
vcgencmd measure_temp
top -b -n 1 | head -15

# Memoria
free -h

# Disco
df -h

# Network
ifconfig wlan0
ping -c 5 8.8.8.8
```

### Health Check Script

```bash
#!/bin/bash
# /usr/local/bin/vigilia-health-check.sh

set -e

# Verificar servicio
if ! systemctl is-active --quiet vigilia-hub; then
    echo "❌ Servicio no está activo"
    exit 1
fi

# Verificar GPIO
if [ ! -d /sys/class/gpio/gpio17 ]; then
    echo "⚠️ GPIO 17 no exportado"
fi

# Verificar audio
if ! aplay -l | grep -q "USB Audio"; then
    echo "❌ Tarjeta de audio no detectada"
    exit 1
fi

# Verificar conectividad
if ! ping -c 1 8.8.8.8 > /dev/null 2>&1; then
    echo "❌ Sin conectividad a Internet"
    exit 1
fi

echo "✅ Sistema OK"
exit 0
```

Ejecutar cada 5 minutos con cron:

```bash
# crontab -e
*/5 * * * * /usr/local/bin/vigilia-health-check.sh >> /var/log/vigilia-health.log 2>&1
```

---

## 🔄 Actualización y Rollback

### Estrategia de Actualización

```bash
# Script de actualización
#!/bin/bash
# /opt/vigilia-hub/update.sh

set -e

echo "🔄 Actualizando Vigilia Hub..."

# Backup de configuración
cp .env .env.backup.$(date +%Y%m%d_%H%M%S)

# Detener servicio
sudo systemctl stop vigilia-hub

# Pull cambios (si es Git)
git pull origin main

# O copiar archivos manualmente

# Reinstalar dependencias
npm install

# Recompilar
npm run build

# Reiniciar
sudo systemctl start vigilia-hub

# Verificar
sleep 3
sudo systemctl status vigilia-hub

echo "✅ Actualización completada"
```

### Rollback

```bash
# Si la actualización falla, hacer rollback
git reset --hard HEAD~1
npm install
npm run build
sudo systemctl restart vigilia-hub
```

---

## 🚀 Deployment Multi-Hub

Para condominios con múltiples entradas:

```
Backend
   │
   ├─► Hub 1 (Entrada Principal)   HUB_ID=hub-main-entrance
   ├─► Hub 2 (Entrada Estacionamiento) HUB_ID=hub-parking
   └─► Hub 3 (Entrada Peatonal)    HUB_ID=hub-pedestrian
```

### Configuración para cada Hub

```bash
# Hub 1: /opt/vigilia-hub/.env
HUB_ID=hub-main-entrance
HUB_SECRET=shared-secret-all-hubs

# Hub 2: /opt/vigilia-hub/.env
HUB_ID=hub-parking
HUB_SECRET=shared-secret-all-hubs

# Hub 3: /opt/vigilia-hub/.env
HUB_ID=hub-pedestrian
HUB_SECRET=shared-secret-all-hubs
```

---

## 🏭 Ambientes

### Development

```bash
# Local en laptop con mock GPIO
NODE_ENV=development
BACKEND_URL=http://localhost:3000
MOCK_GPIO=true
```

### Staging

```bash
# Raspberry Pi de pruebas
NODE_ENV=staging
BACKEND_URL=https://staging.vigilia.com:3000
HUB_ID=hub-staging-test
```

### Production

```bash
# Raspberry Pi en sitio cliente
NODE_ENV=production
BACKEND_URL=https://api.vigilia.com:3000
HUB_ID=hub-condominio-xyz-entrance-1
LOG_LEVEL=warn
```

---

## 📦 Backup y Disaster Recovery

### Backup Automático

```bash
#!/bin/bash
# /opt/vigilia-hub/backup.sh

BACKUP_DIR="/opt/vigilia-hub/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Backup de configuración
tar -czf "$BACKUP_DIR/config_$DATE.tar.gz" \
    /opt/vigilia-hub/.env \
    /opt/vigilia-hub/data/ai-units.json

# Mantener solo últimos 7 backups
find "$BACKUP_DIR" -name "config_*.tar.gz" -mtime +7 -delete

echo "✅ Backup completado: $BACKUP_DIR/config_$DATE.tar.gz"
```

Ejecutar diariamente:

```bash
# crontab -e
0 3 * * * /opt/vigilia-hub/backup.sh
```

### Restauración

```bash
# Restaurar desde backup
tar -xzf /opt/vigilia-hub/backups/config_20250115_030000.tar.gz -C /

# Reiniciar servicio
sudo systemctl restart vigilia-hub
```

---

## 📈 Escalabilidad

### Load Balancing (Futuro)

Para múltiples backends:

```bash
# .env
BACKEND_URL=https://lb.vigilia.com:3000
# Load balancer distribuye a backend-1, backend-2, backend-3
```

### Redis Cache (Futuro)

Para caché distribuido entre hubs:

```bash
# .env
REDIS_URL=redis://10.0.0.10:6379
CACHE_TTL_SECONDS=300
```

---

## ✅ Checklist de Deployment

- [ ] Raspberry Pi actualizado (apt upgrade)
- [ ] Node.js 18+ instalado
- [ ] Dependencias del sistema (ALSA, Sox)
- [ ] Proyecto compilado (npm run build)
- [ ] .env configurado con valores reales
- [ ] Hardware conectado y testeado
- [ ] Test de relés OK
- [ ] Test de teclado OK
- [ ] Test de audio OK
- [ ] Conectividad al backend OK
- [ ] Servicio systemd habilitado
- [ ] Servicio iniciado sin errores
- [ ] Logs sin errores críticos
- [ ] IP estática configurada
- [ ] DNS funcionando
- [ ] NTP sincronizado
- [ ] SSH hardening aplicado
- [ ] Firewall configurado
- [ ] Backup configurado
- [ ] Health check configurado
- [ ] Documentación entregada al cliente
- [ ] Test end-to-end OK

---

**Vigilia Hub v1.0.0**  
Deployment Guide - Última actualización: 2025
