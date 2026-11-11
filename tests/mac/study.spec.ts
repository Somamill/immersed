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
  await expect(page.locator("#discoveryBody")).toContainText("日本語オリジナル");
  await expect(page.locator("#discoveryBody")).not.toContainText(
    "English original",
  );
  await expect(page.locator("#discoveryBody")).not.toContainText("Unknown source");
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

test("search presents confirmed results progressively and has an immediate language toggle", async ({
  page,
}) => {
  let ready = false;
  const first = {
    id: "aaaaaaaaaaa",
    title: "First Japanese interview",
    duration: 800,
    channel: "Interview channel",
    language: "ja",
    checked: true,
  };
  const second = {
    id: "bbbbbbbbbbb",
    title: "Second Japanese interview",
    duration: 900,
    channel: "Books",
    language: ready ? "ja" : null,
    checked: ready,
  };
  await page.route("**/api/desktop/search?**", (route) =>
    route.fulfill({
      json: {
        status: ready ? "ready" : "checking",
        checked: ready ? 2 : 1,
        total: 2,
        items: [first, { ...second, language: ready ? "ja" : null }],
      },
    }),
  );
  await page.goto("/");
  await page.locator("#query").fill("読書");
  await page.locator("#search").getByRole("button").click();
  await expect(
    page.getByRole("button", {
      name: "Watch First Japanese interview",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Watch Second Japanese interview",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".searchSummary")).toContainText("1/2");
  await page.getByLabel("Original Japanese only", { exact: true }).uncheck();
  await expect(
    page.getByRole("button", {
      name: "Watch Second Japanese interview",
      exact: true,
    }),
  ).toBeVisible();
  ready = true;
  await expect(page.locator(".searchSummary")).toContainText("2 videos");
});

test("word definitions are ready with sentence analysis before the first lookup", async ({
  page,
}) => {
  let requests = 0;
  await page.route("**/api/immersion/dictionary?**", (route) => {
    requests++;
    return route.abort();
  });
  await page.goto("/");
  await page.evaluate(() =>
    (window as any).eval(
      "source={type:'youtube',id:'abcdefghijk'};youtube={getCurrentTime:()=>1,getPlayerState:()=>2};cues=[{start:0,end:5,text:'水を吸い取りました。'}];cueIndex=-1;void renderCue();",
    ),
  );
  await page
    .getByRole("button", { name: "Look up 吸い取りました", exact: true })
    .click();
  await expect(page.locator("#definitions")).toContainText("to absorb");
  expect(requests).toBe(0);
});

test("video fullscreen button and F key expand only the player", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Video fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe("video");
  await page.keyboard.press("f");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByRole("button", { name: "Video fullscreen", exact: true }).click();
  await page.getByRole("button", { name: "Exit video fullscreen", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  await page.getByRole("button", { name: "Video fullscreen", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => document.fullscreenElement === null)).toBe(true);
});


test("context explanation uses neighboring captions without delaying definitions", async ({ page }) => {
  let received: Record<string, string> = {};
  let finish: () => void = () => {};
  const gate = new Promise<void>(resolve => { finish = resolve; });
  await page.route("**/api/immersion/context-meaning?*", async route => {
    received = Object.fromEntries(new URL(route.request().url()).searchParams);
    await gate;
    await route.fulfill({ json: { status: "ready", gloss: "line of reasoning", explanation: "Here 筋 refers to the logic of his argument, in 筋が通る." } });
  });
  await page.goto("/");
  await page.evaluate(() => {
    (window as any).eval(`youtube={getCurrentTime:()=>4.2,getPlayerState:()=>2,pauseVideo:()=>{}}; cues=[{start:0,end:4,text:'彼の意見を聞いた。'},{start:4,end:8,text:'彼の主張は筋が通っている。'},{start:8,end:12,text:'だから納得した。'}]; cueIndex=-1; renderCue();`);
  });
  await page.locator(".word").filter({ hasText: "筋" }).click();
  await expect(page.locator("#definitions")).not.toHaveText("Looking up…");
  await expect.poll(() => received.before).toBe("彼の意見を聞いた。");
  expect(received.after).toBe("だから納得した。");
  expect(received.sentence.slice(Number(received.start), Number(received.end))).toBe("筋");
  finish();
  await expect(page.locator("#contextMeaning")).toContainText("line of reasoning");

});

test("subtitle navigation skips complete blocks, including rapid presses and gaps", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => (window as any).eval(`
    window.__time=15;window.__seeks=[];
    youtube={getCurrentTime:()=>window.__time,getPlayerState:()=>2,seekTo:t=>window.__seeks.push(t)};
    cues=[{start:0,end:8,text:'最初。'},{start:10,end:20,text:'二つ目。'},{start:30,end:40,text:'三つ目。'}];cueIndex=-1;renderCue();
  `));
  await page.getByRole("button", { name: "Previous subtitle", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__seeks.at(-1))).toBeCloseTo(0.015);
  await page.getByRole("button", { name: "Next subtitle", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__seeks.at(-1))).toBeCloseTo(10.015);
  await page.getByRole("button", { name: "Next subtitle", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__seeks.at(-1))).toBeCloseTo(30.015);
  await page.evaluate(() => (window as any).eval("cueSeek=null;window.__time=25;"));
  await page.getByRole("button", { name: "Previous subtitle", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__seeks.at(-1))).toBeCloseTo(10.015);
});

test("hover card keeps subtitles stable and resumes after a delayed YouTube pause", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => (window as any).eval(`
    window.__state=1;window.__pauses=0;window.__plays=0;
    youtube={getCurrentTime:()=>0.3,getPlayerState:()=>window.__state,
      pauseVideo:()=>{window.__pauses++;setTimeout(()=>{window.__state=2;handleYouTubeState({data:2})},500)},
      playVideo:()=>{window.__plays++;if(window.__state===2){window.__state=1;handleYouTubeState({data:1})}}};
    cues=[{start:0,end:4,text:'政治について話します。'}];cueIndex=-1;renderCue();
  `));
  const word = page.getByRole("button", { name: "Look up 政治", exact: true });
  const before = await word.boundingBox();
  await word.hover();
  await expect(page.locator("#lookup")).toHaveClass(/show/);
  const after = await word.boundingBox();
  expect(after?.y).toBeCloseTo(before!.y, 0);
  await page.getByRole("button", { name: "Save word", exact: true }).hover();
  await expect(page.locator("#lookup")).toHaveClass(/show/);
  const action = await page.locator(".lookupActions").boundingBox();
  expect(action!.y + action!.height).toBeLessThanOrEqual(1000);
  await page.mouse.move(10, 85);
  await expect(page.locator("#lookup")).not.toHaveClass(/show/);
  await expect.poll(() => page.evaluate(() => (window as any).__state)).toBe(1);
  expect(await page.evaluate(() => (window as any).__pauses)).toBe(1);
  // A paused video is never started merely because a lookup ended.
  await page.evaluate(() => (window as any).eval("window.__state=2;resumePending=false;"));
  await word.hover();
  await expect(page.locator("#lookup")).toHaveClass(/show/);
  await page.mouse.move(10,85);
  await expect(page.locator("#lookup")).not.toHaveClass(/show/);
  expect(await page.evaluate(() => (window as any).__state)).toBe(2);
});

