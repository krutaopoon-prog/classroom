# SKILL.md — WBI Electronics Teacher (GitHub Pages)

## Project Overview
A WBI (Web-Based Instruction) website for an electronics vocational teacher.
- Static site hosted on GitHub Pages (pure HTML + CSS + JS, no backend)
- No frameworks (no React, Vue, or npm)
- All CSS lives in a single file: `assets/style.css`
- Shared JS lives in: `assets/main.js`

---

## Folder Structure (do not change)

```
my-electronics-wbi/          ← repo root
├── SKILL.md                 ← this file (AI reads before every task)
├── index.html               ← home page: subject selection cards
├── assets/
│   ├── style.css            ← global styles (edit only this file)
│   └── main.js              ← shared functions: quiz engine, navigation
├── subjects/
│   └── [subject-id]/        ← e.g. electronics1
│       ├── index.html       ← subject page: chapter list
│       └── chapter[N]/      ← e.g. chapter1
│           ├── index.html   ← lesson content
│           ├── quiz.html    ← quiz (every chapter)
│           └── sim.html     ← simulation (only when applicable)
└── simulations/             ← shared simulations across subjects (if any)
```

### Naming Rules
- **subject-id**: lowercase, hyphens only — e.g. `electronics1`, `digital-circuit`, `power-supply`
- **chapter folders**: `chapter1`, `chapter2`, ... (no leading zeros)
- **No Thai characters in file or folder names**

---

## URL Pattern (GitHub Pages)

```
https://[username].github.io/[repo]/                                      → home
https://[username].github.io/[repo]/subjects/electronics1/                → subject
https://[username].github.io/[repo]/subjects/electronics1/chapter1/       → lesson
https://[username].github.io/[repo]/subjects/electronics1/chapter1/quiz.html
https://[username].github.io/[repo]/subjects/electronics1/chapter1/sim.html
```

---

## Subjects in the System (update when adding a new subject)

| subject-id | Thai name | Chapters |
|---|---|---|
| electronics1 | อิเล็กทรอนิกส์เบื้องต้น | — |
| digital-circuit | วงจรดิจิทัล | — |

*(add a row each time a new subject is created)*

---

## Page Templates

### 1. Home page — index.html (root)
- Displays subject cards; clicking a card navigates to that subject
- Each card shows: subject name, short description, chapter count, icon
- Layout: CSS Grid, responsive (1 col mobile / 3 col desktop)
- No login, no database

### 2. Subject page — subjects/[id]/index.html
- Breadcrumb: Home > Subject Name
- Chapter list as cards or a list
- Each chapter shows: title, quiz status (if attempted), links to lesson and quiz

### 3. Lesson page — chapter[N]/index.html
- **Required sections (all must be present)**:
  ```
  [Breadcrumb] Home > Subject > Chapter N
  [Chapter title + description]
  [Learning objectives] — bullet list
  [Content] — divided into sections with h2/h3 headings
  [Summary]
  [Navigation bar] ← Previous | Back to Subject | Next →
  [Button] Go to Quiz
  ```
- Supports: images, tables, math formulas (use MathJax CDN if needed)
- If the chapter has sim.html, include a "Try Simulation" button

### 4. Quiz page — chapter[N]/quiz.html
- **Default**: 10 questions (adjustable per instruction)
- **Format**: multiple choice, 4 options each
- **Required features**:
  - Show one question at a time
  - After answering: show correct/incorrect + explanation
  - Score summary at the end (N/10)
  - Save score with localStorage (key: `quiz_[subject]_ch[N]`)
  - Buttons: Back to Lesson, Retry

### 5. Simulation page — chapter[N]/sim.html
- **Only create when explicitly requested** — not automatic for every chapter
- Pure HTML Canvas or SVG + JS (no external libraries)
- Must work fully offline
- Always include a "Back to Lesson" button
- **Suitable simulation types for this subject**:
  - Voltage Divider: sliders for R1, R2 → shows Vout
  - RC Circuit: sliders for R, C → shows time constant and graph
  - Logic Gate: toggle inputs → shows output
  - Transistor Bias: sliders for Vcc, Rb → shows Q-point

---

## CSS Design System (assets/style.css)

```css
/* Colors */
--primary:       #1a56a0;   /* dark blue */
--primary-light: #e8f0fb;
--accent:        #e67e22;   /* orange — main buttons */
--success:       #27ae60;
--danger:        #e74c3c;
--text-main:     #2c3e50;
--text-muted:    #7f8c8d;
--bg:            #f5f7fa;
--card-bg:       #ffffff;

/* Fonts */
'Sarabun', sans-serif   /* Thai text */
'Roboto', sans-serif    /* English / numbers */
/* Load both from Google Fonts CDN */

/* Breakpoint */
--mobile: 768px
```

---

## HTML Conventions

1. Every page must have `<meta charset="UTF-8">` and `<meta name="viewport" ...>`
2. Link CSS: `<link rel="stylesheet" href="../../assets/style.css">` (adjust path depth)
3. Link JS: `<script src="../../assets/main.js"></script>` before `</body>`
4. **Language**: content in Thai, all tag/id/class names in English
5. **No inline styles** — put everything in style.css
6. Subject cards and chapter cards always use class `card`

---

## AI Workflow

### When asked to create a new chapter — do in this order:
1. Read this SKILL.md first
2. Check whether the subject folder already exists
3. Create `subjects/[id]/chapter[N]/index.html`
4. Create `subjects/[id]/chapter[N]/quiz.html`
5. Update `subjects/[id]/index.html` to link to the new chapter
6. If simulation requested → create `subjects/[id]/chapter[N]/sim.html`
7. Report every file created or modified

### When asked to create a new subject — do in this order:
1. Create folder `subjects/[subject-id]/`
2. Create `subjects/[subject-id]/index.html`
3. Update root `index.html` to add a new subject card
4. Add a row to the "Subjects in the System" table in this SKILL.md

---

## What AI Must NOT Do
- ❌ Use React, Vue, Angular, or any JS framework
- ❌ Use npm or node_modules
- ❌ Create separate CSS files outside `assets/style.css`
- ❌ Use Thai characters in file or folder names
- ❌ Change the folder structure without asking first
- ❌ Use external libraries in sim.html (MathJax for formulas is the only exception)

---

## How to Use This File

**Save to**: `my-electronics-wbi/SKILL.md` (repo root)

**When prompting Claude (web chat):**
Attach SKILL.md to the conversation and start with:
> "Read SKILL.md first, then create chapter 2 for electronics1 on the topic of transistors..."

**When using Cursor or Windsurf:**
Place SKILL.md in the project root — the AI reads it automatically. No need to attach it each time.

**When using Claude Code (terminal):**
Start your prompt with:
> "read SKILL.md then..."
