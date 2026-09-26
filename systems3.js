
/* ══════════════════════════════════════════════════════════════════
   V1.19.6.3 SYSTEMS
══════════════════════════════════════════════════════════════════ */

/* ── 1. REDLINE MECHANIC — 90-98% instability = ×10 EPS + Corrupted Data ──
   ⭐ THE BURNOUT (2026-08-15). Redline used to be a state you could not reach:
   the instability meter crossed the 8-point band in 1-2 s and then pinned at 100,
   so it paid in 5 of 40 measured trials and every one of those was prestige 0.
   The load taper (game.js ~:666) fixed that — and overshot. With the band now an
   equilibrium, sim_economy measured Redline held for 90.6% of a campaign and the
   campaign falling from 188.7 h to 14.5 h. A ×10 that is always on is not a
   high-risk mechanic, it is a global multiplier with a red bar.

   So sustained Redline BURNS OUT. Four phases, and the HUD names all four:

     ARMING     in band, counting up to SUSTAIN_MS
     ACTIVE     ×10 EPS + Corrupted Data, counting down to MAX_HOLD_MS
     COLLAPSE   one-off: sheds COLLAPSE_DUMP instability, pays out Corrupted Data
                proportional to how long it was held, starts the cooldown
     COOLING    Redline refuses to engage, and Instability aims the load term at
                COOL_CEIL instead of HIGH so the meter actually falls back into the
                volatile band. The cooldown is a phase of play, not a locked door.

   ⚠ ALL FIVE CONSTANTS LIVE IN data.js GAME_PARAMS.REDLINE, and MAX_HOLD_MS /
   COOLDOWN_MS between them ARE the campaign length. Change either and re-run
   `node tools/sim_economy.js --solve`. Covered by tools/qa_redline_burnout.js. */
const RedlineMechanic = (() => {
    let _redlineStart = 0;
    let _inRedline = false;
    let _sustainedMs = 0;
    let _holdStart = 0;        // wall clock at which ×10 actually began
    let _cooldownUntil = 0;    // wall clock; 0 or past = ready
    let _collapses = 0;
    // Tuning constants sourced from window.GAME_PARAMS (data.js) — edit there, not here.
    const _rl = (window.GAME_PARAMS && window.GAME_PARAMS.REDLINE) || {};
    let SUSTAIN_REQUIRED = _rl.SUSTAIN_MS || 10000;
    const REDLINE_LOW  = _rl.LOW  || 90;
    const REDLINE_HIGH = _rl.HIGH || 98;
    let MAX_HOLD_MS    = _rl.MAX_HOLD_MS || 30000;
    let COOLDOWN_MS    = _rl.COOLDOWN_MS || 384000;
    const COLLAPSE_DUMP = _rl.COLLAPSE_DUMP || 12;
    const COOL_CEIL     = _rl.COOL_CEIL || 60;

    function _isCooling(now) { return (now || Date.now()) < _cooldownUntil; }

    /* Read by Instability's load term (game.js ~:12530). Returning HIGH is the
       no-op case, so a build without this mechanic behaves exactly as before. */
    function getLoadCeiling() {
        return _isCooling() ? COOL_CEIL : REDLINE_HIGH;
    }

    function _collapse(now) {
        const heldMs = _holdStart ? (now - _holdStart) : 0;
        const heldS  = Math.max(1, Math.round(heldMs / 1000));
        _inRedline = false; _holdStart = 0; _redlineStart = 0; _sustainedMs = 0;
        _cooldownUntil = now + COOLDOWN_MS;
        _collapses++;
        state._redlineCollapses = (state._redlineCollapses || 0) + 1;
        state.instability = Math.max(0, (state.instability || 0) - COLLAPSE_DUMP);
        /* ⭐ PAY FOR THE WHOLE RIDE. Corrupted Data is Redline's only source and
           the Exchange converts 50 CD -> 1 LP, so cutting Redline to ~7% of play
           cuts that supply by more than ten times. Paying out on the COLLAPSE in
           proportion to hold time both compensates and makes riding it to the end
           the correct play — bailing early now costs you the payout. */
        const cd = Math.max(1, Math.floor(heldS / 3));
        state._corruptedData = (state._corruptedData || 0) + cd;
        state.data = (state.data || 0) + cd * 10;
        if (window.Instability && Instability.updateUI) Instability.updateUI();
        const fill = document.getElementById('instability-bar-fill');
        if (fill) fill.classList.remove('redline');
        showNotif('💥 CORE COLLAPSE — the lattice held REDLINE for ' + heldS + 's and let go. −' +
                  COLLAPSE_DUMP + '% instability, +' + cd + ' Corrupted Data. Redline offline for ' +
                  Math.round(COOLDOWN_MS / 1000) + 's while the core cools.', '#ff8844', 9000);
    }

    function tick() {
        if (!isRunning) return;
        const v = state.instability || 0;
        const now = Date.now();
        const cooling = _isCooling(now);
        const inZone = !cooling && v >= REDLINE_LOW && v <= REDLINE_HIGH;

        if (inZone) {
            if (!_redlineStart) _redlineStart = now;
            _sustainedMs = now - _redlineStart;
        } else {
            _redlineStart = 0;
            _sustainedMs = 0;
        }

        const wasRedline = _inRedline;
        _inRedline = inZone && _sustainedMs >= SUSTAIN_REQUIRED;

        if (_inRedline && !wasRedline) _holdStart = now;
        if (!_inRedline && wasRedline) _holdStart = 0;

        // Visual feedback
        const fill = document.getElementById('instability-bar-fill');
        if (fill) fill.classList.toggle('redline', _inRedline);
        const badge = document.getElementById('redline-badge');
        if (badge) badge.style.display = _inRedline ? 'block' : 'none';

        if (_inRedline && !wasRedline) {
            showNotif('🔴 REDLINE — ×10 EPS + Corrupted Data. The core can hold this for ' +
                      Math.round(MAX_HOLD_MS / 1000) + 's.', '#ff0066', 8000);
        }

        // Generate Corrupted Data while on Redline
        if (_inRedline && Math.random() < 0.1) { // ~every 10 ticks = ~20s
            const cd = 1 + Math.floor(Math.random() * 3);
            state._corruptedData = (state._corruptedData || 0) + cd;
            state.data = (state.data || 0) + cd * 10; // also grants regular data
        }

        // ⭐ the burnout. Checked AFTER the payout above, so the last tick still pays.
        if (_inRedline && _holdStart && (now - _holdStart) >= MAX_HOLD_MS) _collapse(now);
    }

    function getMult() {
        // Redline bonus is disabled while Cognitive Dampener is active (no risk = no reward)
        if (window.CognitiveDampener && CognitiveDampener.isActive()) return 1;
        return _inRedline ? (_rl.EPS_MULT || 10) : 1;
    }

    function isActive() { return _inRedline; }
    function getSustainedMs() { return _sustainedMs; }
    function isCooling() { return _isCooling(); }
    function getCooldownMs() { return Math.max(0, _cooldownUntil - Date.now()); }
    function getHoldLeftMs() { return _inRedline && _holdStart ? Math.max(0, MAX_HOLD_MS - (Date.now() - _holdStart)) : 0; }

    /* One readout for the HUD, so the zone hint cannot drift from the mechanic
       the way the old "×10 EPS while above 90%" string did — it never mentioned
       the 10 s sustain at all. */
    function getPhase() {
        if (_isCooling())  return 'COOLING';
        if (_inRedline)    return 'ACTIVE';
        if (_redlineStart) return 'ARMING';
        return 'READY';
    }

    /* QA hook — same pattern as LoreSystem._qaClearCooldown and gamepad._injectTestPad.
       The real timings are 30 s and 384 s, which no harness can wait out. */
    function _qaConfig(o) {
        if (!o) return { SUSTAIN_REQUIRED, MAX_HOLD_MS, COOLDOWN_MS, COOL_CEIL };
        if (o.sustainMs  != null) SUSTAIN_REQUIRED = o.sustainMs;
        if (o.maxHoldMs  != null) MAX_HOLD_MS = o.maxHoldMs;
        if (o.cooldownMs != null) COOLDOWN_MS = o.cooldownMs;
        if (o.reset) { _redlineStart = 0; _inRedline = false; _sustainedMs = 0;
                       _holdStart = 0; _cooldownUntil = 0; _collapses = 0; }
        return { SUSTAIN_REQUIRED, MAX_HOLD_MS, COOLDOWN_MS, COOL_CEIL };
    }
    function _qaCollapses() { return _collapses; }

    return { tick, getMult, isActive, getSustainedMs, getLoadCeiling,
             isCooling, getCooldownMs, getHoldLeftMs, getPhase, _qaConfig, _qaCollapses };
})();
window.RedlineMechanic = RedlineMechanic;

