// The liner approaches the camera while the cloud deck stays at optical infinity.
export function setupWindowFlight(cabin, download, ease) {
  const sequence = cabin.parentElement;
  const frame = cabin.querySelector(".porthole");
  let view;

  function measure() {
    const scene = cabin.getBoundingClientRect();
    const glass = frame.getBoundingClientRect();
    const width = scene.width, height = scene.height;
    // Inscribed in the projected gasket of the 3D mesh, in CSS pixels.
    const rx = glass.width * .236, ry = glass.width * .330;
    const fill = Math.hypot(width / (2 * rx), height / (2 * ry)) / .80;
    view = {width, height, rx, ry, fill,
      x: glass.left + glass.width / 2 - scene.left,
      y: glass.top + glass.height / 2 - scene.top};
    download.style.setProperty("--download-offset", (cabin.offsetTop - download.offsetTop) + "px");
  }

  function paint(t) {
    if (!view) {
      window.scrollTo({top: cabin.offsetTop, behavior: "instant"});
      measure();
      sequence.setAttribute("data-window-flight", "");
    }
    const {width, height, x, y, rx, ry, fill} = view;
    // Perspective magnification is inversely proportional to remaining lens distance.
    const scale = 1 / (1 - t * (1 - 1 / fill));
    const aim = ease(0, .90, t);
    const dx = (width / 2 - x) * aim, dy = (height / 2 - y) * aim;
    const focus = ease(.15, .87, t);
    cabin.style.setProperty("--cabin-camera", `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`);
    cabin.style.setProperty("--liner-blur", (8 * focus / scale) + "px");
    cabin.style.setProperty("--wall-light", 1 - focus * .85);
    cabin.style.setProperty("--cabin-copy", 1 - ease(0, .5, t));
    cabin.style.setProperty("--copy-drift", (-width * .07 * aim) + "px");
    cabin.style.setProperty("--copy-blur", (4 * aim) + "px");

    download.style.setProperty("--pane-x", (x + dx) + "px");
    download.style.setProperty("--pane-y", (y + dy) + "px");
    download.style.setProperty("--pane-rx", (rx * scale) + "px");
    download.style.setProperty("--pane-ry", (ry * scale) + "px");
    download.style.setProperty("--outside-opacity", ease(.19, .68, t));
    const horizonShift = (y - height * .69) * (1 - t);
    download.style.setProperty("--horizon-shift", horizonShift + "px");
    download.style.setProperty("--distant-scale", 1 + 2 * Math.abs(horizonShift) / height + .04 * (1 - t));
    download.style.setProperty("--distant-blur", (2.3 * (1 - focus)) + "px");
  }

  function end() {
    if (!view) return;
    view = undefined;
    sequence.removeAttribute("data-window-flight");
  }
  return {paint, measure, end};
}
