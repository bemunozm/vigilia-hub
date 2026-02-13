#!/bin/bash

# Vigilia Hub - Backup Automático
# Crea backup de configuración y datos importantes

set -e

# Configuración
BACKUP_DIR="/opt/vigilia-hub/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="vigilia-hub-backup-${DATE}.tar.gz"
RETENTION_DAYS=7

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "═══════════════════════════════════════════════"
echo "💾 Vigilia Hub - Backup Automático"
echo "═══════════════════════════════════════════════"
echo ""

# Crear directorio de backups si no existe
mkdir -p "$BACKUP_DIR"
info "Directorio de backups: $BACKUP_DIR"

# Crear directorio temporal
TEMP_DIR=$(mktemp -d)
BACKUP_TEMP="$TEMP_DIR/vigilia-hub"
mkdir -p "$BACKUP_TEMP"
info "Directorio temporal: $TEMP_DIR"

# 1. Copiar archivo .env
echo ""
echo "📋 Respaldando configuración..."
if [ -f "/opt/vigilia-hub/.env" ]; then
    cp /opt/vigilia-hub/.env "$BACKUP_TEMP/.env"
    info "Archivo .env respaldado"
else
    warn "Archivo .env no encontrado"
fi

# 2. Copiar caché de unidades
if [ -f "/opt/vigilia-hub/data/ai-units.json" ]; then
    mkdir -p "$BACKUP_TEMP/data"
    cp /opt/vigilia-hub/data/ai-units.json "$BACKUP_TEMP/data/ai-units.json"
    info "Caché de unidades respaldado"
fi

# 3. Copiar logs recientes (últimos 3 días)
echo ""
echo "📝 Respaldando logs..."
if [ -d "/opt/vigilia-hub/logs" ]; then
    mkdir -p "$BACKUP_TEMP/logs"
    
    # Copiar archivos de log modificados en los últimos 3 días
    find /opt/vigilia-hub/logs/ -name "*.log" -mtime -3 -exec cp {} "$BACKUP_TEMP/logs/" \;
    
    LOG_COUNT=$(ls -1 "$BACKUP_TEMP/logs/" 2>/dev/null | wc -l)
    info "$LOG_COUNT archivos de log respaldados"
fi

# 4. Guardar información del sistema
echo ""
echo "💻 Guardando información del sistema..."
{
    echo "═══════════════════════════════════════════════"
    echo "Vigilia Hub - System Info"
    echo "Fecha: $(date)"
    echo "═══════════════════════════════════════════════"
    echo ""
    echo "--- Versión del software ---"
    if [ -f "/opt/vigilia-hub/package.json" ]; then
        cat /opt/vigilia-hub/package.json | grep '"version"'
    fi
    echo ""
    echo "--- Sistema Operativo ---"
    uname -a
    cat /etc/os-release | grep PRETTY_NAME
    echo ""
    echo "--- Node.js ---"
    node -v
    npm -v
    echo ""
    echo "--- Audio ---"
    aplay -l
    echo ""
    echo "--- Red ---"
    ip addr show
    echo ""
    echo "--- Temperatura CPU ---"
    vcgencmd measure_temp
    echo ""
    echo "--- Memoria ---"
    free -h
    echo ""
    echo "--- Disco ---"
    df -h /
    echo ""
    echo "--- Servicio ---"
    systemctl status vigilia-hub --no-pager
} > "$BACKUP_TEMP/system-info.txt"

info "Información del sistema guardada"

# 5. Crear archivo tar.gz
echo ""
echo "📦 Comprimiendo backup..."
cd "$TEMP_DIR"
tar -czf "$BACKUP_DIR/$BACKUP_NAME" vigilia-hub/

# Verificar tamaño
BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_NAME" | cut -f1)
info "Backup creado: $BACKUP_NAME ($BACKUP_SIZE)"

# 6. Limpiar temporal
rm -rf "$TEMP_DIR"

# 7. Eliminar backups antiguos
echo ""
echo "🧹 Limpiando backups antiguos..."
DELETED_COUNT=$(find "$BACKUP_DIR" -name "vigilia-hub-backup-*.tar.gz" -mtime +$RETENTION_DAYS -delete -print | wc -l)

if [ "$DELETED_COUNT" -gt 0 ]; then
    info "$DELETED_COUNT backups antiguos eliminados (>$RETENTION_DAYS días)"
else
    info "No hay backups antiguos para eliminar"
fi

# 8. Listar backups existentes
echo ""
echo "📂 Backups disponibles:"
ls -lh "$BACKUP_DIR" | grep "vigilia-hub-backup" | awk '{print "   " $9 " (" $5 ")"}'

# Resumen
echo ""
echo "═══════════════════════════════════════════════"
echo "✅ Backup completado exitosamente"
echo "═══════════════════════════════════════════════"
echo ""
echo "Archivo: $BACKUP_DIR/$BACKUP_NAME"
echo "Tamaño: $BACKUP_SIZE"
echo ""
echo "Para restaurar:"
echo "  sudo systemctl stop vigilia-hub"
echo "  cd /opt/vigilia-hub"
echo "  tar -xzf $BACKUP_DIR/$BACKUP_NAME --strip-components=1"
echo "  sudo systemctl start vigilia-hub"
echo ""
