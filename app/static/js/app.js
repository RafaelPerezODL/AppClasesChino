/* ══════════════════════════════════════════════════════════
   学中文  —  Lógica de la aplicación de flashcards + drag-and-drop
   ══════════════════════════════════════════════════════════ */

// ── Estado global ──────────────────────────────────────────
const state = {
    mode: "flashcards",    // "flashcards" | "drag-drop" | "matching" | "conversation"

    // Flashcards
    allWords: [],
    tagGroups: {},
    activeTags: new Set(),
    deck: [],
    currentIndex: 0,
    revealStage: 0,

    // Drag-and-drop
    allPhrases: [],
    phraseDeck: [],
    phraseIndex: 0,
    ddSolved: false,

    // Matching
    matchMode: "hanzi-pinyin",  // "hanzi-pinyin" | "pinyin-spanish"
    matchDeck: [],
    matchRound: [],
    matchSelected: null,       // { side: "left"|"right", el, wordId }
    matchScore: 0,
    matchTotal: 0,
    matchRoundNum: 0,
    matchRoundsTotal: 0,
    matchWordsPerRound: 5,
};

// ── Referencias al DOM (flashcards) ────────────────────────
const dom = {
    tagGroupsContainer: document.getElementById("tag-groups"),
    btnClearTags:       document.getElementById("btn-clear-tags"),
    btnShuffle:         document.getElementById("btn-shuffle"),
    cardCounter:        document.getElementById("card-counter"),
    flashcard:          document.getElementById("flashcard"),
    hanzi:              document.getElementById("hanzi"),
    pinyin:             document.getElementById("pinyin"),
    translation:        document.getElementById("translation"),
    btnAudio:           document.getElementById("btn-audio"),
    btnPrev:            document.getElementById("btn-prev"),
    btnReveal:          document.getElementById("btn-reveal"),
    btnNext:            document.getElementById("btn-next"),
    emptyState:         document.getElementById("empty-state"),
    cardWrapper:        document.querySelector(".card-wrapper"),
    cardActions:        document.querySelector("#mode-flashcards .card-actions"),

    // Modes
    modeFlashcards:     document.getElementById("mode-flashcards"),
    modeDragDrop:       document.getElementById("mode-drag-drop"),
    modeConversation:   document.getElementById("mode-conversation"),
};

// ── Referencias al DOM (drag-and-drop) ─────────────────────
const dd = {
    counter:       document.getElementById("dd-counter"),
    btnShuffle:    document.getElementById("dd-btn-shuffle"),
    btnAudio:      document.getElementById("dd-btn-audio"),
    dropZone:      document.getElementById("dd-drop-zone"),
    placeholder:   document.getElementById("dd-placeholder"),
    pieces:        document.getElementById("dd-pieces"),
    result:        document.getElementById("dd-result"),
    resultHanzi:   document.getElementById("dd-result-hanzi"),
    resultTransl:  document.getElementById("dd-result-translation"),
    btnPrev:       document.getElementById("dd-btn-prev"),
    btnCheck:      document.getElementById("dd-btn-check"),
    btnNext:       document.getElementById("dd-btn-next"),
    emptyState:    document.getElementById("dd-empty-state"),
    actions:       document.getElementById("dd-actions"),
};


// ── Referencias al DOM (matching) ──────────────────────────
const mt = {
    board:         document.getElementById("match-board"),
    colLeft:       document.getElementById("match-col-left"),
    colRight:      document.getElementById("match-col-right"),
    headerLeft:    document.getElementById("match-header-left"),
    headerRight:   document.getElementById("match-header-right"),
    score:         document.getElementById("match-score"),
    roundInfo:     document.getElementById("match-round-info"),
    btnNew:        document.getElementById("match-btn-new"),
    instructions:  document.getElementById("match-instructions-text"),
    roundResult:   document.getElementById("match-round-result"),
    roundText:     document.getElementById("match-round-text"),
    btnNextRound:  document.getElementById("match-btn-next-round"),
    emptyState:    document.getElementById("match-empty-state"),
    modeSection:   document.getElementById("mode-matching"),
};


// ══════════════════════════════════════════════════════════
//  INICIALIZACIÓN
// ══════════════════════════════════════════════════════════

