"use strict";
const $ = (id) => document.getElementById(id),
  el = (tag, text, cls) => {
    const e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(seconds)),
    hours = Math.floor(total / 3600),
    minutes = Math.floor((total % 3600) / 60),
    s = String(total % 60).padStart(2, "0");
  return hours
    ? hours + ":" + String(minutes).padStart(2, "0") + ":" + s
    : minutes + ":" + s;
}
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
let prefs = ImmersedPreferences.restorePreferences(
  read("immersed.preferences", {}),
);
if (!localStorage.getItem("immersed.preferences")) {
  prefs.level = Number(
    (localStorage.getItem("immersed.mac.level") || "N5").slice(1),
  );
  for (const word of read("immersed.mac.known", []))
    prefs.knowledge[word] = true;
}
let extras = {
    blockAds: true,
    originalOnly: true,
    hoverLookup: true,
    screenCaptionCheck: true,
    pauseOnHover: true,
    speechQuality: "balanced",
    playbackRate: 1,
    ...read("immersed.mac.options", {}),
  },
  saved = read("immersed.savedWords", []);
let localMedia = null,
  youtube = null,
  source = null,
  cues = [],
  cueIndex = -1,
  pollTimer = null,
  renderGeneration = 0,
  requestGeneration = 0,
  selected = null,
  lookupEntries = [],
  lookupMeaning = "",
  lookupPinned = false,
  resumeAfterLookup = false,
  resumePending = false,
  lookupAnchor = null,
  cueSeek = null,
  hoverTimer = null,
  leaveTimer = null,
  levels = {},
  library = [],
  youtubeReady = null;
// Repair the 0.9.5 forced model switch. Later explicit model choices persist.
if (!read("immersed.kanjiDefault", false)) {
  extras.speechQuality = "balanced";
  try {
    localStorage.setItem("immersed.kanjiDefault", "true");
    localStorage.setItem("immersed.mac.options", JSON.stringify(extras));
  } catch {}
}
const screenCaptions = read("immersed.screenCaptions", {});
const screenFrames = new Map();
let transcriptKind = "generated", lastScreenScan = 0;
function screenCaptionKey(cue) { return [source?.id, extras.speechQuality, cue.start.toFixed(2), cue.end.toFixed(2)].join(":"); }
function restoredScreenCaption(cue) {
  const stored = screenCaptions[screenCaptionKey(cue)];
  return stored?.original === cue.text ? { ...cue, text: stored.text, asrText: cue.text, screenVerified: true } : cue;
}
function scanCurrentVideoCaption(now) {
  if (!extras.screenCaptionCheck || !document.hasFocus() || selected || !window.webkit?.messageHandlers?.immersed || source?.type !== "youtube" || !["generated", "youtube-asr"].includes(transcriptKind) || document.visibilityState === "hidden" || now - lastScreenScan < 900) return;
  const cue = cues[cueIndex];
  if (!cue || cue.screenVerified || (playing() && currentTime() - cue.start < 0.2)) return;
  const key = requestGeneration + ":" + screenCaptionKey(cue);
  let frame = screenFrames.get(key);
  if (!frame) {
    frame = { cue, original: cue.text, attempts: 0, confirmations: 0, pending: false, complete: false };
    screenFrames.set(key, frame);
  }
  if (frame.pending || frame.complete || frame.attempts >= 4) return;
  const rect = $("video").getBoundingClientRect();
  if (rect.width < 100 || rect.height < 50) return;
  frame.pending = true; frame.attempts++;
  lastScreenScan = now;
  window.webkit.messageHandlers.immersed.postMessage({ action: "captionFrame", key,
    videoId: source.id, at: cue.start + Math.min(0.8, (cue.end - cue.start) * 0.4) });
  setTimeout(() => { frame.pending = false; }, 22000);
}
window.immersedVideoText = async (key, lines) => {
  const frame = screenFrames.get(key);
  if (!frame || !Array.isArray(lines) || !key.startsWith(requestGeneration + ":")) return;
  if (!extras.screenCaptionCheck || selected) { frame.pending = false; return; }
  try {
    const result = await api("immersion/screen-caption", { sentence: frame.original, lines: JSON.stringify(lines) });
    if (!screenFrames.has(key)) return;
    frame.responses = (frame.responses || 0) + 1;
    if (frame.responses >= 2) frame.complete = true;
    if (!result.match) return;
    frame.confirmations = frame.text === result.match.text ? frame.confirmations + 1 : 1;
    frame.text = result.match.text;
    if (frame.confirmations < 2) return;
    frame.complete = true;
    const index = cues.findIndex(c => c.start === frame.cue.start && (c.text === frame.original || c.asrText === frame.original));
    if (index < 0) return;
    const correction = { original: frame.original, text: frame.text };
    screenCaptions[screenCaptionKey(cues[index])] = correction;
    const keys = Object.keys(screenCaptions);
    for (const old of keys.slice(0, Math.max(0, keys.length - 800))) delete screenCaptions[old];
    try { localStorage.setItem("immersed.screenCaptions", JSON.stringify(screenCaptions)); } catch {}
    cues[index] = { ...cues[index], screenText: frame.text, asrText: frame.original, screenVerified: true };
    if (!selected) { cues[index].text = frame.text; cueIndex = -1; void renderCue(); }
  } catch { /* Keep acoustic subtitles when the frame cannot be matched. */ }
  finally { frame.pending = false; }
};
const positions = read("immersed.positions", {});
let lastPositionSave = 0,
  coverageTokens = [];
const analysisCache = new Map(),
  dictionaryCache = new Map(),
  pendingAnalysis = new Map();
function persist() {
  try {
    localStorage.setItem("immersed.preferences", JSON.stringify(prefs));
    localStorage.setItem("immersed.mac.options", JSON.stringify(extras));
    localStorage.setItem("immersed.savedWords", JSON.stringify(saved));
  } catch {
    status("Settings could not be saved. Export a backup from Settings.", true);
  }
}
function applyPreferences() {
  document.body.classList.toggle("light", !prefs.dark);
  window.webkit?.messageHandlers?.immersed?.postMessage({
    action: "blockAds",
    enabled: extras.blockAds,
  });
  cueIndex = -1;
  void renderCue();
  updateCoverage();
}
function status(text, error = false) {
  $("status").textContent = text;
  $("status").className = error ? "error" : "";
}
async function api(route, params = {}, method = "GET", body) {
  const response = await fetch(
    "/api/" + route + "?" + new URLSearchParams(params),
    {
      method,
      headers: method === "GET" ? {} : { "X-Immersed-Request": "1" },
      body,
    },
  );
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Request failed");
  return data;
}
function cacheSet(cache, key, value, max = 250) {
  cache.set(key, value);
  if (cache.size > max) cache.delete(cache.keys().next().value);
}
function analyze(text) {
  if (analysisCache.has(text)) return Promise.resolve(analysisCache.get(text));
  if (pendingAnalysis.has(text)) return pendingAnalysis.get(text);
  const task = api("immersion/analyze", { text, dictionary: "prefetch" })
    .then((data) => {
      cacheSet(analysisCache, text, data.tokens);
      for (const token of data.tokens) {
        const key = ["particle", "auxiliary"].includes(token.pos)
          ? "grammar:" + token.pos + ":" + token.lemma
          : token.proper
            ? token.lemma + ":name:" + token.reading
            : token.lemma;
        const exact = [
          token.lemma,
          token.reading,
          token.pos,
          token.proper,
        ].join(":");
        if (data.lookups && Object.hasOwn(data.lookups, exact))
          cacheSet(dictionaryCache, exact, { data: data.lookups[exact] });
        else if (data.dictionary && Object.hasOwn(data.dictionary, key))
          cacheSet(dictionaryCache, exact, { data: data.dictionary[key] });
      }
      return data.tokens;
    })
    .finally(() => pendingAnalysis.delete(text));
  pendingAnalysis.set(text, task);
  return task;
}
const familiarity = (t) =>
  ImmersedLearning.familiarity(
    levels,
    t.lemma,
    t.reading,
    prefs.level,
    prefs.knowledge,
  );
