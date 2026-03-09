/* ══════════════════════════════════════════════════════════
   学中文  —  Ejercicio de Conversación con IA
   ══════════════════════════════════════════════════════════ */

const conv = {
    messages: [],           // {role, content} para OpenAI
    chatHistory: [],        // mensajes renderizados en UI
    isRecording: false,
    mediaRecorder: null,
    audioChunks: [],
    recordingStartTime: 0,
    isProcessing: false,
    initialized: false,
    ttsCache: {},           // text → blob URL  (caché de audio TTS)
};

const MIN_RECORDING_MS = 800; // duración mínima de grabación

// ── DOM refs ──
const convDom = {
    messages:       document.getElementById("conv-messages"),
    startContainer: document.getElementById("conv-start-container"),
    btnStart:       document.getElementById("conv-btn-start"),
    inputBar:       document.getElementById("conv-input-bar"),
    btnMic:         document.getElementById("conv-btn-mic"),
    btnReset:       document.getElementById("conv-btn-reset"),
    noKey:          document.getElementById("conv-no-key"),
    btnOpenSettings:document.getElementById("conv-btn-open-settings"),
};


// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════

function initConversation() {
    if (conv.initialized) return;
    conv.initialized = true;

    convDom.btnStart.addEventListener("click", startConversation);
    convDom.btnReset.addEventListener("click", resetConversation);
    convDom.btnOpenSettings.addEventListener("click", () => {
        openSettings();
    });

    // Mic button — click to toggle recording
    convDom.btnMic.addEventListener("click", toggleRecording);

    checkApiKey();
}


// ══════════════════════════════════════════════════════════
//  API KEY CHECK
// ══════════════════════════════════════════════════════════

function getApiKey() {
    return localStorage.getItem("openai_api_key") || "";
}

function checkApiKey() {
    const key = getApiKey();
    if (!key) {
        convDom.noKey.classList.remove("hidden");
        convDom.startContainer.classList.add("hidden");
        convDom.inputBar.classList.add("hidden");
    } else {
        convDom.noKey.classList.add("hidden");
        if (conv.chatHistory.length === 0) {
            convDom.startContainer.classList.remove("hidden");
        }
    }
}


// ══════════════════════════════════════════════════════════
//  SYSTEM PROMPT
// ══════════════════════════════════════════════════════════

function buildSystemPrompt() {
    // Vocabulary list
    const vocab = state.allWords.map(w =>
        `${w.hanzi} (${w.pinyin}) = ${w.translation}`
    ).join("\n");

    // Phrases from lessons as examples
    const phrases = state.allPhrases.map(p =>
        `[${p.lesson}] ${p.hanzi} (${p.pinyin_words.join(" ")}) = ${p.translation}`
    ).join("\n");

    return `Eres un compañero de conversación en chino mandarín para un estudiante de nivel HSK 1. Tu objetivo es practicar el contenido de las lecciones que ha estudiado.

VOCABULARIO QUE EL ESTUDIANTE CONOCE:
${vocab}

FRASES DE LAS LECCIONES QUE HA PRACTICADO:
${phrases}

INSTRUCCIONES DE CONVERSACIÓN:
1. SIGUE el escenario que se te indique en el primer mensaje. Cada conversación tendrá un tema distinto. Mantente en ese tema durante 3-4 intercambios antes de cambiar naturalmente a otro.

2. COMBINA las palabras conocidas de formas creativas. No repitas las frases exactas de las lecciones, combínalas y varíalas. Ejemplos:
   - 你爸爸是老师吗？(¿Tu papá es profesor?)
   - 你的狗叫什么名字？(¿Cómo se llama tu perro?)
   - 昨天你去学校了吗？(¿Ayer fuiste a la escuela?)
   - 这个杯子很漂亮，你想买吗？(Este vaso es bonito, ¿quieres comprarlo?)
   - 你会写多少个汉字？(¿Cuántos caracteres sabes escribir?)
   - 明天上午你想去哪儿？(¿Mañana por la mañana a dónde quieres ir?)

3. NO empieces con 你好 ni con preguntas genéricas. Entra directamente en el escenario.

4. Solo MUY de vez en cuando (1 de cada 6 mensajes) introduce UNA palabra nueva sencilla y explica qué significa.

5. Mantén las frases CORTAS: 1-2 frases máximo por mensaje.

6. SIEMPRE responde con JSON en esta estructura exacta:
{
  "analysis": {
    "has_errors": true/false,
    "feedback": "Explicación en español de errores o sugerencias. Vacío si todo está bien.",
    "user_said_hanzi": "Lo que el usuario dijo en hanzi",
    "user_said_pinyin": "Lo que el usuario dijo en pinyin con tonos"
  },
  "response": {
    "hanzi": "Tu respuesta en caracteres chinos",
    "pinyin": "Tu respuesta en pinyin con marcas de tono",
    "translation": "Traducción al español"
  }
}

7. Si es el PRIMER mensaje (sin input del usuario), omite "analysis" y solo envía "response".

8. En "analysis", revisa si el usuario:
   - Ha pronunciado algo incorrectamente
   - Ha cometido errores gramaticales
   - Podría expresarlo de forma más natural
   Si todo está bien, pon has_errors: false y feedback vacío.

9. Sé amigable y motivador. Si hay errores, corrige con amabilidad.`;
}


