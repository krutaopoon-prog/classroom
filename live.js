/* ===========================================
   Live — สไลด์โต้ตอบได้ (โหลดผ่าน classroom-loader.js data-parts="identity,ink,live")
   โหมด
   - ครู (ล็อกอินแล้ว): แถบ 🔴 เริ่มห้องสด · รหัส · 🔒 · ➕ ถามด่วน · ⭐ · 🏆 · 🎲 · ✏️ · ⏹
   - สด (นักเรียน ?live=รหัส): เลื่อนหน้าตามครู ตอบกิจกรรมบนสไลด์ ผลขึ้นจอครู
   - ทบทวนเอง (นักเรียนยืนยันตัวแล้ว): ตอบแล้วบันทึก เฉลยหลังตอบ บันทึกความคืบหน้า
   - ทั่วไป (ยังไม่ยืนยันตัว): สไลด์เหมือนเดิม ตอบกิจกรรมใหม่ได้เมื่อยืนยันตัว
   กิจกรรม
   - .vote (เดิม) = ก ข ค ง · เฉลยจาก data-answer
   - <div class="live" data-kind="number|short|wordcloud|tf|draw|image" data-q="คำถาม"
          data-answer="4.0" data-tol="0.1" data-unit="mA" data-accept="คำ1|คำ2"></div>
     tf: data-answer="ถูก" หรือ "ผิด"
   ref ของกิจกรรม = วิชา/สัปดาห์/<id หรือ data-title ของสไลด์>#<ลำดับในสไลด์>
   =========================================== */
