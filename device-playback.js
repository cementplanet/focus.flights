function flightProgress(chapters, duration, time) {
  if (!Number.isFinite(duration) || duration <= 0) return chapters.map(() => 0);
  const boundaries = [...chapters, duration];
  return boundaries.slice(0, -1).map((start, index) =>
    Math.max(0, Math.min(1, (time - start) / (boundaries[index + 1] - start))));
}

function flightTime(chapters, duration, progress) {
  const boundaries = [...chapters, duration];
  const position = Math.max(0, Math.min(chapters.length, progress * chapters.length / 100));
  const index = Math.min(chapters.length - 1, Math.floor(position));
  return Math.min(duration - 1 / 30,
    boundaries[index] + (boundaries[index + 1] - boundaries[index]) * (position - index));
}

function correspondingTime(previous, destination) {
  if (!previous) return 0;
  const { device, duration, currentTime } = previous;
  const from = [0, ...device.cues, duration];
  const to = [0, ...destination.cues, destination.video.duration];
  const time = Math.min(duration, currentTime);
  const end = Math.max(0, destination.video.duration - 1 / 30);
  if (device === destination) return Math.min(end, time);
  if (from.length !== to.length) return Math.min(end, time * end / duration);
  const next = from.findIndex((point, index) => index > 0 && time < point);
  if (next < 0) return end;
  const progress = (time - from[next - 1]) / (from[next] - from[next - 1]);
  return Math.min(end, to[next - 1] + progress * (to[next] - to[next - 1]));
}

function waitForVideo(video, event, ready, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("Video load timed out")), 15000);
    function finish(error) {
      clearTimeout(timeout);
      video.removeEventListener(event, check);
      video.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error);
      else resolve();
    }
    function check() { if (ready()) finish(); }
    function failed() { finish(video.error || new Error("Video load failed")); }
    function aborted() { finish(signal.reason); }
    video.addEventListener(event, check);
    video.addEventListener("error", failed);
    signal.addEventListener("abort", aborted);
  });
}

async function cueVideo(video, time, signal) {
  if (Math.abs(video.currentTime - time) > .015) video.currentTime = time;
  await waitForVideo(video, "seeked", () => !video.seeking, signal);
  await waitForVideo(video, "loadeddata", () => video.readyState >= 2, signal);
}

