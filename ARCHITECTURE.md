# Arquitectura del Sistema Vigilia Hub

## Diagrama de Secuencia - Flujo Completo

```mermaid
sequenceDiagram
    participant U as Usuario/Visitante
    participant C as Citófono AIPHONE
    participant K as Teclado Matricial
    participant H as Vigilia Hub (RPi3)
    participant O as OpenAI Realtime
    participant B as Backend NestJS

    Note over H: Estado: TRANSPARENT

    U->>C: Presiona botón de llamada
    C->>K: Muestra panel numérico
    U->>K: Marca "101#"
    K->>H: GPIO detecta marcación
    
    Note over H: Estado: SCANNING_KEYPAD
    H->>H: Buffer = "101"
    
    Note over H: PASO CRÍTICO: Interrumpe señal PRIMERO
    H->>H: Activa relés GPIO 17, 27 (evita latencia)
    Note over C: Audio interceptado ANTES de decidir
    H->>H: Consulta caché local (<50ms)
    
    alt Casa 101 tiene IA habilitada
        Note over H: Estado: AI_INTERCEPT (continúa)
        Note over C: Audio ruteado a RPi
        H->>H: Espera 200ms (settling time)
        H->>O: Conecta WebSocket Realtime
        H->>O: startConversation("101")
        
        O->>U: "Hola, soy el conserje digital..."
        U->>C: "Vengo a ver a María"
        C->>H: Audio capturado 48kHz
        H->>H: Echo suppression check
        H->>H: Downsample 48kHz → 24kHz
        H->>O: Audio PCM16 base64
        
        O->>O: Transcripción + LLM
        O->>H: Tool call: searchResidentByName("María")
        H->>B: POST /digital-concierge/tools/execute
        B-->>H: {unitId: "uuid", name: "María Pérez"}
        H->>O: Tool result
        
        O->>U: "¿Vienes a ver a María Pérez del 101?"
        U->>C: "Sí, exacto"
        
        O->>H: Tool call: notifyResident(unitId, "Visitante")
        H->>B: POST /digital-concierge/tools/execute
        B->>B: Push notification al residente
        B-->>H: {notificationId: "xyz"}
        H->>O: Tool result
        
        O->>U: "He notificado a María, espera un momento..."
        
        loop Polling cada 2s
            O->>H: Tool call: checkAuthorization(notificationId)
            H->>B: POST /digital-concierge/tools/execute
            B-->>H: {authorized: false}
        end
        
        Note over B: Residente autoriza desde app
        
        O->>H: Tool call: checkAuthorization(notificationId)
        H->>B: POST /digital-concierge/tools/execute
        B-->>H: {authorized: true}
        H->>O: Tool result
        
        O->>H: Tool call: openDoor(unitId, "Visita autorizada")
        H->>B: POST /digital-concierge/tools/execute
        B->>B: Activa cerradura electrónica
        B-->>H: {success: true}
        H->>O: Tool result
        
        O->>U: "Puedes pasar, bienvenido"
        O->>H: Conversation end
        
        H->>H: Desactiva relés
        Note over C: Audio vuelve a normal
        Note over H: Estado: COOLDOWN (3s)
        Note over H: Estado: TRANSPARENT
        
    else Casa 101 NO tiene IA
        H->>H: Desactiva relés inmediatamente
        Note over H: Estado: TRANSPARENT
        Note over C: Audio vuelve a citófono normal
        Note right of H: Total interrupción: ~50-100ms
    end
```

## Diagrama de Componentes

```mermaid
graph TB
    subgraph "Citófono AIPHONE GT"
        GT[GT-DB Panel]
        GTN[GT-NSB Estación]
        GTK[GT-10K Teclado]
        GTA[GT-BC Audio]
    end

    subgraph "Raspberry Pi 3 - Vigilia Hub"
        subgraph "GPIO Layer"
            MUX[CD74HC4067 Multiplexor]
            REL[Relés Dual]
            USB[USB Audio Interface]
        end

        subgraph "Hardware Services"
            GPIOC[GPIO Controller]
            RELC[Relay Controller]
            AUDIO[Audio Manager]
            ECHO[Echo Suppression]
        end

        subgraph "Communication Services"
            WSC[WebSocket Client]
            CONC[Concierge Client]
            CONN[Connectivity Monitor]
        end

        subgraph "Core Services"
            CACHE[Local Cache]
            ROUTER[Audio Router FSM]
            LOG[Logger]
        end
    end

    subgraph "External Services"
        OPENAI[OpenAI Realtime API]
        BACKEND[Backend NestJS]
    end

    GTK -->|12 teclas| MUX
    MUX -->|GPIO 5,6,13,19,26| GPIOC

    GTA -->|Audio| REL
    REL -->|GPIO 17,27| RELC
    REL -->|Audio| USB
    USB --> AUDIO

    GPIOC --> ROUTER
    RELC --> ROUTER
    AUDIO --> ROUTER
    ECHO --> ROUTER
    CACHE --> ROUTER

    ROUTER --> CONC
    ROUTER --> WSC

    CONC -->|WebSocket Audio| OPENAI
    WSC -->|WebSocket Events| BACKEND
    WSC -->|HTTPS Tools| BACKEND

    CONN --> WSC
    CONN --> CACHE

    LOG --> ROUTER
    LOG --> GPIOC
    LOG --> RELC
```

