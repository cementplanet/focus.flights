export function setupWindowFlight(cabin, download, ease, setCamera) {
  const host = cabin.querySelector(".porthole");
  const sequence = cabin.parentElement;
  const content = download.querySelector(".download-layout");
  content.inert = true;
  let layout;

  function measure() {
    const screen = cabin.getBoundingClientRect();
    const window = host.getBoundingClientRect();
    download.style.setProperty("--download-offset", (cabin.offsetTop - download.offsetTop) + "px");
    layout = {
      x: (window.left + window.width / 2 - screen.left) / screen.width,
      y: (window.top + window.height / 2 - screen.top) / screen.height,
      width: window.width / screen.width,
      aspect: screen.width / screen.height,
    };
  }

  function camera(t) {
    const path = 1 - (1 - t) ** .58;
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

  function paint(t) {
    if (!sequence.hasAttribute("data-window-flight")) {
      window.scrollTo({top: cabin.offsetTop, behavior: "instant"});
      sequence.setAttribute("data-window-flight", "");
      measure();
    }
    const view = camera(t);
    const arrival = ease(.46, .97, view.rise / 1250);
    download.style.setProperty("--download-arrival", arrival);
    content.inert = arrival < .99;
    const approach = view.advance / 3.57;
    const nearFocus = ease(.24, .78, approach) * (1 - ease(.8, 1.14, approach));
    view.blur = 2.4 * nearFocus;
    cabin.style.setProperty("--wall-light", 1 - ease(.08, .95, approach));
    cabin.style.setProperty("--cabin-copy", 1 - ease(0, .58, approach));
    cabin.style.setProperty("--copy-drift", (-5 * ease(0, .68, approach)) + "vw");
    setCamera(view, cabin);
  }

  function end(atDownload = false) {
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
