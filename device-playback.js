function flightProgress(cues, duration, time) {
  if (!Number.isFinite(duration) || duration <= 0) return [0, 0, 0, 0];
  // Existing cue points mark the takeoff prompt, flight map, and arrival screen.
  const boundaries = [0, cues[2], cues[3], cues[5], duration];
  return boundaries.slice(0, -1).map((start, index) =>
    Math.max(0, Math.min(1, (time - start) / (boundaries[index + 1] - start))));
}

function flightTime(cues, duration, progress) {
  const boundaries = [0, cues[2], cues[3], cues[5], duration];
  const position = Math.max(0, Math.min(4, progress / 25));
  const index = Math.min(3, Math.floor(position));
  return Math.min(duration - 1 / 30,
    boundaries[index] + (boundaries[index + 1] - boundaries[index]) * (position - index));
}

function correspondingTime(previous, current, destination) {
  const from = [0, ...previous.cues, current.duration];
  const to = [0, ...destination.cues, destination.video.duration];
  const time = Math.min(current.duration, current.currentTime);
  const end = Math.max(0, destination.video.duration - 1 / 30);
  if (!Number.isFinite(current.duration)) return 0;
  if (from.length !== to.length) return Math.min(end, time * end / current.duration);
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
  const appleVideo = (navigator.vendor === "Apple Computer, Inc." || CSS.supports("-webkit-touch-callout", "none"))
    && firstVideo.canPlayType('video/mp4; codecs="hvc1"');
  const signal = new AbortController().signal;
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
    video.poster = `${base}.png`;
    video.setAttribute("aria-hidden", "true");
    item.querySelector(".device-orbit-media").append(video);
    return { button, video, item, base, cues: button.dataset.cues?.split(",").map(Number) ?? [], ready: false };
  });
  let active = devices[0];
  let cueSource = active;
  const outgoing = new Set();
  const local = ["127.0.0.1", "localhost"].includes(location.hostname);
  const easing = getComputedStyle(stage).getPropertyValue("--orbit-ease").trim();
  let ranges;
  let started = false;
  let visible = false;
  let switching = false;
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
    const source = switching ? cueSource : active;
    let progress = flightProgress(source.cues, source.video.duration, source.video.currentTime);
    if (replay?.device === source && replay.animations) {
      const blend = replay.animations[1].effect.getComputedTiming().progress ?? 0;
      const position = 4 + (progress.reduce((sum, value) => sum + value, 0) - 4) * blend;
      progress = progress.map((_, index) => Math.max(0, Math.min(1, position - index)));
    }
    if (shouldPlay() && active.ready && !switching && !replay && active.video.duration - active.video.currentTime < 2.5) {
      void prepareReplay(active);
    }
    segments.forEach((segment, index) => {
      segment.style.setProperty("--roundness", Math.sin(Math.PI * progress[index]) ** 2);
      segment.style.setProperty("--remaining", `${(1 - progress[index]) * 100}%`);
      const percent = String(Math.round(progress[index] * 100));
      if (segment.getAttribute("aria-valuenow") !== percent) segment.setAttribute("aria-valuenow", percent);
    });
    scrubber.disabled = !active.ready || switching || cycling;
    if (!scrubbing) scrubber.value = progress.reduce((sum, value) => sum + value, 0) * 25;
    const currentSegment = Math.min(3, Math.floor(Number(scrubber.value) / 25));
    scrubber.setAttribute("aria-valuetext", `${segments[currentSegment].getAttribute("aria-label")}, ${Math.round(Number(scrubber.value))}%`);
    toggle.disabled = !active.ready || switching;
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
    active.video.currentTime = flightTime(active.cues, active.video.duration, Number(scrubber.value));
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

  function load(device) {
    return device.loading ??= (async () => {
      const src = `${device.base}.${appleVideo ? "mov" : "webm"}`;
      if (local) {
        ranges ??= fetch(src, { method: "HEAD" })
          .then(response => response.headers.get("accept-ranges") === "bytes")
          .catch(() => false);
        if (!await ranges) {
          const response = await fetch(src, { signal });
          if (!response.ok) throw new Error(`Missing ${src}`);
          device.blobURL = URL.createObjectURL(await response.blob());
        }
      }
      // Safari may stop at metadata unless frame loading is explicitly requested.
      device.video.src = device.blobURL ?? src;
      device.video.load();
      await waitForVideo(device.video, "loadedmetadata", () => Number.isFinite(device.video.duration), signal);
      await cueVideo(device.video, 0, signal);
      device.ready = true;
      delete device.video.dataset.buffering;
      return true;
    })().catch(error => {
      device.video.pause();
      device.video.removeAttribute("src");
      device.video.load();
      if (device.blobURL) URL.revokeObjectURL(device.blobURL);
      device.blobURL = undefined;
      device.loading = undefined;
      console.warn(`Device preview unavailable: ${device.button.dataset.device}`, error);
      return false;
    });
  }

  function pauseAll() {
    devices.forEach(({ video, item }) => { video.pause(); item.removeAttribute("data-front"); });
    replay?.video.pause();
  }

  function retireHiddenVideos() {
    for (const device of outgoing) {
      if (Number(getComputedStyle(device.item).getPropertyValue("--device-sharp")) > .01) continue;
      device.video.pause();
      device.item.removeAttribute("data-front");
      outgoing.delete(device);
    }
  }

  function shouldPlay() {
    return visible && !document.hidden && (!reducedMotion.matches || manualPlayback) && !userPaused && !scrubbing;
  }

  function syncPlayback(inView = visible) {
    visible = inView;
    const playing = shouldPlay();
    stage.toggleAttribute("data-playing", playing);
    replay?.animations?.forEach(animation => playing ? animation.play() : animation.pause());
    if (visible && !started) {
      started = true;
      void (async () => {
        await load(active);
        syncPlayback();
        // Prepare paused streams serially; no background playback or periodic seeking.
        for (const device of devices) if (device !== active) await load(device);
      })();
    }
    updateProgress();
    if (!playing) { pauseAll(); return; }
    for (const device of outgoing) {
      device.item.setAttribute("data-front", "");
      if (!device.video.ended) device.video.play().catch(() => {});
    }
    if (switching) return;
    if (!active.ready) {
      if (!active.loading) void load(active).then(loaded => { if (loaded) syncPlayback(); });
      return;
    }
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

  function clearPreparedReplay() {
    if (!replay || replay.animations) return;
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
      Object.assign(group.style, { position: "absolute", inset: "0", isolation: "isolate", opacity: "var(--device-sharp, 1)" });
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

  async function select(device) {
    if (device === active && (switching || device.ready)) return;
    endScrub();
    revision++;
    transition?.abort();
    transition = new AbortController();
    const selectionSignal = transition.signal;
    clearPreparedReplay();
    if (!switching && active.ready) cueSource = active;
    if (active !== device && active.ready) outgoing.add(active);
    outgoing.delete(device);
    active = device;
    switching = true;
    stage.querySelector("#device-preview")?.removeAttribute("id");
    device.video.id = "device-preview";
    stage.dataset.device = device.button.dataset.device;
    // The device can move into place while its video loads or seeks.
    void moveOrbit(device.button);
    void moveLiquid(device.button, selectionSignal);
    updateProgress();
    try {
      if (!await load(device) || selectionSignal.aborted) return;
      // A returning, still-playing device keeps its current frames without a seek.
      if (device.video.paused && cueSource.ready && device !== cueSource) {
        await cueVideo(device.video, correspondingTime(cueSource, cueSource.video, device), selectionSignal);
      }
    } catch (error) {
      if (!selectionSignal.aborted) {
        console.warn("Device preview could not synchronize", error);
      }
    } finally {
      if (!selectionSignal.aborted) {
        switching = false;
        if (device.ready) syncPlayback();
        else updateProgress();
      }
    }
  }

  function observeVideo(device, video) {
    for (const event of ["timeupdate", "play", "pause", "loadedmetadata", "emptied"]) {
      video.addEventListener(event, () => { if (device === active && device.video === video) updateProgress(); });
    }
    video.addEventListener("ended", () => {
      if (device.video !== video) return;
      updateProgress();
      if (device === active && shouldPlay() && !switching) void restart();
    });
  }

  devices.forEach(device => {
    device.button.addEventListener("pointerenter", () => { if (device !== active) void load(device); });
    device.button.addEventListener("focus", () => { if (device !== active) void load(device); });
    device.button.addEventListener("pointerdown", () => { if (device !== active) void load(device); });
    device.button.addEventListener("click", () => { void select(device); });
    observeVideo(device, device.video);
  });
  document.addEventListener("visibilitychange", () => syncPlayback());
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      manualPlayback = false;
      replay?.animations?.forEach(animation => animation.finish());
    }
    syncPlayback();
  });
  return syncPlayback;
}
