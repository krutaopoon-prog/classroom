# ห้องเรียนสด (classroom)

ระบบกลางที่ทำให้สไลด์บทเรียนทุกวิชาโต้ตอบได้จากเครื่องนักเรียน และเก็บคะแนนแบบทดสอบก่อน/หลังเรียน
ใช้ Supabase โปรเจกต์ `uttc-classroom` (ap-southeast-1) · เว็บ: https://krutaopoon-prog.github.io/classroom/

## ไฟล์
| ไฟล์ | หน้าที่ |
|---|---|
| `identity.js` | แกนกลาง: เชื่อม Supabase, ยืนยันตัวนักเรียน (ห้อง → เลขที่ → ชื่อจริง), ตรวจสิทธิ์ครู, หน้าต่าง/แจ้งเตือน |
| `live.js` + `live.css` | สไลด์ 3 โหมด: ครู (เริ่มห้องสด ดาว อันดับ สุ่ม ถามด่วน ปากกา) · สด (เลื่อนตามครู) · ทบทวนเอง |
| `ink.js` | ปากกาบนสไลด์ และวาดคำตอบ (พิกัดเวที 1920×1080) |
| `live-home.js` | หน้าแรกวิชา: ปุ่ม "🔴 กดเข้าห้องเรียน" + ช่องรหัส 4 หลัก |
| `quiz-sync.js` | ส่งคะแนนแบบทดสอบเข้าระบบ (ตรวจที่เซิร์ฟเวอร์) · ส่งไม่ได้ → เก็บคิวไว้ส่งทีหลัง |
| `teacher.html` | แดชบอร์ดครู: รายชื่อห้อง · ก่อน/หลังเรียน · คาบสด · ทบทวนเอง · ดาว |
| `join.html` | หน้าพิมพ์รหัส 4 หลัก (ใช้ได้ทุกวิชา) |
| `config.js` | URL + anon key (เปิดเผยได้ — สิทธิ์คุมด้วย RLS) |
| `supabase/` | `config.toml` + `migrations/` (โครงสร้างตาราง ไม่มีเฉลย) |
| `_private/` | ไม่ขึ้น GitHub: `.env` (รหัสฐานข้อมูล, service role) และ `push-keys.mjs` |

## ต่อเข้ากับวิชา
1. คัดลอก `assets/js/classroom-loader.js` จากวิชาอุปกรณ์ฯ ไปไว้ที่ `assets/js/` ของวิชานั้น
2. สไลด์: ใส่ `data-course="รหัสวิชา"` ที่ `#deckStage` และหลัง `deck.js`
   `<script src="../assets/js/classroom-loader.js" data-course="dec" data-parts="identity,ink,live"></script>`
3. หน้าแรก: `<script src="assets/js/classroom-loader.js" data-course="dec" data-parts="identity,live-home"></script>`
4. แบบทดสอบ: loader `data-parts="identity,quiz-sync"` + เรียก `ClassroomQuiz.init` และ `ClassroomQuiz.submit` (ดู `w02/quiz.html` ของวิชาอุปกรณ์ฯ)
5. เฉลยแบบทดสอบใหม่: เพิ่มวิชาใน `_private/push-keys.mjs` แล้วรัน `node _private/push-keys.mjs`

กิจกรรมบนสไลด์: `.vote` เดิมใช้ได้ทันที · แบบใหม่ `<div class="live" data-kind="number|short|wordcloud|tf|draw|image" data-q="…" data-answer="…" data-tol="…" data-unit="…"></div>`

## งานดูแล
- ฐานข้อมูล: แก้ไฟล์ใน `supabase/migrations/` แล้ว `npx -y supabase@2.122.0 db push` (โหลดรหัสจาก `_private/.env`)
- `.github/workflows/keepalive.yml` เรียก `ping` ทุก 3 วัน กันโปรเจกต์ฟรีหยุดเมื่อไม่มีการใช้งาน 7 วัน
  (GitHub จะปิด workflow ตามเวลาเองถ้า repo ไม่มีความเคลื่อนไหว 60 วัน — เข้าไปกด Enable ในแท็บ Actions)
- ข้อมูลนักเรียนเป็นข้อมูลส่วนบุคคล: ครูวางรายชื่อเองในแดชบอร์ด อ่านได้เฉพาะครูที่ล็อกอิน