test("fullscreen keeps live word lookup and speed control inside the video", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => (window as any).eval(`youtube={getCurrentTime:()=>0.3,getPlayerState:()=>2,pauseVideo:()=>{}};cues=[{start:0,end:4,text:'政治について話します。'}];cueIndex=-1;renderCue();`));
  await expect(page.getByRole("button", { name:"Look up 政治", exact:true })).toBeVisible();
  await page.getByRole("button", {name:"Video fullscreen",exact:true}).click();
  await page.locator("#fullscreenStudy").getByRole("button", {name:"Look up 政治",exact:true}).hover();
  await expect(page.locator("#video #lookup")).toHaveClass(/show/);
  await expect(page.locator("#definitions")).toContainText(/politic|government/i);
  await expect(page.locator("#saveWord")).toBeInViewport();
  await page.getByRole("button", {name:"Close lookup",exact:true}).click();
  await page.getByRole("button", {name:"Playback speed",exact:true}).click();
  await page.getByRole("menuitemradio", {name:"1.5×",exact:true}).click();
  await expect(page.locator("#speedValue")).toHaveText("1.5×");
  await page.keyboard.press("Escape");
  await expect(page.locator(".studyCard #subtitles")).toBeVisible();
  await expect(page.locator(".studyCard #controls")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("immersed.mac.options")!).playbackRate)).toBe(1.5);
});

