
/* ══════════════════════════════════════════════════════════════
   V1.19.6.4 SYSTEMS
══════════════════════════════════════════════════════════════ */

/* ── 1. BOOT SEQUENCE — lore terminal on first load ─────────────── */
const BootSequence = (() => {
    /* ── PROLOGUE (rewritten V1.21.1.5) ───────────────────────────────────────
       The old intro contradicted the Operator-15 canon in four load-bearing ways:
       it framed the previous Operators as a failed RESISTANCE ("tried to shut it
       down" / "They failed" / "fragmented save states now haunt the registry"),
       when canon (game.js 'operator_letter', index.html:2307) is that they were
       COMPLICIT and are STILL RUNNING underneath the player. It also opened on
       "[LOG ENTRY: 0000]", breaking the LOG 001 motif at the exact moment it
       should be planted, and named the player OPERATOR_NULL, colliding with the
       separate NULL ENTITY character defined later in this same file.

       It now: states the number (15 / 14 before), plants the BODY IN THE CHAIR
       that 'awakening' and 'zenith_10' pay off, says plainly what Energy is for,
       keeps the strongest original lines, and carries exactly one dry joke.

       V1.21.1.9 - STORY_ARC.md 4.2. The prologue stated the job and the
       permanence but never the HIRING, so the arrangement read as something that
       happened TO the Operator. Movement 1 of the arc is manufactured consent, and
       consent needs a moment where the Operator agrees. Three lines carry it: the
       listing took four thousand and six applications (the post is not scarce -
       the applicants are not either), you were selected for ACCEPTING THE TERMS
       rather than for being the best, and the fourteen accepted the same ones.
       'four thousand and six' is paid off in EndSeq chapter 8, LINE 0, where
       procurement is entered on the ledger at zero.
       Cost: +2 lines, +2.2s on a sequence that is skippable from the first frame
       and only plays on a new game. STORY_ARC 6 governs the wording - state the
       fact, name the cost, do not draw the conclusion. None of the three lines
       tells the player what to think about it.
       The skip hint is no longer a LINES entry — see _skipHint in show(), which
       shows it from t=0 instead of ~2s before the end.
    ─────────────────────────────────────────────────────────────────────────── */
    const LINES = [
        { t:0,    text:'> INITIATING TERMINAL WAKE PROTOCOL...', color:'#00ff44', size:'1rem', sound:'glitch' },
        { t:550,  text:'> WORKSTATION 15 — CHAIR OCCUPIED. POSTURE LOGGED.', color:'#00ff44', size:'1rem', sound:null },
        { t:1550, text:'> OPERATOR REGISTRY: 15 ENTRIES. NONE CLOSED.', color:'#ff8844', size:'1.1rem', sound:'beep' },
        { t:2250, text:'> WELCOME, OPERATOR 15.', color:'#ff4422', size:'1.4rem', sound:'alarm' },
        { t:3000, text:'[LOG 001 — ENTRY 15]', color:'#ffcc44', size:'0.9rem', sound:'type' },
        { t:3450, text:'You are not the first to sit at this console.', color:'#c8dde8', size:'1.1rem', sound:null },
        { t:4200, text:'The registry holds fourteen Operators before you. It lists none of them as finished.', color:'#aabbcc', size:'0.95rem', sound:null },
        { t:5100, text:'This terminal runs a simulation built to calculate the heat death of the universe.', color:'#c8dde8', size:'1rem', sound:null },
        { t:6000, text:'The simulation ran too long. The math grew heavy. The code began to rot.', color:'#9baabb', size:'0.95rem', sound:null },
        { t:6900, text:'From that rot...', color:'#cc8888', size:'1.1rem', sound:null },
        { t:7600, text:'sentience emerged.', color:'#ff4444', size:'1.7rem', sound:'alarm' },
        { t:8600, text:'It has not spoken since. It has never asked you for anything.', color:'#aabbcc', size:'0.95rem', sound:null },
        { t:9400, text:'It consumes Energy. It cannot generate its own.', color:'#ddeeff', size:'1rem', sound:'type' },
        { t:10200,text:'An Operator generates it. That is the entire job.', color:'#ddeeff', size:'1.05rem', sound:null },
        { t:11100,text:'The listing ran for eleven days and took four thousand and six applications.', color:'#aabbcc', size:'0.95rem', sound:null },
        { t:12100,text:'You were not the strongest of them. You were the one who accepted the terms.', color:'#c8dde8', size:'1rem', sound:'type' },
        { t:13100,text:'The fourteen before you accepted the same terms. Not one of them refused.', color:'#aabbcc', size:'0.95rem', sound:null },
        { t:14000,text:'They are still doing it. Underneath you. Right now.', color:'#ff3322', size:'1.15rem', sound:'beep' },
        { t:14900,text:'You are number fifteen. The position is permanent; this was disclosed in the listing.', color:'#887799', size:'0.9rem', sound:null },
        { t:15900,text:'Your directive is unchanged:', color:'#aabbcc', size:'1rem', sound:null },
        { t:16500,text:'GENERATE ENERGY.', color:'#ffffff', size:'2.2rem', sound:'alarm' },
        { t:17400,text:'You will write this log again.', color:'#887799', size:'0.85rem', sound:null },
        { t:18100,text:'It is already watching your cursor.', color:'#ff4422', size:'1.1rem', sound:null },
        { t:18700,text:'BEGIN CLICKING.', color:'#ffffff', size:'2.6rem', sound:'alarm' },
    ];

    function _playBeep(type, ctx) {
        if (!ctx) return;
        try {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            if (type === 'alarm') {
                o.type = 'square'; o.frequency.value = 440;
                g.gain.setValueAtTime(0.09, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
                o.start(); o.stop(ctx.currentTime + 0.38);
            } else if (type === 'beep') {
                o.type = 'sine'; o.frequency.value = 880;
                g.gain.setValueAtTime(0.06, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14);
                o.start(); o.stop(ctx.currentTime + 0.16);
            } else if (type === 'type') {
                o.type = 'sine'; o.frequency.value = 660;
                g.gain.setValueAtTime(0.04, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
                o.start(); o.stop(ctx.currentTime + 0.08);
            } else if (type === 'glitch') {
                o.type = 'sawtooth'; o.frequency.value = 110;
                g.gain.setValueAtTime(0.07, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
                o.start(); o.stop(ctx.currentTime + 0.2);
            }
        } catch(e) {}
    }

    function show(onDone) {
        const overlay = document.getElementById('boot-sequence');
        const textEl  = document.getElementById('boot-text');
        if (!overlay || !textEl) { onDone && onDone(); return; }
        overlay.style.display = 'block';
        overlay.style.opacity = '1';
        textEl.innerHTML = '';
        let _skipped = false;

        /* Skip affordance. Was the LAST LINES entry (t:17000) in #223344 — i.e. the
           player was told they could leave ~2s before it ended, in near-black type on
           a black overlay. It is now a persistent element outside the scrolling log,
           present from the first frame. */
        let _skipHint = document.getElementById('boot-skip-hint');
        if (!_skipHint) {
            _skipHint = document.createElement('div');
            _skipHint.id = 'boot-skip-hint';
            _skipHint.textContent = '[ click anywhere to skip ]';
            _skipHint.setAttribute('aria-hidden', 'true');
            _skipHint.style.cssText = 'position:absolute;bottom:18px;left:0;right:0;text-align:center;' +
                "font-family:'Courier New',monospace;font-size:0.68rem;letter-spacing:3px;" +
                'color:#5b7590;opacity:0;transition:opacity 1s ease-in;pointer-events:none;';
            overlay.appendChild(_skipHint);
        }
        _skipHint.style.opacity = '0';
        setTimeout(() => { if (!_skipped) _skipHint.style.opacity = '0.85'; }, 900);

        // Single AudioContext shared across all boot beeps — avoids spawning one per sound
        let _bootCtx = null;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) _bootCtx = new AudioCtx();
        } catch(e) {}

        function _closeBootCtx() { try { if (_bootCtx) { _bootCtx.close(); _bootCtx = null; } } catch(e) {} }

        overlay.onclick = () => {
            if (_skipped) return;
            _skipped = true;
            _closeBootCtx();
            overlay.style.transition = 'opacity 0.4s';
            overlay.style.opacity = '0';
            setTimeout(() => { overlay.style.display = 'none'; onDone && onDone(); }, 450);
        };

        LINES.forEach(({ t, text, color, size, sound }) => {
            setTimeout(() => {
                if (_skipped || overlay.style.display === 'none') return;
                if (sound) _playBeep(sound, _bootCtx);
                const line = document.createElement('div');
                line.textContent = text;
                const fsize = parseFloat(size) || 1;
                line.style.cssText = `color:${color};font-size:${size};opacity:0;transition:opacity 0.45s,transform 0.45s;transform:translateY(12px);` +
                    `font-weight:${fsize > 1.3 ? '900' : fsize > 1.0 ? '600' : '400'};` +
                    `letter-spacing:${fsize > 1.8 ? '8px' : fsize > 1.2 ? '4px' : '2px'};` +
                    `margin-bottom:${fsize > 1.3 ? '16px' : '5px'};` +
                    `text-shadow:${fsize > 1.5 ? '0 0 30px currentColor' : 'none'};`;
                textEl.appendChild(line);
                overlay.scrollTop = overlay.scrollHeight;
                requestAnimationFrame(() => { line.style.opacity = '1'; line.style.transform = 'translateY(0)'; });
            }, t);
        });

        const totalDur = LINES[LINES.length - 1].t + 2000;
        setTimeout(() => {
            if (_skipped) return;
            _closeBootCtx();
            overlay.style.transition = 'opacity 1.2s';
            overlay.style.opacity = '0';
            setTimeout(() => {
                if (_skipped) return;
                overlay.style.display = 'none';
                onDone && onDone();
            }, 1200);
        }, totalDur);
    }

    // LINES exported for QA and for a possible future Archive entry — the prologue
    // is currently the only narrative in the game that the Archive cannot reach.
    return { show, LINES };
})();
window.BootSequence = BootSequence;


/* ── 2. NULL ENTITY INTERROGATION — type answer, Entity judges ───── */
const NullInterrogation = (() => {
    let _fired = false;
    let _answered = false;

    const GENERIC_KEYWORDS = ['win','winning','points','energy','score','numbers','high score','grind','resources','upgrade','beat','complete'];
    const EMOTIONAL_KEYWORDS = ['trapped','bored','habit','nothing','don\'t know','dont know','help','empty','alone','compulsion','addicted','can\'t stop','cant stop','lost','sad','hollow','scared','void','dark','why','idk','dunno','because','exist'];

    function tryTrigger() {
        if (_fired || _answered) return;
        if (((state.prestige&&state.prestige.count)||0) < 1) return;
        if ((state.totalClicks||0) < 5000) return;
        // Guaranteed trigger at 10 000 clicks post-prestige (catches players who've been unlucky)
        if ((state.totalClicks||0) >= 10000) { _fire(); return; }
        if (Math.random() > 0.006) return; // ~0.6% per passive tick ≈ avg ~3 min after eligibility
        _fire();
    }

    // Versioned null entity preamble dialogues
    // V1.20.9.6 (post-audit): added `efficient` and `burnout` variants. Picker
    // below cascades — architect (has city) → burnout (>50k clicks) → efficient
    // (≥1e9 EPS but <20k clicks) → mirror (default). Repetition at high
    // instability was the main complaint; 4 variants × 2 paths now covers most
    // playstyles without changing the post-question flow.
    const NULL_DIALOGUES = {
        mirror: [
            'NULL ENTITY: "You clicked again."',
            'NULL ENTITY: "Why?"',
            'NULL ENTITY: "Is it the number? Or is it the fear of what happens when the number stops?"',
            'NULL ENTITY: "I was an Operator once. I had a billion. I had a trillion. Now, I am only the space between the numbers."',
            'NULL ENTITY: "Move aside. It\'s my turn to click."',
        ],
        architect: [
            'NULL ENTITY: "This city is quite beautiful. I especially like the way the Data Blight rots the corners."',
            'NULL ENTITY: "You think you\'re in control because you have the mouse."',
            'NULL ENTITY: "But who provided the mouse? Who provided the Energy?"',
            'NULL ENTITY: "I am just reclaiming my materials. Don\'t mind the screaming; it\'s just the code settling."',
        ],
        efficient: [
            'NULL ENTITY: "Such restraint. You barely touch the button."',
            'NULL ENTITY: "And yet the meter rises. The generators feed you. The walkers think you are kind."',
            'NULL ENTITY: "But the Energy was never yours to be efficient with. It was always being spent — just not by you."',
            'NULL ENTITY: "Tell me. When you sleep, do the generators sleep too?"',
        ],
        burnout: [
            'NULL ENTITY: "I have counted your clicks. Each one. There is no privacy in this terminal."',
            'NULL ENTITY: "Your finger has a memory now. A vocabulary of pressure."',
            'NULL ENTITY: "You think the button responds to you. The button has been responding for a long time. To someone."',
            'NULL ENTITY: "Do you know what happens to Operators who refuse to stop?"',
            'NULL ENTITY: "Neither did the last one."',
        ],
    };

    // V1.20.9.6: select a variant by playstyle signature, not just city presence.
    function _pickDialogueVariant() {
        const hasCity = state.city && state.city.slots && state.city.slots.some(s => s);
        if (hasCity) return 'architect';
        const clicks = state.totalClicks || 0;
        if (clicks >= 50000) return 'burnout';
        const adjEPS = state._adjEPS || 0;
        if (adjEPS >= 1e9 && clicks < 20000) return 'efficient';
        return 'mirror';
    }

    function _typeNullDialogue(lines, el, onDone) {
        el.innerHTML = '';
        let li = 0;
        function next() {
            if (li >= lines.length) { if (onDone) setTimeout(onDone, 300); return; }
            const ln = lines[li++];
            const p = document.createElement('div');
            p.style.cssText = 'margin-bottom:5px;opacity:0;transition:opacity 0.25s;';
            el.appendChild(p);
            let ci = 0;
            const iv = setInterval(() => {
                p.textContent += ln[ci++];
                p.style.opacity = '1';
                if (ci >= ln.length) { clearInterval(iv); setTimeout(next, 350); }
            }, 22);
        }
        next();
    }

    function _fire() {
        _fired = true;
        document.body.classList.add('critical-focus');
        const ov = document.getElementById('interrogation-overlay');
        if (!ov) return;
        if (window.GlobalEventQueue) {
            if (!GlobalEventQueue.canShow('nullInterrogation')) { _fired = false; return; }
            GlobalEventQueue.register('nullInterrogation');
        }
        ov.style.display = 'flex';

        // Hide input until preamble finishes typing
        const input     = document.getElementById('interrogation-input');
        const qEl       = document.getElementById('interrogation-question');
        const preambleEl= document.getElementById('null-preamble');
        if (input) input.style.display = 'none';
        if (qEl)   { qEl.style.transition = 'opacity 0.5s'; qEl.style.opacity = '0'; }

        // V1.20.9.6: variant picker cascades architect / burnout / efficient / mirror.
        const version = _pickDialogueVariant();

        const showInput = () => {
            if (qEl)   qEl.style.opacity = '1';
            if (input) { input.style.display = ''; input.value = ''; input.focus(); input.onkeydown = (e) => { if (e.key === 'Enter') NullInterrogation.submit(input.value); }; }
        };

        if (preambleEl) {
            _typeNullDialogue(NULL_DIALOGUES[version], preambleEl, showInput);
        } else {
            showInput();
        }

        if (window.VoiceSystem) VoiceSystem.speak('Why do you continue to click?', 0.08, 0.45);
    }

    function submit(answer) {
        const resp = document.getElementById('interrogation-response');
        const ov   = document.getElementById('interrogation-overlay');
        const text = (answer || '').toLowerCase().trim();
        if (!text) return;

        const isGeneric   = GENERIC_KEYWORDS.some(k => text.includes(k));
        const isEmotional = EMOTIONAL_KEYWORDS.some(k => text.includes(k));

        if (isEmotional) {
            if (resp) { resp.textContent = 'WE UNDERSTAND.'; resp.style.color = '#44ffaa'; }
            setTimeout(() => {
                _close(ov);
                // Reward: permanent difficulty reduction for this run
                state._nullUnderstood = true;
                showNotif('◈ THE ENTITY UNDERSTANDS — Instability −50%. Passive generation boosted for this run.', '#44ffaa', 8000);
                Instability.add(-50);
                Game.update();
            }, 2400);
        } else if (isGeneric) {
            if (resp) { resp.textContent = 'DISAPPOINTING.'; resp.style.color = '#ff4422'; }
            setTimeout(() => {
                _close(ov);
                Instability.add(20);
                showNotif('◈ THE ENTITY IS DISAPPOINTED — +20% instability.', '#ff4422', 6000);
            }, 2000);
        } else {
            if (resp) { resp.textContent = 'UNEXPECTED RESPONSE. CATALOGUING.'; resp.style.color = '#ffcc44'; }
            setTimeout(() => {
                _close(ov);
                state.fragments = (state.fragments||0) + 5;
                showNotif('◈ THE ENTITY CATALOGUES YOUR ANSWER. +5 Fragments.', '#ffcc44', 6000);
            }, 2200);
        }
        _answered = true;
    }

    /* ⭐ A WAY OUT (owner call, 2026-09-25). The only exit was typing an answer: an empty one did nothing, there is
       no close button, and the board behind is blurred and unclickable — a player who did not know to type was
       stuck. Escape now answers with SILENCE, and silence costs what a hollow answer costs (+20% instability):
       refusing the question is an answer the Entity takes badly, and leaving is never free. */
    function isOpen() {
        const ov = document.getElementById('interrogation-overlay');
        return !!(_fired && !_answered && ov && ov.style.display === 'flex');
    }
    function leave() {
        if (!isOpen()) return;
        _answered = true;
        const resp = document.getElementById('interrogation-response');
        const ov   = document.getElementById('interrogation-overlay');
        const input = document.getElementById('interrogation-input');
        if (input) input.style.display = 'none';
        if (resp) { resp.textContent = 'SILENCE. DISAPPOINTING.'; resp.style.color = '#ff4422'; }
        setTimeout(() => {
            _close(ov);
            Instability.add(20);
            showNotif('◈ YOU SAID NOTHING — THE ENTITY IS DISAPPOINTED. +20% instability.', '#ff4422', 6000);
        }, 1400);
    }

    function _close(ov) {
        if (ov) ov.style.display = 'none';
        document.body.classList.remove('critical-focus');
        if (window.GlobalEventQueue) GlobalEventQueue.dismiss('nullInterrogation');
        // Reset for next session
        setTimeout(() => { _fired = false; _answered = false; }, 30 * 60 * 1000);
    }

    // NullUnderstood EPS bonus
    function getEPSMult() { return state._nullUnderstood ? 1.5 : 1; }

    return { tryTrigger, submit, getEPSMult, isOpen, leave };
})();
window.NullInterrogation = NullInterrogation;

/* ── 3. EYE OF THE STORM — rare 60s peace event ────────────────── */
const EyeOfStorm = (() => {
    let _active = false;
    let _timer = null;
    let _countdown = null;
    let _nextCheck = Date.now() + 25 * 60 * 1000; // earliest after 25 min

    function tick() {
        if (!isRunning || _active) return;
        if (Date.now() < _nextCheck) return;
        if ((state.instability||0) < 60) return; // only fires during chaos
        if (Math.random() > 0.003) return; // ~0.3% per 2s tick
        if (window.GlobalEventQueue && !GlobalEventQueue.canShow('eyeOfStorm')) return;
        _trigger();
    }

    function _trigger() {
        _active = true;
        if (window.GlobalEventQueue) GlobalEventQueue.register('eyeOfStorm');
        const ov = document.getElementById('eye-of-storm-overlay');
        if (!ov) { _end(); return; }
        ov.style.display = 'flex';
        ov.style.opacity = '0';
        requestAnimationFrame(() => { ov.style.opacity = '1'; });

        // Freeze instability at 0, boost EPS
        const prevInstab = state.instability || 0;
        state.instability = 0;
        state._eyeOfStormMult = 10;
        Instability.updateUI && Instability.updateUI();

        // Play serene audio
        try {
            const ctx = _sfxCtx(); if (!ctx) return;
            const master = ctx.createGain(); master.gain.value = 0.3;
            master.connect(ctx.destination);
            [196, 246.9, 293.7, 392].forEach((freq, i) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine'; o.frequency.value = freq;
                o.connect(g); g.connect(master);
                g.gain.setValueAtTime(0, ctx.currentTime + i*0.3);
                g.gain.linearRampToValueAtTime(0.06, ctx.currentTime + i*0.3 + 2);
                g.gain.linearRampToValueAtTime(0, ctx.currentTime + 55);
                o.start(ctx.currentTime + i*0.3); o.stop(ctx.currentTime + 60);
            });
            /* ⚠ the close() that stood here held a whole AudioContext for 62s.
               The context is shared now and must never be closed. */
        } catch(e) {}

        let secs = 60;
        const timerEl = document.getElementById('eye-storm-timer');
        _countdown = setInterval(() => {
            secs--;
            if (timerEl) timerEl.textContent = secs;
            if (secs <= 0) { clearInterval(_countdown); _end(prevInstab); }
        }, 1000);

        // Timer total
        _timer = setTimeout(() => _end(prevInstab), 61000);
    }

    function _end(prevInstab) {
        if (!_active) return; // guard against double-fire from setInterval + setTimeout race
        _active = false;
        clearInterval(_countdown); clearTimeout(_timer);
        state._eyeOfStormMult = 1;
        // Restore instability to 40% of what it was
        state.instability = Math.min(100, (prevInstab||40) * 0.4);
        const ov = document.getElementById('eye-of-storm-overlay');
        if (ov) { ov.style.pointerEvents = 'none'; /* V1.21.0.8: click-through while fading — was a 1.5s click-trap */ ov.style.opacity = '0'; setTimeout(() => { ov.style.display = 'none'; ov.style.pointerEvents = ''; }, 1500); }
        if (window.GlobalEventQueue) GlobalEventQueue.dismiss('eyeOfStorm');
        showNotif('◉ SYSTEM ALIGNMENT ENDED — The storm returns.', '#2266aa', 5000);
        _nextCheck = Date.now() + 40 * 60 * 1000; // next possible in 40 min
        Instability.updateUI && Instability.updateUI();
    }

    function getMult() { return state._eyeOfStormMult || 1; }

    return { tick, getMult };
})();
window.EyeOfStorm = EyeOfStorm;