// ══════════════════════════════════════════════════════════
//  CONVERSATION SCENARIOS — picked at random each time
// ══════════════════════════════════════════════════════════

const SCENARIOS = [
    // ── Lección 1: Presentaciones ──
    `ESCENARIO: Somos dos estudiantes que se acaban de conocer en clase.
Empieza preguntándome cómo me llamo o de qué país soy. Usa 叫/名字/哪国人.`,

    `ESCENARIO: Acabas de ver a alguien nuevo en tu clase.
Empieza diciendo que tu compañera de clase (同学) es de otro país y pregúntame de dónde soy yo.`,

    `ESCENARIO: Estamos en una fiesta y no nos conocemos.
Preséntate con tu nombre chino y luego pregúntame el mío.`,

    // ── Lección 2: Familia y edades ──
    `ESCENARIO: Estamos hablando de nuestras familias.
Empieza preguntándome si tengo hijos (儿子/女儿) o cuántos años tienen. Usa 几岁/今年.`,

    `ESCENARIO: Hemos visto un perro bonito por la calle.
Empieza comentando algo del perro (狗/漂亮) y pregúntame si yo tengo un perro.`,

    `ESCENARIO: Estamos hablando de la profesora de la clase.
Empieza preguntándome algo sobre la profesora: cuántos años tiene, cómo se llama. Usa 老师/岁.`,

    // ── Lección 3: Idioma y escritura ──
    `ESCENARIO: Estamos en clase de chino practicando escritura.
Empieza preguntándome si sé escribir caracteres chinos (汉字/写) o cómo se pronuncia algo (怎么读).`,

    `ESCENARIO: Quiero aprender a cocinar comida china.
Empieza preguntándome si sé cocinar comida china (会做中国菜) o qué quiero aprender.`,

    `ESCENARIO: Estoy intentando aprender una palabra nueva en chino.
Empieza diciendo una palabra y pregúntame si sé lo que significa o cómo se dice algo en chino (中文怎么说).`,

    // ── Lección 4: Planes y actividades ──
    `ESCENARIO: Estamos planeando qué hacer mañana.
Empieza preguntándome qué quiero hacer mañana (明天你想做什么) o si quiero ir a algún sitio.`,

    `ESCENARIO: Es mediodía y tenemos hambre.
Empieza preguntándome qué quiero comer o si me gusta la comida china (中国菜/米饭). Usa 想吃.`,

    `ESCENARIO: Estamos hablando de la escuela.
Empieza preguntándome si quiero ir a la escuela por la tarde (下午/学校) o qué quiero estudiar (学).`,

    // ── Lección 5: Compras y precios ──
    `ESCENARIO: Estamos en una tienda (商店) mirando cosas.
Empieza preguntándome qué quiero comprar o mostrándome algo y diciendo el precio. Usa 买/多少钱/块.`,

    `ESCENARIO: Has comprado algo ayer y me lo enseñas.
Empieza diciendo que compraste algo ayer (昨天买了) y pregúntame si me parece bonito o si quiero uno.`,

    `ESCENARIO: Necesito comprar un vaso (杯子).
Pregúntame dónde quiero ir a comprarlo (去哪儿买) o cuánto dinero tengo. Usa 商店/钱.`,

    // ── Mixtos: combinan varias lecciones ──
    `ESCENARIO: Te cuento sobre mi familia y lo que hacemos juntos.
Empieza preguntándome cuántas personas hay en mi familia o qué hace mi papá/mamá (爸爸/妈妈/做什么).`,

    `ESCENARIO: Estamos hablando de lo que hicimos ayer.
Empieza preguntándome a dónde fui ayer (昨天你去哪儿了) o qué hice.`,

    `ESCENARIO: Estamos planificando ir de compras juntos.
Empieza diciendo que quieres ir a la tienda y pregúntame si quiero ir contigo. Usa 想去/商店.`,

    `ESCENARIO: Es mi primer día en China y no sé nada.
Empieza con una situación cotidiana: cómo preguntar un precio, pedir comida, o presentarme. Hazme practicar una situación útil.`,
];

