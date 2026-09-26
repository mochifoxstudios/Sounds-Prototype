/* ═══════════════════════════════════════════════════════════════════════════
   WINDOW MANAGER — the panels become movable, resizable windows.

   Owner, 2026-09-05: "I want the game to be like an OS, all the panels like the
   shops are windows, resizable and movable (resizable to a certain degree). That
   means taking away the fact that when a panel is open that time pauses, as you
   will be able to click and see both the button and shop at the same time. We
   also have to make sure that when panels are opened, that they have a default
   position to move to so they don't cover other things."

   ⭐ THIS IS A LAYER OVER `PanelNav`, NOT A REPLACEMENT. PanelNav already owns
   the close animation and its cancel, the nav-button state, the `.open` class and
   the scroll-shadow observer. Re-implementing any of that is how the V1.21.1.3
   invisible-panel bug happened. This adds geometry, z-order and persistence, and
   PanelNav calls into it.

   ⛔⛔ EVERYTHING IS GATED ON `body.os-windows`. Without that class the build
   behaves exactly as it did — full-screen modal overlays, one at a time, time
   paused. That is the kill switch, and it is one class rather than a revert.

   ── FOUR THINGS THAT WERE MEASURED FIRST, NOT ASSUMED ────────────────────────

   1. ⛔ A WINDOW CANNOT LIVE INSIDE `#main-game`. It is `position:fixed` with
      `z-index:10`, `contain: layout style` and `overflow:hidden` — a stacking
      context sealed at 10, while `#bottom-nav` is a SIBLING at 8000. Measured
      with the same synthetic window in both parents (`tools/probe_windows.js`):
      the body copy came to the front and reached the corner, the #main-game copy
      did neither. The five panels that lived in there were moved out, and
      `qa_window_parent` keeps them out.

   2. ⛔ NO FULL-WIDTH PANEL FITS BESIDE THE ACQUIRE BUTTON. Measured: 848px free
      either side at 1904px wide, 560px on a Steam Deck, against a 1400px house
      default. ▶ **So a default placement must SHRINK the window, not merely move
      it** — which is also the honest reading of the owner's "resizable to a
      certain degree": the degree is what still fits beside the button.

   3. ⛔ `.panel-overlay-inner` IS `background: transparent`, deliberately and
      twice. PART NINE §1 removed it because a 1200px box inside a 3440px scrim in
      two nearly identical darks showed the player nothing but the seam between
      them. ⭐ The rule was ONE opaque surface, and it still is — a window has no
      scrim, so the surface moves to the window. Reinstating it here is not
      undoing that fix, it is applying it.

   4. ⛔ PANEL WIDTH CAPS ARE INLINE IN `index.html`, not in the stylesheet, on
      five panels (mega 1200, compiler 1150, binding 1150, simslots 580, null 420).
      An inline style beats any normal CSS rule, so the window width is set with
      `!important` — a resize handler that quietly loses to an inline `max-width`
      looks exactly like a handler that is ignoring the drag.

   ── AND ONE DESIGN DECISION WORTH THE COMMENT ────────────────────────────────

   ⭐⭐ CLICK-TO-FRONT REASSIGNS THE WHOLE BAND, IT DOES NOT INCREMENT A COUNTER.
   The obvious implementation — `el.style.zIndex = ++_z` — walks upward for ever,
   and this project's token scale reserves `--z-above-panel` (420) for "elements
   that must sit above open panels", `--z-birds` 450, `--z-companion` 580,
   `--z-modal` 600. Twenty-one clicks and a window is at 421, silently painting
   over the birds. So the open windows are renumbered 400, 401, 402 … on every
   raise. There are at most 13 panels, so the band can never exceed 412 and the
   scale below 420 keeps meaning what it says.
   ═══════════════════════════════════════════════════════════════════════════ */
