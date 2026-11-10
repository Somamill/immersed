import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("real morphology, level changes and hover pause/resume share the iOS policy", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#status")).toHaveText("Ready when you are");
  await page.evaluate(() => {
    (window as unknown as { eval(s: string): void }).eval(
      `youtube={getCurrentTime:()=>0.2,getPlayerState:()=>window.__paused?2:1,pauseVideo:()=>{window.__paused=true},playVideo:()=>{window.__paused=false}}; cues=[{start:0,end:4,text:'猫は政治について話します。'}]; cueIndex=-1; renderCue();`,
    );
  });
  await expect(page.locator(".word").filter({ hasText: "政治" })).toHaveClass(
    /unknown/,
  );
  await expect(page.locator(".word").filter({ hasText: "猫" })).not.toHaveClass(
    /unknown/,
  );
  await page.locator(".word").filter({ hasText: "政治" }).hover();
  await expect(page.locator("#lookup")).toHaveClass(/show/);
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __paused: boolean }).__paused,
      ),
    )
    .toBe(true);
  await expect(page.locator("#definitions")).toContainText(
    /politic|government/i,
  );
  await page.locator("#closeLookup").click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { __paused: boolean }).__paused,
      ),
    )
    .toBe(false);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByLabel("Completed Japanese level").selectOption("1");
  await page.locator("#closePanel").click();
  await expect(page.locator(".unknown")).toHaveCount(0);
  await page.locator(".word").filter({ hasText: "猫" }).click();
  await page.locator("#known").click();
  await expect(page.locator(".word").filter({ hasText: "猫" })).toHaveClass(
    /unknown/,
  );
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Completed Japanese level")).toHaveValue("1");
});

test("MP4/M4B-style local media flows work while all remote requests are blocked", async ({
  page,
}) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "immersed-ui-"));
  const audio = path.join(folder, "日本語.m4b");
  const video = path.join(folder, "日本語.mp4");
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:a",
    "aac",
    audio,
  ]);
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=black:size=320x180:rate=24:duration=2",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    video,
  ]);
  try {
    await page.route("https://**", (route) => route.abort());
    await page.route("**/api/desktop/local-transcript?**", (route) =>
      route.fulfill({
        json: {
          status: "ready",
          source: "generated",
          cues: [{ start: 0, end: 2, text: "日本語です。" }],
        },
      }),
    );
    await page.goto("/");
    await page.locator("#fileInput").setInputFiles(audio);
    await expect(page.locator(".audioBook h2")).toHaveText("日本語.m4b");
    await expect(page.locator("#count")).toHaveText("1 segments");
    await page.locator("#play").click();
    await expect
      .poll(() =>
        page
          .locator("audio")
          .evaluate((audio: HTMLAudioElement) => audio.currentTime),
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Library", exact: true }).click();
    await expect(page.locator("#panelBody")).toContainText("日本語.m4b");
    await page.locator("#closePanel").click();
    await page.locator("#fileInput").setInputFiles(video);
    await expect(page.locator("video")).toHaveCount(1);
    await page.locator("#play").click();
    await expect
      .poll(() =>
        page
          .locator("video")
          .evaluate((video: HTMLVideoElement) => video.currentTime),
      )
      .toBeGreaterThan(0);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("original-language search filtering excludes unknown and dubbed metadata", async ({
  page,
}) => {
  await page.route("**/api/desktop/search?**", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "aaaaaaaaaaa",
            title: "日本語オリジナル",
            duration: 1400,
            language: "ja",
            isShort: false,
          },
          {
            id: "bbbbbbbbbbb",
            title: "English original",
            duration: 1400,
            language: "en",
            isShort: false,
          },
          {
            id: "ccccccccccc",
            title: "Unknown source",
            duration: 1400,
            language: null,
            isShort: false,
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.locator("#query").fill("歴史");
  await page.locator("#search").getByRole("button").click();
  await expect(page.locator("#panelBody")).toContainText("日本語オリジナル");
  await expect(page.locator("#panelBody")).not.toContainText(
    "English original",
  );
  await expect(page.locator("#panelBody")).not.toContainText("Unknown source");
});

test("near-N1 screenshot passage stays quiet and manual unknown uses an underline", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "immersed.preferences",
      JSON.stringify({ level: 2, knowledge: { 体験: true } }),
    ),
  );
  await page.goto("/");
  await page.evaluate(() => {
    (window as unknown as { eval(s: string): void }).eval(
      `youtube={getCurrentTime:()=>0.2,getPlayerState:()=>2,pauseVideo:()=>{},playVideo:()=>{}};cues=[{start:0,end:4,text:'個人的な体験とは何かみたいな話をどんどんなさってるんですよね'}];cueIndex=-1;renderCue();`,
    );
  });
  await expect(page.locator(".word").filter({ hasText: "体験" })).toBeVisible();
  await expect(page.locator(".unknown")).toHaveCount(0);
  await expect(page.locator("rt")).toHaveCount(0);
  await page.locator(".word").filter({ hasText: "体験" }).click();
  await page.locator("#known").click();
  const marked = page.locator(".word.unknown").filter({ hasText: "体験" });
  await expect(marked).toBeVisible();
  await expect(marked).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(marked).toHaveCSS("text-decoration-line", "underline");
});