async function init() {
    const [vocabData, phraseData] = await Promise.all([
        fetch("/api/vocabulary").then(r => r.json()),
        fetch("/api/phrases").then(r => r.json()),
    ]);

    state.allWords   = vocabData.words;
    state.tagGroups  = vocabData.tag_groups;
    state.allPhrases = phraseData.phrases;

    renderTagSidebar();
    buildDeck();
    showCard();
    buildPhraseDeck();

    // Flashcard events
    dom.btnClearTags.addEventListener("click", clearTags);
    dom.btnShuffle.addEventListener("click",   shuffleDeck);
    dom.btnReveal.addEventListener("click",    revealNext);
    dom.btnPrev.addEventListener("click",      prevCard);
    dom.btnNext.addEventListener("click",      nextCard);
    dom.btnAudio.addEventListener("click",     speakCurrentWord);

    // Drag-drop events
    dd.btnShuffle.addEventListener("click",  shufflePhraseDeck);
    dd.btnAudio.addEventListener("click",    playPhraseAudio);
    dd.btnCheck.addEventListener("click",    checkPhraseOrder);
    dd.btnPrev.addEventListener("click",     prevPhrase);
    dd.btnNext.addEventListener("click",     nextPhrase);

    // Matching events
    mt.btnNew.addEventListener("click", startNewMatchGame);
    mt.btnNextRound.addEventListener("click", nextMatchRound);
    document.querySelectorAll(".match-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => switchMatchMode(btn.dataset.matchmode));
    });

    // Tab events
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => switchMode(btn.dataset.mode));
    });

    // Settings events
    document.getElementById("btn-settings").addEventListener("click", openSettings);
    document.getElementById("settings-close").addEventListener("click", closeSettings);
    document.getElementById("settings-overlay").addEventListener("click", e => {
        if (e.target.id === "settings-overlay") closeSettings();
    });
    document.getElementById("btn-save-key").addEventListener("click", saveApiKey);
    document.getElementById("btn-toggle-key").addEventListener("click", toggleKeyVisibility);

    // Load saved API key into input
    const savedKey = localStorage.getItem("openai_api_key") || "";
    document.getElementById("api-key-input").value = savedKey;

    // Keyboard
    document.addEventListener("keydown", handleKeyboard);

    // Drop zone events
    dd.dropZone.addEventListener("dragover",  handleDragOver);
    dd.dropZone.addEventListener("drop",      handleDrop);
    dd.dropZone.addEventListener("dragenter", e => { e.preventDefault(); dd.dropZone.classList.add("drag-over"); });
    dd.dropZone.addEventListener("dragleave", e => { dd.dropZone.classList.remove("drag-over"); });
}

document.addEventListener("DOMContentLoaded", init);


// ══════════════════════════════════════════════════════════
//  MODO / TABS
// ══════════════════════════════════════════════════════════

function switchMode(mode) {
    state.mode = mode;

    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.mode === mode);
    });

    dom.modeFlashcards.classList.add("hidden");
    dom.modeDragDrop.classList.add("hidden");
    mt.modeSection.classList.add("hidden");
    dom.modeConversation.classList.add("hidden");

    if (mode === "flashcards") {
        dom.modeFlashcards.classList.remove("hidden");
    } else if (mode === "drag-drop") {
        dom.modeDragDrop.classList.remove("hidden");
        showPhrase();
    } else if (mode === "matching") {
        mt.modeSection.classList.remove("hidden");
        startNewMatchGame();
    } else if (mode === "conversation") {
        dom.modeConversation.classList.remove("hidden");
        if (typeof initConversation === "function") initConversation();
    }

    // Close mobile sidebar when switching modes
    closeMobileSidebar();
    updateSidebarVisibility();
}

/** Muestra solo los grupos de tags relevantes para el modo actual */
function updateSidebarVisibility() {
    const sidebar = document.getElementById("sidebar");
    const btnToggle = document.getElementById("btn-sidebar-toggle");
    const isMobile = window.innerWidth <= 768;

    if (state.mode === "conversation") {
        sidebar.classList.add("hidden");
        if (btnToggle) btnToggle.classList.add("hidden");
        return;
    }

    // On desktop always show sidebar; on mobile hide it (toggle button opens it)
    if (isMobile) {
        if (btnToggle) btnToggle.classList.remove("hidden");
        // Don't auto-show sidebar on mobile — user opens with ☰
    } else {
        sidebar.classList.remove("hidden");
        if (btnToggle) btnToggle.classList.add("hidden");
    }

    document.querySelectorAll(".tag-group").forEach(group => {
        const name = group.dataset.groupName;
        if (state.mode === "drag-drop") {
            group.classList.toggle("hidden", name !== "Lección");
        } else {
            group.classList.remove("hidden");
        }
    });
}

function openMobileSidebar() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    sidebar.classList.remove("hidden");
    sidebar.classList.add("sidebar-open");
    if (backdrop) backdrop.classList.remove("hidden");
}

function closeMobileSidebar() {
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    sidebar.classList.remove("sidebar-open");
    if (backdrop) backdrop.classList.add("hidden");
    if (window.innerWidth <= 768) sidebar.classList.add("hidden");
}