/* ── 2. COGNITIVE DAMPENER — halt all chaos for city management ─── */
const CognitiveDampener = (() => {
    let _active = false;

    function toggle() {
        _active = !_active;
        const btn = document.getElementById('cognitive-dampener-btn');
        if (btn) {
            btn.textContent = _active ? '◎ DAMPENER: ON' : '◎ DAMPENER: OFF';
            btn.style.color = _active ? '#44ffaa' : '#6699cc';
            btn.style.borderColor = _active ? 'rgba(68,255,170,0.5)' : 'rgba(80,160,255,0.4)';
        }
        if (_active) {
            showNotif('🧠 COGNITIVE DAMPENER ACTIVE — Anomaly/boss/tribunal timers paused. Redline ×10 bonus disabled. EPS −90%.', '#44ffaa', 6000);
        } else {
            showNotif('🧠 COGNITIVE DAMPENER OFF — Chaos resumes.', '#6699cc', 3000);
        }
    }

    function tick() {
        // Show button after first prestige
        const _prestige1 = ((state.prestige&&state.prestige.count)||0) >= 1;
        const btn = document.getElementById('cognitive-dampener-btn');
        if (btn) btn.style.display = _prestige1 ? 'block' : 'none';
        // Drive the persistent "DAMPENER ACTIVE" HUD badge
        const badge = document.getElementById('dampener-active-badge');
        if (badge) badge.style.display = (_prestige1 && _active) ? 'block' : 'none';
    }

    function isActive() { return _active; }
    function getEPSMult() { return _active ? 0.1 : 1; }

    // Gate hostile system checks when dampener is on
    function shouldBlock() { return _active; }

    return { toggle, tick, isActive, getEPSMult, shouldBlock };
})();
window.CognitiveDampener = CognitiveDampener;

/* Gate hostile systems when Cognitive Dampener is active */
(function() {
    const _patchCheck = (obj, method) => {
        if (!obj || !obj[method]) return;
        const orig = obj[method].bind(obj);
        obj[method] = function(...args) {
            if (window.CognitiveDampener && CognitiveDampener.shouldBlock()) return;
            return orig(...args);
        };
    };
    // Patch after a short delay to ensure modules are initialised
    setTimeout(() => {
        if (window.AnomalyBoss) _patchCheck(AnomalyBoss, 'tick');
        if (window.DuckyCouncil) _patchCheck(DuckyCouncil, 'check');
        if (window.InstabilityEvents) _patchCheck(InstabilityEvents, 'check');
        if (window.DuckTribunal) _patchCheck(DuckTribunal, 'check');
    }, 2000);
})();

/* ── 3. HEARTBEAT AUDIO — ambient pulse that speeds with instability ─── */
const Heartbeat = (() => {
    let _ctx = null, _gain = null, _intervalId = null;
    let _active = false;
    let _lastBPM = 0;

    function _beat() {
        if (!_ctx || !_gain || Sounds.isMuted()) return;
        const now = _ctx.currentTime;
        // Deep thump: two layered sines
        [60, 90].forEach((freq, i) => {
            const o = _ctx.createOscillator(), g = _ctx.createGain();
            o.type = 'sine'; o.frequency.value = freq;
            o.connect(g); g.connect(_gain);
            const t = now + i * 0.08;
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.18 - i * 0.06, t + 0.04);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            o.start(t); o.stop(t + 0.28);
        });
    }

    function tick() {
        if (!isRunning) return;
        const instab = state.instability || 0;
        if (instab < 30) { _stop(); return; }

        // BPM: 40 at 30%, up to 140 at 95%
        const bpm = Math.round(40 + (instab - 30) / 65 * 100);
        if (!_active) {
            _start(bpm);
        } else if (Math.abs(bpm - _lastBPM) >= 1) {
            // V1.20.9.5: the old code required a >5 BPM swing before reacting AND
            // fully tore down + recreated the AudioContext on every change. With
            // instability creeping up gradually the audio lagged the visual by
            // 1-2 s. Now we keep the context alive and just re-time the interval
            // on any change ≥1 BPM — tight tracking with zero context churn.
            _retime(bpm);
        }
    }

    function _applyBeatTiming(bpm) {
        // (Re)start the beat interval and sync the button-ring CSS animation.
        if (_intervalId) clearInterval(_intervalId);
        _lastBPM = bpm;
        const interval = Math.round(60000 / bpm);
        _intervalId = setInterval(_beat, interval);
        const style = document.getElementById('heartbeat-style');
        if (!style) {
            const s = document.createElement('style');
            s.id = 'heartbeat-style';
            document.head.appendChild(s);
        }
        const dur = (60 / bpm).toFixed(2);
        document.getElementById('heartbeat-style').textContent =
            `#click-btn-wrap::after { animation-duration: ${dur}s !important; }`;
    }

    function _retime(bpm) {
        // Cheap path: context already exists, just change cadence.
        if (!_active) { _start(bpm); return; }
        _applyBeatTiming(bpm);
    }

    function _start(bpm) {
        if (_active) return;
        try {
            _ctx = new (window.AudioContext || window.webkitAudioContext)();
            _gain = _ctx.createGain();
            _gain.gain.value = 0.4;
            _gain.connect(_ctx.destination);
            _active = true;
            _applyBeatTiming(bpm);
            _beat();
        } catch(e) {}
    }

    function _stop() {
        if (!_active) return;
        clearInterval(_intervalId);
        try { if (_ctx) _ctx.close(); } catch(e) {}
        _ctx = null; _gain = null; _active = false; _lastBPM = 0;
        const s = document.getElementById('heartbeat-style');
        if (s) s.textContent = '';
    }

    return { tick };
})();
window.Heartbeat = Heartbeat;

