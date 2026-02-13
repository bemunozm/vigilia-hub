#!/bin/bash

# Vigilia Hub - Monitor en Tiempo Real
# Muestra métricas del sistema en tiempo real

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Función para limpiar pantalla
clear_screen() {
    clear
    echo "═══════════════════════════════════════════════════════════════════"
    echo "📊 Vigilia Hub - Monitor en Tiempo Real"
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
}

# Función para obtener estado del servicio
get_service_status() {
    if systemctl is-active --quiet vigilia-hub; then
        echo -e "${GREEN}●${NC} ACTIVO"
    else
        echo -e "${RED}●${NC} INACTIVO"
    fi
}

# Función para obtener temperatura CPU
get_cpu_temp() {
    TEMP=$(vcgencmd measure_temp 2>/dev/null | cut -d'=' -f2 | cut -d"'" -f1)
    if [ -z "$TEMP" ]; then
        echo "N/A"
    else
        echo "${TEMP}°C"
    fi
}

# Función para obtener uso de CPU
get_cpu_usage() {
    top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1"%"}'
}

# Función para obtener memoria
get_memory() {
    free -m | awk 'NR==2{printf "%.1f%%", $3*100/$2 }'
}

# Función para obtener uptime del servicio
get_service_uptime() {
    systemctl show vigilia-hub --property=ActiveEnterTimestamp --value 2>/dev/null | cut -d' ' -f1-2
}

# Función para contar errores recientes
count_recent_errors() {
    journalctl -u vigilia-hub --since "5 minutes ago" -p err --no-pager 2>/dev/null | grep -c "vigilia-hub" || echo "0"
}

# Loop principal
while true; do
    clear_screen
    
    # Información del servicio
    echo -e "${BLUE}🔧 Estado del Servicio${NC}"
    echo "──────────────────────────────────────────────────────────────────"
    echo -e "Estado:        $(get_service_status)"
    
    UPTIME=$(get_service_uptime)
    if [ -n "$UPTIME" ]; then
        echo -e "Iniciado:      $UPTIME"
    fi
    
    echo ""
    
    # Recursos del sistema
    echo -e "${BLUE}💻 Recursos del Sistema${NC}"
    echo "──────────────────────────────────────────────────────────────────"
    printf "Temperatura:   %s\n" "$(get_cpu_temp)"
    printf "CPU:           %s\n" "$(get_cpu_usage)"
    printf "Memoria:       %s\n" "$(get_memory)"
    printf "Disco:         %s\n" "$(df -h / | awk 'NR==2{print $5 " usado"}')"
    echo ""
    
    # Audio
    echo -e "${BLUE}🎵 Dispositivos de Audio${NC}"
    echo "──────────────────────────────────────────────────────────────────"
    if aplay -l 2>/dev/null | grep -q "USB Audio"; then
        echo -e "${GREEN}✓${NC} USB Audio Interface detectada"
    else
        echo -e "${RED}✗${NC} USB Audio Interface NO detectada"
    fi
    echo ""
    
    # GPIO
    echo -e "${BLUE}🔌 Estado de GPIO${NC}"
    echo "──────────────────────────────────────────────────────────────────"
    for pin in 17 27; do
        if [ -d "/sys/class/gpio/gpio$pin" ]; then
            VALUE=$(cat /sys/class/gpio/gpio$pin/value 2>/dev/null || echo "?")
            if [ "$VALUE" = "1" ]; then
                echo -e "GPIO $pin:      ${YELLOW}HIGH${NC} (Relé activo)"
            else
                echo -e "GPIO $pin:      ${GREEN}LOW${NC}  (Citófono normal)"
            fi
        else
            echo -e "GPIO $pin:      No exportado"
        fi
    done
    echo ""
    
    # Conectividad
    echo -e "${BLUE}🌐 Conectividad${NC}"
    echo "──────────────────────────────────────────────────────────────────"
    
    # Internet
    if ping -c 1 -W 1 8.8.8.8 > /dev/null 2>&1; then
        echo -e "Internet:      ${GREEN}✓${NC} Conectado"
    else
        echo -e "Internet:      ${RED}✗${NC} Sin conexión"
    fi
    
    # Backend
    if [ -f "/opt/vigilia-hub/.env" ]; then
        BACKEND_URL=$(grep BACKEND_URL /opt/vigilia-hub/.env | cut -d'=' -f2 | tr -d '"' | tr -d "'")
        if [ -n "$BACKEND_URL" ]; then
            BACKEND_HOST=$(echo $BACKEND_URL | sed -e 's|^[^/]*//||' -e 's|/.*$||' -e 's|:.*$||')
            
            if ping -c 1 -W 1 "$BACKEND_HOST" > /dev/null 2>&1; then
                echo -e "Backend:       ${GREEN}✓${NC} Accesible"
            else
                echo -e "Backend:       ${RED}✗${NC} No accesible"
            fi
        fi
    fi
    echo ""
    
    # Logs recientes
    echo -e "${BLUE}📝 Actividad Reciente (últimos 5min)${NC}"
    echo "──────────────────────────────────────────────────────────────────"
    
    ERROR_COUNT=$(count_recent_errors)
    if [ "$ERROR_COUNT" = "0" ]; then
        echo -e "Errores:       ${GREEN}0${NC}"
    else
        echo -e "Errores:       ${RED}$ERROR_COUNT${NC}"
    fi
    
    # Últimas 3 líneas de log
    echo ""
    echo "Últimas líneas de log:"
    journalctl -u vigilia-hub -n 3 --no-pager --output=cat 2>/dev/null | sed 's/^/  /'
    
    echo ""
    echo "──────────────────────────────────────────────────────────────────"
    echo "Actualización cada 5s | Ctrl+C para salir | Logs: journalctl -u vigilia-hub -f"
    
    # Esperar 5 segundos
    sleep 5
done