// Mobile sidebar toggle listeners
document.addEventListener("DOMContentLoaded", () => {
    const btnToggle = document.getElementById("btn-sidebar-toggle");
    const backdrop = document.getElementById("sidebar-backdrop");
    if (btnToggle) btnToggle.addEventListener("click", openMobileSidebar);
    if (backdrop) backdrop.addEventListener("click", closeMobileSidebar);

    // Re-evaluate sidebar on resize
    window.addEventListener("resize", () => updateSidebarVisibility());
});


// ══════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════

function openSettings() {
    document.getElementById("settings-overlay").classList.remove("hidden");
}

function closeSettings() {
    document.getElementById("settings-overlay").classList.add("hidden");
}

function saveApiKey() {
    const key = document.getElementById("api-key-input").value.trim();
    if (key) {
        localStorage.setItem("openai_api_key", key);
        const status = document.getElementById("settings-status");
        status.classList.remove("hidden");
        setTimeout(() => status.classList.add("hidden"), 2000);
    }
}

function toggleKeyVisibility() {
    const input = document.getElementById("api-key-input");
    input.type = input.type === "password" ? "text" : "password";
}


// ══════════════════════════════════════════════════════════
//  SIDEBAR DE TAGS
// ══════════════════════════════════════════════════════════

function renderTagSidebar() {
    dom.tagGroupsContainer.innerHTML = "";

    const tagCounts = {};
    state.allWords.forEach(w =>
        w.tags.forEach(t => (tagCounts[t] = (tagCounts[t] || 0) + 1))
    );

    // Also count phrase lessons
    const phraseLessonCounts = {};
    state.allPhrases.forEach(p => {
        phraseLessonCounts[p.lesson] = (phraseLessonCounts[p.lesson] || 0) + 1;
    });

    for (const [groupName, tags] of Object.entries(state.tagGroups)) {
        const group = document.createElement("div");
        group.className = "tag-group";
        group.dataset.groupName = groupName;

        const title = document.createElement("div");
        title.className = "tag-group-title";
        title.textContent = groupName;
        group.appendChild(title);

        const list = document.createElement("div");
        list.className = "tag-list";

        tags.forEach(tag => {
            const count = tagCounts[tag] || 0;
            if (count === 0) return;

            const chip = document.createElement("button");
            chip.className = "tag-chip";
            chip.dataset.tag = tag;
            chip.innerHTML = `${formatTagLabel(tag)}<span class="tag-count">${count}</span>`;
            chip.addEventListener("click", () => toggleTag(tag, chip));
            list.appendChild(chip);
        });

        group.appendChild(list);
        dom.tagGroupsContainer.appendChild(group);
    }
}