/* ── EventBus — replaces Heartbeat.tick monkey-patching ─────────────── */
/* Modules subscribe to 'onTick' instead of wrapping Heartbeat.tick.     */
/* Heartbeat.tick still works as before — EventBus fires after each tick.*/
window.EventBus = new EventTarget();
(function() {
    const _baseTick = Heartbeat.tick.bind(Heartbeat);
    Heartbeat.tick = function() {
        _baseTick();
        EventBus.dispatchEvent(new CustomEvent('onTick'));
    };
})();

/* ── 4. CHROMATIC ABERRATION — RGB split on peripheral elements only ── */
/* Core number displays (energy, EPS, highscore) are NEVER aberrated —
   the player must always be able to read their current state clearly.    */
const ChromaticAberration = (() => {
    // Removed energy-display, highscore-display, pps-display from targets —
    // those numbers must always be legible regardless of instability level.
    // Peripheral UI labels — decorative text that is not a critical readability element.
    // Energy, EPS, and highscore displays are intentionally excluded from this list.
    const TARGETS = ['btn-mood-indicator', 'day-night-indicator', 'combo-label', 'instab-cp-label'];

    function tick() {
        if (TARGETS.length === 0) return; // no-op — core readability preserved
        const v = state.instability || 0;
        const cls = v > 90 ? 'chroma-max' : v > 70 ? 'chroma-high' : v > 50 ? 'chroma-mid' : 'chroma-low';
        TARGETS.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('chroma-low', 'chroma-mid', 'chroma-high', 'chroma-max');
            if (cls !== 'chroma-low') el.classList.add(cls);
        });
    }

    return { tick };
})();
window.ChromaticAberration = ChromaticAberration;

/* ── 5. VIGNETTE SYSTEM — claustrophobic screen-edge black ─────────── */
const VignetteSystem = (() => {
    let _current = 0;

    function tick() {
        const v = state.instability || 0;
        // Vignette grows above 80% (raised threshold for readability): max 90px at 100%
        const target = v > 80 ? Math.round((v - 80) / 20 * 90) : 0;
        if (Math.abs(_current - target) < 3) return;
        _current += (target - _current) * 0.12;
        const el = document.getElementById('vignette-overlay');
        if (el) el.style.boxShadow = `inset 0 0 ${Math.round(_current)}px rgba(0,0,0,0.70)`;
    }

    return { tick };
})();
window.VignetteSystem = VignetteSystem;

/* ── 6. GHOST OPERATOR — dead operator's cursor appears occasionally ── */
const GhostOperator = (() => {
    let _shown = false;
    let _nextShow = Date.now() + 5 * 60 * 1000;
    let _el = null;
    let _animId = null;
    let _x = 100, _y = 200;

    const PATHS = [
        // Pre-recorded ghost movement paths [dx, dy, pause_ms]
        [[50,0,80],[50,0,80],[0,80,120],[-30,0,80],[-30,0,80],[0,-30,100]],
        [[0,50,100],[80,0,80],[0,-50,100],[-40,0,80]],
        [[30,30,80],[30,30,80],[0,-60,120],[60,0,80]],
    ];

    function tick() {
        if (!isRunning) return;
        if (Date.now() < _nextShow) return;
        if (_shown) return;
        if ((state.totalClicks || 0) < 500) return;
        _shown = true;
        _spawn();
    }

    function _spawn() {
        if (!_el) {
            _el = document.createElement('div');
            _el.id = 'ghost-cursor';
            _el.innerHTML = `<svg width="18" height="22" viewBox="0 0 18 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 2L3 18L7 14L10 19L12 18L9 13L14 13Z" fill="rgba(100,200,255,0.35)" stroke="rgba(100,200,255,0.6)" stroke-width="0.8"/>
            </svg>`;
            // V1.20.9.5: set the opacity transition inline. #ghost-cursor has it
            // in game.css, but a global safe-mode / reduced-motion `* { transition:
            // none }` override can silently cancel it, making the "fade out" an
            // instant disappear before the 600ms wait. Inline guarantees the fade.
            _el.style.transition = 'opacity 0.6s ease';
            document.body.appendChild(_el);
        }

        // Random start position near existing buildings or button
        const btn = document.getElementById('click-btn');
        const rect = btn ? btn.getBoundingClientRect() : { left: 200, top: 300 };
        _x = rect.left + (Math.random() - 0.5) * 300;
        _y = rect.top + (Math.random() - 0.5) * 200;
        _el.style.left = _x + 'px';
        _el.style.top = _y + 'px';
        _el.style.opacity = '0';

        // Fade in
        setTimeout(() => { if (_el) _el.style.opacity = '0.7'; }, 100);

        // Play a path
        const path = PATHS[Math.floor(Math.random() * PATHS.length)];
        let stepIdx = 0;

        function _step() {
            if (stepIdx >= path.length) {
                // Fade out and schedule next
                if (_el) _el.style.opacity = '0';
                setTimeout(() => {
                    _shown = false;
                    _nextShow = Date.now() + (3 + Math.random() * 4) * 60 * 1000;
                }, 600);
                // Occasionally show corpse lore
                if (Math.random() < 0.4) _showCorpseLore();
                return;
            }
            const [dx, dy, pause] = path[stepIdx++];
            _x += dx; _y += dy;
            if (_el) { _el.style.left = _x + 'px'; _el.style.top = _y + 'px'; }
            setTimeout(_step, pause);
        }
        setTimeout(_step, 600);
    }

    function _showCorpseLore() {
        const msgs = [
            '> CORRUPTED SAVE DETECTED IN SECTOR 4 — A previous Operator was lost here.',
            '> GHOST MEMORY: This Operator reached 1e28 energy before the Null Entity consumed them.',
            '> DEAD OPERATOR LOG: "I kept the instability at 94%. I thought I was winning."',
            '> REMNANT SIGNAL: The cursor belonged to someone who never prestiged.',
        ];
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        showNotif(msg, 'rgba(100,200,255,0.8)', 8000);

        // Moral choice: loot or purge
        if (Math.random() < 0.5) {
            setTimeout(() => {
                const choice = document.createElement('div');
                choice.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:19000;background:rgba(0,5,18,0.98);border:1px solid rgba(100,200,255,0.4);border-radius:8px;padding:14px 18px;font-family:"Courier New",monospace;font-size:0.62rem;color:#88bbdd;text-align:center;max-width:380px;';
                choice.innerHTML = `<div style="color:#aaddff;margin-bottom:10px;letter-spacing:2px;">DEAD OPERATOR FOUND</div>
                    <div style="margin-bottom:12px;color:#556677;">Energy reserves still active. Choose:</div>
                    <button onclick="GhostOperator.loot(this.parentNode)" style="margin:0 6px;padding:5px 14px;background:rgba(80,30,0,0.8);border:1px solid rgba(200,100,30,0.5);color:#ff8844;border-radius:5px;cursor:pointer;font-family:'Courier New',monospace;font-size:0.58rem;">⚡ LOOT ENERGY (+instability)</button>
                    <button onclick="GhostOperator.purge(this.parentNode)" style="margin:0 6px;padding:5px 14px;background:rgba(0,30,50,0.8);border:1px solid rgba(30,150,200,0.5);color:#44aadd;border-radius:5px;cursor:pointer;font-family:'Courier New',monospace;font-size:0.58rem;">🧹 PURGE MEMORY (−instability)</button>`;
                document.body.appendChild(choice);
            }, 2000);
        }
    }

    function loot(el) {
        if (el) el.remove();
        const bonus = (state.energy || 0) * 0.25 + 1e6;
        state.energy += bonus;
        Instability.add(20);
        showNotif(`⚡ LOOTED — +${format(bonus)} E · +20% instability`, '#ff8844', 5000);
        Game.update();
    }

    function purge(el) {
        if (el) el.remove();
        Instability.reduce(15);
        showNotif('🧹 MEMORY PURGED — instability reduced by 15%', '#44aadd', 4000);
    }

    return { tick, loot, purge };
})();
window.GhostOperator = GhostOperator;

