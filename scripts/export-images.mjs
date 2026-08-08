// SVG マスター(assets/icons)から Stream Deck 用 PNG を書き出す。
// サイズ仕様は docs/PLAN.md §6(SDK 公式ドキュメント確認済み)に従う。
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SRC = path.join(ROOT, "assets", "icons");
const DEST = path.join(ROOT, "com.rimtty.totalmix-osc-remote.sdPlugin", "imgs");

/** @type {{src: string; out: string; sizes: [number, number?]}[]} */
const EXPORTS = [
  // プラグインアイコン(PNG 必須): 256 + 512
  { src: "plugin-icon.svg", out: "plugin/icon", sizes: [256, 512] },
  // カテゴリアイコン(白モノクロ): 28 + 56
  { src: "category-icon.svg", out: "plugin/category-icon", sizes: [28, 56] },
  // アクションリストアイコン(白モノクロ): 20 + 40
  { src: "list-dial.svg", out: "actions/list-dial", sizes: [20, 40] },
  { src: "list-mute.svg", out: "actions/list-mute", sizes: [20, 40] },
  { src: "list-fader-dim.svg", out: "actions/list-fader-dim", sizes: [20, 40] },
  // キー画像・エンコーダーアイコン: 72 + 144
  { src: "dial-fader.svg", out: "actions/dial-fader", sizes: [72, 144] },
  { src: "key-mute-off.svg", out: "actions/key-mute-off", sizes: [72, 144] },
  { src: "key-mute-on.svg", out: "actions/key-mute-on", sizes: [72, 144] },
  { src: "key-fader-dim-off.svg", out: "actions/key-fader-dim-off", sizes: [72, 144] },
  { src: "key-fader-dim-on.svg", out: "actions/key-fader-dim-on", sizes: [72, 144] },
];

function viewBoxSize(svg) {
  const m = /viewBox="0 0 (\d+) (\d+)"/.exec(svg);
  return m ? Number(m[1]) : 144;
}

async function exportOne({ src, out, sizes }) {
  const svg = await readFile(path.join(SRC, src));
  const vb = viewBoxSize(svg.toString());
  const [base, retina] = sizes;
  const targets = [
    { size: base, suffix: "" },
    ...(retina ? [{ size: retina, suffix: "@2x" }] : []),
  ];
  for (const { size, suffix } of targets) {
    const density = Math.ceil((72 * size) / vb) + 1;
    const dest = path.join(DEST, `${out}${suffix}.png`);
    await mkdir(path.dirname(dest), { recursive: true });
    await sharp(svg, { density }).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(dest);
    console.log(`${src} → ${path.relative(ROOT, dest)} (${size}x${size})`);
  }
}

for (const entry of EXPORTS) {
  await exportOne(entry);
}
console.log("done");