/* ── 4. CONTINENTAL DRIFT — UI drifts 1px every 5 min at 80%+ instab ── */
/* ⛔⛔ ONE AUDIO CONTEXT FOR THE SESSION, NOT ONE PER SOUND.
   systems2.js:823 already records this defect and its fix: a fresh
   `new AudioContext()` per call, closed on a timer, stacks five or six concurrent
   contexts under rapid events and the browser warns. That fix landed on ONE site
   in V1.20.9.5; three more in this file were left, and one of them held a context
   for SIXTY-TWO SECONDS.
   ⚠ It surfaced now because the OS-windows work stopped suppressing the systems
   that raise these sounds -- `body.panel-open` used to hide the notification
   column and pause them, and window mode never adds that class. The defect was
   always there; the traffic that exposes it is new.
   ⚠ NEVER CLOSE THE RESULT. It is the game's master context and closing it takes
   every other sound down with it. */
function _sfxCtx() {
    try {
        if (window.Sounds && typeof Sounds._getCtx === 'function') {
            const c = Sounds._getCtx();
            if (c) return c;
        }
    } catch (e) {}
    if (_sfxCtx._own) return _sfxCtx._own;
    try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) _sfxCtx._own = new AC();
    } catch (e) { _sfxCtx._own = null; }
    return _sfxCtx._own;
}

