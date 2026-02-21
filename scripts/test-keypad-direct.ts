import { Gpio } from 'pigpio';

console.log('Iniciando prueba de hardware: Teclado 4x4 Directo (Sin Multiplexor)...');

// ==========================================
// MAPEO PINES GPIO DIRECTOS
// ==========================================
// Las 4 Filas (Pines 1, 2, 3, 4 del teclado)
const rowPins = [
    5,  // GPIO 5  (Pin Físico 29) -> Fila 1 (1, 2, 3, A)
    6,  // GPIO 6  (Pin Físico 31) -> Fila 2 (4, 5, 6, B)
    13, // GPIO 13 (Pin Físico 33) -> Fila 3 (7, 8, 9, C)
    19  // GPIO 19 (Pin Físico 35) -> Fila 4 (*, 0, #, D)
];

// Las 4 Columnas (Pines 5, 6, 7, 8 del teclado)
const colPins = [
    26, // GPIO 26 (Pin Físico 37) -> Col 1 (1, 4, 7, *)
    16, // GPIO 16 (Pin Físico 36) -> Col 2 (2, 5, 8, 0)
    20, // GPIO 20 (Pin Físico 38) -> Col 3 (3, 6, 9, #)
    24  // GPIO 24 (Pin Físico 18) -> Col 4 (A, B, C, D)
];

// Mapa matricial de las teclas
const keyMap = [
    ['1', '2', '3', 'A'],
    ['4', '5', '6', 'B'],
    ['7', '8', '9', 'C'],
    ['*', '0', '#', 'D']
];

// Inicializar pines
const rows: Gpio[] = [];
const cols: Gpio[] = [];

// Las filas serán ENTRADAS con la resistencia Pull-Up interna activada
rowPins.forEach(pin => {
    rows.push(new Gpio(pin, { mode: Gpio.INPUT, pullUpDown: Gpio.PUD_UP }));
});

// Las columnas serán SALIDAS, inicialmente en HIGH (3.3V)
colPins.forEach(pin => {
    const col = new Gpio(pin, { mode: Gpio.OUTPUT });
    col.digitalWrite(1); 
    cols.push(col);
});

let lastKeyPressed: string | null = null;
let lastKeyTime = 0;
const DEBOUNCE_TIME_MS = 300; 

// ==========================================
// FUNCIÓN DE ESCANEO MATRICIAL DIRECTO
// ==========================================
function scanMatrix() {
    let keyDetected = false;

    // Pasamos columna por columna tirándola a LOW (0V)
    for (let c = 0; c < cols.length; c++) {
        // Tiramos la columna actual a 0V
        cols[c].digitalWrite(0);
        
        // Micro retardo para que el voltaje se estabilice
        for (let j = 0; j < 500; j++) {}

        // Leemos cada una de las 4 filas
        for (let r = 0; r < rows.length; r++) {
            // Si la fila lee 0V, significa que el botón está cerrando
            // el circuito entre la fila actual y nuestra columna en 0V.
            if (rows[r].digitalRead() === 0) {
                const key = keyMap[r][c];
                const now = Date.now();
                
                if (key !== lastKeyPressed || (now - lastKeyTime) > DEBOUNCE_TIME_MS) {
                    console.log(`\n🛎️  ¡TECLA PRESIONADA! ---> [ ${key} ]`);
                    lastKeyPressed = key;
                    lastKeyTime = now;
                }
                keyDetected = true;
            }
        }

        // Devolvemos la columna a HIGH (3.3V) antes de revisar la siguiente
        cols[c].digitalWrite(1);
    }

    if (!keyDetected && (Date.now() - lastKeyTime) > 50) {
        lastKeyPressed = null;
    }
}

// Bucle de escaneo cada 20ms
console.log('✅ Pines GPIO configurados para matriz 4x4 directa.');
console.log('👁️  Esperando pulsaciones... (Ctrl+C para salir)');

const scanInterval = setInterval(scanMatrix, 20);

// Limpieza amable
process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo...');
    clearInterval(scanInterval);
    process.exit(0);
});