function handleYouTubeState(event) {
  if (event.data === 1) resumePending = false;
  else if (event.data === 2 && resumePending && !selected) youtube?.playVideo?.();
}
function currentTime() {
  return localMedia?.currentTime || youtube?.getCurrentTime?.() || 0;
}
function playing() {
  return localMedia ? !localMedia.paused : youtube?.getPlayerState?.() === 1;
}
function pause() {
  resumePending = false;
  if (localMedia) localMedia.pause();
  else youtube?.pauseVideo?.();
}
function play() {
  if (localMedia) localMedia.play().catch((e) => status(e.message, true));
  else youtube?.playVideo?.();
}
function seekTo(t) {
  closeLookup();
  if (source) {
    positions[source.type + ":" + source.id] = Math.max(0, t);
    try { localStorage.setItem("immersed.positions", JSON.stringify(positions)); } catch {}
  }
  cueSeek = { index: cues.findIndex(c => c.start <= t + 0.02 && t < c.end), until: performance.now() + 1600 };
  if (localMedia) localMedia.currentTime = Math.max(0, t);
  else youtube?.seekTo?.(Math.max(0, t), true);
  cueIndex = -1;
  void renderCue();
}
function stopMedia() {
  void flushPlayback();
  clearTimeout(pollTimer);
  clearTimeout(hoverTimer);
  clearTimeout(leaveTimer);
  requestGeneration++;
  screenFrames.clear();
  cueSeek = null;
  renderGeneration++;
  pause();
  if (localMedia) {
    for (const event of [
      "timeupdate",
      "pause",
      "play",
      "ratechange",
      "seeked",
      "loadedmetadata",
    ])
      localMedia["on" + event] = null;
    localMedia.removeAttribute("src");
    localMedia.load();
  }
  youtube?.destroy?.();
  youtube = null;
  localMedia = null;
  source = null;
  cues = [];
  cueIndex = -1;
  closeLookup(false);
  $("chapters").hidden = true;

  coverageTokens = [];
  $("coverage").textContent = "";
  $("download").hidden = true;
  restoreFullscreenStudy();
  if (document.fullscreenElement) void document.exitFullscreen();
  $("video").replaceChildren();
  $("count").textContent = "Japanese subtitles";
  $("subtitles").textContent = "Preparing subtitles…";
}
function idFrom(input) {
  try {
    const u = new URL(input.trim());
    const id =
      u.hostname === "youtu.be"
        ? u.pathname.slice(1)
        : /^(?:www\.|m\.)?youtube\.com$/.test(u.hostname)
          ? u.searchParams.get("v") ||
            u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1]
          : null;
    return /^[\w-]{11}$/.test(id || "") ? id : null;
  } catch {
    return null;
  }
}
function loadYouTubeAPI() {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeReady) return youtubeReady;
  youtubeReady = new Promise((resolve, reject) => {
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onerror = () => {
      youtubeReady = null;
      reject(
        Error("YouTube is unavailable. Imported media still works offline."),
      );
    };
    document.head.append(script);
  });
  return youtubeReady;
}
async function loadVideo(id, title, startAt = null) {
  stopMedia();
  source = { type: "youtube", id, title: title || id };
  const generation = requestGeneration;
  status("Checking original language…");
  try {
    const info = await api("desktop/video-info", { videoId: id });
    if (generation !== requestGeneration) return;
    if (extras.originalOnly && info.language !== "ja") {
      status(
        "This video’s original language is not confirmed as Japanese. Change “Original Japanese only” in Settings to open it.",
        true,
      );
      return;
    }
    if (prefs.hideShorts && info.isShort) {
      status("Shorts are hidden in Settings.", true);
      return;
    }
    if (info.duration < prefs.minimumMinutes * 60) {
      status("This video is shorter than your minimum-length setting.", true);
      return;
    }
    source.title = info.title || source.title;
  } catch (error) {
    if (generation !== requestGeneration) return;
    if (extras.originalOnly) {
      status(
        "Original language could not be checked. Try again, or turn off “Original Japanese only” in Settings.",
        true,
      );
      return;
    }
  }
  $("sourceBadge").textContent = "YOUTUBE";
  $("download").hidden = false;
  $("download").disabled = false;
  $("downloadLabel").textContent = "Save offline";
  $("download").onclick = download;
  if (idFrom($("query").value) === id) $("query").value = "";
  status("Loading YouTube…");
  const target = el("div");
  target.id = "player";
  $("video").append(target);
  try {
    await loadYouTubeAPI();
    if (generation !== requestGeneration) return;
    youtube = new YT.Player("player", {
      videoId: id,
      playerVars: {
        playsinline: 1,
        cc_load_policy: 0,
        fs: 0,
        start: Math.max(0, Math.floor(startAt ?? positions["youtube:" + id] ?? 0)),
        autoplay: 0,
        origin: location.origin,
      },
      events: {
        onStateChange: handleYouTubeState,
        onPlaybackRateChange: event => {
          extras.playbackRate = event.data; updateSpeedButton(); persist();
        },
        onReady: () => {
          youtube.setPlaybackRate(Number(extras.playbackRate || 1));
          void beginTranscript();
        },
        onError: (e) =>
          status(
            "YouTube playback failed (" +
              e.data +
              "). Some videos restrict embedding or access.",
            true,
          ),
      },
    });
  } catch (e) {
    status(e.message, true);
  }
}
async function refreshLibrary() {
  library = (await api("desktop/library")).items;
  return library;
}
let localWindow = -1,
  prefetchedWindow = -1,
  progressWrite = 0;