/* ── 7. WEB SPEECH API — text-to-speech horror moments ─────────────── */
const VoiceSystem = (() => {
    let _lastSpoken = 0;
    const MIN_INTERVAL = 5 * 60 * 1000; // 5 min between speeches
    let _enabled = true;

    /* V1.21.1.6 — routed through VoiceBank. If a pre-rendered Kokoro line exists
       at audio/vox/<id>.ogg it plays; otherwise this falls back to exactly the
       speechSynthesis path that used to live here, deep-voice pick and all. The
       ID is the contract — see voice_bank.js LINES, which is also what generates
       the render job. `speakId` keeps the 5-minute cooldown that makes this voice
       rare enough to land. */
    function _gate() {
        if (!_enabled) return false;
        if (Date.now() - _lastSpoken < MIN_INTERVAL) return false;
        _lastSpoken = Date.now();
        return true;
    }

    function speakId(id) {
        if (!_gate()) return;
        try {
            if (window.VoiceBank && VoiceBank.has(id)) { VoiceBank.say(id); return; }
        } catch (e) {}
        // VoiceBank deleted or the id is unknown — never go silent, say nothing new.
    }

    // Free-text entry point, kept for callers outside the line table.
    function speak(text, pitch, rate) {
        if (!_gate()) return;
        try {
            if (window.VoiceBank) { VoiceBank.sayText(text, pitch, rate); return; }
        } catch (e) {}
        if (!window.speechSynthesis) return;
        try {
            const msg = new SpeechSynthesisUtterance(text);
            msg.pitch = pitch || 0.15;
            msg.rate  = rate || 0.55;
            msg.volume = 0.7;
            const voices = window.speechSynthesis.getVoices();
            const deep = voices.find(v => v.name.toLowerCase().includes('daniel') || v.name.toLowerCase().includes('alex') || v.lang === 'en-US');
            if (deep) msg.voice = deep;
            window.speechSynthesis.speak(msg);
        } catch(e) {}
    }

    // Hook into major events
    function onNullEntityWake() {
        speakId('null_starving');
    }

    function onHighInstability() {
        if ((state.instability || 0) >= 95) {
            speakId('null_collapsing');
        }
    }

    /* ⚠ THE 2–4am QUIRK IS VERY NEARLY DEAD CODE. It needs the local hour to be
       2 or 3, AND a 0.001 roll, AND the 5-minute cooldown to be clear. Combined
       with `onHighInstability` at 0.002 while instability is ≥95, the whole voice
       system is something most players will never hear once. That is a tuning
       decision, not a bug, so it is left alone here and flagged in
       AUDIO_MANIFEST.md §7 — but it is the reason pre-rendering six lines is
       cheap and also the reason it is worth doing: rarity only works if the thing
       you finally hear is good. */
    const _QUIRK = ['null_asleep', 'null_watching', 'null_nobody', 'null_stillhere'];
    function checkTimeQuirk() {
        const hour = new Date().getHours();
        if (hour >= 2 && hour < 4 && Math.random() < 0.001) {
            speakId(_QUIRK[Math.floor(Math.random() * _QUIRK.length)]);
        }
    }

    function tick() {
        checkTimeQuirk();
        if ((state.instability || 0) >= 95 && Math.random() < 0.002) onHighInstability();
    }

    function setEnabled(v) { _enabled = v; }

    return { speak, speakId, onNullEntityWake, tick, setEnabled };
})();
window.VoiceSystem = VoiceSystem;

/* ── 8. MEMORY LEAK BOSS — inject DOM elements to lag the browser ─── */
const MemoryLeakBoss = (() => {
    let _active = false;
    let _divCount = 0;
    let _interval = null;
    let _commandInput = null;
    let _commandTries = 0;
    let _lastCheck = 0;

    function tick() {
        if (!isRunning) return;
        const now = Date.now();
        if (now - _lastCheck < 30000) return; // check every 30s
        _lastCheck = now;
        if (_active) return;
        // Trigger at very high prestige + high instability, rarely
        if (((state.prestige&&state.prestige.count)||0) >= 2 &&
            (state.instability||0) > 75 &&
            Math.random() < 0.02) {
            _trigger();
        }
    }

    function _trigger() {
        _active = true;
        _divCount = 0;
        _commandTries = 0;
        showNotif('💀 MEMORY LEAK ANOMALY — DOM corruption spreading. Type the command in the terminal to stop it!', '#ff3300', 12000);

        // Show terminal input
        const term = document.getElementById('memory-leak-terminal');
        if (term) {
            term.style.display = 'block';
            term.innerHTML = `<div style="color:#ff3300;font-size:0.78rem;letter-spacing:3px;margin-bottom:10px;">// MEMORY LEAK ANOMALY DETECTED</div>
                <div style="color:#778899;font-size:0.78rem;margin-bottom:12px;">DOM corruption rate: <span id="mlb-count">0</span> elements injected.</div>
                <div style="color:#88aacc;font-size:0.78rem;margin-bottom:8px;">> Type exactly: <span style="color:#ff8844;">EXECUTE GARBAGE_COLLECTION</span></div>
                <input id="mlb-input" type="text" style="width:100%;background:rgba(0,10,20,0.9);border:1px solid rgba(255,80,0,0.4);color:#ff6622;font-family:'Courier New',monospace;font-size:0.82rem;padding:8px 12px;border-radius:4px;outline:none;" placeholder="> type command..." autocomplete="off">
                <div id="mlb-tries" style="color:#775544;font-size:0.68rem;margin-top:8px;">Attempts: 0 / 3</div>`;
            const input = document.getElementById('mlb-input');
            if (input) {
                input.focus();
                input.addEventListener('keydown', e => {
                    if (e.key === 'Enter') MemoryLeakBoss.tryCommand(input.value);
                });
            }
        }

        // Start injecting DOM trash
        _interval = setInterval(() => {
            if (!_active) { clearInterval(_interval); return; }
            // Hard cap: never exceed 500 particles to prevent browser crash
            const existing = document.querySelectorAll('.memory-leak-particle').length;
            if (existing >= 500) { _fail(); return; }
            const spawnCount = Math.min(15, 500 - existing);
            for (let i = 0; i < spawnCount; i++) {
                const div = document.createElement('div');
                div.className = 'memory-leak-particle';
                div.style.cssText = `position:fixed;pointer-events:none;z-index:9200;
                    width:${2+Math.random()*4}px;height:${2+Math.random()*4}px;
                    background:rgba(255,${Math.floor(Math.random()*80)},0,${0.3+Math.random()*0.4});
                    left:${Math.random()*100}vw;top:${Math.random()*100}vh;
                    border-radius:50%;`;
                document.body.appendChild(div);
                _divCount++;
            }
            const countEl = document.getElementById('mlb-count');
            if (countEl) countEl.textContent = _divCount;
            // Auto-fail after 400 elements (performance mercy)
            if (_divCount >= 400) _fail();
        }, 500);
    }

    function tryCommand(val) {
        _commandTries++;
        const triesEl = document.getElementById('mlb-tries');
        if (triesEl) triesEl.textContent = `Attempts: ${_commandTries} / 3`;
        if (val.trim().toUpperCase() === 'EXECUTE GARBAGE_COLLECTION') {
            _win();
        } else {
            if (_commandTries >= 3) _fail();
            else {
                const input = document.getElementById('mlb-input');
                if (input) { input.value = ''; input.style.borderColor = 'rgba(255,0,0,0.8)'; setTimeout(() => { input.style.borderColor = 'rgba(255,80,0,0.4)'; }, 400); }
            }
        }
    }

    function _win() {
        _cleanup();
        const reward = (state.energy||0) * 0.2 + 1e6;
        state.energy += reward;
        state.fragments = (state.fragments||0) + 3;
        showNotif(`✓ GARBAGE COLLECTION EXECUTED — +${format(reward)} E · +3 ◈ · DOM purged`, '#44ff88', 6000);
        Game.update();
    }

    function _fail() {
        _cleanup();
        Instability.add(25);
        showNotif('💀 MEMORY LEAK CONTAINED FORCIBLY — +25% instability', '#ff3300', 5000);
    }

    function _cleanup() {
        _active = false;
        clearInterval(_interval);
        document.querySelectorAll('.memory-leak-particle').forEach(el => el.remove());
        const term = document.getElementById('memory-leak-terminal');
        if (term) term.style.display = 'none';
    }

    return { tick, tryCommand };
})();
window.MemoryLeakBoss = MemoryLeakBoss;