test("audiobook cover, chapter, speed and listening position survive reopening", async ({
  page,
  request,
}) => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "immersed-resume-"));
  try {
    const cover = path.join(folder, "cover.jpg"),
      metadata = path.join(folder, "chapters.txt"),
      audio = path.join(folder, "resume.m4b");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=200x200",
      "-frames:v",
      "1",
      cover,
    ]);
    fs.writeFileSync(
      metadata,
      ";FFMETADATA1\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=5000\ntitle=第一章\n[CHAPTER]\nTIMEBASE=1/1000\nSTART=5000\nEND=12000\ntitle=第二章\n",
    );
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=12",
      "-i",
      cover,
      "-i",
      metadata,
      "-map",
      "0:a",
      "-map",
      "1:v",
      "-map_chapters",
      "2",
      "-c:a",
      "aac",
      "-c:v",
      "copy",
      "-disposition:v",
      "attached_pic",
      audio,
    ]);
    const response = await request.post("/api/desktop/import?name=resume.m4b", {
      headers: { "X-Immersed-Request": "1" },
      data: fs.readFileSync(audio),
    });
    expect(response.ok()).toBe(true);
    const item = await response.json();
    await page.route("**/api/desktop/local-transcript?**", (route) =>
      route.fulfill({
        json: { status: "ready", cues: [], source: "generated" },
      }),
    );
    await page.goto("/");
    await page.evaluate((id) => (window as any).openLocalMedia(id), item.id);
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.readyState),
      )
      .toBeGreaterThanOrEqual(1);
    await expect
      .poll(() =>
        page
          .locator(".bookCover")
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.locator("audio").evaluate((audio: HTMLAudioElement) => {
      audio.currentTime = 7;
      audio.playbackRate = 1.5;
    });
    await page.evaluate(() => (window as any).flushPlayback());
    await expect(page.locator("#chapterSelect")).toHaveValue("5");
    await page.reload();
    await page.evaluate((id) => (window as any).openLocalMedia(id), item.id);
    await expect
      .poll(() =>
        page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
      )
      .toBeCloseTo(7, 0);
    await expect(page.locator("audio")).toHaveJSProperty("playbackRate", 1.5);
    await expect(page.locator("#chapterSelect")).toHaveValue("5");
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

test("switching Whisper models immediately refreshes captions and confidence flags", async ({
  page,
}) => {
  const qualities: string[] = [];
  await page.route("**/api/desktop/transcribe?**", (route) => {
    const quality =
      new URL(route.request().url()).searchParams.get("quality") || "balanced";
    if (route.request().method() === "POST") qualities.push(quality);
    return route.fulfill({
      json: {
        status: "ready",
        source: "generated",
        cues: [
          {
            start: 0,
            end: 4,
            text: "日本語です。",
            ...(quality === "accurate" ? { uncertain: true } : {}),
          },
        ],
      },
    });
  });
  await page.goto("/");
  await page.evaluate(() =>
    (window as any).eval(
      "extras.speechQuality='balanced';source={type:'youtube',id:'abcdefghijk'};youtube={getCurrentTime:()=>1,getPlayerState:()=>2};void beginTranscript();",
    ),
  );
  await expect(page.locator("#subtitles .line")).toHaveCount(1);
  await expect(page.locator("#subtitles .line")).not.toHaveClass(/uncertain/);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Speech model", { exact: true })
    .selectOption("accurate");
  await expect.poll(() => qualities).toEqual(["balanced", "accurate"]);
  await expect(page.locator("#subtitles .line")).toHaveClass(/uncertain/);
  await page.locator("#closePanel").click();
  await page.evaluate(() =>
    (window as any).eval("youtube.getCurrentTime=()=>10;void renderCue();"),
  );
  await expect(page.locator("#subtitles")).toHaveText("");
});

test("model comparison aligns wording across cue boundaries and reports missing speech", async ({
  page,
}) => {
  await page.route("**/api/desktop/transcribe?**", (route) =>
    route.fulfill({
      json: {
        status: "ready",
        cues: [
          { start: 0, end: 4, text: "今日は日本語です。" },
          { start: 6, end: 8, text: "追加です。" },
        ],
      },
    }),
  );
  await page.goto("/");
  await page.evaluate(() =>
    (window as any).eval(
      "source={type:'youtube',id:'abcdefghijk'};youtube={getCurrentTime:()=>1,getPlayerState:()=>2};cues=[{start:0,end:2,text:'今日は'},{start:2,end:4,text:'日本語です。'}];void compareTranscript();",
    ),
  );
  await expect(page.locator("#panelBody .entry")).toHaveCount(1);
  await expect(page.locator("#panelBody .entry")).toContainText(
    "Current: No speech recognized",
  );
  await expect(page.locator("#panelBody .entry")).toContainText(
    "Second model: 追加です。",
  );
});

test("inflected dictionary lookup, compound hover and quiet gaps work without maintenance buttons", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    (window as any).eval(
      "source={type:'youtube',id:'abcdefghijk'};youtube={getCurrentTime:()=>1,getPlayerState:()=>2};cues=[{start:0,end:4,text:'水を吸い取り、すくい取り'}];cueIndex=-1;void renderCue();",
    ),
  );
  await expect(
    page.getByRole("button", { name: "Look up 吸い取り", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Look up すくい取り", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Look up 吸い取り", exact: true })
    .click();
  await expect(page.locator("#definitions")).toContainText("to absorb");
  await expect(page.locator("#definitions")).toContainText("吸い取る");
  await expect(page.locator("#definitions")).toContainText("transitive verb");
  await page.locator("#closeLookup").click();
  await expect(page.locator("#retry,#compare")).toHaveCount(0);
  await page.evaluate(() =>
    (window as any).eval("youtube.getCurrentTime=()=>10;void renderCue();"),
  );
  await expect(page.locator("#subtitles")).toHaveText("");
  await page.getByRole("button", { name: "Words", exact: true }).click();
  await page.getByLabel("Search dictionary", { exact: true }).fill("吸い取り");
  await page.getByLabel("Search dictionary", { exact: true }).press("Enter");
  await expect(page.locator("#panelBody")).toContainText("吸い取る");
});