const WindowManager = (() => {
    'use strict';

    const Z_BASE = 400;          // --z-panel
    const Z_CEIL = 419;          // one below --z-above-panel; see the note above
    const GRIP = 16;             // resize grip hit area, px
    const EDGE = 8;              // keep this much of a window on screen, px

    /* Per-panel minimums. ⚠ These are not taste: OS_WINDOWS_PLAN §4 names the two
       panels whose CONTENT stops working when narrow rather than merely looking
       cramped — the Archive is `repeat(auto-fill, minmax(92px,1fr))` and the Stats
       panel is a four-column `analytics-grid`, both widened deliberately in
       earlier passes. A window narrower than these is not a small window, it is a
       broken one. The city is bounded by its canvas. */
    const MIN = {
        city:     { w: 620, h: 460 },
        stats:    { w: 680, h: 420 },
        terminal: { w: 560, h: 400 },
        /* ⛔ h RAISED 400 → 480, 2026-09-20, and it is the same kind of statement as every
           other number here: where the CONTENT stops working. Added up at the minimum, the
           shop needs header 144 + one side-systems bar 44 + the assets divider 24 + the
           filter 39 + `#shop-list`'s own 148px floor 148 + padding. That is ~440, so 400
           could not be satisfied and something had to give — measured, what gave was the
           side-systems room, crushed to 0px with MEDUSA, THE MACHINE and PROCESS FORKING
           all unreachable at that size.
           ⚠ 480 WAS STILL TOO SMALL, and only measuring showed it: at 480 the next-unlock
           hint below the list overflowed the body by 46px and was clipped away. The sum the
           panel actually has to satisfy is header 144 + room 44 + divider 24 + filter 39 +
           list floor 148 + hint 41 + padding ≈ 526. 540 states that with a little margin.
           ⭐ Raised twice because it was DERIVED twice — the first figure came from adding
           up the parts I could see, the second from rendering it and finding the part I had
           forgotten. The number is a measurement, not an opinion.
           ⚠ MIN does not win over the free column (see `defaultBox`), so this does not let
           the shop cover the ACQUIRE button on a Steam Deck; it only stops the panel being
           dragged smaller than its own contents. At 1280x800 the usable height is ~616, so
           540 still fits a Deck. */
        shop:     { w: 420, h: 540 },
        prestige: { w: 520, h: 400 },
        exchange: { w: 520, h: 400 },
        _default: { w: 360, h: 280 },
    };
    /* what a window opens at when there is room for it.
       ⭐ MEASURED 2026-09-13, not guessed — tools/probe_window_sizes.js squeezes each
       panel and reads the HEIGHT its scrolling content needs, because these overlays
       are flex COLUMNS: they never overflow sideways, they get taller. Content height
       at each window width, lower is better:

                  640px   760px   900px  1100px
         compiler  1020     532     531     818     <- halves between 640 and 760
         binding   1418    1070     994     818
         stats     1575    1279    1307     979
         shop      1028     996     963     908
         city      3373    3373    3373    4013

       ⛔ EIGHT OF TWELVE PANELS SHARED ONE LITERAL, `_default: 640`, which was never
       a decision about any of them. compiler and binding are the two with a measured
       requirement above it, so they get named; the rest measured flat and keep the
       default honestly rather than being given an invented number.
       ✅ terminal and exchange were VOID in the first run — PanelNav.toggle('terminal')
       opens an EMPTY Archive (Terminal.open() builds the grid) and ExchangeTabs was
       never asked to draw a tab, so both measured as needing nothing, which reads
       exactly like a panel that is comfortable. Re-measured with the renderers driven:

         terminal  2750 @380  1847 @540  1942 @640  then FLAT  -> plateaus by ~640
         exchange   699 @380   544 @540   512 @640  then FLAT  -> plateaus at 640

       ⭐ NEITHER NEEDS A CHANGE, and that is now a measurement rather than an
       assumption: exchange's shared 640 default is exactly right, and terminal's 860
       is already past its plateau. A panel that measures flat keeps what it has.
       ⚠ None of this is honoured where the column is narrower — on a Steam Deck it
       is 536px and clamp's hard cap wins, which is the point of that cap. */
    const PREF = {
        city:     { w: 900, h: 700 },
        stats:    { w: 900, h: 640 },
        terminal: { w: 860, h: 620 },
        shop:     { w: 620, h: 720 },
        compiler: { w: 760, h: 600 },
        binding:  { w: 900, h: 700 },
        /* §4.5 PORT — NULL was re-laid out into two columns (MOCKUP_DECISIONS §6),
           so it now ASKS for room it never needed as a single column.
           ⚠ This is a request, not a guarantee. defaultBox clamps into the free
           column beside the ACQUIRE button, and that column is a HARD boundary --
           measured 342px in a 1920 window with the notification stack up. When it
           is narrower than two 300px tracks the grid folds back to one column on
           its own, which is the correct outcome and what the Deck needs. */
        null:     { w: 760, h: 560 },
        _default: { w: 640, h: 560 },
    };

    /* ⛔⛔ CONTENT THAT MUST BE TOLD WHEN ITS WINDOW CHANGES SIZE.
       Almost everything in these panels is CSS and reflows by itself. A CANVAS
       does not: it carries an explicit pixel buffer, and no amount of layout will
       change it. Measured on the city at 684x583 -- map wrapper 420x312, SVG
       lattice correctly 418x310, and `City._canvas` still 584x584, the size it
       had as a full-screen panel. The two layers of the city were drawing at
       different scales.
       ⚠ Keyed by panel and kept short on purpose. If this table grows past a
       few entries it is the wrong shape and the panels should be reflowing
       themselves. */
    const ON_RESIZE = {
        city: () => {
            try { if (typeof City !== 'undefined' && City.resizeCanvas) City.resizeCanvas(); } catch (e) {}
            try { if (window.CityGrid && CityGrid.sync) CityGrid.sync(); } catch (e) {}
            try { if (typeof City !== 'undefined' && City.markDirty) City.markDirty(); } catch (e) {}
        },
    };

    /* ⛔⛔ THE WIDTH CLASS. A media query sees the VIEWPORT, so every responsive
       rule in game.css asks how big the SCREEN is -- correct when a panel was
       always full-screen, wrong now. A 420px shop window on a 3440px display
       matches every desktop breakpoint in the file.
       ⚠ Breakpoints chosen from measurement, not taste: the panels that clip do
       it at the 620-684px default and stop clipping by the ~790px half-snap, so
       the boundary that matters sits between them. */
    const WIN_SIZES = [
        ['win-xnarrow', 0],
        ['win-narrow', 480],
        ['win-mid', 700],
        ['win-wide', 980],
    ];
    /* ⛔⛔ AND THE VERTICAL HALF, WHICH WAS NEVER BUILT — added 2026-09-20.
       The comment above says a media query asks how big the SCREEN is and that
       this is "correct when a panel was always full-screen, wrong now". That is
       right, and only the WIDTH half was ever built, so every rule whose squeeze
       is VERTICAL kept asking the viewport.

       ⭐ It had already cost something, in the shop, and the cost is recorded in
       game.css's own comment beside `@media (max-height: 900px)`: that rule exists
       because the SIGNALS legend "was eating the shop on a Steam Deck", and hiding
       it "took #shop-list from 30px to 176px". ⛔ It is a VIEWPORT query. On a
       1306px-tall display it never fires — so the 720px-tall shop WINDOW rendered
       the full four-line legend, the header came to 220px, and `#shop-list` sat at
       its 148px minimum with every purchasable item clipped below the fold. The
       panel the player opens to buy things showed nothing to buy.
       ⚠ The defect was diagnosed in that comment, in those words, and then fixed
       with an instance of the thing it diagnosed.

       ⚠ ONE BOUNDARY, at the same 900 the stylesheet already chose, so the windowed
       and full-screen paths agree rather than drifting to two different ideas of
       "short". `qa_shop_density` asserts they agree. */
    const WIN_HEIGHTS = [
        ['win-short', 0],
        ['win-tall', 900],
    ];
    function applyWidthClass(ov) {
        const r = ov.getBoundingClientRect();
        let pick = WIN_SIZES[0][0];
        for (const [cls, min] of WIN_SIZES) if (r.width >= min) pick = cls;
        for (const [cls] of WIN_SIZES) ov.classList.toggle(cls, cls === pick);
        let hpick = WIN_HEIGHTS[0][0];
        for (const [cls, min] of WIN_HEIGHTS) if (r.height >= min) hpick = cls;
        for (const [cls] of WIN_HEIGHTS) ov.classList.toggle(cls, cls === hpick);
    }

    let _order = [];             // open window ids, back to front
    let _bound = new WeakSet();  // overlays whose chrome is installed

    const on = () => document.body.classList.contains('os-windows');

    /* the panel key PanelNav uses: `overlay-shop` -> `shop`.
       ⚠ `museum-overlay` does not follow the convention — it is the one element
       PanelNav cannot resolve — so it is normalised here rather than skipped. */
    function keyOf(ov) {
        if (!ov || !ov.id) return null;
        if (ov.id === 'museum-overlay') return 'museum';
        return ov.id.replace(/^overlay-/, '');
    }
    function elOf(key) {
        return document.getElementById(key === 'museum' ? 'museum-overlay' : 'overlay-' + key);
    }
    const minOf  = k => MIN[k]  || MIN._default;
    const prefOf = k => PREF[k] || PREF._default;

    /* ── THE NO-GO RECTANGLE ────────────────────────────────────────────────
       ⭐ MEASURED, NEVER HARD-CODED. `#click-btn` is sized in `vmin`, so it is
       208×208 at 1904px and 144×144 on a Steam Deck — a table of coordinates
       would be right on one machine and wrong on the other. */
    function noGo() {
        const r = [];
        for (const id of ['click-btn', 'energy-display', 'bottom-nav']) {
            const e = document.getElementById(id);
            if (!e) continue;
            const b = e.getBoundingClientRect();
            if (b.width > 0 && b.height > 0) r.push(b);
        }
        return r;
    }

    /* The widest free column either side of the ACQUIRE button.

       ⛔⛔ AND IT REPORTS *USABLE* WIDTH, NOT RAW WIDTH. `#notif-col` is anchored
       just outside the centre panel's right edge at z-index 620 -- above the whole
       window band -- so a window opened on the right sits under the toast stack.
       The raw columns are within a pixel of each other at 1600px (709 against 708)
       because ACQUIRE is centred, so the tie always went to the one side that
       already had something in it. Measured in a rendered frame: three achievement
       cards across the Statistics window.
       ⚠ Subtracting the lane is a measurement rather than a preference, so it
       still picks the right-hand side on an ultrawide where the column is wide
       enough for both. */
    function freeColumns() {
        const btn = document.getElementById('click-btn');
        if (!btn) return { left: innerWidth, right: 0, btn: null, notif: null };
        const b = btn.getBoundingClientRect();
        let left = Math.max(0, b.left);
        let right = Math.max(0, innerWidth - b.right);
        const nc = document.getElementById('notif-col');
        let notif = null;
        if (nc) {
            const n = nc.getBoundingClientRect();
            if (n.width > 0 && n.height > 0) {
                notif = n;
                if (n.left >= b.right) right = Math.max(0, right - (innerWidth - n.left));
                else if (n.right <= b.left) left = Math.max(0, left - n.right);
            }
        }
        return { left: left, right: right, btn: b, notif: notif };
    }

    function navHeight() {
        const n = document.getElementById('bottom-nav');
        if (!n) return 0;
        const b = n.getBoundingClientRect();
        /* ⚠ the player can move the bar (PLAYTEST_REVIEW §11). Moved up the screen it no longer occupies the
           bottom edge, and "everything below its top" would shrink every snap and maximise to nothing. */
        if (b.bottom < innerHeight - 60) return 0;
        return Math.max(0, innerHeight - b.top);
    }

    /* ── DEFAULT PLACEMENT ──────────────────────────────────────────────────
       Owner: "when panels are opened, they have a default position to move to so
       they don't cover other things."
       ⭐ The thing that must never be covered is the ACQUIRE button, because
       clicking while a panel is open is the entire point of the change.
       ⚠ And since no full-width panel fits beside it, this SHRINKS to the free
       column and only overlaps when even the minimum will not fit — in which case
       it still biases to the roomier side rather than landing on the button. */
    function defaultBox(key) {
        const pref = prefOf(key), min = minOf(key);
        const cols = freeColumns();
        const navH = navHeight();
        const topPad = 76;
        const side = cols.right >= cols.left ? 'right' : 'left';

        /* ⛔⛔ THE FREE COLUMN IS A HARD BOUNDARY, NOT A STARTING POINT.
           The first version treated it as a starting point and cascaded inward
           from the screen edge -- and the comment on that code asserted the
           cascade "can never drift onto the ACQUIRE button". It is false for any
           window already as wide as the column: there is nowhere inward to go
           that is NOT the button. city, stats and terminal are all 684px against a
           684px column and were 41px over it by the third step.
           ⚠ Caught the first time qa_windows §7 was widened to ask about every
           no-go zone rather than only the button. A comment asserting an invariant
           is not the invariant. */
        const btn = cols.btn;
        /* ⚠ The column EDGES come from the button; only the SIDE CHOICE above
           uses the notification-adjusted width. Sizing a window into an adjusted
           width and then placing it against an unadjusted edge is how a window
           ends up hanging off the side it was measured for. */
        const colLeft  = side === 'right' ? Math.ceil(btn ? btn.right : 0) + 12 : 12;
        const colRight = side === 'right' ? innerWidth - 12
                                          : Math.floor(btn ? btn.left : innerWidth) - 12;
        const colW = Math.max(0, colRight - colLeft);
        /* ⛔⛔ THE COLUMN WINS OVER MIN — IT DID NOT, AND THE INVARIANT ABOVE WAS
           FALSE A SECOND TIME. The line was
             Math.max(min.w, Math.min(pref.w, Math.max(min.w, colW)))
           whose OUTER Math.max lets MIN beat the column. Measured 2026-09-13 on a
           Steam Deck (1280x800, widest free column 560px): stats opened at its
           MIN of 680 and put **132x159px across the ACQUIRE no-go zone**, city 72px
           over, terminal 12px over — 3 of 12 windows. At 1920x1080: 0 of 12, so it
           is invisible on a desk and only bites the handheld.
           ⭐ A cramped panel is worse than a comfortable one; a panel covering the
           game's primary verb is worse than both. MIN says where CONTENT stops
           working, and that cannot outrank a hard geometric boundary — the player
           can widen the window, and cannot un-cover the button.
           ⚠ The comment above already asserted this invariant once and was wrong
           once; qa_windows now measures it at Deck size rather than asserting it. */
        const w = Math.max(Math.min(min.w, colW), Math.min(pref.w, colW));

        /* ⭐ CASCADE, BECAUSE EVERY WINDOW USED TO COMPUTE THE SAME BOX. Opening a
           second window put it exactly on top of the first, which in a rendered
           frame is indistinguishable from the first never having opened at all.
           ⚠ Wrapped every four steps so a long session cannot walk a window off
           the board, and CLAMPED back into the column below -- a window that fills
           its column therefore cascades in y only, which is correct, because there
           is genuinely no x left to move it to. */
        const STEP = 26;
        const n = _order.length % 4;
        let x = side === 'right' ? colRight - w : colLeft;
        let y = topPad;
        let h = Math.min(pref.h, Math.max(min.h, innerHeight - navH - y - 16));

        /* ⛔⛔ AND CLEAR THE HUD, NOT JUST THE BUTTON. noGo() collects the
           ACQUIRE button, the energy readout and the nav bar, and defaultBox
           consulted NONE of it -- it used freeColumns(), which knows only about
           the button. Computed and never consumed, which is this project's
           signature defect, committed here inside the function written to avoid
           it. ⚠ It was invisible to every check in qa_windows because the box was
           valid in every respect the suite could then see; it took a SCREENSHOT,
           in which the window sat over the last three digits of the energy
           counter -- the one number the whole game is about.
           ▶ Push below an obstacle only when a usable window still fits under it;
           otherwise leave it and let the player move it, which is better than a
           window squashed to nothing. */
        for (const r of noGo()) {
            const overlapsX = x < r.right && x + w > r.left;
            const overlapsY = y < r.bottom && r.top < y + h;
            if (!overlapsX || !overlapsY) continue;
            const below = Math.ceil(r.bottom) + 12;
            if (below + min.h <= innerHeight - navH - 12) {
                y = Math.max(y, below);
                h = Math.min(h, Math.max(min.h, innerHeight - navH - y - 16));
            }
        }

        /* ⭐⭐ CASCADE LAST, BECAUSE THE OBSTACLE PUSH ABOVE FLATTENS IT.
           The offsets used to be applied to x and y at the top, and then this
           loop pushed y down to clear the energy readout -- to the SAME value for
           every window, because they all clear the same obstacle. So the cascade
           was computed and then thrown away: in a rendered frame with two windows
           open, only one was visible, the wider one covering the other exactly.
           ⚠ And §7 was green throughout, because it asks whether defaultBox
           RETURNS different values as _order grows -- which it did, before the
           push. ▶ Nothing may run after the cascade, or it is not a cascade.
           ⚠ x is still clamped into the free column: a window that fills its
           column cascades in y alone, which is correct, because moving it in x
           means moving it onto the ACQUIRE button. */
        if (n > 0) {
            const cx = side === 'right' ? x - n * STEP : x + n * STEP;
            x = side === 'right' ? Math.max(colLeft, cx) : Math.min(colRight - w, cx);
            const maxY = innerHeight - navH - min.h - 12;
            y = Math.min(y + n * STEP, Math.max(topPad, maxY));
            h = Math.min(h, Math.max(min.h, innerHeight - navH - y - 16));
        }
        /* ⚠ colW is passed as the hard cap: the free column beside ACQUIRE is a
           geometric boundary, and clamp would otherwise restore MIN over it. */
        return clamp({ x: Math.max(EDGE, x), y: y, w: w, h: h }, key, colW);
    }

    /* The maximised box: the whole board minus the nav island and a small margin.
       ⚠ DERIVED, never stored. A maximised window that remembered a box would stop
       being maximised the moment the display changed size, which is the one time it
       most obviously should not. */
    function maxBox(key) {
        const navH = navHeight();
        return clamp({ x: 12, y: 12, w: innerWidth - 24,
                       h: innerHeight - navH - 24 }, key);
    }

    /* ── SNAP ZONES ──────────────────────────────────────────────────────
       ⛔⛔ THE EDGE BAND IS GENEROUS ON PURPOSE. A 4px band is technically a snap
       zone and practically a dare. Windows uses the pointer reaching the screen
       edge; here the board is inside a game window, so a 30px band from the edge
       is the closest honest equivalent. */
    /* ⛔⛔ 30 → 10 (PLAYTEST_REVIEW §11: "the panel-snapping behavior when resizing/moving is janky and feels
       worse than standard OS window snapping"). A 30px band meant any drag that brought a title bar near the
       top MAXIMISED the window, and any drag near a side half-snapped it — the player was moving a window and
       the manager decided to resize it. An OS snaps when the POINTER reaches the edge; the game runs maximised
       or fullscreen, so the pointer can, and 10px is "at the edge" with a little mercy for touch. */
    const SNAP_BAND = 10;

    /* the region a snapped window may occupy: the board, minus the nav island.
       ⚠ NOT the raw viewport -- a window snapped under the floating nav puts its
       own footer controls somewhere the player cannot click. */
    function snapArea() {
        return { x: 0, y: 0, w: innerWidth, h: Math.max(120, innerHeight - navHeight()) };
    }

    /* Which zone is the POINTER in? Pointer, not window box -- dragging by the
       title bar means the box is wherever the grab offset put it, and snapping
       has to answer to the hand rather than to the geometry. */
    function snapZoneAt(px, py) {
        const a = snapArea();
        const nearL = px <= a.x + SNAP_BAND;
        const nearR = px >= a.x + a.w - SNAP_BAND;
        const nearT = py <= a.y + SNAP_BAND;
        const nearB = py >= a.y + a.h - SNAP_BAND;
        const hw = Math.round(a.w / 2), hh = Math.round(a.h / 2);
        /* corners first: a corner is inside both edge bands, so testing edges
           first would make the quarters unreachable */
        if (nearT && nearL) return { id: 'tl', x: a.x, y: a.y, w: hw, h: hh };
        if (nearT && nearR) return { id: 'tr', x: a.x + hw, y: a.y, w: a.w - hw, h: hh };
        if (nearB && nearL) return { id: 'bl', x: a.x, y: a.y + hh, w: hw, h: a.h - hh };
        if (nearB && nearR) return { id: 'br', x: a.x + hw, y: a.y + hh, w: a.w - hw, h: a.h - hh };
        if (nearT) return { id: 'max', x: a.x, y: a.y, w: a.w, h: a.h };
        if (nearL) return { id: 'left', x: a.x, y: a.y, w: hw, h: a.h };
        if (nearR) return { id: 'right', x: a.x + hw, y: a.y, w: a.w - hw, h: a.h };
        return null;
    }

    let _preview = null;
    function snapPreview(zone) {
        if (!zone) {
            if (_preview) _preview.classList.remove('visible');
            return;
        }
        if (!_preview) {
            _preview = document.createElement('div');
            _preview.id = 'win-snap-preview';
            _preview.setAttribute('aria-hidden', 'true');
            document.body.appendChild(_preview);
        }
        _preview.style.left = zone.x + 'px';
        _preview.style.top = zone.y + 'px';
        _preview.style.width = zone.w + 'px';
        _preview.style.height = zone.h + 'px';
        _preview.classList.add('visible');
    }

    /* ⚠ A SNAP IS NOT A MAXIMISE, even when it covers the same rectangle. The
       `max` flag drives reopen-maximised and the double-click restore, and a
       snapped window that claimed to be maximised would restore to a box the
       player never chose. Only the top-edge zone sets it. */
    function applySnap(key, zone) {
        const ov = elOf(key);
        if (!ov || !zone) return;
        /* ⭐ remember the box the window had BEFORE it snapped (kept across snaps from zone to zone), so
           dragging it out of the snap gives that size back — the same `pre` a maximise keeps */
        const before = boxOf(ov);
        applyBox(ov, clamp({ x: zone.x + 6, y: zone.y + 6,
                             w: zone.w - 12, h: zone.h - 12 }, key));
        try {
            if (!state._windows) state._windows = {};
            const cur = state._windows[key] || {};
            if (!cur.snapped && !cur.max) cur.pre = { x: Math.round(before.x), y: Math.round(before.y),
                                                      w: Math.round(before.w), h: Math.round(before.h), moved: 1 };
            cur.snapped = zone.id;
            const b = boxOf(ov);
            cur.x = Math.round(b.x); cur.y = Math.round(b.y);
            cur.w = Math.round(b.w); cur.h = Math.round(b.h);
            cur.moved = 1;
            cur.max = (zone.id === 'max') ? 1 : 0;
            state._windows[key] = cur;
        } catch (e) {}
        const hook = ON_RESIZE[key];
        if (hook) setTimeout(hook, 60);
    }

    function isMax(key) {
        try { return !!(state && state._windows && state._windows[key] && state._windows[key].max); }
        catch (e) { return false; }
    }

    /* ⛔⛔ MAXIMISED IS A STATE, NOT A BOX. Restoring has to give back the box the
       player actually had, so the pre-maximise geometry is kept beside the flag
       rather than overwriting it -- otherwise un-maximising drops the window at
       whatever default it would have had, which reads as the window manager
       forgetting where you put it. */
    function toggleMax(key) {
        const ov = elOf(key);
        if (!ov) return;
        let rec = null;
        try { rec = (state._windows && state._windows[key]) || null; } catch (e) {}
        if (isMax(key)) {
            const prev = rec && rec.pre;
            applyBox(ov, prev ? clamp(prev, key) : defaultBox(key));
            try { state._windows[key].max = 0; } catch (e) {}
        } else {
            const now = boxOf(ov);
            try {
                if (!state._windows) state._windows = {};
                const cur = state._windows[key] || {};
                cur.pre = { x: Math.round(now.x), y: Math.round(now.y),
                            w: Math.round(now.w), h: Math.round(now.h), moved: 1 };
                cur.max = 1;
                state._windows[key] = cur;
            } catch (e) {}
            applyBox(ov, maxBox(key));
        }
        raise(key);
        const hook = ON_RESIZE[key];
        if (hook) setTimeout(hook, 60);
        try { if (typeof Game !== 'undefined' && Game.save) Game.save(); } catch (e) {}
    }

    /* ⚠ Clamped so a window can never be lost: at least EDGE px stay on screen on
       every side, and the header stays reachable — a window dragged off the top
       can otherwise never be dragged back. */
    /* ⛔⛔ capW IS A HARD GEOMETRIC CAP THAT OUTRANKS MIN, AND IT HAD TO EXIST.
       This function floors width at min.w, which is right when a PLAYER resizes --
       MIN says where the content stops working. It is wrong when the space
       physically is not there: defaultBox computed a correct 536px on a Steam Deck
       and clamp raised it straight back to MIN (stats 680), putting 132x159px of
       the window across the ACQUIRE no-go zone. 3 of 12 windows on a Deck, 0 of 12
       at 1920x1080, so it never showed on a desk.
       ⭐ A caller that knows a boundary passes it; everyone else is unchanged. */
    function clamp(box, key, capW) {
        const min = minOf(key);
        const hardW = Math.min(innerWidth - EDGE * 2,
                               (typeof capW === 'number' && capW > 0) ? capW : Infinity);
        const b = {
            w: Math.min(Math.max(min.w, Math.min(box.w, innerWidth - EDGE * 2)), hardW),
            h: Math.max(min.h, Math.min(box.h, innerHeight - EDGE * 2)),
            x: box.x, y: box.y,
        };
        b.x = Math.min(Math.max(b.x, EDGE - b.w + 120), innerWidth - EDGE - 40);
        b.y = Math.min(Math.max(b.y, 0), innerHeight - 40);
        return b;
    }

    /* ⛔⛔ CLAMP SERVES TWO MASTERS AND ONLY ONE OF THEM CHOSE IT.
       `clamp` bounds the LEFT edge -- `min(max(x, EDGE-w+120), innerWidth-EDGE-40)` --
       which is RIGHT when a player drags a window part-way off the screen: they meant
       to, and the sliver left behind is enough to drag it back.

       It is WRONG when the VIEWPORT SHRINKS, because the player did not choose that.
       Reported by the first playtest and reproduced exactly: 1920 -> 1280 with the City
       window at x=1084 left it at right=1908, with 628 of its 824px unreachable. The
       resize event fired (counted), the handler ran, and `clamp` faithfully decided the
       window was fine -- because by its own rule it was.
       ⚠ The first theory was a 120ms debounce and it was WRONG; the box does not settle.
       ▶ A reflow pulls the WHOLE window back into view. Dragging is untouched. */
    function clampVisible(box, key) {
        const b = clamp(box, key);
        b.x = Math.max(EDGE, Math.min(b.x, innerWidth  - EDGE - b.w));
        b.y = Math.max(0,    Math.min(b.y, Math.max(0, innerHeight - EDGE - b.h)));
        return b;
    }

    /* ── PERSISTENCE ────────────────────────────────────────────────────────
       ⚠ An OPTIONAL key read with a default — the `_sporeAutoFeed` pattern — so
       there is NO `SAVE_VERSION` bump and every existing save opens windows at
       their computed defaults. */
    function saved(key) {
        try {
            const w = state && state._windows && state._windows[key];
            if (w && isFinite(w.x) && isFinite(w.y) && isFinite(w.w) && isFinite(w.h)) return w;
        } catch (e) {}
        return null;
    }
    function store(key, box) {
        try {
            if (!state) return;
            if (!state._windows) state._windows = {};
            state._windows[key] = { x: Math.round(box.x), y: Math.round(box.y),
                                    w: Math.round(box.w), h: Math.round(box.h), moved: 1 };
        } catch (e) {}
    }

    function applyBox(ov, box) {
        /* ⛔ !important — five panels carry an INLINE max-width in index.html and
           an inline style beats a normal rule. Without this the window resizes
           and the inner box refuses to follow, which reads as a broken drag. */
        ov.style.setProperty('left',   box.x + 'px', 'important');
        ov.style.setProperty('top',    box.y + 'px', 'important');
        ov.style.setProperty('width',  box.w + 'px', 'important');
        ov.style.setProperty('height', box.h + 'px', 'important');
    }
    function boxOf(ov) {
        const b = ov.getBoundingClientRect();
        return { x: b.left, y: b.top, w: b.width, h: b.height };
    }

    /* ── Z-ORDER ────────────────────────────────────────────────────────────
       Renumbers the whole band; see the header note on why this is not ++_z. */
    /* ⭐ WHICH WINDOWS ARE OPEN is saved too now (PLAYTEST_REVIEW §7: "all open panels should
       restore to their previous open/closed state, size, and position"). Size and position were
       already in state._windows; the open set was not, so a reload came back with none. Back to
       front, so the one on top reopens on top. ⚠ NOT while the pause menu is up: it closes every
       window to show itself and puts them back after, and a save made from inside it must not
       record "nothing open". An optional key read with a default — no SAVE_VERSION bump. */
    function recordOpen() {
        try {
            if (typeof state === 'undefined' || !state) return;
            if (window.PauseMenu && PauseMenu.isOpen && PauseMenu.isOpen()) return;
            state._openWin = _order.slice();
        } catch (e) {}
    }
    function raise(key) {
        _order = _order.filter(k => k !== key);
        _order.push(key);
        recordOpen();
        const start = Math.max(Z_BASE, Z_CEIL - _order.length + 1);
        const top = _order.length - 1;
        _order.forEach((k, i) => {
            const el = elOf(k);
            if (!el) return;
            el.style.setProperty('z-index', String(Math.min(Z_CEIL, start + i)), 'important');
            /* the focused window reads as focused. ⚠ Set from the SAME loop that
               assigns z, so the class and the stacking can never disagree -- two
               places deciding which window is in front is how they drift. */
            el.classList.toggle('win-front', i === top);
        });
    }
    function forget(key) {
        _order = _order.filter(k => k !== key);
        recordOpen();
        const el = elOf(key);
        if (el) { el.style.removeProperty('z-index'); el.classList.remove('win-front'); }
        /* whatever is left on top takes focus, or the player closes the front
           window and nothing looks focused afterwards */
        if (_order.length) raise(_order[_order.length - 1]);
    }
    function focused() { return _order.length ? _order[_order.length - 1] : null; }
    function isOpen(key) { return _order.indexOf(key) >= 0; }

    /* ── CHROME: a drag handle and a close button, injected once ────────────
       ⭐ DERIVED, NOT HAND-ADDED. None of the thirteen panels has a close button
       in its markup — they are closed from the nav bar — so adding one to
       thirteen blocks by hand is thirteen places to drift. The header already
       exists on every panel and is already a flex row with the title in it. */
    function installChrome(ov) {
        if (_bound.has(ov)) return;
        _bound.add(ov);
        const key = keyOf(ov);
        /* ⚠ FIRST header only: `exchange` and `city` each contain a second
           `.panel-overlay-header` for a nested sub-panel. */
        const head = ov.querySelector('.panel-overlay-header');

        if (head && !head.querySelector('.win-close')) {
            const btn = document.createElement('button');
            btn.className = 'win-close';
            btn.type = 'button';
            btn.setAttribute('aria-label', 'Close this window');
            btn.textContent = '✕';
            btn.addEventListener('pointerdown', e => e.stopPropagation());
            btn.addEventListener('click', e => {
                e.stopPropagation();
                try { if (window.PanelNav) PanelNav.close(key); } catch (err) {}
            });
            /* ⛔⛔ INTO THE HEADER'S ACTION ROW WHEN THERE IS ONE, NOT ONTO THE HEADER.
               The header is `align-items: center` and, on `win-mid`, `flex-wrap: wrap`.
               Appending the close button straight to it makes it the LAST flex item, so
               on any panel whose header runs to several rows it lands on the last one:
               measured 2026-09-20 in the shop at **194px below the window's top edge**,
               floating mid-panel between the buy-quantity row and the legend, reading as
               a stray control rather than window chrome.
               ⚠ Flex alignment cannot fix that — `align-self: flex-start` was tried and
               moved it ZERO pixels, because the button is already at the top of its own
               flex line; the LINE is the problem. The fix is to stop making it a line of
               its own, which is what `.panel-header-actions` is for and where the markup
               already puts each panel's own buttons.
               ⚠ Scoped to the first header's OWN action row (`head.querySelector`), never
               a document-wide one — `exchange` and `city` each carry a second header for a
               nested sub-panel, which is why `head` is resolved that way above. */
            /* ⭐⭐ AND NOW NOT IN THE HEADER AT ALL (PLAYTEST_REVIEW §10: "sometimes centered,
               sometimes top-right — standardize to always top-right"). Inside the header it lived
               in the SCROLLING box: a scrollbar pushed it 11px in (Reality, Sim Slots: 30px from the
               edge against 19px everywhere else), and scrolling a long panel took it off screen with
               the title. It is a child of the WINDOW now, pinned to its corner in game.css, first in
               the DOM so it is also first in the tab order. The header keeps room for it. */
            ov.insertBefore(btn, ov.firstChild);
        }
        /* the grip goes on the WINDOW, not on the inner box.
           .panel-overlay-inner is `overflow-y: auto`, so an absolutely positioned
           grip inside it scrolls away with the content and is unreachable on any
           panel long enough to scroll -- which is all the interesting ones. */
        /* ⭐ FOUR CORNERS, ALIKE (PLAYTEST_REVIEW §7, 2026-09-23): "should be resizable from all
           four corners, with no single corner visually distinct from the others", and "the grip is
           hard to grab". One south-east grip at 20px became four identical corner grips with a 22px
           hit area (30px on touch). ⚠ South-east is appended FIRST: it is the one a player reaches
           for by habit and the one qa_win_gestures takes with querySelector('.win-grip'). */
        if (!ov.querySelector(':scope > .win-grip')) {
            ['se', 'sw', 'ne', 'nw'].forEach(dir => {
                const g = document.createElement('div');
                g.className = 'win-grip win-grip--' + dir;
                g.dataset.dir = dir;
                g.setAttribute('aria-hidden', 'true');
                ov.appendChild(g);
                bindResize(ov, g, dir);
            });
        }
        if (head && !head._winMax) {
            head._winMax = true;
            /* the standard gesture, and deliberately only on the title bar --
               double-clicking inside a shop list must not resize the shop */
            head.addEventListener('dblclick', ev => {
                if (!on()) return;
                if (ev.target.closest('button, a, input, select, textarea')) return;
                toggleMax(keyOf(ov));
            });
        }
        if (head) bindDrag(ov, head);
        /* clicking anywhere in the window raises it */
        ov.addEventListener('pointerdown', () => { if (on()) raise(keyOf(ov)); }, true);

        /* ⛔⛔ OBSERVE THE BOX, DO NOT CALL FROM EACH PLACE THAT CHANGES IT.
           Geometry moves on open, on a drag-resize and on a viewport resize, and
           a fourth caller will be added eventually. An observer on the window
           catches every one of them and cannot fall out of step with a new one.
           ⚠ Debounced, because a drag emits a size on every pointermove and
           City.resizeCanvas() reallocates a supersampled buffer. */
        if (typeof ResizeObserver !== 'undefined' && !ov._winRO) {
            let _t = 0;
            ov._winRO = new ResizeObserver(() => {
                if (!on()) return;
                /* ⚠ the width class is applied SYNCHRONOUSLY, not on the debounce:
                   it is one class toggle, it costs nothing, and a layout class that
                   arrives 90ms after the box does is a visible reflow. */
                applyWidthClass(ov);
                const hook = ON_RESIZE[keyOf(ov)];
                if (!hook) return;
                clearTimeout(_t);
                _t = setTimeout(hook, 90);
            });
            ov._winRO.observe(ov);
        }
    }

    /* ⚠ Pointer events, not mouse: the Steam Deck is a touch device and the game
       already ships a gamepad cursor. `setPointerCapture` keeps the drag alive
       when the pointer leaves the header, which a plain mousemove listener on the
       element does not. */
    function bindDrag(ov, head) {
        if (head._winDrag) return;
        head._winDrag = true;
        head.classList.add('win-drag-handle');
        head.addEventListener('pointerdown', ev => {
            if (!on() || ev.button !== 0) return;
            /* never start a drag from a control inside the header */
            if (ev.target.closest('button, a, input, select, textarea, .nav-btn')) return;
            const key = keyOf(ov);
            raise(key);
            /* dragging a maximised window un-maximises it, the way every window
               manager does -- otherwise the drag appears to do nothing and the
               window snaps back to full size on the next open */
            /* ⭐ AND IT GETS ITS OWN SIZE BACK (PLAYTEST_REVIEW §11). A snapped or maximised window used to keep
               the snapped size while it was dragged — a half-screen slab following the pointer. Like an OS, it
               returns to the box it had before, with the point you grabbed kept under the pointer.
               ⚠ On the first REAL movement, not on the press: a click on a snapped window's title bar is how
               you bring it to the front, and that must not un-snap it. */
            let start = boxOf(ov);
            let px = ev.clientX, py = ev.clientY;
            let _unsnap = false, _movedOnce = false;
            try {
                const rec = state._windows && state._windows[key];
                _unsnap = !!(rec && (rec.snapped || rec.max) && rec.pre && rec.pre.w && rec.pre.h);
            } catch (e) {}
            ev.preventDefault();
            /* ⛔⛔ GUARDED, AND FIRST-CLASS NOTHING. This call sat unguarded ABOVE the
               listener registration, so when it threw -- which it does for any
               pointerId the element has not captured -- every line after it was
               skipped, including the listeners and preventDefault. The press was
               swallowed and the window never moved. Owner: "I can't seem to resize
               the windows." Capture is an optimisation; it must never be able to
               take the drag down with it. */
            try { head.setPointerCapture(ev.pointerId); } catch (e) {}
            ov.classList.add('win-dragging');
            let _zone = null;
            const move = e => {
                if (_unsnap) {
                    if (Math.abs(e.clientX - px) + Math.abs(e.clientY - py) < 5) return;
                    _unsnap = false;
                    try {
                        const rec = state._windows[key];
                        const relX = start.w ? (px - start.x) / start.w : 0.5;
                        applyBox(ov, clamp({ x: e.clientX - relX * rec.pre.w, y: start.y + (e.clientY - py),
                                             w: rec.pre.w, h: rec.pre.h }, key));
                        rec.max = 0; rec.snapped = 0;
                    } catch (err) {}
                    start = boxOf(ov); px = e.clientX; py = e.clientY;
                    const hook = ON_RESIZE[key];
                    if (hook) setTimeout(hook, 60);
                }
                /* a window that has been moved is not maximised or snapped any more, whether or not it had
                   a box to go back to (the press used to clear `max`; the first movement does now) */
                if (!_movedOnce) {
                    _movedOnce = true;
                    try { const r = state._windows && state._windows[key]; if (r) { r.max = 0; r.snapped = 0; } } catch (err) {}
                }
                const b = clamp({ x: start.x + (e.clientX - px), y: start.y + (e.clientY - py),
                                  w: start.w, h: start.h }, key);
                applyBox(ov, b);
                /* the preview follows the POINTER, so the offer appears where the
                   hand is rather than where the window happens to have landed */
                _zone = snapZoneAt(e.clientX, e.clientY);
                snapPreview(_zone);
            };
            /* ⚠ ON WINDOW, NOT ON THE ELEMENT. With capture, pointermove is
               retargeted to the capturing element and element listeners appear to
               work. WITHOUT it they only fire while the pointer is still inside the
               handle -- and a drag leaves a title bar within a few pixels. Window
               listeners are correct in both cases. */
            const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
                ov.classList.remove('win-dragging');
                snapPreview(null);
                if (_zone) applySnap(key, _zone);
                /* ⛔ a release with no movement changed nothing — and store() REPLACES the record, so storing here
                   erased a snapped window's pre-snap size on every focus click (qa_win_snap_nav S2, 2026-09-25) */
                else if (_movedOnce) store(key, boxOf(ov));
                _zone = null;
                try { if (typeof Game !== 'undefined' && Game.save) Game.save(); } catch (e) {}
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        });
    }

    function bindResize(ov, grip, dir) {
        dir = dir || 'se';
        grip.addEventListener('pointerdown', ev => {
            if (!on() || ev.button !== 0) return;
            const key = keyOf(ov);
            raise(key);
            try { if (state._windows && state._windows[key]) { state._windows[key].max = 0; state._windows[key].snapped = 0; } } catch (e) {}
            const start = boxOf(ov);
            const px = ev.clientX, py = ev.clientY;
            ev.preventDefault();
            ev.stopPropagation();
            /* ⛔⛔ see the note on the drag handler: guarded, and the listeners go on
               window. A resize grip is 20px; the pointer leaves it on the first
               move, so element listeners without capture fire exactly once. */
            try { grip.setPointerCapture(ev.pointerId); } catch (e) {}
            ov.classList.add('win-resizing');
            const min = minOf(key);
            const move = e => {
                const dx = e.clientX - px, dy = e.clientY - py;
                const w = Math.max(min.w, start.w + (dir.indexOf('e') >= 0 ? dx : -dx));
                const h = Math.max(min.h, start.h + (dir.indexOf('s') >= 0 ? dy : -dy));
                /* a west or north grip moves the ORIGIN by exactly what the size changed, so
                   the opposite corner stays where it is — that is what makes it a corner */
                const x = dir.indexOf('w') >= 0 ? start.x + (start.w - w) : start.x;
                const y = dir.indexOf('n') >= 0 ? start.y + (start.h - h) : start.y;
                applyBox(ov, clamp({ x: x, y: y, w: w, h: h }, key));
            };
            const up = () => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
                ov.classList.remove('win-resizing');
                store(key, boxOf(ov));
                try { if (typeof Game !== 'undefined' && Game.save) Game.save(); } catch (e) {}
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            window.addEventListener('pointercancel', up);
        });
    }

    /* ── THE HOOKS PanelNav CALLS ───────────────────────────────────────────── */
    function onOpen(ov) {
        if (!on() || !ov) return;
        const key = keyOf(ov);
        /* ⚠ a reopen inside the close animation must keep its box -- otherwise the
           deferred strip lands on a window that is open again */
        clearTimeout(ov._winStrip);
        ov._winStrip = 0;
        installChrome(ov);
        const s = saved(key);
        /* ⚠ NEVER RE-PLACE A WINDOW THE PLAYER HAS POSITIONED BY HAND. A default
           that reasserts itself on every open is the single most irritating thing
           a window manager can do. `moved` is the flag; a stored box without it
           is a previous default and may be recomputed. */
        /* ⚠ A maximised window reopens maximised, and the box is recomputed from
           the CURRENT viewport rather than replayed from the saved one. */
        applyBox(ov, isMax(key) ? maxBox(key)
                   : (s && s.moved ? clamp(s, key) : defaultBox(key)));
        raise(key);
        /* ⚠ And once explicitly, after the box lands: a window reopened at
           exactly the size it closed at fires no ResizeObserver callback, and the
           canvas inside it may still be carrying the size it had in the OTHER
           mode. Cheap, idempotent, and it removes a whole class of "only wrong
           the first time" reports. */
        applyWidthClass(ov);
        const hook = ON_RESIZE[key];
        if (hook) setTimeout(hook, 60);
    }
    /* Hand the element back exactly as it was found. Exported because the
       classic-mode open path needs it to happen NOW rather than in 420ms. */
    function stripGeometry(ov) {
        if (!ov) return;
        clearTimeout(ov._winStrip);
        ov._winStrip = 0;
        ov.style.removeProperty('left');
        ov.style.removeProperty('top');
        ov.style.removeProperty('width');
        ov.style.removeProperty('height');
        ov.style.removeProperty('z-index');
        /* the width class describes a WINDOW; a closed panel is not one, and
           leaving it on would have classic mode laying out to a stale box */
        for (const [cls] of WIN_SIZES) ov.classList.remove(cls);
        ov.classList.remove('win-front');
    }

    function onClose(ov) {
        if (!ov) return;
        forget(keyOf(ov));
        /* ⛔⛔ HAND THE ELEMENT BACK THE WAY IT WAS FOUND. The geometry is written
           INLINE and with !important, and nothing else in the build would ever
           clear it -- so a window closed here and reopened with `os-windows` off
           came back as a 620x635 box floating where the window had been, instead
           of the full-screen modal overlay classic mode expects.
           ⚠ Caught by qa_windows §8, which exists precisely because a kill switch
           nobody exercises is not a kill switch. The mode toggle closes every
           panel before flipping the class, so this one path covers both. */
        /* ⛔⛔ DEFERRED PAST THE CLOSE ANIMATION. This used to strip the geometry
           synchronously -- and `_closePanel` then runs `overlayFadeOut` for 220ms,
           so for the whole fade the window had no left/top/width/height,
           `right:auto; bottom:auto` sized it to its own content, and the player
           watched it balloon on the way out. Owner: "momentarily it flashes to the
           full screen version before closing."
           ⚠ It cannot just be deleted: a window closed in OS mode and reopened in
           CLASSIC mode came back as a floating box instead of a full-screen
           overlay (qa_windows §8). Deferred, cancellable by a reopen, and
           available synchronously to the one caller that needs it now. */
        clearTimeout(ov._winStrip);
        ov._winStrip = setTimeout(() => stripGeometry(ov), 420);
    }

    /* ⚠ Re-run placement on resize, or a window parked to the right of the button
       on a 3440px screen sits on top of it at 1280×800 — the Steam Deck case,
       which is the one that will actually be hit. Windows the player has moved
       are only CLAMPED back into view, never re-placed. */
    let _rt = 0;
    function onViewportResize() {
        if (!on()) return;
        clearTimeout(_rt);
        _rt = setTimeout(() => {
            for (const key of _order.slice()) {
                const ov = elOf(key);
                if (!ov) continue;
                const s = saved(key);
                /* ⚠ clampVisible, NOT clamp: a viewport shrink must pull a window back
                   fully, where a drag may legitimately leave it hanging. */
                applyBox(ov, isMax(key) ? maxBox(key)
                           : clampVisible(s && s.moved ? s : defaultBox(key), key));
            }
        }, 120);
    }

    let _inited = false;
    function init() {
        if (_inited) return;      // called from two places on purpose -- see the self-init below
        _inited = true;
        addEventListener('resize', onViewportResize);
    }

    /* QA hooks — the same shape as `gamepad.js` `_injectTestPad`: a harness must
       be able to drive a drag without synthesising real pointer input. */
    function _qaSet(key, box) {
        const ov = elOf(key);
        if (!ov) return null;
        const b = clamp(box, key);
        applyBox(ov, b); store(key, b); return b;
    }
    function _qaBox(key) { const ov = elOf(key); return ov ? boxOf(ov) : null; }

    return { init, onOpen, onClose, raise, forget, focused, isOpen, enabled: on,
             toggleMax, isMax, maxBox, snapZoneAt, applySnap, snapArea,
             applyWidthClass, stripGeometry,
             defaultBox, clamp, noGo, freeColumns, minOf, keyOf, elOf,
             _qaSet, _qaBox, _order: () => _order.slice() };
})();
window.WindowManager = WindowManager;
/* ⛔⛔ SELF-INIT, BECAUSE THE ONLY OTHER CALLER CANNOT SEE THIS FILE YET.
   `Settings.load()` runs `if (window.WindowManager) WindowManager.init();` -- but it is
   called from game.js TOP-LEVEL code ("Start -- boot order matters"), and game.js is
   script #15 while this file is #22. So at that moment `window.WindowManager` does not
   exist, the guard is false, and the resize listener was NEVER REGISTERED -- for the whole
   life of OS-windows mode.
   ⭐⭐ And it failed in the most misleading way available: the lines immediately ABOVE the
   guard add the `os-windows` class, so the mode looked switched on while its viewport
   handling was dead. Found by the first playtest -- a window left hanging 628px off the
   right edge after a resize -- and proved by calling init() by hand, which moved it back
   to x=447 with 0px off-screen.
   ⚠ Registering here is safe at any time: `onViewportResize` early-returns while
   os-windows is off, and `init` is idempotent, so the Settings.load() call still works
   for anyone who turns the mode on later.
   ▶ This is "a guarded call is not proof the method exists" crossed with script order,
   and the guard cannot be fixed where it is -- only the file that defines the thing can
   know it exists. */
WindowManager.init();