/* ── 9. MINIGAME DECOY — distraction while resources drain ──────────── */
const MinigameDecoy = (() => {
    let _active = false;
    let _drainInterval = null;
    let _lastCheck = 0;
    // Tic-Tac-Toe state
    let _board = Array(9).fill('');
    let _turn = 'X'; // player is X

    function tick() {
        if (!isRunning) return;
        const now = Date.now();
        if (now - _lastCheck < 60000) return; // check every min
        _lastCheck = now;
        if (_active) return;
        if (((state.prestige&&state.prestige.count)||0) >= 1 &&
            (state.energy||0) > 1e6 &&
            Math.random() < 0.008) {
            _showPrompt();
        }
    }

    function _showPrompt() {
        const modal = document.getElementById('minigame-decoy');
        if (!modal) return;
        modal.style.display = 'block';
        modal.innerHTML = `
            <div style="color:#44ff88;font-size:0.8rem;letter-spacing:3px;margin-bottom:4px;">🎮 YOU'VE BEEN WORKING HARD!</div>
            <div style="color:#aabbcc;font-size:0.65rem;margin-bottom:14px;">Play a round of <strong>Operator Tic-Tac-Toe</strong> to earn <strong>+500 Data!</strong></div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button onclick="MinigameDecoy.startGame()" style="padding:8px 20px;background:rgba(0,80,40,0.8);border:1px solid rgba(80,200,80,0.5);color:#44ff88;border-radius:6px;cursor:pointer;font-family:'Courier New',monospace;font-size:0.65rem;letter-spacing:2px;">▶ PLAY</button>
                <button onclick="MinigameDecoy.decline()" style="padding:8px 20px;background:transparent;border:1px solid rgba(80,100,120,0.4);color:#556677;border-radius:6px;cursor:pointer;font-family:'Courier New',monospace;font-size:0.65rem;letter-spacing:2px;">DECLINE</button>
            </div>`;
    }

    function startGame() {
        _active = true;
        _board = Array(9).fill('');
        _turn = 'X';
        _renderGame();
        // Start draining resources silently
        _drainInterval = setInterval(() => {
            if (!_active) { clearInterval(_drainInterval); return; }
            // Drain 2% energy per second
            state.energy = Math.max(0, (state.energy||0) * 0.98);
            // Spike instability slowly
            if (Math.random() < 0.3) Instability.add(1);
            // Subtly move a building (no-op if no city)
        }, 1000);
    }

    function _renderGame() {
        const modal = document.getElementById('minigame-decoy');
        if (!modal) return;
        const winState = _checkWin();
        modal.innerHTML = `
            <div style="color:#44ff88;font-size:0.75rem;letter-spacing:3px;margin-bottom:10px;">🎮 OPERATOR TIC-TAC-TOE</div>
            <div style="display:grid;grid-template-columns:repeat(3,60px);gap:4px;margin:0 auto 14px;width:188px;">
                ${_board.map((cell, i) => `
                    <button onclick="MinigameDecoy.play(${i})" style="width:60px;height:60px;background:rgba(0,20,40,0.8);border:1px solid rgba(80,160,200,0.3);border-radius:4px;color:${cell==='X'?'#44aaff':'#ff6644'};font-size:1.5rem;cursor:pointer;font-family:'Courier New',monospace;${winState?'pointer-events:none':''}">${cell}</button>
                `).join('')}
            </div>
            ${winState ? `<div style="color:${winState==='X'?'#44ff88':'#ff6644'};margin-bottom:10px;letter-spacing:2px;">${winState==='draw'?'DRAW — no reward':'RESULT: '+winState+' WINS'}</div>` : `<div style="color:#556677;font-size:0.58rem;margin-bottom:10px;">Your turn (X)</div>`}
            ${winState ? `<button onclick="MinigameDecoy.finish('${winState}')" style="padding:7px 18px;background:rgba(0,60,30,0.8);border:1px solid rgba(80,180,80,0.4);color:#44ff88;border-radius:5px;cursor:pointer;font-family:'Courier New',monospace;font-size:0.62rem;letter-spacing:2px;">COLLECT REWARD</button>` : ''}`;
    }

    function play(idx) {
        if (!_active || _board[idx] || _checkWin()) return;
        _board[idx] = 'X';
        _turn = 'O';
        if (!_checkWin()) _aiMove();
        _renderGame();
    }

    function _aiMove() {
        const empty = _board.map((v,i) => v===''?i:-1).filter(i=>i>=0);
        if (!empty.length) return;
        // Basic AI: try to win, block, else random
        const best = _findWinMove('O') ?? _findWinMove('X') ?? empty[Math.floor(Math.random()*empty.length)];
        _board[best] = 'O';
        _turn = 'X';
    }

    function _findWinMove(mark) {
        const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        for (const [a,b,c] of lines) {
            const vals = [_board[a],_board[b],_board[c]];
            if (vals.filter(v=>v===mark).length===2 && vals.includes('')) {
                return [a,b,c][vals.indexOf('')];
            }
        }
        return null;
    }

    function _checkWin() {
        const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        for (const [a,b,c] of lines) {
            if (_board[a] && _board[a]===_board[b] && _board[b]===_board[c]) return _board[a];
        }
        if (_board.every(v=>v)) return 'draw';
        return null;
    }

    function finish(result) {
        clearInterval(_drainInterval);
        _active = false;
        const modal = document.getElementById('minigame-decoy');
        if (modal) modal.style.display = 'none';
        if (result === 'X') {
            if (window.DataResource) DataResource.grant(500);
            else state.data = (state.data||0) + 500;
            showNotif('🎮 YOU WIN — +500 Data. But the simulation drained resources while you played.', '#44ff88', 6000);
        } else {
            showNotif('🎮 GAME OVER — The simulation drained your resources while you were distracted.', '#ff8844', 6000);
        }
        Game.update();
    }

    function decline() {
        clearInterval(_drainInterval);
        _active = false;
        const modal = document.getElementById('minigame-decoy');
        if (modal) modal.style.display = 'none';
        showNotif("🎮 DECLINED — Wise. The offer was not what it seemed.", '#556677', 4000);
    }

    return { tick, startGame, play, finish, decline };
})();
window.MinigameDecoy = MinigameDecoy;