(function () {
    'use strict';
    const C = window.Classroom;
    if (!C || !C.ready) return;
    const esc = C.esc, sb = C.sb;

    const params = new URLSearchParams(location.search);
    const LIVE_CODE = (params.get('live') || '').replace(/\D/g, '') || null;
    const STAGE = document.getElementById('deckStage');
    if (!STAGE) return;
    const COURSE = STAGE.dataset.course || C.course || location.pathname.split('/').filter(Boolean)[0] || 'course';
    const LESSON = C.lessonOf() || 'lesson';
    const PAGE = location.origin + location.pathname;
    const TH = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ'];

    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = C.base + 'live.css';
    document.head.appendChild(link);

    function whenDeck(fn) { if (window.deck && window.deck.slides) fn(window.deck); else setTimeout(() => whenDeck(fn), 60); }

    /* ---------- ห่อการเลื่อนสไลด์: ส่งเหตุการณ์ และล็อกได้ ---------- */
    const nav = { lock: () => false, blocked: () => {}, listeners: [], remote: false };
    function patchDeck(deck) {
        let busy = false;
        ['next', 'prev', 'show'].forEach(name => {
            const f = deck[name].bind(deck);
            deck[name] = function () {
                if (busy) return f.apply(null, arguments);
                if (!nav.remote && nav.lock()) { nav.blocked(); return; }
                busy = true;
                try { f.apply(null, arguments); } finally { busy = false; }
                firePos(deck);
            };
        });
    }
    const posOf = deck => ({ slide: deck.current, step: deck.frags(deck.current).filter(f => f.classList.contains('shown')).length });
    function firePos(deck) { const p = posOf(deck); nav.listeners.forEach(fn => fn(p)); }
    function gotoPos(deck, slide, step) {
        nav.remote = true;
        try {
            if (deck.current !== slide) deck.show(slide);
            deck.frags(deck.current).forEach((f, i) => f.classList.toggle('shown', i < step));
        } finally { nav.remote = false; }
    }

    /* ---------- กิจกรรมบนสไลด์ ---------- */
    let ITEMS = [];
    const byRef = {};
    function scanItems(deck) {
        ITEMS = [];
        deck.slides.forEach((s, i) => {
            const key = (s.id || (s.dataset.title || '').trim() || ('slide-' + (i + 1))).slice(0, 120);
            const h = (s.querySelector('h2, h1') || {}).textContent || s.dataset.title || '';
            s.querySelectorAll('.vote, .live').forEach((el, k) => {
                const it = { ref: `${COURSE}/${LESSON}/${key}#${k}`, el, slide: i, prompt: h.replace(/\s+/g, ' ').trim().slice(0, 300) };
                if (el.classList.contains('vote')) {
                    it.kind = 'mcq';
                    it.options = Array.from(el.querySelectorAll('.opt')).map(o => o.textContent.replace(/\s+/g, ' ').trim());
                    it.key = el.dataset.answer != null ? { v: String(el.dataset.answer) } : null;
                } else {
                    it.kind = el.dataset.kind || 'short';
                    it.prompt = el.dataset.q ? el.dataset.q.replace(/<[^>]+>/g, '') : it.prompt;
                    it.options = it.kind === 'tf' ? ['ถูก', 'ผิด'] : null;
                    const a = el.dataset.answer;
                    if (it.kind === 'tf' && a) it.key = { v: a === 'ผิด' || a === '1' || a === 'false' ? '1' : '0' };
                    else if (it.kind === 'number' && a != null && a !== '') it.key = { v: Number(a), tol: el.dataset.tol != null ? Number(el.dataset.tol) : undefined };
                    else if (it.kind === 'short' && el.dataset.accept) it.key = { accept: el.dataset.accept.split('|').map(x => x.trim()).filter(Boolean) };
                    else it.key = null;
                }
                el.dataset.ref = it.ref;
                ITEMS.push(it); byRef[it.ref] = it;
            });
        });
    }
    const itemsOn = slide => ITEMS.filter(i => i.slide === slide);

    /* ---------- วิดเจ็ตตอบของนักเรียน (.live) ---------- */
    function studentWidget(it, submit) {
        const el = it.el;
        el.classList.add('lv-w', 'lv-k-' + it.kind);
        const unit = esc(el.dataset.unit || '');
        let html = '';
        if (it.kind === 'tf') html = `<div class="lv-tf"><button type="button" class="lv-opt" data-v="0">✔️ ถูก</button><button type="button" class="lv-opt" data-v="1">❌ ผิด</button></div>`;
        else if (it.kind === 'number') html = `<div class="lv-in"><input type="text" inputmode="decimal" placeholder="ตอบเป็นตัวเลข" aria-label="คำตอบ">${unit ? `<span class="lv-unit">${unit}</span>` : ''}<button type="button" class="lv-send">ส่ง</button></div>`;
        else if (it.kind === 'short' || it.kind === 'wordcloud') html = `<div class="lv-in"><input type="text" maxlength="${it.kind === 'wordcloud' ? 30 : 120}" placeholder="${it.kind === 'wordcloud' ? 'พิมพ์คำสั้น ๆ' : 'พิมพ์คำตอบ'}" aria-label="คำตอบ"><button type="button" class="lv-send">ส่ง</button></div>`;
        else if (it.kind === 'draw') html = `<div class="lv-in"><button type="button" class="lv-send lv-draw">✏️ วาดคำตอบบนสไลด์นี้</button></div>`;
        else if (it.kind === 'image') html = `<div class="lv-in"><label class="lv-send lv-file">📷 ถ่าย/เลือกรูป<input type="file" accept="image/*" capture="environment" hidden></label></div>`;
        el.innerHTML = `<div class="lv-stu">${html}<div class="lv-msg" aria-live="polite"></div></div><div class="lv-res"></div>`;
        const msg = t => { el.querySelector('.lv-msg').innerHTML = t; };
        const inp = el.querySelector('input[type=text]');
        el.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter' && inp) send(); });
        el.addEventListener('click', e => {
            const b = e.target.closest('button'); if (!b) return;
            e.stopPropagation();
            if (b.dataset.v != null) { el.querySelectorAll('.lv-opt').forEach(x => x.classList.toggle('picked', x === b)); submit(it, { v: b.dataset.v }, msg); }
            else if (b.classList.contains('lv-draw')) drawAnswer(it, msg, submit);
            else if (b.classList.contains('lv-send')) send();
        });
        const file = el.querySelector('input[type=file]');
        if (file) file.addEventListener('change', () => { if (file.files[0]) imageAnswer(it, file.files[0], msg, submit); file.value = ''; });
        function send() {
            if (!inp) return;
            let v = inp.value.trim();
            if (!v) { msg('พิมพ์คำตอบก่อนกดส่ง'); return; }
            if (it.kind === 'number') {
                const n = Number(v.replace(/,/g, ''));
                if (!isFinite(n)) { msg('ตอบเป็นตัวเลข เช่น 4.0'); return; }
                v = n;
            }
            submit(it, { v }, msg);
        }
        return { msg };
    }

    /* วาดคำตอบบนสไลด์: เปิดชั้นวาดเต็มสไลด์ + แถบ ส่ง/ยกเลิก */
    let drawing = null;
    function drawAnswer(it, msg, submit) {
        if (drawing) return;
        const lay = Ink.layer(STAGE, { z: 70, cls: 'ink-answer' });
        STAGE.classList.add('lv-drawing');
        const close = () => { lay.remove(); STAGE.classList.remove('lv-drawing'); drawing = null; };
        const bar = Ink.palette(lay, {
            cls: 'ink-bar-answer', start: 'blue',
            extra: '<button type="button" data-a="send" class="ink-send">📤 ส่งภาพวาด</button>',
            onClose: close,
            onButton: b => {
                if (b.dataset.a !== 'send') return;
                const st = lay.strokes();
                if (!st.length) { C.toast('ยังไม่ได้วาด', 'bad'); return; }
                submit(it, { strokes: st }, msg);
                bar.remove(); close();
            }
        });
        drawing = { lay, bar };
        C.toast('วาดบนสไลด์ได้เลย แล้วกด 📤 ส่งภาพวาด');
    }

    /* ส่งรูป: ย่อเป็น JPEG ด้านยาวไม่เกิน 1280 px แล้วอัปโหลด */
    async function imageAnswer(it, file, msg, submit) {
        msg('กำลังย่อรูป…');
        try {
            const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
            const f = Math.min(1, 1280 / Math.max(img.width, img.height));
            const cv = document.createElement('canvas');
            cv.width = Math.round(img.width * f); cv.height = Math.round(img.height * f);
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.78));
            const path = `${LIVE_CODE || 'self'}/${it.ref.replace(/[^\w-]+/g, '_').slice(-80)}/${String(C.token()).slice(0, 8)}-${Date.now()}.jpg`;
            msg('กำลังอัปโหลด…');
            const { error } = await sb().storage.from('live-uploads').upload(path, blob, { contentType: 'image/jpeg' });
            if (error) throw error;
            submit(it, { path }, msg);
        } catch (e) { msg('อัปโหลดไม่สำเร็จ ลองใหม่'); }
    }

    /* ---------- ผลบนจอครู ---------- */
    function rosterName(st) { return st ? `${st.no}. ${String(st.name).replace(/^(นางสาว|นาย|นาง|เด็กชาย|เด็กหญิง)\s*/, '').split(/\s+/)[0]}` : '?'; }

    function renderResults(it, rows, ctx) {
        /* rows = [{student_id, answer, correct, hidden}] · ctx = {roster, total, showNames, status, onStar, onHide, onShowDraw, signed} */
        const n = rows.length;
        const head = `<div class="lv-head"><span class="lv-count">📲 ตอบแล้ว <b>${n}</b>${ctx.total ? '/' + ctx.total : ''}</span>
            <span class="lv-st lv-st-${ctx.status || 'none'}">${({ open: '🟢 เปิดรับ', closed: '⏸ ปิดรับ', revealed: '✅ เฉลยแล้ว' })[ctx.status] || '⚪ ยังไม่เปิด'}</span>
            <button type="button" class="lv-mini" data-a="toggle">${ctx.status === 'open' ? 'ปิดรับ' : 'เปิดรับ'}</button>
            ${!(it.kind === 'mcq' && it.el && it.el.classList.contains('vote')) ? '<button type="button" class="lv-mini" data-a="reveal">เฉลย</button>' : ''}</div>`;
        const vis = rows.filter(r => !r.hidden);
        const nm = r => ctx.showNames ? `<span class="lv-nm">${esc(rosterName(ctx.roster[r.student_id]))}</span>` : '';
        const tools = r => `<span class="lv-tools"><button type="button" data-star="${r.student_id}" title="ให้ดาว">⭐</button><button type="button" data-hide="${r.student_id}" title="ซ่อนคำตอบ">🙈</button></span>`;
        let body = '';
        if (it.kind === 'mcq' && it.el && it.el.classList.contains('vote')) {
            body = '';    /* โหวตบนสไลด์: จำนวนแสดงที่ปุ่มตัวเลือกแล้ว */
        } else if (it.kind === 'mcq' || it.kind === 'tf') {
            const opts = it.options || [];
            const cnt = opts.map((_, i) => rows.filter(r => String(r.answer.v) === String(i)).length);
            const max = Math.max(1, ...cnt);
            body = `<div class="lv-bars">${opts.map((o, i) => `<div class="lv-row${it.key && ctx.status === 'revealed' && String(it.key.v) === String(i) ? ' right' : ''}">
                <span class="lv-bl">${it.kind === 'tf' ? esc(o) : TH[i]}</span><span class="lv-bt"><i style="width:${cnt[i] / max * 100}%"></i></span><b>${cnt[i]}</b></div>`).join('')}</div>`;
        } else if (it.kind === 'number') {
            const ok = rows.filter(r => r.correct === true).length;
            body = `<div class="lv-sum">${it.key ? `ถูก <b>${ok}</b> คน (${n ? Math.round(ok / n * 100) : 0}%)` : ''}${ctx.status === 'revealed' && it.key ? ` · เฉลย <b>${esc(it.key.v)}</b> ${esc(it.el.dataset.unit || '')}` : ''}</div>
                <div class="lv-chips">${vis.map(r => `<span class="lv-chip ${r.correct === true ? 'ok' : r.correct === false ? 'bad' : ''}">${nm(r)}${esc(r.answer.v)}${tools(r)}</span>`).join('')}</div>`;
        } else if (it.kind === 'wordcloud') {
            const tally = {};
            vis.forEach(r => { const w = String(r.answer.v || '').trim().toLowerCase(); if (w) tally[w] = (tally[w] || 0) + 1; });
            const words = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 40);
            const max = Math.max(1, ...words.map(w => w[1]));
            const col = ['#e8742c', '#3b6fd4', '#00878f', '#d6455d', '#2e9b57', '#8a5cd0'];
            body = `<div class="lv-cloud">${words.map(([w, c], i) => `<span style="font-size:${30 + c / max * 60}px;color:${col[i % col.length]}">${esc(w)}</span>`).join(' ')}</div>`;
        } else if (it.kind === 'short') {
            body = `<div class="lv-cards">${vis.map(r => `<div class="lv-card ${r.correct === true ? 'ok' : ''}">${nm(r)}<div>${esc(r.answer.v)}</div>${tools(r)}</div>`).join('')}</div>`;
        } else if (it.kind === 'draw') {
            body = `<div class="lv-gal">${vis.map(r => `<div class="lv-th" data-draw="${r.student_id}">${Ink.svg(r.answer.strokes, { bg: 'rgba(255,255,255,.85)' })}${nm(r)}${tools(r)}</div>`).join('')}</div>`;
        } else if (it.kind === 'image') {
            body = `<div class="lv-gal">${vis.map(r => `<div class="lv-th img">${ctx.signed[r.answer.path] ? `<img src="${esc(ctx.signed[r.answer.path])}" alt="">` : '…'}${nm(r)}${tools(r)}</div>`).join('')}</div>`;
        }
        return head + body;
    }

    /* ===========================================
       โหมดครู
       =========================================== */
    async function teacherMode(deck) {
        document.body.classList.add('lv-teacher');
        let session = null, roster = {}, rosterList = [], members = new Set(), online = [];
        let states = {}, answers = {}, signed = {}, showNames = false, ch = null, ansCh = null, quick = null;
        const inkBySlide = {};

        /* ลงทะเบียนกิจกรรมและเฉลย (ให้โหมดทบทวนเองตรวจได้ด้วย) */
        try {
            if (ITEMS.length) {
                await sb().from('items').upsert(ITEMS.map(i => ({ ref: i.ref, course: COURSE, lesson: LESSON, kind: i.kind, prompt: i.prompt, options: i.options, updated_at: new Date().toISOString() })));
                const keys = ITEMS.filter(i => i.key).map(i => ({ ref: i.ref, correct: i.key }));
                if (keys.length) await sb().from('item_keys').upsert(keys);
            }
        } catch (e) { console.warn('register items', e); }

        /* กิจกรรมแบบใหม่: ก่อนเริ่มคาบแสดงป้ายบอกชนิด (ผลจะขึ้นแทนเมื่อเริ่มห้องสด) */
        const KIND = { tf: 'ถูก/ผิด', number: 'ตอบตัวเลข', short: 'ตอบสั้น', wordcloud: 'Word cloud', draw: 'วาดบนสไลด์', image: 'ส่งรูป' };
        ITEMS.filter(i => i.kind !== 'mcq').forEach(i => {
            i.el.classList.add('lv-w', 'lv-k-' + i.kind);
            i.el.innerHTML = `<div class="lv-res"><div class="lv-head"><span class="lv-count">📲 นักเรียนตอบบนเครื่อง: ${KIND[i.kind] || i.kind}</span><span class="lv-st">เริ่มห้องสดเพื่อดูผล</span></div></div>`;
        });

        /* แถบเครื่องมือครู */
        const bar = document.createElement('div');
        bar.className = 'lv-bar';
        ['keydown', 'click', 'touchstart', 'touchend', 'wheel'].forEach(ev => bar.addEventListener(ev, e => e.stopPropagation(), { passive: ev !== 'click' && ev !== 'keydown' }));
        document.body.appendChild(bar);
        function drawBar() {
            bar.innerHTML = session
                ? `<button type="button" data-a="code" class="lv-code" title="แสดงรหัสและรายชื่อ">🔴 ${esc(session.code)} · 👥 ${members.size}/${rosterList.length}</button>
                   <button type="button" data-a="lock" title="${session.unlocked ? 'นักเรียนดูเองได้' : 'นักเรียนเลื่อนตามครู'}">${session.unlocked ? '🔓' : '🔒'}</button>
                   <button type="button" data-a="quick" title="ถามด่วน">➕</button>
                   <button type="button" data-a="names" title="แสดง/ซ่อนชื่อในคำตอบ">${showNames ? '🙂' : '🫥'}</button>
                   <button type="button" data-a="starall" title="ให้ดาวทุกคนที่ตอบถูกในหน้านี้">⭐</button>
                   <button type="button" data-a="rank" title="อันดับดาว">🏆</button>
                   <button type="button" data-a="pick" title="สุ่มคนที่ออนไลน์">🎲</button>
                   <button type="button" data-a="ink" title="ปากกา (P)">✏️</button>
                   <button type="button" data-a="end" title="จบคาบ">⏹</button>`
                : `<button type="button" data-a="start" class="lv-start">🔴 เริ่มห้องสด</button>
                   <button type="button" data-a="ink" title="ปากกา (P)">✏️</button>
                   <a href="${esc(C.base)}teacher.html" target="_blank" rel="noopener" title="แดชบอร์ดครู">📊</a>`;
        }
        drawBar();

        bar.addEventListener('click', async e => {
            const b = e.target.closest('button'); if (!b) return;
            const a = b.dataset.a;
            try {
                if (a === 'start') await startSession();
                else if (a === 'code') showCode();
                else if (a === 'lock') { session.unlocked = !session.unlocked; await sb().from('sessions').update({ unlocked: session.unlocked }).eq('id', session.id); sendNav(); drawBar(); }
                else if (a === 'quick') quickAsk();
                else if (a === 'names') { showNames = !showNames; drawBar(); refreshAll(); }
                else if (a === 'starall') await starCorrect();
                else if (a === 'rank') showRank();
                else if (a === 'pick') pickStudent();
                else if (a === 'ink') toggleInk();
                else if (a === 'end') await endSession();
            } catch (err) { C.toast(C.errText(err), 'bad'); }
        });
        document.addEventListener('keydown', e => {
            if (e.target.closest('input, textarea, select')) return;
            if ((e.key === 'p' || e.key === 'P') && !e.ctrlKey && !e.metaKey) toggleInk();
        });

        /* ปากกาครู: แยกตามสไลด์ ส่งเส้นให้เครื่องนักเรียนด้วย */
        const inkLay = Ink.layer(STAGE, { z: 65, cls: 'ink-teacher' });
        let inkBar = null;
        inkLay.onChange((st, board) => { inkBySlide[deck.current] = { st, board }; if (ch) ch.send({ type: 'broadcast', event: 'ink', payload: { slide: deck.current, st, board } }); });
        function toggleInk() {
            if (inkBar) { inkBar.querySelector('[data-a=close]').click(); return; }
            inkBar = Ink.palette(inkLay, { board: true, onClose: () => { inkBar = null; } });
        }

        /* ---------- คาบสด ---------- */
        async function loadRoster(roomId) {
            const { data } = await sb().from('students').select('id,no,name').eq('room_id', roomId).order('no');
            rosterList = data || []; roster = {};
            rosterList.forEach(s => { roster[s.id] = s; });
        }

        async function startSession() {
            const { data: rooms, error } = await sb().from('rooms').select('id,name').order('name');
            if (error) throw error;
            if (!rooms.length) { C.toast('ยังไม่มีห้อง — เพิ่มรายชื่อห้องในแดชบอร์ดครู 📊 ก่อน', 'bad', 4000); return; }
            const m = C.modal(`<h3>🔴 เริ่มห้องสด</h3><p>${esc(COURSE)} · ${esc(LESSON)}</p>
                <label for="lvRoom">ห้องที่สอนคาบนี้</label><select id="lvRoom">${rooms.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select>
                <div class="cls-row"><button type="button" class="cls-btn red" data-a="go">เริ่ม</button></div>`);
            m.el.querySelector('[data-a=go]').addEventListener('click', async () => {
                try {
                    const room = m.el.querySelector('#lvRoom').value;
                    const s = await C.rpc('start_session', { p_course: COURSE, p_lesson: LESSON, p_room: room, p_page: PAGE });
                    m.close();
                    await openSession(s);
                    showCode();
                } catch (err) { C.toast(C.errText(err), 'bad'); }
            });
        }

        async function openSession(s) {
            session = s; states = {}; answers = {}; members = new Set();
            await loadRoster(s.room_id);
            const [{ data: st }, { data: an }, { data: mem }] = await Promise.all([
                sb().from('item_state').select('ref,status').eq('session_id', s.id),
                sb().from('answers').select('student_id,ref,answer,correct,hidden').eq('session_id', s.id),
                sb().from('session_members').select('student_id').eq('session_id', s.id)
            ]);
            (st || []).forEach(r => { states[r.ref] = r.status; });
            (an || []).forEach(addAnswer);
            (mem || []).forEach(r => members.add(r.student_id));

            ch = sb().channel('live:' + s.code, { config: { broadcast: { self: false }, presence: { key: 'teacher' } } });
            ch.on('presence', { event: 'sync' }, () => {
                const ps = ch.presenceState();
                online = Object.values(ps).flat().filter(p => p.sid).map(p => p.sid);
                online.forEach(id => members.add(id));
                drawBar(); updateCodePanel();
            });
            ch.on('broadcast', { event: 'hello' }, () => { sendNav(); sendInk(); });
            ch.subscribe(status => { if (status === 'SUBSCRIBED') { sendNav(); } });

            ansCh = sb().channel('ans:' + s.id)
                .on('postgres_changes', { event: '*', schema: 'public', table: 'answers', filter: 'session_id=eq.' + s.id }, p => { if (p.new && p.new.ref) { addAnswer(p.new); refreshItem(p.new.ref); } })
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_members', filter: 'session_id=eq.' + s.id }, p => { members.add(p.new.student_id); drawBar(); updateCodePanel(); })
                .subscribe();

            ITEMS.forEach(it => teacherPanel(it));
            /* ถามด่วนที่ยังเปิดอยู่ (เช่น ครูรีเฟรชหน้า) → แสดงแผงผลกลับมา */
            const openQuick = Object.keys(states).filter(r => r.includes('/quick-') && states[r] !== 'closed').sort().pop();
            if (openQuick) {
                const [{ data: qi }, { data: qk }] = await Promise.all([
                    sb().from('items').select('kind,prompt,options').eq('ref', openQuick).maybeSingle(),
                    sb().from('item_keys').select('correct').eq('ref', openQuick).maybeSingle()
                ]);
                if (qi) quickPanel(openQuick, qi.kind, qi.prompt, qi.options, qk ? qk.correct : null);
            }
            drawBar();
            onNav(posOf(deck));
        }

        function addAnswer(r) {
            (answers[r.ref] = answers[r.ref] || {})[r.student_id] = r;
            if (r.answer && r.answer.path && !signed[r.answer.path]) {
                sb().storage.from('live-uploads').createSignedUrl(r.answer.path, 3600).then(({ data }) => {
                    if (data) { signed[r.answer.path] = data.signedUrl; refreshItem(r.ref); }
                });
            }
        }

        /* แผงผลใต้กิจกรรมบนสไลด์ */
        function teacherPanel(it) {
            const el = it.el;
            if (it.kind === 'mcq') {
                el.classList.add('lv-on');
                if (!el.querySelector(':scope > .lv-res')) {
                    const res = document.createElement('div'); res.className = 'lv-res'; el.appendChild(res);
                    el.addEventListener('click', ev => {
                        if (ev.target.closest('.reveal')) setTimeout(() => setState(it.ref, el.classList.contains('revealed') ? 'revealed' : 'open'), 0);
                    });
                }
            } else {
                el.classList.add('lv-w', 'lv-k-' + it.kind, 'lv-on');
                if (!el.querySelector('.lv-res')) el.innerHTML = '<div class="lv-res"></div>';
            }
            refreshItem(it.ref);
        }

        function rowsOf(ref) { return Object.values(answers[ref] || {}); }
        function refreshItem(ref) {
            const it = byRef[ref] || (quick && quick.ref === ref ? quick : null);
            if (!it || !session) return;
            const res = it === quick ? quick.panel.querySelector('.lv-res') : it.el.querySelector('.lv-res');
            if (!res) return;
            res.innerHTML = renderResults(it, rowsOf(ref), { roster, total: rosterList.length, showNames, status: states[ref], signed });
            if (it.kind === 'mcq' && it !== quick) {
                const rows = rowsOf(ref), opts = it.el.querySelectorAll('.opt'), max = Math.max(1, rows.length);
                opts.forEach((o, i) => {
                    const c = rows.filter(r => String(r.answer.v) === String(i)).length;
                    o.style.setProperty('--lv-w', (c / max * 100) + '%');
                    o.dataset.lvCount = c;
                });
            }
        }
        function refreshAll() { ITEMS.forEach(i => refreshItem(i.ref)); if (quick) refreshItem(quick.ref); }

        STAGE.addEventListener('click', async e => {
            if (!session) return;
            const wrap = e.target.closest('[data-ref]') || (quick && quick.panel.contains(e.target) ? quick.panel : null);
            const ref = wrap ? (wrap.dataset.ref || (quick && quick.ref)) : null;
            const b = e.target.closest('button[data-a], button[data-star], button[data-hide], [data-draw]');
            if (!b || !ref) return;
            e.stopPropagation();
            await panelAction(ref, b);
        }, true);

        async function panelAction(ref, b) {
            try {
                if (b.dataset.a === 'toggle') await setState(ref, states[ref] === 'open' ? 'closed' : 'open');
                else if (b.dataset.a === 'reveal') await revealItem(ref);
                else if (b.dataset.star) await giveStar(b.dataset.star, ref);
                else if (b.dataset.hide) {
                    const r = answers[ref][b.dataset.hide]; r.hidden = true;
                    await sb().from('answers').update({ hidden: true }).eq('session_id', session.id).eq('ref', ref).eq('student_id', b.dataset.hide);
                    refreshItem(ref);
                } else if (b.dataset.draw) showDrawing(ref, b.dataset.draw);
            } catch (err) { C.toast(C.errText(err), 'bad'); }
        }

        async function setState(ref, status) {
            states[ref] = status;
            await sb().from('item_state').upsert({ session_id: session.id, ref, status, updated_at: new Date().toISOString() });
            ch && ch.send({ type: 'broadcast', event: 'state', payload: { ref, status } });
            refreshItem(ref);
        }

        async function revealItem(ref) {
            const it = byRef[ref] || quick;
            if (it === quick && (it.kind === 'mcq' || it.kind === 'tf') && !it.key) {
                const opts = it.options;
                const m = C.modal(`<h3>เฉลยข้อนี้คือ?</h3><div class="cls-row">${opts.map((o, i) => `<button type="button" class="cls-btn ghost" data-v="${i}">${esc(it.kind === 'tf' ? o : TH[i])}</button>`).join('')}
                    <button type="button" class="cls-btn ghost" data-v="">ไม่มีเฉลย</button></div>`);
                const v = await new Promise(res => m.el.addEventListener('click', ev => { const x = ev.target.closest('[data-v]'); if (x) { m.close(); res(x.dataset.v); } }));
                if (v !== '') {
                    it.key = { v };
                    await sb().from('item_keys').upsert({ ref, correct: it.key });
                    /* ตรวจคำตอบที่ส่งมาแล้วใหม่ */
                    for (const r of rowsOf(ref)) {
                        r.correct = String(r.answer.v) === v;
                        await sb().from('answers').update({ correct: r.correct }).eq('session_id', session.id).eq('ref', ref).eq('student_id', r.student_id);
                    }
                }
            }
            await setState(ref, 'revealed');
        }

        function showDrawing(ref, sid) {
            const r = answers[ref][sid]; if (!r) return;
            const old = STAGE.querySelector('.lv-overlay-draw'); if (old) old.remove();
            const d = document.createElement('div');
            d.className = 'lv-overlay-draw';
            d.innerHTML = Ink.svg(r.answer.strokes) + `<div class="lv-ov-cap">${showNames ? esc(rosterName(roster[sid])) : 'ภาพวาดนักเรียน'} · คลิกเพื่อปิด</div>`;
            d.addEventListener('click', ev => { ev.stopPropagation(); d.remove(); });
            STAGE.appendChild(d);
        }

        /* ---------- ซิงก์หน้า ---------- */
        let saveT = null;
        function sendNav() {
            if (!ch || !session) return;
            const p = posOf(deck);
            ch.send({ type: 'broadcast', event: 'nav', payload: { slide: p.slide, step: p.step, unlocked: session.unlocked } });
        }
        function sendInk() {
            const x = inkBySlide[deck.current];
            if (ch && x) ch.send({ type: 'broadcast', event: 'ink', payload: { slide: deck.current, st: x.st, board: x.board } });
        }
        async function onNav(p) {
            const x = inkBySlide[p.slide];
            inkLay.setStrokes(x ? x.st : [], x ? x.board : false);
            if (!session) return;
            sendNav();
            clearTimeout(saveT);
            saveT = setTimeout(() => sb().from('sessions').update({ slide: p.slide, step: p.step }).eq('id', session.id).then(() => {}), 800);
            /* เปิดรับคำตอบกิจกรรมในหน้านี้อัตโนมัติ */
            for (const it of itemsOn(p.slide)) if (!states[it.ref]) await setState(it.ref, 'open');
        }
        nav.listeners.push(onNav);

        /* ---------- รหัสห้อง + รายชื่อ ---------- */
        let codeModal = null;
        function showCode() {
            if (!session) return;
            codeModal = C.modal(`<div class="lv-codebox">
                <div class="lv-codehint">เปิดเว็บวิชา → กดปุ่ม <b>🔴 เข้าห้องเรียน</b><br>หรือพิมพ์รหัส</div>
                <div class="lv-bigcode">${esc(session.code)}</div>
                <div class="lv-who"></div>
                <details class="lv-qr"><summary>QR (เสริม)</summary><div class="lv-qrimg"></div></details></div>`, { onClose: () => { codeModal = null; } });
            codeModal.el.classList.add('lv-codecard');
            updateCodePanel();
            const q = codeModal.el.querySelector('details');
            q.addEventListener('toggle', () => { if (q.open) drawQR(codeModal.el.querySelector('.lv-qrimg')); });
        }
        function updateCodePanel() {
            if (!codeModal) return;
            const who = codeModal.el.querySelector('.lv-who');
            who.innerHTML = `<div class="lv-whohead">เข้าแล้ว <b>${members.size}</b> / ${rosterList.length} คน</div><div class="lv-nums">` +
                rosterList.map(s => `<span class="${members.has(s.id) ? 'in' : ''}${online.includes(s.id) ? ' on' : ''}" title="${esc(s.name)}">${s.no}</span>`).join('') + '</div>';
        }
        function drawQR(box) {
            const url = PAGE + '?live=' + session.code;
            const render = () => { const q = qrcode(0, 'M'); q.addData(url); q.make(); box.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2 }) + `<div class="lv-url">${esc(url)}</div>`; };
            if (window.qrcode) return render();
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
            s.onload = render; document.head.appendChild(s);
        }

        /* ---------- ถามด่วน ---------- */
        function quickAsk() {
            const kinds = [['mcq', 'ก ข ค ง'], ['tf', 'ถูก/ผิด'], ['number', 'ตัวเลข'], ['short', 'ตอบสั้น'], ['wordcloud', 'Word cloud'], ['draw', 'วาดบนสไลด์'], ['image', 'ส่งรูป']];
            const m = C.modal(`<h3>➕ ถามด่วน</h3><p>นักเรียนจะเห็นช่องตอบบนเครื่อง ส่วนคำถามให้ดูบนจอครู</p>
                <label for="lvQ">คำถาม (ไม่ใส่ก็ได้)</label><input id="lvQ" type="text" placeholder="ดูคำถามบนจอ">
                <div class="cls-row">${kinds.map(k => `<button type="button" class="cls-btn ghost" data-k="${k[0]}">${k[1]}</button>`).join('')}</div>`);
            m.el.addEventListener('click', async ev => {
                const b = ev.target.closest('[data-k]'); if (!b) return;
                const kind = b.dataset.k, prompt = m.el.querySelector('#lvQ').value.trim() || 'ดูคำถามบนจอครู';
                m.close();
                if (quick) quick.panel.remove();
                const ref = `${COURSE}/${LESSON}/quick-${Date.now().toString(36)}`;
                const options = kind === 'mcq' ? ['ก', 'ข', 'ค', 'ง'] : kind === 'tf' ? ['ถูก', 'ผิด'] : null;
                await sb().from('items').upsert({ ref, course: COURSE, lesson: LESSON, kind, prompt, options: kind === 'draw' ? { slide: deck.current } : options });
                quickPanel(ref, kind, prompt, options, null);
                await setState(ref, 'open');
            });
        }

        /* แผงผลถามด่วน (ใช้ทั้งตอนสร้างใหม่ และตอนรีเฟรชหน้ากลับเข้าคาบเดิม) */
        function quickPanel(ref, kind, prompt, options, key) {
            const panel = document.createElement('div');
            panel.className = 'lv-quick';
            panel.dataset.ref = ref;
            panel.innerHTML = `<div class="lv-qtitle">➕ ${esc(prompt)} <button type="button" class="lv-mini" data-x="1">ปิดหน้าต่าง</button></div><div class="lv-res"></div>`;
            ['keydown', 'click', 'touchstart', 'touchend', 'wheel'].forEach(evn => panel.addEventListener(evn, e2 => e2.stopPropagation(), { passive: evn !== 'click' && evn !== 'keydown' }));
            panel.addEventListener('click', async e2 => {
                if (e2.target.closest('[data-x]')) { panel.remove(); if (quick && quick.ref === ref) { await setState(ref, 'closed'); quick = null; } return; }
                const bb = e2.target.closest('button[data-a], button[data-star], button[data-hide], [data-draw]');
                if (bb) await panelAction(ref, bb);
            });
            document.body.appendChild(panel);
            quick = { ref, kind, prompt, options: Array.isArray(options) ? options : [], key, panel, el: panel };
            refreshItem(ref);
        }

        /* ---------- ดาว ---------- */
        async function giveStar(sid, reason) {
            await sb().from('stars').insert({ student_id: sid, session_id: session.id, course: COURSE, n: 1, reason });
            const st = roster[sid];
            ch && ch.send({ type: 'broadcast', event: 'star', payload: { sid } });
            C.toast(`⭐ ให้ดาว ${st ? rosterName(st) : ''}`, 'star');
        }
        async function starCorrect() {
            if (!session) return;
            const refs = itemsOn(deck.current).map(i => i.ref).concat(quick ? [quick.ref] : []);
            const ids = new Set();
            refs.forEach(r => rowsOf(r).forEach(a => { if (a.correct === true) ids.add(a.student_id); }));
            if (!ids.size) { C.toast('หน้านี้ยังไม่มีคนตอบถูก (หรือยังไม่มีเฉลย)', 'bad'); return; }
            await sb().from('stars').insert([...ids].map(sid => ({ student_id: sid, session_id: session.id, course: COURSE, n: 1, reason: 'correct' })));
            ids.forEach(sid => ch && ch.send({ type: 'broadcast', event: 'star', payload: { sid } }));
            C.toast(`⭐ ให้ดาว ${ids.size} คนที่ตอบถูก`, 'star');
        }

        /* ---------- อันดับ ---------- */
        async function showRank() {
            const m = C.modal(`<div class="lv-rank"><h3>🏆 อันดับดาว</h3>
                <div class="cls-row" style="margin-top:4px"><button type="button" class="cls-btn" data-r="s">คาบนี้</button><button type="button" class="cls-btn ghost" data-r="c">สะสมทั้งวิชา</button></div>
                <ol class="lv-ranklist"><li>กำลังโหลด…</li></ol></div>`);
            m.el.classList.add('lv-rankcard');
            const load = async which => {
                m.el.querySelectorAll('[data-r]').forEach(b => b.className = 'cls-btn' + (b.dataset.r === which ? '' : ' ghost'));
                let q = sb().from('stars').select('student_id,n');
                q = which === 's' && session ? q.eq('session_id', session.id) : q.eq('course', COURSE).in('student_id', rosterList.map(s => s.id));
                const { data } = await q;
                const sum = {};
                (data || []).forEach(r => { sum[r.student_id] = (sum[r.student_id] || 0) + r.n; });
                const top = Object.entries(sum).sort((a, b) => b[1] - a[1]).slice(0, 10);
                const medal = ['🥇', '🥈', '🥉'];
                m.el.querySelector('.lv-ranklist').innerHTML = top.length
                    ? top.map(([sid, n], i) => `<li class="r${i}"><span class="md">${medal[i] || i + 1}</span><span class="nm">${esc(rosterName(roster[sid]))}</span><span class="st">⭐ ${n}</span></li>`).join('')
                    : '<li>ยังไม่มีดาว</li>';
            };
            m.el.addEventListener('click', ev => { const b = ev.target.closest('[data-r]'); if (b) load(b.dataset.r); });
            if (!rosterList.length && session) await loadRoster(session.room_id);
            load(session ? 's' : 'c');
        }

        /* ---------- สุ่มคน ---------- */
        function pickStudent() {
            const pool = (online.length ? online : [...members]).map(id => roster[id]).filter(Boolean);
            if (!pool.length) { C.toast('ยังไม่มีนักเรียนออนไลน์', 'bad'); return; }
            const m = C.modal(`<div class="lv-pick"><div class="lv-pickname">?</div>
                <div class="cls-row" style="justify-content:center"><button type="button" class="cls-btn" data-a="again">🎲 สุ่มอีก</button><button type="button" class="cls-btn ghost" data-a="star">⭐ ให้ดาว</button></div></div>`);
            let chosen = null;
            const spin = () => {
                let n = 0;
                const t = setInterval(() => {
                    chosen = pool[Math.floor(Math.random() * pool.length)];
                    m.el.querySelector('.lv-pickname').textContent = rosterName(chosen);
                    if (++n > 16) clearInterval(t);
                }, 70);
            };
            m.el.addEventListener('click', async ev => {
                const b = ev.target.closest('[data-a]'); if (!b) return;
                if (b.dataset.a === 'again') spin();
                else if (chosen) await giveStar(chosen.id, 'picked');
            });
            spin();
        }

        async function endSession() {
            const m = C.modal(`<h3>⏹ จบคาบสด?</h3><p>นักเรียนจะกลับไปโหมดดูเอง คำตอบทั้งหมดยังเก็บไว้ในแดชบอร์ด</p>
                <div class="cls-row"><button type="button" class="cls-btn red" data-a="y">จบคาบ</button><button type="button" class="cls-btn ghost" data-a="n">ยกเลิก</button></div>`);
            m.el.addEventListener('click', async ev => {
                const b = ev.target.closest('[data-a]'); if (!b) return;
                m.close();
                if (b.dataset.a !== 'y') return;
                await sb().from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', session.id);
                ch && ch.send({ type: 'broadcast', event: 'end', payload: {} });
                setTimeout(() => { ch && sb().removeChannel(ch); ansCh && sb().removeChannel(ansCh); ch = ansCh = null; }, 500);
                session = null; if (quick) { quick.panel.remove(); quick = null; }
                document.querySelectorAll('.lv-on').forEach(el => el.classList.remove('lv-on'));
                drawBar();
                C.toast('จบคาบสดแล้ว', 'ok');
            });
        }

        /* กลับมาคาบเดิม (เช่น รีเฟรชหน้า) */
        try {
            const { data } = await sb().from('sessions').select('*').eq('page', PAGE).is('ended_at', null)
                .gt('created_at', new Date(Date.now() - 6 * 3600e3).toISOString()).order('created_at', { ascending: false }).limit(1);
            if (data && data[0]) { await openSession(data[0]); C.toast(`กลับเข้าคาบสดเดิม รหัส ${data[0].code}`, 'ok'); }
        } catch (e) { /* ไม่เป็นไร */ }
    }

    /* ===========================================
       โหมดนักเรียน (สด / ทบทวนเอง)
       =========================================== */
    async function studentMode(deck, code) {
        let me = C.me();
        let live = null, state = { items: {}, mine: {}, keys: {}, unlocked: false }, ch = null, teacherPos = null, navAt = 0;
        const teacherInk = {};
        document.body.classList.add('lv-student', code ? 'lv-stu-live' : 'lv-stu-self');

        if (code) {
            try {
                me = await C.ensureStudent();
                live = await C.rpc('join_session', { p_code: code, p_token: C.token() });
            } catch (e) {
                if (e.message !== 'CANCELLED') C.toast(C.errText(e), 'bad', 4000);
                history.replaceState(null, '', location.pathname + location.hash);
                document.body.classList.remove('lv-stu-live'); document.body.classList.add('lv-stu-self');
                code = null;
            }
        }

        /* แถบสถานะล่าง */
        const bar = document.createElement('div');
        bar.className = 'lv-sbar';
        ['keydown', 'click', 'touchstart', 'touchend'].forEach(ev => bar.addEventListener(ev, e => e.stopPropagation(), { passive: ev.startsWith('touch') }));
        document.body.appendChild(bar);
        function drawBar() {
            me = C.me();
            const who = me ? `${esc(me.name)} · ⭐ <b>${esc(state.stars != null ? state.stars : me.stars || 0)}</b>` : '<button type="button" data-a="verify">🙋 ยืนยันตัวเพื่อบันทึกคำตอบ</button>';
            bar.innerHTML = code
                ? `<span class="lv-dot"></span> สด ${esc(code)} · ${who} ${state.unlocked ? (teacherPos && teacherPos.slide !== deck.current ? '<button type="button" data-a="back">↩ กลับไปหน้าครู</button>' : '<span class="lv-free">ดูเองได้</span>') : '<span class="lv-follow">ตามครู</span>'}`
                : `📲 ${who}${me ? ' · บันทึกคำตอบอัตโนมัติ' : ''}<span class="lv-livebtn"></span>`;
        }
        bar.addEventListener('click', async e => {
            const b = e.target.closest('[data-a]'); if (!b) return;
            if (b.dataset.a === 'verify') { try { await C.verify(); drawBar(); } catch (err) { /* ยกเลิก */ } }
            else if (b.dataset.a === 'back' && teacherPos) gotoPos(deck, teacherPos.slide, teacherPos.step);
            else if (b.dataset.a === 'live') location.href = b.dataset.href;
        });

        /* ส่งคำตอบ */
        async function submit(it, answer, msg) {
            try {
                if (!C.token()) { await C.ensureStudent(); drawBar(); }
                if (code && it.ref && (!state.items[it.ref] || state.items[it.ref].status !== 'open')) {
                    msg('⏳ ครูยังไม่เปิดรับคำตอบข้อนี้'); return;
                }
                msg('กำลังส่ง…');
                const r = await C.rpc('submit_answer', { p_token: C.token(), p_ref: it.ref, p_kind: it.kind, p_answer: answer, p_code: code });
                if (code) { msg(['mcq', 'tf', 'number'].includes(it.kind) ? '✅ ส่งแล้ว รอครูเฉลย' : '✅ ส่งแล้ว (ส่งใหม่ได้ ระบบเก็บคำตอบล่าสุด)'); state.mine[it.ref] = { answer }; }
                else if (r.correct === true) msg('✅ ถูกต้อง');
                else if (r.correct === false) msg('❌ ยังไม่ถูก ลองใหม่ได้' + (it.kind === 'number' ? '' : ''));
                else msg('✅ บันทึกแล้ว');
                if (navigator.vibrate) navigator.vibrate(30);
            } catch (e) { if (e.message !== 'CANCELLED') msg('⚠️ ' + C.errText(e)); }
        }

        /* วิดเจ็ตบนสไลด์ */
        ITEMS.forEach(it => {
            if (it.kind === 'mcq') {
                const el = it.el, rv = el.querySelector('.reveal');
                const note = document.createElement('div'); note.className = 'lv-msg lv-vmsg'; el.appendChild(note);
                el.addEventListener('click', ev => {
                    const o = ev.target.closest('.opt'); if (!o) return;
                    const i = Array.from(el.querySelectorAll('.opt')).indexOf(o);
                    if (!me && !code) return;          /* ยังไม่ยืนยันตัว: ใช้แบบเดิม */
                    submit(it, { v: String(i) }, t => { note.innerHTML = t; });
                });
                /* ทบทวนเอง: ต้องเลือกคำตอบก่อนจึงเฉลยได้ */
                if (rv) rv.addEventListener('click', ev => {
                    if (code) return;              /* คาบสด: ครูเป็นคนเฉลย */
                    if (!el.querySelector('.opt.picked') && !el.classList.contains('revealed')) {
                        ev.stopImmediatePropagation(); ev.preventDefault();
                        note.innerHTML = '👆 เลือกคำตอบก่อน แล้วค่อยกดเฉลย';
                    }
                }, true);
            } else {
                it.ui = studentWidget(it, submit);
            }
        });

        /* ---------- สด ---------- */
        let stateT = null;
        async function pullState() {
            if (!code) return;
            try {
                const s = await C.rpc('session_state', { p_code: code, p_token: C.token() });
                if (s.ended) return ended();
                const prevUnlocked = state.unlocked;
                state = s;
                applyState();
                /* ข้อความสดจากครูล่าสุด (ภายใน 10 วินาที) ใหม่กว่าค่าในฐานข้อมูล */
                const fresh = Date.now() - navAt < 10000;
                if (fresh) state.unlocked = prevUnlocked;
                else if (!state.unlocked && (s.slide !== deck.current || !teacherPos)) { teacherPos = { slide: s.slide, step: s.step }; gotoPos(deck, s.slide, s.step); }
                drawBar();
            } catch (e) { if ((e.message || '').includes('BAD_TOKEN')) location.reload(); }
        }
        const pullSoon = () => { clearTimeout(stateT); stateT = setTimeout(pullState, 250); };

        function applyState() {
            ITEMS.forEach(it => {
                const st = state.items[it.ref], mine = state.mine[it.ref];
                if (it.kind === 'mcq') {
                    const el = it.el, rv = el.querySelector('.reveal'), note = el.querySelector('.lv-vmsg');
                    if (st && st.status === 'revealed' && !el.classList.contains('revealed') && rv) rv.click();
                    if (st && st.status !== 'revealed' && el.classList.contains('revealed') && rv) rv.click();
                    if (note && st && st.status === 'revealed' && mine) note.innerHTML = mine.correct === true ? '🎉 คุณตอบถูก' : mine.correct === false ? '❌ คุณตอบผิด' : '';
                    else if (note && st && st.status === 'closed') note.innerHTML = mine ? '⏸ ครูปิดรับคำตอบแล้ว' : '⏸ ครูปิดรับคำตอบแล้ว (ไม่ได้ตอบ)';
                } else if (it.ui) {
                    it.el.classList.toggle('lv-closed', !!(st && st.status !== 'open'));
                    if (st && st.status === 'revealed' && mine) {
                        const k = state.keys[it.ref];
                        it.ui.msg((mine.correct === true ? '🎉 ถูกต้อง' : mine.correct === false ? '❌ ยังไม่ถูก' : '✅ ส่งแล้ว') +
                            (k && k.v != null && it.kind !== 'tf' ? ` · เฉลย ${esc(k.v)} ${esc(it.el.dataset.unit || '')}` : ''));
                    }
                }
            });
            quickSheet();
        }

        /* ถามด่วน: แผ่นตอบลอยด้านล่าง */
        let sheet = null, sheetRef = null, sheetKind = null;
        function quickSheet() {
            const q = Object.entries(state.items).filter(([ref, v]) => ref.includes('/quick-') && v.status !== 'closed').sort((a, b) => a[0] < b[0] ? 1 : -1)[0];
            if (!q) { if (sheet) { sheet.remove(); sheet = null; sheetRef = null; } return; }
            const [ref, v] = q;
            if (sheetRef !== ref || sheetKind !== v.kind) {
                if (sheet) sheet.remove();
                sheet = document.createElement('div');
                sheet.className = 'lv-sheet';
                ['keydown', 'click', 'touchstart', 'touchend', 'wheel'].forEach(ev => sheet.addEventListener(ev, e => e.stopPropagation(), { passive: ev !== 'click' && ev !== 'keydown' }));
                sheet.innerHTML = `<div class="lv-qtitle">➕ ${esc(v.prompt || 'ดูคำถามบนจอครู')}</div><div class="lv-qbody"></div>`;
                document.body.appendChild(sheet);
                sheetRef = ref; sheetKind = v.kind;
                const holder = sheet.querySelector('.lv-qbody');
                const it = { ref, kind: v.kind, el: holder, options: Array.isArray(v.options) ? v.options : null };
                if (v.kind === 'mcq') {
                    holder.innerHTML = `<div class="lv-tf lv-abcd">${(it.options || ['ก', 'ข', 'ค', 'ง']).map((o, i) => `<button type="button" class="lv-opt" data-v="${i}">${esc(o)}</button>`).join('')}</div><div class="lv-msg"></div>`;
                    holder.addEventListener('click', e => {
                        const b = e.target.closest('[data-v]'); if (!b) return;
                        holder.querySelectorAll('.lv-opt').forEach(x => x.classList.toggle('picked', x === b));
                        submit(it, { v: b.dataset.v }, t => { holder.querySelector('.lv-msg').innerHTML = t; });
                    });
                    it.ui = { msg: t => { holder.querySelector('.lv-msg').innerHTML = t; } };
                } else {
                    if (v.kind === 'draw' && v.options && v.options.slide != null && !state.unlocked) gotoPos(deck, v.options.slide, 99);
                    it.ui = studentWidget(it, submit);
                }
                sheet.itemRef = it;
                if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
            }
            const mine = state.mine[ref];
            if (v.status === 'revealed' && sheet.itemRef.ui) {
                sheet.itemRef.ui.msg(mine ? (mine.correct === true ? '🎉 ถูกต้อง' : mine.correct === false ? '❌ ยังไม่ถูก' : '✅ ส่งแล้ว') : 'ครูเฉลยแล้ว');
            }
        }

        function ended() {
            C.toast('ครูจบคาบสดแล้ว — ดูสไลด์ต่อเองได้', 'ok', 4000);
            if (ch) sb().removeChannel(ch);
            code = null; nav.lock = () => false;
            document.body.classList.remove('lv-stu-live'); document.body.classList.add('lv-stu-self');
            if (sheet) { sheet.remove(); sheet = null; }
            history.replaceState(null, '', location.pathname + location.hash);
            drawBar();
        }

        if (code) {
            nav.lock = () => !state.unlocked;
            nav.blocked = () => C.toast('กำลังเลื่อนตามครู — รอครูเปลี่ยนหน้า');
            const inkLay = Ink.layer(STAGE, { z: 65, cls: 'ink-teacher' });
            ch = sb().channel('live:' + code, { config: { broadcast: { self: false }, presence: { key: C.token() } } });
            ch.on('broadcast', { event: 'nav' }, ({ payload }) => {
                teacherPos = { slide: payload.slide, step: payload.step }; navAt = Date.now();
                const wasUnlocked = state.unlocked;
                state.unlocked = payload.unlocked;
                if (!payload.unlocked) gotoPos(deck, payload.slide, payload.step);
                if (wasUnlocked !== payload.unlocked) C.toast(payload.unlocked ? '🔓 ครูให้ดูสไลด์เองได้' : '🔒 กลับมาเลื่อนตามครู');
                drawBar();
            });
            ch.on('broadcast', { event: 'state' }, pullSoon);
            ch.on('broadcast', { event: 'ink' }, ({ payload }) => {
                teacherInk[payload.slide] = payload;
                if (payload.slide === deck.current) inkLay.setStrokes(payload.st, payload.board);
            });
            ch.on('broadcast', { event: 'star' }, async ({ payload }) => {
                const mine = await C.refreshMe();
                if (mine && state.stars != null && mine.stars !== state.stars) { C.toast('⭐ ครูให้ดาวคุณ!', 'star', 3500); if (navigator.vibrate) navigator.vibrate(120); }
                state.stars = mine ? mine.stars : state.stars; drawBar();
            });
            ch.on('broadcast', { event: 'end' }, ended);
            ch.subscribe(async status => {
                if (status !== 'SUBSCRIBED') return;
                const m = C.me();
                await ch.track({ sid: m && m.student_id ? m.student_id : null, no: m && m.no });
                ch.send({ type: 'broadcast', event: 'hello', payload: {} });
            });
            nav.listeners.push(p => { const x = teacherInk[p.slide]; inkLay.setStrokes(x ? x.st : [], x ? x.board : false); drawBar(); });
            await pullState();
            setInterval(pullState, 8000);
            document.addEventListener('visibilitychange', () => { if (!document.hidden) pullState(); });
        } else {
            /* ทบทวนเอง: บันทึกความคืบหน้า + ดูว่าครูสอนสดอยู่ไหม */
            let progT = null;
            nav.listeners.push(p => {
                if (!C.token()) return;
                clearTimeout(progT);
                progT = setTimeout(() => C.rpc('save_progress', { p_token: C.token(), p_course: COURSE, p_lesson: LESSON, p_slide: p.slide + 1, p_total: deck.slides.length }).catch(() => {}), 1500);
            });
            const checkLive = async () => {
                if (!C.token()) return;
                try {
                    const s = await C.rpc('my_live_session', { p_token: C.token() });
                    const box = bar.querySelector('.lv-livebtn');
                    if (box) box.innerHTML = s ? ` <button type="button" class="lv-golive" data-a="live" data-href="${esc(s.page + '?live=' + s.code)}">🔴 ครูกำลังสอนสด — กดเข้าห้องเรียน</button>` : '';
                } catch (e) { /* ลองใหม่รอบหน้า */ }
            };
            checkLive(); setInterval(checkLive, 15000);
        }
        drawBar();
        C.on('change', drawBar);
    }

    /* ===========================================
       เริ่มทำงาน
       =========================================== */
    whenDeck(async deck => {
        patchDeck(deck);
        scanItems(deck);
        const t = await C.teacher();
        if (t && !LIVE_CODE) return teacherMode(deck);
        if (LIVE_CODE || C.token()) return studentMode(deck, LIVE_CODE);
        /* ยังไม่ยืนยันตัว: กิจกรรมใหม่ยังตอบได้ (ยืนยันตัวตอนกดส่ง) + ปุ่มเล็กในแถบควบคุม */
        studentMode(deck, null);
        const ctl = document.querySelector('.deck-controls');
        if (ctl) {
            const b = document.createElement('button');
            b.type = 'button'; b.textContent = '🔑'; b.title = 'ครู: เข้าสู่ระบบ';
            b.addEventListener('click', () => { location.href = C.teacherLoginUrl(); });
            ctl.appendChild(b);
        }
    });
})();