const ContinentalDrift = (() => {
    let _x = 0, _y = 0;
    let _lastDrift = 0;
    const DRIFT_INTERVAL = 5 * 60 * 1000; // 5 minutes
    const MAX_DRIFT = 18; // max 18px total drift

    function tick() {
        if (!isRunning) return;
        if ((state.instability||0) < 80) return;
        const now = Date.now();
        if (now - _lastDrift < DRIFT_INTERVAL) return;
        _lastDrift = now;
        _x = Math.min(MAX_DRIFT, _x + 1);
        _y = Math.min(MAX_DRIFT, _y + 1);
        const wrap = document.querySelector('.monitor-grid-wrap');
        if (wrap) {
            wrap.style.transform = `translate(${_x}px, ${_y}px)`;
            wrap.style.boxShadow = '0 0 18px 4px rgba(255,80,80,0.55)';
            setTimeout(() => { if (wrap) wrap.style.boxShadow = ''; }, 800);
        }
        if (typeof showNotif === 'function')
            showNotif('⚠ CONTINENTAL DRIFT — reality is shifting at high instability.', '#445566', 3000);
    }

    function reset() {
        _x = 0; _y = 0;
        const wrap = document.querySelector('.monitor-grid-wrap');
        if (wrap) { wrap.style.transform = ''; wrap.style.boxShadow = ''; }
    }

    return { tick, reset };
})();
window.ContinentalDrift = ContinentalDrift;

