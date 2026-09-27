// Renders the PWA icons from icon/app-icon.svg (and the safe-zone maskable
// variant) with the local Chrome, so the repository needs no image library.
// Usage: npm run icons   (CHROME_PATH overrides the Chrome location)
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const projectDir = path.resolve(__dirname, "..");
const outputDir = path.join(projectDir, "public");
const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const icon = fs.readFileSync(path.join(projectDir, "icon", "app-icon.svg"), "utf8");
const maskable = fs.readFileSync(path.join(projectDir, "icon", "app-icon-maskable.svg"), "utf8");
const jobs = [
  ...[32, 180, 192, 512, 1024].map((size) => ({ svg: icon, size, file: `icon-${size}.png` })),
  { svg: maskable, size: 512, file: "icon-maskable-512.png" },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "kotoba-icons-"));
  const chrome = spawn(chromePath, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "about:blank",
  ], { stdio: "ignore" });
  try {
    let port;
    for (let i = 0; i < 100 && !port; i += 1) {
      await sleep(100);
      try { port = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]; } catch (_) {}
    }
    if (!port) throw new Error(`没有启动 Chrome：${chromePath}`);
    const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((target) => target.type === "page");
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    let id = 0;
    const pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      id += 1;
      pending.set(id, (message) => (message.error ? reject(new Error(message.error.message)) : resolve(message.result)));
      socket.send(JSON.stringify({ id, method, params }));
    });
    const { frameTree } = await send("Page.getFrameTree");
    for (const job of jobs) {
      await send("Emulation.setDeviceMetricsOverride", { width: job.size, height: job.size, deviceScaleFactor: 1, mobile: false });
      const svg = job.svg.replace(/width="1024" height="1024"/, `width="${job.size}" height="${job.size}"`);
      await send("Page.setDocumentContent", {
        frameId: frameTree.frame.id,
        html: `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`,
      });
      await sleep(150);
      const { data } = await send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 0, y: 0, width: job.size, height: job.size, scale: 1 },
      });
      fs.writeFileSync(path.join(outputDir, job.file), Buffer.from(data, "base64"));
    }
    socket.close();
    console.log(`已生成 ${jobs.length} 个 PWA 图标：${outputDir}`);
  } finally {
    const exited = new Promise((resolve) => chrome.once("exit", resolve));
    chrome.kill();
    await Promise.race([exited, sleep(3000)]);
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
