// music.js — Procedural melody soundtrack — V1.20.9.4
// Web Audio API only. Pure sine-wave notes (no harmonics, no buzz).
// Two INDEPENDENT melody voices (lengths 23 & 29, coprime) + fixed-period bass.
// V1.20.9.4 RETUNE: voices extended 17/19 → 23/29 to make the soundtrack last
// noticeably longer before the combined pattern realigns. Coprime lengths still
// guarantee a single combined cycle of length(A) × length(B) steps:
//   23 × 29 = 667 steps before voices align again (was 323).
//   menu   (64 BPM,  469 ms/step): 667 × 469 ms ≈ 5.2 min
//   early  (90 BPM,  333 ms/step): 667 × 333 ms ≈ 3.7 min
//   mid    (108 BPM, 278 ms/step): 667 × 278 ms ≈ 3.1 min
//   crisis (138 BPM, 217 ms/step): 667 × 217 ms ≈ 2.4 min  ← slowest, still ~2.5×
// NO sustained pad oscillators — all sound is discrete fire-and-forget note events.

const GameMusic = (() => {
    'use strict';

    // ── Phase definitions ──────────────────────────────────────────────────────
    // V1.20.9.4 ADDITION: `pause` phase. Triggered by PauseMenu.open() and reverted
    // on PauseMenu.close(). Slow, sparse, low-volume — designed to feel like the
    // game is "holding its breath" while paused, distinct from the menu/main music.
    const PHASES = {
        menu:    { root: 220.0, scale: [0,4,7,11,14],    bpm: 64,  vol: 0.36, bass: 0.18 },
        early:   { root: 261.6, scale: [0,4,7,9,12],     bpm: 90,  vol: 0.32, bass: 0.16 },
        mid:     { root: 261.6, scale: [0,4,7,9,11,14],  bpm: 108, vol: 0.32, bass: 0.16 },
        late:    { root: 220.0, scale: [0,3,7,10,14,17], bpm: 122, vol: 0.34, bass: 0.18 },
        crisis:  { root: 196.0, scale: [0,1,6,8,13],     bpm: 138, vol: 0.34, bass: 0.20 },
        prestige:{ root: 293.6, scale: [0,4,7,11,16,19], bpm: 70,  vol: 0.40, bass: 0.16 },
        lore:    { root: 174.6, scale: [0,2,5,9,12],     bpm: 48,  vol: 0.26, bass: 0.10 },
        // pause: floating, contemplative — root F3, minor7 voicing, very slow.
        pause:   { root: 174.6, scale: [0,3,7,10,15],    bpm: 40,  vol: 0.28, bass: 0.12 },
    };

    // ── Dual melodic sequences ────────────────────────────────────────────────
    // V1.20.9.4: Voice A (23 steps) and Voice B (29 steps) are INDEPENDENT — each
    // loops at its own length. 23 and 29 are coprime, so the combined pattern
    // doesn't repeat until step 667 (23 × 29). All indices are within bounds for
    // each phase's scale array. -1 = rest.
    //
    // Scale index ranges (valid max):
    //   menu, early, crisis, lore : 0-4  (5-element scale)
    //   mid, late, prestige       : 0-5  (6-element scale)
    const SEQS = {
        // ── menu: A root / C# / E / G# / B — sparse, contemplative ──────────
        menu: {
            a: [ 0,-1,-1, 2,-1, 4,-1,-1, 3,-1, 2,-1, 0,-1, 4,-1, 1,-1, 3,-1, 2,-1, 4],
            b: [ 2,-1, 4,-1,-1, 3,-1, 2,-1, 0,-1, 4,-1,-1, 2,-1, 3,-1, 4,-1, 1,-1, 0,-1, 3,-1, 4,-1, 2],
        },
        // ── early: C major feel — upbeat, ascending ──────────────────────────
        early: {
            a: [ 0, 2, 1, 2, 0,-1, 2, 3, 2, 1, 0, 2, 4, 3, 2, 1, 0, 1, 2, 4, 3, 2, 0],
            b: [ 3, 4, 3, 2, 1, 0, 2, 3,-1, 4, 3, 2, 1, 2, 0,-1, 3, 4, 2, 1, 0, 2, 4, 3, 1, 0, 3, 2, 4],
        },
        // ── mid: extended scale, jazz-inflected ──────────────────────────────
        mid: {
            a: [ 0, 1, 2, 3, 4, 3, 2, 5, 1, 0, 2, 3, 5, 4, 3, 1, 0, 4, 2, 5, 3, 1, 0],
            b: [ 3, 5, 4, 3, 2, 1, 0, 2, 4, 5, 3, 2,-1, 4, 3, 1, 0, 2, 5, 3, 1, 4, 2, 0, 3, 5, 1, 2, 4],
        },
        // ── late: minor, dramatic, wide range ────────────────────────────────
        late: {
            a: [ 0, 1, 2, 3, 2, 1, 0, 1, 3,-1, 3, 1, 0, 2, 4, 3, 5, 2, 0, 4, 3, 1, 2],
            b: [ 2, 3, 5, 3, 2, 0,-1, 3, 1, 2, 3, 5, 4, 3, 1, 0, 2, 4,-1, 5, 3, 1, 0, 2, 4, 3, 5, 2, 1],
        },
        // ── crisis: chromatic, unstable, choppy ──────────────────────────────
        crisis: {
            a: [ 0, 1,-1, 4, 2, 3,-1, 1, 0, 4, 2,-1, 3, 1, 0, 2,-1, 4, 1, 3, 2, 0,-1],
            b: [ 2, 3, 4,-1, 1, 0, 2,-1, 3, 4, 1, 2,-1, 0, 4, 3,-1, 2, 3, 1, 4, 0, 2,-1, 3, 1, 4, 2, 0],
        },
        // ── prestige: soaring, wide intervals, grand ─────────────────────────
        prestige: {
            a: [ 0,-1,-1, 1,-1,-1, 2,-1, 3,-1, 2,-1, 4,-1, 3, 5,-1, 4,-1, 2,-1, 5,-1],
            b: [ 1,-1,-1, 2,-1,-1, 3,-1,-1, 4,-1,-1, 5,-1,-1, 3,-1, 2,-1, 0,-1, 4,-1, 5,-1, 3,-1, 1,-1],
        },
        // ── lore: one note per phrase, ethereal ──────────────────────────────
        lore: {
            a: [ 0,-1,-1,-1, 1,-1,-1,-1, 2,-1,-1,-1, 3,-1,-1,-1, 4,-1,-1,-1, 2,-1, 0],
            b: [ 1,-1,-1,-1, 2,-1,-1,-1, 3,-1,-1,-1, 4,-1,-1,-1, 0,-1,-1, 2,-1,-1, 3,-1,-1,-1, 4,-1,-1],
        },
        // V1.20.9.4: pause — held breath. Very long rests punctuated by single
        // sustained notes. Voice A drifts the root upward; Voice B answers with
        // a fifth below in a slower, even longer pattern. Scale is minor-7 (0,3,7,10,15).
        // Max index 4 — within bounds for the 5-element scale.
        pause: {
            a: [ 0,-1,-1,-1,-1, 2,-1,-1,-1,-1, 3,-1,-1,-1,-1, 1,-1,-1,-1,-1, 4,-1,-1],
            b: [ 1,-1,-1,-1,-1,-1, 3,-1,-1,-1,-1,-1, 0,-1,-1,-1,-1, 2,-1,-1,-1,-1,-1, 4,-1,-1,-1, 3],
        },
    };

    // ── EPS thresholds for phase selection ────────────────────────────────────
    const EPS_MID  = 1e3;
    const EPS_LATE = 1e9;

    // ── Lore-phase mood variants (V1.20.9.5: hoisted from lorePush) ──────────
    // Mutating PHASES.lore with one of these gives each lore chunk its own
    // audible character. See lorePush() below for selection logic.
    const _LORE_BASE = { root: 174.6, scale: [0,2,5,9,12], bpm: 48, vol: 0.26, bass: 0.10 };
    const _LORE_MOODS = {
        wonder:     { root: 261.6, scale: [0,4,7,11,14], bpm: 38, vol: 0.30, bass: 0.08 },
        horror:     { root: 130.8, scale: [0,1,6,8,13],  bpm: 42, vol: 0.32, bass: 0.18 },
        mechanical: { root: 196.0, scale: [0,3,5,7,10],  bpm: 64, vol: 0.28, bass: 0.14 },
        mystical:   { root: 220.0, scale: [0,2,6,9,11],  bpm: 44, vol: 0.26, bass: 0.10 },
        crisis:     { root: 164.8, scale: [0,1,3,6,10],  bpm: 78, vol: 0.30, bass: 0.16 },
    };

    // ── State ─────────────────────────────────────────────────────────────────
    let _ctx = null, _master = null, _comp = null;
    let _phase = null, _phGain = null;
    let _arpTimer = null, _arpIdx = 0;
    let _prevGamePhase = null;
    let _crashVol = null, _crashPhase = null;   // set while a crash screen has the music cut (2026-09-25 §2)

    // ── Helpers ───────────────────────────────────────────────────────────────
    const Hz = (root, semi) => root * (2 ** (semi / 12));

    function _ctx_() {
        if (!_ctx) {
            _ctx = new (window.AudioContext || window.webkitAudioContext)();
            _master = _ctx.createGain();
            _master.gain.value = 0.45;
            // Soft limiter — catches any brief overlap peaks between note events
            _comp = _ctx.createDynamicsCompressor();
            _comp.threshold.value = -12;
            _comp.knee.value      = 6;
            _comp.ratio.value     = 5;
            _comp.attack.value    = 0.003;
            _comp.release.value   = 0.20;
            _master.connect(_comp);
            _comp.connect(_ctx.destination);
        }
        if (_ctx.state === 'suspended') _ctx.resume();
        return _ctx;
    }

    // Play a single pitched sine note: attack → exponential decay (music-box feel)
    function _note(ctx, out, dlyIn, freq, peakGain, attack, decay) {
        const o   = ctx.createOscillator();
        const env = ctx.createGain();
        const now = ctx.currentTime;
        o.type = 'sine';
        o.frequency.value = freq;
        env.gain.setValueAtTime(0, now);
        env.gain.linearRampToValueAtTime(peakGain, now + attack);
        env.gain.exponentialRampToValueAtTime(0.0001, now + decay);
        o.connect(env);
        env.connect(out);
        if (dlyIn) env.connect(dlyIn);
        o.start(now);
        o.stop(now + decay + 0.06);
    }

    function _stop() {
        if (_arpTimer) { clearInterval(_arpTimer); _arpTimer = null; }
        // No persistent oscillators to stop — all notes are fire-and-forget
    }

    function _startPhase(key) {
        const ctx  = _ctx_();
        const p    = PHASES[key];
        const seqs = SEQS[key] || SEQS.early;
        if (!p) return;
        _stop();
        _arpIdx = 0;

        // Per-phase output gain — fades in over 1.8 s
        const phGain = ctx.createGain();
        phGain.gain.setValueAtTime(0, ctx.currentTime);
        phGain.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.8);
        phGain.connect(_master);

        // Feedback delay — gives notes an echo trail (depth without buzz)
        const dly = ctx.createDelay(0.8);
        const fb  = ctx.createGain();
        const dgn = ctx.createGain();
        dly.delayTime.value = 60 / p.bpm * 0.75;  // dotted-quarter delay
        fb.gain.value  = 0.26;
        dgn.gain.value = 0.13;
        dly.connect(fb); fb.connect(dly);
        dly.connect(dgn); dgn.connect(phGain);

        // V1.20.9.5: comments said 17 / 19; actual array literals are
        // 23 / 29. The two co-prime lengths (23 × 29 = 667 steps) are what
        // make the two voices realign only every ~667 8th-notes, so the
        // listener never hears the same combination twice in a short
        // window. Correct comments matter — if a future edit "fixes" the
        // length to match the wrong comment, the co-primality breaks.
        const seqA   = seqs.a;          // length 23 — main melody
        const seqB   = seqs.b;          // length 29 — harmony (independent, co-prime with A)
        const stepMs = Math.round(30000 / p.bpm); // 8th-note in ms

        _arpTimer = setInterval(() => {
            const i = _arpIdx;

            // ── Voice A: main melody, middle octave ───────────────────────────
            const degA = seqA[i % seqA.length];
            if (degA >= 0) {
                const freq = Hz(p.root, p.scale[degA]);
                _note(ctx, phGain, dly, freq, p.vol * 0.52, 0.016, 0.38);
            }

            // ── Voice B: harmony, independent loop, upper octave ──────────────
            const degB = seqB[i % seqB.length];
            if (degB >= 0) {
                const freq = Hz(p.root, p.scale[degB] + 12); // +12 = one octave up
                _note(ctx, phGain, dly, freq, p.vol * 0.28, 0.016, 0.26);
            }

            // ── Bass: plucked root, one octave down, every 16 steps ──────────
            if (i % 16 === 0) {
                _note(ctx, phGain, null, p.root / 2, p.bass, 0.020, 0.55);
            }

            _arpIdx++;
        }, stepMs);

        // Fade out the previous phase's gain node over 1.4 s
        if (_phGain) {
            const prev = _phGain;
            prev.gain.setValueAtTime(prev.gain.value, ctx.currentTime);
            prev.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.4);
            setTimeout(() => { try { prev.disconnect(); } catch(e){} }, 2000);
        }
        _phGain = phGain;
    }

    // ── Internal evaluator — no isRunning guard needed (caller is gated) ──────
    function _evalPhase() {
        // V1.20.9.4: 'pause' added to the don't-auto-clobber list — the tick()
        // loop runs every second and would otherwise immediately revert pause
        // music back to the main game phase.
        if (_phase === 'lore' || _phase === 'prestige' || _phase === 'pause') return;
        if (_crashVol !== null) return;   // a crash screen has the music cut — the tick must not restart it (2026-09-25 §2)
        const milestone = window._epsMilestoneReached || 0;
        const instab    = window._musicInstab || 0;
        let want;
        if      (instab   >= 75)       want = 'crisis';
        else if (milestone >= EPS_LATE) want = 'late';
        else if (milestone >= EPS_MID)  want = 'mid';
        else                            want = 'early';
        _api.setPhase(want);
    }

    // ── Public API ────────────────────────────────────────────────────────────
    const _api = {

        setPhase(key) {
            if (key === _phase) return;
            _phase = key;
            if (key === 'silent') {
                _stop();
                if (_phGain && _ctx) _phGain.gain.setTargetAtTime(0, _ctx.currentTime, 0.3);
                return;
            }
            try { _startPhase(key); } catch(e) { console.warn('[GameMusic]', e); }
        },

        // Called every second by the game's isRunning-gated setInterval.
        tick() { _evalPhase(); },

        // V1.20.9.4: lorePush accepts an optional `mood` key. Each mood mutates
        // the base 'lore' phase by transposing root, swapping scale, shifting
        // tempo, and adjusting volume — so every chunk has its own audible
        // identity instead of all 30 sounding identical.
        //   wonder    — high root, major-9 voicing, slowest. For awakening lore.
        //   horror    — dropped root, diminished scale, slow + heavy bass.
        //   mechanical— low root, minor pentatonic, faster pulse for system lore.
        //   mystical  — mid root, lydian-ish, ethereal slow.
        //   crisis    — low root, chromatic, fast and unstable.
        //   default   — fall back to the base 'lore' phase if no mood given.
        // V1.20.9.5: moods table lifted out of the function so it isn't re-allocated
        // on every lorePush() call. The mutation of PHASES.lore is intentional —
        // only one phase plays at a time, and _startPhase reads fresh.
        lorePush(mood) {
            if (_phase !== 'lore') _prevGamePhase = _phase;
            const cfg = (mood && _LORE_MOODS[mood]) ? _LORE_MOODS[mood] : _LORE_BASE;
            Object.assign(PHASES.lore, cfg);
            // Force re-start even if already in lore — switching from chunk N to
            // chunk N+1 should produce a new musical character, not just keep going.
            if (_phase === 'lore') _phase = null;
            this.setPhase('lore');
        },

        loreRestore() {
            _phase = null;
            _evalPhase();
        },

        // V1.20.9.4: pause-menu music. PauseMenu.open() pushes us into the
        // 'pause' phase; PauseMenu.close() restores the previous phase. Mirrors
        // the lore push/restore pattern but uses its own minor-7 voicing.
        pausePush() {
            if (_phase !== 'pause' && _phase !== 'lore') _prevGamePhase = _phase;
            this.setPhase('pause');
        },

        pauseRestore() {
            _phase = null;
            _evalPhase();
        },

        prestigeFanfare() {
            this.setPhase('prestige');
            setTimeout(() => { _phase = null; _evalPhase(); }, 4200);
        },

        /* ⭐ THE CRASH CUT (PLAYTEST_REVIEW_2026-09-25 §2). A real hang does not fade the music out — it stops, usually
           after a short stuck-buffer stutter. crashCut() drops the master to silence at once, after four 45ms slivers of
           a buzz (only if music was playing); crashRestore() brings the master back over 1.2s and re-picks the phase.
           Idempotent both ways, and safe before any audio has started. */
        crashCut() {
            if (_crashVol !== null) return;
            _crashVol = _master ? _master.gain.value : 0.45;
            _crashPhase = _phase;
            _stop();
            if (!_ctx || !_master) return;
            const now = _ctx.currentTime;
            _master.gain.cancelScheduledValues(now);
            _master.gain.setValueAtTime(0, now);
            if (_crashPhase && _crashPhase !== 'silent') {
                try {
                    const o = _ctx.createOscillator(), g = _ctx.createGain();
                    o.type = 'square'; o.frequency.value = 93;
                    g.gain.setValueAtTime(0, now);
                    for (let k = 0; k < 4; k++) { const t = now + k * 0.07; g.gain.setValueAtTime(0.045, t); g.gain.setValueAtTime(0, t + 0.045); }
                    o.connect(g); g.connect(_ctx.destination);
                    o.start(now); o.stop(now + 0.32);
                } catch (e) {}
            }
        },

        crashRestore() {
            if (_crashVol === null) return;
            const v = _crashVol, ph = _crashPhase;
            _crashVol = null; _crashPhase = null;
            if (_ctx && _master) {
                const now = _ctx.currentTime;
                _master.gain.cancelScheduledValues(now);
                _master.gain.setValueAtTime(0, now);
                _master.gain.linearRampToValueAtTime(v, now + 1.2);
            }
            if (ph && ph !== 'silent') { _phase = null; _evalPhase(); }
        },

        /* QA hook (qa_review_0925): whether the arpeggio is running and whether a crash has the music cut. Read-only. */
        _qaState() { return { arp: !!_arpTimer, cut: _crashVol !== null, phase: _phase }; },

        setVolume(v, ramp = 0.4) {
            if (_master && _ctx) _master.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), _ctx.currentTime, ramp);
        },

        onSoundToggle(enabled) {
            if (!enabled) {
                _stop();
                if (_phGain && _ctx) _phGain.gain.setTargetAtTime(0, _ctx.currentTime, 0.3);
                _phase = null;
            } else {
                _phase = null;
                _evalPhase();
            }
        },
    };

    return _api;
})();

window.GameMusic = GameMusic;
