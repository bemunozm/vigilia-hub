#!/bin/bash

# Vigilia Hub - Health Check Monitor
# Verifica el estado del sistema y reporta problemas

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Contadores
ERRORS=0
WARNINGS=0

error() {
    echo -e "${RED}✗${NC} $1"
    ((ERRORS++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

info() {
    echo -e "${GREEN}✓${NC} $1"
}

echo "═══════════════════════════════════════════════"
echo "🏥 Vigilia Hub - Health Check"
echo "═══════════════════════════════════════════════"
echo ""

# 1. Servicio Systemd
echo "📋 Verificando servicio..."
if systemctl is-active --quiet vigilia-hub; then
    info "Servicio vigilia-hub está activo"
else
    error "Servicio vigilia-hub NO está activo"
    echo "   Iniciar con: sudo systemctl start vigilia-hub"
fi

# 2. GPIO
echo ""
echo "🔌 Verificando GPIO..."

# Verificar que GPIO 17 y 27 estén disponibles (relés)
for pin in 17 27; do
    if [ -d "/sys/class/gpio/gpio$pin" ]; then
        info "GPIO $pin exportado"
    else
        warn "GPIO $pin no exportado (puede ser normal si no está en uso)"
    fi
done

# 3. Audio
echo ""
echo "🎵 Verificando audio USB..."
if aplay -l 2>/dev/null | grep -q "USB Audio"; then
    AUDIO_DEVICE=$(aplay -l | grep "USB Audio" | head -n1)
    info "Tarjeta de audio USB detectada"
    echo "   $AUDIO_DEVICE"
else
    error "Tarjeta de audio USB NO detectada"
    echo "   Conectar USB Audio Interface y reiniciar"
fi

if arecord -l 2>/dev/null | grep -q "USB Audio"; then
    info "Captura de audio disponible"
else
    error "Captura de audio NO disponible"
fi

# 4. Conectividad
echo ""
echo "🌐 Verificando conectividad..."

# Internet
if ping -c 1 -W 2 8.8.8.8 > /dev/null 2>&1; then
    info "Conectividad a Internet OK"
else
    error "Sin conectividad a Internet"
fi

# DNS
if ping -c 1 -W 2 google.com > /dev/null 2>&1; then
    info "Resolución DNS OK"
else
    error "Problema con DNS"
fi

# Backend (si está en .env)
if [ -f "/opt/vigilia-hub/.env" ]; then
    BACKEND_URL=$(grep BACKEND_URL /opt/vigilia-hub/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
    if [ -n "$BACKEND_URL" ]; then
        # Extraer host del URL
        BACKEND_HOST=$(echo $BACKEND_URL | sed -e 's|^[^/]*//||' -e 's|/.*$||' -e 's|:.*$||')
        
        if ping -c 1 -W 2 "$BACKEND_HOST" > /dev/null 2>&1; then
            info "Backend accesible: $BACKEND_HOST"
        else
            error "Backend NO accesible: $BACKEND_HOST"
        fi
    fi
fi

# 5. Recursos del Sistema
echo ""
echo "💻 Verificando recursos..."

# CPU
CPU_TEMP=$(vcgencmd measure_temp 2>/dev/null | cut -d'=' -f2 | cut -d"'" -f1)
if [ -n "$CPU_TEMP" ]; then
    if (( $(echo "$CPU_TEMP > 80" | bc -l) )); then
        error "Temperatura CPU alta: ${CPU_TEMP}°C"
    elif (( $(echo "$CPU_TEMP > 70" | bc -l) )); then
        warn "Temperatura CPU elevada: ${CPU_TEMP}°C"
    else
        info "Temperatura CPU OK: ${CPU_TEMP}°C"
    fi
fi

# Memoria
MEM_FREE=$(free -m | awk 'NR==2{printf "%d", $7}')
if [ "$MEM_FREE" -lt 100 ]; then
    warn "Memoria baja: ${MEM_FREE}MB disponibles"
else
    info "Memoria OK: ${MEM_FREE}MB disponibles"
fi

# Disco
DISK_USAGE=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
if [ "$DISK_USAGE" -gt 90 ]; then
    error "Disco casi lleno: ${DISK_USAGE}% usado"
elif [ "$DISK_USAGE" -gt 80 ]; then
    warn "Disco con poco espacio: ${DISK_USAGE}% usado"
else
    info "Disco OK: ${DISK_USAGE}% usado"
fi

# 6. Logs
echo ""
echo "📝 Verificando logs..."

LOG_DIR="/opt/vigilia-hub/logs"
if [ -d "$LOG_DIR" ]; then
    info "Directorio de logs existe"
    
    # Verificar errores recientes (última hora)
    if [ -f "$LOG_DIR/errors.log" ]; then
        RECENT_ERRORS=$(find "$LOG_DIR/errors.log" -mmin -60 -type f)
        if [ -n "$RECENT_ERRORS" ]; then
            ERROR_COUNT=$(wc -l < "$LOG_DIR/errors.log")
            if [ "$ERROR_COUNT" -gt 0 ]; then
                warn "$ERROR_COUNT errores en la última hora"
                echo "   Ver con: tail -n 20 $LOG_DIR/errors.log"
            fi
        fi
    fi
else
    error "Directorio de logs no existe: $LOG_DIR"
fi

# 7. Archivos de configuración
echo ""
echo "⚙️ Verificando configuración..."

if [ -f "/opt/vigilia-hub/.env" ]; then
    info "Archivo .env existe"
    
    # Verificar variables críticas
    CRITICAL_VARS=("BACKEND_URL" "HUB_SECRET" "OPENAI_API_KEY")
    for var in "${CRITICAL_VARS[@]}"; do
        if grep -q "^${var}=" /opt/vigilia-hub/.env; then
            info "Variable $var configurada"
        else
            error "Variable $var NO configurada"
        fi
    done
else
    error "Archivo .env no existe"
fi

# 8. NTP (sincronización de tiempo)
echo ""
echo "🕐 Verificando sincronización de tiempo..."
if timedatectl status | grep -q "synchronized: yes"; then
    info "Reloj sincronizado"
else
    warn "Reloj NO sincronizado"
    echo "   Verificar con: timedatectl status"
fi

# Resumen
echo ""
echo "═══════════════════════════════════════════════"
echo "📊 Resumen del Health Check"
echo "═══════════════════════════════════════════════"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ Sistema completamente saludable${NC}"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠️ Sistema funcional con $WARNINGS advertencias${NC}"
    exit 0
else
    echo -e "${RED}❌ Sistema con $ERRORS errores y $WARNINGS advertencias${NC}"
    echo ""
    echo "Revisar logs con: sudo journalctl -u vigilia-hub -n 50"
    exit 1
fi
