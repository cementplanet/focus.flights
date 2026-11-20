export function setupWindowFlight(cabin, download, ease, setCamera) {
  const host = cabin.querySelector(".porthole");
  const copy = cabin.querySelector(".focus-copy");
  const sequence = cabin.parentElement;
  const content = download.querySelector(".download-layout");
  content.inert = true;
  const meteor = download.querySelector(".sky-meteor");
  const header = document.querySelector(".site-header");
  const downloadCopy = content.querySelector(".download-copy");
  let meteorStart = null;
  let layout;

  function measure() {
    const screen = cabin.getBoundingClientRect();
    const window = host.getBoundingClientRect();
    cabin.style.setProperty("--cabin-offset", (download.offsetTop - cabin.offsetTop) + "px");
    // Reserve the label's full upward entrance offset, plus room for the train.
    const labelTravel = Math.min(42, Math.max(20, .04 * screen.height));
    const copyTop = downloadCopy.getBoundingClientRect().top - download.getBoundingClientRect().top;
    const headerBottom = header.getBoundingClientRect().bottom;
    // On short screens wait for the heading to settle before using this gap.
    const tightSky = copyTop - headerBottom < labelTravel + 52;
    layout = {
      meteorCue: tightSky ? .84 : .55,
      meteorTop: headerBottom + 9,
      meteorBottom: copyTop - (tightSky ? 9 : labelTravel + 16),
      screenWidth: screen.width,
      x: (window.left + window.width / 2 - screen.left) / screen.width,
      y: (window.top + window.height / 2 - screen.top) / screen.height,
      width: window.width / screen.width,
      aspect: screen.width / screen.height,
    };
  }

  function camera(t) {
    const remaining = (1 - t) ** .58;
    // Log distance is linear in time in the spring's exponential tail.
    // A quadratic stop matches the incoming speed and reaches zero before settle().
    const tail = .24;
    const distance = remaining >= tail ? remaining
      : tail * Math.max(0, 1 + .5 * Math.log(remaining / tail)) ** 2;
    const path = 1 - distance;
    const center = ease(0, .43, path);
    const climb = .68 * path + .32 * ease(0, 1, path);
    const width = layout.width, aspect = layout.aspect;
    const x = layout.x + (.5 - layout.x) * center;
    const y = layout.y + (.5 - layout.y) * center;
    // Hold the exterior field of view independently of the near glass.
    const lensHeight = .44 * 1.5 * 1.14 * width * aspect;
    const skyHeight = lensHeight + (1.08 - lensHeight) * center;
    return {
      x, y, width, advance: 7.25 * path,
      skyX: skyHeight * .435 / (.44 * 1.5) / aspect, skyY: skyHeight,
      skyCenterY: y + .003 * 1.14 * width * aspect * (1 - center),
      pitch: .51 * climb, rise: 1250 * climb, travel: 880 * climb,
      lift: .11 * climb,
    };
  }

  function paintMeteor(view, entering) {
    const climb = view.rise / 1250;
    const now = performance.now();
    if (meteorStart === null && entering && climb >= layout.meteorCue && climb < .96) meteorStart = now;
    const age = meteorStart === null ? -1 : (now - meteorStart) / 1000;
    meteor.hidden = age <= 0 || age >= .72 || climb <= layout.meteorCue - .04 || layout.meteorBottom <= layout.meteorTop;
    if (meteor.hidden) return;

    // A straight angular track at infinity: only camera pitch, not forward travel,
    // moves it relative to the sky. Its light burns out on its own clock.
    const c = Math.cos(view.pitch), s = Math.sin(view.pitch);
    function project(seconds) {
      const x = .16 - .39 * seconds;
      const y = .82 - .12 * seconds;
      const depth = c + s * y;
      const skyY = view.skyCenterY + view.skyY * (.048 - (c * y - s) / (.86 * depth));
      // Frame the projected track in the open sky at this viewport size.
      const bandY = ease(-.02, .43, skyY);
      return {
        x: layout.screenWidth * (view.x + view.skyX * 1.5 * x / depth),
        y: layout.meteorTop + (layout.meteorBottom - layout.meteorTop) * bandY,
      };
    }
    const head = project(age);
    const tail = project(Math.max(0, age - .22));
    const dx = head.x - tail.x, dy = head.y - tail.y;
    const light = ease(0, .10, age) * (1 - ease(.39, .72, age)) * ease(layout.meteorCue - .04, layout.meteorCue, climb);
    meteor.style.opacity = .9 * light;
    meteor.style.transform = `translate(${tail.x}px, ${tail.y - 4}px) rotate(${Math.atan2(dy, dx)}rad) scaleX(${Math.hypot(dx, dy) / 100})`;
  }

  function paint(t, entering) {
    if (!sequence.hasAttribute("data-window-flight")) {
      measure();
      sequence.setAttribute("data-window-flight", "");
      window.scrollTo({top: download.offsetTop, behavior: "instant"});
    }
    const view = camera(t);
    paintMeteor(view, entering);
    const arrival = ease(.46, .97, view.rise / 1250);
    download.style.setProperty("--download-arrival", arrival);
    content.inert = arrival < .99;
    const approach = view.advance / 3.57;
    const nearFocus = ease(.24, .78, approach) * (1 - ease(.8, 1.14, approach));
    view.blur = 2.4 * nearFocus;
    cabin.style.setProperty("--wall-light", 1 - ease(.08, .95, approach));
    copy.style.setProperty("--copy-exit", ease(0, .68, approach));
    setCamera(view, download);
  }

  function end(atDownload = false) {
    meteorStart = null;
    meteor.hidden = true;
    sequence.removeAttribute("data-window-flight");
    content.inert = !atDownload;
    if (atDownload) {
      measure();
      setCamera(camera(1), download);
    } else {
      setCamera(null, host);
    }
  }
  return {paint, measure, end};
}