function formatTagLabel(tag) {
    return tag.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function toggleTag(tag, chipEl) {
    if (state.activeTags.has(tag)) {
        state.activeTags.delete(tag);
        chipEl.classList.remove("active");
    } else {
        state.activeTags.add(tag);
        chipEl.classList.add("active");
    }
    buildDeck();
    showCard();
    buildPhraseDeck();
    if (state.mode === "drag-drop") showPhrase();
    if (state.mode === "matching") startNewMatchGame();
}

function clearTags() {
    state.activeTags.clear();
    document.querySelectorAll(".tag-chip.active").forEach(el =>
        el.classList.remove("active")
    );
    buildDeck();
    showCard();
    buildPhraseDeck();
    if (state.mode === "drag-drop") showPhrase();
    if (state.mode === "matching") startNewMatchGame();
}


// ══════════════════════════════════════════════════════════
//  FLASHCARDS — GESTIÓN DEL MAZO
// ══════════════════════════════════════════════════════════

function buildDeck() {
    if (state.activeTags.size === 0) {
        state.deck = [...state.allWords];
    } else {
        state.deck = state.allWords.filter(w =>
            w.tags.some(t => state.activeTags.has(t))
        );
    }
    shuffle(state.deck);
    state.currentIndex = 0;
    state.revealStage  = 0;
}

function shuffleDeck() {
    shuffle(state.deck);
    state.currentIndex = 0;
    state.revealStage  = 0;
    showCard();
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}


// ══════════════════════════════════════════════════════════
//  FLASHCARDS — MOSTRAR TARJETA
// ══════════════════════════════════════════════════════════

function showCard() {
    const deckSize = state.deck.length;

    if (deckSize === 0) {
        dom.cardWrapper.classList.add("hidden");
        dom.cardActions.classList.add("hidden");
        dom.emptyState.classList.remove("hidden");
        dom.cardCounter.textContent = "0 / 0";
        return;
    }

    dom.cardWrapper.classList.remove("hidden");
    dom.cardActions.classList.remove("hidden");
    dom.emptyState.classList.add("hidden");

    const word = state.deck[state.currentIndex];

    state.revealStage = 0;

    dom.hanzi.textContent       = word.hanzi;
    dom.pinyin.textContent      = word.pinyin;
    dom.translation.textContent = word.translation;

    dom.pinyin.classList.add("hidden");
    dom.translation.classList.add("hidden");
    dom.btnAudio.classList.add("hidden");

    dom.btnReveal.textContent = "Ver Pinyin";
    dom.btnReveal.disabled    = false;

    dom.btnPrev.disabled = state.currentIndex === 0;
    dom.btnNext.disabled = state.currentIndex >= deckSize - 1;

    dom.cardCounter.textContent = `${state.currentIndex + 1} / ${deckSize}`;

    dom.flashcard.classList.remove("card-enter");
    void dom.flashcard.offsetWidth;
    dom.flashcard.classList.add("card-enter");
}

function revealNext() {
    if (state.deck.length === 0) return;

    state.revealStage++;

    if (state.revealStage === 1) {
        dom.pinyin.classList.remove("hidden");
        dom.pinyin.classList.add("fade-in");
        dom.btnReveal.textContent = "Ver Traducción";
    } else if (state.revealStage >= 2) {
        dom.translation.classList.remove("hidden");
        dom.translation.classList.add("fade-in");
        dom.btnAudio.classList.remove("hidden");
        dom.btnAudio.classList.add("fade-in");
        dom.btnReveal.textContent = "Completado ✓";
        dom.btnReveal.disabled    = true;
    }
}

function nextCard() {
    if (state.currentIndex < state.deck.length - 1) {
        state.currentIndex++;
        showCard();
    }
}

function prevCard() {
    if (state.currentIndex > 0) {
        state.currentIndex--;
        showCard();
    }
}


// ══════════════════════════════════════════════════════════
//  FLASHCARDS — AUDIO
// ══════════════════════════════════════════════════════════

let currentAudio = null;

function speakCurrentWord() {
    if (state.deck.length === 0) return;

    const word = state.deck[state.currentIndex];
    const audioUrl = `/static/audio/${word.id}.mp3`;

    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }

    currentAudio = new Audio(audioUrl);

    dom.btnAudio.classList.add("playing");
    currentAudio.addEventListener("ended",  () => dom.btnAudio.classList.remove("playing"));
    currentAudio.addEventListener("error",  () => dom.btnAudio.classList.remove("playing"));

    currentAudio.play().catch(() => dom.btnAudio.classList.remove("playing"));
}


// ══════════════════════════════════════════════════════════
//  DRAG & DROP — GESTIÓN DEL MAZO DE FRASES
// ══════════════════════════════════════════════════════════

function buildPhraseDeck() {
    if (state.activeTags.size === 0) {
        state.phraseDeck = [...state.allPhrases];
    } else {
        // Filter phrases whose lesson is in activeTags
        const lessonTags = new Set(
            [...state.activeTags].filter(t => t.startsWith("lección-"))
        );
        if (lessonTags.size === 0) {
            state.phraseDeck = [...state.allPhrases];
        } else {
            state.phraseDeck = state.allPhrases.filter(p =>
                lessonTags.has(p.lesson)
            );
        }
    }
    shuffle(state.phraseDeck);
    state.phraseIndex = 0;
    state.ddSolved = false;
}

function shufflePhraseDeck() {
    shuffle(state.phraseDeck);
    state.phraseIndex = 0;
    state.ddSolved = false;
    showPhrase();
}


// ══════════════════════════════════════════════════════════
//  DRAG & DROP — MOSTRAR FRASE
// ══════════════════════════════════════════════════════════

