// Builds the background deck for the opening activity (פעולת פתיחה, 14.10.2026).
// Look: the phone upload page (globals.css) — purple→pink→orange gradient, raspberry,
// tilted white "sticker" labels, white pills, icons in white circles, Rubik.
//
// Every object that should animate gets an objectName "a|<effect>|<delayMs>[|<emphasis>@<delayMs>]";
// animate.py turns those names into PowerPoint entrance animations and adds a transition per slide.
//
// Run:  NODE_PATH=<dir with pptxgenjs, sharp, react-icons, react, react-dom> node build-deck.js <outDir>

const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");
const sharp = require("sharp");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const Fa = require("react-icons/fa6");

const OUT = path.resolve(process.argv[2] || ".");
const ASSETS = path.join(OUT, "assets");
fs.mkdirSync(ASSETS, { recursive: true });

const W = 13.333;
const F = "Rubik";
const COLLAGE_URL = "https://image-galery-theta.vercel.app/";
const C = {
  rasp: "8D095B",
  raspDeep: "5E063D",
  purple: "8A3DEC",
  pink: "F13383",
  orange: "FCA95A",
  yellow: "FDE179",
  mint: "4BEF95",
  ink: "1D0614",
  white: "FFFFFF",
  sky: "6EC6F5",
};

// ---------- generated images ----------

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

// Small confetti near the edges, so the middle stays clear for text.
function confetti(seed, colors) {
  const r = rng(seed);
  let out = "";
  for (let i = 0; i < 46; i++) {
    let x = r() * 1920;
    let y = r() * 1080;
    if (x > 260 && x < 1660 && y > 170 && y < 910) {
      if (r() < 0.5) y = r() < 0.5 ? r() * 150 : 930 + r() * 150;
      else x = r() < 0.5 ? r() * 240 : 1680 + r() * 240;
    }
    const col = colors[Math.floor(r() * colors.length)];
    const op = (0.45 + r() * 0.45).toFixed(2);
    const kind = r();
    const rot = Math.round(r() * 180);
    if (kind < 0.4) out += `<circle cx="${x}" cy="${y}" r="${6 + r() * 9}" fill="#${col}" opacity="${op}"/>`;
    else if (kind < 0.8)
      out += `<rect x="${x}" y="${y}" width="${14 + r() * 16}" height="${8 + r() * 6}" rx="4" fill="#${col}" opacity="${op}" transform="rotate(${rot} ${x} ${y})"/>`;
    else
      out += `<path d="M${x} ${y} q 12 -16 24 0 t 24 0" stroke="#${col}" stroke-width="7" fill="none" stroke-linecap="round" opacity="${op}" transform="rotate(${rot} ${x} ${y})"/>`;
  }
  return out;
}

