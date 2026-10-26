-- ===========================================
-- ห้องเรียนสด + เก็บคะแนน (uttc-classroom)
-- ครู: ล็อกอิน (อีเมลอยู่ในตาราง teachers) เข้าถึงตารางได้ตรงผ่าน RLS
-- นักเรียน: ไม่ล็อกอิน ใช้ token ของเครื่องผ่านฟังก์ชัน security definer เท่านั้น
-- ===========================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- ครู ----------
create table public.teachers (email text primary key);
insert into public.teachers values ('krutaopoon@uttc.ac.th');

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
    select exists (select 1 from teachers where email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

-- ---------- ห้องและรายชื่อ (ครูวางเอง) ----------
create table public.rooms (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    created_at timestamptz not null default now()
);

create table public.students (
    id uuid primary key default gen_random_uuid(),
    room_id uuid not null references public.rooms on delete cascade,
    no int not null,
    name text not null,
    verify_fails int not null default 0,
    verify_fail_at timestamptz,
    unique (room_id, no)
);

create table public.devices (
    token uuid primary key default gen_random_uuid(),
    student_id uuid not null references public.students on delete cascade,
    join_fails int not null default 0,
    join_fail_at timestamptz,
    created_at timestamptz not null default now(),
    last_seen timestamptz not null default now()
);

-- ---------- คาบสด ----------
create table public.sessions (
    id uuid primary key default gen_random_uuid(),
    code text not null,
    course text not null,
    lesson text not null,
    room_id uuid not null references public.rooms on delete cascade,
    page text not null,                       -- URL ของสไลด์ (ไม่รวม hash)
    slide int not null default 0,
    step int not null default 0,
    unlocked boolean not null default false,
    created_at timestamptz not null default now(),
    ended_at timestamptz
);
create unique index sessions_open_code on public.sessions (code) where ended_at is null;

create table public.session_members (
    session_id uuid not null references public.sessions on delete cascade,
    student_id uuid not null references public.students on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (session_id, student_id)
);

-- ---------- กิจกรรมบนสไลด์ ----------
-- ref = course/lesson/<id หรือ data-title ของสไลด์>#<ลำดับกิจกรรมในสไลด์>
create table public.items (
    ref text primary key,
    course text not null,
    lesson text not null,
    kind text not null,                        -- mcq tf number short wordcloud draw image
    prompt text,
    options jsonb,
    updated_at timestamptz not null default now()
);

create table public.item_keys (
    ref text primary key,
    correct jsonb not null                     -- {"v":1} หรือ {"v":4.0,"tol":0.1}
);

create table public.item_state (
    session_id uuid not null references public.sessions on delete cascade,
    ref text not null,
    status text not null check (status in ('open', 'closed', 'revealed')),
    updated_at timestamptz not null default now(),
    primary key (session_id, ref)
);

create table public.answers (
    id bigint generated always as identity primary key,
    student_id uuid not null references public.students on delete cascade,
    ref text not null,
    session_id uuid references public.sessions on delete cascade,   -- null = ทบทวนเอง
    answer jsonb not null,
    correct boolean,
    hidden boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (student_id, ref, session_id)
);
create index answers_session on public.answers (session_id);

create table public.progress (
    student_id uuid not null references public.students on delete cascade,
    course text not null,
    lesson text not null,
    max_slide int not null default 0,
    total int not null default 0,
    seen int[] not null default '{}',
    updated_at timestamptz not null default now(),
    primary key (student_id, course, lesson)
);

create table public.stars (
    id bigint generated always as identity primary key,
    student_id uuid not null references public.students on delete cascade,
    session_id uuid references public.sessions on delete set null,
    course text,
    n int not null default 1,
    reason text,
    created_at timestamptz not null default now()
);

-- ---------- แบบทดสอบก่อนเรียน/หลังเรียน ----------
create table public.quiz_keys (
    course text not null,
    lesson text not null,
    qid text not null,
    correct int not null,
    primary key (course, lesson, qid)
);

create table public.quiz_attempts (
    id bigint generated always as identity primary key,
    course text not null,
    lesson text not null,
    mode text not null check (mode in ('pre', 'post')),
    student_id uuid not null references public.students on delete cascade,
    answers jsonb not null,
    score int not null,
    total int not null,
    marks jsonb not null,
    client_score int,
    started_at timestamptz,
    submitted_at timestamptz not null default now()
);
create index quiz_attempts_lookup on public.quiz_attempts (course, lesson, student_id);

-- ---------- RLS: ครูเท่านั้น (นักเรียนใช้ฟังก์ชันด้านล่าง) ----------
do $$
declare t text;
begin
    foreach t in array array['teachers','rooms','students','devices','sessions','session_members','items','item_keys',
                             'item_state','answers','progress','stars','quiz_keys','quiz_attempts'] loop
        execute format('alter table public.%I enable row level security', t);
        execute format('create policy teacher_all on public.%I for all to authenticated using (public.is_teacher()) with check (public.is_teacher())', t);
    end loop;
end $$;

-- จอครูรับคำตอบใหม่แบบสด (RLS กรองให้เห็นเฉพาะครู)
alter publication supabase_realtime add table public.answers, public.session_members;

-- ===========================================
-- ฟังก์ชันช่วย
-- ===========================================

-- ชื่อจริง: ตัดคำนำหน้าและช่องว่าง เอาคำแรก
create or replace function public.first_name(p text) returns text
language sql immutable set search_path = public as $$
    select split_part(
        regexp_replace(trim(coalesce(p, '')), '^(นางสาว|นาย|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|เด็กชาย|เด็กหญิง)\s*', ''),
        ' ', 1);
$$;

create or replace function public.device_student(p_token uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
    update devices set last_seen = now() where token = p_token returning student_id into sid;
    if sid is null then raise exception 'BAD_TOKEN'; end if;
    return sid;
end $$;

-- ตรวจคำตอบกิจกรรม (null = ไม่มีเฉลย หรือเป็นชนิดที่ไม่ตรวจ)
create or replace function public.grade_item(p_kind text, p_answer jsonb, p_key jsonb) returns boolean
language plpgsql immutable set search_path = public as $$
declare a numeric; k numeric; tol numeric;
begin
    if p_key is null or p_answer is null then return null; end if;
    if p_kind in ('mcq', 'tf') then
        return (p_answer ->> 'v') = (p_key ->> 'v');
    elsif p_kind = 'number' then
        begin
            a := (p_answer ->> 'v')::numeric; k := (p_key ->> 'v')::numeric;
        exception when others then return false;
        end;
        tol := coalesce((p_key ->> 'tol')::numeric, abs(k) * 0.02);
        return abs(a - k) <= tol;
    elsif p_kind = 'short' and p_key ? 'accept' then
        return exists (select 1 from jsonb_array_elements_text(p_key -> 'accept') x
                       where replace(lower(x), ' ', '') = replace(lower(p_answer ->> 'v'), ' ', ''));
    end if;
    return null;
end $$;

-- ===========================================
-- ฟังก์ชันสำหรับนักเรียน (anon)
-- ===========================================

create or replace function public.ping() returns text
language sql stable as $$ select 'ok'::text $$;

create or replace function public.list_rooms() returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
    select r.id, r.name from rooms r order by r.name;
$$;

create or replace function public.verify_student(p_room uuid, p_no int, p_first text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s students; tok uuid;
begin
    select * into s from students where room_id = p_room and no = p_no;
    if s.id is null then raise exception 'NOT_FOUND'; end if;
    if s.verify_fails >= 8 and s.verify_fail_at > now() - interval '10 minutes' then raise exception 'LOCKED'; end if;
    if replace(first_name(s.name), ' ', '') <> replace(first_name(p_first), ' ', '') or first_name(p_first) = '' then
        update students set verify_fails = case when verify_fail_at > now() - interval '10 minutes' then verify_fails + 1 else 1 end,
                            verify_fail_at = now() where id = s.id;
        raise exception 'NAME_MISMATCH';
    end if;
    update students set verify_fails = 0 where id = s.id;
    insert into devices (student_id) values (s.id) returning token into tok;
    return jsonb_build_object('token', tok) || public.me(tok);
end $$;

create or replace function public.me(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid; r jsonb;
begin
    sid := device_student(p_token);
    select jsonb_build_object('student_id', s.id, 'no', s.no, 'name', s.name, 'room', rm.name, 'room_id', rm.id,
                              'stars', coalesce((select sum(n) from stars where student_id = s.id), 0))
      into r from students s join rooms rm on rm.id = s.room_id where s.id = sid;
    return r;
end $$;

create or replace function public.session_info(p_session sessions) returns jsonb
language sql stable set search_path = public as $$
    select jsonb_build_object('code', p_session.code, 'course', p_session.course, 'lesson', p_session.lesson,
                              'page', p_session.page, 'slide', p_session.slide, 'step', p_session.step,
                              'unlocked', p_session.unlocked);
$$;

-- ปุ่ม "กดเข้าห้องเรียน": คาบสดที่เปิดอยู่ของห้องนักเรียน (ไม่เกิน 6 ชั่วโมง)
create or replace function public.my_live_session(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid; ss sessions;
begin
    sid := device_student(p_token);
    select se.* into ss from sessions se join students st on st.room_id = se.room_id
     where st.id = sid and se.ended_at is null and se.created_at > now() - interval '6 hours'
     order by se.created_at desc limit 1;
    if ss.id is null then return null; end if;
    return session_info(ss);
end $$;

create or replace function public.join_session(p_code text, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid; d devices; ss sessions;
begin
    sid := device_student(p_token);
    select * into d from devices where token = p_token;
    if d.join_fails >= 10 and d.join_fail_at > now() - interval '10 minutes' then raise exception 'LOCKED'; end if;
    select * into ss from sessions where code = trim(p_code) and ended_at is null and created_at > now() - interval '6 hours';
    if ss.id is null then
        update devices set join_fails = case when join_fail_at > now() - interval '10 minutes' then join_fails + 1 else 1 end,
                           join_fail_at = now() where token = p_token;
        raise exception 'BAD_CODE';
    end if;
    update devices set join_fails = 0 where token = p_token;
    insert into session_members (session_id, student_id) values (ss.id, sid) on conflict do nothing;
    return session_info(ss);
end $$;

-- สถานะคาบ + คำตอบของฉัน (ผลถูก/ผิดแสดงเฉพาะข้อที่ครูเฉลยแล้ว)
create or replace function public.session_state(p_code text, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid; ss sessions;
begin
    sid := device_student(p_token);
    select * into ss from sessions where code = trim(p_code) order by created_at desc limit 1;
    if ss.id is null then raise exception 'BAD_CODE'; end if;
    insert into session_members (session_id, student_id) values (ss.id, sid) on conflict do nothing;
    return session_info(ss) || jsonb_build_object(
        'ended', ss.ended_at is not null,
        'items', coalesce((select jsonb_object_agg(i.ref, jsonb_build_object('status', i.status, 'kind', it.kind,
                    'prompt', it.prompt, 'options', it.options))
                  from item_state i left join items it on it.ref = i.ref where i.session_id = ss.id), '{}'),
        'mine', coalesce((select jsonb_object_agg(a.ref, jsonb_build_object('answer', a.answer,
                    'correct', case when st.status = 'revealed' then a.correct end))
                  from answers a left join item_state st on st.session_id = a.session_id and st.ref = a.ref
                  where a.session_id = ss.id and a.student_id = sid), '{}'),
        'keys', coalesce((select jsonb_object_agg(k.ref, k.correct) from item_keys k
                  join item_state st on st.ref = k.ref and st.session_id = ss.id and st.status = 'revealed'), '{}'),
        'stars', coalesce((select sum(n) from stars where student_id = sid), 0));
end $$;

-- ส่งคำตอบ: p_code = null คือทบทวนเอง
create or replace function public.submit_answer(p_token uuid, p_ref text, p_kind text, p_answer jsonb, p_code text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid; ss sessions; st text; k jsonb; kind text; ok boolean;
begin
    sid := device_student(p_token);
    if length(p_answer::text) > 200000 then raise exception 'TOO_BIG'; end if;
    select coalesce(i.kind, p_kind) into kind from (select 1) x left join items i on i.ref = p_ref;
    select correct into k from item_keys where ref = p_ref;
    ok := grade_item(kind, p_answer, k);
    if p_code is not null then
        select * into ss from sessions where code = trim(p_code) and ended_at is null;
        if ss.id is null then raise exception 'BAD_CODE'; end if;
        if not exists (select 1 from students where id = sid and room_id = ss.room_id) then raise exception 'WRONG_ROOM'; end if;
        select status into st from item_state where session_id = ss.id and ref = p_ref;
        if st is distinct from 'open' then raise exception 'CLOSED'; end if;
        insert into session_members (session_id, student_id) values (ss.id, sid) on conflict do nothing;
        insert into answers (student_id, ref, session_id, answer, correct) values (sid, p_ref, ss.id, p_answer, ok)
        on conflict (student_id, ref, session_id) do update set answer = excluded.answer, correct = excluded.correct, updated_at = now();
        return jsonb_build_object('ok', true);
    end if;
    insert into answers (student_id, ref, session_id, answer, correct) values (sid, p_ref, null, p_answer, ok)
    on conflict (student_id, ref, session_id) do update set answer = excluded.answer, correct = excluded.correct, updated_at = now();
    return jsonb_build_object('ok', true, 'correct', ok, 'key', k);
end $$;

create or replace function public.save_progress(p_token uuid, p_course text, p_lesson text, p_slide int, p_total int) returns void
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
    sid := device_student(p_token);
    insert into progress (student_id, course, lesson, max_slide, total, seen)
    values (sid, p_course, p_lesson, p_slide, p_total, array[p_slide])
    on conflict (student_id, course, lesson) do update set
        max_slide = greatest(progress.max_slide, excluded.max_slide),
        total = excluded.total,
        seen = case when p_slide = any(progress.seen) then progress.seen else progress.seen || p_slide end,
        updated_at = now();
end $$;

-- แบบทดสอบ: ตรวจที่เซิร์ฟเวอร์ด้วย quiz_keys (p_answers = {"q1": 2, ...} ลำดับตัวเลือกเดิม 0 = ก)
create or replace function public.submit_quiz(p_token uuid, p_course text, p_lesson text, p_mode text, p_answers jsonb,
                                              p_started timestamptz default null, p_client_score int default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid uuid; sc int := 0; tot int := 0; mk jsonb := '{}'; r record; att int;
begin
    sid := device_student(p_token);
    if p_mode not in ('pre', 'post') then raise exception 'BAD_MODE'; end if;
    for r in select qid, correct from quiz_keys where course = p_course and lesson = p_lesson loop
        tot := tot + 1;
        if p_answers ? r.qid and (p_answers ->> r.qid)::int = r.correct then
            sc := sc + 1; mk := mk || jsonb_build_object(r.qid, '✓');
        elsif p_answers ? r.qid then mk := mk || jsonb_build_object(r.qid, '✗');
        else mk := mk || jsonb_build_object(r.qid, '–');
        end if;
    end loop;
    if tot = 0 then raise exception 'NO_KEYS'; end if;
    insert into quiz_attempts (course, lesson, mode, student_id, answers, score, total, marks, client_score, started_at)
    values (p_course, p_lesson, p_mode, sid, p_answers, sc, tot, mk, p_client_score, p_started);
    select count(*) into att from quiz_attempts where course = p_course and lesson = p_lesson and student_id = sid and mode = p_mode;
    return jsonb_build_object('score', sc, 'total', tot, 'marks', mk, 'attempt', att,
        'pre', (select score from quiz_attempts where course = p_course and lesson = p_lesson and student_id = sid and mode = 'pre' order by submitted_at desc limit 1),
        'post', (select score from quiz_attempts where course = p_course and lesson = p_lesson and student_id = sid and mode = 'post' order by submitted_at desc limit 1));
end $$;

-- ===========================================
-- ฟังก์ชันสำหรับครู
-- ===========================================

-- เริ่มคาบสด: ปิดคาบเดิมของห้องนี้ แล้วสุ่มรหัส 4 หลักที่ไม่ซ้ำกับคาบที่เปิดอยู่
create or replace function public.start_session(p_course text, p_lesson text, p_room uuid, p_page text) returns public.sessions
language plpgsql security definer set search_path = public as $$
declare c text; ss sessions; n int := 0;
begin
    if not is_teacher() then raise exception 'NOT_TEACHER'; end if;
    update sessions set ended_at = now() where room_id = p_room and ended_at is null;
    update sessions set ended_at = now() where ended_at is null and created_at < now() - interval '6 hours';
    loop
        c := lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
        exit when not exists (select 1 from sessions where code = c and ended_at is null);
        n := n + 1; if n > 50 then raise exception 'NO_CODE'; end if;
    end loop;
    insert into sessions (code, course, lesson, room_id, page) values (c, p_course, p_lesson, p_room, p_page) returning * into ss;
    return ss;
end $$;

-- ===========================================
-- สิทธิ์เรียกฟังก์ชัน
-- ===========================================
revoke execute on all functions in schema public from public, anon;
grant execute on function public.ping(), public.list_rooms(), public.verify_student(uuid, int, text), public.me(uuid),
    public.my_live_session(uuid), public.join_session(text, uuid), public.session_state(text, uuid),
    public.submit_answer(uuid, text, text, jsonb, text), public.save_progress(uuid, text, text, int, int),
    public.submit_quiz(uuid, text, text, text, jsonb, timestamptz, int)
    to anon, authenticated;
grant execute on function public.is_teacher(), public.start_session(text, text, uuid, text) to authenticated;
-- ฟังก์ชันช่วยภายใน (device_student, grade_item, first_name, session_info) ไม่เปิดให้เรียกจากภายนอก

-- ===========================================
-- Storage: รูปที่นักเรียนส่ง (ชนิด image)
-- ===========================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('live-uploads', 'live-uploads', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy live_upload_insert on storage.objects for insert to anon, authenticated
    with check (bucket_id = 'live-uploads');
create policy live_upload_teacher on storage.objects for select to authenticated
    using (bucket_id = 'live-uploads' and public.is_teacher());
