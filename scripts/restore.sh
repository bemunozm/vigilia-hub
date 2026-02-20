#!/bin/bash

# Vigilia Hub - Restore from Backup
# Restaura configuración desde un backup

set -e

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

info() {
    echo -e "${GREEN}✓${NC} $1"
}

echo "═══════════════════════════════════════════════"
echo "♻️  Vigilia Hub - Restauración desde Backup"
echo "═══════════════════════════════════════════════"
echo ""

# Verificar que se ejecuta como root
if [ "$EUID" -ne 0 ]; then
    error "Este script debe ejecutarse con sudo"
fi

BACKUP_DIR="/opt/vigilia-hub/backups"

# Verificar que existen backups
if [ ! -d "$BACKUP_DIR" ]; then
    error "Directorio de backups no existe: $BACKUP_DIR"
fi

# Listar backups disponibles
echo "📂 Backups disponibles:"
echo ""
BACKUPS=$(ls -1t "$BACKUP_DIR"/vigilia-hub-backup-*.tar.gz 2>/dev/null)

if [ -z "$BACKUPS" ]; then
    error "No se encontraron backups en $BACKUP_DIR"
fi

# Mostrar lista numerada
i=1
declare -A BACKUP_MAP
while IFS= read -r backup; do
    BASENAME=$(basename "$backup")
    SIZE=$(du -h "$backup" | cut -f1)
    DATE=$(echo "$BASENAME" | sed 's/vigilia-hub-backup-//' | sed 's/.tar.gz//')
    
    # Formatear fecha para mostrar
    YEAR=${DATE:0:4}
    MONTH=${DATE:4:2}
    DAY=${DATE:6:2}
    HOUR=${DATE:9:2}
    MIN=${DATE:11:2}
    SEC=${DATE:13:2}
    
    echo "  [$i] $DAY/$MONTH/$YEAR $HOUR:$MIN:$SEC ($SIZE)"
    BACKUP_MAP[$i]=$backup
    ((i++))
done <<< "$BACKUPS"

echo ""
read -p "Selecciona el número del backup a restaurar (1-$((i-1))): " SELECTION

# Validar selección
if ! [[ "$SELECTION" =~ ^[0-9]+$ ]] || [ "$SELECTION" -lt 1 ] || [ "$SELECTION" -ge $i ]; then
    error "Selección inválida"
fi

SELECTED_BACKUP="${BACKUP_MAP[$SELECTION]}"
info "Backup seleccionado: $(basename $SELECTED_BACKUP)"
echo ""

# Confirmación
warn "⚠️  ADVERTENCIA: Esta operación sobrescribirá la configuración actual"
read -p "¿Estás seguro de continuar? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Operación cancelada"
    exit 0
fi

echo ""
echo "🔄 Iniciando restauración..."
echo ""

# 1. Detener servicio
info "Deteniendo servicio vigilia-hub..."
systemctl stop vigilia-hub

# 2. Crear backup de respaldo de la config actual
info "Creando backup de seguridad de la configuración actual..."
EMERGENCY_BACKUP="/opt/vigilia-hub/.env.pre-restore.$(date +%Y%m%d_%H%M%S)"
if [ -f "/opt/vigilia-hub/.env" ]; then
    cp /opt/vigilia-hub/.env "$EMERGENCY_BACKUP"
    info "Backup de emergencia: $EMERGENCY_BACKUP"
fi

# 3. Extraer backup
info "Extrayendo backup..."
TEMP_DIR=$(mktemp -d)
tar -xzf "$SELECTED_BACKUP" -C "$TEMP_DIR"

# 4. Restaurar archivos
info "Restaurando archivos..."

# .env
if [ -f "$TEMP_DIR/vigilia-hub/.env" ]; then
    cp "$TEMP_DIR/vigilia-hub/.env" /opt/vigilia-hub/.env
    chown pi:pi /opt/vigilia-hub/.env
    info "Archivo .env restaurado"
fi

# Caché
if [ -f "$TEMP_DIR/vigilia-hub/data/ai-units.json" ]; then
    mkdir -p /opt/vigilia-hub/data
    cp "$TEMP_DIR/vigilia-hub/data/ai-units.json" /opt/vigilia-hub/data/ai-units.json
    chown pi:pi /opt/vigilia-hub/data/ai-units.json
    info "Caché restaurado"
fi

# Logs (opcional)
if [ -d "$TEMP_DIR/vigilia-hub/logs" ]; then
    mkdir -p /opt/vigilia-hub/logs-restored
    cp -r "$TEMP_DIR/vigilia-hub/logs"/* /opt/vigilia-hub/logs-restored/
    info "Logs restaurados en /opt/vigilia-hub/logs-restored/"
fi

# 5. Limpiar temporal
rm -rf "$TEMP_DIR"

# 6. Reiniciar servicio
info "Reiniciando servicio..."
systemctl start vigilia-hub

# Esperar un poco
sleep 3

# 7. Verificar estado
echo ""
if systemctl is-active --quiet vigilia-hub; then
    info "Servicio vigilia-hub reiniciado correctamente"
    echo ""
    systemctl status vigilia-hub --no-pager -l
else
    error "El servicio no pudo iniciarse. Ver logs con: sudo journalctl -u vigilia-hub -n 50"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "✅ Restauración completada"
echo "═══════════════════════════════════════════════"
echo ""
echo "Backup de seguridad guardado en: $EMERGENCY_BACKUP"
echo ""
echo "Verificar logs con: sudo journalctl -u vigilia-hub -f"
echo ""