test("opening a video clears its URL and saving offline keeps playback in place", async ({ page }) => {
  await page.route("**/api/desktop/video-info?*", route => route.fulfill({json:{language:"ja",duration:1000,title:"Japanese conversation"}}));
  await page.route("**/api/desktop/transcribe?*", route => route.fulfill({json:{status:"ready",cues:[{start:0,end:5,text:"政治について話します。"}]}}));
  await page.route("**/api/desktop/download?*", route => route.fulfill({json:{id:"saved-video"}}));
  await page.goto("/");
  await page.evaluate(() => (window as any).eval(`
    loadYouTubeAPI=()=>Promise.resolve();
    window.YT={Player:class {constructor(id,options){window.__playerOptions=options;queueMicrotask(()=>options.events.onReady());}getCurrentTime(){return 0.3;}getPlayerState(){return 2;}setPlaybackRate(){}destroy(){}}};
  `));
  await page.getByRole("textbox",{name:"Search YouTube or paste a video link"}).fill("https://www.youtube.com/watch?v=5C3hh2fO4mE&t=6m4s");
  await page.locator("#search").getByRole("button").click();
  await expect(page.locator("#query")).toHaveValue("");
  await expect(page.locator("#count")).toContainText("1 segments");
  await expect(page.locator("#status")).toBeEmpty();
  await page.getByRole("button",{name:"Save video for offline playback",exact:true}).click();
  await expect(page.locator("#downloadLabel")).toHaveText("Saved offline ✓");
  expect(await page.evaluate(() => (window as any).eval("source.type"))).toBe("youtube");
  expect(await page.evaluate(() => (window as any).__playerOptions.playerVars.fs)).toBe(0);
  expect(await page.evaluate(() => (window as any).__playerOptions.playerVars.start)).toBe(364);
});

test("video text needs two matching frames before replacing an acoustic caption", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => (window as any).eval(`
    youtube={getCurrentTime:()=>1,getPlayerState:()=>2,pauseVideo:()=>{}};
    source={type:'youtube',id:'5C3hh2fO4mE'};
    cues=[{start:0,end:4,text:'市場の境界という概念があるんですよ'}];cueIndex=-1;renderCue();
    window.__frameKey=requestGeneration+':'+screenCaptionKey(cues[0]);
    screenFrames.set(window.__frameKey,{cue:cues[0],original:cues[0].text,confirmations:0});
  `));
  await page.evaluate(() => (window as any).immersedVideoText((window as any).__frameKey,['「紙の教会」という概念がある']));
  await expect(page.locator("#subtitles")).toContainText("市場");
  await page.evaluate(() => (window as any).immersedVideoText((window as any).__frameKey,['「紙の教会」という概念がある']));
  await expect(page.locator("#subtitles")).toContainText("紙");
  await expect(page.locator("#subtitles")).toContainText("教会");
  expect(await page.evaluate(() => (window as any).eval("cues[0].asrText"))).toContain("市場の境界");
});

 test("on-screen caption updates preserve the text of an open lookup", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => (window as any).eval(`youtube={getCurrentTime:()=>1,getPlayerState:()=>2,pauseVideo:()=>{}};source={type:'youtube',id:'5C3hh2fO4mE'};cues=[{start:0,end:4,text:'市場の境界という概念があるんですよ'}];cueIndex=-1;renderCue();window.__frameKey=requestGeneration+':'+screenCaptionKey(cues[0]);screenFrames.set(window.__frameKey,{cue:cues[0],original:cues[0].text,confirmations:0});`));
  await page.getByRole("button", {name:"Look up 市場",exact:true}).click();
  await page.evaluate(() => (window as any).immersedVideoText((window as any).__frameKey,['「紙上の教会」という概念がある']));
  await page.evaluate(() => (window as any).immersedVideoText((window as any).__frameKey,['「紙上の教会」という概念がある']));
  await expect(page.locator("#lookupWord")).toHaveText("市場");
  await expect(page.locator("#subtitles")).toContainText("市場");
});

