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

const outputDir = __dirname;
const palette = {
  paper: "#F4F0E5",
  paperLight: "#FBFAF5",
  indigo: "#23445D",
  indigoDeep: "#173245",
  vermilion: "#BD4435",
  gold: "#C39438",
  moss: "#6F8067",
  ink: "#1D2832",
};

const concepts = [
  {
    id: "a-seal",
    title: "A  言の印",
    subtitle: "印章 × 教材",
    note: "沉稳、识别最强",
    artwork: `
      <rect width="1024" height="1024" fill="${palette.paper}"/>
      <rect x="64" y="64" width="896" height="896" rx="216" fill="${palette.indigoDeep}"/>
      <circle cx="780" cy="244" r="106" fill="none" stroke="${palette.paperLight}" stroke-opacity=".10" stroke-width="18"/>
      <circle cx="780" cy="244" r="56" fill="none" stroke="${palette.paperLight}" stroke-opacity=".10" stroke-width="18"/>
      <rect x="258" y="196" width="508" height="632" rx="76" fill="${palette.vermilion}"/>
      <rect x="302" y="240" width="420" height="544" rx="42" fill="none" stroke="${palette.paperLight}" stroke-opacity=".16" stroke-width="8"/>
      <path d="M716 280h50v132l-25-19-25 19z" fill="${palette.gold}"/>
      <text x="512" y="690" text-anchor="middle" fill="${palette.paperLight}"
        font-family="Songti SC, STSong, serif" font-size="410" font-weight="700">言</text>
    `,
  },
  {
    id: "b-open-book",
    title: "B  ひらく言葉",
    subtitle: "开本 × 学习",
    note: "教材感最明确",
    artwork: `
      <rect width="1024" height="1024" fill="${palette.vermilion}"/>
      <rect x="64" y="64" width="896" height="896" rx="216" fill="${palette.vermilion}"/>
      <circle cx="512" cy="512" r="348" fill="${palette.paper}"/>
      <path d="M512 312c-74-52-170-70-278-45v426c111-25 207-4 278 57z" fill="${palette.paperLight}" stroke="${palette.indigoDeep}" stroke-width="22" stroke-linejoin="round"/>
      <path d="M512 312c74-52 170-70 278-45v426c-111-25-207-4-278 57z" fill="${palette.paperLight}" stroke="${palette.indigoDeep}" stroke-width="22" stroke-linejoin="round"/>
      <path d="M512 314v436" stroke="${palette.indigoDeep}" stroke-width="18" stroke-linecap="round"/>
      <path d="M302 390h130M302 464h150M302 538h118" stroke="${palette.indigo}" stroke-width="22" stroke-linecap="round" opacity=".78"/>
      <circle cx="648" cy="458" r="86" fill="${palette.vermilion}"/>
      <text x="648" y="514" text-anchor="middle" fill="${palette.paperLight}"
        font-family="Hiragino Mincho ProN, YuMincho, serif" font-size="150" font-weight="700">あ</text>
      <path d="M716 276v166l-30-23-30 23V288" fill="${palette.gold}"/>
    `,
  },
  {
    id: "c-conversation",
    title: "C  会話の間",
    subtitle: "对话 × 日之丸",
    note: "现代、口语属性强",
    artwork: `
      <rect width="1024" height="1024" fill="${palette.paper}"/>
      <rect x="64" y="64" width="896" height="896" rx="216" fill="${palette.indigo}"/>
      <circle cx="756" cy="262" r="104" fill="${palette.vermilion}"/>
      <path d="M206 294c0-59 48-107 107-107h338c59 0 107 48 107 107v283c0 59-48 107-107 107H447L292 803l34-119h-13c-59 0-107-48-107-107z" fill="${palette.paperLight}"/>
      <path d="M342 378h266M342 468h214M342 558h252" stroke="${palette.indigoDeep}" stroke-width="30" stroke-linecap="round"/>
      <circle cx="650" cy="558" r="18" fill="${palette.gold}"/>
    `,
  },
  {
    id: "d-flashcard",
    title: "D  かな札",
    subtitle: "假名 × 卡片",
    note: "轻快、小测属性强",
    artwork: `
      <rect width="1024" height="1024" fill="${palette.paper}"/>
      <rect x="64" y="64" width="896" height="896" rx="216" fill="${palette.paper}"/>
      <rect x="210" y="174" width="604" height="676" rx="94" fill="${palette.indigoDeep}" transform="rotate(-5 512 512)"/>
      <rect x="240" y="164" width="604" height="676" rx="94" fill="${palette.paperLight}" stroke="${palette.indigoDeep}" stroke-width="18" transform="rotate(4 542 502)"/>
      <rect x="284" y="226" width="516" height="552" rx="60" fill="${palette.paperLight}" stroke="${palette.vermilion}" stroke-width="12" transform="rotate(4 542 502)"/>
      <circle cx="706" cy="282" r="56" fill="${palette.vermilion}"/>
      <text x="526" y="668" text-anchor="middle" fill="${palette.indigoDeep}"
        font-family="Hiragino Mincho ProN, YuMincho, serif" font-size="420" font-weight="700" transform="rotate(4 526 668)">あ</text>
      <path d="M350 730h340" stroke="${palette.gold}" stroke-width="24" stroke-linecap="round" transform="rotate(4 520 730)"/>
    `,
  },
];

