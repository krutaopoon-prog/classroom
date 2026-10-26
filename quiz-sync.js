/* ===========================================
   ClassroomQuiz — ส่งคะแนนแบบทดสอบก่อนเรียน/หลังเรียนเข้าระบบ
   - init({ name, room, no }) : ใส่ id ของช่องชื่อ/ชั้น/เลขที่ในหน้า → เติมให้อัตโนมัติเมื่อยืนยันตัวแล้ว
   - submit({ course, lesson, mode, answers, startedAt, clientScore }) → Promise
       ผล { ok:true, score, total, marks, pre, post } | { ok:false, queued:true } | { ok:false, reason }
   ตรวจคะแนนที่เซิร์ฟเวอร์ (ฟังก์ชัน submit_quiz) · ส่งไม่ได้ → เก็บคิวในเครื่องแล้วส่งใหม่เมื่อเปิดหน้าครั้งถัดไป
   =========================================== */
(function () {
    'use strict';
    const C = window.Classroom;
    const QKEY = 'uttc-cls-quiz-queue';

    function fill(ids) {
        const m = C && C.me();
        const box = document.getElementById('clsQuizWho');
        if (!ids) return;
        const set = (id, v, lock) => { const el = document.getElementById(id); if (el) { if (v != null) el.value = v; el.readOnly = lock; } };
        if (m) {
            set(ids.name, m.name, true); set(ids.room, m.room, true); set(ids.no, m.no, true);
            if (box) box.innerHTML = `✅ ยืนยันตัวแล้ว คะแนนจะส่งเข้าระบบให้ครูอัตโนมัติ · <button type="button" class="btn ghost small" data-a="forget">ไม่ใช่ฉัน</button>`;
        } else {
            set(ids.name, null, false); set(ids.room, null, false); set(ids.no, null, false);
            if (box) box.innerHTML = `<button type="button" class="btn small" data-a="verify">🙋 ยืนยันตัวนักเรียน</button> <span class="muted">เพื่อส่งคะแนนเข้าระบบให้ครูอัตโนมัติ</span>`;
        }
    }

    async function flush() {
        if (!C || !C.ready || !C.token()) return;
        const q = C.ls.get(QKEY, []);
        if (!q.length) return;
        const rest = [];
        for (const p of q) {
            if (p.token !== C.token()) { rest.push(p); continue; }
            try { await C.rpc('submit_quiz', p.args); }
            catch (e) { if (/fetch|network|Failed/i.test(e.message)) rest.push(p); }
        }
        C.ls.set(QKEY, rest);
        if (q.length !== rest.length && C.toast) C.toast(`ส่งคะแนนที่ค้างไว้เข้าระบบแล้ว ${q.length - rest.length} ครั้ง`, 'ok');
    }

    window.ClassroomQuiz = {
        init(ids) {
            if (!C || !C.ready) return;
            const who = document.querySelector('.who');
            if (who && !document.getElementById('clsQuizWho')) {
                const d = document.createElement('div');
                d.id = 'clsQuizWho';
                d.style.cssText = 'margin:8px 0 4px;font-size:15px';
                who.parentNode.insertBefore(d, who);
                d.addEventListener('click', async e => {
                    const b = e.target.closest('[data-a]'); if (!b) return;
                    if (b.dataset.a === 'verify') { try { await C.verify(); } catch (err) { /* ยกเลิก */ } }
                    else C.forget();
                    fill(ids);
                });
            }
            fill(ids);
            C.refreshMe().then(() => fill(ids));
            flush();
        },
        async submit(p) {
            if (!C || !C.ready) return { ok: false, reason: 'ระบบห้องเรียนออฟไลน์ — ใช้ใบคะแนนแบบพิมพ์ส่งครู' };
            if (!C.token()) {
                try { await C.verify(); } catch (e) { return { ok: false, reason: 'ยังไม่ได้ยืนยันตัว คะแนนจึงไม่ได้ส่งเข้าระบบ (พิมพ์ใบคะแนนส่งครูแทน)' }; }
            }
            const args = {
                p_token: C.token(), p_course: p.course, p_lesson: p.lesson, p_mode: p.mode, p_answers: p.answers,
                p_started: p.startedAt ? new Date(p.startedAt).toISOString() : null, p_client_score: p.clientScore
            };
            try {
                const r = await C.rpc('submit_quiz', args);
                return Object.assign({ ok: true }, r);
            } catch (e) {
                if (/fetch|network|Failed|OFFLINE/i.test(e.message)) {
                    const q = C.ls.get(QKEY, []); q.push({ token: C.token(), args, at: Date.now() }); C.ls.set(QKEY, q);
                    return { ok: false, queued: true, reason: 'อินเทอร์เน็ตขัดข้อง เก็บคะแนนไว้ในเครื่องแล้ว จะส่งให้เองเมื่อเปิดหน้านี้ครั้งถัดไป' };
                }
                return { ok: false, reason: C.errText(e) };
            }
        }
    };
})();