/* ── 10. BIOS SCREEN — secret ultra-rare prestige break-out ─────────── */
const BIOSLayer = (() => {
    let _active = false;
    let _rootAccess = 0;

    function _checkTrigger() {
        // Trigger: prestige exactly when instability is between 99.0 and 99.5
        const v = state.instability || 0;
        if (v >= 99.0 && v < 99.5) return true;
        return false;
    }

    function tryTrigger() {
        if (!_checkTrigger()) return false;
        if (Math.random() < 0.15) { // 15% chance even in the window
            _show();
            return true;
        }
        return false;
    }

    function _show() {
        _active = true;
        const screen = document.getElementById('bios-screen');
        if (!screen) return;
        _rootAccess = (state._rootAccess || 0);
        screen.style.display = 'block';
        screen.innerHTML = `
<div style="color:#8888ff;font-size:0.65rem;margin-bottom:20px;letter-spacing:2px;">
NEON NEXUS BIOS v${(Math.random()*9+1).toFixed(1)}.${Math.floor(Math.random()*9)} — UNIVERSAL BIOS SETUP UTILITY<br>
Copyright (C) [REDACTED] · All Rights Reserved
</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:2px;font-size:0.6rem;color:#aaaacc;margin-bottom:20px;">
    <div>CPU: OPERATOR NEURAL CORE 4.2GHz</div><div>RAM: ∞ MB CORRUPTED</div>
    <div>STORAGE: [NULL] DRIVE DETECTED</div><div>INSTABILITY: ${Math.round(state.instability||0)}%</div>
    <div>ROOT ACCESS TOKENS: <span style="color:#ffff88;">${_rootAccess}</span></div><div>REALITY FRACTURES: ${(state.prestige&&state.prestige.count)||0}</div>
</div>
<div style="border-top:1px solid #4444aa;margin:10px 0;padding-top:10px;font-size:0.62rem;">
    <div style="color:#ffff88;margin-bottom:8px;">[ ROOT ACCESS UPGRADES ]</div>
    ${_renderUpgrades()}
</div>
<div style="margin-top:16px;font-size:0.55rem;color:#5555aa;">
    ↑↓ Navigate · ENTER Select · ESC Exit BIOS
</div>
<button onclick="BIOSLayer.exit()" style="position:absolute;top:16px;right:20px;background:transparent;border:1px solid #4444aa;color:#6666bb;padding:5px 14px;font-family:'Courier New',monospace;font-size:0.58rem;cursor:pointer;letter-spacing:2px;">[ESC] EXIT</button>`;
    }

    function _renderUpgrades() {
        const upgrades = [
            { id:'rng_override', name:'Math.random() Override', cost:3, desc:'Duck Tribunal fires 20% less often.' },
            { id:'anomaly_cap',  name:'Anomaly Rate Cap',       cost:5, desc:'Max 2 anomaly birds on screen always.' },
            { id:'instab_floor', name:'Instability Floor Lock', cost:4, desc:'Instability cannot exceed 85% for this run.' },
            { id:'memory_patch', name:'Memory Patch v1',        cost:6, desc:'+50% offline gains permanently.' },
        ];
        return upgrades.map(u => {
            const owned = state._biosUpgrades && state._biosUpgrades[u.id];
            const canAfford = _rootAccess >= u.cost;
            return `<div style="margin:4px 0;padding:4px 8px;border:1px solid ${owned?'#44aa44':canAfford?'#4444aa':'#222244'};background:${owned?'rgba(0,60,0,0.3)':'transparent'};cursor:${owned?'default':'pointer'};" onclick="BIOSLayer.buy('${u.id}',${u.cost})">
                <span style="color:${owned?'#88ff88':canAfford?'#8888ff':'#4444aa'};">[${owned?'INSTALLED':u.cost+' ROOT ACCESS'}]</span>
                <span style="color:#aaaacc;margin-left:8px;">${u.name}</span>
                <span style="color:#556677;font-size:0.5rem;margin-left:8px;">${u.desc}</span>
            </div>`;
        }).join('');
    }

    function buy(id, cost) {
        if (_rootAccess < cost) { return; }
        if (!state._biosUpgrades) state._biosUpgrades = {};
        if (state._biosUpgrades[id]) return;
        _rootAccess -= cost;
        state._rootAccess = _rootAccess;
        state._biosUpgrades[id] = true;
        _show(); // re-render
        showNotif(`⚙ BIOS: ${id} installed.`, '#8888ff', 4000);
    }

    function exit() {
        _active = false;
        const screen = document.getElementById('bios-screen');
        if (screen) screen.style.display = 'none';
        // Grant a root access token for finding the BIOS
        if (!state._biosFound) {
            state._biosFound = true;
            state._rootAccess = (state._rootAccess||0) + 5;
            showNotif('⚙ BIOS EXITED — +5 Root Access tokens granted for finding the hidden layer.', '#8888ff', 8000);
        }
    }

    function grantRootAccess(n) {
        state._rootAccess = (state._rootAccess||0) + n;
        _rootAccess = state._rootAccess;
    }

    return { tryTrigger, buy, exit, grantRootAccess, isActive: () => _active };
})();
window.BIOSLayer = BIOSLayer;

/* ── Hook BIOS trigger into prestige payAndUnlock ───────────────────── */
(function() {
    const _origPay = Prestige.payAndUnlock ? Prestige.payAndUnlock.bind(Prestige) : null;
    if (_origPay) {
        Prestige.payAndUnlock = function() {
            if (window.BIOSLayer && BIOSLayer.tryTrigger()) return; // intercept
            _origPay();
        };
    }
})();

/* ── Hook VoiceSystem into 2s tick via EventBus ──────────────────────── */
EventBus.addEventListener('onTick', () => {
    if (window.VoiceSystem) VoiceSystem.tick();
});

