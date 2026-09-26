/* ═══════════════════════════════════════════════════════════════════════════
   SOUNDTRACK — procedural music, stingers and SFX for every screen, story
   phase and event. Web Audio only; no files.

   STANDALONE. Nothing in the game calls this yet — it is auditioned in
   sound_lab/index.html. The public surface is `window.Soundtrack`.

   HOW IT IS BUILT
   • One AudioContext, four buses: music (duckable), stinger, SFX, and shared
     reverb + tempo-synced echo returns, all into one compressor.
   • A CUE is data plus a `step(P, s, t)` function called once per 16th note
     by a look-ahead scheduler. `s` is the step count, `t` the exact audio time.
     Nothing is ever timed with setTimeout, so rhythm never drifts.
   • Switching cues crossfades: the old cue keeps scheduling until its fade
     ends, so there is never a gap or a hard cut.
   • INSTABILITY (0..1, setIntensity) is not a separate track. It pushes a story
     phase's tempo, detunes it, saturates it and makes it pulse with a heartbeat,
     and each phase adds its own extra parts as it rises (the `X` value inside
     the phase cues). So Phase 3 at 90% still sounds like Phase 3.
     Screens and events ignore it.
   • THE OPERATOR MOTIF: one five-note phrase that recurs in every phase with
     a different instrument and treatment (inverted in ZENITH, missing its
     last note in THE LONG ITERATION). It is what ties the soundtrack together.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    // ── Context and buses ──────────────────────────────────────────────────
    let ctx = null, master, comp, analyser, musicBus, musicDuck, stingBus, sfxBus;
    let musicDry, musicWet, musicThrob, pulseBus;
    let revIn, dlyIn, dly, noiseBuf;
    let intensity = 0, intensityTarget = 0;
    /* `stress` is instability as the MUSIC feels it: equal to intensity while a
       story phase is playing, 0 for screens and events. Everything instability
       does to the sound reads this, never `intensity` directly. */
    let stress = 0;
    const TEMPO_PUSH = 0.2;     // +20% tempo at 100% instability
    let sfxPhase = 0;
    let pumpTimer = null;
    const LOOKAHEAD = 0.16;

    function ensure() {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
        ctx = new (window.AudioContext || window.webkitAudioContext)();

        master = mkGain(0.85);
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 4;
        comp.attack.value = 0.004; comp.release.value = 0.22;
        analyser = ctx.createAnalyser(); analyser.fftSize = 2048;
        master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);

        /* music -> [clean | saturated] -> duck (stingers) -> throb (heartbeat) -> master.
           The saturation mix and the throb depth are driven by instability. */
        musicBus = mkGain(0.9); musicDuck = mkGain(1); musicThrob = mkGain(1);
        musicDry = mkGain(1); musicWet = mkGain(0);
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(2048);
        for (let i = 0; i < curve.length; i++) { const x = i / 1023.5 - 1; curve[i] = Math.tanh(x * 5) / Math.tanh(5); }
        shaper.curve = curve; shaper.oversample = '4x';
        const wetTone = ctx.createBiquadFilter(); wetTone.type = 'lowpass'; wetTone.frequency.value = 5200;
        musicBus.connect(musicDry); musicDry.connect(musicDuck);
        musicBus.connect(shaper); shaper.connect(wetTone); wetTone.connect(musicWet); musicWet.connect(musicDuck);
        musicDuck.connect(musicThrob); musicThrob.connect(master);
        // The heartbeat bypasses the throb, or it would duck itself.
        pulseBus = mkGain(1); pulseBus.connect(master);
        stingBus = mkGain(0.9); stingBus.connect(master);
        sfxBus = mkGain(0.9); sfxBus.connect(master);

        // Reverb: a generated stereo impulse, so no file is needed.
        const conv = ctx.createConvolver();
        conv.buffer = makeImpulse(3.4, 2.8);
        revIn = mkGain(1); const revOut = mkGain(0.8);
        revIn.connect(conv); conv.connect(revOut); revOut.connect(master);

        // Echo: tempo-synced by each cue (see play()), darkened on every repeat.
        dly = ctx.createDelay(2.5); dly.delayTime.value = 0.4;
        const fb = mkGain(0.38), dlp = ctx.createBiquadFilter();
        dlp.type = 'lowpass'; dlp.frequency.value = 2600;
        dlyIn = mkGain(1); const dlyOut = mkGain(0.7);
        dlyIn.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly);
        dlp.connect(dlyOut); dlyOut.connect(master);
        const dlyRev = mkGain(0.25); dlp.connect(dlyRev); dlyRev.connect(revIn);

        noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const nd = noiseBuf.getChannelData(0);
        for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

        pumpTimer = setInterval(pump, 25);
        return ctx;
    }

    function makeImpulse(sec, decay) {
        const len = Math.floor(ctx.sampleRate * sec);
        const buf = ctx.createBuffer(2, len, ctx.sampleRate);
        for (let c = 0; c < 2; c++) {
            const d = buf.getChannelData(c);
            for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
        }
        return buf;
    }

    // ── Small helpers ──────────────────────────────────────────────────────
    function mkGain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
    const M = m => 440 * Math.pow(2, (m - 69) / 12);          // midi -> Hz
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    function rng(seed) {                                       // mulberry32
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

    const SC = {
        major:    [0, 2, 4, 5, 7, 9, 11],
        minor:    [0, 2, 3, 5, 7, 8, 10],
        dorian:   [0, 2, 3, 5, 7, 9, 10],
        phrygian: [0, 1, 3, 5, 7, 8, 10],
        lydian:   [0, 2, 4, 6, 7, 9, 11],
        penta:    [0, 2, 4, 7, 9],
        whole:    [0, 2, 4, 6, 8, 10],
        zenith:   [0, 1, 4, 6, 7, 10],      // bright and wrong at once
    };
    /* Scale degree -> midi. Degrees run past the octave in both directions,
       so a melody can walk freely without anyone clamping it by hand. */
    function dg(root, scale, d) {
        const n = scale.length, o = Math.floor(d / n), i = ((d % n) + n) % n;
        return root + o * 12 + scale[i];
    }
    const triad = (root, sc, d) => [dg(root, sc, d), dg(root, sc, d + 2), dg(root, sc, d + 4)];

    /* Tuning drift: from 45% instability each note lands up to ±40 cents off,
       so the music sounds like it is going out of tune. */
    function warpCents() {
        const x = clamp((stress - 0.45) / 0.55, 0, 1);
        return x ? (Math.random() * 2 - 1) * 40 * x * x : 0;
    }

    // ── Envelopes ──────────────────────────────────────────────────────────
    function envPerc(p, t, a, peak, d) {
        p.setValueAtTime(0.0001, t);
        p.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
        p.exponentialRampToValueAtTime(0.0001, t + a + d);
    }
    function envSus(p, t, a, peak, hold, r) {
        const h = Math.max(a, hold);
        p.setValueAtTime(0, t);
        p.linearRampToValueAtTime(peak, t + a);
        p.setValueAtTime(peak, t + h);
        p.linearRampToValueAtTime(0, t + h + r);
    }

    /* Every voice ends in chain(): note gain -> optional pan -> the cue's dry
       bus, plus reverb and echo sends at the levels the note asks for. */
    function send(node, dest, amt) { if (!dest || !amt) return; const s = mkGain(amt); node.connect(s); s.connect(dest); }
    function chain(D, o) {
        const g = mkGain(0);
        let last = g;
        if (o.pan) { const p = ctx.createStereoPanner(); p.pan.value = clamp(o.pan, -1, 1); g.connect(p); last = p; }
        last.connect(D.dry);
        send(last, D.rev, o.rev === undefined ? 0.25 : o.rev);
        send(last, D.echo, o.echo || 0);
        return g;
    }

    // ── Voices ─────────────────────────────────────────────────────────────
    /* tone(): the general-purpose oscillator voice.
       o: type, vol, a, r, sus (sustained vs percussive), lp|bp|hp + q,
          fenv (filter start freq) + ft, uni + spread (detuned unison, cents),
          det (cents), vib [rate, cents], glide (freq ratio) + gt, pan, rev, echo */
    function tone(D, t, f, dur, o) {
        o = o || {};
        const sus = !!o.sus;
        const a = o.a !== undefined ? o.a : (sus ? 0.02 : 0.004);
        const r = o.r !== undefined ? o.r : (sus ? 0.2 : 0);
        const end = t + Math.max(a, dur) + r + 0.06;
        const g = chain(D, o);
        let dest = g;
        if (o.lp || o.bp || o.hp) {
            const fl = ctx.createBiquadFilter();
            fl.type = o.bp ? 'bandpass' : o.hp ? 'highpass' : 'lowpass';
            const fv = o.lp || o.bp || o.hp;
            fl.Q.value = o.q !== undefined ? o.q : (o.bp ? 4 : 0.8);
            if (o.fenv) {
                fl.frequency.setValueAtTime(o.fenv, t);
                fl.frequency.exponentialRampToValueAtTime(fv, t + (o.ft || dur));
            } else fl.frequency.setValueAtTime(fv, t);
            fl.connect(g); dest = fl;
        }
        let lg = null;
        if (o.vib) {
            const lfo = ctx.createOscillator(); lfo.frequency.value = o.vib[0];
            lg = mkGain(o.vib[1]); lfo.connect(lg); lfo.start(t); lfo.stop(end);
        }
        const n = o.uni || 1, sp = o.spread !== undefined ? o.spread : 10;
        const drift = D.warp ? warpCents() : 0;
        for (let i = 0; i < n; i++) {
            const osc = ctx.createOscillator();
            osc.type = o.type || 'sine';
            osc.frequency.setValueAtTime(f, t);
            if (o.glide) osc.frequency.exponentialRampToValueAtTime(f * o.glide, t + (o.gt || dur));
            osc.detune.value = (o.det || 0) + drift + (n > 1 ? (i / (n - 1) * 2 - 1) * sp * (1 + stress * 0.8) : 0);
            if (lg) lg.connect(osc.detune);
            osc.connect(dest); osc.start(t); osc.stop(end);
        }
        const v = (o.vol !== undefined ? o.vol : 0.15) / Math.sqrt(n);
        if (sus) envSus(g.gain, t, a, v, dur, r); else envPerc(g.gain, t, a, v, dur);
    }

    /* Two-operator FM bell. ratio 2 = music box, 3.5 = church bell,
       non-integer = metal and glass. */
    function bell(D, t, f, dur, o) {
        o = o || {};
        const end = t + dur + 0.1, g = chain(D, o);
        const c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain();
        c.frequency.value = f; m.frequency.value = f * (o.ratio || 3.5);
        if (D.warp) c.detune.value = warpCents();
        const idx = (o.idx !== undefined ? o.idx : 2.5) * f;
        mg.gain.setValueAtTime(idx, t);
        mg.gain.exponentialRampToValueAtTime(Math.max(1, idx * 0.04), t + dur * 0.6);
        m.connect(mg); mg.connect(c.frequency); c.connect(g);
        c.start(t); m.start(t); c.stop(end); m.stop(end);
        envPerc(g.gain, t, o.a || 0.003, o.vol !== undefined ? o.vol : 0.08, dur);
    }

    function pad(D, t, notes, dur, o) {
        o = o || {};
        const v = (o.vol !== undefined ? o.vol : 0.1) / Math.sqrt(notes.length);
        const base = Object.assign({ type: 'sawtooth', uni: 2, spread: 9, lp: 1200, a: 0.8, r: 1.2, rev: 0.45 }, o);
        notes.forEach(n => tone(D, t, M(n), dur, Object.assign({}, base, { sus: true, vol: v })));
    }

    function noise(D, t, dur, o) {
        o = o || {};
        const r = o.r !== undefined ? o.r : 0.1;
        const end = t + dur + r + 0.06, g = chain(D, o);
        const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
        const fl = ctx.createBiquadFilter();
        fl.type = o.type || 'bandpass';
        fl.Q.value = o.q !== undefined ? o.q : 1;
        fl.frequency.setValueAtTime(o.f || 1000, t);
        if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + (o.ft || dur));
        src.connect(fl); fl.connect(g);
        src.start(t, Math.random() * 1.5); src.stop(end);
        const v = o.vol !== undefined ? o.vol : 0.05;
        if (o.sus) envSus(g.gain, t, o.a !== undefined ? o.a : 0.05, v, dur, r);
        else envPerc(g.gain, t, o.a !== undefined ? o.a : 0.002, v, dur);
    }

    function kick(D, t, o) {
        o = o || {};
        const d = o.d || 0.35, v = o.vol !== undefined ? o.vol : 0.6;
        const g = chain(D, { rev: o.rev !== undefined ? o.rev : 0.04, pan: o.pan });
        const osc = ctx.createOscillator();
        osc.frequency.setValueAtTime(o.f0 || 150, t);
        osc.frequency.exponentialRampToValueAtTime(o.f1 || 45, t + (o.pd || 0.09));
        osc.connect(g); osc.start(t); osc.stop(t + d + 0.06);
        envPerc(g.gain, t, 0.002, v, d);
        if (o.click !== false) noise(D, t, 0.012, { type: 'highpass', f: 3000, vol: v * 0.12, rev: 0 });
    }
    function snare(D, t, o) {
        o = o || {};
        const v = o.vol !== undefined ? o.vol : 0.25;
        noise(D, t, o.d || 0.16, { type: 'bandpass', f: o.f || 1900, q: 0.7, vol: v, rev: o.rev !== undefined ? o.rev : 0.2, pan: o.pan });
        tone(D, t, 185, 0.07, { type: 'triangle', glide: 0.7, vol: v * 0.5, rev: 0.05, pan: o.pan });
    }
    function hat(D, t, o) {
        o = o || {};
        noise(D, t, o.open ? 0.22 : 0.035, { type: 'highpass', f: o.f || 7200, q: 0.5, vol: o.vol !== undefined ? o.vol : 0.04, rev: o.rev || 0.05, pan: o.pan });
    }
    function clap(D, t, o) {
        o = o || {};
        const v = o.vol !== undefined ? o.vol : 0.2;
        [0, 0.011, 0.023].forEach(dt => noise(D, t + dt, 0.018, { type: 'bandpass', f: 1300, q: 1.2, vol: v, rev: 0 }));
        noise(D, t + 0.03, 0.13, { type: 'bandpass', f: 1200, q: 1, vol: v * 0.6, rev: o.rev !== undefined ? o.rev : 0.3 });
    }
    function tom(D, t, f, o) {
        o = o || {};
        kick(D, t, { f0: f * 2.2, f1: f, pd: 0.06, d: o.d || 0.5, vol: o.vol !== undefined ? o.vol : 0.35, click: false, rev: o.rev !== undefined ? o.rev : 0.35, pan: o.pan });
    }
    function wood(D, t, f, o) {
        o = o || {};
        tone(D, t, f, 0.04, { type: 'sine', vol: o.vol !== undefined ? o.vol : 0.08, rev: o.rev !== undefined ? o.rev : 0.15, pan: o.pan });
        noise(D, t, 0.008, { type: 'bandpass', f: f * 2, q: 3, vol: (o.vol || 0.08) * 0.5, rev: 0, pan: o.pan });
    }
    function glitch(D, t, o) {
        o = o || {};
        const n = o.n || 6, st = o.st || 0.018, end = t + n * st + 0.05;
        const g = chain(D, { rev: o.rev || 0.05, pan: o.pan });
        const osc = ctx.createOscillator(); osc.type = 'square';
        for (let k = 0; k < n; k++) osc.frequency.setValueAtTime(o.lo !== undefined ? o.lo + Math.random() * (o.hi - o.lo) : 180 + Math.random() * 2600, t + k * st);
        osc.connect(g); osc.start(t); osc.stop(end);
        envPerc(g.gain, t, 0.001, o.vol !== undefined ? o.vol : 0.04, n * st);
    }
    const VOWELS = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1700, 2600] };
    function choir(D, t, f, dur, o) {
        o = o || {};
        const a = o.a !== undefined ? o.a : 0.9, r = o.r !== undefined ? o.r : 1.2;
        const end = t + Math.max(a, dur) + r + 0.06, g = chain(D, o), sum = mkGain(1);
        const lfo = ctx.createOscillator(); lfo.frequency.value = 5.1;
        const lg = mkGain(8); lfo.connect(lg); lfo.start(t); lfo.stop(end);
        [-11, 0, 12].forEach(dt => {
            const osc = ctx.createOscillator(); osc.type = 'sawtooth';
            osc.frequency.value = f; osc.detune.value = dt + (o.det || 0);
            lg.connect(osc.detune); osc.connect(sum); osc.start(t); osc.stop(end);
        });
        VOWELS[o.v || 'a'].forEach((ff, i) => {
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 7 + i * 3;
            const fg = mkGain([1, 0.5, 0.22][i]); sum.connect(bp); bp.connect(fg); fg.connect(g);
        });
        envSus(g.gain, t, a, (o.vol !== undefined ? o.vol : 0.08) * 3, dur, r);
    }
    function riser(D, t, dur, o) {
        o = o || {};
        noise(D, t, dur, { type: 'bandpass', f: o.f || 300, f2: o.f2 || 6000, ft: dur, q: 2, sus: true, a: dur, r: 0.03, vol: o.vol !== undefined ? o.vol : 0.06, rev: 0.3 });
    }
    /* A swell that rises to its peak and cuts off — reads as reversed tape. */
    function swell(D, t, dur, notes, o) {
        o = o || {};
        const v = (o.vol !== undefined ? o.vol : 0.08) / Math.sqrt(notes.length);
        notes.forEach(n => tone(D, t, M(n), dur, { type: o.type || 'sawtooth', uni: 2, spread: 12, lp: o.lp || 1600, sus: true, a: dur, r: 0.025, vol: v, rev: o.rev !== undefined ? o.rev : 0.5 }));
    }
    function gavel(D, t, o) {
        o = o || {};
        const v = o.vol !== undefined ? o.vol : 0.4;
        wood(D, t, 190, { vol: v * 0.8, rev: 0.4 });
        kick(D, t, { f0: 260, f1: 90, d: 0.18, vol: v, rev: 0.4 });
        noise(D, t, 0.06, { type: 'bandpass', f: 900, q: 2, vol: v * 0.5, rev: 0.4 });
    }

    // ── The Operator motif ─────────────────────────────────────────────────
    // [position in 16ths, scale degree, length in 16ths]. One bar long.
    const MOTIF = [[0, 0, 2], [2, 2, 2], [4, 1, 2], [6, 4, 4], [10, 3, 6]];
    function motif(P, t0, root, scale, fn, opt) {
        opt = opt || {};
        const k = opt.stretch || 1;
        let notes = MOTIF.map(n => n.slice());
        if (opt.invert) notes.forEach(n => { n[1] = -n[1]; });
        if (opt.lift) notes[notes.length - 1][1] += 2;
        if (opt.retro) {
            const deg = notes.map(n => n[1]).reverse();
            notes.forEach((n, i) => { n[1] = deg[i]; });
        }
        if (opt.dropLast) notes = notes.slice(0, -1);
        notes.forEach((n, i) => fn(dg(root, scale, n[1]), t0 + n[0] * P.sd * k, n[2] * P.sd * k, i));
    }

    // ── Players ────────────────────────────────────────────────────────────
    /* `P` inside a cue: its bus, step length, a seeded random source and the
       voices bound to that bus. A fixed seed per cue means a cue plays the
       same piece every time you audition it, which makes notes comparable. */
    const P_PROTO = {
        rnd() { return this._rng(); },
        chance(p) { return this._rng() < p; },
        pick(a) { return a[Math.floor(this._rng() * a.length)]; },
        get I() { return stress; },
        /* X: how far past 45% instability we are, 0..1. The phase-specific
           extra parts are written against this. */
        get X() { return clamp((stress - 0.45) / 0.55, 0, 1); },
        tone(t, f, d, o) { tone(this.D, t, f, d, o); },
        bell(t, f, d, o) { bell(this.D, t, f, d, o); },
        pad(t, n, d, o) { pad(this.D, t, n, d, o); },
        noise(t, d, o) { noise(this.D, t, d, o); },
        kick(t, o) { kick(this.D, t, o); },
        snare(t, o) { snare(this.D, t, o); },
        hat(t, o) { hat(this.D, t, o); },
        clap(t, o) { clap(this.D, t, o); },
        tom(t, f, o) { tom(this.D, t, f, o); },
        wood(t, f, o) { wood(this.D, t, f, o); },
        glitch(t, o) { glitch(this.D, t, o); },
        choir(t, f, d, o) { choir(this.D, t, f, d, o); },
        riser(t, d, o) { riser(this.D, t, d, o); },
        swell(t, d, n, o) { swell(this.D, t, d, n, o); },
        gavel(t, o) { gavel(this.D, t, o); },
        motif(t, root, sc, fn, opt) { motif(this, t, root, sc, fn, opt); },
    };

    const players = [];
    let current = null;
    const listeners = {};
    function emit(ev, data) { (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) {} }); }

    function makePlayer(name, t, fade) {
        const cue = CUES[name];
        const fades = [mkGain(0), mkGain(0), mkGain(0)];
        fades.forEach(g => {
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(1, t + Math.max(0.05, fade));
        });
        fades[0].connect(musicBus); fades[1].connect(revIn); fades[2].connect(dlyIn);
        const dry = mkGain(cue.vol !== undefined ? cue.vol : 1); dry.connect(fades[0]);
        const rev = mkGain(1); rev.connect(fades[1]);
        const echo = mkGain(1); echo.connect(fades[2]);
        const p = Object.create(P_PROTO);
        Object.assign(p, {
            name, cue, D: { dry, rev, echo, warp: !!cue.tension }, fades,
            step: 0, t0: t, next: t, sd0: 60 / cue.bpm / 4, sd: 60 / cue.bpm / 4,
            _rng: rng(hash(name)), st: {}, stopAt: null,
        });
        if (cue.init) cue.init(p);
        return p;
    }

    function fadeOutPlayer(p, sec) {
        const now = ctx.currentTime;
        p.fades.forEach(g => {
            g.gain.cancelScheduledValues(now);
            g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), now);
            g.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.03, sec));
        });
        p.stopAt = now + sec;
    }

    function pump() {
        if (!ctx) return;
        const now = ctx.currentTime;
        intensity += (intensityTarget - intensity) * 0.06;
        stress = (current && current.cue.tension) ? intensity : 0;

        // Saturation: creeps in from 60%, about half wet at 100%.
        const wet = clamp((stress - 0.6) / 0.4, 0, 1) * 0.55;
        musicWet.gain.setTargetAtTime(wet, now, 0.1);
        musicDry.gain.setTargetAtTime(1 - wet * 0.55, now, 0.1);

        const horizon = now + LOOKAHEAD;
        for (const p of players) {
            /* Steps advance incrementally rather than from t0, so the tempo can be
               pushed live: a phase runs up to 20% faster at full instability. */
            const push = (p === current && p.cue.tension) ? 1 + TEMPO_PUSH * stress : 1;
            p.sd = p.sd0 / push;
            for (;;) {
                const base = p.next;
                if (base >= horizon) break;
                if (p.stopAt !== null && base >= p.stopAt) break;
                const t = base + ((p.step & 1) ? (p.cue.swing || 0) * p.sd : 0);
                if (base >= now - 0.05) {           // never schedule into the past
                    try { p.cue.step(p, p.step, t); } catch (e) { console.warn('[Soundtrack]', p.name, e); }
                    if (p.cue.tension && p === current) tensionLayer(p, p.step, t);
                }
                p.step++;
                p.next += p.sd;
            }
        }
        for (let i = players.length - 1; i >= 0; i--) {
            const p = players[i];
            if (p.stopAt !== null && now > p.stopAt + 6) {
                p.fades.forEach(g => { try { g.disconnect(); } catch (e) {} });
                players.splice(i, 1);
            }
        }
    }

    /* THE INSTABILITY LAYER, on top of every story phase. Each stage is meant to
       be heard on laptop and phone speakers, not only felt through a subwoofer.
         always   tempo pushes up to +20% (see pump)
         25%      heartbeat, and the whole mix pulses with it
         45%      tuning drift (warpCents) + each phase's own extra parts (P.X)
         60%      saturation on the music bus; ticking
         80%      a high whine, glitches, a riser every fourth bar
         90%      heartbeat on every beat, a dissonant cluster every bar     */
    function heartbeat(t, I) {
        const D = { dry: pulseBus, rev: revIn, echo: null };
        const v = 0.3 + I * 0.45;
        [[0, 1], [0.17, 0.62]].forEach(([dt, k]) => {
            kick(D, t + dt, { f0: 120, f1: 44, pd: 0.07, d: 0.24, vol: v * k, click: false, rev: 0.06 });
            // The mid-range knock is what makes it audible on small speakers.
            tone(D, t + dt, 160, 0.07, { type: 'triangle', glide: 0.55, gt: 0.06, lp: 900, vol: v * k * 0.35, rev: 0.05 });
            noise(D, t + dt, 0.035, { type: 'lowpass', f: 700, vol: v * k * 0.18, rev: 0 });
        });
        // The mix ducks on every beat and swells back, so the music seems to pulse.
        const depth = clamp((I - 0.25) / 0.75, 0, 1) * 0.5;
        musicThrob.gain.cancelScheduledValues(t);
        musicThrob.gain.setValueAtTime(1 - depth, t);
        musicThrob.gain.linearRampToValueAtTime(1, t + 0.42);
    }

    function tensionLayer(p, s, t) {
        const I = stress;
        if (I < 0.25) return;
        const pos = s % 16, bar = s >> 4, D = p.D, R = p.cue.root || 48;
        const every = I >= 0.9 ? 4 : I >= 0.45 ? 8 : 16;
        if (pos % every === 0) heartbeat(t, I);

        if (I >= 0.6) {
            const k = (I - 0.6) / 0.4;
            if (p.chance(0.35 + k * 0.5)) hat(D, t, { vol: 0.02 + k * 0.03, f: 8000, pan: p.rnd() * 1.4 - 0.7 });
        }
        if (I >= 0.8) {
            const k = (I - 0.8) / 0.2;
            if (pos === 0 && bar % 2 === 0)
                tone(D, t, M(R + 37), p.sd * 32, { sus: true, a: 0.8, r: 0.5, vol: 0.025 + k * 0.035, vib: [6.7, 30], rev: 0.5 });
            if (p.chance(0.03 + k * 0.08)) glitch(D, t, { vol: 0.045, pan: p.rnd() * 2 - 1 });
            if (pos === 0 && bar % 4 === 3) riser(D, t, p.sd * 16, { vol: 0.05 + k * 0.04 });
        }
        if (I >= 0.9 && pos === 0)
            pad(D, t, [R + 12, R + 13, R + 18, R + 19], p.sd * 14, { lp: 1400, a: 0.5, r: 0.3, vol: 0.09, rev: 0.3 });
    }

    // ── CUES ───────────────────────────────────────────────────────────────
    /* Each cue: group, title, blurb (what you should hear), bpm, root (midi),
       key (label), optional swing / echoSteps / tension / vol, and step().
       `pos` = 16th within the bar, `bar` = bar count from the cue's start. */
    const CUES = {};

    // ── Screens ──

    CUES.boot = {
        group: 'screen', title: 'Boot sequence', key: 'A drone', bpm: 110, root: 45, echoSteps: 3,
        blurb: 'The terminal waking up: mains hum, data ticks, modem chirps, a scanning sweep.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4;
            if (pos === 0 && bar % 4 === 0) {
                P.tone(t, 55, P.sd * 64, { type: 'sawtooth', lp: 220, sus: true, a: 1.5, r: 1, vol: 0.09, rev: 0.2 });
                P.tone(t, 110, P.sd * 64, { type: 'sine', sus: true, a: 2, r: 1, vol: 0.05, vib: [0.3, 6] });
            }
            if (P.chance(0.5)) P.hat(t, { vol: 0.018, f: 9000, pan: P.rnd() - 0.5 });
            if (P.chance(0.1)) P.tone(t, M(84 + P.pick([0, 3, 7, 10, 12, 15])), 0.035, { type: 'square', vol: 0.025, rev: 0.1, echo: 0.2, pan: P.rnd() * 1.6 - 0.8 });
            if (pos === 0 && bar % 2 === 1) P.noise(t, P.sd * 16, { f: 400, f2: 3200, q: 6, sus: true, a: 0.3, r: 0.3, vol: 0.02 });
            if (bar % 4 === 3 && pos === 12) P.tone(t, 880, 0.12, { vol: 0.05, rev: 0.3, echo: 0.3 });
            if (bar >= 4 && pos === 0) P.kick(t, { vol: 0.18, f0: 80, f1: 40, d: 0.3 });
        },
    };

    CUES.menu = {
        group: 'screen', title: 'Home screen', key: 'D minor', bpm: 84, root: 50, echoSteps: 3,
        blurb: 'The main title. Warm pad, music-box arpeggio, and the Operator motif in full.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.minor, R = 50;
            const cd = [0, 5, 2, 6][(bar >> 1) % 4];
            if (pos === 0 && bar % 2 === 0)
                P.pad(t, [dg(R + 12, sc, cd), dg(R + 12, sc, cd + 2), dg(R + 12, sc, cd + 4), dg(R + 24, sc, cd)], P.sd * 32, { lp: 950, a: 1.4, r: 1.6, vol: 0.13 });
            if (pos === 0 || pos === 10) P.tone(t, M(dg(R - 12, sc, cd)), P.sd * 6, { sus: true, a: 0.02, r: 0.3, vol: 0.2, rev: 0.05 });
            if (pos % 2 === 0) {
                const arp = [0, 2, 4, 7, 4, 2, 7, 9];
                P.bell(t, M(dg(R + 24, sc, cd + arp[(pos >> 1) % 8])), 0.9, { ratio: 2, idx: 1.2, vol: 0.045, rev: 0.45, echo: 0.25, pan: (pos >> 1) % 2 ? 0.3 : -0.3 });
            }
            if (bar >= 4) {
                if (pos === 0) P.kick(t, { vol: 0.22, f0: 110, f1: 42, d: 0.4 });
                if (pos === 4 || pos === 12) P.hat(t, { vol: 0.02 });
            }
            const lead = (m, tt, d) => P.tone(tt, M(m), d, { type: 'triangle', sus: true, a: 0.03, r: 0.45, vol: 0.12, vib: [5, 8], rev: 0.45, echo: 0.35 });
            if (pos === 0 && bar % 8 === 2) P.motif(t, R + 24, sc, lead);
            if (pos === 0 && bar % 8 === 6) P.motif(t, R + 24, sc, lead, { lift: true });
        },
    };

    CUES.pause = {
        group: 'screen', title: 'Pause menu', key: 'F lydian', bpm: 52, root: 53, echoSteps: 4,
        blurb: 'Time held still. A frozen chord, a clock that keeps ticking, the motif played backwards.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, R = 53;
            if (pos === 0 && bar % 4 === 0) {
                P.pad(t, [R, R + 7, R + 11, R + 16, R + 18], P.sd * 64, { type: 'triangle', uni: 2, spread: 6, lp: 1500, a: 2.5, r: 3, vol: 0.13, rev: 0.7 });
                P.tone(t, M(R - 12), P.sd * 64, { sus: true, a: 2, r: 3, vol: 0.12 });
            }
            if (pos % 4 === 0) P.wood(t, pos % 8 === 0 ? 2400 : 1800, { vol: 0.025, rev: 0.3, pan: pos % 8 === 0 ? -0.35 : 0.35 });
            if (pos === 0 && bar % 4 === 2)
                P.motif(t, R + 24, SC.lydian, (m, tt, d) => P.bell(tt, M(m), 2.2, { ratio: 2, idx: 0.8, vol: 0.05, rev: 0.7, echo: 0.3 }), { retro: true });
        },
    };

    CUES.lore = {
        group: 'screen', title: 'Lore cutscene', key: 'C minor', bpm: 60, root: 48, echoSteps: 3,
        blurb: 'Underscore for a transmission. Soft felt-piano chords that stay out of the way of the text.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.minor, R = 48;
            const cd = [0, 5, 3, 4][bar % 4];
            const ch = triad(R + 12, sc, cd);
            if (pos === 0) P.pad(t, ch, P.sd * 16, { type: 'sine', uni: 1, lp: 1800, a: 1.2, r: 1.5, vol: 0.1 });
            if (pos === 0) P.tone(t, M(dg(R - 12, sc, cd)), P.sd * 16, { sus: true, a: 0.5, r: 1.5, vol: 0.13 });
            if (pos === 0 || pos === 6 || pos === 10) {
                const n = ch[[0, 2, 1][[0, 6, 10].indexOf(pos)]] + 12;
                P.tone(t, M(n), 1.6, { type: 'triangle', lp: 700, fenv: 3200, ft: 0.25, vol: 0.09, rev: 0.5, echo: 0.3 });
            }
        },
    };

    CUES.prestige = {
        group: 'screen', title: 'Prestige screen', key: 'E major', bpm: 70, root: 52, echoSteps: 3,
        blurb: 'The ceremony of starting over. Organ chords, a rising arpeggio, timpani, a choir on top.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.major, R = 52;
            const cd = [0, 5, 3, 4][(bar >> 1) % 4];
            const ch = triad(R, sc, cd);
            if (pos === 0 && bar % 2 === 0) {
                P.pad(t, ch.concat([ch[0] + 12]), P.sd * 32, { type: 'square', uni: 2, spread: 5, lp: 1800, a: 0.5, r: 1, vol: 0.08 });
                P.pad(t, ch.map(n => n + 12), P.sd * 32, { type: 'sine', uni: 1, a: 0.5, r: 1, vol: 0.07 });
                P.choir(t, M(ch[2] + 12), P.sd * 32, { v: 'a', vol: 0.05, rev: 0.7 });
                P.tone(t, M(ch[0] - 12), P.sd * 32, { sus: true, a: 0.1, r: 1, vol: 0.18 });
                P.tom(t, 55, { vol: 0.4, d: 0.9 });
            }
            const arp = [0, 2, 4, 7, 9, 11, 14, 16];
            if (pos % 2 === 0) P.bell(t, M(dg(R + 12, sc, cd + arp[(pos >> 1) % 8])), 0.8, { ratio: 3.5, idx: 1.5, vol: 0.03, rev: 0.5, echo: 0.2 });
            if (pos === 0 && bar % 8 === 4)
                P.motif(t, R + 12, sc, (m, tt, d) => P.tone(tt, M(m), d, { type: 'sawtooth', uni: 2, lp: 1600, fenv: 400, ft: 0.15, sus: true, a: 0.04, r: 0.4, vol: 0.1, rev: 0.5 }), { stretch: 2, lift: true });
        },
    };

    CUES.endgame = {
        group: 'screen', title: 'Endgame', key: 'D minor', bpm: 56, root: 50, echoSteps: 4,
        blurb: 'The last screen. The motif at half speed on choir and bells, then the music thins out to one drone.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.minor, R = 50;
            const fading = bar >= 16;
            const cd = [0, 5, 3, 6][(bar >> 1) % 4];
            if (pos === 0 && bar % 2 === 0) {
                P.tone(t, M(R - 24), P.sd * 32, { sus: true, a: 1, r: 2, vol: 0.2 });
                if (!fading) P.pad(t, triad(R, sc, cd).concat([dg(R + 12, sc, cd + 4)]), P.sd * 32, { lp: 1100, a: 2, r: 2.5, vol: 0.12 });
            }
            if (!fading && pos === 0 && bar % 4 === 1)
                P.motif(t, R + 12, sc, (m, tt, d) => { P.choir(tt, M(m), d, { v: 'o', a: 0.3, r: 0.8, vol: 0.06 }); P.bell(tt, M(m + 12), 2.5, { ratio: 3.5, idx: 1.4, vol: 0.04, rev: 0.7 }); }, { stretch: 2 });
            if (!fading && pos === 0 && bar % 8 === 7) P.swell(t, P.sd * 16, [R + 12, R + 19, R + 24], { vol: 0.07 });
            if (fading && P.chance(0.03)) P.bell(t, M(dg(R + 24, sc, P.pick([0, 2, 4, 7]))), 3, { ratio: 3.5, vol: 0.03, rev: 0.8, echo: 0.4 });
        },
    };

    // ── Story phases ──

    CUES.phase0 = {
        group: 'phase', phase: 0, chapter: 'Before the first log', title: 'Terminal idle', key: 'C pentatonic', bpm: 76, root: 60, echoSteps: 3, tension: true,
        blurb: 'Innocent on purpose. A lone music box wandering over a soft bass. No drums.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, R = 60;
            if (P.st.w === undefined) P.st.w = 4;
            if (pos % 2 === 0 && P.chance(0.62)) {
                P.st.w = clamp(P.st.w + P.pick([-2, -1, -1, 1, 1, 2]), 0, 10);
                const n = dg(R, SC.penta, P.st.w);
                P.bell(t, M(n), 1.1, { ratio: 2, idx: 0.9, vol: 0.07, rev: 0.45, echo: 0.25, pan: P.rnd() * 0.6 - 0.3 });
                // Stressed: a second music box answers every note a tritone down, out of step.
                if (P.chance(P.X)) P.bell(t + P.sd * 3, M(n - 6), 1.1, { ratio: 2.9, idx: 1.4, vol: 0.06, rev: 0.5, pan: 0.5 });
            }
            const bassN = 36 + [0, -3, -7, -5][(bar >> 1) % 4];
            if (P.X > 0.5) { if (pos % 4 === 0) P.tone(t, M(bassN), P.sd * 3, { sus: true, a: 0.01, r: 0.1, vol: 0.2 }); }
            else if (pos === 0 && bar % 2 === 0) P.tone(t, M(bassN), P.sd * 32, { sus: true, a: 0.3, r: 1, vol: 0.18 });
            if (pos === 0 && bar % 8 === 4) P.motif(t, R + 12, SC.major, (m, tt) => P.bell(tt, M(m), 1.4, { ratio: 2, idx: 0.7, vol: 0.06, rev: 0.5, echo: 0.3 }));
        },
    };

    CUES.phase1 = {
        group: 'phase', phase: 1, chapter: 'THE AWAKENING', title: 'The Awakening', key: 'C major', bpm: 92, root: 48, echoSteps: 3, tension: true,
        sub: 'They needed a volunteer. You were the cheapest one.',
        blurb: 'Warm and a little hopeful: it is just a job. FM bells, soft pulse, a bass that walks.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.major, R = 48;
            const cd = [5, 3, 0, 4][(bar >> 1) % 4];
            if (pos === 0 && bar % 2 === 0) P.pad(t, triad(R + 12, sc, cd), P.sd * 32, { type: 'triangle', uni: 2, spread: 7, lp: 1600, a: 0.9, r: 1.2, vol: 0.09 });
            const X = P.X;
            const arp = [0, 2, 4, 2, 7, 4, 2, 4];
            if (pos % 2 === 0 || X > 0.5) {
                const oct = pos % 2 ? 7 : 0;         // stressed: the arpeggio doubles into 16ths, an octave up
                P.bell(t, M(dg(R + 24, sc, cd + arp[(pos >> 1) % 8] + oct)), 0.7, { ratio: 3.01, idx: 1.6, vol: pos % 2 ? 0.035 : 0.05, rev: 0.35, echo: 0.2, pan: (pos % 4 ? 0.25 : -0.25) });
            }
            if (pos === 0 || pos === 8 || (X > 0 && (pos === 4 || pos === 12))) P.kick(t, { vol: 0.3 + X * 0.2, f0: 115, f1: 44 });
            if (pos === 12) P.wood(t, 1250, { vol: 0.04 });
            const bassHits = X > 0 ? [0, 3, 6, 8, 10, 14] : [0, 6, 10];
            if (bassHits.indexOf(pos) >= 0) P.tone(t, M(dg(R - 12, sc, cd + (pos === 6 ? 4 : 0))), 0.28, { type: 'triangle', lp: 650 + X * 900, vol: 0.18, rev: 0.05 });
            if (P.I > 0.3 && pos % 2 === 1) P.hat(t, { vol: 0.02 });
            if (X > 0.7 && pos === 14 && bar % 2 === 1) P.bell(t, 1320, 0.5, { ratio: 1.41, idx: 5, vol: 0.06, rev: 0.3 });
            if (pos === 0 && bar % 8 === 4) P.motif(t, R + 24, sc, (m, tt, d) => P.bell(tt, M(m), d * 2.5, { ratio: 2, idx: 1.4, vol: 0.09, rev: 0.4, echo: 0.3 }));
        },
    };

    CUES.phase2 = {
        group: 'phase', phase: 2, chapter: 'THE CITY NEXUS', title: 'The City Nexus', key: 'E minor', bpm: 112, root: 40, echoSteps: 3, tension: true,
        sub: 'A city is a machine for turning people into output.',
        blurb: 'The machine at full shift. Four-on-the-floor, a 16th-note arpeggiator, factory clangs.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.minor, R = 40;
            const cd = [0, 5, 2, 6][(bar >> 1) % 4];
            const arp = [0, 2, 4, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2, 4, 7];
            const X = P.X;
            P.tone(t, M(dg(R + 24, sc, cd + arp[pos])), 0.11, { type: 'sawtooth', lp: 500, fenv: 3200 + X * 3000, ft: 0.08, vol: 0.05, rev: 0.15, echo: 0.2, pan: pos % 2 ? 0.28 : -0.28 });
            // Stressed: the arpeggiator doubles an octave up and the line runs hotter.
            if (X > 0.35) P.tone(t, M(dg(R + 36, sc, cd + arp[(pos + 3) % 16])), 0.08, { type: 'square', lp: 3500, vol: 0.025 + X * 0.02, rev: 0.1, pan: pos % 2 ? -0.5 : 0.5 });
            if (pos % 4 === 0) P.kick(t, { vol: 0.5, f0: 140, f1: 46 });
            if (pos === 4 || pos === 12) P.clap(t, { vol: 0.16 });
            if (pos % 4 === 2) P.hat(t, { vol: 0.045, open: P.I > 0.5 });
            if (X > 0 && pos % 2 === 1) P.hat(t, { vol: 0.025 + X * 0.02 });
            if (X > 0.6 && bar % 2 === 1 && pos >= 12) P.snare(t, { vol: 0.08 + (pos - 12) * 0.035, d: 0.08 });
            if (X > 0.75 && pos === 0 && bar % 4 === 0)
                P.tone(t, 620, P.sd * 16, { type: 'square', lp: 1800, sus: true, a: 0.05, r: 0.2, vol: 0.03, glide: 1.6, gt: P.sd * 8, rev: 0.4 });
            if (pos % 2 === 0) P.tone(t, M(dg(R, sc, cd) + (pos % 4 === 2 ? 12 : 0)), 0.13, { type: 'sawtooth', lp: 520, vol: 0.13, rev: 0 });
            if (pos === 0 && bar % 2 === 0) P.pad(t, triad(R + 12, sc, cd), P.sd * 32, { lp: 700, vol: 0.05, a: 0.6 });
            if (bar % 4 === 3 && pos === 14) P.bell(t, M(R + 31), 0.6, { ratio: 1.41, idx: 4, vol: 0.05, rev: 0.4, pan: 0.5 });
            if (bar >= 8 && pos === 0 && bar % 8 === 0)
                P.motif(t, R + 36, sc, (m, tt, d) => P.tone(tt, M(m), d, { type: 'square', lp: 2400, sus: true, a: 0.01, r: 0.15, vol: 0.05, rev: 0.3, echo: 0.35 }));
        },
    };

    CUES.phase3 = {
        group: 'phase', phase: 3, chapter: 'THE SIMULATION', title: 'The Simulation', key: 'C phrygian', bpm: 96, root: 48, echoSteps: 3, tension: true,
        sub: 'The cruelty was never a defect. It was the specification.',
        blurb: 'The first unease. Detuned wobbling pads, half-time drums, an arpeggio that plays wrong notes.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.phrygian, R = 48;
            const cd = [0, 1, 0, 6][(bar >> 1) % 4];
            if (pos === 0 && bar % 2 === 0) {
                P.pad(t, triad(R, sc, cd), P.sd * 32, { uni: 3, spread: 22, lp: 900, vib: [0.25, 14], a: 1, r: 1, vol: 0.1 });
                P.tone(t, M(dg(R - 24, sc, cd)), P.sd * 32, { sus: true, a: 0.2, r: 0.8, vol: 0.2 });
            }
            const X = P.X;
            // Stressed: the arpeggio plays more wrong notes and fewer rests, and fills in to 16ths.
            if ((pos % 2 === 0 || P.chance(X * 0.6)) && !P.chance(0.2 - X * 0.15)) {
                let n = P.pick(triad(R + 12, sc, cd));
                if (P.chance(0.15 + X * 0.45)) n = dg(R + 12, sc, cd) + P.pick([1, 6, 11]);
                P.tone(t, M(n + 12), 0.2, { type: X > 0.5 ? 'sawtooth' : 'triangle', lp: 2400, vol: 0.07, rev: 0.3, echo: 0.4, pan: P.rnd() * 1.2 - 0.6 });
            }
            if (pos === 0 || (pos === 10 && P.chance(0.5 + X * 0.5))) P.kick(t, { vol: 0.45, f0: 120, f1: 40, d: 0.45 });
            if (pos === 8) P.snare(t, { vol: 0.24, rev: 0.6 });
            if (X > 0.4 && (pos === 3 || pos === 13) && P.chance(0.7)) P.snare(t, { vol: 0.07, d: 0.06, rev: 0.2 });
            if (P.chance(0.035 + X * 0.12)) P.glitch(t, { vol: 0.035 + X * 0.015, pan: P.rnd() * 2 - 1 });
            if (pos === 0 && bar % 8 === 6)
                P.motif(t, R + 24, sc, (m, tt, d, i) => P.tone(tt, M(m), d, { type: 'sawtooth', uni: 2, spread: 18, lp: 1800, sus: true, a: 0.02, r: 0.3, vol: 0.08, rev: 0.4, echo: 0.3, glide: i === 4 ? 0.94 : undefined, gt: d }));
        },
    };

    CUES.phase4 = {
        group: 'phase', phase: 4, chapter: 'COSMIC DOMINATION', title: 'Cosmic Domination', key: 'F lydian', bpm: 72, root: 41, echoSteps: 6, tension: true,
        sub: 'At this scale nobody is a person. That is the appeal.',
        blurb: 'Vast and cold. Huge pads, a choir, timpani in three-against-four, glass bells in the far distance.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.lydian, R = 41;
            const cd = [0, 1, 5, 4][(bar >> 1) % 4];
            if (pos === 0 && bar % 2 === 0) {
                const r = dg(R + 12, sc, cd);
                P.pad(t, [r, r + 7, r + 14, dg(R + 24, sc, cd + 2)], P.sd * 32, { uni: 3, spread: 12, lp: 1400, a: 2, r: 2.5, vol: 0.1, rev: 0.6 });
                const top = dg(R + 24, sc, cd + 4);
                P.choir(t, M(top), P.sd * 32, { v: 'a', vol: 0.05, rev: 0.8 });
                // Stressed: a second choir voice a semitone above, grinding against the first.
                if (P.X > 0.3) P.choir(t, M(top + 1), P.sd * 32, { v: 'e', vol: 0.02 + P.X * 0.035, rev: 0.8 });
                P.tone(t, M(dg(R - 12, sc, cd)), P.sd * 32, { sus: true, a: 1, r: 1.5, vol: 0.2 });
            }
            const X = P.X;
            if (pos === 0) P.kick(t, { vol: 0.45, f0: 90, f1: 34, d: 0.9, rev: 0.3, click: false });
            if (s % 6 === 0) P.tom(t, P.pick([62, 70, 78]), { vol: 0.22, pan: P.rnd() - 0.5 });
            // Stressed: the timpani lose the pattern and start rolling.
            if (X > 0 && s % 6 === 3) P.tom(t, 92, { vol: 0.14 + X * 0.1 });
            if (X > 0.5 && s % 2 === 1 && P.chance(X * 0.6)) P.tom(t, P.pick([110, 130, 150]), { vol: 0.1, d: 0.25, pan: P.rnd() * 1.6 - 0.8 });
            if (pos % 4 === 0 && P.chance(0.5)) P.bell(t, M(dg(R + 36, sc, P.pick([0, 1, 2, 4, 6]))), 2.2, { ratio: 3.5, idx: 2, vol: 0.035, rev: 0.7, echo: 0.5, pan: P.rnd() * 1.6 - 0.8 });
            if (pos === 0 && bar % 4 === 0) P.noise(t, P.sd * 64, { f: 300, f2: 1100, ft: P.sd * 32, q: 3, sus: true, a: 2, r: 2, vol: 0.025, rev: 0.6 });
            if (pos === 0 && bar % 8 === 2)
                P.motif(t, R + 12, sc, (m, tt, d) => P.bell(tt, M(m), d + 1.5, { ratio: 3.5, idx: 1.8, vol: 0.08, rev: 0.6, echo: 0.3 }), { stretch: 2 });
        },
    };

    CUES.phase5 = {
        group: 'phase', phase: 5, chapter: 'THE LONG ITERATION', title: 'The Long Iteration', key: 'D minor', bpm: 64, root: 38, echoSteps: 3, tension: true,
        sub: 'Nobody is coming. Nobody was ever coming.',
        blurb: 'One bar that repeats and wears out. Notes drop, drift and stutter more with every loop, then it resets. The motif never finishes.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, R = 38;
            const cycle = bar % 32;
            // Stressed: the loop wears out much faster, down to near-ruin at 100%.
            const wear = Math.min(1, cycle / 32 * 0.85 * (1 - P.X * 0.5) + P.X * 0.85);
            if (pos === 0 && bar % 4 === 0) {
                P.pad(t, [R - 12, R - 5], P.sd * 64, { uni: 2, spread: 7, lp: 320, a: 2, r: 2, vol: 0.12, rev: 0.4 });
                P.tone(t, M(R - 12), P.sd * 64, { sus: true, a: 2, r: 2, vol: 0.14 });
            }
            const LOOP = { 0: 62, 3: 65, 6: 69, 8: 64, 11: 65, 14: 57 };
            if (LOOP[pos] !== undefined && !P.chance(wear * 0.3)) {
                const det = P.chance(wear * 0.35) ? (P.rnd() * 60 - 30) : 0;
                const o = { type: 'triangle', lp: 900, fenv: 4200, ft: 0.2, vol: 0.085, rev: 0.4, echo: 0.3, det };
                if (P.chance(wear * 0.18)) {
                    for (let k = 0; k < 3; k++) P.tone(t + k * P.sd / 4, M(LOOP[pos]), 0.12, Object.assign({}, o, { vol: 0.07 - k * 0.015 }));
                } else P.tone(t, M(LOOP[pos]), 0.9, o);
            }
            if (pos % 4 === 0 || (P.X > 0.5 && pos % 2 === 0)) P.wood(t, 1500, { vol: 0.018 + P.X * 0.03, rev: 0.4 });
            if (pos === 0 && bar % 2 === 0) P.kick(t, { vol: 0.32, f0: 70, f1: 32, d: 1.1, rev: 0.5, click: false });
            if (cycle === 0 && pos === 0 && bar > 0) P.noise(t, 0.4, { type: 'lowpass', f: 3000, f2: 200, vol: 0.05 });
            if (pos === 0 && bar % 8 === 4)
                P.motif(t, R + 36, SC.minor, (m, tt, d) => P.tone(tt, M(m), d, { sus: true, a: 0.05, r: 0.8, vol: 0.07, vib: [4.5, 6], rev: 0.6, echo: 0.6 }), { dropLast: true });
        },
    };

    CUES.phase6 = {
        group: 'phase', phase: 6, chapter: 'ZENITH', title: 'Zenith', key: 'C, alien scale', bpm: 66, root: 48, echoSteps: 4, tension: true,
        sub: 'You won. Look at what you are standing on.',
        blurb: 'Hollow triumph. Near-silence broken by enormous hits, a major chord with a wrong note in it, glass bells, the motif upside down.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, R = 48;
            const CH = [R, R + 4, R + 7, R + 13, R + 16];
            if (pos === 0 && bar % 2 === 1) P.swell(t, P.sd * 16, CH.map(n => n + 12), { vol: 0.09, lp: 2000 });
            if (pos === 0 && bar % 2 === 0 && bar > 0) {
                P.kick(t, { vol: 0.7, f0: 80, f1: 28, pd: 0.15, d: 1.8, rev: 0.6 });
                P.noise(t, 0.9, { type: 'lowpass', f: 1400, f2: 120, vol: 0.12, rev: 0.8 });
                P.pad(t, CH, P.sd * 14, { uni: 3, spread: 16, lp: 1800, a: 0.01, r: 2, vol: 0.12, rev: 0.8 });
                P.tone(t, M(R - 24), P.sd * 24, { sus: true, a: 0.01, r: 2, vol: 0.2 });
            }
            const X = P.X;
            // Stressed: the silence between hits fills up. Aftershocks, then a second hit every bar.
            if (X > 0.25 && pos === 8) P.kick(t, { vol: 0.3 + X * 0.3, f0: 70, f1: 30, d: 1, rev: 0.6, click: false });
            if (X > 0.6 && pos === 0 && bar % 2 === 1) {
                P.noise(t, 0.5, { type: 'lowpass', f: 1800, f2: 150, vol: 0.08, rev: 0.7 });
                P.pad(t, CH.map(n => n + 1), P.sd * 6, { uni: 2, lp: 2000, a: 0.01, r: 1, vol: 0.07, rev: 0.7 });
            }
            if (pos === 0 && bar % 4 === 0) P.choir(t, M(R - 12), P.sd * 64, { v: 'u', a: 2, r: 2, vol: 0.05, rev: 0.7 });
            if (P.chance(0.07 + X * 0.2)) P.bell(t, M(dg(R + 36, SC.zenith, Math.floor(P.rnd() * 8))), 2.5, { ratio: 4.23, idx: 2.2, vol: 0.03, rev: 0.9, echo: 0.5, pan: P.rnd() * 1.8 - 0.9 });
            if (pos === 0 && bar % 8 === 5)
                P.motif(t, R + 36, SC.zenith, (m, tt, d) => P.bell(tt, M(m), d + 2, { ratio: 2, idx: 1, vol: 0.07, rev: 0.8, echo: 0.4 }), { invert: true, stretch: 1.5 });
        },
    };

    // ── Events ──

    CUES.duckTribunal = {
        group: 'event', title: 'Duck Tribunal', key: 'B♭ major', bpm: 116, root: 46, echoSteps: 2,
        blurb: 'A pompous courtroom march played by ducks. Oom-pah tuba, a snare, a quacking lead and a gavel.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.major, R = 46;
            const cd = [0, 4, 0, 3][bar % 4];
            if (pos === 0 || pos === 8) P.tone(t, M(dg(R - 12, sc, cd + (pos === 8 ? 4 : 0))), 0.25, { type: 'square', lp: 450, vol: 0.2, rev: 0.1 });
            if (pos === 4 || pos === 12) P.pad(t, triad(R + 12, sc, cd), 0.12, { type: 'square', uni: 1, lp: 1300, a: 0.005, r: 0.08, vol: 0.07, rev: 0.15 });
            if (pos === 0) P.snare(t, { vol: 0.1, d: 0.1 });
            if (bar % 2 === 1 && pos >= 12) P.snare(t, { vol: 0.05 + (pos - 12) * 0.02, d: 0.06 });
            const TUNE = [[0, 4, 4], [4, 4, 2], [6, 5, 2], [8, 7, 6], [16, 6, 2], [18, 5, 2], [20, 4, 2], [22, 2, 2], [24, 4, 8]];
            if (bar >= 2) {
                const p2 = (bar % 2) * 16 + pos;
                TUNE.forEach(n => {
                    if (n[0] === p2) P.tone(t, M(dg(R + 12, sc, n[1])), n[2] * P.sd * 0.9, { type: 'sawtooth', bp: 1500, fenv: 650, ft: 0.07, q: 5, sus: true, a: 0.01, r: 0.06, vol: 0.2, rev: 0.2 });
                });
            }
            if (bar % 4 === 0 && pos === 0) P.gavel(t, { vol: 0.35 });
        },
    };

    CUES.nullInterrogation = {
        group: 'event', title: 'NULL interrogation', key: 'A drone', bpm: 50, root: 33, echoSteps: 4,
        blurb: 'Near-silence while the Entity asks why you click. A beating drone, a breath, one high tone bending flat.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4;
            if (pos === 0 && bar % 4 === 0) {
                P.tone(t, 55, P.sd * 64, { sus: true, a: 3, r: 3, vol: 0.14 });
                P.tone(t, 55.7, P.sd * 64, { sus: true, a: 3, r: 3, vol: 0.12 });
                P.tone(t, 110, P.sd * 64, { type: 'triangle', sus: true, a: 4, r: 3, vol: 0.03 });
            }
            if (pos === 5 && P.chance(0.4)) P.noise(t, 1.4, { f: 650, q: 1.2, sus: true, a: 0.7, r: 0.8, vol: 0.03, rev: 0.6 });
            if (pos === 0 && bar % 4 === 2) P.tone(t, 1760, P.sd * 32, { sus: true, a: 1.5, r: 1.5, vol: 0.014, glide: 0.96, vib: [5, 5], rev: 0.8 });
            if (pos === 0 && bar % 8 === 7) P.kick(t, { vol: 0.3, f0: 60, f1: 25, d: 2.2, rev: 0.9, click: false });
        },
    };

    CUES.eyeOfStorm = {
        group: 'event', title: 'Eye of the Storm', key: 'G major', bpm: 60, root: 55, echoSteps: 3,
        blurb: 'Sixty seconds of peace. Open major chords, slow bells, birdsong. The only place instability does not reach.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.major, R = 55;
            const cd = [0, 3, 5, 4][(bar >> 1) % 4];
            if (pos === 0 && bar % 2 === 0) {
                const tr = triad(R, sc, cd);
                P.pad(t, tr.concat([dg(R + 12, sc, cd + 1)]), P.sd * 32, { type: 'triangle', uni: 2, spread: 6, lp: 2400, a: 1.6, r: 2, vol: 0.12, rev: 0.6 });
                P.tone(t, M(tr[0] - 24), P.sd * 32, { sus: true, a: 1, r: 2, vol: 0.13 });
            }
            if (pos % 4 === 0) P.bell(t, M(dg(R + 12, SC.penta, cd + [0, 2, 3, 5][pos >> 2] + (bar % 2) * 2)), 2, { ratio: 2, idx: 0.9, vol: 0.05, rev: 0.6, echo: 0.35 });
            if (P.chance(0.03)) {
                const f = 2400 + P.rnd() * 1600;
                for (let k = 0; k < 3; k++) P.tone(t + k * 0.07, f * (1 + k * 0.04), 0.05, { glide: 1.25, gt: 0.05, vol: 0.012, rev: 0.5, pan: 0.6 });
            }
            if (pos === 0 && bar % 8 === 3)
                P.motif(t, R + 12, sc, (m, tt, d) => P.tone(tt, M(m), d, { sus: true, a: 0.05, r: 0.6, vol: 0.08, vib: [5, 6], rev: 0.6, echo: 0.3 }), { lift: true });
        },
    };

    CUES.redline = {
        group: 'event', title: 'Redline', key: 'E', bpm: 140, root: 28, echoSteps: 3,
        blurb: 'Eight bars arming, the filter prying open under a riser. Then ×10: full drums and a siren. Pair with the Core Collapse stinger.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, R = 28;
            const arm = Math.min(1, bar / 8), active = bar >= 8;
            P.tone(t, M(R + (pos % 2 ? 12 : 0)), 0.09, { type: 'sawtooth', uni: 2, spread: 10, lp: 280 + arm * 2800, q: 4, vol: 0.12, rev: 0 });
            if (!active) {
                if (pos === 0 || pos === 8) P.kick(t, { vol: 0.5 });
                if (pos === 0 && bar % 4 === 0) P.riser(t, P.sd * 64, { vol: 0.07 });
                if (pos % 4 === 2 && bar >= 4) P.hat(t, { vol: 0.03 });
            } else {
                if (pos % 4 === 0 || pos === 14) P.kick(t, { vol: 0.6, f0: 160 });
                if (pos === 4 || pos === 12) P.snare(t, { vol: 0.25 });
                P.hat(t, { vol: pos % 2 ? 0.025 : 0.045 });
                if (pos === 0) P.pad(t, [R + 28, R + 35, R + 40], 0.3, { uni: 2, lp: 3000, a: 0.005, r: 0.2, vol: 0.09 });
                if (bar % 2 === 0 && (pos === 0 || pos === 8)) P.tone(t, pos === 0 ? 988 : 740, P.sd * 7, { type: 'square', lp: 2000, sus: true, a: 0.01, r: 0.05, vol: 0.035, rev: 0.3 });
            }
        },
    };

    CUES.memoryLeak = {
        group: 'event', title: 'Memory Leak', key: 'A minor', bpm: 128, root: 57, echoSteps: 2,
        blurb: 'A one-bar chiptune loop that corrupts as the leak spreads: stuck notes, wrong pitches, dropouts, garbage data.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4;
            const leak = Math.min(1, bar / 24);
            const LOOP = [69, 72, 76, 72, 69, 72, 76, 79, 77, 76, 72, 69, 67, 69, 72, 76];
            let n = LOOP[pos];
            if (P.chance(leak * 0.3) && P.st.prev) n = P.st.prev;
            if (P.chance(leak * 0.2)) n += P.pick([-7, -1, 1, 6, 12]);
            P.st.prev = n;
            if (!P.chance(leak * 0.15)) P.tone(t, M(n), 0.09, { type: 'square', lp: 4000, vol: 0.045, rev: 0.1, echo: 0.15 });
            if (P.chance(leak * 0.22)) P.glitch(t, { vol: 0.03, n: 4, pan: P.rnd() * 2 - 1 });
            if (pos === 0 || pos === 8) {
                P.tone(t, M(45), 0.18, { type: 'square', lp: 700, vol: 0.12, rev: 0 });
                P.tone(t, 180, 0.1, { type: 'square', glide: 0.25, gt: 0.08, lp: 1200, vol: 0.18, rev: 0 });
            }
            if (pos === 4 || pos === 12) P.noise(t, 0.08, { type: 'highpass', f: 2000, vol: 0.07, rev: 0.05 });
            if (pos % 2 === 1) P.hat(t, { vol: 0.02 });
        },
    };

    CUES.captcha = {
        group: 'event', title: 'CAPTCHA', key: 'F major', bpm: 100, root: 53, swing: 0.18, echoSteps: 3,
        blurb: 'Friendly verification muzak. Bossa chords, a flute, a shaker. Every so often a chord comes out a semitone wrong.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.major, R = 53;
            const cd = [1, 4, 0, 5][bar % 4];
            const ch = [dg(R, sc, cd), dg(R, sc, cd + 2), dg(R, sc, cd + 4), dg(R, sc, cd + 6)];
            if ([0, 3, 6, 10, 12].indexOf(pos) >= 0) {
                const wrong = P.chance(0.05);
                ch.forEach((n, i) => {
                    P.tone(t, M(n + 12 + (wrong && i === 1 ? 1 : 0)), 0.5, { type: 'sine', vol: 0.045, rev: 0.25, vib: [4.5, 4] });
                    P.bell(t, M(n + 12), 0.4, { ratio: 1, idx: 0.6, vol: 0.012, rev: 0.2 });
                });
            }
            if (pos === 0) P.tone(t, M(ch[0] - 12), 0.35, { type: 'triangle', lp: 700, vol: 0.18, rev: 0 });
            if (pos === 6) P.tone(t, M(ch[2] - 12), 0.3, { type: 'triangle', lp: 700, vol: 0.15, rev: 0 });
            if (pos === 8) P.tone(t, M(ch[0] - 12), 0.3, { type: 'triangle', lp: 700, vol: 0.15, rev: 0 });
            P.hat(t, { vol: pos % 4 === 2 ? 0.02 : 0.009, f: 9000 });
            if (pos % 4 === 0 && P.chance(0.55)) {
                P.st.w = clamp((P.st.w || 7) + P.pick([-2, -1, 1, 2]), 3, 12);
                P.tone(t, M(dg(R + 12, sc, P.st.w)), P.sd * 3.5, { sus: true, a: 0.04, r: 0.15, vol: 0.06, vib: [5.5, 10], rev: 0.35 });
            }
        },
    };

    CUES.prisonersDilemma = {
        group: 'event', title: "Prisoner's Dilemma", key: 'D minor', bpm: 88, root: 50, echoSteps: 3,
        blurb: 'Two players, one decision. Pizzicato calls hard left, answers hard right, a clock in the middle.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.minor, R = 50;
            const cd = [0, 3, 5, 4][(bar >> 1) % 4];
            if (pos === 0 && bar % 2 === 0) P.pad(t, triad(R - 12, sc, cd), P.sd * 32, { lp: 600, vol: 0.07, a: 0.6 });
            if (pos < 8 && pos % 2 === 0) {
                if (pos === 0) P.st.call = [0, 1, 2, 3].map(() => P.pick([0, 2, 4, 7]));
                const d = P.st.call[pos >> 1];
                P.tone(t, M(dg(R + 12, sc, cd + d)), 0.25, { type: 'triangle', lp: 1800, fenv: 5000, ft: 0.05, vol: 0.1, pan: -0.75, rev: 0.25 });
            }
            if (pos >= 8 && pos % 2 === 0 && P.st.call) {
                const d = 7 - P.st.call[(pos - 8) >> 1];
                P.tone(t, M(dg(R + 12, sc, cd + d)), 0.25, { type: 'triangle', lp: 1800, fenv: 5000, ft: 0.05, vol: 0.1, pan: 0.75, rev: 0.25 });
            }
            if (pos % 4 === 0) P.wood(t, pos % 8 ? 1700 : 2100, { vol: 0.035 });
            if (pos === 0 && bar % 4 === 0) P.tom(t, 50, { vol: 0.4, d: 0.8 });
        },
    };

    CUES.existentialCrisis = {
        group: 'event', title: 'Existential Crisis', key: 'A, unresolved', bpm: 54, root: 45, echoSteps: 4,
        blurb: 'Nothing resolves. Chords that never land, reversed swells, a detuned choir.',
        step(P, s, t) {
            const pos = s % 16, R = 57;
            if (pos === 0) {
                const shapes = [[0, 2, 7], [0, 5, 7], [0, 3, 11], [0, 4, 6], [0, 2, 9]];
                const sh = P.pick(shapes), root = R + P.pick([0, -2, -5, 3, 5]);
                const notes = sh.map(n => root + n + (P.chance(0.5) ? 12 : 0));
                P.pad(t, notes, P.sd * 16, { uni: 3, spread: 18, lp: 1100, a: 1.2, r: 1.4, vol: 0.1, rev: 0.8 });
                P.tone(t, M(root - 24), P.sd * 16, { sus: true, a: 1, r: 1.5, vol: 0.12 });
                if (P.chance(0.5)) P.choir(t, M(notes[1]), P.sd * 16, { v: P.pick(['o', 'u']), det: P.rnd() * 30 - 15, vol: 0.04, rev: 0.8 });
            }
            if (pos === 8 && P.chance(0.35)) P.swell(t, P.sd * 8, [R + 12, R + 18], { vol: 0.05, rev: 0.7 });
        },
    };

    CUES.anomalyBoss = {
        group: 'event', title: 'Anomaly Boss', key: 'E phrygian', bpm: 152, root: 40, echoSteps: 2,
        blurb: 'Reality Breach. A boss fight: distorted riff, driving kick, alarm stabs, a build every eighth bar.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, R = 40;
            const brk = bar % 8 === 7;
            const RIFF = [0, 0, 12, 0, 1, 0, 0, 7, 0, 0, 12, 0, 1, 3, 1, 0];
            P.tone(t, M(R + RIFF[pos]), 0.1, { type: 'sawtooth', uni: 2, spread: 14, lp: 1500, q: 3, vol: 0.1, rev: 0 });
            if (!brk) {
                if ([0, 6, 8, 11].indexOf(pos) >= 0) P.kick(t, { vol: 0.6, f0: 170 });
                if (pos === 4 || pos === 12) P.snare(t, { vol: 0.26 });
                if (pos % 2 === 0) P.hat(t, { vol: 0.035 });
                if (pos === 0 && bar % 4 === 0) P.noise(t, 1.2, { type: 'highpass', f: 5000, vol: 0.07, rev: 0.4 });
                if (bar % 2 === 1 && (pos === 0 || pos === 3)) P.pad(t, [R + 40, R + 41], 0.14, { type: 'square', uni: 1, lp: 4000, a: 0.003, r: 0.05, vol: 0.06, rev: 0.2 });
            } else {
                P.snare(t, { vol: 0.06 + pos * 0.014, d: 0.07 });
                if (pos === 0) P.riser(t, P.sd * 16, { vol: 0.06 });
            }
        },
    };

    CUES.minigameDecoy = {
        group: 'event', title: 'Minigame Decoy', key: 'C major', bpm: 136, root: 60, echoSteps: 2,
        blurb: 'A cheerful little chiptune for tic-tac-toe. Leave it running: a low drone creeps in underneath while the game drains you.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, sc = SC.major, R = 60;
            const creep = Math.max(0, Math.min(1, (bar - 8) / 16));
            const TUNE = [[0, 4, 2], [2, 4, 2], [4, 5, 2], [6, 7, 2], [8, 9, 4], [12, 7, 4], [16, 8, 2], [18, 7, 2], [20, 5, 2], [22, 4, 2], [24, 2, 4], [28, 4, 4]];
            const p2 = (bar % 2) * 16 + pos;
            TUNE.forEach(n => {
                if (n[0] !== p2) return;
                const bend = creep > 0.3 && P.chance(creep * 0.3);
                P.tone(t, M(dg(R + 12, sc, n[1])), n[2] * P.sd * 0.85, { type: 'square', lp: 5000, sus: true, a: 0.005, r: 0.04, vol: 0.05, rev: 0.1, glide: bend ? 0.9 : undefined });
            });
            const cd = [0, 5, 3, 4][bar % 4];
            if (pos % 2 === 0) P.tone(t, M(dg(R - 24, sc, cd) + (pos % 4 ? 12 : 0)), 0.1, { type: 'square', lp: 900, vol: 0.07, rev: 0 });
            if (pos === 0 || pos === 8) P.tone(t, 200, 0.08, { type: 'square', glide: 0.3, gt: 0.06, lp: 1400, vol: 0.14, rev: 0 });
            if (pos === 4 || pos === 12) P.noise(t, 0.06, { type: 'highpass', f: 3000, vol: 0.06, rev: 0 });
            if (creep > 0 && pos === 0 && bar % 2 === 0) {
                P.tone(t, 49, P.sd * 32, { sus: true, a: 1, r: 1, vol: 0.2 * creep });
                P.tone(t, 69.3, P.sd * 32, { type: 'triangle', sus: true, a: 1, r: 1, vol: 0.05 * creep });
            }
        },
    };

    CUES.bios = {
        group: 'event', title: 'BIOS screen', key: 'PC speaker', bpm: 120, root: 72, echoSteps: 2, vol: 0.9,
        blurb: 'The hidden layer. One square wave, dry, like a motherboard speaker. A POST beep every four bars.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4;
            if (bar % 4 === 0 && pos === 0) { P.tone(t, 1000, 0.35, { type: 'square', vol: 0.05, rev: 0 }); return; }
            if (bar % 4 === 0 && pos < 6) return;
            if (pos % 2 === 0 && P.chance(0.5)) P.tone(t, M(72 + P.pick([0, 5, 7, 12, 17, 19, 24])), P.sd * P.pick([0.5, 1, 1.5]), { type: 'square', vol: 0.035, rev: 0 });
        },
    };

    CUES.quarantine = {
        group: 'event', title: 'Quarantine', key: 'B, tritone', bpm: 80, root: 35, echoSteps: 3,
        blurb: 'Toxic storage. A resonant tritone drone, bubbling blips, a slow muffled pulse.',
        step(P, s, t) {
            const pos = s % 16, bar = s >> 4, R = 35;
            if (pos === 0 && bar % 4 === 0) {
                P.pad(t, [R, R + 6, R + 12], P.sd * 64, { uni: 3, spread: 30, lp: 420, q: 6, a: 1.5, r: 1.5, vol: 0.12, rev: 0.3 });
            }
            if (P.chance(0.28)) {
                const f = 200 + P.rnd() * 700;
                P.tone(t, f, 0.07, { glide: 1.7, gt: 0.07, vol: 0.035, rev: 0.3, pan: P.rnd() * 1.6 - 0.8 });
            }
            if (pos === 0 || pos === 10) P.kick(t, { vol: 0.28, f0: 70, f1: 36, d: 0.5, click: false, rev: 0.3 });
            if (pos === 0 && bar % 4 === 2) P.noise(t, 1.6, { f: 1800, f2: 200, q: 5, sus: true, a: 0.2, r: 0.5, vol: 0.03, rev: 0.4 });
        },
    };

    // ── STINGERS: one-shots over the music, which ducks under them ─────────
    const STINGERS = {
        phaseAdvance: {
            title: 'Phase advance', len: 3, blurb: 'A new chapter begins. One huge hit, then the motif climbing.',
            fn(D, t) {
                kick(D, t, { vol: 0.8, f0: 90, f1: 30, pd: 0.15, d: 1.6, rev: 0.6 });
                noise(D, t, 1.2, { type: 'lowpass', f: 2600, f2: 150, vol: 0.12, rev: 0.8 });
                pad(D, t, [50, 57, 62, 66, 69], 2.5, { uni: 3, lp: 2200, a: 0.02, r: 2, vol: 0.14, rev: 0.8 });
                MOTIF.forEach((n, i) => bell(D, t + 0.25 + i * 0.13, M(dg(74, SC.major, n[1])), 2, { ratio: 3.5, idx: 1.6, vol: 0.07, rev: 0.7, echo: 0.3 }));
            },
        },
        eventStart: {
            title: 'Event incoming', len: 1.2, blurb: 'Something has started. Two falling alarm tones over a short riser.',
            fn(D, t) {
                riser(D, t, 0.5, { vol: 0.07, f: 500, f2: 5000 });
                tone(D, t + 0.5, 988, 0.2, { type: 'square', lp: 2500, vol: 0.06, rev: 0.4 });
                tone(D, t + 0.72, 740, 0.35, { type: 'square', lp: 2500, vol: 0.06, rev: 0.4 });
                kick(D, t + 0.5, { vol: 0.5 });
            },
        },
        eventWin: {
            title: 'Event won', len: 1.5, blurb: 'A clean major arpeggio up, and a sparkle.',
            fn(D, t) {
                [0, 4, 7, 12, 16].forEach((n, i) => bell(D, t + i * 0.07, M(72 + n), 1.2, { ratio: 2, idx: 1.2, vol: 0.07, rev: 0.5, echo: 0.2 }));
                for (let k = 0; k < 6; k++) tone(D, t + 0.35 + k * 0.05, M(96 + k * 2), 0.2, { vol: 0.015, rev: 0.6, pan: k % 2 ? 0.5 : -0.5 });
            },
        },
        eventFail: {
            title: 'Event failed', len: 1.5, blurb: 'A chromatic slide down and a thud.',
            fn(D, t) {
                [0, -1, -2, -6].forEach((n, i) => tone(D, t + i * 0.12, M(64 + n), 0.3, { type: 'sawtooth', lp: 1200, vol: 0.07, rev: 0.3 }));
                kick(D, t + 0.48, { vol: 0.6, f0: 90, f1: 35, d: 0.7 });
            },
        },
        prestigeFanfare: {
            title: 'Prestige fanfare', len: 4, blurb: 'Brass hits on I–IV–V, then a held chord with the choir.',
            fn(D, t) {
                const hits = [[52, 56, 59], [57, 61, 64], [59, 63, 66], [64, 68, 71, 76]];
                hits.forEach((ch, i) => {
                    const tt = t + i * 0.32, last = i === 3;
                    pad(D, tt, ch, last ? 2.4 : 0.22, { uni: 2, lp: 2600, fenv: 600, ft: 0.12, a: 0.01, r: last ? 1.5 : 0.1, vol: 0.14, rev: 0.5 });
                    tom(D, tt, 55 + i * 5, { vol: 0.35 });
                });
                choir(D, t + 0.96, M(76), 2.2, { v: 'a', a: 0.3, vol: 0.06, rev: 0.8 });
            },
        },
        redlineCollapse: {
            title: 'Core collapse', len: 2.5, blurb: 'Redline gives way. Everything falls down in pitch and crumbles.',
            fn(D, t) {
                tone(D, t, 1200, 1.6, { type: 'sawtooth', uni: 3, spread: 20, glide: 0.035, gt: 1.5, lp: 3000, sus: true, a: 0.01, r: 0.2, vol: 0.1, rev: 0.4 });
                noise(D, t, 1.8, { type: 'lowpass', f: 8000, f2: 100, vol: 0.14, rev: 0.6 });
                kick(D, t + 0.1, { vol: 0.8, f0: 70, f1: 25, d: 1.8 });
                for (let k = 0; k < 6; k++) glitch(D, t + 0.2 + k * 0.17, { vol: 0.035 - k * 0.004, pan: k % 2 ? 0.6 : -0.6 });
            },
        },
        achievement: {
            title: 'Achievement', len: 1.2, blurb: 'A bright bell triad with a shimmer on top.',
            fn(D, t) {
                [76, 80, 83, 88].forEach((n, i) => bell(D, t + i * 0.05, M(n), 1.4, { ratio: 3.5, idx: 1.3, vol: 0.06, rev: 0.6, echo: 0.2 }));
                noise(D, t, 0.8, { type: 'highpass', f: 9000, sus: true, a: 0.05, r: 0.5, vol: 0.015, rev: 0.6 });
            },
        },
        loreReveal: {
            title: 'Lore reveal', len: 2.5, blurb: 'A reversed swell that lands on a single bell chord.',
            fn(D, t) {
                swell(D, t, 1.2, [60, 67, 75], { vol: 0.1 });
                [60, 67, 72, 75].forEach(n => bell(D, t + 1.2, M(n + 12), 2.6, { ratio: 3.5, idx: 1.5, vol: 0.05, rev: 0.8, echo: 0.3 }));
                tone(D, t + 1.2, M(36), 2, { sus: true, a: 0.01, r: 1.5, vol: 0.16 });
            },
        },
        nullSpeaks: {
            title: 'NULL speaks', len: 3, blurb: 'Under a voice line. A throat-deep formant and a breath panning across the room.',
            fn(D, t) {
                choir(D, t, 55, 2.2, { v: 'o', a: 0.6, r: 0.8, vol: 0.09, det: -30 });
                noise(D, t, 2, { f: 700, q: 1, sus: true, a: 0.8, r: 0.8, vol: 0.035, pan: -0.8, rev: 0.6 });
                noise(D, t + 1, 1.5, { f: 900, q: 1, sus: true, a: 0.6, r: 0.6, vol: 0.03, pan: 0.8, rev: 0.6 });
            },
        },
        ghostPass: {
            title: 'Ghost Operator', len: 2.5, blurb: 'A dead Operator’s cursor drifts past. Two dry clicks from one side, a whine from the other.',
            fn(D, t) {
                const side = Math.random() < 0.5 ? -0.95 : 0.95;
                [0, 0.9].forEach(dt => noise(D, t + dt, 0.03, { type: 'bandpass', f: 3200, q: 1.5, vol: 0.12, pan: side, rev: 0.1 }));
                tone(D, t + 0.3, M(95), 1.8, { sus: true, a: 0.8, r: 0.6, vol: 0.02, vib: [6, 30], pan: -side, rev: 0.7 });
            },
        },
        crashCut: {
            title: 'Crash cut', len: 0.5, duck: 0.0001, stopsMusic: true, blurb: 'The fake crash: the music stops dead after four slivers of buzz. Play something to bring it back.',
            fn(D, t) {
                for (let k = 0; k < 4; k++) tone(D, t + k * 0.07, 93, 0.045, { type: 'square', a: 0.001, vol: 0.06, rev: 0 });
            },
        },
    };

    // ── SFX: interface and gameplay sounds, tinted by the story phase ──────
    /* The tint is what makes the SFX belong to the phase you are in: the same
       ACQUIRE click is a sine blip in Phase 0 and a gritty detuned saw in the
       Long Iteration. Pitch roots follow each phase's key. */
    const TINT = [
        { wave: 'sine',     root: 72, grit: 0,    rev: 0.12, det: 0 },
        { wave: 'triangle', root: 72, grit: 0,    rev: 0.2,  det: 0 },
        { wave: 'square',   root: 76, grit: 0.08, rev: 0.1,  det: 0 },
        { wave: 'sawtooth', root: 72, grit: 0.18, rev: 0.25, det: 22 },
        { wave: 'triangle', root: 77, grit: 0.04, rev: 0.5,  det: 0 },
        { wave: 'sawtooth', root: 62, grit: 0.35, rev: 0.35, det: 14 },
        { wave: 'square',   root: 72, grit: 0.28, rev: 0.6,  det: 38 },
    ];

    let _sfxWin = 0, _sfxCount = 0;
    const SFX = {
        click: {
            title: 'ACQUIRE click', blurb: 'The main button. Changes character with every phase.',
            fn(D, t, T) {
                tone(D, t, M(T.root + 12), 0.05, { type: T.wave, glide: 0.55, gt: 0.05, lp: 5000, det: T.det, vol: 0.13, rev: T.rev });
                kick(D, t, { f0: 180, f1: 60, pd: 0.04, d: 0.08, vol: 0.28, click: false });
                if (T.grit) noise(D, t, 0.03, { type: 'bandpass', f: 2500, q: 1, vol: T.grit * 0.15, rev: 0 });
            },
        },
        hover: { title: 'Hover', blurb: 'Barely there.', fn(D, t, T) { tone(D, t, M(T.root + 31), 0.015, { vol: 0.02, rev: 0 }); } },
        menuClick: {
            title: 'Menu click', blurb: 'Generic button press.',
            fn(D, t, T) { tone(D, t, M(T.root + 7), 0.04, { type: T.wave, lp: 3500, det: T.det, vol: 0.07, rev: T.rev * 0.5 }); },
        },
        tab: {
            title: 'Tab switch', blurb: 'Two quick notes.',
            fn(D, t, T) { tone(D, t, M(T.root + 7), 0.03, { type: T.wave, lp: 3000, vol: 0.06, rev: 0.1 }); tone(D, t + 0.045, M(T.root + 12), 0.04, { type: T.wave, lp: 3000, vol: 0.06, rev: 0.1 }); },
        },
        panelOpen: {
            title: 'Window open', blurb: 'An upward whoosh.',
            fn(D, t, T) { noise(D, t, 0.16, { f: 500, f2: 4000, q: 2, sus: true, a: 0.12, r: 0.05, vol: 0.05, rev: 0.2 }); tone(D, t + 0.12, M(T.root + 12), 0.08, { type: T.wave, lp: 3000, vol: 0.05, rev: T.rev }); },
        },
        panelClose: {
            title: 'Window close', blurb: 'The same whoosh, falling.',
            fn(D, t, T) { noise(D, t, 0.14, { f: 3500, f2: 400, q: 2, sus: true, a: 0.02, r: 0.08, vol: 0.045, rev: 0.2 }); tone(D, t, M(T.root), 0.06, { type: T.wave, lp: 2500, vol: 0.04, rev: T.rev }); },
        },
        toggleOn: { title: 'Toggle on', blurb: 'Up a fourth.', fn(D, t, T) { tone(D, t, M(T.root + 7), 0.04, { type: T.wave, lp: 3000, vol: 0.06 }); tone(D, t + 0.06, M(T.root + 12), 0.05, { type: T.wave, lp: 3000, vol: 0.06 }); } },
        toggleOff: { title: 'Toggle off', blurb: 'Down a fourth.', fn(D, t, T) { tone(D, t, M(T.root + 12), 0.04, { type: T.wave, lp: 3000, vol: 0.06 }); tone(D, t + 0.06, M(T.root + 7), 0.05, { type: T.wave, lp: 3000, vol: 0.06 }); } },
        buy: {
            title: 'Buy', blurb: 'A two-note coin in the phase’s key.',
            fn(D, t, T) { bell(D, t, M(T.root + 12), 0.25, { ratio: 2, idx: 1, vol: 0.07, rev: T.rev }); bell(D, t + 0.06, M(T.root + 19), 0.35, { ratio: 2, idx: 1, vol: 0.07, rev: T.rev }); },
        },
        heavyBuy: {
            title: 'Heavy buy', blurb: 'A big purchase: chord plus weight.',
            fn(D, t, T) { pad(D, t, [T.root, T.root + 7, T.root + 12, T.root + 16], 0.35, { type: T.wave, uni: 1, lp: 2500, a: 0.005, r: 0.3, vol: 0.1, rev: T.rev + 0.2 }); kick(D, t, { vol: 0.5, f0: 120, f1: 40, d: 0.4 }); },
        },
        fail: {
            title: 'Can’t afford', blurb: 'Two low buzzes. Never jittered, so it reads as a rule, not a malfunction.',
            fn(D, t) { [0, 0.09].forEach(dt => tone(D, t + dt, 110, 0.06, { type: 'square', lp: 900, vol: 0.06, rev: 0 })); },
        },
        notif: { title: 'Notification', blurb: 'A soft ping.', fn(D, t, T) { bell(D, t, M(T.root + 19), 0.7, { ratio: 3.5, idx: 1.2, vol: 0.04, rev: 0.4 }); } },
        type: { title: 'Terminal type', blurb: 'One key of the lore typewriter.', fn(D, t) { noise(D, t, 0.012, { type: 'bandpass', f: 2600 + Math.random() * 1400, q: 3, vol: 0.06, rev: 0 }); } },
        loreOpen: { title: 'Lore open', blurb: 'A transmission arrives.', fn(D, t, T) { swell(D, t, 0.35, [T.root, T.root + 7], { vol: 0.05, rev: 0.4 }); bell(D, t + 0.35, M(T.root + 12), 1, { vol: 0.05, rev: 0.6 }); } },
        loreDismiss: { title: 'Lore dismiss', blurb: 'The transmission closes.', fn(D, t, T) { tone(D, t, M(T.root + 12), 0.25, { glide: 0.5, gt: 0.25, vol: 0.04, rev: 0.4 }); } },
        surge: { title: 'Quantum Surge', blurb: 'Bright triangle bloop upward.', fn(D, t) { tone(D, t, 440, 0.3, { type: 'triangle', glide: 3, gt: 0.25, vol: 0.09, rev: 0.4 }); } },
        storm: { title: 'Data Storm', blurb: 'Two-note falling stutter.', fn(D, t) { [0, 0.06, 0.12, 0.18].forEach((dt, i) => tone(D, t + dt, i < 2 ? 880 : 587, 0.04, { type: 'square', lp: 3000, vol: 0.05, rev: 0.2 })); } },
        strike: { title: 'Walker Strike', blurb: 'A single bell ping.', fn(D, t) { bell(D, t, 660, 0.8, { ratio: 3.5, vol: 0.08, rev: 0.4 }); } },
        momentum: { title: 'Momentum Cascade', blurb: 'An ascending run.', fn(D, t) { [0, 4, 7, 11, 14, 19].forEach((n, i) => tone(D, t + i * 0.045, M(67 + n), 0.08, { type: 'triangle', vol: 0.06, rev: 0.3 })); } },
        corrupt: { title: 'Corrupt Packet', blurb: 'A sawtooth growl.', fn(D, t) { tone(D, t, 80, 0.35, { type: 'sawtooth', uni: 3, spread: 40, lp: 900, q: 6, vol: 0.12, rev: 0.2 }); glitch(D, t, { vol: 0.03 }); } },
        freeze: { title: 'Time Freeze', blurb: 'An icy held chord.', fn(D, t) { [83, 88, 95, 100].forEach(n => bell(D, t, M(n), 1.8, { ratio: 4.1, idx: 1.2, vol: 0.03, rev: 0.8 })); } },
        purge: { title: 'Memory Purge', blurb: 'A sweep down.', fn(D, t) { noise(D, t, 0.6, { f: 6000, f2: 200, q: 3, sus: true, a: 0.02, r: 0.2, vol: 0.08, rev: 0.3 }); } },
        breach: { title: 'Anomaly Breach', blurb: 'A sharp metallic alarm.', fn(D, t) { [0, 0.16, 0.32].forEach(dt => bell(D, t + dt, 1320, 0.14, { ratio: 1.41, idx: 5, vol: 0.07, rev: 0.3 })); } },
        gavel: { title: 'Gavel', blurb: 'Order in the Tribunal.', fn(D, t) { gavel(D, t, { vol: 0.45 }); } },
        buildingPlace: { title: 'Building placed', blurb: 'A metallic crunch into the city grid.', fn(D, t) { [80, 120, 200].forEach((f, i) => tone(D, t, f, 0.18, { type: 'square', glide: 0.4, gt: 0.15, lp: 1500, vol: 0.09 - i * 0.02, rev: 0.2 })); noise(D, t, 0.1, { f: 1200, vol: 0.06 }); } },
        glitch: { title: 'Glitch', blurb: 'Random data where a sound should be.', fn(D, t) { glitch(D, t, { vol: 0.05, n: 8, pan: Math.random() * 2 - 1 }); } },
    };

    // ── Public API ─────────────────────────────────────────────────────────
    function play(name, opt) {
        opt = opt || {};
        const cue = CUES[name];
        if (!cue) return false;
        ensure();
        if (current && current.name === name && current.stopAt === null && !opt.restart) return true;
        musicDuck.gain.cancelScheduledValues(ctx.currentTime);
        musicDuck.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
        const fade = opt.fade !== undefined ? opt.fade : 1.6;
        players.forEach(p => { if (p.stopAt === null) fadeOutPlayer(p, opt.fadeOut !== undefined ? opt.fadeOut : 1.4); });
        const t = ctx.currentTime + 0.06;
        const p = makePlayer(name, t, fade);
        players.push(p); current = p;
        dly.delayTime.setTargetAtTime(p.sd * (cue.echoSteps || 3), t, 0.08);
        if (cue.phase !== undefined) sfxPhase = cue.phase;
        emit('play', name);
        return true;
    }
    function stop(fade) {
        if (!ctx) return;
        players.forEach(p => { if (p.stopAt === null) fadeOutPlayer(p, fade !== undefined ? fade : 1.2); });
        current = null;
        emit('stop');
    }
    function stinger(name) {
        const S = STINGERS[name];
        if (!S) return false;
        ensure();
        const t = ctx.currentTime + 0.02;
        if (S.stopsMusic) stop(0.02);
        else if (S.duck !== false) {
            musicDuck.gain.cancelScheduledValues(t);
            musicDuck.gain.setTargetAtTime(S.duck || 0.35, t, 0.04);
            musicDuck.gain.setTargetAtTime(1, t + (S.len || 1.5), 0.5);
        }
        S.fn({ dry: stingBus, rev: revIn, echo: dlyIn }, t);
        emit('stinger', name);
        return true;
    }
    function sfx(name) {
        const X = SFX[name];
        if (!X) return false;
        ensure();
        const now = Date.now();
        if (now - _sfxWin > 80) { _sfxWin = now; _sfxCount = 0; }
        if (_sfxCount >= 6) return false;            // same guard as Sounds.play in game.js
        _sfxCount++;
        X.fn({ dry: sfxBus, rev: revIn, echo: null }, ctx.currentTime + 0.005, TINT[sfxPhase] || TINT[0]);
        return true;
    }
    function nowPlaying() {
        if (!ctx || !current) return null;
        // Scheduling runs ahead of the clock; step back to the one being heard now.
        const ahead = Math.ceil(Math.max(0, current.next - ctx.currentTime) / current.sd);
        const st = Math.max(0, current.step - ahead);
        return { name: current.name, title: current.cue.title, group: current.cue.group, key: current.cue.key,
                 bpm: Math.round(current.cue.bpm * current.sd0 / current.sd), baseBpm: current.cue.bpm,
                 bar: Math.floor(st / 16) + 1, beat: Math.floor((st % 16) / 4) + 1, step: st,
                 stress, layers: stressLayers() };
    }
    // Which instability stages are sounding right now, for the lab's readout.
    function stressLayers() {
        const out = [];
        if (stress >= 0.25) out.push('heartbeat');
        if (stress >= 0.45) out.push('drift', 'phase parts');
        if (stress >= 0.6) out.push('distortion');
        if (stress >= 0.8) out.push('glitches');
        if (stress >= 0.9) out.push('cluster');
        return out;
    }

    function meta(table) {
        return Object.keys(table).map(id => {
            const c = table[id];
            return { id, title: c.title, blurb: c.blurb, group: c.group, phase: c.phase, chapter: c.chapter, sub: c.sub, bpm: c.bpm, key: c.key };
        });
    }

    window.Soundtrack = {
        init: ensure, play, stop, stinger, sfx,
        setIntensity(v) { intensityTarget = clamp(+v || 0, 0, 1); },
        getIntensity() { return intensity; },
        setSfxPhase(p) { sfxPhase = clamp(p | 0, 0, 6); },
        getSfxPhase() { return sfxPhase; },
        setVolume(bus, v) {
            ensure();
            const node = { master, music: musicBus, sfx: sfxBus, stinger: stingBus }[bus];
            if (node) node.gain.setTargetAtTime(clamp(v, 0, 1.5), ctx.currentTime, 0.05);
        },
        nowPlaying,
        analyser() { return analyser; },
        on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
        cues: () => meta(CUES),
        stingers: () => meta(STINGERS),
        sfxList: () => meta(SFX),
    };
})();