function updateChapter() {
  if (!source?.chapters?.length) return;
  const index = source.chapters.findLastIndex((c) => c.start <= currentTime());
  if (index >= 0) $("chapterSelect").selectedIndex = index;
}
async function flushPlayback() {
  if (source?.type === "youtube") {
    positions["youtube:" + source.id] = currentTime();
    try { localStorage.setItem("immersed.positions", JSON.stringify(positions)); } catch {}
    return;
  }

  if (!source) return;
  const position = currentTime();
  positions[source.type + ":" + source.id] = position;
  try {
    localStorage.setItem("immersed.positions", JSON.stringify(positions));
  } catch {}
  if (source.type !== "local" || !localMedia || localMedia.readyState < 1)
    return;
  const id = source.id,
    rate = localMedia.playbackRate;
  const response = await fetch(
    "/api/desktop/progress?id=" + encodeURIComponent(id),
    {
      method: "PUT",
      headers: { "X-Immersed-Request": "1" },
      body: JSON.stringify({ position, rate }),
      keepalive: true,
    },
  ).catch(() => null);
  if (!response?.ok)
    status(
      "Listening position could not be saved. Keep this window open and try again.",
      true,
    );
}
window.flushPlayback = flushPlayback;
window.immersedPlayback = (action, value) => {
  if (["play", "pause", "toggle"].includes(action)) {
    resumePending = false;
    resumeAfterLookup = false;
    closeLookup(false);
  }
  if (action === "play") play();
  else if (action === "pause") pause();
  else if (action === "toggle") playing() ? pause() : play();
  else if (action === "seek") seekTo(value);
  else if (action === "skip") skip(value < 0 ? -1 : 1);
};
function playbackChanged(force = false) {
  if (localMedia && extras.playbackRate !== localMedia.playbackRate) {
    extras.playbackRate = localMedia.playbackRate; updateSpeedButton(); persist();
  }
  updateChapter();
  window.webkit?.messageHandlers?.immersed?.postMessage({
    action: "playback",
    title: source?.title || "",
    position: currentTime(),
    duration: localMedia?.duration || 0,
    rate: localMedia?.playbackRate || 1,
    playing: playing(),
  });
  if (force || Date.now() - progressWrite > 5000) {
    progressWrite = Date.now();
    void flushPlayback();
  }
  if (
    source?.type === "local" &&
    source.duration > 600 &&
    localMedia?.readyState >= 1
  ) {
    const minute = Math.floor(currentTime() / 60);
    if (minute !== localWindow) {
      localWindow = minute;
      requestGeneration++;
      clearTimeout(pollTimer);
      void beginTranscript();
    } else if (
      playing() &&
      currentTime() % 60 > 10 &&
      prefetchedWindow !== minute + 1 &&
      (minute + 1) * 60 < source.duration
    ) {
      prefetchedWindow = minute + 1;
      void api(
        "desktop/local-transcript",
        { id: source.id, quality: extras.speechQuality, at: (minute + 1) * 60 },
        "POST",
      ).catch(() => {});
    }
  }
}
document.addEventListener("visibilitychange", () => void flushPlayback());
window.addEventListener("pagehide", () => void flushPlayback());
async function openLocal(id, time = null) {
  const item = (await refreshLibrary()).find((x) => x.id === id);
  if (!item) throw Error("This media is no longer in the library.");
  stopMedia();
  source = {
    type: "local",
    id,
    title: item.title,
    duration: item.duration,
    chapters: item.chapters,
  };
  localWindow = -1;
  prefetchedWindow = -1;
  $("sourceBadge").textContent =
    item.kind === "audio" ? "AUDIOBOOK / AUDIO" : "LOCAL VIDEO";
  const media = document.createElement(
    item.kind === "audio" ? "audio" : "video",
  );
  media.controls = true;
  media.preload = "metadata";
  media.src = "/api/desktop/media?id=" + encodeURIComponent(id);
  media.playbackRate = item.progress?.rate || Number(extras.playbackRate || 1);
  extras.playbackRate = media.playbackRate;
  updateSpeedButton();
  media.onloadedmetadata = () => {
    const resume =
      time ?? item.progress?.position ?? positions["local:" + id] ?? 0;
    if (resume && resume < media.duration - 1) media.currentTime = resume;
    localWindow = Math.floor(media.currentTime / 60);
    playbackChanged(true);
    void beginTranscript();
  };
  media.ontimeupdate = () => playbackChanged();
  media.onpause =
    media.onplay =
    media.onratechange =
      () => playbackChanged(true);
  media.onseeked = () => {
    cueIndex = -1;
    void renderCue();
    playbackChanged(true);
  };
  media.onerror = () =>
    status(
      "This codec could not be played. Try an H.264/AAC MP4 or AAC M4B/M4A file.",
      true,
    );
  if (item.kind === "audio") {
    const box = el("div", null, "audioBook");
    const cover = el("img", null, "bookCover"),
      background = el("img", null, "bookBackdrop");
    cover.alt = "Audiobook cover";
    background.alt = "";
    cover.src = background.src =
      "/api/desktop/artwork?id=" + encodeURIComponent(id);
    cover.onerror = () => {
      cover.remove();
      background.remove();
    };
    box.append(background, cover);
    box.append(
      el("h2", item.title),
      el(
        "p",
        "Local Japanese listening · " + formatDuration(item.duration),
        "hint",
      ),
      media,
    );
    $("video").append(box);
  } else $("video").append(media);
  localMedia = media;
  if (item.chapters?.length) {
    $("chapters").hidden = false;
    $("chapterSelect").replaceChildren(
      ...item.chapters.map((c) => {
        const option = el("option", c.title);
        option.value = c.start;
        return option;
      }),
    );
    $("chapterSelect").onchange = () =>
      seekTo(Number($("chapterSelect").value));
  }
  closePanel();
}
window.openLocalMedia = (id, time = null) =>
  openLocal(id, time).catch((e) => status(e.message, true));
