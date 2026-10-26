/* ===========================================
   Ink — เขียน/วาดบนสไลด์ (พิกัดเวที 1920×1080 จึงตรงกันทุกจอ)
   - Ink.layer(stage, opts) → ชั้นวาด 1 ชั้น { setStrokes, strokes, clear, enable(tool), disable, onChange }
     stroke = { c: สี, w: ความหนา, o: ความทึบ, p: [[x,y], …] }
   - Ink.svg(strokes, opts) → สตริง SVG สำหรับภาพย่อ (แกลเลอรีภาพวาดนักเรียน)
   - Ink.palette(layer, opts) → แถบเครื่องมือ ปากกา 3 สี ปากกาเน้น ยางลบ ล้าง ไวท์บอร์ด
   =========================================== */
(function (g) {
    'use strict';
    const W = 1920, H = 1080, NS = 'http://www.w3.org/2000/svg';

    function pathD(p) {
        if (!p.length) return '';
        if (p.length === 1) return `M${p[0][0]},${p[0][1]}l0.1,0`;
        let d = `M${p[0][0]},${p[0][1]}`;
        for (let i = 1; i < p.length - 1; i++) {
            const mx = (p[i][0] + p[i + 1][0]) / 2, my = (p[i][1] + p[i + 1][1]) / 2;
            d += `Q${p[i][0]},${p[i][1]} ${mx},${my}`;
        }
        const l = p[p.length - 1];
        return d + `L${l[0]},${l[1]}`;
    }
    const strokeSvg = s => `<path d="${pathD(s.p)}" fill="none" stroke="${s.c}" stroke-width="${s.w}" stroke-opacity="${s.o || 1}" stroke-linecap="round" stroke-linejoin="round"/>`;

    function svg(strokes, opts) {
        opts = opts || {};
        const bg = opts.board ? `<rect width="${W}" height="${H}" fill="#fff"/>` : (opts.bg ? `<rect width="${W}" height="${H}" fill="${opts.bg}"/>` : '');
        return `<svg xmlns="${NS}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${bg}${(strokes || []).map(strokeSvg).join('')}</svg>`;
    }

    function layer(stage, opts) {
        opts = opts || {};
        const el = document.createElementNS(NS, 'svg');
        el.setAttribute('viewBox', `0 0 ${W} ${H}`);
        el.setAttribute('class', 'ink-layer' + (opts.cls ? ' ' + opts.cls : ''));
        el.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;z-index:${opts.z || 60};pointer-events:none;touch-action:none`;
        stage.appendChild(el);

        let strokes = [], board = false, tool = null, cur = null;
        const listeners = [];
        const changed = () => listeners.forEach(fn => fn(strokes, board));

        function draw() {
            el.innerHTML = (board ? `<rect width="${W}" height="${H}" fill="#fff"/>` : '') + strokes.map(strokeSvg).join('') + (cur ? strokeSvg(cur) : '');
        }
        function pt(e) {
            const r = el.getBoundingClientRect();
            return [Math.round((e.clientX - r.left) / r.width * W), Math.round((e.clientY - r.top) / r.height * H)];
        }
        function erase(p) {
            const n = strokes.length;
            strokes = strokes.filter(s => !s.p.some(q => Math.abs(q[0] - p[0]) < 26 && Math.abs(q[1] - p[1]) < 26));
            if (strokes.length !== n) draw();
        }

        el.addEventListener('pointerdown', e => {
            if (!tool) return;
            e.preventDefault(); e.stopPropagation();
            el.setPointerCapture(e.pointerId);
            const p = pt(e);
            if (tool.eraser) { cur = { erasing: true, p: [] }; erase(p); return; }
            cur = { c: tool.c, w: tool.w, o: tool.o || 1, p: [p] };
            draw();
        });
        el.addEventListener('pointermove', e => {
            if (!tool || !cur) return;
            e.preventDefault();
            const p = pt(e);
            if (cur.erasing) { erase(p); return; }
            const l = cur.p[cur.p.length - 1];
            if (Math.abs(l[0] - p[0]) + Math.abs(l[1] - p[1]) >= 3) { cur.p.push(p); draw(); }
        });
        const end = e => {
            if (!cur) return;
            if (e) e.stopPropagation();
            if (!cur.erasing) strokes.push(cur);
            cur = null; draw(); changed();
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        /* ไม่ให้การปัด/คลิกบนชั้นวาดไปเลื่อนสไลด์ */
        ['touchstart', 'touchend', 'click', 'wheel'].forEach(ev => el.addEventListener(ev, e => { if (tool) e.stopPropagation(); }, { passive: true }));

        return {
            el,
            strokes: () => strokes.slice(),
            board: () => board,
            setStrokes(s, b) { strokes = (s || []).slice(); board = !!b; draw(); },
            clear() { strokes = []; board = false; draw(); changed(); },
            undo() { strokes.pop(); draw(); changed(); },
            setBoard(b) { board = !!b; draw(); changed(); },
            enable(t) { tool = t; el.style.pointerEvents = 'auto'; el.style.cursor = t.eraser ? 'cell' : 'crosshair'; },
            disable() { tool = null; cur = null; el.style.pointerEvents = 'none'; el.style.cursor = ''; },
            active: () => !!tool,
            show(on) { el.style.display = on ? '' : 'none'; },
            onChange(fn) { listeners.push(fn); },
            remove() { el.remove(); }
        };
    }

    const TOOLS = [
        { k: 'red', label: 'ปากกาแดง', c: '#d6455d', w: 6 },
        { k: 'blue', label: 'ปากกาน้ำเงิน', c: '#3b6fd4', w: 6 },
        { k: 'black', label: 'ปากกาดำ', c: '#2a2733', w: 6 },
        { k: 'hl', label: 'ปากกาเน้น', c: '#f7b733', w: 34, o: 0.4 },
        { k: 'eraser', label: 'ยางลบ', eraser: true }
    ];

    /* แถบเครื่องมือ: opts.board = มีปุ่มไวท์บอร์ด · opts.extra = HTML ปุ่มเพิ่ม · opts.onClose */
    function palette(lay, opts) {
        opts = opts || {};
        const bar = document.createElement('div');
        bar.className = 'ink-bar' + (opts.cls ? ' ' + opts.cls : '');
        bar.innerHTML = TOOLS.map(t => `<button type="button" data-t="${t.k}" title="${t.label}" aria-label="${t.label}">${t.eraser ? '🧽' : `<i style="background:${t.c};${t.o ? 'opacity:.6;' : ''}"></i>`}</button>`).join('') +
            '<button type="button" data-a="undo" title="ย้อนกลับ">↶</button><button type="button" data-a="clear" title="ล้างทั้งหมด">🗑</button>' +
            (opts.board ? '<button type="button" data-a="board" title="ไวท์บอร์ด">⬜</button>' : '') +
            (opts.extra || '') +
            '<button type="button" data-a="close" title="ปิดปากกา">✕</button>';
        ['keydown', 'click', 'touchstart', 'touchend', 'wheel'].forEach(ev => bar.addEventListener(ev, e => e.stopPropagation(), { passive: ev !== 'click' && ev !== 'keydown' }));
        const pick = k => {
            const t = TOOLS.find(x => x.k === k);
            bar.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === k));
            lay.enable(t);
        };
        bar.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            if (b.dataset.t) pick(b.dataset.t);
            else if (b.dataset.a === 'undo') lay.undo();
            else if (b.dataset.a === 'clear') lay.clear();
            else if (b.dataset.a === 'board') { lay.setBoard(!lay.board()); b.classList.toggle('on', lay.board()); }
            else if (b.dataset.a === 'close') { lay.disable(); bar.remove(); if (opts.onClose) opts.onClose(); }
            if (opts.onButton) opts.onButton(b);
        });
        document.body.appendChild(bar);
        pick(opts.start || 'red');
        return bar;
    }

    g.Ink = { W, H, layer, svg, palette, pathD };
})(window);
