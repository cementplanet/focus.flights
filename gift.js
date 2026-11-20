export function setupGiftDescent(download, gift, windowFlight, ease) {
  const sequence = gift.parentElement;
  const motionBlur = gift.querySelector("feGaussianBlur");
  const content = download.querySelector(".download-layout");

  function align() {
    window.scrollTo({ top: download.offsetTop, behavior: "instant" });
  }

  function paint(position, velocity) {
    if (!sequence.hasAttribute("data-gift-descent")) {
      windowFlight.end(true);
      sequence.setAttribute("data-gift-descent", "");
      content.inert = true;
      align();
    }
    // Stretch the Glide tail so the pool of light and the box resolve in sequence.
    const t = 1 - Math.pow(1 - position, .49);
    const travel = ease(0, .95, t);
    const speed = Math.min(1, Math.abs(velocity) * .95);
    download.style.setProperty("--sky-travel", travel);
    download.style.setProperty("--sky-copy", 1 - ease(.04, .54, t));
    download.style.setProperty("--sky-stars", 1 - ease(.06, .62, t));
    const streak = 10 * speed * ease(0, .18, t);
    motionBlur.setAttribute("stdDeviation", `${streak * .16} ${streak}`);
    gift.style.setProperty("--blackout", ease(.01, .66, t));
    gift.style.setProperty("--spotlight", ease(.20, .72, t));
    gift.style.setProperty("--stage-travel", 1 - travel);
    gift.style.setProperty("--box-light", ease(.32, .83, t));
    gift.style.setProperty("--box-blur", (7 * speed * (1 - ease(.65, .94, t))) + "px");
  }

  function end() {
    if (!sequence.hasAttribute("data-gift-descent")) return;
    sequence.removeAttribute("data-gift-descent");
    for (const name of ["blackout", "spotlight", "stage-travel", "box-light", "box-blur"]) {
      gift.style.removeProperty("--" + name);
    }
  }
  return { paint, end, align };
}