function showPhrase() {
    const deckSize = state.phraseDeck.length;

    if (deckSize === 0) {
        dd.dropZone.parentElement.querySelector(".dd-audio-section")?.classList.add("hidden");
        dd.dropZone.classList.add("hidden");
        dd.pieces.classList.add("hidden");
        dd.actions.classList.add("hidden");
        dd.result.classList.add("hidden");
        dd.emptyState.classList.remove("hidden");
        dd.counter.textContent = "0 / 0";
        document.querySelector(".dd-instructions")?.classList.add("hidden");
        return;
    }

    // Show everything
    document.querySelector(".dd-audio-section")?.classList.remove("hidden");
    document.querySelector(".dd-instructions")?.classList.remove("hidden");
    dd.dropZone.classList.remove("hidden");
    dd.pieces.classList.remove("hidden");
    dd.actions.classList.remove("hidden");
    dd.emptyState.classList.add("hidden");
    dd.result.classList.add("hidden");

    state.ddSolved = false;

    const phrase = state.phraseDeck[state.phraseIndex];

    dd.counter.textContent = `${state.phraseIndex + 1} / ${deckSize}`;

    dd.btnPrev.disabled = state.phraseIndex === 0;
    dd.btnNext.disabled = state.phraseIndex >= deckSize - 1;
    dd.btnCheck.disabled = true;
    dd.btnCheck.textContent = "Comprobar";

    // Clear drop zone
    dd.dropZone.innerHTML = '';
    dd.placeholder.textContent = "Arrastra las palabras aquí en orden";
    dd.dropZone.appendChild(dd.placeholder);
    dd.placeholder.classList.remove("hidden");

    // Create pieces: correct words + 2× distractor pinyin from vocabulary
    const correctWords = [...phrase.pinyin_words];
    const numDistractors = correctWords.length * 2;

    const allPinyin = state.allWords.map(w => w.pinyin);
    const available = [...new Set(allPinyin)].filter(p => !correctWords.includes(p));
    shuffle(available);
    const distractors = available.slice(0, numDistractors);

    const allPieces = [...correctWords, ...distractors];
    shuffle(allPieces);

    dd.pieces.innerHTML = '';
    allPieces.forEach((word, i) => {
        const piece = document.createElement("div");
        piece.className = "dd-piece";
        piece.textContent = word;
        piece.draggable = true;
        piece.dataset.pinyin = word;
        piece.dataset.id = `piece-${Date.now()}-${i}`;

        // Drag events
        piece.addEventListener("dragstart", handleDragStart);
        piece.addEventListener("dragend",   handleDragEnd);

        // Touch support
        piece.addEventListener("touchstart",  handleTouchStart, { passive: false });
        piece.addEventListener("touchmove",   handleTouchMove,  { passive: false });
        piece.addEventListener("touchend",    handleTouchEnd);

        // Click to move
        piece.addEventListener("click", () => handlePieceClick(piece));

        dd.pieces.appendChild(piece);
    });

    // Auto-play audio
    setTimeout(() => playPhraseAudio(), 400);
}


// ══════════════════════════════════════════════════════════
//  DRAG & DROP — AUDIO
// ══════════════════════════════════════════════════════════

let phraseAudio = null;

function playPhraseAudio() {
    if (state.phraseDeck.length === 0) return;

    const phrase = state.phraseDeck[state.phraseIndex];
    const audioUrl = `/static/audio/phrases/${phrase.id}.mp3`;

    if (phraseAudio) {
        phraseAudio.pause();
        phraseAudio.currentTime = 0;
    }

    phraseAudio = new Audio(audioUrl);

    dd.btnAudio.classList.add("playing");
    phraseAudio.addEventListener("ended",  () => dd.btnAudio.classList.remove("playing"));
    phraseAudio.addEventListener("error",  () => dd.btnAudio.classList.remove("playing"));

    phraseAudio.play().catch(() => dd.btnAudio.classList.remove("playing"));
}


// ══════════════════════════════════════════════════════════
//  DRAG & DROP — DRAG EVENTS
// ══════════════════════════════════════════════════════════

let draggedPiece = null;

function handleDragStart(e) {
    if (state.ddSolved) return;
    draggedPiece = e.target;
    e.target.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", e.target.dataset.id);
}

function handleDragEnd(e) {
    e.target.classList.remove("dragging");
    dd.dropZone.classList.remove("drag-over");
    draggedPiece = null;
}

function handleDragOver(e) {
    e.preventDefault();
    if (state.ddSolved) return;
    e.dataTransfer.dropEffect = "move";

    // Find insertion point among existing pieces in drop zone
    const afterElement = getDragAfterElement(dd.dropZone, e.clientX);
    if (draggedPiece) {
        if (afterElement) {
            dd.dropZone.insertBefore(draggedPiece, afterElement);
        } else {
            dd.dropZone.appendChild(draggedPiece);
        }
    }
}

function handleDrop(e) {
    e.preventDefault();
    if (state.ddSolved) return;
    dd.dropZone.classList.remove("drag-over");
    dd.placeholder.classList.add("hidden");

    updateCheckButton();
}

function getDragAfterElement(container, x) {
    const draggableElements = [...container.querySelectorAll(".dd-piece:not(.dragging)")];
    let closest = null;
    let closestOffset = Number.NEGATIVE_INFINITY;

    draggableElements.forEach(child => {
        const box = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closestOffset) {
            closestOffset = offset;
            closest = child;
        }
    });

    return closest;
}


// ══════════════════════════════════════════════════════════
//  DRAG & DROP — TOUCH SUPPORT
// ══════════════════════════════════════════════════════════

let touchClone = null;
let touchPiece = null;
let touchOffsetX = 0;
let touchOffsetY = 0;

