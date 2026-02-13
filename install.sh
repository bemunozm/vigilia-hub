#!/bin/bash

# Vigilia Hub - Script de Instalación Automática
# Para Raspberry Pi 3 Model B con Raspberry Pi OS
# v1.0.0

set -e  # Exit on error

echo "═══════════════════════════════════════════════════════════"
echo "🏢  Vigilia Hub - Instalación Automática"
echo "═══════════════════════════════════════════════════════════"
echo ""

# Colores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funciones auxiliares
info() {
    echo -e "${GREEN}✓${NC} $1"
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

# Verificar que se ejecuta como usuario pi
if [ "$USER" != "pi" ]; then
    error "Este script debe ejecutarse como usuario 'pi'"
fi

# Verificar que estamos en Raspberry Pi
if ! grep -q "Raspberry Pi" /proc/cpuinfo; then
    warn "No se detectó Raspberry Pi, continuando de todas formas..."
fi

echo "📋 Paso 1: Actualizar sistema"
echo "──────────────────────────────────────────────────────────"
sudo apt update
sudo apt upgrade -y
info "Sistema actualizado"
echo ""

echo "📦 Paso 2: Instalar dependencias del sistema"
echo "──────────────────────────────────────────────────────────"

# ALSA tools
info "Instalando ALSA tools..."
sudo apt install -y alsa-utils

# Sox
info "Instalando Sox..."
sudo apt install -y sox

# Build tools
info "Instalando build-essential..."
sudo apt install -y build-essential python3

# Git (si no está)
info "Verificando Git..."
if ! command -v git &> /dev/null; then
    sudo apt install -y git
fi

# WiringPi (para gpio command)
info "Verificando WiringPi..."
if ! command -v gpio &> /dev/null; then
    warn "gpio command no encontrado, puedes instalarlo con: sudo apt install -y wiringpi"
fi

info "Dependencias del sistema instaladas"
echo ""

echo "📦 Paso 3: Instalar Node.js 18"
echo "──────────────────────────────────────────────────────────"

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    info "Node.js ya instalado: $NODE_VERSION"
    
    # Verificar versión
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        warn "Versión menor a 18, actualizando..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt install -y nodejs
    fi
else
    info "Instalando Node.js 18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt install -y nodejs
fi

node -v
npm -v
info "Node.js instalado correctamente"
echo ""

echo "🔐 Paso 4: Configurar permisos GPIO"
echo "──────────────────────────────────────────────────────────"

# Agregar usuario pi al grupo gpio
if groups pi | grep -q '\bgpio\b'; then
    info "Usuario pi ya está en grupo gpio"
else
    sudo usermod -a -G gpio pi
    warn "Usuario agregado al grupo gpio. Debes reiniciar la sesión o reboot para aplicar cambios."
fi

info "Permisos GPIO configurados"
echo ""

echo "🎵 Paso 5: Verificar tarjeta de audio USB"
echo "──────────────────────────────────────────────────────────"

if aplay -l | grep -q "USB Audio"; then
    info "Tarjeta de audio USB detectada"
    aplay -l | grep "USB Audio"
else
    warn "No se detectó tarjeta de audio USB. Conecta una antes de continuar."
fi
echo ""

echo "📂 Paso 6: Configurar estructura del proyecto"
echo "──────────────────────────────────────────────────────────"

# Directorio de instalación
INSTALL_DIR="/opt/vigilia-hub"

if [ -d "$INSTALL_DIR" ]; then
    warn "El directorio $INSTALL_DIR ya existe"
    read -p "¿Deseas borrarlo y continuar? (y/n): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo rm -rf "$INSTALL_DIR"
        info "Directorio eliminado"
    else
        error "Instalación cancelada por el usuario"
    fi
fi

# Crear directorio
sudo mkdir -p "$INSTALL_DIR"
sudo chown pi:pi "$INSTALL_DIR"
info "Directorio creado: $INSTALL_DIR"

# Copiar archivos del proyecto actual
echo ""
read -p "¿Los archivos del proyecto están en el directorio actual? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    info "Copiando archivos..."
    cp -r ./* "$INSTALL_DIR/"
    cd "$INSTALL_DIR"
else
    error "Por favor, ejecuta este script desde el directorio del proyecto o copia los archivos manualmente a $INSTALL_DIR"
fi

# Crear directorios de datos y logs
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$INSTALL_DIR/logs"
chmod 755 "$INSTALL_DIR/data" "$INSTALL_DIR/logs"

info "Estructura del proyecto configurada"
echo ""

echo "📦 Paso 7: Instalar dependencias de Node.js"
echo "──────────────────────────────────────────────────────────"
cd "$INSTALL_DIR"
npm install
info "Dependencias instaladas"
echo ""

echo "🔨 Paso 8: Compilar TypeScript"
echo "──────────────────────────────────────────────────────────"
npm run build
info "Proyecto compilado"
echo ""

echo "⚙️  Paso 9: Configurar variables de entorno"
echo "──────────────────────────────────────────────────────────"

if [ ! -f "$INSTALL_DIR/.env" ]; then
    if [ -f "$INSTALL_DIR/.env.example" ]; then
        cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
        info "Archivo .env creado desde .env.example"
        warn "⚠️  IMPORTANTE: Debes editar $INSTALL_DIR/.env con tus valores reales:"
        echo "   - BACKEND_URL"
        echo "   - HUB_ID"
        echo "   - HUB_SECRET"
        echo "   - OPENAI_API_KEY"
        echo ""
        read -p "¿Deseas editar .env ahora? (y/n): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            nano "$INSTALL_DIR/.env"
        fi
    else
        warn "No se encontró .env.example, debes crear .env manualmente"
    fi
else
    info "Archivo .env ya existe"
fi
echo ""

echo "🔧 Paso 10: Crear servicio systemd"
echo "──────────────────────────────────────────────────────────"

SERVICE_FILE="/etc/systemd/system/vigilia-hub.service"

sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Vigilia Hub - Sistema de Citofono Inteligente
Documentation=https://github.com/tu-usuario/vigilia-hub
After=network.target sound.target

[Service]
Type=simple
User=pi
Group=gpio
WorkingDirectory=$INSTALL_DIR
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node $INSTALL_DIR/dist/main.js
Restart=on-failure
RestartSec=10s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=vigilia-hub

# Security
NoNewPrivileges=true
PrivateTmp=true

# Límites
TimeoutStartSec=60s
TimeoutStopSec=30s

[Install]
WantedBy=multi-user.target
EOF

info "Servicio systemd creado"

# Recargar systemd
sudo systemctl daemon-reload
info "Systemd recargado"

# Habilitar servicio
sudo systemctl enable vigilia-hub
info "Servicio habilitado para inicio automático"
echo ""

echo "✅ Paso 11: Tests opcionales"
echo "──────────────────────────────────────────────────────────"

read -p "¿Deseas ejecutar test de relés? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run test:relays
fi

read -p "¿Deseas ejecutar test de teclado? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run test:keypad
fi

echo ""
echo "🚀 Paso 12: Iniciar servicio"
echo "──────────────────────────────────────────────────────────"

read -p "¿Deseas iniciar el servicio ahora? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo systemctl start vigilia-hub
    sleep 2
    sudo systemctl status vigilia-hub --no-pager
    echo ""
    info "Servicio iniciado. Ver logs con: sudo journalctl -u vigilia-hub -f"
else
    warn "Servicio NO iniciado. Puedes iniciarlo con: sudo systemctl start vigilia-hub"
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅  Instalación completada!"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📝 Próximos pasos:"
echo "   1. Editar .env con tus credenciales reales:"
echo "      nano $INSTALL_DIR/.env"
echo ""
echo "   2. Verificar conexiones de hardware:"
echo "      - GPIO17, GPIO27 → Relés"
echo "      - GPIO5,6,13,19,26 → Multiplexor"
echo "      - USB Audio Interface conectada"
echo ""
echo "   3. Ver logs en tiempo real:"
echo "      sudo journalctl -u vigilia-hub -f"
echo ""
echo "   4. Controlar el servicio:"
echo "      sudo systemctl start|stop|restart|status vigilia-hub"
echo ""
echo "   5. Leer documentación completa:"
echo "      cat $INSTALL_DIR/README.md"
echo "      cat $INSTALL_DIR/INSTALLATION.md"
echo ""
echo "🎉 ¡Vigilia Hub instalado correctamente!"
echo ""