export function setupDevicePlayback(stage, buttons, reducedMotion, moveOrbit, moveLiquid) {
  const firstVideo = stage.querySelector("video");
  const hero = stage.closest(".showcase").previousElementSibling;
  const appleVideo = (navigator.vendor === "Apple Computer, Inc." || CSS.supports("-webkit-touch-callout", "none"))
    && firstVideo.canPlayType('video/mp4; codecs="hvc1"');
  const devices = buttons.map((button, index) => {
    const video = index === 0 ? firstVideo : document.createElement("video");
    const base = `/device-media/${button.dataset.media ?? button.dataset.device}`;
    const item = stage.querySelector(`.device-orbit-item[data-device="${button.dataset.device}"]`);
    video.dataset.device = button.dataset.device;
    video.dataset.buffering = "";
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.setAttribute("aria-hidden", "true");
    item.querySelector(".device-orbit-sharp").append(video);
    const chapterStarts = button.dataset.chapters.split(",").map(Number);
    const chapters = [0, ...chapterStarts];
    const cues = [...button.dataset.boardingCues.split(",").map(Number), ...chapterStarts];
    return { button, video, item, base, cues, chapters, ready: false };
  });
  let active = devices[0];
  let parkedCue;
  const outgoing = new Set();
  const local = ["127.0.0.1", "localhost"].includes(location.hostname);
  const easing = getComputedStyle(stage).getPropertyValue("--orbit-ease").trim();
  let ranges;
  let visible = false;
  let cycling = false;
  let revision = 0;
  let transition;
  let replay;
  let userPaused = false;
  let manualPlayback = false;
  let progressFrame;
  const playback = stage.closest(".showcase").querySelector(".flight-playback");
  const toggle = playback.querySelector(".flight-playback-toggle");
  const scrubber = playback.querySelector(".flight-scrubber");
  const track = playback.querySelector(".flight-segments");
  let scrubbing = false;
  let scrubPointer = null;
  let resumeAfterScrub = false;
  let seekFrame;
  const segments = [...playback.querySelectorAll(".flight-segment")];
  segments.forEach(segment => {
    const filled = segment.firstElementChild.cloneNode(true);
    filled.dataset.filled = "";
    segment.append(filled);
  });

  function updateProgress() {
    retireHiddenVideos();
    const source = active.ready ? active : parkedCue?.device ?? active;
    const timeline = active.ready ? active.video : parkedCue;
    let progress = flightProgress(source.chapters, timeline?.duration, timeline?.currentTime ?? 0);
    if (replay?.device === source && replay.animations) {
      const blend = replay.animations[1].effect.getComputedTiming().progress ?? 0;
      const position = segments.length + (progress.reduce((sum, value) => sum + value, 0) - segments.length) * blend;
      progress = progress.map((_, index) => Math.max(0, Math.min(1, position - index)));
    }
    if (shouldPlay() && active.ready && !replay && active.video.duration - active.video.currentTime < 2.5) {
      void prepareReplay(active);
    }
    segments.forEach((segment, index) => {
      segment.style.setProperty("--roundness", Math.sin(Math.PI * progress[index]) ** 2);
      segment.style.setProperty("--remaining", `${(1 - progress[index]) * 100}%`);
      const percent = String(Math.round(progress[index] * 100));
      if (segment.getAttribute("aria-valuenow") !== percent) segment.setAttribute("aria-valuenow", percent);
    });
    scrubber.disabled = !active.ready || cycling;
    if (!scrubbing) scrubber.value = progress.reduce((sum, value) => sum + value, 0) * 100 / segments.length;
    const currentSegment = Math.min(segments.length - 1, Math.floor(Number(scrubber.value) * segments.length / 100));
    scrubber.setAttribute("aria-valuetext", `${segments[currentSegment].getAttribute("aria-label")}, ${Math.round(Number(scrubber.value))}%`);
    toggle.disabled = Boolean(active.loading);
    const playing = !active.video.paused && !active.video.ended;
    toggle.toggleAttribute("data-playing", playing);
    toggle.setAttribute("aria-label", playing ? "Pause preview" : "Play preview");
    cancelAnimationFrame(progressFrame);
    if ((playing || outgoing.size) && visible && !document.hidden) progressFrame = requestAnimationFrame(updateProgress);
  }

  toggle.addEventListener("click", () => {
    userPaused = !active.video.paused;
    manualPlayback = !userPaused;
    syncPlayback();
  });

  function beginScrub() {
    if (scrubbing || scrubber.disabled) return;
    scrubbing = true;
    resumeAfterScrub = !active.video.paused;
    track.setAttribute("data-scrubbing", "");
    stage.removeAttribute("data-playing");
    active.video.pause();
  }

  function seekScrub() {
    cancelAnimationFrame(seekFrame);
    active.video.currentTime = flightTime(active.chapters, active.video.duration, Number(scrubber.value));
    updateProgress();
  }

  function endScrub() {
    if (!scrubbing) return;
    seekScrub();
    scrubbing = false;
    scrubPointer = null;
    track.removeAttribute("data-scrubbing");
    if (resumeAfterScrub) syncPlayback();
    else updateProgress();
  }

  scrubber.addEventListener("pointerdown", event => {
    if (event.button !== 0 || scrubber.disabled) return;
    scrubPointer = event.pointerId;
    beginScrub();
  });
  scrubber.addEventListener("input", () => {
    beginScrub();
    if (!scrubbing) return;
    cancelAnimationFrame(seekFrame);
    seekFrame = requestAnimationFrame(seekScrub);
  });
  scrubber.addEventListener("change", () => { if (scrubPointer === null) endScrub(); });
  for (const event of ["pointerup", "pointercancel"]) {
    window.addEventListener(event, event => { if (event.pointerId === scrubPointer) endScrub(); });
  }
  window.addEventListener("blur", endScrub);
  // Keep timeline gestures out of the page's vertical swipe navigation.
  for (const event of ["touchstart", "touchmove", "touchend"]) {
    scrubber.addEventListener(event, event => event.stopPropagation(), { passive: true });
  }

  function unload(device) {
    device.loadController?.abort();
    device.loadController = undefined;
    device.loading = undefined;
    device.ready = false;
    device.video.setAttribute("data-buffering", "");
    device.item.removeAttribute("data-front");
    device.video.pause();
    device.video.removeAttribute("src");
    device.video.load();
    if (device.blobURL) URL.revokeObjectURL(device.blobURL);
    device.blobURL = undefined;
  }

  function load(device) {
    const controller = device.loadController = new AbortController();
    const { signal } = controller;
    const cue = parkedCue;
    const src = `${device.base}.${appleVideo ? "mov" : "webm?v=front-index"}`;
    device.loading = (async () => {
      if (local) {
        if (ranges === undefined) {
          ranges = await fetch(src, { method: "HEAD", signal })
            .then(response => response.headers.get("accept-ranges") === "bytes")
            .catch(error => {
              if (signal.aborted) throw error;
              return false;
            });
        }
        if (!ranges) {
          const response = await fetch(src, { signal });
          if (!response.ok) throw new Error(`Missing ${src}`);
          const blob = await response.blob();
          signal.throwIfAborted();
          device.blobURL = URL.createObjectURL(blob);
        }
      }
      signal.throwIfAborted();
      // Safari may stop at metadata unless frame loading is explicitly requested.
      device.video.src = device.blobURL ?? src;
      device.video.load();
      await waitForVideo(device.video, "loadedmetadata", () => Number.isFinite(device.video.duration), signal);
      await cueVideo(device.video, correspondingTime(cue, device), signal);
      signal.throwIfAborted();
      device.ready = true;
      delete device.video.dataset.buffering;
      return true;
    })().catch(error => {
      if (!signal.aborted) {
        unload(device);
        console.warn(`Device preview unavailable: ${device.button.dataset.device}`, error);
      }
      return false;
    }).finally(() => {
      if (device.loadController === controller) {
        device.loading = undefined;
        device.loadController = undefined;
      }
    });
    return device.loading;
  }

  function pauseAll() {
    active.video.pause();
    active.item.removeAttribute("data-front");
    replay?.video.pause();
    // Keep the last decoded frame until the orbit has defocused the device.
    for (const device of outgoing) {
      device.video.pause();
      if (!visible || document.hidden) {
        outgoing.delete(device);
        unload(device);
      }
    }
    retireHiddenVideos();
  }

  function retireHiddenVideos() {
    for (const device of outgoing) {
      if (Number(getComputedStyle(device.item).getPropertyValue("--device-sharp")) > .01) continue;
      outgoing.delete(device);
      unload(device);
    }
  }

  function canLoad() {
    return visible && !document.hidden &&
      (manualPlayback || (!reducedMotion.matches && !hero.hasAttribute("data-clouds-static")));
  }

  function shouldPlay() {
    return canLoad() && !userPaused && !scrubbing;
  }

  function syncPlayback(inView = visible) {
    visible = inView;
    const playing = shouldPlay();
    stage.toggleAttribute("data-playing", playing);
    replay?.animations?.forEach(animation => playing ? animation.play() : animation.pause());
    if (!canLoad()) {
      if (active.loading) unload(active);
    } else if (!active.ready && !active.loading) {
      const selected = active;
      void load(selected).then(loaded => {
        if (selected !== active) return;
        if (loaded) syncPlayback();
        else updateProgress();
      });
    }
    if (!playing) pauseAll();
    updateProgress();
    if (!playing || !active.ready) return;
    active.item.setAttribute("data-front", "");
    if (active.video.ended) { void restart(); return; }
    const version = revision;
    active.video.play().catch(() => {
      if (version !== revision) return;
      stage.removeAttribute("data-playing");
      updateProgress();
    });
  }

  function releaseVideo(video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }

  function prepareReplay(device) {
    if (replay) return replay.ready;
    const video = device.video.cloneNode(false);
    video.removeAttribute("id");
    video.muted = true;
    video.style.opacity = "0";
    const controller = new AbortController();
    const next = replay = { device, video, controller };
    next.ready = (async () => {
      video.load();
      await waitForVideo(video, "loadedmetadata", () => Number.isFinite(video.duration), controller.signal);
      await cueVideo(video, 0, controller.signal);
      return next;
    })().catch(error => {
      if (!controller.signal.aborted) console.warn("Device preview replay unavailable", error);
      if (replay === next) replay = undefined;
      releaseVideo(video);
      return null;
    });
    return next.ready;
  }

  function clearReplay() {
    if (!replay) return;
    if (replay.animations) {
      replay.animations.forEach(animation => animation.finish());
      return;
    }
    replay.controller.abort();
    releaseVideo(replay.video);
    replay = undefined;
  }

  async function restart() {
    if (cycling || !active.ready) return;
    cycling = true;
    const current = active;
    const version = revision;
    let next;
    try {
      next = await prepareReplay(current);
      if (!next || version !== revision || !shouldPlay()) return;
      await next.video.play();
      if (version !== revision || !shouldPlay()) { next.video.pause(); return; }
      const previous = current.video;
      // Additive blending preserves the opaque device body through the dissolve.
      const group = document.createElement("div");
      Object.assign(group.style, { position: "absolute", inset: "0", isolation: "isolate" });
      previous.before(group);
      group.append(previous, next.video);
      previous.removeAttribute("id");
      next.video.id = "device-preview";
      current.video = next.video;
      observeVideo(current, next.video);
      previous.style.mixBlendMode = next.video.style.mixBlendMode = "plus-lighter";
      const options = { duration: reducedMotion.matches ? 0 : 1100, easing, fill: "both" };
      next.animations = [previous.animate([{ opacity: 1 }, { opacity: 0 }], options),
        next.video.animate([{ opacity: 0 }, { opacity: 1 }], options)];
      updateProgress();
      await Promise.all(next.animations.map(animation => animation.finished));
      group.before(next.video);
      next.video.style.removeProperty("opacity");
      next.video.style.removeProperty("mix-blend-mode");
      next.animations.forEach(animation => animation.cancel());
      releaseVideo(previous);
      group.remove();
      if (replay === next) replay = undefined;
    } catch (error) {
      console.warn("Device preview could not crossfade", error);
    } finally {
      cycling = false;
      updateProgress();
    }
  }

  function select(device) {
    if (device === active) {
      if (!device.ready && !device.loading) syncPlayback();
      return;
    }
    endScrub();
    revision++;
    transition?.abort();
    transition = new AbortController();
    clearReplay();
    if (active.ready) {
      const { duration, currentTime, buffered, paused } = active.video;
      parkedCue = { device: active, duration, currentTime };
      // A fully buffered clip can finish its orbit fade without making a request.
      const fullyBuffered = active.blobURL || (buffered.length === 1 &&
        buffered.start(0) === 0 && buffered.end(0) >= duration - .05);
      outgoing.add(active);
      if (paused || reducedMotion.matches || !fullyBuffered) active.video.pause();
    } else if (active.loading) {
      unload(active);
    }
    outgoing.delete(device);
    active.video.removeAttribute("id");
    active = device;
    device.video.id = "device-preview";
    stage.dataset.device = device.button.dataset.device;
    // The device can move into place while its video loads or seeks.
    void moveOrbit(device.button);
    void moveLiquid(device.button, transition.signal);
    syncPlayback();
  }

  function observeVideo(device, video) {
    for (const event of ["timeupdate", "play", "pause", "loadedmetadata", "emptied"]) {
      video.addEventListener(event, () => { if (device === active && device.video === video) updateProgress(); });
    }
    video.addEventListener("ended", () => {
      if (device.video !== video) return;
      updateProgress();
      if (device === active && shouldPlay()) void restart();
    });
  }

  devices.forEach(device => {
    device.button.addEventListener("click", () => { void select(device); });
    observeVideo(device, device.video);
  });
  document.addEventListener("visibilitychange", () => syncPlayback());
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      manualPlayback = false;
      clearReplay();
    }
    syncPlayback();
  });
  return syncPlayback;
}
