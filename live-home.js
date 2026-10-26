/* ===========================================
   หน้าแรกของวิชา: ปุ่มเข้าห้องเรียนสด
   - ยืนยันตัวแล้ว + ครูเปิดคาบสดให้ห้องเรา → ขึ้นปุ่มแดง "กดเข้าห้องเรียน" เอง (ไม่ต้องพิมพ์อะไร)
   - ช่องพิมพ์รหัส 4 หลักจากจอครู (ทางสำรอง)
   ใส่ใน index.html: <div id="classroomHome"></div> (ถ้าไม่มี จะแทรกก่อนการ์ดแรกใน main)
   =========================================== */
(function () {
    'use strict';
    const C = window.Classroom;
    if (!C || !C.ready) return;
    const esc = C.esc;

    const host = document.getElementById('classroomHome') || (() => {
        const d = document.createElement('div');
        const main = document.querySelector('main') || document.body;
        main.insertBefore(d, main.firstElementChild);
        return d;
    })();
    host.className = 'card cls-home';

    const style = document.createElement('style');
    style.textContent = `
.cls-home{display:flex;flex-wrap:wrap;gap:12px 18px;align-items:center}
.cls-home .who{flex:1 1 260px}
.cls-home .who b{font-size:1.05em}
.cls-home .code{display:flex;gap:8px;align-items:center}
.cls-home .code input{width:6.5em;font:inherit;font-size:20px;letter-spacing:.25em;text-align:center;padding:8px 10px;border:2px solid #d9d2c3;border-radius:10px}
.cls-home .live-go{flex:1 1 100%;display:block;text-align:center;font-size:22px;font-weight:700;color:#fff;background:#d6455d;border:0;border-radius:14px;padding:16px;cursor:pointer;animation:cls-pulse 1.6s ease-in-out infinite;text-decoration:none}
@keyframes cls-pulse{0%,100%{box-shadow:0 0 0 0 rgba(214,69,93,.5)}50%{box-shadow:0 0 0 12px rgba(214,69,93,0)}}
.cls-home .link{background:none;border:0;color:#3b6fd4;text-decoration:underline;cursor:pointer;font:inherit;padding:0}`;
    document.head.appendChild(style);

    let live = null;

    function go(s) {
        location.href = s.page + (s.page.includes('?') ? '&' : '?') + 'live=' + encodeURIComponent(s.code);
    }

    function render() {
        const m = C.me();
        const who = m
            ? `<div class="who">📲 <b>${esc(m.name)}</b> · เลขที่ ${esc(m.no)} · ${esc(m.room)} · ⭐ ${esc(m.stars || 0)}
                 <button type="button" class="link" data-a="forget">ไม่ใช่ฉัน</button></div>`
            : `<div class="who">📲 <b>ห้องเรียนสด</b> — ยืนยันตัวครั้งแรกครั้งเดียว แล้วกดเข้าห้องเรียนได้ทันทีเมื่อครูเริ่มสอน
                 <div style="margin-top:8px"><button type="button" class="btn" data-a="verify">🙋 ยืนยันตัวนักเรียน</button></div></div>`;
        host.innerHTML = (live ? `<a class="live-go" href="#" data-a="live">🔴 ครูกำลังสอนสด — กดเข้าห้องเรียน</a>` : '') + who +
            `<div class="code"><label for="clsCode">รหัสจากจอครู</label>
               <input id="clsCode" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="____">
               <button type="button" class="btn orange" data-a="code">เข้า</button></div>`;
    }

    async function check() {
        if (!C.token()) { if (live) { live = null; render(); } return; }
        try {
            const s = await C.rpc('my_live_session', { p_token: C.token() });
            const changed = JSON.stringify(s) !== JSON.stringify(live);
            live = s; if (changed) render();
        } catch (e) { /* เงียบไว้ ลองใหม่รอบหน้า */ }
    }

    host.addEventListener('click', async e => {
        const b = e.target.closest('[data-a]'); if (!b) return;
        e.preventDefault();
        const a = b.dataset.a;
        try {
            if (a === 'verify') { await C.verify(); render(); check(); }
            else if (a === 'forget') { C.forget(); live = null; render(); }
            else if (a === 'live') go(live);
            else if (a === 'code') joinByCode();
        } catch (err) { if (err.message !== 'CANCELLED') C.toast(C.errText(err), 'bad'); }
    });
    host.addEventListener('keydown', e => { if (e.target.id === 'clsCode' && e.key === 'Enter') joinByCode(); });

    async function joinByCode() {
        const code = (document.getElementById('clsCode').value || '').replace(/\D/g, '');
        if (code.length !== 4) { C.toast('ใส่รหัส 4 หลักจากจอครู', 'bad'); return; }
        try {
            await C.ensureStudent();
            const s = await C.rpc('join_session', { p_code: code, p_token: C.token() });
            go(s);
        } catch (err) { if (err.message !== 'CANCELLED') C.toast(C.errText(err), 'bad'); }
    }

    render();
    C.refreshMe().then(render);
    check();
    setInterval(check, 10000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
})();