async function background(name, svgBody) {
  const file = path.join(ASSETS, `${name}.png`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">${svgBody}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

const iconCache = new Map();
// An icon inside a white circle with a soft shadow (the .pick-icon look), as one PNG.
async function bubblePng(iconName, fg = C.rasp, bg = C.white) {
  const key = `${iconName}-${fg}-${bg}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const Icon = Fa[iconName];
  if (!Icon) throw new Error(`Unknown icon ${iconName}`);
  let icon = renderToStaticMarkup(React.createElement(Icon, { size: 230, color: `#${fg}` }));
  icon = icon.replace("<svg ", '<svg x="141" y="131" ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="14" stdDeviation="14" flood-color="#3c0028" flood-opacity="0.32"/></filter></defs>
    <circle cx="256" cy="246" r="206" fill="#${bg}" filter="url(#s)"/>${icon}</svg>`;
  const file = path.join(ASSETS, `bubble-${key}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  iconCache.set(key, file);
  return file;
}

// ---------- slide helpers ----------

let objCount = 0;
// anim: "pop@300", "rise@600+teeter@1200", ...
function tag(anim) {
  if (!anim) return undefined;
  const [main, emph] = anim.split("+");
  const [effect, delay] = main.split("@");
  let name = `a|${effect}|${delay || 0}`;
  if (emph) name += `|${emph}`;
  return `${name}|${++objCount}`;
}

const shadow = () => ({ type: "outer", color: "3C0028", opacity: 0.28, blur: 14, offset: 6, angle: 90 });

function text(s, value, o) {
  s.addText(value, {
    x: o.x, y: o.y, w: o.w, h: o.h,
    fontFace: F, fontSize: o.fs, bold: o.bold !== false, color: o.color || C.white,
    align: o.align || "right", valign: o.valign || "middle",
    rtlMode: true, lang: "he-IL", isTextBox: true, margin: o.margin ?? 0, fit: "none",
    lineSpacingMultiple: o.lsm || 0.95, paraSpaceAfter: o.psa || 0,
    objectName: tag(o.anim),
  });
}

// Tilted white label, like .sticker on the phone page.
function sticker(s, value, o) {
  s.addText(value, {
    shape: "rect",
    x: o.x, y: o.y, w: o.w, h: o.h,
    fontFace: F, fontSize: o.fs, bold: true, color: o.color || C.rasp,
    align: "center", valign: "middle", rtlMode: true, lang: "he-IL", isTextBox: true,
    margin: [12, 12, 4, 4], fit: "none", lineSpacingMultiple: 0.95,
    fill: { color: o.fill || C.white }, rotate: o.rot ?? -2.5, shadow: shadow(),
    objectName: tag(o.anim),
  });
}

// Rounded white card with optional text (single object, so it can fly as one piece).
function card(s, value, o) {
  // A link goes on the run here; animate.py lifts it to the whole shape so the button has no underline.
  const content = o.link ? [{ text: value, options: { hyperlink: { url: o.link, tooltip: o.link }, rtlMode: true } }] : value || "";
  s.addText(content, {
    shape: "roundRect", rectRadius: o.radius ?? 0.28,
    x: o.x, y: o.y, w: o.w, h: o.h,
    fontFace: F, fontSize: o.fs || 28, bold: true, color: o.color || C.rasp,
    align: o.align || "right", valign: o.valign || "middle", rtlMode: true, lang: "he-IL", isTextBox: true,
    margin: o.margin ?? [16, 16, 6, 6], fit: "none", lineSpacingMultiple: o.lsm || 0.95,
    fill: { color: o.fill || C.white }, rotate: o.rot || 0, shadow: shadow(),
    objectName: tag(o.anim),
  });
}

function pill(s, value, o) {
  card(s, value, { ...o, radius: o.h / 2, align: o.align || "center", margin: o.margin ?? [14, 14, 2, 2] });
}

function circle(s, value, o) {
  s.addText(value, {
    shape: "ellipse", x: o.x, y: o.y, w: o.d, h: o.d,
    fontFace: F, fontSize: o.fs, bold: true, color: o.color || C.white,
    align: "center", valign: "middle", rtlMode: true, lang: "he-IL", isTextBox: true, margin: 0, fit: "none",
    fill: { color: o.fill || C.rasp }, shadow: shadow(), objectName: tag(o.anim),
  });
}

function arrow(s, shape, o) {
  s.addShape(shape, { x: o.x, y: o.y, w: o.w, h: o.h, fill: { color: C.white }, line: { type: "none" }, shadow: shadow(), objectName: tag(o.anim) });
}

async function bubble(s, iconName, o) {
  const file = await bubblePng(iconName, o.fg, o.bg);
  s.addImage({ path: file, x: o.x, y: o.y, w: o.d, h: o.d, rotate: o.rot ?? -6, objectName: tag(o.anim), altText: o.alt || iconName.replace(/^Fa/, ""),
    hyperlink: o.link ? { url: o.link, tooltip: o.link } : undefined });
}

// Estimated width for a one-line sticker (Rubik Bold, Hebrew ≈ 0.58em per character).
const fitW = (value, fs, pad = 0.9) => Math.min(W - 1.2, value.length * 0.58 * (fs / 72) + pad);

function titleSticker(s, value, anim = "pop@0+teeter@700") {
  const fs = 46;
  const w = fitW(value, fs);
  sticker(s, value, { x: W - 0.6 - w, y: 0.45, w, h: 1.1, fs, anim });
}

function counter(s, value) {
  pill(s, value, { x: 0.6, y: 0.6, w: 1.35, h: 0.62, fs: 22, fill: C.rasp, color: C.white, anim: "fade@0" });
}

// ---------- deck ----------

async function main() {
  const BG = {
    grad: await background(
      "bg-grad",
      `<defs><linearGradient id="g" x1="0.3" y1="0" x2="0.7" y2="1">
        <stop offset="0" stop-color="#8a3dec"/><stop offset="0.48" stop-color="#c13a9a"/>
        <stop offset="0.7" stop-color="#f13383"/><stop offset="1" stop-color="#fca95a"/></linearGradient></defs>
       <rect width="1920" height="1080" fill="url(#g)"/>${confetti(7, [C.yellow, C.mint, C.white, C.orange])}`
    ),
    grad2: await background(
      "bg-grad2",
      `<defs><linearGradient id="g" x1="0.75" y1="0" x2="0.25" y2="1">
        <stop offset="0" stop-color="#8a3dec"/><stop offset="0.45" stop-color="#c13a9a"/>
        <stop offset="0.72" stop-color="#f13383"/><stop offset="1" stop-color="#fca95a"/></linearGradient></defs>
       <rect width="1920" height="1080" fill="url(#g)"/>${confetti(31, [C.yellow, C.mint, C.white, C.sky])}`
    ),
    rasp: await background(
      "bg-rasp",
      `<defs>
        <radialGradient id="b1"><stop offset="0" stop-color="#8a3dec" stop-opacity="0.85"/><stop offset="1" stop-color="#8a3dec" stop-opacity="0"/></radialGradient>
        <radialGradient id="b2"><stop offset="0" stop-color="#f13383" stop-opacity="0.75"/><stop offset="1" stop-color="#f13383" stop-opacity="0"/></radialGradient>
        <radialGradient id="b3"><stop offset="0" stop-color="#fca95a" stop-opacity="0.6"/><stop offset="1" stop-color="#fca95a" stop-opacity="0"/></radialGradient></defs>
       <rect width="1920" height="1080" fill="#8d095b"/>
       <circle cx="1700" cy="120" r="620" fill="url(#b1)"/><circle cx="160" cy="980" r="640" fill="url(#b2)"/>
       <circle cx="1650" cy="1050" r="380" fill="url(#b3)"/>${confetti(99, [C.yellow, C.mint, C.white, C.orange, C.sky])}`
    ),
  };

  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.title = "פעולת פתיחה - היכרות";
  pres.subject = "תיכון כפ״ס · 14.10.2026";
  pres.theme = { headFontFace: F, bodyFontFace: F };
  pres.defineSlideMaster({ title: "GRADIENT", background: { path: BG.grad } });
  pres.defineSlideMaster({ title: "GRADIENT_ALT", background: { path: BG.grad2 } });
  pres.defineSlideMaster({ title: "RASPBERRY", background: { path: BG.rasp } });

  const transitions = [];
  let section = "";
  function slide(master, transition, notes) {
    const s = pres.addSlide({ masterName: master, sectionTitle: section });
    transitions.push(transition);
    if (notes) s.addNotes(notes);
    return s;
  }
  function startSection(title) {
    section = title;
    pres.addSection({ title });
  }

  async function divider(title, sub, iconName, label, transition, notes) {
    const s = slide("RASPBERRY", transition, notes);
    if (label) sticker(s, label, { x: W - 0.6 - fitW(label, 26), y: 0.55, w: fitW(label, 26), h: 0.72, fs: 26, fill: C.yellow, color: C.ink, rot: 3, anim: "drop@0" });
    await bubble(s, iconName, { x: (W - 2.0) / 2, y: 0.95, d: 2.0, rot: -8, anim: "pop@200+teeter@1500" });
    const fs = title.length > 14 ? 70 : 84;
    const w = fitW(title, fs, 1.4);
    sticker(s, title, { x: (W - w) / 2, y: 3.15, w, h: 1.65, fs, rot: -2.5, anim: "pop@600+teeter@1300" });
    if (sub) text(s, sub, { x: 1, y: 5.25, w: W - 2, h: 0.9, fs: 34, align: "center", anim: "rise@1100" });
    return s;
  }

  // ===== פתיחה =====
  startSection("פתיחה");
  {
    const s = slide("GRADIENT", "fade", "שקופית פתיחה. משאירים אותה על המסך בזמן שכולן נכנסות ומתיישבות.");
    await bubble(s, "FaHeart", { x: 0.9, y: 0.75, d: 1.55, rot: -10, fg: C.pink, anim: "pop@1300" });
    await bubble(s, "FaCamera", { x: 10.9, y: 0.85, d: 1.35, rot: 8, anim: "pop@1500" });
    await bubble(s, "FaMusic", { x: 1.5, y: 5.3, d: 1.25, rot: 12, fg: C.purple, anim: "pop@1700" });
    await bubble(s, "FaStar", { x: 10.7, y: 5.25, d: 1.5, rot: -8, fg: C.orange, anim: "pop@1900" });
    sticker(s, "פעולת פתיחה", { x: 2.67, y: 1.95, w: 8, h: 1.75, fs: 88, rot: -3, anim: "pop@0+teeter@2300" });
    sticker(s, "היכרות!", { x: 4.85, y: 3.85, w: 3.65, h: 1.05, fs: 50, fill: C.yellow, color: C.ink, rot: 2.5, anim: "drop@600" });
    pill(s, "תיכון כפ״ס · 14.10.2026", { x: 4.07, y: 5.45, w: 5.2, h: 0.72, fs: 24, anim: "rise@1000" });
  }
  {
    const s = slide("GRADIENT_ALT", "p14:vortex", "מה בתוכנית היום. אפשר לחזור לשקופית הזאת בין חלקים.");
    titleSticker(s, "מה בתוכנית?");
    const items = ["סבב היכרות", "מסכים או לא מסכים", "קולאז׳ תמונות", "הפסקה", "משחק", "נהלים וקבוצת וואטסאפ", "קפסולת זמן"];
    const colX = [W - 0.75 - 5.75, 0.75];
    items.forEach((label, i) => {
      const col = i < 4 ? 0 : 1;
      const row = i < 4 ? i : i - 4;
      const x = colX[col];
      const y = 1.95 + row * 1.27;
      const d = 500 + i * 220;
      card(s, label, { x, y, w: 5.75, h: 1.0, fs: 30, margin: [16, 82, 4, 4], anim: `rise@${d}` });
      circle(s, String(i + 1), { x: x + 5.75 - 0.86, y: y + 0.13, d: 0.74, fs: 28, anim: `pop@${d + 250}` });
    });
  }

  // ===== חלק א׳ | פתיחה =====
  startSection("סבב היכרות");
  await divider("סבב היכרות", "שם · לשון פנייה · שאלה אחת", "FaComments", "חלק א׳", "p14:ripple",
    "סבב היכרות, כ־15 דקות.");
  {
    const s = slide("GRADIENT", "p14:gallery", "כל אחת בתורה: שם, לשון פנייה, ותשובה לאחת השאלות בשקופית הבאה.");
    titleSticker(s, "כל אחת בתורה:");
    const items = [
      ["שם", "FaIdBadge"],
      ["לשון פנייה", "FaCommentDots"],
      ["שאלה אחת", "FaCircleQuestion"],
    ];
    const xs = [9.4, 5.07, 0.73];
    for (let i = 0; i < 3; i++) {
      const d = 400 + i * 700;
      card(s, "", { x: xs[i], y: 2.15, w: 3.2, h: 3.9, rot: i === 1 ? 1.5 : -1.5, anim: `rise@${d}` });
      await bubble(s, items[i][1], { x: xs[i] + 0.65, y: 2.45, d: 1.9, anim: `pop@${d + 250}` });
      text(s, items[i][0], { x: xs[i] + 0.1, y: 4.5, w: 3.0, h: 1.2, fs: 44, color: C.rasp, align: "center", anim: `rise@${d + 300}` });
    }
    for (const x of [8.39, 4.06]) circle(s, "+", { x, y: 3.65, d: 0.95, fs: 48, fill: C.yellow, color: C.ink, anim: "pop@2100" });
  }
  {
    const s = slide("GRADIENT_ALT", "p14:gallery", "השאלות לבחירה. אפשר להשאיר על המסך לאורך כל הסבב.");
    titleSticker(s, "בחרו שאלה אחת:");
    const qs = [
      ["מה ה־guilty pleasure במוזיקה?", "FaHeadphones", C.purple],
      ["משהו כיף שעשינו בחופש הגדול", "FaUmbrellaBeach", C.orange],
      ["רגע מסויים בו הבנתי שאנחנו קשורות לקהילה הגאה", "FaRainbow", C.pink],
    ];
    for (let i = 0; i < 3; i++) {
      const y = 1.95 + i * 1.7;
      const d = 400 + i * 450;
      card(s, qs[i][0], { x: 0.75, y, w: 11.2, h: 1.38, fs: 36, margin: [20, 76, 4, 4], anim: `flyR@${d}` });
      await bubble(s, qs[i][1], { x: 11.3, y: y - 0.06, d: 1.5, fg: qs[i][2], rot: i % 2 ? 8 : -8, anim: `pop@${d + 500}` });
    }
  }

  // ===== חלק ב׳ | מסכים או לא מסכים =====
  startSection("מסכים או לא מסכים");
  await divider("מסכים או לא מסכים?", "עומדות על הציר לפי מה שחושבות", "FaArrowsLeftRight", "חלק ב׳", "p14:honeycomb",
    "מסכים או לא מסכים, כ־15 דקות. מחלקות את החדר לשני צדדים.");
  {
    const s = slide("GRADIENT", "p14:gallery", "מסבירות: צד ימין של המסך = צד אחד של החדר, צד שמאל = הצד השני. אפשר לעמוד גם באמצע. מבקשות מכמה חניכות להסביר.");
    titleSticker(s, "איך משחקים?");
    pill(s, "צד אחד", { x: 8.55, y: 2.2, w: 3.9, h: 1.25, fs: 42, fill: C.mint, color: C.ink, anim: "flyR@500" });
    pill(s, "צד שני", { x: 0.9, y: 2.2, w: 3.9, h: 1.25, fs: 42, fill: C.rasp, color: C.white, anim: "flyL@500" });
    arrow(s, "leftRightArrow", { x: 5.3, y: 2.4, w: 2.75, h: 0.75, anim: "pop@1000" });
    const steps = ["מקריאות אמירה", "עומדות על הציר לפי מה שחושבות", "מי שרוצה, משתפת למה"];
    steps.forEach((label, i) => {
      const y = 4.0 + i * 1.05;
      card(s, label, { x: 2.4, y, w: 8.55, h: 0.85, fs: 30, align: "center", margin: [60, 60, 2, 2], anim: `rise@${1300 + i * 350}` });
      circle(s, String(i + 1), { x: 10.25, y: y + 0.09, d: 0.67, fs: 26, fill: C.yellow, color: C.ink, anim: `pop@${1550 + i * 350}` });
    });
  }

  const statements = [
    { kind: "pick", tagText: "העדפה", a: ["חורף", "FaSnowflake", C.sky], b: ["קיץ", "FaSun", C.orange] },
    { kind: "agree", text: "אסור לדבר בזמן שרואים סרט (גם בבית!)" },
    { kind: "pick", tagText: "העדפה", a: ["מלוח", "FaPizzaSlice", C.orange], b: ["מתוק", "FaIceCream", C.pink] },
    { kind: "pick", tagText: "מה עדיף לאבד?", a: ["מוזיקה", "FaMusic", C.purple], b: ["סרטים וסדרות", "FaFilm", C.rasp] },
    { kind: "pick", tagText: "בשביל מה באים לאיגי?", a: ["בשביל החברים", "FaUserGroup", C.pink], b: ["בשביל התוכן", "FaLightbulb", C.orange] },
    { kind: "agree", text: "יש לכל חבר בקבוצה אחריות על האווירה,\nלא רק למדריכים", fs: 48 },
    { kind: "agree", text: "צריך להימנע מלדבר על נושאים רגישים,\nגם אם זה נושא חשוב", fs: 48 },
    { kind: "agree", text: "קונפליקטים בדיון\nזה דבר חיובי ואפילו רצוי" },
  ];
  for (let i = 0; i < statements.length; i++) {
    const st = statements[i];
    const master = i % 2 ? "GRADIENT_ALT" : "GRADIENT";
    const count = `${i + 1}/${statements.length}`;
    if (st.kind === "pick") {
      const s = slide(master, "p14:switch", `${st.tagText}: ${st.a[0]} (ימין) או ${st.b[0]} (שמאל). שואלות כמה חניכות למה בחרו.`);
      counter(s, count);
      const tw = fitW(st.tagText, 36, 1.0);
      sticker(s, st.tagText, { x: (W - tw) / 2, y: 0.45, w: tw, h: 0.95, fs: 36, fill: C.yellow, color: C.ink, rot: 2, anim: "drop@0" });
      const sides = [
        { opt: st.a, x: 7.0, rot: 2, fly: "flyR" },
        { opt: st.b, x: 0.73, rot: -2, fly: "flyL" },
      ];
      for (const side of sides) {
        const [label, icon, fg] = side.opt;
        card(s, "", { x: side.x, y: 1.85, w: 5.6, h: 5.0, rot: side.rot, anim: `${side.fly}@350` });
        await bubble(s, icon, { x: side.x + 1.65, y: 2.15, d: 2.3, fg, rot: side.rot * 3, anim: "pop@950+teeter@1700" });
        const fs = label.length > 8 ? 52 : 66;
        text(s, label, { x: side.x + 0.15, y: 4.75, w: 5.3, h: 1.6, fs, color: C.rasp, align: "center", anim: "rise@1150" });
      }
      circle(s, "או", { x: (W - 1.25) / 2, y: 3.75, d: 1.25, fs: 40, anim: "pop@1500" });
    } else {
      const s = slide(master, "p14:switch", `מסכים או לא מסכים: "${st.text.replace("\n", " ")}". ימין = מסכים, שמאל = לא מסכים. מבקשות מחניכות משני הצדדים להרחיב.`);
      counter(s, count);
      const tag = "מסכים או לא מסכים?";
      const tw = fitW(tag, 34, 1.0);
      sticker(s, tag, { x: (W - tw) / 2, y: 0.45, w: tw, h: 0.92, fs: 34, fill: C.yellow, color: C.ink, rot: 2, anim: "drop@0" });
      sticker(s, st.text, { x: 1.15, y: 1.85, w: W - 2.3, h: 3.15, fs: st.fs || 52, rot: -1.5, anim: "pop@350+teeter@1100" });
      pill(s, "מסכים", { x: 8.75, y: 5.65, w: 3.85, h: 1.22, fs: 44, fill: C.mint, color: C.ink, margin: [70, 14, 2, 2], anim: "flyR@900" });
      pill(s, "לא מסכים", { x: 0.73, y: 5.65, w: 3.85, h: 1.22, fs: 44, fill: C.rasp, color: C.white, margin: [14, 70, 2, 2], anim: "flyL@900" });
      await bubble(s, "FaThumbsUp", { x: 8.2, y: 5.5, d: 1.5, fg: C.ink, bg: C.white, rot: -10, anim: "pop@1400" });
      await bubble(s, "FaThumbsDown", { x: 3.63, y: 5.5, d: 1.5, fg: C.rasp, bg: C.white, rot: 10, anim: "pop@1400" });
      arrow(s, "leftRightArrow", { x: 5.55, y: 5.92, w: 2.25, h: 0.66, anim: "pop@1700" });
    }
  }

  const circleQs = [
    ["איך היה לענות על השאלות האלה?"],
    ["מה הייתן רוצות שיקרה\nבקבוצה השנה?"],
    ["מה יכול לעזור לכן\nלהרגיש בנוח במרחב?", "מה הייתן רוצות לבקש ממשתתפות אחרות פה?"],
  ];
  for (let i = 0; i < circleQs.length; i++) {
    const [q, q2] = circleQs[i];
    const s = slide(i % 2 ? "GRADIENT_ALT" : "GRADIENT", i === 0 ? "p14:ripple" : "p14:gallery",
      i === 0 ? "חוזרות למעגל. שאלה ראשונה מתוך שלוש." : `שאלת מעגל ${i + 1} מתוך 3.`);
    counter(s, `${i + 1}/3`);
    const lab = "חוזרות למעגל";
    const lw = fitW(lab, 36, 1.0);
    sticker(s, lab, { x: (W - lw) / 2, y: 0.5, w: lw, h: 0.95, fs: 36, fill: C.yellow, color: C.ink, rot: -2, anim: "drop@0" });
    await bubble(s, "FaHeart", { x: (W + lw) / 2 - 0.35, y: 0.25, d: 1.15, fg: C.sky, rot: 12, anim: "pop@400+teeter@1000" });
    sticker(s, q, { x: 1.15, y: q2 ? 2.0 : 2.45, w: W - 2.3, h: 2.6, fs: 58, rot: -1.5, anim: "pop@500+teeter@1300" });
    if (q2) sticker(s, q2, { x: 1.9, y: 5.1, w: W - 3.8, h: 1.35, fs: 36, fill: C.rasp, color: C.white, rot: 1.5, anim: "drop@1500" });
    await bubble(s, "FaHeart", { x: 0.55, y: 5.7, d: 1.2, fg: C.sky, rot: -14, anim: "pop@1800" });
    await bubble(s, "FaHeart", { x: 11.6, y: 5.85, d: 1.0, fg: C.pink, rot: 10, anim: "pop@2000" });
  }

  // ===== קולאז׳ =====
  startSection("קולאז׳ תמונות");
  await divider("קולאז׳ תמונות", "כל אחת מעלה תמונה, והיא קופצת ללוח בלייב", "FaCamera", null, "p14:prism",
    "קולאז׳ תמונות, כ־10 דקות. אחרי ההסבר עוברות למסך הקולאז׳ (האתר) עם הקוד לסריקה.");
  {
    const s = slide("GRADIENT", "p14:gallery", "מה אפשר להעלות. אפשר להתחיל ולהעלות תמונה שלנו כדוגמה.");
    titleSticker(s, "מעלות תמונה אחת:");
    const kinds = [["סלפי", "FaCameraRetro", C.purple], ["תחביב", "FaPalette", C.orange], ["בעל חיים", "FaPaw", C.rasp], ["משהו שאוהבות", "FaHeart", C.pink]];
    for (let i = 0; i < 4; i++) {
      const x = W - 0.75 - 2.75 - i * 3.03;
      const d = 400 + i * 280;
      card(s, "", { x, y: 2.0, w: 2.75, h: 3.65, rot: i % 2 ? 1.5 : -1.5, anim: `rise@${d}` });
      await bubble(s, kinds[i][1], { x: x + 0.55, y: 2.25, d: 1.65, fg: kinds[i][2], anim: `pop@${d + 250}` });
      text(s, kinds[i][0], { x: x + 0.12, y: 4.05, w: 2.51, h: 1.35, fs: 34, color: C.rasp, align: "center", anim: `rise@${d + 300}` });
    }
    const st = "מצטרפת בלייב לקולאז׳ על הלוח!";
    const sw = fitW(st, 32, 1.0);
    sticker(s, st, { x: (W - sw) / 2, y: 6.05, w: sw, h: 0.95, fs: 32, fill: C.yellow, color: C.ink, rot: 1.5, anim: "drop@1900" });
  }
  {
    const s = slide("GRADIENT_ALT", "p14:gallery", "שלבי ההעלאה מהטלפון. לוחצות על הכפתור הצהוב (מה קורה כשלוחצים עליי?) כדי לפתוח את מסך הקולאז׳ עם הקוד לסריקה. חוזרות למצגת עם Cmd+Tab.");
    titleSticker(s, "איך מעלות?");
    const steps = [["סורקות את הקוד", "FaQrcode"], ["בוחרות תמונה", "FaImage"], ["לוחצות שליחה", "FaPaperPlane"]];
    const xs = [9.4, 5.07, 0.73];
    for (let i = 0; i < 3; i++) {
      const d = 400 + i * 600;
      card(s, "", { x: xs[i], y: 1.95, w: 3.2, h: 3.55, rot: i === 1 ? 1.5 : -1.5, anim: `rise@${d}` });
      await bubble(s, steps[i][1], { x: xs[i] + 0.7, y: 2.2, d: 1.8, anim: `pop@${d + 250}` });
      circle(s, String(i + 1), { x: xs[i] + 2.45, y: 1.75, d: 0.75, fs: 30, fill: C.yellow, color: C.ink, anim: `pop@${d + 350}` });
      text(s, steps[i][0], { x: xs[i] + 0.1, y: 4.05, w: 3.0, h: 1.2, fs: 34, color: C.rasp, align: "center", anim: `rise@${d + 300}` });
    }
    for (const x of [8.4, 4.07]) arrow(s, "leftArrow", { x, y: 3.35, w: 0.9, h: 0.6, anim: "pop@2000" });
    // Clicking the button (in slideshow) opens the collage page, which shows the QR code to scan.
    pill(s, "מה קורה כשלוחצים עליי?", { x: (W - 7.8) / 2, y: 5.85, w: 7.8, h: 1.15, fs: 36, margin: [62, 14, 2, 2], fill: C.yellow, color: C.ink, link: COLLAGE_URL, anim: "pop@2300+teeter@2900" });
    await bubble(s, "FaHandPointer", { x: (W - 7.8) / 2 - 0.55, y: 5.75, d: 1.3, rot: -12, link: COLLAGE_URL, anim: "pop@2600+teeter@3200" });
  }
  {
    const s = slide("RASPBERRY", "p14:flip", "מצביעות על תמונות בקולאז׳ ושואלות: מי שמה את זה? למה בחרת? גם אנחנו משתפות.");
    await bubble(s, "FaEye", { x: 1.2, y: 0.9, d: 1.7, fg: C.purple, rot: -12, anim: "pop@1300+teeter@2000" });
    await bubble(s, "FaCamera", { x: 10.5, y: 4.9, d: 1.6, rot: 10, anim: "pop@1500" });
    await bubble(s, "FaHeart", { x: 10.9, y: 1.0, d: 1.2, fg: C.pink, rot: 8, anim: "pop@1700" });
    sticker(s, "מי שמה את זה?", { x: 2.35, y: 2.2, w: 8.6, h: 1.85, fs: 92, rot: -3, anim: "pop@0+teeter@700" });
    sticker(s, "ספרו לנו למה בחרתן", { x: 3.8, y: 4.45, w: 5.7, h: 1.05, fs: 40, fill: C.yellow, color: C.ink, rot: 2, anim: "drop@700" });
  }

  // ===== הפסקה + משחק =====
  startSection("הפסקה ומשחק");
  await divider("הפסקה!", "נחזור עוד כמה דקות", "FaMugHot", null, "p14:ripple",
    "הפסקה אופציונלית, 5–10 דקות. אפשר לדלג על השקופית אם לא עושות הפסקה.");
  await divider("משחק!", "עוד רגע מסבירות את החוקים", "FaDice", null, "p14:vortex",
    "המשחק (יאיר), כ־15 דקות. עדיין לא נקבע: כשיוחלט, אפשר להוסיף כאן שקופיות עם החוקים.");

  // ===== חלק ג׳ | נהלים =====
  startSection("נהלים");
  await divider("נהלים", "לפני שהולכות, עוברות על זה ביחד", "FaShieldHeart", "חלק ג׳", "p14:honeycomb",
    "נהלים: חובה לעבור עליהם לפני שהולכות. אפשר בסבב כרטיסים (שקופית הבאה) או פשוט לעבור על השקופיות.");
  {
    const s = slide("GRADIENT", "p14:gallery", "אם עושות סבב כרטיסים: כל אחת מקריאה כרטיס ובוחרת אחת משלוש השאלות. השקופיות הבאות מראות את הכרטיסים לפי נושא.");
    titleSticker(s, "סבב כרטיסים");
    card(s, "כל אחת מקריאה כרטיס ובוחרת שאלה אחת:", { x: 1.4, y: 1.95, w: 10.5, h: 1.1, fs: 34, align: "center", anim: "rise@400" });
    const qs = [["למה זה חשוב?", C.white, C.rasp, -2], ["איך דואגים שזה יקרה?", C.yellow, C.ink, 1.5], ["מה זה אומר בשבילי?", C.mint, C.ink, -1.5]];
    qs.forEach(([q, fill, color, rot], i) => {
      sticker(s, q, { x: (W - 7.2) / 2, y: 3.4 + i * 1.2, w: 7.2, h: 0.98, fs: 40, fill, color, rot, anim: `pop@${900 + i * 400}` });
    });
    await bubble(s, "FaClone", { x: 0.7, y: 4.4, d: 1.6, rot: -10, anim: "pop@2200+teeter@2800" });
  }

  const rules = [
    ["דיסקרטיות", "FaUserSecret", [
      [1, "אנחנו לא עושות אאוטינג לאף אחד/ת מחברי וחברות הקבוצה."],
      [2, "מי שאני פוגש/ת כאן, אני לא מספר/ת עליו בחוץ, גם לא ״רק לחברה הכי טובה״."],
      [3, "לא מפרסמות איפה ומתי נפגשות: לא צ׳ק־אין, לא סטורי ולא תמונה עם מיקום מזוהה."],
    ]],
    ["דיסקרטיות", "FaUserSecret", [
      [4, "לפני שמצלמות או מעלות תמונה, שואלות את כל מי שמופיע/ה בה."],
      [5, "מה שנאמר במפגש נשאר במפגש."],
      [6, "מותר לספר מה אני חוויתי, בלי לספר מה אחרות אמרו או מי היה."],
    ]],
    ["מרחב בטוח ומכבד", "FaHandHoldingHeart", [
      [7, "כל אחת ואחד מגיעות לכאן כמו שהן, ואנחנו מקבלות את זה."],
      [8, "לא צוחקות, לא מזלזלות ולא שופטות, גם לא ״בצחוק״."],
      [9, "כשמישהו/י מדבר/ת, מקשיבות ולא קוטעות."],
      [10, "בזמן הפעולה הטלפון בצד, ומי שחייב/ת לענות יוצא/ת לרגע מהחדר."],
    ]],
    ["מרחב בטוח ומכבד", "FaHandHoldingHeart", [
      [11, "משתדלות להגיע בזמן, ומי שמאחר/ת מודיע/ה מראש."],
      [12, "מי שלא ישמור או תשמור על המרחב הבטוח והמכבד לא ימשיכו בקבוצה."],
      [13, "אם הרגשתי לא בנוח, אני תמיד יכול/ה לפנות למדריך, גם בפרטי."],
    ]],
    ["לשון פנייה", "FaCommentDots", [
      [14, "לא מניחות איך לפנות למישהו לפי המראה או השם. שואלות."],
      [15, "פונות לכל אחד ואחת בשם ובלשון שביקשו."],
      [16, "טעיתי בלשון פנייה? מתקנות, אומרים סליחה וממשיכות, בלי דרמה."],
      [17, "מותר לשנות שם או לשון פנייה בכל שלב, ומכבדות את זה."],
    ]],
    ["אלימות, סמים ואלכוהול", "FaBan", [
      [18, "אין אלימות, לא פיזית ולא מילולית."],
      [19, "לא מביאות אלכוהול או סמים לפעילות, ולא מגיעות תחת השפעה."],
    ]],
    ["הסכמה והדדיות", "FaHandshake", [
      [20, "לא זה לא, וכן זה כן."],
      [21, "לפני מגע, כמו חיבוק, יד על הכתף או להישען, שואלות קודם."],
      [22, "שתיקה או ״לא יודע/ת״ זה לא ״כן״."],
    ]],
    ["הסכמה והדדיות", "FaHandshake", [
      [23, "מותר להגיד לא, ולא צריך להסביר למה."],
      [24, "מותר להתחרט, גם אחרי שאמרתי כן."],
      [25, "המדריך לא יגיד לכם שלום ברחוב, אלא רק אם תפנו אליו קודם."],
    ]],
    ["קבוצת הוואטסאפ", "FaWhatsapp", [
      [26, "בשם קבוצת הוואטסאפ לא יופיע ״איגי״ או משהו שמסגיר במה מדובר."],
      [27, "הקבוצה היא בעיקר להודעות. לחפירות אפשר לפתוח קבוצה בלי המדריכים (גם כדי לרכל עליהם 😉)."],
      [28, "המרחב הבטוח והמכבד קיים גם בוואטסאפ: בלי קללות ובלי סטיקרים לא מתאימים."],
    ]],
    ["קבוצת הוואטסאפ", "FaWhatsapp", [
      [29, "לא מעבירות צילומי מסך מהקבוצה החוצה."],
      [30, "לא כותבות בקבוצה אחרי 21:00. אם זה חשוב, פונות בפרטי."],
    ]],
  ];
  for (let r = 0; r < rules.length; r++) {
    const [topic, icon, cards] = rules[r];
    const firstOfTopic = r === 0 || rules[r - 1][0] !== topic;
    const s = slide(r % 2 ? "GRADIENT_ALT" : "GRADIENT", firstOfTopic ? "p14:conveyor" : "push",
      `${topic}: כרטיסים ${cards[0][0]}–${cards[cards.length - 1][0]}. אם עושות סבב, כל כרטיס מוקרא בתורו.`);
    const fs = 46;
    const tw = fitW(topic, fs);
    sticker(s, topic, { x: W - 0.6 - tw, y: 0.45, w: tw, h: 1.1, fs, anim: "pop@0+teeter@700" });
    await bubble(s, icon, { x: W - 0.6 - tw - 1.45, y: 0.32, d: 1.3, fg: icon === "FaWhatsapp" ? "1FA855" : C.rasp, rot: -8, anim: "pop@350" });
    const n = cards.length;
    const h = n === 4 ? 1.1 : n === 3 ? 1.45 : 1.6;
    const gap = n === 4 ? 0.22 : 0.3;
    const cfs = n === 4 ? 28 : 32;
    cards.forEach(([num, line], i) => {
      const y = 1.95 + i * (h + gap);
      const d = 600 + i * 450;
      card(s, line, { x: 0.75, y, w: 11.83, h, fs: cfs, margin: [22, 92, 4, 4], lsm: 1.0, anim: `flyR@${d}` });
      circle(s, String(num), { x: 0.75 + 11.83 - 1.12, y: y + (h - 0.85) / 2, d: 0.85, fs: 30, fill: C.rasp, anim: `pop@${d + 450}` });
    });
  }
  {
    const s = slide("RASPBERRY", "p14:flash", "אחרי שעוברות על חוקי הוואטסאפ: מצטלמות סלפי קבוצתי. הוא מצטרף לקולאז׳, והקולאז׳ הופך לתמונת הקבוצה.");
    await bubble(s, "FaCamera", { x: (W - 2.4) / 2, y: 0.7, d: 2.4, rot: -8, anim: "pop@0+teeter@700" });
    sticker(s, "סלפי קבוצתי!", { x: 2.9, y: 3.25, w: 7.55, h: 1.75, fs: 90, rot: -3, anim: "pop@400+teeter@1100" });
    pill(s, "מצטרף לקולאז׳", { x: 7.6, y: 5.65, w: 4.6, h: 1.05, fs: 34, fill: C.yellow, color: C.ink, anim: "flyR@1300" });
    arrow(s, "leftArrow", { x: 6.3, y: 5.88, w: 1.0, h: 0.6, anim: "pop@1700" });
    pill(s, "תמונת קבוצת הוואטסאפ", { x: 0.9, y: 5.65, w: 5.1, h: 1.05, fs: 34, fill: C.mint, color: C.ink, anim: "flyL@1900" });
  }

  // ===== קפסולת זמן =====
  startSection("קפסולת זמן");
  await divider("קפסולת זמן", "מכתב לעצמי של סוף השנה", "FaEnvelopeOpenText", null, "p15:airplane",
    "קפסולת זמן, כ־15 דקות. מחלקות דפים, מעטפות, מדבקות וטושים.");
  {
    const s = slide("GRADIENT", "p15:origami", "השלבים. נשמור את המכתבים בקופסה ונחזיר אותם בפעולה האחרונה של השנה.");
    titleSticker(s, "איך זה עובד?");
    const steps = [["כותבות מכתב לעצמכן", "FaPen", C.purple], ["מקשטות", "FaWandMagicSparkles", C.orange], ["סוגרות במעטפה", "FaEnvelope", C.pink], ["לתוך הקופסה", "FaBoxArchive", C.rasp]];
    for (let i = 0; i < 4; i++) {
      const x = W - 0.75 - 2.75 - i * 3.03;
      const d = 400 + i * 400;
      card(s, "", { x, y: 1.95, w: 2.75, h: 3.65, rot: i % 2 ? 1.5 : -1.5, anim: `rise@${d}` });
      await bubble(s, steps[i][1], { x: x + 0.55, y: 2.2, d: 1.65, fg: steps[i][2], anim: `pop@${d + 250}` });
      circle(s, String(i + 1), { x: x + 2.05, y: 1.75, d: 0.72, fs: 28, fill: C.yellow, color: C.ink, anim: `pop@${d + 350}` });
      text(s, steps[i][0], { x: x + 0.12, y: 4.0, w: 2.51, h: 1.4, fs: 32, color: C.rasp, align: "center", anim: `rise@${d + 300}` });
    }
    const st = "נחזיר לכן אותו בסוף השנה!";
    const sw = fitW(st, 36, 1.0);
    sticker(s, st, { x: (W - sw) / 2, y: 6.0, w: sw, h: 1.0, fs: 36, fill: C.yellow, color: C.ink, rot: 2, anim: "drop@2200+teeter@2800" });
  }
  {
    const s = slide("GRADIENT_ALT", "p14:gallery", "מה כותבים: איחולים לעצמי (בכל נושא, לא רק איגי) ושאלות לעצמי של סוף השנה.");
    titleSticker(s, "מה כותבים?");
    const cols = [
      { x: 6.85, rot: 1.2, head: "איחולים לעצמי", icon: "FaStar", fg: C.orange, lines: ["מה אני מאחל/ת לעצמי עד סוף השנה?", "בכל נושא, לא רק איגי", "מי הייתי רוצה להיות?"] },
      { x: 0.75, rot: -1.2, head: "שאלות לעצמי", icon: "FaCircleQuestion", fg: C.purple, lines: ["מה השתנה בשנה האחרונה?", "איך הלך לי בבית ספר?", "עברתי תיאוריה?", "למי התחברתי השנה?"] },
    ];
    for (let i = 0; i < 2; i++) {
      const c = cols[i];
      const d = 400 + i * 700;
      card(s, "", { x: c.x, y: 1.95, w: 5.75, h: 5.0, rot: c.rot, anim: `rise@${d}` });
      await bubble(s, c.icon, { x: c.x + 4.55, y: 1.6, d: 1.45, fg: c.fg, rot: 10, anim: `pop@${d + 300}` });
      text(s, c.head, { x: c.x + 0.4, y: 2.15, w: 4.1, h: 0.95, fs: 40, color: C.rasp, anim: `rise@${d + 250}` });
      s.addText(
        c.lines.map((t, k) => ({ text: t, options: { bullet: { indent: 22 }, rtlMode: true, align: "right", breakLine: k < c.lines.length - 1 } })),
        {
          x: c.x + 0.35, y: 3.2, w: 5.05, h: 3.5, fontFace: F, fontSize: 30, bold: true, color: C.ink,
          align: "right", valign: "top", rtlMode: true, lang: "he-IL", isTextBox: true, margin: 0,
          paraSpaceAfter: 12, objectName: tag(`rise@${d + 450}`),
        }
      );
    }
  }
  {
    const s = slide("GRADIENT", "p14:gallery", "שאלות מנחות. כדאי להשאיר את השקופית הזאת על המסך כל זמן הכתיבה.");
    titleSticker(s, "שאלות מנחות");
    const qs = [
      "איך אני מרגיש עם תחילת השנה באיגי? ובבית ספר?",
      "מי הייתי רוצה להיות בסוף השנה?",
      "עם מי הייתי רוצה להתחבר יותר עד סוף השנה?",
      "מה אני מאחל לעצמי לשנה הזאת?",
      "מה חשוב לי להזכיר לעצמי בסוף השנה?",
      "מה המטרות שלי לשנה הזאת?",
    ];
    const xs = [8.83, 4.79, 0.75];
    qs.forEach((q, i) => {
      const x = xs[i % 3];
      const y = i < 3 ? 1.95 : 4.6;
      const d = 400 + i * 300;
      card(s, q, { x, y, w: 3.75, h: 2.3, fs: 28, align: "center", margin: [16, 16, 6, 6], lsm: 1.0, rot: i % 2 ? 1.5 : -1.5, anim: `pop@${d}` });
      circle(s, String(i + 1), { x: x + 3.2, y: y - 0.25, d: 0.7, fs: 26, fill: C.yellow, color: C.ink, anim: `pop@${d + 250}` });
    });
  }
  {
    const s = slide("RASPBERRY", "p14:vortex", "סיום. אפשר להשאיר על המסך בזמן שמכניסות את המעטפות לקופסה.");
    const hearts = [
      [1.0, 0.8, 1.4, C.sky, -12], [11.0, 0.7, 1.3, C.pink, 10], [0.8, 5.4, 1.2, C.orange, 14],
      [11.2, 5.3, 1.5, C.mint, -8], [6.0, 0.35, 1.0, C.yellow, 6], [6.2, 6.3, 0.95, C.sky, -6],
    ];
    for (let i = 0; i < hearts.length; i++) {
      const [x, y, d, fg, rot] = hearts[i];
      await bubble(s, "FaHeart", { x, y, d, fg, rot, anim: `pop@${1100 + i * 180}` });
    }
    sticker(s, "שנה מעולה!", { x: 2.9, y: 2.1, w: 7.55, h: 1.9, fs: 100, rot: -3, anim: "pop@0+teeter@700" });
    sticker(s, "נתראה בפעולה הבאה", { x: 3.95, y: 4.4, w: 5.45, h: 1.05, fs: 42, fill: C.yellow, color: C.ink, rot: 2, anim: "drop@600" });
  }

  const deck = path.join(OUT, "deck.pptx");
  await pres.writeFile({ fileName: deck });
  fs.writeFileSync(path.join(OUT, "transitions.json"), JSON.stringify(transitions));
  console.log(`wrote ${deck} (${transitions.length} slides)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