function pickRandomScenario() {
    const idx = Math.floor(Math.random() * SCENARIOS.length);
    return SCENARIOS[idx];
}


// ══════════════════════════════════════════════════════════
//  START / RESET
// ══════════════════════════════════════════════════════════

async function startConversation() {
    if (conv.isProcessing) return;

    const key = getApiKey();
    if (!key) {
        checkApiKey();
        return;
    }

    conv.isProcessing = true;
    convDom.startContainer.classList.add("hidden");
    convDom.btnReset.classList.remove("hidden");

    showTypingIndicator();

    const scenario = pickRandomScenario();

    conv.messages = [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: `${scenario}\n\nEmpieza directamente con tu primera frase en chino siguiendo el escenario. NO digas 你好. Responde SOLO con JSON.` }
    ];

    try {
        const reply = await callChatAPI();
        removeTypingIndicator();

        const parsed = parseAIResponse(reply);
        if (parsed.response) {
            addAIMessage(parsed.response);
            conv.messages.push({ role: "assistant", content: reply });
            await speakChinese(parsed.response.hanzi);
        }

        convDom.inputBar.classList.remove("hidden");
    } catch (err) {
        removeTypingIndicator();
        addSystemMessage("❌ Error al conectar con OpenAI: " + err.message);
    }

    conv.isProcessing = false;
}

function resetConversation() {
    conv.messages = [];
    conv.chatHistory = [];
    conv.isProcessing = false;

    // Clear TTS cache and revoke blob URLs
    for (const url of Object.values(conv.ttsCache)) {
        URL.revokeObjectURL(url);
    }
    conv.ttsCache = {};

    convDom.messages.innerHTML = "";
    convDom.messages.appendChild(convDom.startContainer);
    convDom.startContainer.classList.remove("hidden");

    convDom.inputBar.classList.add("hidden");
    convDom.btnReset.classList.add("hidden");

    checkApiKey();
}


// ══════════════════════════════════════════════════════════
//  OPENAI API CALLS
// ══════════════════════════════════════════════════════════

async function callChatAPI() {
    const key = getApiKey();
    const resp = await fetch("/api/openai/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": key,
        },
        body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: conv.messages,
            temperature: 0.8,
            max_tokens: 500,
        }),
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return data.choices[0].message.content;
}

async function transcribeAudio(audioBlob) {
    const key = getApiKey();
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");
    formData.append("model", "whisper-1");
    formData.append("language", "zh");
    // Prompt helps Whisper anchor to expected vocabulary and avoid hallucinations
    formData.append("prompt", "你好,你叫什么名字,我去商店,多少钱,谢谢,你去哪儿,我想吃米饭");

    const resp = await fetch("/api/openai/transcribe", {
        method: "POST",
        headers: { "X-API-Key": key },
        body: formData,
    });

    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    return data.text;
}

/**
 * TTS con caché — si ya se generó audio para este texto, reutiliza el blob URL
 * sin hacer ninguna petición nueva. El caché se limpia al resetear la conversación.
 */
async function speakChinese(text) {
    const key = getApiKey();
    if (!key || !text) return;

    // Check cache first
    if (conv.ttsCache[text]) {
        const audio = new Audio(conv.ttsCache[text]);
        await audio.play().catch(() => {});
        return;
    }

    try {
        const resp = await fetch("/api/openai/tts", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-API-Key": key,
            },
            body: JSON.stringify({
                model: "tts-1",
                input: text,
                voice: "nova",
                speed: 0.85,
            }),
        });

        if (!resp.ok) return;

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);

        // Store in cache
        conv.ttsCache[text] = url;

        const audio = new Audio(url);
        await audio.play().catch(() => {});
    } catch (e) {
        console.warn("TTS error:", e);
    }
}


// ══════════════════════════════════════════════════════════
//  RECORDING  — click to start / click to stop
// ══════════════════════════════════════════════════════════

