/* ═══════════════════════════════════════════════════════════════════════════
   MICRO BUS — the small-sound layer (AUDIO_MANIFEST.md §9)
   ═══════════════════════════════════════════════════════════════════════════
   WHAT THIS IS: a resolver (which control -> which id) plus a rate limiter,
   sitting in front of a sound backend. Today the backend is a fallback map onto
   the existing `Sounds` oscillators (§9.10 step 2 — "prove resolution + the two
   new listeners with zero new assets"). Once ui_sfx_bank.js exists (§9.10 step
   3) `play()` swaps to decoded buffers; MicroBus.play(id)'s signature never
   changes, so nothing that calls it needs to change when that happens.

   ⚠ Per §9.1: nothing the player did not personally cause may make a sound —
   MicroBus is invoked ONLY from real input event listeners (game.js's
   universal click/mousedown/pointerover/pointerdown listeners), never from a
   game tick, autoclicker, or offline-catchup path. */
(function () {
    'use strict';

    // §9.5 rule 3: at most 3 starts per 100ms on this bus, drop the rest silently.
    var RATE_WINDOW_MS = 100;
    var RATE_MAX = 3;
    var _starts = [];

    // Fallback map: id -> existing Sounds method, until real assets land
    // (Task B3). null = no reasonable oscillator stand-in for a tier-0 tick;
    // the resolver having fired is still what qa_micro_sound checks for.
    var FALLBACK = {
        ui_tick_hover:    null,
        ui_focus:         null,
        ui_slider_detent: null,
        ui_tap:           'menuClick',
        ui_tab:           'menuClick',
        ui_panel_open:    'menuClick',
        ui_panel_close:   'menuClick',
        ui_toggle_on:     'menuClick',
        ui_toggle_off:    'menuClick',
        ui_buy_light:     'buy',
        ui_commit:        'menuClick',
        ui_reject:        'fail',
        ui_type:          null,
        ui_count:         null
    };

    /* ── DECODED BUFFERS (§9.6) ───────────────────────────────────────────────
       window.UI_SFX ships as base64 inside ui_sfx_bank.js because Electron's
       file:// origin blocks fetch() of sibling files, and <audio> cannot carry a
       layer firing ~40 times a minute. Decode once, lazily, on the first play —
       an AudioContext cannot start before a user gesture, and play() is only ever
       reached from one. */
    var _buffers = {};      // id -> [AudioBuffer]
    var _lastVariant = {};  // id -> last index used, so a variant never repeats
    var _decodeStarted = false;

    var NO_JITTER = { ui_reject: 1, ui_toggle_on: 1, ui_toggle_off: 1 };

    function _ctx() {
        try { return window.Sounds && Sounds._getCtx && Sounds._getCtx(); } catch (e) { return null; }
    }
    function _out(ctx) {
        try {
            var o = window.Sounds && Sounds._getOut && Sounds._getOut();
            return o || ctx.destination;
        } catch (e) { return ctx.destination; }
    }

    function _startDecode() {
        if (_decodeStarted) return;
        var bank = window.UI_SFX;
        /* ⚠ An EMPTY bank is `{}`, which is truthy — the first version fell through this
           guard and called Sounds._getCtx() on every play with nothing to decode. That is
           wasteful, and it broke qa_ui_sound, whose spy counts every Sounds call as a
           sound: a bare button started reporting ["_getCtx","menuClick"] and failed its
           exactly-one assertion. Check for CONTENT, not for the object. */
        if (!bank || !Object.keys(bank).length) return;   // nothing shipped: oscillators
        var ctx = _ctx();
        if (!ctx) return;               // no context yet; try again on the next play
        _decodeStarted = true;
        Object.keys(bank).forEach(function (id) {
            (bank[id] || []).forEach(function (b64) {
                var bytes;
                try {
                    var bin = atob(b64);
                    bytes = new Uint8Array(bin.length);
                    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                } catch (e) { return; }
                try {
                    ctx.decodeAudioData(bytes.buffer, function (buf) {
                        (_buffers[id] = _buffers[id] || []).push(buf);
                    }, function () { /* undecodable: that id keeps its oscillator */ });
                } catch (e) {}
            });
        });
    }

    /* Returns true if a buffer actually started. */
    function _playBuffer(id) {
        var list = _buffers[id];
        if (!list || !list.length) return false;
        var ctx = _ctx();
        if (!ctx) return false;

        /* §9.5 rule 2: round-robin, never the same variant twice running. */
        var idx = 0;
        if (list.length > 1) {
            idx = (( _lastVariant[id] == null ? -1 : _lastVariant[id]) + 1) % list.length;
        }
        _lastVariant[id] = idx;

        try {
            var src = ctx.createBufferSource();
            src.buffer = list[idx];
            /* §9.5 rule 1: ±6% pitch jitter, except where a varying sound would read
               as a malfunction rather than as a property of the interface. */
            if (!NO_JITTER[id]) src.playbackRate.value = 1 + (Math.random() * 0.12 - 0.06);
            src.connect(_out(ctx));
            src.start();
            return true;
        } catch (e) { return false; }
    }

    function _rateLimited() {
        var now = Date.now();
        _starts = _starts.filter(function (t) { return now - t < RATE_WINDOW_MS; });
        if (_starts.length >= RATE_MAX) return true;
        _starts.push(now);
        return false;
    }

    function _isEffectivelyMuted() {
        try { return !!(window.Sounds && Sounds.isMuted && Sounds.isMuted()); } catch (e) { return false; }
    }

    var _dispatchedCount = 0; // QA only: real plays, i.e. survived mute + rate limit

    /* play(id) — the ONLY entry point. Returns nothing; never throws into a
       game-tick or input handler. */
    function play(id) {
        if (_isEffectivelyMuted()) return;
        if (_rateLimited()) return;
        _dispatchedCount++;

        /* Real asset first; oscillator only if there is no buffer for this id.
           ⚠ decodeAudioData is async and play() must never await — it runs inside
           input handlers. So the first press of a not-yet-decoded sound takes the
           oscillator and the next one takes the buffer. Silence is never chosen. */
        _startDecode();
        if (_playBuffer(id)) return;

        var fallback = FALLBACK[id];
        if (fallback && window.Sounds && typeof Sounds[fallback] === 'function') {
            try { Sounds[fallback](); } catch (e) {}
        }
    }

    /* ── THE ROUTER (§9.7) ────────────────────────────────────────────────────
       Resolution order, first match wins:
         1. data-snd override on the element or nearest ancestor
         2. class -> id table for what exists today
         3. fallback -> ui_tap                                                */
    function resolve(el) {
        if (!el) return 'ui_tap';

        var override = el.closest && el.closest('[data-snd]');
        if (override) return override.getAttribute('data-snd');

        // .item-card: reached via mousedown (§9.4), not the click path.
        // Affordability decides buy vs reject; `.locked` is the existing signal.
        var card = el.closest && el.closest('.item-card');
        if (card) return card.classList.contains('locked') ? 'ui_reject' : 'ui_buy_light';

        if (el.matches && (el.matches('.toggle') || el.matches('[type="checkbox"]'))) {
            // Resolve by the state the control is ABOUT to end up in for a
            // checkbox (browser flips `.checked` before the click listener
            // runs), so "on"/"off" matches the result, not the prior state.
            return el.checked ? 'ui_toggle_on' : 'ui_toggle_off';
        }

        if (el.closest && el.closest('.nav-btn, [role="tab"], .tab-btn')) return 'ui_tab';
        if (el.closest && el.closest('.panel-close-btn')) return 'ui_panel_close';
        if (el.closest && el.closest('.main-menu-btn, .control-btn, .fmt-btn, .dev-btn')) return 'ui_tap';

        return 'ui_tap';
    }

    window.MicroBus = {
        play: play,
        resolve: resolve,
        _isEffectivelyMuted: _isEffectivelyMuted,
        // QA only.
        _rateState: function () { return _starts.length; },
        _dispatchedCount: function () { return _dispatchedCount; },
        // QA only: which ids have a decoded buffer behind them right now.
        _loadedIds: function () { return Object.keys(_buffers); },
        _resetDispatchedCount: function () { _dispatchedCount = 0; }
    };
})();
