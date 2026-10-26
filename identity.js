/* ===========================================
   Classroom — แกนกลางระบบห้องเรียนสด (ใช้ร่วมทุกวิชา)
   - เชื่อม Supabase (config.js) · เรียกฟังก์ชันฝั่งฐานข้อมูล (rpc)
   - ยืนยันตัวนักเรียนครั้งเดียว: ห้อง → เลขที่ → ชื่อจริง → เก็บ token ในเครื่อง
     (ทุกวิชาอยู่ที่ krutaopoon-prog.github.io เดียวกัน จึงใช้ token ร่วมกันได้)
   - ตรวจว่าเป็นครูที่ล็อกอินหรือไม่
   - หน้าต่าง (modal) และข้อความแจ้งเตือน (toast) ที่หน้าอื่นใช้ต่อ
   =========================================== */
(function (g) {
    'use strict';
    const CFG = g.CLASSROOM_CONFIG || {};
    const BASE = g.CLASSROOM_BASE || 'https://krutaopoon-prog.github.io/classroom/';
    const TOKEN_KEY = 'uttc-cls-token', ME_KEY = 'uttc-cls-me';

    const ls = {
        get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ใช้ต่อได้แม้บันทึกไม่ได้ */ } },
        del(k) { try { localStorage.removeItem(k); } catch (e) { /* ไม่เป็นไร */ } }
    };
    const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ---------- Supabase ---------- */
    const ready = !!(CFG.url && CFG.anonKey && g.supabase);
    let client = null;
    function sb() {
        if (!ready) throw new Error('OFFLINE');
        if (!client) client = g.supabase.createClient(CFG.url, CFG.anonKey, {
            auth: { storageKey: 'uttc-cls-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        return client;
    }

    const MSG = {
        OFFLINE: 'ยังเชื่อมต่อระบบห้องเรียนไม่ได้ (ตรวจอินเทอร์เน็ต)',
        NOT_FOUND: 'ไม่พบเลขที่นี้ในห้องที่เลือก',
        NAME_MISMATCH: 'ชื่อไม่ตรงกับรายชื่อของเลขที่นี้ (พิมพ์ชื่อจริง ไม่ต้องมีคำนำหน้า)',
        LOCKED: 'ลองผิดหลายครั้งเกินไป รอ 10 นาทีแล้วลองใหม่',
        BAD_CODE: 'รหัสไม่ถูกต้อง หรือคาบนี้จบไปแล้ว',
        BAD_TOKEN: 'เครื่องนี้ต้องยืนยันตัวใหม่',
        WRONG_ROOM: 'คาบนี้เป็นของห้องอื่น',
        CLOSED: 'ครูยังไม่เปิดรับคำตอบข้อนี้ หรือปิดรับแล้ว',
        TOO_BIG: 'คำตอบมีขนาดใหญ่เกินไป',
        NO_KEYS: 'ระบบยังไม่มีเฉลยของแบบทดสอบชุดนี้',
        NOT_TEACHER: 'บัญชีนี้ไม่มีสิทธิ์ครู'
    };
    function errText(e) {
        const m = (e && e.message) || String(e || '');
        for (const k in MSG) if (m.includes(k)) return MSG[k];
        return 'เชื่อมต่อระบบไม่สำเร็จ ลองใหม่อีกครั้ง';
    }

    async function rpc(name, args) {
        const { data, error } = await sb().rpc(name, args || {});
        if (error) {
            if ((error.message || '').includes('BAD_TOKEN')) forget();
            throw new Error(error.message || 'RPC_ERROR');
        }
        return data;
    }

    /* ---------- ตัวตนนักเรียน ---------- */
    const listeners = {};
    const on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); };
    const emit = (ev, x) => (listeners[ev] || []).forEach(fn => { try { fn(x); } catch (e) { console.error(e); } });

    const token = () => ls.get(TOKEN_KEY, null);
    const me = () => (token() ? ls.get(ME_KEY, null) : null);
    function forget() { ls.del(TOKEN_KEY); ls.del(ME_KEY); emit('change', null); }

    async function refreshMe() {
        const t = token();
        if (!t || !ready) return me();
        try { const m = await rpc('me', { p_token: t }); ls.set(ME_KEY, m); emit('change', m); return m; }
        catch (e) { return token() ? me() : null; }
    }

    /* ---------- หน้าต่างและข้อความแจ้งเตือน ---------- */
    function css() {
        if (document.getElementById('cls-core-css')) return;
        const s = document.createElement('style');
        s.id = 'cls-core-css';
        s.textContent = `
.cls-ov{position:fixed;inset:0;z-index:10000;font-family:var(--font-body,Sarabun,system-ui,sans-serif);background:rgba(30,26,40,.55);display:flex;align-items:center;justify-content:center;padding:16px;font-size:18px;line-height:1.5}
.cls-card{background:#fffdf8;color:#2a2733;border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.3);width:min(460px,100%);max-height:92vh;overflow:auto;padding:22px 24px;position:relative}
.cls-card h3{margin:0 0 6px;font-size:22px}
.cls-card p{margin:0 0 12px;color:#5d5866;font-size:16px}
.cls-card label{display:block;margin:10px 0 4px;font-weight:600;font-size:16px}
.cls-card input,.cls-card select,.cls-card textarea{width:100%;box-sizing:border-box;font:inherit;font-size:18px;padding:10px 12px;border:2px solid #d9d2c3;border-radius:10px;background:#fff;color:inherit}
.cls-card input:focus,.cls-card select:focus,.cls-card textarea:focus{outline:none;border-color:#e8742c}
.cls-btn{font:inherit;font-size:17px;font-weight:600;border:0;border-radius:12px;padding:11px 18px;cursor:pointer;background:#e8742c;color:#fff}
.cls-btn.ghost{background:#efe8da;color:#2a2733}
.cls-btn.red{background:#d6455d}
.cls-btn:disabled{opacity:.5;cursor:default}
.cls-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px;align-items:center}
.cls-err{color:#c0392b;font-size:15px;min-height:1.4em;margin-top:8px}
.cls-x{position:absolute;top:8px;right:10px;background:none;border:0;font-size:26px;cursor:pointer;color:#8a8494}
.cls-toasts{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:10001;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}
.cls-toast{background:#2a2733;color:#fff;padding:10px 18px;border-radius:12px;font-size:17px;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:cls-in .25s ease-out}
.cls-toast.ok{background:#2e9b57}.cls-toast.bad{background:#d6455d}.cls-toast.star{background:#f7b733;color:#2a2733}
@keyframes cls-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}`;
        document.head.appendChild(s);
    }

    function modal(html, opts) {
        css();
        const ov = document.createElement('div');
        ov.className = 'cls-ov';
        ov.innerHTML = `<div class="cls-card" role="dialog" aria-modal="true">${opts && opts.noClose ? '' : '<button type="button" class="cls-x" aria-label="ปิด">×</button>'}${html}</div>`;
        /* ไม่ให้แป้นพิมพ์และการปัดในหน้าต่างไปเลื่อนสไลด์ */
        ['keydown', 'wheel', 'touchstart', 'touchend', 'click'].forEach(ev => ov.addEventListener(ev, e => e.stopPropagation()));
        document.body.appendChild(ov);
        const close = () => { ov.remove(); if (opts && opts.onClose) opts.onClose(); };
        const x = ov.querySelector('.cls-x');
        if (x) x.addEventListener('click', close);
        return { el: ov.querySelector('.cls-card'), close };
    }

    function toast(msg, kind, ms) {
        css();
        let box = document.querySelector('.cls-toasts');
        if (!box) { box = document.createElement('div'); box.className = 'cls-toasts'; document.body.appendChild(box); }
        const t = document.createElement('div');
        t.className = 'cls-toast ' + (kind || '');
        t.textContent = msg;
        box.appendChild(t);
        setTimeout(() => t.remove(), ms || 2600);
    }

    /* ---------- ยืนยันตัวนักเรียน (ครั้งแรกครั้งเดียว) ---------- */
    function verify() {
        return new Promise((resolve, reject) => {
            const m = modal(`<h3>🙋 ยืนยันตัวนักเรียน</h3>
                <p>ทำครั้งแรกครั้งเดียว เครื่องนี้จะจำไว้ใช้ได้ทุกวิชา</p>
                <label for="cls-room">ห้อง</label><select id="cls-room"><option value="">กำลังโหลดรายชื่อห้อง…</option></select>
                <label for="cls-no">เลขที่</label><input id="cls-no" type="number" inputmode="numeric" min="1" max="99">
                <label for="cls-first">ชื่อจริง (ไม่ต้องมีคำนำหน้า)</label><input id="cls-first" type="text" autocomplete="given-name" placeholder="เช่น สมชาย">
                <div class="cls-err" aria-live="polite"></div>
                <div class="cls-row"><button type="button" class="cls-btn" data-a="ok">ยืนยัน</button><button type="button" class="cls-btn ghost" data-a="no">ไว้ทีหลัง</button></div>`,
                { onClose: () => reject(new Error('CANCELLED')) });
            const $ = s => m.el.querySelector(s), err = $('.cls-err');
            rpc('list_rooms').then(rooms => {
                $('#cls-room').innerHTML = '<option value="">— เลือกห้อง —</option>' +
                    (rooms || []).map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
            }).catch(e => { err.textContent = errText(e); });
            const go = async () => {
                const room = $('#cls-room').value, no = parseInt($('#cls-no').value, 10), first = $('#cls-first').value.trim();
                if (!room || !no || !first) { err.textContent = 'กรอกให้ครบทั้ง ห้อง เลขที่ และชื่อจริง'; return; }
                $('[data-a=ok]').disabled = true; err.textContent = 'กำลังตรวจสอบ…';
                try {
                    const r = await rpc('verify_student', { p_room: room, p_no: no, p_first: first });
                    ls.set(TOKEN_KEY, r.token);
                    const info = Object.assign({}, r); delete info.token;
                    ls.set(ME_KEY, info);
                    m.el.parentNode.remove();
                    toast(`สวัสดี ${info.name} (เลขที่ ${info.no})`, 'ok');
                    emit('change', info);
                    resolve(info);
                } catch (e) { err.textContent = errText(e); $('[data-a=ok]').disabled = false; }
            };
            $('[data-a=ok]').addEventListener('click', go);
            $('#cls-first').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
            $('[data-a=no]').addEventListener('click', () => m.close());
        });
    }

    async function ensureStudent() {
        if (token()) { const m = await refreshMe(); if (m && token()) return m; }
        return verify();
    }

    /* ---------- ครู ---------- */
    let teacherCache;
    async function teacher() {
        if (!ready) return null;
        if (teacherCache !== undefined) return teacherCache;
        try {
            const { data } = await sb().auth.getSession();
            if (!data.session) return (teacherCache = null);
            const ok = await rpc('is_teacher');
            return (teacherCache = ok ? data.session.user : null);
        } catch (e) { return (teacherCache = null); }
    }
    const teacherLoginUrl = () => BASE + 'teacher.html?next=' + encodeURIComponent(location.href.split('#')[0]);

    /* วิชา/สัปดาห์จาก URL: /Devices-Electronic-Circuits-slides/w02/slides.html → lesson w02 */
    function lessonOf(path) {
        const m = (path || location.pathname).match(/\/((?:w|ch)\d+)\//);
        return m ? m[1] : '';
    }

    g.Classroom = {
        ready, sb, rpc, errText, esc, ls, on, emit,
        token, me, refreshMe, forget, verify, ensureStudent,
        teacher, teacherLoginUrl, modal, toast,
        base: BASE, course: g.CLASSROOM_COURSE || '', lessonOf
    };
})(window);
