const fs = require("fs");
const path = require("path");

const sharp = require(path.resolve(
  __dirname,
  "..",
  "..",
  "ai-word-notebook-extension",
  "web",
  "node_modules",
  "sharp",
));

const outputDir = path.resolve(__dirname, "..", "public");
fs.mkdirSync(outputDir, { recursive: true });

const artwork = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
    <rect width="1024" height="1024" fill="#f4f0e5"/>
    <rect x="210" y="174" width="604" height="676" rx="94" fill="#173245" transform="rotate(-5 512 512)"/>
    <rect x="240" y="164" width="604" height="676" rx="94" fill="#fbfaf5" stroke="#173245" stroke-width="18" transform="rotate(4 542 502)"/>
    <rect x="284" y="226" width="516" height="552" rx="60" fill="#fbfaf5" stroke="#bd4435" stroke-width="12" transform="rotate(4 542 502)"/>
    <circle cx="706" cy="282" r="56" fill="#bd4435"/>
    <text x="526" y="668" text-anchor="middle" fill="#173245"
      font-family="Hiragino Mincho ProN, YuMincho, serif" font-size="420" font-weight="700" transform="rotate(4 526 668)">あ</text>
    <path d="M350 730h340" stroke="#c39438" stroke-width="24" stroke-linecap="round" transform="rotate(4 520 730)"/>
  </svg>
`);

async function main() {
  for (const size of [32, 180, 192, 512, 1024]) {
    await sharp(artwork)
      .resize(size, size)
      .png()
      .toFile(path.join(outputDir, `icon-${size}.png`));
  }

  await sharp(artwork)
    .resize(512, 512)
    .png()
    .toFile(path.join(outputDir, "icon-maskable-512.png"));

  console.log(`已生成 6 个 PWA 图标：${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