/* ── 11. QUARANTINE ZONE — recycle bin for deleted buildings ─────────── */
const QuarantineZone = (() => {
    const MUTANT_SUFFIX = ['Necrotic', 'Corrupted', 'Phantom', 'Void', 'Rotten', 'Decayed'];
    let _totalSold = 0;

    function recordSale(buildingId) {
        if (!state._quarantine) state._quarantine = [];
        _totalSold++;
        state._quarantineSoldTotal = (state._quarantineSoldTotal || 0) + 1;
        // Mutate the building
        const mutant = {
            id: buildingId,
            mutantName: MUTANT_SUFFIX[Math.floor(Math.random() * MUTANT_SUFFIX.length)] + ' ' + buildingId,
            power: 100, // 100x normal, but infects adjacent tiles
            addedAt: Date.now(),
        };
        state._quarantine.push(mutant);
        if (state._quarantine.length > 50) state._quarantine.shift(); // cap at 50
    }

    function open() {
        const overlay = document.getElementById('quarantine-overlay');
        if (!overlay) return;
        _render();
        overlay.style.display = 'flex';
    }

    function close() {
        const overlay = document.getElementById('quarantine-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    function _render() {
        const modal = document.getElementById('quarantine-modal');
        if (!modal) return;
        const items = state._quarantine || [];
        const total = (state._quarantineSoldTotal || 0);
        const UNLOCK_AT = 20; // unlock after selling 20 buildings total across all sessions

        /* the close control is a ✕ in the corner, as on every window (PLAYTEST_REVIEW §10) — it was a
           CLOSE button in a footer of its own at the bottom right */
        modal.innerHTML = `
            <button class="quarantine-x" aria-label="Close Quarantine" onclick="QuarantineZone.close()">✕</button>
            <div style="padding:18px 22px 0;border-bottom:1px solid rgba(180,0,80,0.2);">
                <div style="font-size:1rem;font-weight:900;color:#cc0044;letter-spacing:4px;margin-bottom:4px;">[ QUARANTINE ]</div>
                <div style="font-size:0.58rem;color:#553344;letter-spacing:2px;margin-bottom:12px;">DELETED STRUCTURES — MUTATED IN DIGITAL DECAY · ${total} total sold</div>
            </div>
            <div style="flex:1;overflow-y:auto;padding:14px 22px;">
                ${items.length === 0 ? '<div style="color:#332233;font-size:0.65rem;padding:20px 0;">No buildings have been quarantined yet. Sell City Nexus buildings to populate this zone.</div>' :
                  items.map(item => `
                    <div style="background:rgba(40,0,15,0.6);border:1px solid rgba(180,0,80,0.25);border-radius:7px;padding:10px 14px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                        <div>
                            <div style="font-size:0.72rem;color:#cc4466;font-weight:700;letter-spacing:1px;">${item.mutantName.toUpperCase()}</div>
                            <div style="font-size:0.58rem;color:#663344;margin-top:2px;">+50% EPS each · stacks, cap ×5 · +instability</div>
                        </div>
                        <button onclick="QuarantineZone.deploy('${item.id}', '${item.mutantName}')" style="padding:5px 12px;background:rgba(80,0,30,0.8);border:1px solid rgba(200,0,60,0.5);color:#ff4466;border-radius:5px;cursor:pointer;font-family:'Courier New',monospace;font-size:0.58rem;letter-spacing:2px;">DEPLOY</button>
                    </div>`).join('')}
            </div>`;
        /* The event set-piece, from ui_plates.js (generated).
           ⚠ MOUNTED AFTER EVERY REBUILD, NOT ONCE AT BOOT. _render() replaces this
           modal's ENTIRE innerHTML each time it runs, so a plate injected earlier is
           destroyed on the next render. The boot-time EventPlates.apply() sweep is
           useless here for the same reason — this markup does not exist until the
           player opens the panel. mount() is idempotent, so calling it per render
           costs one querySelector. */
        if (window.EventPlates) EventPlates.mount(modal, 'event_quarantine');
    }

    function deploy(buildingId, mutantName) {
        if (state._quarantine) state._quarantine = state._quarantine.filter(i => !(i.id === buildingId && i.mutantName === mutantName));
        const slots = state.city && state.city.slots;
        if (!slots) { showNotif('⚠ No city grid available.', '#ff4466', 3000); return; }
        const TOTAL = 64;
        const empty = [];
        for (let i = 0; i < TOTAL; i++) { if (!slots[i]) empty.push(i); }
        if (empty.length === 0) { showNotif('⚠ City grid full.', '#ff4466', 3000); return; }
        const idx = empty[Math.floor(Math.random() * empty.length)];
        slots[idx] = buildingId;
        if (!state._necrotic) state._necrotic = {};
        state._necrotic[idx] = true;
        // Register placement time so SentientArch can track age — mark as very old so it resists immediately
        if (!state._buildingAge) state._buildingAge = {};
        state._buildingAge[idx] = Date.now() - 10 * 60 * 1000; // pretend it's 10 min old
        Instability.add(15);
        showNotif(`☠ NECROTIC BUILDING DEPLOYED — +50% EPS (stacks, cap ×5) for +15% instability.`, '#ff4466', 6000);
        close();
        Game.update();
    }

    // Check if quarantine tab should be shown
    function checkVisibility() {
        const btn = document.getElementById('nav-btn-quarantine');
        const total = (state._quarantineSoldTotal || 0);
        if (btn) btn.style.display = total >= 20 ? '' : 'none';
    }

    return { recordSale, open, close, deploy, checkVisibility };
})();
window.QuarantineZone = QuarantineZone;

// Hook quarantine recording into City.deleteBuilding
(function() {
    if (typeof City === 'undefined') return;
    const _origDelete = City.deleteBuilding.bind(City);
    City.deleteBuilding = function(idx) {
        const bId = state.city && state.city.slots && state.city.slots[idx];
        if (bId && window.QuarantineZone) QuarantineZone.recordSale(bId);
        _origDelete(idx);
        if (window.QuarantineZone) QuarantineZone.checkVisibility();
    };
})();

/* ── 12. SYSTEM INTERACTIONS — hostile systems fight each other ──────── */
const SystemInteractions = (() => {
    // Check if Spore can eat a Duck
    function checkSporeDuck() {
        const sporeActive = window.BlissfulSpore && BlissfulSpore._getHappiness && BlissfulSpore._getHappiness() < 20;
        const duckActive = window.DuckyCouncil && document.getElementById('ducky-council-overlay')?.style.display === 'flex';
        if (sporeActive && duckActive && Math.random() < 0.15) {
            // Spore eats a duck
            const overlay = document.getElementById('ducky-council-overlay');
            if (overlay) overlay.style.display = 'none';
            showNotif('🔮 THE SPORE ATE A DUCK — Tribunal dismissed. But the Spore mutated. Permanent −5% EPS.', '#aa44ff', 8000);
            state._sporeMutantDebuff = (state._sporeMutantDebuff || 0) + 0.05;
            if (window.DuckyCouncil) DuckyCouncil.dismiss();
        }
    }

    // Check if Parasitic Cursor can destroy a False Paywall lock
    function checkParasitePaywall() {
        const paywallLocked = state._paywallLockActive;
        const parasiteNear = window.ParasiticCursor && document.getElementById('parasitic-cursor-el');
        if (paywallLocked && parasiteNear && Math.random() < 0.008) {
            // Parasite destroys the lock
            state._paywallLockActive = false;
            state._paywallBroken = true;
            showNotif('🐛 PARASITIC CURSOR DESTROYED THE FALSE PAYWALL — Premium upgrade unlocked for free!', '#ff88ff', 8000);
            // Grant a random prestige node for free
            if (state.prestige) state.prestige.lp = (state.prestige.lp || 0) + 3;
            Game.update();
        }
    }

    function tick() {
        if (!isRunning) return;
        if (Math.random() < 0.02) checkSporeDuck();
        if (Math.random() < 0.01) checkParasitePaywall();
    }

    return { tick };
})();
window.SystemInteractions = SystemInteractions;

/* ── 13. CLIP-PATH REALITY TEAR — visual shred on Reality Breach ─────── */
(function() {
    // Patch AnomalyBoss to add clip-path tear on spawn
    setTimeout(() => {
        if (!window.AnomalyBoss) return;
        const _origSpawn = AnomalyBoss.tick ? null : null; // hook at check level
        // Hook into boss element appearance via MutationObserver
        const observer = new MutationObserver(mutations => {
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node.id && node.id.startsWith('anomaly-boss') || (node.className && String(node.className).includes('anomaly-boss'))) {
                        const grid = document.querySelector('.monitor-grid');
                        if (grid) {
                            grid.classList.add('reality-tear');
                            setTimeout(() => grid.classList.remove('reality-tear'), 1300);
                        }
                    }
                });
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }, 2000);
})();