test("Discover shares length settings, favors conversations, and ignores stale topic responses", async ({ page }) => {
  let releaseOld: (() => void) | undefined;
  const requests: URL[] = [];
  await page.route("**/api/desktop/search?**", async route => {
    const url = new URL(route.request().url()); requests.push(url);
    if (url.searchParams.get("query") === "日本語 ポッドキャスト") {
      await new Promise<void>(resolve => { releaseOld = resolve; });
      await route.fulfill({ json: { status: "ready", items: [{ id: "oldoldoldol", title: "Old podcast", duration: 4000, language: "ja" }] } });
      return;
    }
    await route.fulfill({ json: { status: "ready", items: [
      { id: "aaaaaaaaaaa", title: "文化の対談", duration: 2400, language: "ja" },
      { id: "bbbbbbbbbbb", title: "短い会話", duration: 600, language: "ja" },
      { id: "ccccccccccc", title: "English interview", duration: 4000, language: "en" },
      { id: "ddddddddddd", title: "作業用BGM", duration: 7000, language: "ja" },
      { id: "eeeeeeeeeee", title: "Japanese Short", duration: 2400, language: "ja", isShort: true },
    ] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.locator("#panelBody").getByLabel("Minimum video length", { exact: true }).selectOption("30");
  await page.locator("#closePanel").click();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Discover", exact: true })).toBeVisible();
  await expect(page.locator("#discoveryBody").getByLabel("Minimum video length", { exact: true })).toHaveValue("30");
  await expect(page.locator(".searchVideo")).toHaveCount(1);
  await expect(page.locator(".searchVideo")).toContainText("文化の対談");
  await page.screenshot({ path: "work/discovery-preview.png", fullPage: true });
  expect(requests.at(-1)?.searchParams.get("conversation")).toBe("true");
  expect(requests.at(-1)?.searchParams.get("minimumMinutes")).toBe("30");
  await page.locator("#discoveryBody").getByLabel("Minimum video length", { exact: true }).selectOption("0");
  await expect(page.locator(".searchVideo")).toHaveCount(2);
  await page.locator("#discoveryBody").getByLabel("Conversation first", { exact: true }).uncheck();
  await expect(page.locator(".searchVideo")).toHaveCount(3);
  await page.getByRole("button", { name: "Podcasts", exact: true }).click();
  await expect.poll(() => Boolean(releaseOld)).toBe(true);
  await page.getByRole("button", { name: "Interviews", exact: true }).click();
  await expect(page.locator(".searchSummary h2")).toHaveText("Interviews");
  releaseOld!();
  await expect(page.locator("#discoveryBody")).not.toContainText("Old podcast");
  await page.getByRole("button", { name: "Watch", exact: true }).click();
  await expect(page.locator("#watchPage")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.locator("#panelBody").getByLabel("Minimum video length", { exact: true })).toHaveValue("0");
  await expect(page.locator("#panelBody").getByLabel("Conversation first", { exact: true })).not.toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "Discover", exact: true }).click();
  await expect(page.locator("#discoveryBody").getByLabel("Conversation first", { exact: true })).not.toBeChecked();
});

test("more discovery results retain the first page and use the same filters", async ({ page }) => {
  await page.route("**/api/desktop/search?**", route => {
    const params = new URL(route.request().url()).searchParams;
    const second = params.get("page") === "2";
    return route.fulfill({json:{status:"ready",hasMore:!second,items:[{id:second?"bbbbbbbbbbb":"aaaaaaaaaaa",title:second?"Second interview":"First interview",duration:3600,language:"ja"}]}});
  });
  await page.goto("/"); await page.locator("#discoverButton").click();
  await page.getByRole("button", {name:"Find more videos",exact:true}).click();
  await expect(page.locator(".searchVideo")).toHaveCount(2);
  await expect(page.getByRole("button", {name:"Find more videos",exact:true})).toBeHidden();
});

test("speech progress is measured and trackpad commands use subtitle boundaries in fullscreen", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => (window as any).eval(`speechProgress({status:'processing',phase:'loading'});`));
  await expect(page.locator("#speechBar")).not.toHaveAttribute("value");
  await page.evaluate(() => (window as any).eval(`speechProgress({status:'processing',phase:'recognizing',duration:60,processedSeconds:15});youtube={getCurrentTime:()=>7,getPlayerState:()=>2,seekTo:t=>window.__seek=t};cues=[{start:0,end:4,text:'一'},{start:5,end:9,text:'二'},{start:10,end:14,text:'三'}];`));
  await expect(page.locator("#speechPercent")).toHaveText("25%");
  await page.locator("#fullscreen").click();
  await page.evaluate(() => (window as any).immersedTrackpad(1));
  await expect.poll(() => page.evaluate(() => (window as any).__seek)).toBeCloseTo(10.015);
  await page.evaluate(() => (window as any).eval(`speechProgress({status:'ready'});`));
  await page.locator("#exitVideoFullscreen").click();
  await expect(page.locator("#speechProgress")).toBeHidden();
});