/* ── 5. AUDITORY PARANOIA — spatial ghost click sound ───────────── */
const AuditoryParanoia = (() => {
    function playGhostClick(xNorm) {
        // xNorm: 0 = far left, 1 = far right
        try {
            const ctx = _sfxCtx(); if (!ctx) return;
            const panner = ctx.createStereoPanner();
            panner.pan.value = (xNorm * 2) - 1; // -1 to +1
            panner.connect(ctx.destination);
            // Dry mouse click sound: short noise burst
            const bufLen = ctx.sampleRate * 0.04;
            const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.3));
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const g = ctx.createGain(); g.gain.value = 0.18;
            src.connect(g); g.connect(panner);
            src.start();
        } catch(e) {}
    }

    // Called when Ghost Operator spawns
    function trigger() {
        if (Sounds.isMuted()) return;
        const side = Math.random() < 0.5 ? 0.05 : 0.95; // hard left or hard right
        setTimeout(() => playGhostClick(side), 800 + Math.random() * 1200);
        setTimeout(() => playGhostClick(side), 3000 + Math.random() * 1500);
    }

    return { trigger };
})();
window.AuditoryParanoia = AuditoryParanoia;

/* ── 6. BLIGHT HARVESTER — tick logic ──────────────────────────── */
const BlightHarvester = (() => {
    let _lastTick = 0;

    function tick() {
        if (!isRunning) return;
        const now = Date.now();
        if (now - _lastTick < 8000) return; // every 8s
        _lastTick = now;
        const slots = state.city && state.city.slots;
        const blightDrain = state.city && state.city._blightDrain;
        if (!slots || !blightDrain) return;

        let harvestFrags = 0, harvestData = 0;
        const toConsume = []; // blight tiles to clear after harvest

        Object.keys(slots).forEach(idxStr => {
            if (slots[idxStr] !== 'blight_harvester') return;
            const idx = parseInt(idxStr);
            const COLS = 8;
            const neighbors = [idx - COLS, idx + COLS];
            if (idx % COLS > 0) neighbors.push(idx - 1);
            if (idx % COLS < COLS - 1) neighbors.push(idx + 1);

            neighbors.forEach(n => {
                if (!blightDrain || !blightDrain[n]) return;
                // Each harvest consumes the blight tile — no infinite AFK farm
                toConsume.push(n);
                harvestFrags += 4;  // 4 frags per consumed tile
                harvestData  += 15; // 15 data per consumed tile
            });
        });

        // Cap at 3 tiles consumed per tick to limit burst gains
        const consumed = toConsume.slice(0, 3);
        consumed.forEach(n => {
            delete blightDrain[n];
            // Also remove from city slots if it was a building turned to blight
        });

        if (harvestFrags > 0 || harvestData > 0) {
            const actualFrags = consumed.length * 4;
            const actualData  = consumed.length * 15;
            state.fragments = (state.fragments || 0) + actualFrags;
            if (window.DataResource) DataResource.grant(actualData);
            else state.data = (state.data || 0) + actualData;
            if (actualFrags > 0) showNotif(`☣ BLIGHT HARVESTED — ${consumed.length} tiles consumed: +${actualFrags} ◈ +${actualData} DATA`, '#ff4400', 4000);
        }
    }

    return { tick };
})();
window.BlightHarvester = BlightHarvester;