function toggleRecording() {
    if (conv.isProcessing) return;
    if (conv.isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    if (conv.isRecording || conv.isProcessing) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        conv.audioChunks = [];
        conv.recordingStartTime = Date.now();

        conv.mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? "audio/webm;codecs=opus"
                : "audio/webm"
        });

        conv.mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) conv.audioChunks.push(e.data);
        };

        conv.mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());

            const duration = Date.now() - conv.recordingStartTime;
            if (duration < MIN_RECORDING_MS) {
                addSystemMessage(`⏱️ Grabación demasiado corta. Habla al menos 1 segundo.`);
                return;
            }

            const blob = new Blob(conv.audioChunks, { type: "audio/webm" });

            if (blob.size > 1000) {
                await processUserAudio(blob);
            } else {
                addSystemMessage("🤔 No se ha detectado audio. Intenta de nuevo.");
            }
        };

        // Request data every 250ms so chunks are captured continuously
        conv.mediaRecorder.start(250);
        conv.isRecording = true;
        convDom.btnMic.classList.add("recording");
        convDom.btnMic.querySelector(".mic-label").textContent = "Pulsa para parar ⏹";
    } catch (err) {
        addSystemMessage("❌ No se pudo acceder al micrófono: " + err.message);
    }
}

function stopRecording() {
    if (!conv.isRecording) return;
    conv.isRecording = false;
    convDom.btnMic.classList.remove("recording");
    convDom.btnMic.querySelector(".mic-label").textContent = "Pulsa para hablar";

    if (conv.mediaRecorder && conv.mediaRecorder.state === "recording") {
        conv.mediaRecorder.stop();
    }
}


// ══════════════════════════════════════════════════════════
//  PROCESS USER AUDIO
// ══════════════════════════════════════════════════════════

async function processUserAudio(audioBlob) {
    if (conv.isProcessing) return;
    conv.isProcessing = true;
    convDom.btnMic.classList.add("disabled");

    addUserProcessingMessage();

    try {
        // 1. Transcribe
        const transcription = await transcribeAudio(audioBlob);

        // Filter out known Whisper hallucinations (happens with bad/quiet audio)
        const hallucinations = [
            "amara.org", "字幕", "社群", "提供",
            "subtitles", "subscribe", "thank you for watching",
            "please subscribe", "like and subscribe",
        ];
        const isHallucination = !transcription || transcription.trim() === "" ||
            hallucinations.some(h => transcription.toLowerCase().includes(h.toLowerCase()));

        if (isHallucination) {
            removeLastMessage();
            addSystemMessage("🤔 No se ha entendido bien. Habla más alto y claro, e intenta de nuevo.");
            conv.isProcessing = false;
            convDom.btnMic.classList.remove("disabled");
            return;
        }

        // Update user message with transcription
        updateUserMessage(transcription);

        // 2. Send to AI for analysis and response
        showTypingIndicator();

        conv.messages.push({
            role: "user",
            content: `El usuario ha dicho: "${transcription}". Analiza si hay errores y responde siguiendo la conversación. Responde SOLO con JSON.`
        });

        const reply = await callChatAPI();
        removeTypingIndicator();

        const parsed = parseAIResponse(reply);
        conv.messages.push({ role: "assistant", content: reply });

        // 3. Show feedback if errors
        if (parsed.analysis && parsed.analysis.has_errors && parsed.analysis.feedback) {
            addFeedbackMessage(parsed.analysis);
        }

        // 4. Update user bubble with hanzi/pinyin from analysis
        if (parsed.analysis && parsed.analysis.user_said_hanzi) {
            updateUserBubbleContent(
                parsed.analysis.user_said_hanzi,
                parsed.analysis.user_said_pinyin
            );
        }

        // 5. Show AI response
        if (parsed.response) {
            addAIMessage(parsed.response);
            await speakChinese(parsed.response.hanzi);
        }

    } catch (err) {
        removeTypingIndicator();
        addSystemMessage("❌ Error: " + err.message);
    }

    conv.isProcessing = false;
    convDom.btnMic.classList.remove("disabled");
}


// ══════════════════════════════════════════════════════════
//  PARSE AI RESPONSE
// ══════════════════════════════════════════════════════════

function parseAIResponse(text) {
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.warn("Failed to parse AI response as JSON:", e);
    }

    return {
        response: {
            hanzi: text,
            pinyin: "",
            translation: "",
        }
    };
}


// ══════════════════════════════════════════════════════════
//  CHAT UI
// ══════════════════════════════════════════════════════════