## Diagrama de Estados (FSM)

```mermaid
stateDiagram-v2
    [*] --> TRANSPARENT
    
    TRANSPARENT --> SCANNING_KEYPAD : Tecla presionada
    
    SCANNING_KEYPAD --> SCANNING_KEYPAD : Más dígitos
    SCANNING_KEYPAD --> AI_INTERCEPT : # presionado + IA habilitada
    SCANNING_KEYPAD --> TRANSPARENT : # presionado + IA deshabilitada
    SCANNING_KEYPAD --> TRANSPARENT : * presionado (cancelar)
    SCANNING_KEYPAD --> TRANSPARENT : Timeout 5s sin #
    
    AI_INTERCEPT --> COOLDOWN : Conversación terminada
    AI_INTERCEPT --> COOLDOWN : Timeout 3min
    AI_INTERCEPT --> COOLDOWN : Error
    
    COOLDOWN --> TRANSPARENT : Timeout 3s
    
    note right of TRANSPARENT
        Relés: OFF
        Audio: Citófono normal
        Scan: Activo (100ms)
    end note
    
    note right of SCANNING_KEYPAD
        Relés: OFF
        Buffer: Acumulando dígitos
        Timeout: 5s
    end note
    
    note right of AI_INTERCEPT
        Relés: ON (GPIO 17, 27)
        Audio: 48kHz → 24kHz
        OpenAI: Conectado
        Watchdog: 3min
    end note
    
    note right of COOLDOWN
        Relés: OFF
        Audio: Limpiado
        Espera: 3s
    end note
```

## Flujo de Audio

```mermaid
graph LR
    subgraph "Captura (Micrófono → OpenAI)"
        MIC[Micrófono citófono]
        RELAY1[Relé 1]
        USB1[USB Audio IN]
        AREC[arecord 48kHz]
        SOX[sox downsample]
        ECHO1[Echo Suppression]
        BASE64[Base64 encode]
        WS1[WebSocket]
    end

    subgraph "Reproducción (OpenAI → Bocina)"
        WS2[WebSocket]
        DECODE[Base64 decode]
        ECHO2[Echo notifier]
        APLAY[aplay 24kHz]
        USB2[USB Audio OUT]
        RELAY2[Relé 2]
        SPK[Bocina citófono]
    end

    MIC -->|Analog| RELAY1
    RELAY1 -->|ON: RPi| USB1
    USB1 -->|48kHz PCM16| AREC
    AREC -->|Raw| SOX
    SOX -->|24kHz PCM16| ECHO1
    ECHO1 -->|RMS > -45dB| BASE64
    BASE64 -->|Chunks| WS1
    WS1 -->|TLS| OPENAI[OpenAI API]

    OPENAI -->|TLS| WS2
    WS2 -->|Delta chunks| DECODE
    DECODE -->|24kHz PCM16| ECHO2
    ECHO2 -->|Notify active| APLAY
    APLAY -->|Raw| USB2
    USB2 -->|Analog| RELAY2
    RELAY2 -->|ON: RPi| SPK
```

## Arquitectura de Caché

```mermaid
graph TB
    subgraph "Decisión de Intercepción"
        KEY[Keypad: "101#"]
        DEC{Casa 101<br/>tiene IA?}
        CACHE[(Local Cache<br/>Map<string, bool>)]
        
        KEY --> DEC
        DEC -->|Consulta <50ms| CACHE
        CACHE -->|SÍ| AI[AI_INTERCEPT]
        CACHE -->|NO| TRANS[TRANSPARENT]
    end

    subgraph "Sincronización Backend"
        BACKEND[Backend NestJS]
        ENDPOINT[GET /units/ai-enabled]
        SYNC[Sync cada 5min]
        
        SYNC -->|HTTP + X-Hub-Secret| ENDPOINT
        ENDPOINT -->|JSON Array| BACKEND
        BACKEND -->|{houseNumber, hasAI}[]| CACHE
    end

    subgraph "Persistencia Local"
        DISK[(data/ai-units.json)]
        CACHE <-->|Load/Save| DISK
    end

    CACHE -.->|Sin red:<br/>Usa caché local| DEC
    BACKEND -.->|Conectividad OK| CACHE
```

## Stack Tecnológico

```mermaid
mindmap
  root((Vigilia Hub))
    Hardware
      Raspberry Pi 3 Model B
      USB Audio Interface
      Dual Relay Module
      CD74HC4067 Multiplexer
    Software
      Node.js 18+
      TypeScript
      ALSA arecord/aplay
      Sox
    GPIO
      onoff 6.0.3
      BCM pins 5,6,13,19,26
      BCM pins 17,27 for relays
    Audio
      48kHz capture native
      24kHz for OpenAI
      PCM16 mono
      Half-duplex echo cancellation
    AI
      OpenAI Realtime API
      @openai/realtime-api-beta
      WebSocket connection
      Server VAD
    Backend
      Socket.io client
      WebSocket /hub namespace
      HTTPS tools execution
      Local cache sync
    Logging
      Winston
      File rotation 5MB
      Console + file + errors
```

---

Generados con Mermaid.js para Vigilia Hub v1.0.0