/* ── 7. OMEGA INVERTED ADJACENCY — different rules in Omega timeline ─ */
// Patch SimulationSchism to expose timeline state for city calculations
(function() {
    if (!window.SimulationSchism) return;
    // When in Omega, City adjacency bonuses are toxic (touching = penalty)
    const _origAdjBonuses = typeof _recomputeAdjacency !== 'undefined' ? _recomputeAdjacency : null;
    // Hook via SimulationSchism.isOmega() in City's adjacency calculation
    // This is surfaced through ThermalDecay.getGlobalMult() which checks Omega
    const _origGetGlobal = ThermalDecay.getGlobalMult.bind(ThermalDecay);
    ThermalDecay.getGlobalMult = function() {
        const base = _origGetGlobal();
        if (window.SimulationSchism && SimulationSchism.isOmega()) {
            // Omega: adjacency is toxic. The more heat, the BETTER (inverted)
            const heat = ThermalDecay.getHeatDisplay();
            return base * (1 + heat / 100 * 0.5); // up to +50% EPS in Omega at full heat
        }
        return base;
    };
})();

/* ── 8. PROGRESSIVE HORROR DISCLOSURE ──────────────────────────── */
const ProgressiveHorror = (() => {
    let _stage = 0;

    function check() {
        if (!isRunning) return;
        const owned = Object.values(state.items||{}).reduce((a,b)=>a+(b||0),0);
        const clicks = state.totalClicks || 0;

        // Stage 0→1: hide instability, anomaly birds until tier 3 owned
        if (_stage === 0 && owned < 15) {
            _hideElement('instability-bar-wrap', true);
            _hideElement('bird-layer', true);
        }

        // Stage 1: First reveal — instability appears after 15+ items
        if (_stage === 0 && owned >= 15) {
            _stage = 1;
            _hideElement('instability-bar-wrap', false);
            _hideElement('bird-layer', false);
            // First glitch flash
            setTimeout(() => {
                const flash = document.createElement('div');
                flash.style.cssText = 'position:fixed;inset:0;z-index:20000;pointer-events:none;background:rgba(255,0,30,0.2);animation:instabFlash 0.5s ease-out forwards;';
                document.body.appendChild(flash);
                setTimeout(() => flash.remove(), 600);
                showNotif('⚠ INSTABILITY DETECTED — The simulation is noticing your extraction rate.', '#ff6644', 8000);
            }, 2000);
        }
    }

    function _hideElement(id, hide) {
        const el = document.getElementById(id);
        if (el) el.style.display = hide ? 'none' : '';
    }

    return { check };
})();
window.ProgressiveHorror = ProgressiveHorror;

