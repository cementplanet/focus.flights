// With Playwright installed, serve the checkout and run this script against its HTTP URL.
const { chromium } = require("playwright");
const { readFile, mkdir, writeFile } = require("node:fs/promises");
const { join } = require("node:path");

async function build() {
  const root = join(__dirname, "..");
  const copies = JSON.parse(await readFile(join(root, "locales/home.json"), "utf8"));
  const output = join(root, "gift/localized");
  await mkdir(output, { recursive: true });

  const base = process.argv[2] || "http://127.0.0.1:8766";
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(new URL("/gift/invitation.webp", base).href, { waitUntil: "commit" });
    for (const [language, copy] of Object.entries(copies)) {
      const image = await page.evaluate(async ({ language, copy }) => {
        const source = new Image();
        source.src = "/gift/invitation.webp";
        await source.decode();

        const canvas = document.createElement("canvas");
        canvas.lang = language;
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(source, 0, 0);

        function erasePrint(x, y, width, height, lightInk = false) {
          const patch = ctx.getImageData(x, y, width, height);
          const edge = ctx.getImageData(x - 5, y, width + 10, height);
          for (let row = 0; row < height; row++) {
            const left = row * edge.width * 4;
            const right = left + (edge.width - 1) * 4;
            for (let column = 0; column < width; column++) {
              const offset = (row * width + column) * 4;
              const mix = column / width;
              const green = edge.data[left + 1] * (1 - mix) + edge.data[right + 1] * mix;
              const delta = (green - patch.data[offset + 1]) * (lightInk ? -1 : 1);
              const opacity = Math.max(0, Math.min(1, (delta - 3) / 8));
              if (!opacity) continue;
              for (let channel = 0; channel < 3; channel++) {
                const paper = edge.data[left + channel] * (1 - mix) + edge.data[right + channel] * mix;
                patch.data[offset + channel] += (paper - patch.data[offset + channel]) * opacity;
              }
            }
          }
          ctx.putImageData(patch, x, y);
        }

        const serif = '"Songti SC", "Songti TC", "Hiragino Mincho ProN", "Nanum Myeongjo", Georgia, serif';
        const sans = 'system-ui, sans-serif';
        const chinese = language.startsWith("zh");
        const cardSerif = chinese ? serif : language === "ja" ? '"Hiragino Mincho ProN", serif' : '"AppleMyungjo", serif';
        ctx.textBaseline = "middle";

        function line(text, x, y, size, width, options = {}) {
          const { color = "#3d3324", weight = 500, family = cardSerif, align = "center" } = options;
          ctx.textAlign = align;
          ctx.fillStyle = color;
          ctx.font = weight + " " + size + "px " + family;
          const measured = ctx.measureText(text).width;
          if (measured > width) ctx.font = weight + " " + Math.floor(size * width / measured) + "px " + family;
          ctx.fillText(text, x, y);
        }

        function wrapped(text, x, y, size, maxWidth, options) {
          ctx.font = (options.weight || 500) + " " + size + "px " + (options.family || cardSerif);
          const parts = [...new Intl.Segmenter(language, { granularity: "word" }).segment(text)];
          const rows = [""];
          for (const { segment } of parts) {
            const row = rows.at(-1);
            if (row.trim() && ctx.measureText(row + segment).width > maxWidth && segment.trim()) {
              rows.push(segment);
            } else {
              rows[rows.length - 1] += segment;
            }
          }
          rows.forEach((row, index) => line(row.trim(), x, y + index * (size + 9), size, maxWidth, options));
        }

        // Keep the printed borders, wing, stamp and airmail edges from the invitation.
        erasePrint(88, 242, 500, 344);
        erasePrint(85, 645, 510, 48);
        erasePrint(88, 782, 500, 64);
        line(copy["card-welcome-question"], 340, 276, 38, 510);
        line(copy["card-welcome-discount"], 340, 454, chinese ? 157 : 141, 512, { weight: 600 });
        line(copy["card-welcome-action"], 340, 668, 28, 511);
        const terms = copy["welcome-terms"].split(/(?<=[。.]|同，|異，)\s*/u).filter(Boolean);
        if (terms.length === 2) {
          terms.forEach((segment, index) => line(segment, 340, 799 + index * 30, 22, 499, { color: "#5e513a" }));
        } else {
          wrapped(copy["welcome-terms"], 340, 802, 21, 476, { color: "#5e513a" });
        }

        const silver = { color: "#202123", family: sans, weight: 650, align: "center" };
        const white = { ...silver, color: "#f8f8f6", weight: 720, align: "left" };
        erasePrint(720, 119, 365, 350, true);
        wrapBlackTitle();
        erasePrint(729, 583, 277, 170);
        erasePrint(1034, 583, 287, 170);
        erasePrint(735, 817, 580, 55);
        line(copy["card-annual"], 872, 664, 42, 270, silver);
        line(copy["card-lifetime"], 1165, 664, 42, 270, silver);
        line(copy["black-week-date"], 1024, 846, 29, 554, silver);

        function wrapBlackTitle() {
          const title = copy["black-week-title"];
          if (language === "ja" || language === "ko") {
            wrapped(title, 735, 213, 64, 335, white);
          } else {
            line(title, 735, 244, 81, 346, white);
          }
        }

        const blue = { color: "#183765", family: sans, align: "left" };
        const blueStrong = { ...blue, weight: 760 };
        erasePrint(1403, 143, 464, 216);
        erasePrint(1403, 388, 592, 165);
        erasePrint(1403, 580, 592, 296);
        wrapped(copy["sharing-title"], 1419, 221, 58, 456, { ...blueStrong, family: cardSerif });
        wrapped(copy["card-sharing-action"], 1419, 417, 25, 567, blue);
        line("#FocusFlight", 1419, 478, 30, 585, blueStrong);
        line("#FocusFlightChallenge", 1419, 523, 30, 585, blueStrong);
        line(copy["card-sharing-max"], 1419, 655, 59, 565, { ...blue, family: cardSerif, color: "#a84937", weight: 700 });
        for (const [index, threshold] of [10, 50, 100].entries()) {
          const [likes, days] = copy["card-sharing-" + threshold].split(" / ");
          const left = 1419 + index * 196;
          line(likes, left, 759, 25, 174, blue);
          line(days, left, 793, 27, 174, blueStrong);
        }
        line(copy["card-sharing-email"], 1419, 850, 22, 582, blue);

        return canvas.toDataURL("image/webp", 0.94).split(",")[1];
      }, { language, copy });
      await writeFile(join(output, language + ".webp"), Buffer.from(image, "base64"));
    }
    await page.close();
    for (const language of Object.keys(copies)) {
      for (const [shape, viewport] of [
        ["wide", { width: 1536, height: 960 }],
        ["portrait", { width: 828, height: 1792 }],
      ]) {
        const studio = await browser.newPage({ viewport, deviceScaleFactor: 1 });
        // Generate the static fallback using the production scene with offline
        // software rendering. Visitors keep the usual hardware eligibility test.
        await studio.route("**/*", route => {
          const url = new URL(route.request().url());
          if (url.origin !== new URL(base).origin) return route.abort();
          if (url.pathname === "/gift/render-preview") {
            return route.fulfill({
              contentType: "text/html",
              body: [
                '<!doctype html><html lang="' + language + '" data-gift-atlas="/gift/localized/' + language + '.webp">',
                "<style>body{margin:0;background:#030406}.gift{position:fixed;inset:0}canvas{display:block;width:100%;height:100%}#welcome{position:absolute;left:-1000px;width:300px;height:500px}</style>",
                '<section class="gift"><canvas></canvas></section><div id="download"></div><div id="welcome"><button></button></div>',
                '<script type="module">import { setupStudio } from "/gift/camera.js";',
                'setupStudio(document.querySelector("canvas"), document.getElementById("download"), document.getElementById("welcome"))(1, 1);</script>',
              ].join("\n"),
            });
          }
          if (url.pathname === "/hardware-gl.js") {
            return route.fulfill({
              contentType: "text/javascript",
              body: "export const getHardwareContext = (canvas, type, options) => canvas.getContext(type, options);",
            });
          }
          return route.continue();
        });
        await studio.goto(new URL("/gift/render-preview", base).href, { waitUntil: "domcontentloaded" });
        console.log("Rendering", language, shape);
        await studio.locator("canvas[data-ready]").waitFor({ state: "attached" });
        const capture = await studio.screenshot();
        const poster = await studio.evaluate(async png => {
          const screenshot = new Image();
          screenshot.src = "data:image/png;base64," + png;
          await screenshot.decode();
          const canvas = document.createElement("canvas");
          canvas.width = screenshot.width;
          canvas.height = screenshot.height;
          canvas.getContext("2d").drawImage(screenshot, 0, 0);
          return canvas.toDataURL("image/webp", 0.86).split(",")[1];
        }, capture.toString("base64"));
        await writeFile(join(output, language + "-" + shape + ".webp"), Buffer.from(poster, "base64"));
        await studio.close();
      }
    }
  } finally {
    await browser.close();
  }
}

build().catch(error => { console.error(error); process.exitCode = 1; });