window.loadVideo = loadVideo;
const subtitleRetries = new Map();
function recoverSubtitles(generation) {
  if (!source || generation !== requestGeneration) return;
  const key = [
    source.type,
    source.id,
    extras.speechQuality,
    source.type === "local" ? Math.floor(currentTime() / 60) : "track",
  ].join(":");
  const attempt = subtitleRetries.get(key) || 0;
  if (attempt >= 2) return;
  subtitleRetries.set(key, attempt + 1);
  clearTimeout(pollTimer);
  pollTimer = setTimeout(() => {
    if (generation === requestGeneration) void beginTranscript(true);
  }, [2000, 5000][attempt]);
}
async function beginTranscript(retry = false) {
  if (!source) return;
  const generation = requestGeneration;
  const params =
    source.type === "local"
      ? { id: source.id, quality: extras.speechQuality, at: currentTime() }
      : { videoId: source.id, quality: extras.speechQuality };
  if (retry) params.retry = "true";
  const route =
    source.type === "local" ? "desktop/local-transcript" : "desktop/transcribe";

  status("Preparing Japanese subtitles…");
  try {
    await api(route, params, "POST");
    if (generation !== requestGeneration) return;
    pollTranscript(route, params, generation);
  } catch (e) {
    if (generation === requestGeneration) {
      status(e.message, true);
      recoverSubtitles(generation);
    }
  }
}
async function pollTranscript(route, params, generation) {
  if (generation !== requestGeneration) return;
  try {
    const data = await api(route, params);
    if (generation !== requestGeneration) return;
    if (Array.isArray(data.cues) && (data.cues.length || data.windowed)) {
      const previous = JSON.stringify(cues[cueIndex]);
      transcriptKind = data.source || "generated";
      cues = data.cues.map(restoredScreenCaption);
      const active = cues.findLastIndex(
        (c) => c.start <= currentTime() && currentTime() < c.end,
      );
      if (JSON.stringify(cues[active]) !== previous) {
        cueIndex = -1;
        renderGeneration++;
      } else cueIndex = active;
      if (!cues.length) $("subtitles").textContent = "";

      void renderCue();
      $("count").textContent =
        (data.windowed
          ? "Current section · "
          : data.status === "ready"
            ? ""
            : "Preparing · ") +
        cues.length +
        " segments";
    }
    if (data.status === "ready") {
      status("");

      void sampleCoverage();
      return;
    }
    if (data.status === "unavailable") {
      status(data.message || "Speech recognition failed.", true);
      if (data.canRetry !== false) recoverSubtitles(generation);

      return;
    }
    status(
      (data.stage || "Preparing subtitles") +
        (data.duration && data.phase !== "loading"
          ? " · " +
            Math.round((100 * (data.processedSeconds || 0)) / data.duration) +
            "%"
          : ""),
    );
    pollTimer = setTimeout(
      () => pollTranscript(route, params, generation),
      cues.some((c) => c.start <= currentTime() && currentTime() < c.end)
        ? 1500
        : 650,
    );
  } catch (e) {
    if (generation === requestGeneration) {
      status(e.message, true);
      recoverSubtitles(generation);
    }
  }
}
async function renderCue() {
  if (selected && resumeAfterLookup && (lookupPinned || extras.pauseOnHover)) return;
  if (!cues.length) {
    renderGeneration++;
    cueIndex = -1;
    if (source) $("subtitles").textContent = "";
    return;
  }
  const t = currentTime();
  let i = cues.findLastIndex((c) => c.start <= t && t < c.end);
  if (cueSeek) {
    if (i === cueSeek.index || performance.now() > cueSeek.until) cueSeek = null;
    else i = cueSeek.index;
  }
  if (i === cueIndex) return;
  cueIndex = i;
  const generation = ++renderGeneration;
  if (i < 0) {
    $("subtitles").textContent = "";
    return;
  }
  const text = cues[i].text;
  $("subtitles").textContent = text;
  let tokens;
  try {
    tokens = await analyze(text);
  } catch {
    if (generation === renderGeneration)
      status(
        "The local dictionary is unavailable; subtitle text is preserved.",
        true,
      );
    return;
  }
  if (generation !== renderGeneration) return;
  const line = el(
    "div",
    null,
    "line" + (cues[i].uncertain ? " uncertain" : ""),
  );
  let offset = 0;
  for (const token of tokens) {
    if (token.start > offset)
      line.append(document.createTextNode(text.slice(offset, token.start)));
    offset = token.end;
    if (!token.word) {
      line.append(document.createTextNode(token.text));
      continue;
    }
    const unknown = ImmersedLearning.shouldHighlightToken(
        levels,
        token,
        prefs.level,
        prefs.knowledge,
      ),
      button = el("button", null, "word" + (unknown ? " unknown" : ""));
    button.setAttribute("aria-label", "Look up " + token.text);
    if (
      prefs.readings &&
      unknown &&
      /[一-龯]/.test(token.text) &&
      token.reading
    ) {
      const ruby = el("ruby", token.text);
      ruby.append(el("rt", token.reading));
      button.append(ruby);
    } else button.textContent = token.text;
    button.onclick = () => openLookup(token, true, button);
    button.onmouseenter = () => {
      clearTimeout(leaveTimer);
      clearTimeout(hoverTimer);
      if (extras.hoverLookup)
        hoverTimer = setTimeout(() => openLookup(token, false, button), selected ? 35 : 65);
    };
    button.onmouseleave = () => {
      clearTimeout(hoverTimer);
      if (!lookupPinned) leaveTimer = setTimeout(() => closeLookup(), 220);
    };
    line.append(button);
  }
  if (offset < text.length)
    line.append(document.createTextNode(text.slice(offset)));
  $("subtitles").replaceChildren(line);
  const next = cues[i + 1]?.text;
  if (next && !pendingAnalysis.size) void analyze(next).catch(() => {});
}
function positionLookup() {
  const card = $("lookup");
  if (!card.classList.contains("show")) return;
  const rect = (lookupAnchor?.isConnected ? lookupAnchor : $("subtitles")).getBoundingClientRect();
  const width = Math.min(440, innerWidth - 24);
  const below = innerHeight - rect.bottom - 20, above = rect.top - 20;
  const placeBelow = below >= 260 || below >= above;
  const height = Math.max(120, Math.min(480, placeBelow ? below : above));
  card.style.width = width + "px";
  card.style.maxHeight = height + "px";
  card.style.left = Math.max(12, Math.min(innerWidth - width - 12, rect.left - 12)) + "px";
  card.style.top = (placeBelow ? rect.bottom + 8 : Math.max(12, rect.top - card.getBoundingClientRect().height - 8)) + "px";
}
new ResizeObserver(() => positionLookup()).observe($("lookup"));
window.addEventListener("resize", positionLookup);
window.addEventListener("blur", () => { if (selected && !lookupPinned) closeLookup(); });
function closeLookup(resume = true) {
  clearTimeout(hoverTimer);
  clearTimeout(leaveTimer);
  $("lookup").classList.remove("show");
  selected = null;
  lookupAnchor = null;
  lookupPinned = false;
  if (resume && resumeAfterLookup) {
    resumePending = !localMedia;
    play();
  }
  resumeAfterLookup = false;
  for (const cue of cues) if (cue.screenText && cue.text !== cue.screenText) { cue.text = cue.screenText; cueIndex = -1; }
}
async function openLookup(token, pinned = false, anchor = null) {
  clearTimeout(hoverTimer);
  lookupAnchor = anchor || lookupAnchor;
  clearTimeout(leaveTimer);
  if (selected === token) { lookupPinned ||= pinned; positionLookup(); return; }
  if (!selected) {
    resumeAfterLookup = resumePending || playing();
    if (pinned || extras.pauseOnHover) pause();
    else resumeAfterLookup = false;
  }
  if (pinned && playing()) {
    resumeAfterLookup = true;
    pause();
  }
  lookupPinned = pinned;
  selected = token;
  $("saveWord").textContent = "Save word";
  lookupEntries = [];
  lookupMeaning = "";
  $("saveWord").disabled = true;
  $("phraseMeaning").hidden = true;
  $("phraseMeaning").replaceChildren();
  $("lookup").classList.add("show");
  positionLookup();
  $("lookupWord").textContent = token.text;
  $("reading").textContent = token.reading || "";
  $("grammar").textContent = [
    token.lemma !== token.text ? token.lemma : "",
    ...(token.grammar || []),
  ]
    .filter(Boolean)
    .join(" · ");
  $("definitions").textContent = "Looking up…";
  $("alternatives").replaceChildren();
  $("contextMeaning").hidden = true;
  $("contextMeaning").replaceChildren();
  updateKnown();
  const key = [token.lemma, token.reading, token.pos, token.proper].join(":");
  try {
    let data = dictionaryCache.get(key);
    if (!data) {
      data = await api("immersion/dictionary", {
        word: token.lemma,
        reading: token.reading || "",
        pos: token.pos || "",
        proper: String(!!token.proper),
      });
      cacheSet(dictionaryCache, key, data);
    }
    if (selected !== token) return;
    lookupEntries = data.data || [];
    $("saveWord").disabled = !lookupEntries.length;
    renderDefinitions();
    const caption = cues[cueIndex];
    if (caption && token.start != null) {
      const context = {
        word: token.text,
        lemma: token.lemma,
        reading: token.reading || "",
        pos: token.pos || "",
        sentence: caption.text,
        start: String(token.start),
        end: String(token.end),
        before: cues.slice(Math.max(0, cueIndex - 3), cueIndex).map(c => c.text).join(" ").slice(-240),
        after: cues.slice(cueIndex + 1, cueIndex + 9).map(c => c.text).join(" ").slice(0, 240),
      };
      void api("immersion/phrase-context", context).then(data => {
        if (selected !== token || !data.phrases?.length) return;
        const phrase = data.phrases[0], gloss = phrase.senses[0]?.english_definitions.join("; ");
        if (!gloss) return;
        lookupMeaning = phrase.form + ": " + gloss;
        $("phraseMeaning").replaceChildren(el("small", "Expression", "hint"), el("strong", phrase.form), el("p", gloss));
        $("phraseMeaning").hidden = false;
      }).catch(() => {});
      setTimeout(() => { if (selected === token) void explainContext(token, context); }, 160);

    }
  } catch (e) {
    if (selected === token) $("definitions").textContent = e.message;
  }
}
async function explainContext(token, context, attempts = 0) {
  try {
    const result = await api("immersion/context-meaning", context);
    if (selected !== token) return;
    const box = $("contextMeaning");
    if (result.status === "ready") {
      box.replaceChildren(
        el("small", "Meaning in context", "hint"),
        el("strong", result.gloss),
        ...(result.phrase ? [el("p", result.phrase, "contextQuote")] : []),
      );
      box.hidden = false;
      if (!lookupMeaning) lookupMeaning = result.gloss;
    } else if (["preparing", "busy"].includes(result.status) && attempts < 30) {
      box.textContent = result.status === "preparing"
        ? "Setting up on-device context explanations…"
        : "Reading the sentence…";
      box.hidden = false;
      setTimeout(() => {
        if (selected === token) void explainContext(token, context, attempts + 1);
      }, result.status === "busy" ? 500 : 2000);
    } else box.hidden = true;
  } catch { /* Definitions remain available when the optional model is offline. */ }
}
function renderDefinitions() {
  $("definitions").replaceChildren();
  if (!lookupEntries.length) {
    $("definitions").textContent = "No dictionary entry found.";
    return;
  }
  for (const entry of lookupEntries.slice(0, 4)) {
    const box = el("div", null, "dictionaryEntry");
    const form =
      entry.japanese?.find((j) => j.word === entry.matchedForm) ||
      entry.japanese?.[0];
    if (form)
      box.append(
        el("strong", [form.word, form.reading].filter(Boolean).join(" · ")),
      );
    if (entry.matchedBy === "reading")
      box.append(
        el(
          "small",
          "Matched by reading · verify the subtitle spelling",
          "hint",
        ),
      );
    else if (entry.matchedBy === "inflection")
      box.append(el("small", "Dictionary form: " + entry.matchedForm, "hint"));
    if (prefs.pitchAccent && entry.pitch?.length) {
      const accents = el("div", null, "pitch");
      for (const a of entry.pitch.slice(0, 5)) {
        const pattern = el("span");
        const morae =
          a.reading.match(
            /[ぁ-ゖァ-ヺー][ゃゅょぁぃぅぇぉャュョァィゥェォ]?/g,
          ) || [];
        if (a.downstep < 0 || a.downstep > morae.length) continue;
        morae.forEach((m, i) => {
          const high =
              a.downstep === 1
                ? i === 0
                : i > 0 && (a.downstep === 0 || i < a.downstep),
            letter = el("span", m);
          letter.style[high ? "borderTop" : "borderBottom"] = "1px solid";
          if (high && i + 1 === a.downstep)
            letter.style.borderRight = "1px solid";
          pattern.append(letter);
        });
        pattern.append(document.createTextNode(" [" + a.downstep + "]"));
        accents.append(pattern);
      }
      box.append(accents);
    }
    const senses = entry.senses || [];
    const meaning = (sense) => {
      const row = el("div", null, "dictionarySense");
      if (sense.parts_of_speech?.length)
        row.append(el("small", sense.parts_of_speech.join(" · "), "hint"));
      row.append(el("p", sense.english_definitions.join("; ")));
      return row;
    };
    for (const sense of senses.slice(0, 3)) box.append(meaning(sense));
    if (senses.length > 3) {
      const more = el("details");
      more.append(el("summary", "More meanings (" + (senses.length - 3) + ")"));
      for (const sense of senses.slice(3)) more.append(meaning(sense));
      box.append(more);
    }
    if (entry.source) box.append(el("small", entry.source, "hint"));
    $("definitions").append(box);
  }
}
function updateKnown() {
  if (selected)
    $("known").textContent =
      familiarity(selected) === "known" ? "Mark unknown" : "Mark known";
}
function saveWord() {
  if (!selected || !lookupEntries[0]) return;
  const entry = lookupEntries[0],
    j = entry.japanese?.[0] || {},
    key = (entry.slug || selected.lemma) + ":" + (j.reading || "");
  if (saved.some((w) => w.key === key)) {
    status("This word is already saved.");
    return;
  }
  const hasContext = selected.start !== undefined && source;
  saved.unshift({
    key,
    word: j.word || selected.lemma,
    reading: j.reading || selected.reading || "",
    meaning: lookupMeaning || entry.senses?.[0]?.english_definitions?.join("; ") || "",
    sentence: hasContext ? cues[cueIndex]?.text || "" : "",
    title: hasContext ? source.title : "",
    url:
      hasContext && source.type === "local"
        ? "local:" + source.id
        : hasContext
          ? "https://www.youtube.com/watch?v=" + source.id
          : "",
    time: hasContext ? currentTime() : 0,
  });
  persist();
  $("saveWord").textContent = "Saved";
}
function showPanel(title) {
  $("panel").classList.remove("searchPanel");
  pause();
  $("panelTitle").textContent = title;
  $("panelBody").replaceChildren();
  $("panel").showModal();
  return $("panelBody");
}
function closePanel() {
  $("panel").classList.remove("searchPanel");
  $("panel").close();
}
function button(text, action) {
  const b = el("button", text);
  b.onclick = action;
  return b;
}
async function showLibrary() {
  const body = showPanel("Library");
  body.textContent = "Loading local media…";
  try {
    await refreshLibrary();
    body.replaceChildren();
    body.append(
      el(
        "p",
        "Media, chapters and generated transcripts stay on this Mac. Imported media and saved transcripts work without an internet connection.",
        "hint",
      ),
    );
    if (!library.length)
      body.append(
        el("p", "Open a local video or Japanese audiobook to begin."),
      );
    const cards = el("div", null, "cards");
    for (const item of library) {
      const card = el("article", null, "entry");
      card.append(
        el("h3", item.title),
        el(
          "p",
          `${item.kind} · ${Math.round(item.duration / 60)} minutes · transcript ${item.transcript}`,
        ),
        button(
          "Study",
          () => void openLocal(item.id).catch((e) => status(e.message, true)),
        ),
      );
      let confirming = false;
      const removeButton = button("Remove", async () => {
        if (!confirming) {
          confirming = true;
          removeButton.textContent = "Remove from this Mac?";
          return;
        }
        try {
          await api("desktop/library", { id: item.id }, "DELETE");
          if (source?.type === "local" && source.id === item.id) {
            stopMedia();
            status("Media removed from the library.");
          }
          await showLibrary();
        } catch (error) {
          status(error.message, true);
        }
      });
      card.append(removeButton);
      cards.append(card);
    }
    body.append(cards);
  } catch (e) {
    body.textContent = e.message;
  }
}
function showWords() {
  const body = showPanel("Words"),
    form = el("form"),
    input = el("input");
  input.placeholder = "Search the Japanese dictionary";
  input.setAttribute("aria-label", "Search dictionary");
  form.append(input, el("button", "Search"));
  const results = el("div");
  let dictionaryTimer,
    searchId = 0;
  async function searchDictionary() {
    const query = input.value.trim(),
      generation = ++searchId;
    if (!query) {
      results.replaceChildren();
      return;
    }
    results.textContent = "Searching…";
    try {
      const data = await api("immersion/search", { query });
      if (
        generation !== searchId ||
        !$("panel").open ||
        $("panelTitle").textContent !== "Words"
      )
        return;
      results.replaceChildren();
      for (const entry of (data.data || []).slice(0, 12)) {
        const j = entry.japanese?.[0] || {},
          title = [j.word, j.reading].filter(Boolean).join(" · ");
        const result = button("", () => {
          closePanel();
          void openLookup(
            {
              text: j.word || j.reading,
              lemma: j.word || j.reading,
              reading: j.reading || "",
              grammar: [],
              pos: "",
            },
            true,
          );
        });
        result.className = "dictionaryResult";
        result.setAttribute("aria-label", title);
        result.append(
          el("strong", title),
          el(
            "small",
            entry.senses?.[0]?.english_definitions?.slice(0, 2).join("; ") ||
              "",
            "hint",
          ),
        );
        results.append(result);
      }
      if (!data.data?.length) results.textContent = "No matching entries.";
    } catch (error) {
      if (generation === searchId) results.textContent = error.message;
    }
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    clearTimeout(dictionaryTimer);
    void searchDictionary();
  };
  input.oninput = () => {
    searchId++;
    clearTimeout(dictionaryTimer);
    dictionaryTimer = setTimeout(() => void searchDictionary(), 180);
  };
  body.append(form, results, el("h3", "Saved words"));
  if (!saved.length)
    body.append(
      el("p", "Save a word from lookup to keep its original context.", "hint"),
    );
  for (const word of saved) {
    const entry = el("article", null, "entry");
    entry.append(
      el("h3", word.word),
      el("p", word.reading),
      el("p", word.meaning),
      el("p", word.sentence),
      el("p", word.title, "hint"),
      button("Play context", () => {
        closePanel();
        if (word.url.startsWith("local:"))
          void openLocal(word.url.slice(6), word.time).catch((e) =>
            status(e.message, true),
          );
        else {
          loadVideo(idFrom(word.url), word.title);
          pendingSeek = word.time;
        }
      }),
      button("Remove", () => {
        saved = saved.filter((w) => w.key !== word.key);
        persist();
        showWords();
      }),
    );
    body.append(entry);
  }
}
let pendingSeek = 0;
function setting(body, label, description, key, options, isExtra = false) {
  const row = el("label", null, "settingRow"),
    text = el("span", label);
  if (description) text.append(el("small", description));
  const object = isExtra ? extras : prefs;
  let control;
  if (options) {
    control = el("select");
    for (const [value, title] of options) {
      const option = el("option", title);
      option.value = value;
      control.append(option);
    }
    control.value = object[key];
    control.onchange = () => {
      object[key] =
        typeof object[key] === "number" ? Number(control.value) : control.value;
      persist();
      applyPreferences();
      if (key === "speechQuality" && source) {
        requestGeneration++;
        clearTimeout(pollTimer);
        prefetchedWindow = -1;
        void beginTranscript();
      }
    };
  } else {
    control = el("input");
    control.type = "checkbox";
    control.checked = object[key];
    control.onchange = () => {
      object[key] = control.checked;
      persist();
      applyPreferences();
      if (key === "pitchAccent") renderDefinitions();
    };
  }
  control.setAttribute("aria-label", label);
  row.append(text, control);
  body.append(row);
}
function showSettings() {
  const body = showPanel("Settings");
  body.append(button("Version history", showHistory));
  if (source && cues.length)
    body.append(button("Compare speech models", compareTranscript));
  setting(body, "Dark mode", "", "dark");
  setting(
    body,
    "Completed Japanese level",
    "Only words above your completed level or explicitly marked unknown are highlighted. Unlisted words have no assumed JLPT level.",
    "level",
    [5, 4, 3, 2, 1].map((n) => [n, "N" + n]),
  );
  setting(body, "Furigana", "Readings for unfamiliar words.", "readings");
  setting(
    body,
    "Pitch accent",
    "Tokyo accent patterns in dictionary lookup.",
    "pitchAccent",
  );
  setting(
    body,
    "Hide Shorts",
    "Filter short-format search results.",
    "hideShorts",
  );
  setting(
    body,
    "Minimum video length",
    "Applies to YouTube search results.",
    "minimumMinutes",
    [
      [0, "Any"],
      [15, "15+ minutes"],
      [30, "30+ minutes"],
      [60, "60+ minutes"],
    ],
  );
  setting(
    body,
    "Original Japanese only",
    "Only show search results whose original language is reported as Japanese. Results with unknown language are excluded.",
    "originalOnly",
    null,
    true,
  );
  setting(
    body,
    "Block ad requests",
    "WebKit blocks known advertising domains and ad request paths. Same-origin YouTube video ads may still appear.",
    "blockAds",
    null,
    true,
  );
  setting(
    body,
    "Lookup on hover",
    "Hover a word briefly to look it up. Click to pin lookup.",
    "hoverLookup",
    null,
    true,
  );
  setting(
    body,
    "Pause during hover lookup",
    "Resume when hover lookup closes, if playback was running.",
    "pauseOnHover",
    null,
    true,
  );
  setting(body, "Read captions from video", "Match Japanese text visible in the video. Uses small frame downloads.", "screenCaptionCheck", null, true);
  setting(
    body,
    "Speech model",
    "Turbo is the default. The alternate large-v3 model can produce different spelling or more kana and is not always more accurate. Its first use downloads model weights.",
    "speechQuality",
    [
      ["balanced", "Fast — turbo"],
      ["accurate", "Alternate — large-v3"],
    ],
    true,
  );
  body.append(
    el("h3", "Settings backup"),
    el(
      "p",
      "Settings and saved words stay on this Mac. Export a backup to iCloud Drive through the Mac save dialog. Automatic iPhone/Mac sync is deferred until Apple signing is configured.",
      "hint",
    ),
    button("Export backup", exportBackup),
    button("Import backup", () => $("settingsInput").click()),
    el("h3", "Keyboard"),
    el(
      "p",
      "Space: play/pause · ←/→ or J/L: previous/next subtitle · F: video fullscreen · K: play/pause · Esc: close lookup · ⌘L: search · ⌘O: open media",
      "hint",
    ),
    el("h3", "Dictionary & credits"),
    el(
      "p",
      "JMdict and JMnedict © EDRDG; Kanjium pitch accents © Uros O., CC BY-SA 4.0. Kuromoji/IPADIC supplies Japanese morphology. Tatoeba contributors supply context counts, CC BY 2.0 FR. On Apple Silicon, Qwen3-4B-Instruct-2507 (MLX, Apache 2.0) ranks dictionary meanings locally; it can select an incorrect sense. Context plausibility is not audio verification. JLPT levels are community estimates. Speech transcripts are generated estimates; verify uncertain words with the audio.",
      "hint",
    ),
  );
}
async function showHistory() {
  const body = showPanel("Version history");
  try {
    const history = await api("desktop/history");
    for (const release of history) {
      const row = el("article", null, "entry");
      row.append(
        el("h3", release.version + " · " + release.date),
        el("p", release.title),
      );
      for (const note of release.notes) row.append(el("p", note));
      body.append(row);
    }
  } catch (error) {
    body.textContent = error.message;
  }
}
function exportBackup() {
  const text = JSON.stringify(
    { schema: 3, preferences: prefs, savedWords: saved, macOptions: extras },
    null,
    2,
  );
  if (window.webkit?.messageHandlers?.immersed)
    window.webkit.messageHandlers.immersed.postMessage({
      action: "exportSettings",
      text,
    });
  else {
    const link = el("a");
    link.href = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    link.download = "immersed-settings.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
}
let searchGeneration = 0;
async function searchYouTube(query) {
  const generation = ++searchGeneration,
    body = showPanel("YouTube search");
  $("panel").classList.add("searchPanel");
  const heading = el("div", null, "searchSummary"),
    title = el("h3", query),
    progress = el("span", "Finding videos…", "hint");
  heading.append(title, progress);
  const controls = el("div", null, "searchFilters");
  const original = el("label", null, "searchToggle"),
    toggle = el("input");
  toggle.type = "checkbox";
  toggle.checked = extras.originalOnly;
  toggle.setAttribute("aria-label", "Original Japanese only");
  original.append(toggle, document.createTextNode("Original Japanese only"));
  controls.append(original);
  const cards = el("div", null, "searchResults"),
    message = el("p", "", "hint");
  const refine = el("form", null, "searchRefine"),
    input = el("input");
  input.type = "search";
  input.value = query;
  input.setAttribute("aria-label", "Search within YouTube");
  const submit = el("button", "Search", "primary");
  refine.append(input, submit);
  refine.onsubmit = (e) => {
    e.preventDefault();
    if (input.value.trim()) {
      $("query").value = input.value.trim();
      void searchYouTube(input.value.trim());
    }
  };
  body.append(refine, heading, controls, cards, message);
  const rendered = new Map();
  let latest = { items: [], status: "loading" };
  function paint() {
    const data = latest,
      filtered = data.items.filter(
        (x) =>
          (!extras.originalOnly || x.language === "ja") &&
          (!prefs.hideShorts || !x.isShort) &&
          x.duration >= prefs.minimumMinutes * 60,
      ),
      ids = new Set(filtered.map((x) => x.id));
    for (const [id, node] of rendered)
      if (!ids.has(id)) {
        node.remove();
        rendered.delete(id);
      }
    for (const item of filtered) {
      if (rendered.has(item.id)) {
        const card = rendered.get(item.id);
        card.style.order = String(filtered.indexOf(item));
        card.querySelector("h3").textContent = item.title;
        card.querySelector("p").textContent = item.channel;
        card.querySelector(".searchDuration").textContent = formatDuration(
          item.duration,
        );
        card.querySelector(".searchLanguage").textContent =
          item.language === "ja"
            ? "Japanese original"
            : item.language || "Language unverified";
        continue;
      }
      const card = el("button", null, "searchVideo");
      card.type = "button";
      card.style.order = String(filtered.indexOf(item));
      card.setAttribute("aria-label", "Watch " + item.title);
      const art = el("div", null, "searchArtwork"),
        image = el("img");
      image.alt = "";
      image.loading = "lazy";
      if (/^https:\/\/i\.ytimg\.com\//.test(item.thumbnail || ""))
        image.src = item.thumbnail;
      art.append(
        image,
        el("span", formatDuration(item.duration), "searchDuration"),
      );
      card.append(
        art,
        el("h3", item.title),
        el("p", item.channel, "hint"),
        el(
          "small",
          item.language === "ja"
            ? "Japanese original"
            : item.language || "Language unverified",
          "searchLanguage",
        ),
      );
      card.onclick = () => {
        closePanel();
        void loadVideo(item.id, item.title);
      };
      cards.append(card);
      rendered.set(item.id, card);
    }
    progress.textContent =
      data.status === "checking"
        ? "Checking originals · " +
          (data.checked || 0) +
          "/" +
          (data.total || data.items.length)
        : filtered.length + " videos";
    message.textContent = !filtered.length
      ? data.status === "checking"
        ? "Results will appear as their original language is confirmed."
        : data.status === "loading"
          ? ""
          : "No matches with these filters. Try a different query or turn off “Original Japanese only”."
      : "";
    cards.classList.toggle(
      "loading",
      !filtered.length && data.status !== "ready",
    );
  }
  toggle.onchange = () => {
    extras.originalOnly = toggle.checked;
    persist();
    paint();
  };
  paint();
  try {
    do {
      const data = await api("desktop/search", { query });
      if (
        generation !== searchGeneration ||
        !$("panel").open ||
        $("panelTitle").textContent !== "YouTube search"
      )
        return;
      latest = data;
      paint();
      if (data.status !== "checking") break;
      await new Promise((r) => setTimeout(r, 650));
    } while (generation === searchGeneration && $("panel").open);
  } catch (error) {
    if (generation === searchGeneration) {
      progress.textContent = "Search unavailable";
      message.textContent = error.message;
      cards.classList.remove("loading");
    }
  }
}

async function importMedia(file) {
  if (!file) return;
  status("Importing " + file.name + "…");
  $("openFile").disabled = true;
  try {
    const item = await api("desktop/import", { name: file.name }, "POST", file);
    await openLocal(item.id);
  } catch (e) {
    status(e.message, true);
  } finally {
    $("openFile").disabled = false;
    $("fileInput").value = "";
  }
}
async function download() {
  if (source?.type !== "youtube") return;
  const current = { ...source };
  $("download").disabled = true;
  $("downloadLabel").textContent = "Saving…";
  status("");
  try {
    const item = await api(
      "desktop/download",
      { videoId: current.id, quality: extras.speechQuality },
      "POST",
    );
    if (source?.id === current.id) {
      $("downloadLabel").textContent = "Saved offline ✓";
      $("download").onclick = () => void showLibrary();
      $("download").title = "Open Library to watch the saved video without internet";
    }
  } catch (e) {
    status(e.message, true);
    $("downloadLabel").textContent = "Retry save";
  } finally {
    $("download").disabled = false;
  }
}
async function sampleCoverage() {
  const generation = requestGeneration,
    all = [];
  for (let i = 0; i < Math.min(10, cues.length); i++) {
    const cue =
      cues[
        Math.round(
          (i * (cues.length - 1)) / Math.max(1, Math.min(10, cues.length) - 1),
        )
      ];
    try {
      all.push(...(await analyze(cue.text)));
    } catch {}
    if (generation !== requestGeneration) return;
  }
  coverageTokens = all;
  updateCoverage();
}
function updateCoverage() {
  if (!coverageTokens.length) return;
  const coverage = ImmersedLearning.estimateVocabulary(
    levels,
    coverageTokens,
    prefs.level,
    prefs.knowledge,
  );
  $("coverage").textContent = coverage
    ? "Sampled vocabulary: " +
      coverage.lower +
      "% known · " +
      coverage.unrated +
      " unlisted"
    : "";
}
async function compareTranscript() {
  if (!source || !cues.length) return;
  const generation = requestGeneration,
    baseline = [...cues],
    quality = extras.speechQuality === "accurate" ? "balanced" : "accurate",
    params = {
      ...(source.type === "local"
        ? { id: source.id, at: currentTime() }
        : { videoId: source.id }),
      quality,
    },
    route =
      source.type === "local"
        ? "desktop/local-transcript"
        : "desktop/transcribe";
  const body = showPanel("Check transcript");
  body.append(
    el(
      "p",
      "Comparing two local speech models. The larger model downloads on first use. Agreement does not verify the audio.",
      "hint",
    ),
  );
  const progress = el("p", "Preparing the second model…");
  body.append(progress);
  try {
    await api(route, params, "POST");
    while (
      $("panel").open &&
      $("panelTitle").textContent === "Check transcript" &&
      generation === requestGeneration
    ) {
      const data = await api(route, params);
      if (data.status === "unavailable")
        throw Error(data.message || "The second model failed.");
      if (data.status === "ready") {
        const differences = ImmersedTranscript.compare(
          baseline,
          data.cues || [],
          data.windowed
            ? { start: data.rangeStart, end: data.rangeEnd }
            : undefined,
        );
        progress.textContent = differences.length
          ? "Passages with different wording (first 20). Listen to check each result."
          : "No text differences found in this section. Agreement does not verify the audio.";
        for (const passage of differences.slice(0, 20)) {
          const row = el("article", null, "entry");
          row.append(
            el("p", "Current: " + (passage.current || "No speech recognized")),
            el(
              "p",
              "Second model: " + (passage.other || "No speech recognized"),
            ),
            button("Play at " + formatDuration(passage.start), () => {
              closePanel();
              seekTo(passage.start);
              play();
            }),
          );
          body.append(row);
        }
        return;
      }
      progress.textContent =
        (data.stage || "Comparing…") +
        (data.duration && data.phase !== "loading"
          ? " · " +
            Math.round((100 * (data.processedSeconds || 0)) / data.duration) +
            "%"
          : "");
      await new Promise((r) => setTimeout(r, 1500));
    }
  } catch (error) {
    progress.textContent = error.message;
  }
}
function skip(direction) {
  if (!cues.length) return;
  const t = currentTime();
  const active = cueSeek?.index >= 0 ? cueSeek.index : cues.findLastIndex(c => c.start <= t && t < c.end);
  const index = active >= 0
    ? Math.max(0, Math.min(cues.length - 1, active + direction))
    : direction < 0 ? cues.findLastIndex(c => c.end <= t) : cues.findIndex(c => c.start > t);
  if (index >= 0) seekTo(cues[index].start + 0.015);
}

$("search").onsubmit = (e) => {
  e.preventDefault();
  const value = $("query").value.trim(),
    id = idFrom(value);
  if (id) {
    closePanel();
    let startAt = null;
    try {
      const url = new URL(value), raw = url.searchParams.get("t") || url.searchParams.get("start");
      const time = raw?.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);
      if (time) startAt = Number(time[1] || 0) * 3600 + Number(time[2] || 0) * 60 + Number(time[3] || 0);
    } catch {}
    void loadVideo(id, undefined, startAt);
  } else if (value) void searchYouTube(value);
};
async function toggleFullscreen() {
  if (document.fullscreenElement) await document.exitFullscreen();
  else {
    const video = $("video");
    video.tabIndex = -1;
    await video.requestFullscreen();
    video.focus();
  }
}
const fullscreenHomes = new Map();
function restoreFullscreenStudy() {
  for (const [node, home] of fullscreenHomes) home.replaceWith(node);
  fullscreenHomes.clear();
  $("fullscreenStudy")?.remove();
  $("exitVideoFullscreen")?.remove();
}
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement === $("video")) {
    const overlay = el("div", null, "fullscreenStudy");
    overlay.id = "fullscreenStudy";
    for (const id of ["subtitles", "lookup", "controls"]) {
      const node = $(id), home = document.createComment(id + " home");
      node.replaceWith(home); fullscreenHomes.set(node, home); overlay.append(node);
    }
    $("video").append(overlay);
    const exit = el("button", "✕", "exitVideoFullscreen");
    exit.id = "exitVideoFullscreen";
    exit.setAttribute("aria-label", "Exit video fullscreen");
    exit.title = "Exit fullscreen · Escape";
    exit.onclick = () => void document.exitFullscreen();
    $("video").append(exit);
    exit.focus();
  } else restoreFullscreenStudy();
  positionLookup();
});
$("fullscreen").onclick = () =>
  void toggleFullscreen().catch((e) => status(e.message, true));