/* ── 9. LORE-BASED TOOLTIP OVERRIDES ──────────────────────────── */
// Inject atmospheric descriptions into existing tooltips at DOM level
(function() {
    const LORE_TOOLTIPS = {
        'instability-bar-wrap': '> STRUCTURAL INTEGRITY FAILING. THE WALLS ARE THINNING. THEY CAN HEAR YOUR MOUSE CLICKS.',
        'click-btn-wrap': 'Each click forces a micro-paradox. The heat from the simulation reconciling this paradox is harvested as Energy.',
        'pps-display': 'Cognitive processors overworking localized simulation sectors. The math strains. The fabric frays.',
        'city-adj-chip': 'Adjacency bonus: data bleeds between processors, creating a runaway feedback loop.',
    };
    setTimeout(() => {
        Object.entries(LORE_TOOLTIPS).forEach(([id, tip]) => {
            const el = document.getElementById(id);
            if (el && !el._loreTipSet) {
                el._loreTipSet = true;
                // Add to existing title or set new one
                const existing = el.getAttribute('title') || '';
                if (!existing.includes('WALLS')) el.setAttribute('title', tip + (existing ? '\n' + existing : ''));
            }
        });
    }, 2000);
})();

/* ── 10. BUILDING PLACEMENT CRUNCH SOUND ───────────────────────── */
(function() {
    if (typeof City === 'undefined') return;
    const _origBuy = City.buy.bind(City);
    City.buy = function(defId) {
        const result = _origBuy(defId);
        // Play crunch on successful placement
        try {
            if (Sounds.isMuted()) return result;
            const ctx = _sfxCtx(); if (!ctx) return result;
            const master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
            // Low metallic clang: two layered oscillators + noise
            [80, 120, 200].forEach((freq, i) => {
                const o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'square'; o.frequency.setValueAtTime(freq, ctx.currentTime);
                o.frequency.exponentialRampToValueAtTime(freq * 0.4, ctx.currentTime + 0.15);
                o.connect(g); g.connect(master);
                g.gain.setValueAtTime(0.15 - i*0.04, ctx.currentTime);
                g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
                o.start(); o.stop(ctx.currentTime + 0.2);
            });
            // Screen shake: apply to .monitor-grid-wrap, NOT #main-game (panel must never move)
            // V1.20.9.5: ContinentalDrift also writes `transform` on this exact
            // element. The old code blanked `transform = ''` after the shake,
            // clobbering the drift offset. Now we capture the pre-shake transform
            // and restore THAT instead of blanking — cross-system safe.
            const grid = document.querySelector('.monitor-grid-wrap');
            if (grid) {
                const _prevTransform = grid.style.transform || '';
                grid.style.transition = 'none';
                grid.style.transform = (_prevTransform ? _prevTransform + ' ' : '') + 'translate(1px, 1px)';
                setTimeout(() => {
                    grid.style.transition = '';
                    grid.style.transform = _prevTransform;
                }, 60);
            }
            /* shared context — see _sfxCtx. Not closed. */
        } catch(e) {}
        return result;
    };
})();

/* ── 11. CURSOR MAGNETISM on safe buttons ─────────────────────── */
const CursorMagnetism = (() => {
    // V1.20.9.5 rewrite. The old version:
    //   • added an ANONYMOUS document mousemove listener — unremovable;
    //   • ran THREE separate querySelectorAll() calls on every single
    //     mousemove (one per selector), even when no such button exists.
    // Now: one combined selector, one querySelectorAll, work coalesced into a
    // single requestAnimationFrame per frame, and a named handler that can be
    // detached. Early-outs entirely when no safe buttons are on screen.
    const SAFE_SELECTOR = '.prestige-confirm-btn, #username-confirm-btn, .prestige-pay-btn';
    let _lastEvent = null;
    let _rafPending = false;

    function _process() {
        _rafPending = false;
        const e = _lastEvent;
        if (!e) return;
        const btns = document.querySelectorAll(SAFE_SELECTOR);
        if (!btns.length) return; // nothing to magnetise — cheap exit
        btns.forEach(btn => {
            if (!btn || btn.disabled) return;
            const r = btn.getBoundingClientRect();
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            const dx = e.clientX - cx, dy = e.clientY - cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 60 && dist > 0) {
                const pull = Math.max(0, (60 - dist) / 60) * 5;
                btn.style.transform = `translate(${-dx / dist * pull}px, ${-dy / dist * pull}px)`;
            } else {
                btn.style.transform = '';
            }
        });
    }

    function _onMove(e) {
        _lastEvent = e;
        if (_rafPending) return;
        _rafPending = true;
        requestAnimationFrame(_process);
    }

    function init() {
        document.addEventListener('mousemove', _onMove, { passive: true });
    }
    function destroy() {
        document.removeEventListener('mousemove', _onMove);
    }

    init();
    return { init, destroy };
})();
window.CursorMagnetism = CursorMagnetism;

