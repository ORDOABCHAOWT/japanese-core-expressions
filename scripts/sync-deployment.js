const fs = require("fs");
const path = require("path");

const projectDir = path.resolve(__dirname, "..");
const sourceDir = path.join(projectDir, "dist");
const wordNotebookDir = process.env.WORD_NOTEBOOK_DIR
  ? path.resolve(process.env.WORD_NOTEBOOK_DIR)
  : path.resolve(projectDir, "..", "word-notebook");
const targetDir = path.join(wordNotebookDir, "web", "public", "japanese");
const files = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "icon-192.png",
  "icon-512.png",
  "icon-1024.png",
  "words.html",
];

fs.mkdirSync(targetDir, { recursive: true });
for (const fileName of files) {
  fs.copyFileSync(
    path.join(sourceDir, fileName),
    path.join(targetDir, fileName),
  );
}

console.log(`已同步 ${files.length} 个静态资源到 ${targetDir}`);