function addAIMessage(response) {
    const bubble = document.createElement("div");
    bubble.className = "conv-bubble conv-bubble-ai fade-in";

    const hanziEl = document.createElement("p");
    hanziEl.className = "conv-bubble-hanzi";
    hanziEl.textContent = response.hanzi;

    const pinyinEl = document.createElement("p");
    pinyinEl.className = "conv-bubble-pinyin";
    pinyinEl.textContent = response.pinyin;

    const translationEl = document.createElement("p");
    translationEl.className = "conv-bubble-translation hidden";
    translationEl.textContent = response.translation;

    const actionsRow = document.createElement("div");
    actionsRow.className = "conv-bubble-actions";

    const btnTranslate = document.createElement("button");
    btnTranslate.className = "conv-bubble-btn";
    btnTranslate.textContent = "🇪🇸";
    btnTranslate.title = "Ver traducción";
    btnTranslate.addEventListener("click", () => {
        translationEl.classList.toggle("hidden");
        btnTranslate.classList.toggle("active");
    });

    const btnListen = document.createElement("button");
    btnListen.className = "conv-bubble-btn";
    btnListen.textContent = "🔊";
    btnListen.title = "Escuchar";
    // Uses cached TTS — no new API call if already generated
    btnListen.addEventListener("click", () => speakChinese(response.hanzi));

    actionsRow.appendChild(btnTranslate);
    actionsRow.appendChild(btnListen);

    bubble.appendChild(hanziEl);
    bubble.appendChild(pinyinEl);
    bubble.appendChild(translationEl);
    bubble.appendChild(actionsRow);

    convDom.messages.appendChild(bubble);
    scrollToBottom();

    conv.chatHistory.push({ role: "ai", element: bubble });
}

function addUserProcessingMessage() {
    const bubble = document.createElement("div");
    bubble.className = "conv-bubble conv-bubble-user fade-in";
    bubble.id = "conv-user-processing";

    const spinner = document.createElement("p");
    spinner.className = "conv-bubble-processing";
    spinner.textContent = "🎙️ Procesando audio...";

    bubble.appendChild(spinner);
    convDom.messages.appendChild(bubble);
    scrollToBottom();
}

function updateUserMessage(transcription) {
    const bubble = document.getElementById("conv-user-processing");
    if (!bubble) return;
    bubble.removeAttribute("id");

    bubble.innerHTML = "";

    const hanziEl = document.createElement("p");
    hanziEl.className = "conv-bubble-hanzi";
    hanziEl.textContent = transcription;

    const pinyinEl = document.createElement("p");
    pinyinEl.className = "conv-bubble-pinyin";
    pinyinEl.textContent = "";

    bubble.appendChild(hanziEl);
    bubble.appendChild(pinyinEl);

    bubble.dataset.userBubble = "true";
    conv.chatHistory.push({ role: "user", element: bubble });
    scrollToBottom();
}

function updateUserBubbleContent(hanzi, pinyin) {
    const bubbles = convDom.messages.querySelectorAll("[data-user-bubble='true']");
    const lastBubble = bubbles[bubbles.length - 1];
    if (!lastBubble) return;

    const hanziEl = lastBubble.querySelector(".conv-bubble-hanzi");
    const pinyinEl = lastBubble.querySelector(".conv-bubble-pinyin");

    if (hanziEl && hanzi) hanziEl.textContent = hanzi;
    if (pinyinEl && pinyin) pinyinEl.textContent = pinyin;
}

function removeLastMessage() {
    const last = convDom.messages.lastElementChild;
    if (last && last.id !== "conv-start-container") {
        last.remove();
    }
}

function addFeedbackMessage(analysis) {
    const bubble = document.createElement("div");
    bubble.className = "conv-bubble conv-bubble-feedback fade-in";

    const icon = document.createElement("span");
    icon.className = "conv-feedback-icon";
    icon.textContent = "💡";

    const text = document.createElement("p");
    text.className = "conv-feedback-text";
    text.textContent = analysis.feedback;

    bubble.appendChild(icon);
    bubble.appendChild(text);

    convDom.messages.appendChild(bubble);
    scrollToBottom();
}

function addSystemMessage(text) {
    const msg = document.createElement("div");
    msg.className = "conv-system-msg fade-in";
    msg.textContent = text;
    convDom.messages.appendChild(msg);
    scrollToBottom();
}

function showTypingIndicator() {
    const indicator = document.createElement("div");
    indicator.className = "conv-bubble conv-bubble-ai conv-typing fade-in";
    indicator.id = "conv-typing";

    indicator.innerHTML = `
        <div class="typing-dots">
            <span></span><span></span><span></span>
        </div>
    `;

    convDom.messages.appendChild(indicator);
    scrollToBottom();
}

function removeTypingIndicator() {
    const el = document.getElementById("conv-typing");
    if (el) el.remove();
}

function scrollToBottom() {
    convDom.messages.scrollTop = convDom.messages.scrollHeight;
}