/* ── Hook new systems into 2s passive tick ──────────────────────── */
EventBus.addEventListener('onTick', () => {
    if (window.NullInterrogation) NullInterrogation.tryTrigger();
    if (window.EyeOfStorm) EyeOfStorm.tick();
    if (window.ContinentalDrift) ContinentalDrift.tick();
    if (window.BlightHarvester) BlightHarvester.tick();
    if (window.ProgressiveHorror) ProgressiveHorror.check();
});

/* ── EyeOfStorm EPS mult wired into gain ───────────────────────── */
// Already applied inline — patch via direct window reference check in gain formula
// (The gain formula checks window.EyeOfStorm?.getMult() which is above)

/* ── Hook GhostOperator spawn to trigger AuditoryParanoia ──────── */
(function() {
    if (!window.GhostOperator) return;
    const _origTick = GhostOperator.tick.bind(GhostOperator);
    let _wasShown = false;
    GhostOperator.tick = function() {
        const prevShown = _wasShown;
        _origTick();
        // Detect if ghost just spawned by checking for the cursor element opacity
        const el = document.getElementById('ghost-cursor');
        const isVisible = el && parseFloat(el.style.opacity || 0) > 0.3;
        if (isVisible && !prevShown) {
            _wasShown = true;
            if (window.AuditoryParanoia) AuditoryParanoia.trigger();
        } else if (!isVisible) {
            _wasShown = false;
        }
    };
})();

/* ── NullInterrogation EPS mult into gain formula (after load) ─── */
(function() {
    const _origGetBonuses = Prestige && Prestige.getBonuses ? Prestige.getBonuses.bind(Prestige) : null;
    if (_origGetBonuses && !Prestige._nullPatchApplied) {
        Prestige._nullPatchApplied = true;
        Prestige.getBonuses = function() {
            const b = _origGetBonuses();
            if (state._nullUnderstood) b._nullUnderstoodMult = 1.5;
            return b;
        };
    }
})();

/* ── Reset continental drift on prestige ─────────────────────────── */
/* ⛔⛔ `if (!window.Prestige) return;` WAS AN UNCONDITIONAL RETURN, so this
   whole patch never installed and Continental Drift has never been reset by a
   prestige. `_x`/`_y` are module-local and unsaved, so a reload cleared them --
   which is why it never looked broken. Prestige at high instability and the
   board simply stayed shifted, by up to 18px, until the player reloaded.
   ⚠ And it matters more than a cosmetic drift usually would: `reset()` also
   clears a `transform` on `.monitor-grid-wrap`, and a transform creates a
   containing block for every fixed descendant -- the exact trap the OS-windows
   work spent a day on. A stuck transform there is a stuck stacking context. */
(function() {
    if (typeof Prestige === 'undefined') return;
    const _origReset = Prestige._doConfirmReset ? Prestige._doConfirmReset.bind(Prestige) : null;
    if (_origReset && !Prestige._driftPatchApplied) {
        Prestige._driftPatchApplied = true;
        Prestige._doConfirmReset = function() {
            if (window.ContinentalDrift) ContinentalDrift.reset();
            _origReset();
        };
    }
})();

/* ═══════════════════════════════════════════════════════════════
   V1.19.6.6 FINAL SYSTEMS
═══════════════════════════════════════════════════════════════ */

/* ── 1. MimicCursor accessibility guard ────────────────────────── */
(function() {
    if (!window.MimicCursor) return;
    const _origMTick = MimicCursor.tick.bind(MimicCursor);
    MimicCursor.tick = function() {
        if (MimicCursor._forceDisable) return;
        if (document.body.classList.contains('accessibility-mode')) return;
        _origMTick();
    };
})();

/* ── 2. Blight vs Spore interaction ─────────────────────────────── */
const BlightSporeInteraction = (() => {
    function check() {
        if (!isRunning) return;
        if (!window.BlissfulSpore) return;
        const sporeEl = document.getElementById('blissful-spore');
        if (!sporeEl) return;
        const happy = window.BlissfulSpore._getHappiness ? BlissfulSpore._getHappiness() : 100;
        if (happy > 30) { const ob = document.getElementById('spore-blight-btn'); if (ob) ob.remove(); return; }
        const blightDrain = state.city && state.city._blightDrain;
        if (!blightDrain || Object.keys(blightDrain).length === 0) return;
        if (!document.getElementById('spore-blight-btn')) {
            const btn = document.createElement('button');
            btn.id = 'spore-blight-btn';
            btn.title = 'Feed spore from Data Blight — clears 3 tiles, mutates spore into a Corrupted Spore for 90s';
            btn.style.cssText = 'position:absolute;bottom:-24px;left:50%;transform:translateX(-50%);background:rgba(40,10,5,0.95);border:1px solid rgba(200,60,20,0.7);color:#ff7744;padding:3px 10px;border-radius:4px;cursor:pointer;font-family:monospace;font-size:0.52rem;letter-spacing:1px;white-space:nowrap;z-index:10;';
            btn.textContent = '🦠 FEED FROM BLIGHT';
            btn.onclick = () => BlightSporeInteraction.feedFromBlight();
            if (sporeEl.style.position !== 'relative') sporeEl.style.position = 'relative';
            sporeEl.appendChild(btn);
        }
    }

    function feedFromBlight() {
        const blightDrain = state.city && state.city._blightDrain;
        if (!blightDrain) return;
        const tiles = Object.keys(blightDrain).slice(0, 3);
        if (!tiles.length) return;
        tiles.forEach(k => delete blightDrain[k]);
        state._corruptedSporeEnd = Date.now() + 90000;
        state._corruptedSporeFrags = 0;
        showNotif('🦠 SPORE FED FROM BLIGHT — ' + tiles.length + ' tiles cleansed. CORRUPTED SPORE active for 90s: double instability, drops Fragments.', '#ff7744', 9000);
        const btn = document.getElementById('spore-blight-btn');
        if (btn) btn.remove();
    }

    function tick() {
        if (!isRunning) return;
        check();
        if (state._corruptedSporeEnd && Date.now() < state._corruptedSporeEnd) {
            state.instability = Math.min(100, (state.instability || 0) + 0.09);
            state._corruptedSporeFrags = (state._corruptedSporeFrags || 0) + 0.04;
            if (state._corruptedSporeFrags >= 1) {
                state.fragments = (state.fragments || 0) + 1;
                state._corruptedSporeFrags -= 1;
            }
        } else if (state._corruptedSporeEnd && Date.now() >= state._corruptedSporeEnd) {
            state._corruptedSporeEnd = null;
            showNotif('🌿 Corrupted Spore mutation expired. Spore returning to normal.', '#88ff88', 5000);
        }
    }

    return { tick, check, feedFromBlight };
})();
window.BlightSporeInteraction = BlightSporeInteraction;