function handleTouchStart(e) {
    if (state.ddSolved) return;
    e.preventDefault();

    touchPiece = e.target;
    const touch = e.touches[0];
    const rect = touchPiece.getBoundingClientRect();

    touchOffsetX = touch.clientX - rect.left;
    touchOffsetY = touch.clientY - rect.top;

    // Create floating clone
    touchClone = touchPiece.cloneNode(true);
    touchClone.classList.add("dd-piece-ghost");
    touchClone.style.width = rect.width + "px";
    touchClone.style.left = (touch.clientX - touchOffsetX) + "px";
    touchClone.style.top = (touch.clientY - touchOffsetY) + "px";
    document.body.appendChild(touchClone);

    touchPiece.classList.add("dragging");
}

function handleTouchMove(e) {
    if (!touchClone) return;
    e.preventDefault();
    const touch = e.touches[0];
    touchClone.style.left = (touch.clientX - touchOffsetX) + "px";
    touchClone.style.top = (touch.clientY - touchOffsetY) + "px";
}

function handleTouchEnd(e) {
    if (!touchClone || !touchPiece) return;

    const touch = e.changedTouches[0];
    const dropRect = dd.dropZone.getBoundingClientRect();

    // Check if dropped in the drop zone
    if (
        touch.clientX >= dropRect.left && touch.clientX <= dropRect.right &&
        touch.clientY >= dropRect.top  && touch.clientY <= dropRect.bottom
    ) {
        const afterEl = getDragAfterElement(dd.dropZone, touch.clientX);
        if (afterEl) {
            dd.dropZone.insertBefore(touchPiece, afterEl);
        } else {
            dd.dropZone.appendChild(touchPiece);
        }
        dd.placeholder.classList.add("hidden");
    } else {
        // Return to pieces area
        if (!dd.pieces.contains(touchPiece)) {
            dd.pieces.appendChild(touchPiece);
        }
    }

    touchPiece.classList.remove("dragging");
    touchClone.remove();
    touchClone = null;
    touchPiece = null;

    updateCheckButton();
    checkIfDropZoneEmpty();
}


// ══════════════════════════════════════════════════════════
//  DRAG & DROP — CLICK TO MOVE
// ══════════════════════════════════════════════════════════

function handlePieceClick(piece) {
    if (state.ddSolved) return;

    if (dd.pieces.contains(piece)) {
        // Move to drop zone
        dd.dropZone.appendChild(piece);
        dd.placeholder.classList.add("hidden");
    } else if (dd.dropZone.contains(piece)) {
        // Move back to pieces
        dd.pieces.appendChild(piece);
        checkIfDropZoneEmpty();
    }

    updateCheckButton();
}

function checkIfDropZoneEmpty() {
    const piecesInZone = dd.dropZone.querySelectorAll(".dd-piece");
    if (piecesInZone.length === 0) {
        dd.placeholder.classList.remove("hidden");
    }
}

function updateCheckButton() {
    if (state.ddSolved) return;
    const piecesInZone = dd.dropZone.querySelectorAll(".dd-piece");
    dd.btnCheck.disabled = piecesInZone.length === 0;
}


// ══════════════════════════════════════════════════════════
//  DRAG & DROP — COMPROBAR
// ══════════════════════════════════════════════════════════

function checkPhraseOrder() {
    if (state.ddSolved) return;

    const phrase = state.phraseDeck[state.phraseIndex];
    const piecesInZone = [...dd.dropZone.querySelectorAll(".dd-piece")];
    const userOrder = piecesInZone.map(p => p.dataset.pinyin);
    const correctOrder = phrase.pinyin_words;

    const isCorrect = userOrder.length === correctOrder.length &&
        userOrder.every((val, idx) => val === correctOrder[idx]);

    if (isCorrect) {
        // ¡Correcto!
        state.ddSolved = true;

        piecesInZone.forEach(p => {
            p.classList.add("correct");
            p.draggable = false;
        });

        // Dim leftover distractors
        dd.pieces.querySelectorAll(".dd-piece").forEach(p => {
            p.classList.add("distractor-used");
            p.draggable = false;
        });

        dd.result.classList.remove("hidden");
        dd.result.classList.add("fade-in");
        dd.resultHanzi.textContent = phrase.hanzi;
        dd.resultTransl.textContent = phrase.translation;

        dd.btnCheck.textContent = "¡Correcto! ✅";
        dd.btnCheck.disabled = true;

        // Play audio on success
        playPhraseAudio();
    } else {
        // Incorrecto — sacudir las piezas incorrectas
        piecesInZone.forEach((p, idx) => {
            if (idx < correctOrder.length && p.dataset.pinyin !== correctOrder[idx]) {
                p.classList.add("wrong");
                setTimeout(() => p.classList.remove("wrong"), 600);
            }
        });

        dd.btnCheck.textContent = "Inténtalo de nuevo";
        setTimeout(() => {
            if (!state.ddSolved) dd.btnCheck.textContent = "Comprobar";
        }, 1500);
    }
}


