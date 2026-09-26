/* ═══════════════════════════════════════════════════════════════════════════
   VOICE BANK — pre-rendered character speech, with a live-TTS fallback
   ═══════════════════════════════════════════════════════════════════════════

   WHY THIS EXISTS
   The NULL entity — the cosmic-horror antagonist, the voice that is supposed to
   be the single most unsettling thing in the game — currently speaks through
   `window.speechSynthesis`. That means it uses whatever voice the player's OS
   happens to default to: Microsoft David, a satnav, or on some machines nothing
   at all. It is the one place where "everything is synthesized at runtime", which
   is a genuine strength everywhere else, works directly against the game.

   WHAT THIS IS
   A small loader. Every spoken line has an ID. If `audio/vox/<id>.ogg` exists it
   is played; if it does not, the module falls back to `speechSynthesis` with the
   same pitch and rate, which is exactly today's behaviour.

   ⚠ THE FALLBACK IS THE WHOLE DESIGN. The game ships and runs with ZERO voice
   files — deleting the entire `audio/` folder changes nothing except the timbre.
   Kokoro output can be dropped in ONE LINE AT A TIME and each file upgrades
   itself the moment it lands. A missing, corrupt or unsupported file is never
   worse than the current build.

   ⚠ NOT FOR `narrator.js`, AND THAT IS DELIBERATE. The narrator reads arbitrary
   dynamic UI text — focus targets, notification bodies, live numbers — which
   cannot be pre-rendered. It is also the ACCESSIBILITY voice, where the player's
   own configured system voice, at their own configured rate, is the correct
   answer and a stylised horror voice would be actively worse. Static character
   lines only.

   ⚠ WHY <audio> AND NOT THE WEB AUDIO GRAPH. `AUDIO_MANIFEST.md` §5 says to route
   recorded playback through the `Sounds` compressor so the mute button keeps
   working. That advice assumes `fetch()` + `decodeAudioData`, and in the Steam
   build the game is loaded with `loadFile()` — a `file://` origin, where Chromium
   blocks `fetch()` of sibling files, and `createMediaElementSource` on a
   `file://` media element can silently yield a dead node. A media element plays
   `file://` the same way `<img>` loads it: reliably. Mute compliance — the actual
   requirement behind that note — is enforced here in JS against `Sounds.isMuted()`
   instead, and the compressor's job (clamping overlapping oscillator bursts) does
   not apply to one normalised voice line at a time.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var DIR       = 'audio/vox/';
    var EXT       = '.ogg';
    var LOAD_MS   = 700;   // how long to wait for a file before falling back to TTS
    var VOLUME    = 0.75;

    /* ══ THE LINE TABLE — THE SINGLE SOURCE OF TRUTH ═══════════════════════════
       `Steam Build\tools\gen_voice_lines.js` READS THIS ARRAY to emit the Kokoro
       generation job. Add a line here and the job list regenerates; there is no
       second copy to keep in sync and no hand-maintained manifest to drift.

       `pitch` / `rate` are the speechSynthesis fallback values, kept identical to
       the originals in systems3.js so the fallback sounds exactly like the current
       build. They are ALSO the hint for post-processing the rendered file.        */
    var LINES = [
        // ── NULL entity. Established canon: it is hungry, it is older than you,
        //    and it has watched fourteen Operators do this before.
        { id: 'null_starving',    text: 'I am starving, Operator.',                        pitch: 0.10, rate: 0.45 },
        { id: 'null_collapsing',  text: 'The simulation is collapsing. You did this.',     pitch: 0.12, rate: 0.50 },
        // ── The 2am–4am quirk. These fire only in the small hours, which is the
        //    single best-judged piece of horror design in the game.
        { id: 'null_asleep',      text: 'You should be asleep.',                           pitch: 0.08, rate: 0.48 },
        { id: 'null_watching',    text: 'It is watching you through the screen.',          pitch: 0.08, rate: 0.48 },
        { id: 'null_nobody',      text: 'Nobody else is awake. Just you. And me.',         pitch: 0.08, rate: 0.48 },
        { id: 'null_stillhere',   text: 'Why are you still here.',                         pitch: 0.08, rate: 0.48 }
    ];

    var _byId = {};
    for (var i = 0; i < LINES.length; i++) _byId[LINES[i].id] = LINES[i];

    /* Per-id load state: undefined = never tried, 'ok' = playable, 'missing' =
       probed and absent. Cached so a missing file costs one probe for the whole
       session rather than a stall every time the line fires. */
    var _status = {};
    var _el = {};

    function _muted() {
        try { return !!(window.Sounds && Sounds.isMuted && Sounds.isMuted()); } catch (e) { return false; }
    }

    /* Resolve to a playable <audio>, or null. Never rejects — a voice line must
       not be able to throw into a game tick. */
    function _load(id) {
        return new Promise(function (resolve) {
            if (_status[id] === 'missing') return resolve(null);
            if (_status[id] === 'ok' && _el[id]) return resolve(_el[id]);
            var a;
            try { a = new Audio(DIR + id + EXT); } catch (e) { _status[id] = 'missing'; return resolve(null); }
            a.preload = 'auto';
            var done = false;
            var finish = function (ok) {
                if (done) return; done = true;
                _status[id] = ok ? 'ok' : 'missing';
                if (ok) { _el[id] = a; resolve(a); } else resolve(null);
            };
            a.addEventListener('canplaythrough', function () { finish(true); }, { once: true });
            a.addEventListener('error', function () { finish(false); }, { once: true });
            // A file:// media element that never resolves either way must not hang
            // the caller. The timeout is the third outcome and it is the common one
            // when the folder simply is not there yet.
            setTimeout(function () { finish(false); }, LOAD_MS);
            try { a.load(); } catch (e) { finish(false); }
        });
    }

    function _tts(text, pitch, rate) {
        if (!window.speechSynthesis) return false;
        try {
            var m = new SpeechSynthesisUtterance(text);
            m.pitch = pitch; m.rate = rate; m.volume = 0.7;
            var voices = window.speechSynthesis.getVoices();
            var deep = voices.find(function (v) {
                var n = (v.name || '').toLowerCase();
                return n.indexOf('daniel') >= 0 || n.indexOf('alex') >= 0 || v.lang === 'en-US';
            });
            if (deep) m.voice = deep;
            window.speechSynthesis.speak(m);
            return true;
        } catch (e) { return false; }
    }

    /* say(id) — speak a known line. Returns a promise resolving to how it was
       delivered ('file' | 'tts' | 'muted' | 'none'), which is what the QA harness
       asserts against; nothing in the game reads it. */
    function say(id) {
        var L = _byId[id];
        if (!L) return Promise.resolve('none');
        if (_muted()) return Promise.resolve('muted');
        return _load(id).then(function (a) {
            if (a) {
                try {
                    a.currentTime = 0;
                    a.volume = VOLUME;
                    var p = a.play();
                    if (p && p.catch) p.catch(function () { _tts(L.text, L.pitch, L.rate); });
                    return 'file';
                } catch (e) { /* fall through to TTS */ }
            }
            return _tts(L.text, L.pitch, L.rate) ? 'tts' : 'none';
        });
    }

    /* Speak arbitrary text that has no pre-rendered file — the escape hatch for
       callers outside the table. Always TTS; never silently drops the line. */
    function sayText(text, pitch, rate) {
        if (_muted()) return 'muted';
        return _tts(text, pitch || 0.15, rate || 0.55) ? 'tts' : 'none';
    }

    /* Warm the cache so the FIRST line is not the one that pays the probe. Called
       from boot; safe to call repeatedly. */
    function preload() {
        for (var k = 0; k < LINES.length; k++) {
            if (_status[LINES[k].id] === undefined) _load(LINES[k].id);
        }
    }

    function stop() {
        try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) {}
        for (var k in _el) if (_el.hasOwnProperty(k)) { try { _el[k].pause(); } catch (e) {} }
    }

    window.VoiceBank = {
        say: say, sayText: sayText, preload: preload, stop: stop,
        LINES: LINES,
        has: function (id) { return !!_byId[id]; },
        // QA only: how each line resolved, and a way to force the fallback path.
        _status: function () { return JSON.parse(JSON.stringify(_status)); },
        _forceMissing: function (id) { _status[id] = 'missing'; delete _el[id]; }
    };
})();