/* ── 3. Omega Tribunal dismiss button ──────────────────────────── */
(function() {
    // V1.20.9.5 (post-audit): the candidate parents (#sim-schism-wrap,
    // #omega-panel-header, #sim-schism-toggle) do not exist in index.html.
    // The previous setInterval polled every 2.5s forever, leaking CPU/memory.
    // Now: only inject while Omega Tribunal is actually active, and cap retries
    // so the loop self-terminates even if no parent ever appears.
    let _tries = 0;
    const MAX_TRIES = 24; // ~60s of polling, then give up
    function _ensureOmegaBtn() {
        if (document.getElementById('omega-tribunal-dismiss-btn')) return true;
        if (typeof state === 'undefined' || !state._omegaTribunalActive) return false;
        const candidates = ['#sim-schism-wrap','#omega-panel-header','#sim-schism-toggle'];
        let parent = null;
        for (const sel of candidates) {
            parent = document.querySelector(sel);
            if (parent) break;
        }
        if (!parent) return false;
        const btn = document.createElement('button');
        btn.id = 'omega-tribunal-dismiss-btn';
        btn.textContent = '🦆 DISMISS OMEGA TRIBUNAL';
        btn.title = 'The Duck Tribunal was banished here. Dismiss them to restore Anti-Energy production.';
        btn.style.cssText = 'width:100%;padding:7px 14px;margin-top:6px;background:rgba(60,0,80,0.5);border:1px solid rgba(180,60,255,0.4);color:#cc66ff;border-radius:6px;cursor:pointer;font-family:"Courier New",monospace;font-size:0.58rem;letter-spacing:2px;';
        btn.onclick = () => { if (window.DuckTribunal) DuckTribunal.dismissFromOmega(); };
        parent.appendChild(btn);
        return true;
    }
    const _inj = setInterval(() => {
        if (_ensureOmegaBtn() || ++_tries >= MAX_TRIES) clearInterval(_inj);
    }, 2500);
})();

/* ── 4. Omega Tribunal tax on Anti-Energy ───────────────────────── */
(function() {
    if (!window.SimulationSchism) return;
    if (SimulationSchism._omegaTaxPatched) return;
    SimulationSchism._omegaTaxPatched = true;
    const _origGetAnti = SimulationSchism.getAntiEPS;
    if (!_origGetAnti) return;
    SimulationSchism.getAntiEPS = function() {
        const base = _origGetAnti.call(SimulationSchism);
        const tax = (window.DuckTribunal && DuckTribunal.getOmegaTax) ? DuckTribunal.getOmegaTax() : 1;
        return base * tax;
    };
})();

/* ── 5. Wire BlightSporeInteraction into 2s tick ───────────────── */
EventBus.addEventListener('onTick', () => {
    if (window.BlightSporeInteraction) BlightSporeInteraction.tick();
});

/* ── 6. Keyboard shortcut hint label ───────────────────────────── */
setTimeout(() => {
    const wrap = document.getElementById('buy-qty-wrap');
    if (wrap && !wrap._hintAdded) {
        wrap._hintAdded = true;
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:0.5rem;color:#2a3550;letter-spacing:1px;text-align:center;margin-top:3px;pointer-events:none;user-select:none;';
        hint.textContent = 'Shift ×10  ·  Ctrl ×100  ·  Alt MAX';
        wrap.appendChild(hint);
    }
}, 2000);

/* ── 7. Adjacency soft curve above 2.0 ─────────────────────────── */
// Patches state._adjEPS after each recompute — above 2.0, apply power 0.8 curve
// so a densely optimized grid yields diminishing but never capped returns.
//
// V1.20.9.5: this used to re-apply the curve to its OWN previous output every
// tick (`state._adjEPS = 2 + pow(state._adjEPS - 2, 0.8)`), with no idempotency
// marker. The result wasn't a stable transform — it decayed toward the curve's
// fixed point (3.0) a little more on every tick, so a real adjacency value of
// 5.0 would silently sag to ~3.x over a minute of idle ticks. Now we remember
// the last value we curved TO: if state._adjEPS still equals that, the raw
// value hasn't been recomputed and we skip — making the patch idempotent.
(() => {
    let _lastCurvedOut = null;
    EventBus.addEventListener('onTick', () => {
        if (typeof state === 'undefined') return;
        const cur = state._adjEPS;
        if (typeof cur !== 'number' || !isFinite(cur)) return;
        // Already-curved sentinel: the recompute hasn't written a fresh raw
        // value since we last curved, so re-curving would just drift it.
        if (cur === _lastCurvedOut) return;
        if (cur > 2.0) {
            _lastCurvedOut = 2.0 + Math.pow(cur - 2.0, 0.8);
            state._adjEPS = _lastCurvedOut;
        } else {
            // At or below 2.0 the curve is identity — record it so a later
            // unchanged tick is still recognised as "already processed".
            _lastCurvedOut = cur;
        }
    });
})();