function iconSvg(body) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      ${body}
    </svg>
  `);
}

function labelSvg(concept) {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="880" height="154" viewBox="0 0 880 154">
      <rect width="880" height="154" fill="${palette.paperLight}"/>
      <text x="0" y="50" fill="${palette.ink}" font-family="-apple-system, BlinkMacSystemFont, Hiragino Sans GB, sans-serif" font-size="36" font-weight="700">${concept.title}</text>
      <text x="0" y="94" fill="${palette.indigo}" font-family="-apple-system, BlinkMacSystemFont, Hiragino Sans GB, sans-serif" font-size="24">${concept.subtitle}</text>
      <text x="0" y="132" fill="#6B7379" font-family="-apple-system, BlinkMacSystemFont, Hiragino Sans GB, sans-serif" font-size="22">${concept.note}</text>
    </svg>
  `);
}

async function render() {
  const iconBuffers = [];

  for (const concept of concepts) {
    const buffer = await sharp(iconSvg(concept.artwork)).png().toBuffer();
    iconBuffers.push(buffer);
    await sharp(buffer).toFile(path.join(outputDir, `${concept.id}.png`));
  }

  const canvas = sharp({
    create: {
      width: 2400,
      height: 1720,
      channels: 4,
      background: palette.paperLight,
    },
  });

  const heading = Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="2200" height="170" viewBox="0 0 2200 170">
      <text x="0" y="64" fill="${palette.ink}" font-family="-apple-system, BlinkMacSystemFont, Hiragino Sans GB, sans-serif" font-size="52" font-weight="700">ことば帖 · PWA 图标方向</text>
      <text x="0" y="118" fill="#6B7379" font-family="-apple-system, BlinkMacSystemFont, Hiragino Sans GB, sans-serif" font-size="28">日系教材配色 · 朱红 / 靛蓝 / 和纸 · 四款均按 Maskable 安全区设计</text>
      <path d="M0 154h2200" stroke="#DED8CA" stroke-width="2"/>
    </svg>
  `);

  const composites = [{ input: heading, left: 100, top: 70 }];
  const positions = [
    { left: 100, top: 270 },
    { left: 1320, top: 270 },
    { left: 100, top: 990 },
    { left: 1320, top: 990 },
  ];

  for (let index = 0; index < concepts.length; index += 1) {
    const position = positions[index];
    const resized = await sharp(iconBuffers[index]).resize(520, 520).png().toBuffer();
    composites.push({ input: resized, left: position.left, top: position.top });
    composites.push({ input: labelSvg(concepts[index]), left: position.left + 570, top: position.top + 168 });
  }

  await canvas.composite(composites).png().toFile(path.join(outputDir, "icon-concepts-overview.png"));
  fs.writeFileSync(
    path.join(outputDir, "concepts.json"),
    `${JSON.stringify(concepts.map(({ id, title, subtitle, note }) => ({ id, title, subtitle, note })), null, 2)}\n`,
  );

  console.log(`Generated ${concepts.length} concepts in ${outputDir}`);
}

render().catch((error) => {
  console.error(error);
  process.exit(1);
});