// ══════════════════════════════════════════════════════════
//  DRAG & DROP — NAVEGACIÓN
// ══════════════════════════════════════════════════════════

function nextPhrase() {
    if (state.phraseIndex < state.phraseDeck.length - 1) {
        state.phraseIndex++;
        showPhrase();
    }
}

function prevPhrase() {
    if (state.phraseIndex > 0) {
        state.phraseIndex--;
        showPhrase();
    }
}


// ══════════════════════════════════════════════════════════
//  EMPAREJAMIENTO — LÓGICA
// ══════════════════════════════════════════════════════════

function switchMatchMode(matchMode) {
    state.matchMode = matchMode;
    document.querySelectorAll(".match-mode-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.matchmode === matchMode);
    });

    if (matchMode === "hanzi-pinyin") {
        mt.headerLeft.textContent  = "漢字";
        mt.headerRight.textContent = "Pinyin";
    } else {
        mt.headerLeft.textContent  = "Pinyin";
        mt.headerRight.textContent = "Español";
    }

    startNewMatchGame();
}

function buildMatchDeck() {
    if (state.activeTags.size === 0) {
        state.matchDeck = [...state.allWords];
    } else {
        state.matchDeck = state.allWords.filter(w =>
            w.tags.some(t => state.activeTags.has(t))
        );
    }
    shuffle(state.matchDeck);
}

function startNewMatchGame() {
    buildMatchDeck();

    if (state.matchDeck.length === 0) {
        mt.board.classList.add("hidden");
        mt.roundResult.classList.add("hidden");
        mt.emptyState.classList.remove("hidden");
        mt.score.textContent = "0 / 0";
        mt.roundInfo.textContent = "";
        document.querySelector(".match-instructions")?.classList.add("hidden");
        return;
    }

    mt.board.classList.remove("hidden");
    mt.emptyState.classList.add("hidden");
    document.querySelector(".match-instructions")?.classList.remove("hidden");

    state.matchScore = 0;
    state.matchTotal = 0;
    state.matchRoundNum = 0;
    state.matchRoundsTotal = Math.ceil(state.matchDeck.length / state.matchWordsPerRound);

    nextMatchRound();
}

function nextMatchRound() {
    const N = state.matchWordsPerRound;
    const start = state.matchRoundNum * N;

    // If we've gone through all rounds, reshuffle and restart
    if (start >= state.matchDeck.length) {
        shuffle(state.matchDeck);
        state.matchRoundNum = 0;
        state.matchScore = 0;
        state.matchTotal = 0;
        nextMatchRound();
        return;
    }

    state.matchRound = state.matchDeck.slice(start, start + N);
    state.matchRoundNum++;
    state.matchSelected = null;

    mt.roundResult.classList.add("hidden");
    mt.board.classList.remove("hidden");

    mt.roundInfo.textContent = `Ronda ${state.matchRoundNum} / ${state.matchRoundsTotal}`;
    mt.score.textContent = `${state.matchScore} / ${state.matchTotal}`;

    renderMatchBoard();
}

function renderMatchBoard() {
    // Clear columns (keep headers)
    mt.colLeft.innerHTML  = '';
    mt.colRight.innerHTML = '';

    const headerL = document.createElement("div");
    headerL.className = "match-col-header";
    headerL.id = "match-header-left";
    headerL.textContent = state.matchMode === "hanzi-pinyin" ? "漢字" : "Pinyin";
    mt.colLeft.appendChild(headerL);
    mt.headerLeft = headerL;

    const headerR = document.createElement("div");
    headerR.className = "match-col-header";
    headerR.id = "match-header-right";
    headerR.textContent = state.matchMode === "hanzi-pinyin" ? "Pinyin" : "Español";
    mt.colRight.appendChild(headerR);
    mt.headerRight = headerR;

    // Shuffle left and right independently
    const leftOrder  = [...state.matchRound];
    const rightOrder = [...state.matchRound];
    shuffle(leftOrder);
    shuffle(rightOrder);

    // Left column items
    leftOrder.forEach(word => {
        const item = document.createElement("button");
        item.className = "match-item match-item-left";
        item.dataset.wordId = word.id;

        if (state.matchMode === "hanzi-pinyin") {
            item.textContent = word.hanzi;
            item.classList.add("match-item-hanzi");
        } else {
            item.textContent = word.pinyin;
            item.classList.add("match-item-pinyin");
        }

        item.addEventListener("click", () => handleMatchClick("left", item, word.id));
        mt.colLeft.appendChild(item);
    });

    // Right column items
    rightOrder.forEach(word => {
        const item = document.createElement("button");
        item.className = "match-item match-item-right";
        item.dataset.wordId = word.id;

        if (state.matchMode === "hanzi-pinyin") {
            item.textContent = word.pinyin;
            item.classList.add("match-item-pinyin");
        } else {
            item.textContent = word.translation;
            item.classList.add("match-item-translation");
        }

        item.addEventListener("click", () => handleMatchClick("right", item, word.id));
        mt.colRight.appendChild(item);
    });
}

