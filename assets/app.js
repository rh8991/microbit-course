// Loads data/schedule.yml + data/lessons.yml (+ data/teacher.yml) and renders the page named in <body data-page="...">.

const LEVELS = { beginner: "מתחילים", intermediate: "בינוני", advanced: "מתקדם" };
const SOURCES = { microbit: "micro:bit", tinybit: "Tiny:bit", project: "פרויקט" };
const MICROBIT_PROJECT = /^https:\/\/microbit\.org\/projects\/make-it-code-it\/([^/]+)\/?$/;

async function loadYaml(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`לא הצלחתי לטעון את ${path}`);
  return jsyaml.load(await res.text());
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Light formatting for text in the YAML: **bold** and [[block name]].
function fmt(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[\[(.+?)\]\]/g, '<span class="block-name">$1</span>');
}

function list(items, ordered = false) {
  if (!items || !items.length) return "";
  const tag = ordered ? "ol" : "ul";
  return `<${tag}>${items.map((i) => `<li>${fmt(i)}</li>`).join("")}</${tag}>`;
}

function linkList(items) {
  if (!items || !items.length) return "";
  return `<ul class="link-list">${items
    .map((i) => `<li><a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.title)} ↗</a>${i.note ? ` <span class="muted">– ${esc(i.note)}</span>` : ""}</li>`)
    .join("")}</ul>`;
}

function tags(lesson) {
  const out = [`<span class="tag src-${lesson.source}">${SOURCES[lesson.source] || lesson.source}</span>`];
  if (lesson.level) out.push(`<span class="tag level-${lesson.level}">${LEVELS[lesson.level] || lesson.level}</span>`);
  if (lesson.needs_v2) out.push(`<span class="tag v2">דורש micro:bit V2</span>`);
  return out.join("");
}

function warn(container, messages) {
  if (!messages.length) return;
  const div = document.createElement("div");
  div.className = "warning";
  div.innerHTML = `<strong>שימו לב – יש בעיה בקובץ הנתונים:</strong>${list(messages)}`;
  container.prepend(div);
}

// ---------- Progress (saved only in this browser) ----------

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};
const doneSet = () => new Set(store.get("mb-done", []));
function setDone(id, on) {
  const s = doneSet();
  on ? s.add(id) : s.delete(id);
  store.set("mb-done", [...s]);
}

// ---------- Data ----------

async function loadAll() {
  const [schedule, lessonsData, teacher] = await Promise.all([
    loadYaml("data/schedule.yml"),
    loadYaml("data/lessons.yml"),
    loadYaml("data/teacher.yml").catch(() => ({})),
  ]);
  const lessons = {};
  for (const l of lessonsData.lessons || []) lessons[l.id] = l;
  const problems = [];
  const sessions = schedule.sessions || [];
  // Course order: every scheduled lesson, in session order.
  const order = [];
  const sessionOf = {};
  for (const s of sessions) {
    for (const id of s.lessons || []) {
      if (!lessons[id]) {
        problems.push(`במפגש ${s.num} מופיע שיעור "${id}" שלא קיים ב-lessons.yml`);
        continue;
      }
      order.push(id);
      sessionOf[id] = s;
    }
  }
  const plans = teacher?.plans || [];
  const plansOf = {};
  for (const p of plans) {
    for (const id of p.lessons || []) {
      if (!lessons[id]) problems.push(`במערך שיעור ${p.num} מופיע שיעור "${id}" שלא קיים ב-lessons.yml`);
      (plansOf[id] ||= []).push(p);
    }
  }
  return { schedule, lessons, problems, order, sessionOf, plans, plansOf, usefulLinks: teacher?.useful_links || [] };
}

function lessonUrl(id, view) {
  return `lesson.html?id=${encodeURIComponent(id)}&view=${view}`;
}

// MakeCode: a share link opens the ready-made code; otherwise just the editor.
function makecodeLink(l) {
  const url = l.links?.makecode;
  const isShare = !!url && /(#pub:|makecode\.microbit\.org\/_)/.test(url);
  return { url: url || "https://makecode.microbit.org/", isShare };
}

// hex files: explicit links.hex (string or list), or derived from a microbit.org project page.
function hexFiles(l) {
  const hex = l.links?.hex;
  if (hex === "none") return [];
  if (typeof hex === "string") return [{ title: "", url: hex }];
  if (Array.isArray(hex)) return hex.filter((h) => h?.url);
  const m = MICROBIT_PROJECT.exec(l.links?.source || "");
  return m ? [{ title: "", url: `https://downloads.microbit.org/downloads/${m[1]}-makecode.hex` }] : [];
}

function fileName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop()) || "microbit.hex";
  } catch {
    return "microbit.hex";
  }
}

