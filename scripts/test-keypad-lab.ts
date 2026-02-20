import { Gpio } from 'pigpio';

console.log('Iniciando prueba de hardware: Multiplexor CD74HC4067 y Teclado 4x4...');

// ==========================================
// CONFIGURACIÓN DE PINES (Basado en PIN_MAPPING.md)
// ==========================================

// Pines de Control del MUX (Salidas)
const S0_PIN = 5;  // Pin Físico 29
const S1_PIN = 6;  // Pin Físico 31
const S2_PIN = 13; // Pin Físico 33
const S3_PIN = 19; // Pin Físico 35

// Pin de Señal del MUX (Entrada) - ⚠️ CRÍTICO: Usar PULL_UP interno
const SIG_PIN = 26; // Pin Físico 37

// Inicialización de Pines
const s0 = new Gpio(S0_PIN, { mode: Gpio.OUTPUT });
const s1 = new Gpio(S1_PIN, { mode: Gpio.OUTPUT });
const s2 = new Gpio(S2_PIN, { mode: Gpio.OUTPUT });
const s3 = new Gpio(S3_PIN, { mode: Gpio.OUTPUT });

// 🎉 AQUÍ OCURRE LA MAGIA: Le pedimos a la placa que active
// su resistencia Pull-Up interna de 50kΩ hacia 3.3V
const sig = new Gpio(SIG_PIN, { 
    mode: Gpio.INPUT,
    pullUpDown: Gpio.PUD_UP 
});

// ==========================================
// MAPEO LÓGICO DE TECLAS (De tu documentación)
// ==========================================
// Recordando que cableaste:
// Fila 1 -> C0, C1, C2, C3   (Teclas 1, 2, 3, A)
// Fila 2 -> C4, C5, C6, C7   (Teclas 4, 5, 6, B)
// Fila 3 -> C8, C9, C10, C11 (Teclas 7, 8, 9, C)
// Fila 4 -> C12, C13, C14, C15 (Teclas *, 0, #, D)

const keyMap: { [channel: number]: string } = {
    0: '1', 1: '2', 2: '3', 3: 'A',
    4: '4', 5: '5', 6: '6', 7: 'B',
    8: '7', 9: '8', 10: '9', 11: 'C',
    12: '*', 13: '0', 14: '#', 15: 'D'
};

// Guarda la última tecla para no flashear la consola con la misma tecla miles de veces
let lastKeyPressed: string | null = null;
let lastKeyTime = 0;
const DEBOUNCE_TIME_MS = 300; // Evitar lecturas múltiples muy rápido ("rebotes")

// ==========================================
// FUNCIONES DE CONTROL
// ==========================================

// Le dice al MUX por cuál de las 16 puertas queremos mirar
function selectMuxChannel(channel: number) {
    // Convertimos el número del canal (0-15) a binario de 4 bits (0000 a 1111)
    s0.digitalWrite(channel & 0x01);
    s1.digitalWrite((channel >> 1) & 0x01);
    s2.digitalWrite((channel >> 2) & 0x01);
    s3.digitalWrite((channel >> 3) & 0x01);
}

// Función principal de escaneo
function scanMatrix() {
    let keyDetected = false;

    // Escaneamos las 16 puertas rápidamente
    for (let channel = 0; channel < 16; channel++) {
        selectMuxChannel(channel);
        
        // El MUX necesita unos microsegundos para estabilizarse físicamente al cambiar de puerta
        // pigpio es tan rápido leyendo que puede leer basura si no esperamos
        // Esto es un "micro-retraso" hack
        for(let j = 0; j < 1000; j++) {}

        // Leer el pin de señal
        const signalValue = sig.digitalRead();

        // 🧠 LÓGICA DE DETECCIÓN
        // Como activamos el Pull-Up, el pin siempre lee 1 (3.3V)
        // Pero cuando tú presionas una tecla, la señal se escapa hacia la tierra (GND) que
        // conectaste en las columnas, haciendo que el pin lea 0 (0V).
        if (signalValue === 0) {
            const key = keyMap[channel];
            const now = Date.now();
            
            // Si es una tecla nueva, o pasó suficiente tiempo (Debouncer)
            if (key !== lastKeyPressed || (now - lastKeyTime) > DEBOUNCE_TIME_MS) {
                console.log(`\n🛎️  ¡TECLA PRESIONADA! ---> [ ${key} ] (Detectada en canal C${channel})`);
                lastKeyPressed = key;
                lastKeyTime = now;
            }
            keyDetected = true;
            break; // Si encontramos una tecla, no necesitamos buscar más en este ciclo
        }
    }

    // Si nadie está presionando nada, limpiamos nuestra memoria
    if (!keyDetected && (Date.now() - lastKeyTime) > 50) {
        lastKeyPressed = null;
    }
}

// ==========================================
// BUCLE PRINCIPAL DE EJECUCIÓN
// ==========================================

console.log('✅ Hardware inicializado y Resistencia Pull-Up interna activada.');
console.log('👁️  Escaneando matriz... (Presiona Ctrl+C para salir)');
console.log('----------------------------------------------------');

// Escanear el teclado sin parar cada 10 milisegundos
const scanInterval = setInterval(scanMatrix, 10);

// Limpieza amable al presionar Ctrl+C
process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo el escáner...');
    clearInterval(scanInterval);
    process.exit(0);
});