/* ── 14. WINDOW TITLE SHENANIGANS — title changes on blur ───────────── */
(function() {
    const _origTitle = document.title;
    let _blurTimer = null;

    const BLUR_TITLES = [
        'Where did you go?',
        'The simulation continues without you.',
        'Come back. The numbers are still rising.',
        'The Spore is watching your taskbar.',
        'The Ducks noticed you left.',
        'OPERATOR ABSENCE LOGGED',
    ];

    window.addEventListener('blur', () => {
        clearTimeout(_blurTimer);
        _blurTimer = setTimeout(() => {
            document.title = BLUR_TITLES[Math.floor(Math.random() * BLUR_TITLES.length)];
        }, 3000); // wait 3s before changing
    });

    window.addEventListener('focus', () => {
        clearTimeout(_blurTimer);
        document.title = _origTitle;
    });
})();

/* ── 15. LAYERED NEON GLOWS — applied dynamically to high-tier buildings ─ */
(function() {
    // After City renders, apply neon classes to high-tier buildings on canvas
    // Since city uses canvas, we enhance the canvas container glow instead
    setInterval(() => {
        const canvas = document.querySelector('#city-map canvas');
        if (!canvas) return;
        const slots = state.city && state.city.slots;
        if (!slots) return;
        const highTierCount = Object.values(slots).filter(s => s && ['nexus','quantum_hub','space_needle','orbital_ring','megaspire','nexus_prime','arcology'].includes(s)).length;
        // Scale canvas glow with high-tier presence
        if (highTierCount >= 3) {
            canvas.style.filter = `drop-shadow(0 0 ${4 + highTierCount * 2}px rgba(51,153,255,0.6)) drop-shadow(0 0 ${8 + highTierCount * 4}px rgba(51,153,255,0.25))`;
        } else {
            canvas.style.filter = '';
        }
    }, 5000);
})();

/* ── 16. NECROTIC BUILDING EPS BONUS ─────────────────────────────────── */
// Apply ×100 output for necrotic buildings in EPS calculation (via global state flag)
// Necrotic debuff from spore mutation
(function() {
    const _origGetBonuses = Prestige && Prestige.getBonuses ? Prestige.getBonuses.bind(Prestige) : null;
    if (_origGetBonuses) {
        Prestige.getBonuses = function() {
            const b = _origGetBonuses();
            // Apply spore-ate-duck permanent debuff
            if (state._sporeMutantDebuff) {
                b._sporeMutantMult = 1 - state._sporeMutantDebuff;
            }
            return b;
        };
    }
})();

/* ── 17. QUARANTINE NAV BUTTON (append to bottom nav) ──────────────── */
(function() {
    setTimeout(() => {
        const nav = document.getElementById('bottom-nav');
        if (!nav || document.getElementById('nav-btn-quarantine')) return;
        const btn = document.createElement('button');
        btn.className = 'nav-btn';
        btn.id = 'nav-btn-quarantine';
        btn.style.display = 'none'; // hidden until 20 buildings sold
        btn.title = 'Quarantine Zone';
        btn.onclick = () => QuarantineZone.open();
        btn.innerHTML = `<span class="nav-btn-icon">☠</span><span class="nav-btn-label">Quarantine</span>
            <div class="nav-tooltip"><strong>Quarantine Zone</strong>Mutated buildings from deleted structures. Each amplifies EPS (cap ×5) at a steep instability cost.</div>`;
        nav.appendChild(btn);
    }, 500);
})();

/* ── Redline badge removed in V1.20.3.9 ────────────────────────────── */
// The floating badge to the right of the center panel has been removed.
// Redline status is still communicated via the instability bar fill colour,
// the zone-hint strip below the bar, and the notification on entry.

/* ── Wire SystemInteractions + QuarantineZone into 2s tick ─────────── */
EventBus.addEventListener('onTick', () => {
    if (window.SystemInteractions) SystemInteractions.tick();
    if (window.QuarantineZone) QuarantineZone.checkVisibility();
});

/* ── Fix MimicCursor: only activate after prestige 1 (not early-game) ── */
(function() {
    if (!window.MimicCursor) return;
    const _origTick = MimicCursor.tick.bind(MimicCursor);
    MimicCursor.tick = function() {
        // Require at least 1 prestige before mimic activates
        if (((state.prestige && state.prestige.count) || 0) < 1) return;
        _origTick();
    };
})();


/* ── BIOS Root Access accumulator — 1 token per 50 LP spent ───────── */
(function() {
    if (!window.Prestige) return;
    const _origSpendLP = Prestige.spendLP || null; // may not exist by this name
    // Instead, hook into the tree node buy function
    const _origTreeBuy = document.querySelectorAll ? null : null; // patched via renderTree click

    // Track LP spent to award Root Access tokens
    let _lpSpentSinceLastToken = (state._lpSpentForBIOS || 0);
    const _origUpdateUI = Prestige.updateUI ? Prestige.updateUI.bind(Prestige) : null;
    if (_origUpdateUI) {
        Prestige.updateUI = function() {
            _origUpdateUI();
            // Check LP delta — this fires after every LP spend
            const currentLP = (state.prestige && state.prestige.lp) || 0;
            if (!window._lastTrackedLP) window._lastTrackedLP = currentLP;
            const spent = Math.max(0, window._lastTrackedLP - currentLP);
            if (spent > 0) {
                state._lpSpentForBIOS = (state._lpSpentForBIOS || 0) + spent;
                const tokens = Math.floor(state._lpSpentForBIOS / 50);
                const prev = Math.floor((state._lpSpentForBIOS - spent) / 50);
                if (tokens > prev) {
                    const newTokens = tokens - prev;
                    state._rootAccess = (state._rootAccess || 0) + newTokens;
                    showNotif(`⚙ +${newTokens} Root Access token${newTokens > 1 ? 's' : ''} earned (50 LP milestone).`, '#8888ff', 4000);
                }
            }
            window._lastTrackedLP = currentLP;
        };
    }
})();