// GitHub serves .hex as text, so the browser would show it instead of saving it:
// fetch it and save it as a file. Other hosts already send it as a download.
function setupHexDownloads() {
  document.addEventListener("click", async (e) => {
    const a = e.target.closest("a[data-fetch-hex]");
    if (!a) return;
    e.preventDefault();
    try {
      const res = await fetch(a.href);
      if (!res.ok) throw new Error();
      const blobUrl = URL.createObjectURL(await res.blob());
      const tmp = Object.assign(document.createElement("a"), { href: blobUrl, download: fileName(a.href) });
      document.body.append(tmp);
      tmp.click();
      tmp.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    } catch {
      location.href = a.href;
    }
  });
}

function hexButton(h, label) {
  const fetchIt = /^https:\/\/raw\.githubusercontent\.com\//.test(h.url) ? " data-fetch-hex" : "";
  return `<a class="btn hex" href="${esc(h.url)}" download="${esc(fileName(h.url))}"${fetchIt}>⬇️ ${esc(label)}</a>`;
}

// ---------- Search ----------

function norm(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "") // Hebrew vowel marks
    .replace(/[׳']/g, "'")
    .replace(/[״"]/g, '"');
}

function lessonText(l, data, view) {
  const st = l.student || {};
  const parts = [l.title, l.id, l.summary, SOURCES[l.source], LEVELS[l.level], ...(l.concepts || [])];
  parts.push(st.intro, st.goal, st.concept, st.tip, st.challenge, ...(st.steps || []));
  const s = data.sessionOf[l.id];
  if (s) parts.push(`מפגש ${s.num}`, s.title);
  if (view === "guide") {
    const g = l.guide || {};
    parts.push(g.prep, g.extension, ...(g.objectives || []), ...(g.flow || []), ...(g.materials || []));
    for (const p of data.plansOf[l.id] || []) parts.push(p.title, `מערך ${p.num}`, p.summary, ...(p.goals || []), ...(p.flow || []), ...(p.materials || []));
  }
  return norm(parts.filter(Boolean).join(" "));
}

function searchLessons(data, view, query) {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const pool = Object.values(data.lessons).filter((l) => view === "guide" || data.sessionOf[l.id]);
  return pool
    .map((l) => {
      const text = lessonText(l, data, view);
      if (!terms.every((t) => text.includes(t))) return null;
      const title = norm(l.title);
      const score = terms.reduce((n, t) => n + (title.includes(t) ? 10 : 0) + ((l.concepts || []).some((c) => norm(c).includes(t)) ? 3 : 0), 0);
      return { l, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (data.order.indexOf(a.l.id) + 1 || 999) - (data.order.indexOf(b.l.id) + 1 || 999))
    .map((r) => r.l);
}

function highlight(text, query) {
  let html = esc(text);
  for (const t of query.trim().split(/\s+/).filter((t) => t.length > 1)) {
    const re = new RegExp(`(${esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    html = html.replace(re, "<mark>$1</mark>");
  }
  return html;
}

function setupSearch(main, data, view) {
  const input = main.querySelector("#q");
  const results = main.querySelector("#results");
  const browse = main.querySelector("#browse");
  if (!input) return;
  function draw() {
    const q = input.value;
    if (!q.trim()) {
      results.hidden = true;
      browse.hidden = false;
      return;
    }
    const found = searchLessons(data, view, q);
    const done = doneSet();
    results.innerHTML =
      `<p class="result-count">${found.length ? `נמצאו ${found.length} שיעורים` : "לא נמצאו שיעורים. נסו מילה אחרת – למשל: לב, רדיו, מנועים, חיישן."}</p>` +
      `<div class="results">${found
        .map((l) => {
          const s = data.sessionOf[l.id];
          return `<a class="result" href="${lessonUrl(l.id, view)}">
            <span class="where">${s ? `מפגש ${esc(s.num)} · ${esc(s.title)}` : "מאגר שיעורים נוסף"}</span>
            <strong>${done.has(l.id) ? "✅ " : ""}${highlight(l.title, q)}</strong>
            <span class="tags">${tags(l)}</span>
            ${l.summary || l.student?.goal ? `<span class="muted">${highlight(l.summary || l.student.goal, q)}</span>` : ""}
          </a>`;
        })
        .join("")}</div>`;
    results.hidden = false;
    browse.hidden = true;
  }
  input.addEventListener("input", draw);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      input.value = "";
      draw();
    }
  });
  const initial = new URLSearchParams(location.search).get("q");
  if (initial) input.value = initial;
  draw();
}

// ---------- Session list (student + guide) ----------

function renderContinue(main, data, view) {
  const el = main.querySelector("#continue");
  if (!el) return;
  const done = doneSet();
  const total = data.order.length;
  const count = data.order.filter((id) => done.has(id)).length;
  const next = data.order.find((id) => !done.has(id));
  const last = store.get(`mb-last-${view}`, null);
  const target = last && data.lessons[last] && !done.has(last) ? last : next;
  if (view === "guide") {
    el.innerHTML = target && last
      ? `<div class="continue"><span>השיעור האחרון שפתחתם:</span> <a class="btn" href="${lessonUrl(last, view)}">${esc(data.lessons[last]?.title || "")} ←</a></div>`
      : "";
    return;
  }
  const s = target && data.sessionOf[target];
  el.innerHTML = `<div class="continue">
      <div class="progress-wrap">
        <div class="progress-label">סיימתם <strong>${count}</strong> מתוך ${total} שיעורים</div>
        <div class="progress"><span style="width:${total ? Math.round((count / total) * 100) : 0}%"></span></div>
      </div>
      ${
        target
          ? `<a class="btn" href="${lessonUrl(target, view)}">${count || last ? "להמשיך" : "להתחיל"}: מפגש ${esc(s?.num)} – ${esc(data.lessons[target].title)} ←</a>`
          : `<span class="done-all">🎉 סיימתם את כל השיעורים!</span>`
      }
    </div>`;
}

function renderSessions(main, data, view) {
  const { schedule, lessons, plansOf } = data;
  const done = doneSet();
  let html = `<nav class="jump" aria-label="קפיצה למפגש">${(schedule.sessions || [])
    .map((s) => `<a href="#s${esc(s.num)}" class="jump-${esc(s.part)}">${esc(s.num)}</a>`)
    .join("")}</nav>`;
  for (const part of schedule.parts || []) {
    const sessions = (schedule.sessions || []).filter((s) => s.part === part.id);
    if (!sessions.length) continue;
    html += `<section class="part-${esc(part.id)}">
      <h2 class="part-title"><span class="dot"></span>${esc(part.title)}</h2>
      ${part.description ? `<p class="part-desc">${fmt(part.description)}</p>` : ""}
      <div class="sessions">`;
    for (const s of sessions) {
      const ids = (s.lessons || []).filter((id) => lessons[id]);
      const items = ids
        .map((id, i) => {
          const isDone = view === "student" && done.has(id);
          return `<li><a href="${lessonUrl(id, view)}" class="${isDone ? "is-done" : ""}">
            <span class="step-num">${isDone ? "✓" : i + 1}</span>${esc(lessons[id].title)}</a></li>`;
        })
        .join("");
      const finished = ids.filter((id) => done.has(id)).length;
      const note = view === "guide" ? s.guide_note : s.student_note;
      const plans = view === "guide" ? [...new Map(ids.flatMap((id) => plansOf[id] || []).map((p) => [p.num, p])).values()] : [];
      html += `<article class="session${view === "student" && ids.length && finished === ids.length ? " complete" : ""}" id="s${esc(s.num)}">
        <div class="session-top">
          <div class="num">מפגש ${esc(s.num)}</div>
          ${view === "student" && ids.length ? `<span class="session-progress">${finished}/${ids.length}</span>` : ""}
        </div>
        <h3>${esc(s.title)}</h3>
        ${note ? `<div class="note">${fmt(note)}</div>` : ""}
        ${items ? `<ol class="session-lessons">${items}</ol>` : ""}
        ${plans.map((p) => `<a class="plan-chip" href="#plan-${esc(p.num)}" data-open-plan="${esc(p.num)}">📁 מערך שיעור ${esc(p.num)}: ${esc(p.title)}</a>`).join("")}
      </article>`;
    }
    html += `</div></section>`;
  }
  main.querySelector("#sessions").innerHTML = html;
}

// ---------- Guide-only tabs ----------

function renderBank(main, { schedule, lessons }) {
  const scheduled = new Set((schedule.sessions || []).flatMap((s) => s.lessons || []));
  const bank = Object.values(lessons).filter((l) => !scheduled.has(l.id));
  const el = main.querySelector("#bank");
  const src = main.querySelector("#f-source");
  const lvl = main.querySelector("#f-level");

  function draw() {
    const shown = bank.filter((l) => (!src.value || l.source === src.value) && (!lvl.value || l.level === lvl.value));
    el.innerHTML = shown.length
      ? shown
          .map(
            (l) => `<div class="bank-item">
              <h3><a href="${lessonUrl(l.id, "guide")}">${esc(l.title)}</a></h3>
              <div class="tags">${tags(l)}</div>
              <p>${fmt(l.summary || l.student?.goal || "")}</p>
            </div>`
          )
          .join("")
      : "<p>לא נמצאו שיעורים.</p>";
    main.querySelector("#bank-count").textContent = `${shown.length} שיעורים`;
  }
  [src, lvl].forEach((x) => x.addEventListener("input", draw));
  draw();
}

function planBody(p, lessons, view = "guide") {
  const related = (p.lessons || []).filter((id) => lessons[id]);
  return `
    ${p.summary ? `<p>${fmt(p.summary)}</p>` : ""}
    <div class="links">
      ${p.doc ? `<a class="btn" href="${esc(p.doc)}" target="_blank" rel="noopener">📄 מסמך המערך ↗</a>` : ""}
      ${p.folder ? `<a class="btn secondary" href="${esc(p.folder)}" target="_blank" rel="noopener">📁 תיקיית Drive ↗</a>` : ""}
      ${(p.files || []).map((f) => hexButton(f, f.title)).join("")}
    </div>
    ${related.length ? `<h4>שיעורים באתר</h4><ul class="link-list">${related.map((id) => `<li><a href="${lessonUrl(id, view)}">${esc(lessons[id].title)}</a></li>`).join("")}</ul>` : ""}
    ${p.goals?.length ? `<h4>מטרות</h4>${list(p.goals)}` : ""}
    ${p.flow?.length ? `<h4>מהלך השיעור</h4>${list(p.flow, true)}` : ""}
    ${p.materials?.length ? `<h4>ציוד</h4>${list(p.materials)}` : ""}
    ${p.notes?.length ? `<h4>דגשים למדריך</h4>${list(p.notes)}` : ""}
    ${p.links?.length ? `<h4>קישורים</h4>${linkList(p.links)}` : ""}`;
}

function renderPlans(main, { plans, lessons }) {
  const el = main.querySelector("#plans");
  if (!el) return;
  el.innerHTML = plans.length
    ? plans
        .map(
          (p) => `<details class="plan" id="plan-${esc(p.num)}">
            <summary><span class="plan-num">${esc(p.num)}</span><span class="plan-title">${esc(p.title)}</span></summary>
            <div class="plan-body">${planBody(p, lessons)}</div>
          </details>`
        )
        .join("")
    : "<p>אין מערכי שיעור.</p>";
}

function renderUsefulLinks(main, { usefulLinks }) {
  const el = main.querySelector("#useful");
  if (!el) return;
  el.innerHTML = usefulLinks
    .map((g) => `<div class="box"><h2>${esc(g.group)}</h2>${linkList(g.items)}</div>`)
    .join("");
}

function setupTabs(main) {
  const buttons = [...main.querySelectorAll(".tabs button")];
  const show = (tab) => {
    buttons.forEach((x) => {
      x.setAttribute("aria-selected", x.dataset.tab === tab ? "true" : "false");
      document.getElementById(x.dataset.tab).hidden = x.dataset.tab !== tab;
    });
    store.set("mb-guide-tab", tab);
  };
  buttons.forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
  // Session cards link straight to their plan.
  main.addEventListener("click", (e) => {
    const chip = e.target.closest("[data-open-plan]");
    if (!chip) return;
    e.preventDefault();
    show("tab-plans");
    const d = document.getElementById(`plan-${chip.dataset.openPlan}`);
    if (d) {
      d.open = true;
      d.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
  const hash = location.hash.slice(1);
  if (hash.startsWith("plan-")) {
    show("tab-plans");
    const d = document.getElementById(hash);
    if (d) {
      d.open = true;
      d.scrollIntoView();
    }
  } else {
    const saved = store.get("mb-guide-tab", null);
    if (saved && document.getElementById(saved)) show(saved);
  }
}

// ---------- Lesson page ----------

function renderLesson(main, data) {
  const { lessons, order, sessionOf, plansOf } = data;
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const view = params.get("view") === "guide" ? "guide" : "student";
  const l = lessons[id];
  const listPage = view === "guide" ? "guide.html" : "student.html";
  if (!l) {
    main.innerHTML = `<p>השיעור לא נמצא. <a href="${listPage}">חזרה לרשימת המפגשים</a></p>`;
    return;
  }
  store.set(`mb-last-${view}`, id);
  document.title = `${l.title} | מיקרוביט – טכנודע`;
  document.querySelector(".site-header nav").innerHTML =
    `<a href="index.html">דף הבית</a><a href="${listPage}">${view === "guide" ? "דף המדריך" : "כל המפגשים"}</a>`;

  const session = sessionOf[id];
  const st = l.student || {};
  const g = l.guide || {};
  const links = l.links || {};
  const done = doneSet();
  const idx = order.indexOf(id);
  const prev = idx > 0 ? order[idx - 1] : null;
  const next = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;

  // Breadcrumb: list page › session › lesson
  let html = `<nav class="crumbs" aria-label="מיקום">
      <a href="${listPage}">${view === "guide" ? "דף המדריך" : "המפגשים"}</a>
      ${session ? `<span>›</span><a href="${listPage}#s${esc(session.num)}">מפגש ${esc(session.num)}: ${esc(session.title)}</a>` : `<span>›</span><span>מאגר שיעורים נוסף</span>`}
      <span>›</span><span aria-current="page">${esc(l.title)}</span>
    </nav>`;

  html += `<div class="lesson-head">
      <h1>${esc(l.title)}</h1>
      <div class="tags">${tags(l)}${view === "student" && done.has(id) ? `<span class="tag done">✓ סיימתי</span>` : ""}</div>
      ${view === "guide" ? `<div class="view-switch"><a href="${lessonUrl(id, "student")}">הצגת דף התלמיד ←</a></div>` : ""}
    </div>`;

  // Lessons in this session, so it's clear where we are.
  if (session && (session.lessons || []).length > 1) {
    html += `<ol class="session-steps">${session.lessons
      .filter((x) => lessons[x])
      .map(
        (x, i) =>
          `<li class="${x === id ? "current" : ""}${view === "student" && done.has(x) ? " is-done" : ""}">
            ${x === id ? `<span>` : `<a href="${lessonUrl(x, view)}">`}<span class="step-num">${view === "student" && done.has(x) ? "✓" : i + 1}</span>${esc(lessons[x].title)}${x === id ? `</span>` : `</a>`}
          </li>`
      )
      .join("")}</ol>`;
  }

  // Code toolbar: MakeCode + hex, right at the top.
  const mc = makecodeLink(l);
  const hexes = hexFiles(l);
  const tools = [];
  if (l.source !== "project" || links.makecode) {
    tools.push(
      `<a class="btn makecode" href="${esc(mc.url)}" target="_blank" rel="noopener">${mc.isShare ? "💻 פתיחת הקוד ב-MakeCode ↗" : "💻 פתיחת MakeCode ↗"}</a>`
    );
  }
  hexes.forEach((h) => tools.push(hexButton(h, hexes.length > 1 && h.title ? `הורדת ${h.title}` : "הורדת קובץ hex")));
  if (links.source) tools.push(`<a class="btn secondary" href="${esc(links.source)}" target="_blank" rel="noopener">לשיעור המקורי ↗</a>`);
  if (tools.length) {
    html += `<div class="code-bar">
      <div class="links">${tools.join("")}</div>
      ${
        hexes.length
          ? `<p class="hint">${mc.isShare ? "" : "רוצים לראות את הקוד המוכן? הורידו את קובץ ה-hex וגררו אותו לתוך החלון של MakeCode. "}כדי להעביר ללוח: גררו את קובץ ה-hex לכונן <strong>MICROBIT</strong>.</p>`
          : ""
      }
    </div>`;
  }

  if (st.intro) html += `<p class="lead">${fmt(st.intro)}</p>`;
  if (st.goal) html += `<div class="box goal"><h2>🎯 מה נבנה היום?</h2><p>${fmt(st.goal)}</p></div>`;
  if (!st.goal && l.summary) html += `<div class="box goal"><h2>🎯 מה נבנה?</h2><p>${fmt(l.summary)}</p></div>`;
  if (st.concept) html += `<div class="box concept"><h2>🧠 רעיון חדש</h2><p>${fmt(st.concept)}</p></div>`;
  if (st.steps?.length) html += `<div class="box steps"><h2>🛠️ שלב אחרי שלב</h2>${list(st.steps, true)}</div>`;
  if (l.images?.length)
    html += `<div class="box"><h2>🧩 כך נראה הקוד</h2>${l.images
      .map((src) => `<img class="code-img" src="${esc(src)}" alt="תמונת קוד של ${esc(l.title)}" loading="lazy">`)
      .join("")}</div>`;
  if (st.tip) html += `<div class="box tip"><h2>💡 טיפ</h2><p>${fmt(st.tip)}</p></div>`;
  if (st.challenge) html += `<div class="box challenge"><h2>🚀 אתגר</h2><p>${fmt(st.challenge)}</p></div>`;

  if (view === "guide") {
    if (Object.keys(g).length) {
      html += `<div class="box guide"><h2>📋 הערות למדריך</h2>`;
      if (g.duration) html += `<p><strong>משך:</strong> ${fmt(g.duration)}</p>`;
      if (g.objectives?.length) html += `<h3>מטרות</h3>${list(g.objectives)}`;
      if (g.materials?.length) html += `<h3>ציוד</h3>${list(g.materials)}`;
      if (g.prep) html += `<h3>הכנה מראש</h3><p>${fmt(g.prep)}</p>`;
      if (g.flow?.length) html += `<h3>מהלך השיעור</h3>${list(g.flow, true)}`;
      if (g.common_mistakes?.length) html += `<h3>טעויות נפוצות</h3>${list(g.common_mistakes)}`;
      if (g.extension) html += `<h3>הרחבה לתלמידים מהירים</h3><p>${fmt(g.extension)}</p>`;
      html += `</div>`;
    }
    for (const p of plansOf[id] || []) {
      html += `<div class="box plan-box"><h2>📁 מערך שיעור טכנודע ${esc(p.num)}: ${esc(p.title)}</h2>${planBody(p, lessons, view)}</div>`;
    }
    if (links.slides) html += `<p><a class="btn secondary" href="${esc(links.slides)}">מצגת (pptx)</a></p>`;
  }

  // Bottom: mark done + previous / next lesson.
  html += `<div class="lesson-footer">`;
  if (view === "student") {
    html += `<button class="btn done-toggle${done.has(id) ? " on" : ""}" id="done-btn" aria-pressed="${done.has(id)}">${done.has(id) ? "✓ סיימתי את השיעור" : "סימון: סיימתי את השיעור"}</button>`;
  }
  html += `<button class="btn print" onclick="window.print()">🖨️ הדפסה</button></div>`;
  html += `<nav class="pager" aria-label="ניווט בין שיעורים">
      ${prev ? `<a class="prev" href="${lessonUrl(prev, view)}"><span>→ השיעור הקודם</span><strong>${esc(lessons[prev].title)}</strong></a>` : `<span></span>`}
      ${next ? `<a class="next" href="${lessonUrl(next, view)}"><span>השיעור הבא ←</span><strong>${esc(lessons[next].title)}</strong><em>מפגש ${esc(sessionOf[next].num)}</em></a>` : `<a class="next" href="${listPage}"><span>חזרה ←</span><strong>לכל המפגשים</strong></a>`}
    </nav>`;

  main.innerHTML = html;

  const btn = main.querySelector("#done-btn");
  if (btn)
    btn.addEventListener("click", () => {
      const on = !doneSet().has(id);
      setDone(id, on);
      btn.classList.toggle("on", on);
      btn.setAttribute("aria-pressed", on);
      btn.textContent = on ? "✓ סיימתי את השיעור" : "סימון: סיימתי את השיעור";
    });
}

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  const main = document.querySelector("main");
  if (page === "home") return;
  setupHexDownloads();
  let data;
  try {
    data = await loadAll();
  } catch (e) {
    main.innerHTML = `<div class="warning">${esc(e.message)}. אם פתחתם את הקובץ ישירות מהמחשב – צריך להריץ שרת מקומי (ראו README).</div>`;
    return;
  }
  if (page === "student" || page === "guide") {
    renderContinue(main, data, page);
    renderSessions(main, data, page);
    setupSearch(main, data, page);
  }
  if (page === "guide") {
    renderPlans(main, data);
    renderUsefulLinks(main, data);
    renderBank(main, data);
    setupTabs(main);
  }
  if ((page === "student" || page === "guide") && /^#s\d+$/.test(location.hash)) document.querySelector(location.hash)?.scrollIntoView();
  if (page === "lesson") renderLesson(main, data);
  warn(main, data.problems);
});