test("temporary subtitle failures recover automatically with no regenerate control", async ({
  page,
}) => {
  let attempts = 0;
  await page.route("**/api/desktop/transcribe?**", (route) => {
    if (route.request().method() === "POST") attempts++;
    return route.fulfill({
      json:
        attempts < 2
          ? {
              status: "unavailable",
              canRetry: true,
              message: "Temporary interruption",
            }
          : {
              status: "ready",
              cues: [{ start: 0, end: 4, text: "回復しました。" }],
            },
    });
  });
  await page.goto("/");
  await page.evaluate(() =>
    (window as any).eval(
      "source={type:'youtube',id:'abcdefghijk'};youtube={getCurrentTime:()=>1,getPlayerState:()=>2};void beginTranscript();",
    ),
  );
  await expect(
    page.getByRole("button", { name: "Look up 回復しました", exact: true }),
  ).toBeVisible();
  expect(attempts).toBe(2);
  await expect(page.locator("#retry")).toHaveCount(0);
});

test("repairs the forced large-v3 default and preserves kanji, reading preferences and later model choices", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("test.kanjiSeeded")) {
      localStorage.setItem("test.kanjiSeeded", "true");
      localStorage.setItem("immersed.accuracyDefault", "true");
      localStorage.setItem(
        "immersed.mac.options",
        JSON.stringify({ speechQuality: "accurate" }),
      );
      localStorage.setItem(
        "immersed.preferences",
        JSON.stringify({
          level: 2,
          readings: false,
          knowledge: { 体験: true },
        }),
      );
    }
  });
  const qualities: string[] = [];
  await page.route("**/api/desktop/transcribe?**", (route) => {
    qualities.push(
      new URL(route.request().url()).searchParams.get("quality") || "",
    );
    return route.fulfill({
      json: {
        status: "ready",
        cues: [{ start: 0, end: 4, text: "体は深い眠りを求める。" }],
      },
    });
  });
  await page.goto("/");
  await page.evaluate(() =>
    (window as any).eval(
      "source={type:'youtube',id:'abcdefghijk'};youtube={getCurrentTime:()=>1,getPlayerState:()=>2};void beginTranscript();",
    ),
  );
  await expect(page.locator("#subtitles")).toHaveText("体は深い眠りを求める。");
  expect(qualities.every((q) => q === "balanced")).toBe(true);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Speech model", { exact: true })).toHaveValue(
    "balanced",
  );
  await expect(page.getByLabel("Completed Japanese level")).toHaveValue("2");
  await expect(page.getByLabel("Furigana", { exact: true })).not.toBeChecked();
  await page
    .getByLabel("Speech model", { exact: true })
    .selectOption("accurate");
  await page.reload();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Speech model", { exact: true })).toHaveValue(
    "accurate",
  );
});