$("play").onclick = () => {
  resumePending = false;
  resumeAfterLookup = false;
  playing() ? pause() : play();
};
$("previous").onclick = () => skip(-1);
$("next").onclick = () => skip(1);
function updateSpeedButton() {
  const rate = Number(extras.playbackRate || 1);
  $("speedValue").textContent = rate + "×";
  $("speed").title = "Playback speed · " + rate + "×";
  for (const item of $("speedMenu").children) item.setAttribute("aria-checked", String(Number(item.dataset.rate) === rate));
}
function closeSpeedMenu() {
  $("speedMenu").hidden = true;
  $("speed").setAttribute("aria-expanded", "false");
}
for (const rate of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
  const item = el("button", rate === 1 ? "1× · Normal" : rate + "×");
  item.dataset.rate = rate;
  item.setAttribute("role", "menuitemradio");
  item.onclick = () => {
    extras.playbackRate = rate; persist(); updateSpeedButton(); closeSpeedMenu();
    if (localMedia) localMedia.playbackRate = rate;
    else youtube?.setPlaybackRate?.(rate);
    $("speed").focus();
  };
  $("speedMenu").append(item);
}
updateSpeedButton();
$("speed").onclick = () => {
  const open = $("speedMenu").hidden;
  $("speedMenu").hidden = !open;
  $("speed").setAttribute("aria-expanded", String(open));
  if (open) $("speedMenu").querySelector('[aria-checked="true"]').focus();
};
$("speedMenu").onkeydown = (event) => {
  if (["ArrowDown", "ArrowUp"].includes(event.key)) {
    event.preventDefault(); event.stopPropagation();
    const items = [...$("speedMenu").children], index = items.indexOf(document.activeElement);
    items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length].focus();
  }
};
document.addEventListener("pointerdown", event => {
  if (!event.target.closest(".speedControl")) closeSpeedMenu();
  if (selected && !event.target.closest("#lookup, .word")) closeLookup();
});
$("closeLookup").onclick = () => closeLookup();
$("lookup").onmouseenter = () => clearTimeout(leaveTimer);
$("lookup").onmouseleave = () => {
  if (!lookupPinned) leaveTimer = setTimeout(() => closeLookup(), 180);
};
$("known").onclick = () => {
  if (!selected) return;
  prefs.knowledge[selected.lemma] = familiarity(selected) !== "known";
  persist();
  updateKnown();
  cueIndex = -1;
  void renderCue();
};
$("saveWord").onclick = saveWord;
$("speak").onclick = () => {
  if (!selected) return;
  pause();
  const speech = new SpeechSynthesisUtterance(
    selected.reading || selected.text,
  );
  speech.lang = "ja-JP";
  speechSynthesis.cancel();
  speechSynthesis.speak(speech);
};
$("openFile").onclick = () =>
  window.webkit?.messageHandlers?.immersed
    ? window.webkit.messageHandlers.immersed.postMessage({
        action: "openMedia",
      })
    : $("fileInput").click();