function handleMatchClick(side, el, wordId) {
    // Ignore if already matched
    if (el.classList.contains("matched")) return;

    // If nothing selected yet, or clicking same side → select this one
    if (!state.matchSelected || state.matchSelected.side === side) {
        // Deselect previous on same side
        if (state.matchSelected && state.matchSelected.side === side) {
            state.matchSelected.el.classList.remove("selected");
        }
        el.classList.add("selected");
        state.matchSelected = { side, el, wordId };
        return;
    }

    // We have one from each side — check match
    const sel = state.matchSelected;
    state.matchTotal++;

    if (sel.wordId === wordId) {
        // ¡Correcto!
        state.matchScore++;
        sel.el.classList.remove("selected");
        sel.el.classList.add("matched");
        el.classList.add("matched");

        // Play audio for the matched word
        playMatchAudio(wordId);

        state.matchSelected = null;
        mt.score.textContent = `${state.matchScore} / ${state.matchTotal}`;

        // Check if round complete
        checkMatchRoundComplete();
    } else {
        // Incorrecto
        sel.el.classList.remove("selected");
        sel.el.classList.add("wrong-match");
        el.classList.add("wrong-match");

        state.matchSelected = null;
        mt.score.textContent = `${state.matchScore} / ${state.matchTotal}`;

        setTimeout(() => {
            sel.el.classList.remove("wrong-match");
            el.classList.remove("wrong-match");
        }, 500);
    }
}

function playMatchAudio(wordId) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.currentTime = 0;
    }
    currentAudio = new Audio(`/static/audio/${wordId}.mp3`);
    currentAudio.play().catch(() => {});
}

function checkMatchRoundComplete() {
    const remaining = mt.colLeft.querySelectorAll(".match-item:not(.matched)");
    if (remaining.length > 0) return;

    // Round complete!
    const accuracy = state.matchTotal > 0
        ? Math.round((state.matchScore / state.matchTotal) * 100)
        : 100;

    let emoji, msg;
    if (accuracy === 100)     { emoji = "🏆"; msg = "¡Perfecto! Sin errores"; }
    else if (accuracy >= 80)  { emoji = "🎉"; msg = `¡Muy bien! ${accuracy}% de aciertos`; }
    else if (accuracy >= 60)  { emoji = "👍"; msg = `¡Bien! ${accuracy}% de aciertos`; }
    else                      { emoji = "💪"; msg = `${accuracy}% — ¡Sigue practicando!`; }

    mt.roundResult.querySelector(".match-round-icon").textContent = emoji;
    mt.roundText.textContent = msg;

    const isLastRound = state.matchRoundNum >= state.matchRoundsTotal;
    mt.btnNextRound.textContent = isLastRound ? "🔄 Empezar de nuevo" : "Siguiente ronda →";

    mt.roundResult.classList.remove("hidden");
    mt.roundResult.classList.add("fade-in");
}


// ══════════════════════════════════════════════════════════
//  TECLADO
// ══════════════════════════════════════════════════════════

function handleKeyboard(e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (state.mode === "flashcards") {
        switch (e.key) {
            case " ":
            case "Enter":
                e.preventDefault();
                if (!dom.btnReveal.disabled) revealNext();
                break;
            case "ArrowRight":
                e.preventDefault();
                if (!dom.btnNext.disabled) nextCard();
                break;
            case "ArrowLeft":
                e.preventDefault();
                if (!dom.btnPrev.disabled) prevCard();
                break;
            case "s":
                if (state.revealStage >= 2) speakCurrentWord();
                break;
        }
    } else if (state.mode === "drag-drop") {
        switch (e.key) {
            case "Enter":
                e.preventDefault();
                if (!dd.btnCheck.disabled) checkPhraseOrder();
                break;
            case "ArrowRight":
                e.preventDefault();
                if (!dd.btnNext.disabled) nextPhrase();
                break;
            case "ArrowLeft":
                e.preventDefault();
                if (!dd.btnPrev.disabled) prevPhrase();
                break;
            case "s":
                playPhraseAudio();
                break;
        }
    }
}
