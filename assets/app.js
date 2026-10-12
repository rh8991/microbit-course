// Loads data/schedule.yml + data/lessons.yml and renders the page named in <body data-page="...">.

const LEVELS = { beginner: "מתחילים", intermediate: "בינוני", advanced: "מתקדם" };
const SOURCES = { microbit: "micro:bit", tinybit: "Tiny:bit", project: "פרויקט" };

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

async function loadAll() {
  const [schedule, lessonsData] = await Promise.all([loadYaml("data/schedule.yml"), loadYaml("data/lessons.yml")]);
  const lessons = {};
  for (const l of lessonsData.lessons || []) lessons[l.id] = l;
  const problems = [];
  for (const s of schedule.sessions || []) {
    for (const id of s.lessons || []) {
      if (!lessons[id]) problems.push(`במפגש ${s.num} מופיע שיעור "${id}" שלא קיים ב-lessons.yml`);
    }
  }
  return { schedule, lessons, problems };
}

function lessonUrl(id, view) {
  return `lesson.html?id=${encodeURIComponent(id)}&view=${view}`;
}

function renderSessions(main, { schedule, lessons }, view) {
  let html = "";
  for (const part of schedule.parts || []) {
    const sessions = (schedule.sessions || []).filter((s) => s.part === part.id);
    if (!sessions.length) continue;
    html += `<section class="part-${esc(part.id)}">
      <h2 class="part-title"><span class="dot"></span>${esc(part.title)}</h2>
      ${part.description ? `<p class="part-desc">${fmt(part.description)}</p>` : ""}
      <div class="sessions">`;
    for (const s of sessions) {
      const items = (s.lessons || [])
        .map((id) => (lessons[id] ? `<li><a href="${lessonUrl(id, view)}">${esc(lessons[id].title)}</a></li>` : ""))
        .join("");
      const note = view === "guide" ? s.guide_note : s.student_note;
      html += `<article class="session">
        <div class="num">מפגש ${esc(s.num)}</div>
        <h3>${esc(s.title)}</h3>
        ${note ? `<div class="note">${fmt(note)}</div>` : ""}
        ${items ? `<ul>${items}</ul>` : ""}
      </article>`;
    }
    html += `</div></section>`;
  }
  main.querySelector("#sessions").innerHTML = html;
}