$("fileInput").onchange = () => void importMedia($("fileInput").files[0]);
$("libraryButton").onclick = showLibrary;
$("wordsButton").onclick = showWords;
$("settingsButton").onclick = showSettings;
window.showSettings = showSettings;
window.showLibrary = showLibrary;
window.showWords = showWords;
$("closePanel").onclick = closePanel;
$("download").onclick = download;

$("settingsInput").onchange = async () => {
  try {
    const file = $("settingsInput").files[0];
    if (!file || file.size > 5 * 1024 * 1024)
      throw Error("Choose a JSON backup smaller than 5 MB.");
    const data = JSON.parse(await file.text());
    if (
      data.schema !== 3 ||
      !data.preferences ||
      !Array.isArray(data.savedWords)
    )
      throw Error("This is not an immersed. settings backup.");
    prefs = ImmersedPreferences.restorePreferences(data.preferences);
    saved = data.savedWords
      .filter(
        (w) =>
          w &&
          typeof w.key === "string" &&
          typeof w.word === "string" &&
          typeof w.url === "string" &&
          Number.isFinite(w.time),
      )
      .slice(0, 50000);
    if (data.macOptions)
      for (const key of Object.keys(extras))
        if (typeof data.macOptions[key] === "boolean")
          extras[key] = data.macOptions[key];
    if (["balanced", "accurate"].includes(data.macOptions?.speechQuality))
      extras.speechQuality = data.macOptions.speechQuality;
    if ([0.75, 1, 1.25, 1.5, 2].includes(data.macOptions?.playbackRate))
      extras.playbackRate = data.macOptions.playbackRate;
    persist();
    applyPreferences();
    showSettings();
    status("Backup restored.");
  } catch (e) {
    status(e.message, true);
  } finally {
    $("settingsInput").value = "";
  }
};
document.addEventListener("keydown", (e) => {
  if (
    e.key.toLowerCase() === "f" &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.altKey &&
    !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
  ) {
    e.preventDefault();
    void toggleFullscreen().catch(() => {});
    return;
  }
  if (e.key === "Escape") {
    if (!$("speedMenu").hidden) { closeSpeedMenu(); $("speed").focus(); return; }
    if (selected) { closeLookup(); return; }
    if (document.fullscreenElement) {
      e.preventDefault();
      void document.exitFullscreen();
      return;
    }
    closeLookup();
    return;
  }
  if (
    ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) ||
    e.metaKey ||
    e.ctrlKey ||
    $("panel").open
  )
    return;
  if (e.code === "Space" || e.key.toLowerCase() === "k") {
    e.preventDefault();
    $("play").click();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    skip(-1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    skip(1);
  } else if (e.key.toLowerCase() === "j") skip(-1);
  else if (e.key.toLowerCase() === "l") skip(1);
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", (e) => {
  e.preventDefault();
  if (e.dataTransfer.files.length) void importMedia(e.dataTransfer.files[0]);
});
let last = 0;
function tick(t) {
  if (t - last > 100) {
    last = t;
    if (source && playing() && t - lastPositionSave > 5000) {
      lastPositionSave = t;
      positions[source.type + ":" + source.id] = currentTime();
      try {
        localStorage.setItem("immersed.positions", JSON.stringify(positions));
      } catch {}
    }
    void renderCue();
    scanCurrentVideoCaption(t);
    $("play").textContent = playing() ? "Ⅱ" : "▶";
    if (pendingSeek && youtube?.getPlayerState) {
      seekTo(pendingSeek);
      pendingSeek = 0;
    }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
api("desktop/levels")
  .then((data) => {
    levels = data;
    cueIndex = -1;
    void renderCue();
  })
  .catch(() => status("Level data unavailable.", true));
applyPreferences();
