// Renders the pride and logo images used by add-pride.py: the IGY logo in a white badge,
// a six-stripe pride rainbow, a mini rainbow badge, and one heart badge per pride color.
// Run: NODE_PATH=<dir with sharp, react, react-dom, react-icons> node pride-assets.js <outDir>

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { FaHeart } = require("react-icons/fa6");

const OUT = path.resolve(process.argv[2] || "pride-assets");
fs.mkdirSync(OUT, { recursive: true });

// Six-stripe pride flag, in order (outside → inside on the rainbow).
const PRIDE = ["E40303", "FF8C00", "FFED00", "008026", "004DFF", "750787"];
const SHADOW = `<filter id="s" x="-20%" y="-20%" width="140%" height="150%">
  <feDropShadow dx="0" dy="12" stdDeviation="12" flood-color="#3c0028" flood-opacity="0.32"/></filter>`;

const png = (svg, file) => sharp(Buffer.from(svg)).png().toFile(path.join(OUT, file));

function arcs(cx, cy, outer, band) {
  return PRIDE.map((c, i) => {
    const r = outer - band * (i + 0.5);
    return `<path d="M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="#${c}" stroke-width="${band + 0.6}" fill="none"/>`;
  }).join("");
}

async function rainbow() {
  // Arc of six stripes on a white outline, with a puffy cloud at each foot.
  const cx = 400, cy = 330, outer = 300, band = 36;
  const inner = outer - band * PRIDE.length;
  const cloud = (x) =>
    `<g fill="#fff"><circle cx="${x - 46}" cy="${cy + 6}" r="38"/><circle cx="${x}" cy="${cy - 20}" r="52"/>` +
    `<circle cx="${x + 48}" cy="${cy + 4}" r="40"/><rect x="${x - 84}" y="${cy}" width="172" height="44" rx="22"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="420"><defs>${SHADOW}</defs>
    <g filter="url(#s)">
      <path d="M ${cx - outer - 10} ${cy} A ${outer + 10} ${outer + 10} 0 0 1 ${cx + outer + 10} ${cy}
               L ${cx + inner - 10} ${cy} A ${inner - 10} ${inner - 10} 0 0 0 ${cx - inner + 10} ${cy} Z" fill="#fff"/>
      ${arcs(cx, cy, outer, band)}
      ${cloud(cx - outer + band * 3)}${cloud(cx + outer - band * 3)}
    </g></svg>`;
  await png(svg, "pride-rainbow.png");
}

async function badge(inner, file) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs>${SHADOW}</defs>
    <circle cx="256" cy="246" r="206" fill="#fff" filter="url(#s)"/>${inner}</svg>`;
  await png(svg, file);
}

async function main() {
  await rainbow();
  await badge(arcs(256, 318, 150, 22), "pride-rainbow-badge.png");
  for (const [i, c] of PRIDE.entries()) {
    let heart = renderToStaticMarkup(React.createElement(FaHeart, { size: 230, color: `#${c}` }));
    heart = heart.replace("<svg ", '<svg x="141" y="131" ');
    await badge(heart, `pride-heart-${i + 1}-${c}.png`);
  }
  // IGY logo (presentation/assets/igy-logo.svg) centered in a white badge.
  const logo = await sharp(path.join(__dirname, "../assets/igy-logo.svg"), { density: 600 }).resize(300, 300, { fit: "contain", background: "#0000" }).png().toBuffer();
  const base = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs>${SHADOW}</defs>
    <circle cx="256" cy="246" r="206" fill="#fff" filter="url(#s)"/></svg>`)).png().toBuffer();
  await sharp(base).composite([{ input: logo, left: 106, top: 96 }]).png().toFile(path.join(OUT, "igy-logo-badge.png"));
  console.log(`wrote pride assets to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