function renderBank(main, { schedule, lessons }) {
  const scheduled = new Set((schedule.sessions || []).flatMap((s) => s.lessons || []));
  const bank = Object.values(lessons).filter((l) => !scheduled.has(l.id));
  const el = main.querySelector("#bank");
  const src = main.querySelector("#f-source");
  const lvl = main.querySelector("#f-level");
  const q = main.querySelector("#f-search");

  function draw() {
    const term = q.value.trim().toLowerCase();
    const shown = bank.filter(
      (l) =>
        (!src.value || l.source === src.value) &&
        (!lvl.value || l.level === lvl.value) &&
        (!term || `${l.title} ${l.summary || ""} ${(l.concepts || []).join(" ")}`.toLowerCase().includes(term))
    );
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
  [src, lvl, q].forEach((x) => x.addEventListener("input", draw));
  draw();
}

function setupTabs(main) {
  const buttons = main.querySelectorAll(".tabs button");
  buttons.forEach((b) =>
    b.addEventListener("click", () => {
      buttons.forEach((x) => {
        x.setAttribute("aria-selected", x === b ? "true" : "false");
        document.getElementById(x.dataset.tab).hidden = x !== b;
      });
    })
  );
}

function renderLesson(main, { schedule, lessons }) {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const view = params.get("view") === "guide" ? "guide" : "student";
  const l = lessons[id];
  if (!l) {
    main.innerHTML = `<p>השיעור לא נמצא. <a href="student.html">חזרה לרשימת המפגשים</a></p>`;
    return;
  }
  document.title = `${l.title} | מיקרוביט – טכנודע`;
  const session = (schedule.sessions || []).find((s) => (s.lessons || []).includes(id));
  const back = view === "guide" ? "guide.html" : "student.html";
  const st = l.student || {};
  const g = l.guide || {};
  const links = l.links || {};

  let html = `<p><a href="${back}">→ חזרה לכל המפגשים</a></p>
    <div class="lesson-head">
      ${session ? `<div class="tag">מפגש ${esc(session.num)} · ${esc(session.title)}</div>` : `<div class="tag">מאגר שיעורים נוסף</div>`}
      <h1>${esc(l.title)}</h1>
      <div class="tags">${tags(l)}</div>
      ${
        view === "guide"
          ? `<div class="view-switch"><a href="${lessonUrl(id, "student")}">הצגת דף התלמיד</a></div>`
          : ""
      }
    </div>`;

  if (st.intro) html += `<p class="lead">${fmt(st.intro)}</p>`;
  if (st.goal) html += `<div class="box goal"><h2>🎯 מה נבנה היום?</h2><p>${fmt(st.goal)}</p></div>`;
  if (st.concept) html += `<div class="box concept"><h2>🧠 רעיון חדש</h2><p>${fmt(st.concept)}</p></div>`;
  if (st.steps?.length) html += `<div class="box steps"><h2>🛠️ שלב אחרי שלב</h2>${list(st.steps, true)}</div>`;
  if (l.images?.length)
    html += `<div class="box"><h2>🧩 כך נראה הקוד</h2>${l.images
      .map((src) => `<img class="code-img" src="${esc(src)}" alt="תמונת קוד של ${esc(l.title)}" loading="lazy">`)
      .join("")}</div>`;
  if (st.tip) html += `<div class="box tip"><h2>💡 טיפ</h2><p>${fmt(st.tip)}</p></div>`;
  if (st.challenge) html += `<div class="box challenge"><h2>🚀 אתגר</h2><p>${fmt(st.challenge)}</p></div>`;

  if (view === "guide") {
    html += `<div class="box guide"><h2>📋 הערות למדריך</h2>`;
    if (g.duration) html += `<p><strong>משך:</strong> ${fmt(g.duration)}</p>`;
    if (g.objectives?.length) html += `<h3>מטרות</h3>${list(g.objectives)}`;
    if (g.materials?.length) html += `<h3>ציוד</h3>${list(g.materials)}`;
    if (g.prep) html += `<h3>הכנה מראש</h3><p>${fmt(g.prep)}</p>`;
    if (g.flow?.length) html += `<h3>מהלך השיעור</h3>${list(g.flow, true)}`;
    if (g.common_mistakes?.length) html += `<h3>טעויות נפוצות</h3>${list(g.common_mistakes)}`;
    if (g.extension) html += `<h3>הרחבה לתלמידים מהירים</h3><p>${fmt(g.extension)}</p>`;
    if (!Object.keys(g).length && l.summary) html += `<p>${fmt(l.summary)}</p>`;
    html += `</div>`;
  }

  const btns = [];
  if (links.source) btns.push(`<a class="btn" href="${esc(links.source)}" target="_blank" rel="noopener">לשיעור המקורי ↗</a>`);
  if (links.makecode) btns.push(`<a class="btn secondary" href="${esc(links.makecode)}" target="_blank" rel="noopener">פתיחת MakeCode ↗</a>`);
  if (links.hex) btns.push(`<a class="btn secondary" href="${esc(links.hex)}">הורדת קובץ hex</a>`);
  if (view === "guide" && links.slides) btns.push(`<a class="btn secondary" href="${esc(links.slides)}">מצגת (pptx)</a>`);
  btns.push(`<button class="btn print" onclick="window.print()">🖨️ הדפסה</button>`);
  html += `<div class="links">${btns.join("")}</div>`;

  main.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", async () => {
  const page = document.body.dataset.page;
  const main = document.querySelector("main");
  if (page === "home") return;
  let data;
  try {
    data = await loadAll();
  } catch (e) {
    main.innerHTML = `<div class="warning">${esc(e.message)}. אם פתחתם את הקובץ ישירות מהמחשב – צריך להריץ שרת מקומי (ראו README).</div>`;
    return;
  }
  if (page === "student") renderSessions(main, data, "student");
  if (page === "guide") {
    renderSessions(main, data, "guide");
    renderBank(main, data);
    setupTabs(main);
  }
  if (page === "lesson") renderLesson(main, data);
  warn(main, data.problems);
});
