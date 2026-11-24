export function setupDeviceLiquid(container, initial, reducedMotion) {
  const svg = container.querySelector('.device-liquid');
  const faces = [...svg.querySelectorAll('.liquid-face')];
  const inks = [...svg.querySelectorAll('.liquid-ink')];
  const gradient = container.querySelector('#device-bridge-tint');
  const buttons = [...container.querySelectorAll('button')];
  const shapeRadius = 21.75;
  const bodies = buttons.map(button => ({ button, base: [0, 0], p: [0, 0, 1, 1], v: [0, 0, 0, 0] }));
  const stops = [...(gradient?.children ?? [])];
  let connected = [0, 1], connection = 0, connectionSpeed = 0;
  let target = initial, position = buttons.indexOf(initial), velocity = 0;
  let frame = 0, previous = 0, complete, drag, hover, bounds;
  let suppressClick = false;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  // Easing Wizard Glide, stepped analytically so redirection retains velocity.
  function glide(value, speed, goal, dt, rate = 2.8) {
    const decay = 625 / 48;
    const root = Math.sqrt(decay ** 2 - 2063 / 24);
    const slow = (-decay + root) * rate, fast = (-decay - root) * rate;
    const offset = value - goal, weight = (speed - fast * offset) / (slow - fast);
    const a = weight * Math.exp(slow * dt), b = (offset - weight) * Math.exp(fast * dt);
    return [goal + a + b, a * slow + b * fast];
  }

  // Easing Wizard 1 / 50 / 65 (0a1i1j50k65y214), fitted to a short 11% elastic rebound.
  function rebound(value, speed, goal, dt) {
    const decay = 22, frequency = 32;
    const offset = value - goal, b = (speed + decay * offset) / frequency;
    const e = Math.exp(-decay * dt), c = Math.cos(frequency * dt), s = Math.sin(frequency * dt);
    return [goal + e * (offset * c + b * s), e * ((b * frequency - decay * offset) * c - (offset * frequency + decay * b) * s)];
  }

  function point(body, angle) {
    const [x, y, sx, sy] = body.p;
    return [body.base[0] + x + shapeRadius * sx * Math.cos(angle), body.base[1] + y + shapeRadius * sy * Math.sin(angle)];
  }
  function tangent(body, angle, length) {
    const dx = body.p[2] * Math.sin(angle), dy = -body.p[3] * Math.cos(angle);
    const magnitude = Math.hypot(dx, dy);
    return [dx / magnitude * length, dy / magnitude * length];
  }
  const add = (a, b, sign = 1) => a.map((v, i) => v + b[i] * sign);
  const arc = (body, end) => `A ${shapeRadius * body.p[2]} ${shapeRadius * body.p[3]} 0 1 0 ${end}`;

  function paintShape(index, path, fill, opacity = 1) {
    faces[index].setAttribute('d', path);
    inks[index].setAttribute('d', path);
    inks[index].setAttribute('fill', fill);
    inks[index].setAttribute('fill-opacity', opacity);
  }

  function paint(pair, fusion) {
    const first = bodies[pair[0]], second = bodies[pair[1]];
    if (second) {
      const delta = add(add(second.base, second.p), add(first.base, first.p), -1);
      const distance = Math.hypot(...delta);
      const radius = body => shapeRadius / Math.hypot(delta[0] / distance / body.p[2], delta[1] / distance / body.p[3]);
      const contact = clamp((6 - (distance - radius(first) - radius(second))) / 6, 0, 1);
      // Join only within a short contact zone; separated jelly keeps its own rounded surface.
      fusion *= contact * contact * (3 - 2 * contact);
    } else fusion = 0;
    const fills = bodies.map((_, i) => Math.max(0, 1 - Math.abs(clamp(position, -1, buttons.length - 1) - i)));
    bodies.forEach((body, i) => {
      if (fusion > .035 && pair.includes(i)) {
        if (i === pair[1]) paintShape(i, '', 'none');
        return;
      }
      const left = point(body, Math.PI), right = point(body, 0);
      const circle = `M ${left} ${arc(body, right)} ${arc(body, left)} Z`;
      paintShape(i, circle, 'var(--aqua-selection, #000)', fills[i]);
    });
    if (fusion > .035) {
      const a = bodies[pair[0]], b = bodies[pair[1]];
      const ac = add(a.base, a.p), bc = add(b.base, b.p);
      const angle = Math.atan2(bc[1] - ac[1], bc[0] - ac[0]);
      const spread = 1.08 * fusion;
      const at = angle - spread, ab = angle + spread;
      const bt = angle + Math.PI + spread, bb = angle + Math.PI - spread;
      const p = point(a, at), q = point(a, ab), r = point(b, bb), s = point(b, bt);
      const handle = Math.min(10 * fusion, Math.hypot(...add(r, q, -1)) * .42);
      const joined = `M ${p} ${arc(a, q)} C ${add(q, tangent(a, ab, handle))} ${add(r, tangent(b, bb, handle), -1)} ${r}
        ${arc(b, s)} C ${add(s, tangent(b, bt, handle))} ${add(p, tangent(a, at, handle), -1)} ${p} Z`;
      paintShape(pair[0], joined, 'url(#device-bridge-tint)');
      // Each fused pair owns its tint; a dragged stop cannot slice through another sphere.
      const start = add(ac, add(bc, ac, -1).map(v => v * .3));
      const end = add(ac, add(bc, ac, -1).map(v => v * .7));
      gradient.setAttribute('x1', start[0]); gradient.setAttribute('y1', start[1]);
      gradient.setAttribute('x2', end[0]); gradient.setAttribute('y2', end[1]);
      stops[0].setAttribute('stop-opacity', fills[pair[0]]);
      stops[1].setAttribute('stop-opacity', fills[pair[1]]);
    }
    bodies.forEach((body, i) => {
      const fill = fills[i];
      body.button.style.setProperty('--device-icon-fill', `${Math.min(1, fill * 1.65) * 100}%`);
      body.button.querySelectorAll('svg:not(.aqua-button-surface)').forEach(icon => {
        icon.style.transform = `translate(${body.p[0]}px, ${body.p[1]}px) scale(${body.p[2]}, ${body.p[3]})`;
      });
    });
  }

  function tick(now) {
    const dt = Math.min(.032, Math.max(0, now - previous) / 1000);
    previous = now;
    const goal = buttons.indexOf(target);
    [position, velocity] = glide(position, velocity, goal, dt);
    const selectionMoving = Math.abs(position - goal) > .001 || Math.abs(velocity) > .012;
    if (!selectionMoving) { position = goal; velocity = 0; complete?.(); complete = undefined; }
    const value = clamp(position, 0, buttons.length - 1);
    const index = Math.max(0, Math.min(buttons.length - 2, Math.floor(value)));
    let pair = [index, index + 1], fusion = buttons.length > 1 ? Math.sin(Math.PI * (value - index)) : 0;
    if (drag?.moved) {
      const neighbor = bodies.map((body, i) => ({ i, d: Math.hypot(body.base[0] - drag.x, body.base[1] - drag.y) }))
        .filter(item => item.i !== drag.index).sort((a, b) => a.d - b.d)[0];
      if (neighbor && Math.abs(neighbor.i - drag.index) === 1) {
        pair = [Math.min(neighbor.i, drag.index), Math.max(neighbor.i, drag.index)];
        fusion = Math.max(fusion, clamp(1 - neighbor.d / 65, 0, 1));
      }
    }
    const samePair = pair[0] === connected[0];
    const desiredConnection = fusion;
    if (!samePair && connection < .012) connected = pair;
    [connection, connectionSpeed] = glide(connection, connectionSpeed,
      pair[0] === connected[0] ? fusion : 0, dt, 5.2);
    if (connection < .001 && Math.abs(connectionSpeed) < .01) connection = connectionSpeed = 0;
    pair = connected;
    fusion = reducedMotion.matches ? 0 : connection;
    let moving = selectionMoving || Math.abs(connectionSpeed) > .01 || Math.abs(connection - desiredConnection) > .003;
    bodies.forEach((body, i) => {
      const desired = [0, 0, 1, 1];
      if (fusion > 0 && pair.includes(i)) {
        const other = bodies[pair[0] === i ? pair[1] : pair[0]];
        const dx = other.base[0] - body.base[0], dy = other.base[1] - body.base[1];
        const distance = Math.hypot(dx, dy);
        desired[0] = dx / distance * 4.2 * fusion;
        desired[1] = dy / distance * 4.2 * fusion;
        desired[2] += (Math.abs(dx) / distance * .13 - .045) * fusion;
        desired[3] += (Math.abs(dy) / distance * .13 - .045) * fusion;
      }
      if (drag?.index === i) {
        const dx = drag.x - drag.startX, dy = drag.y - drag.startY;
        const distance = Math.hypot(dx, dy);
        const pull = distance ? 24 * Math.tanh(distance / 55) / distance : 0;
        desired[0] += dx * pull;
        desired[1] += dy * pull;
        const stretch = .16 * (1 - Math.exp(-distance / 70));
        const alongX = distance ? dx * dx / (distance * distance) : .5;
        desired[2] *= .9 + stretch * (1.35 * alongX - .35);
        desired[3] *= .9 + stretch * (1.35 * (1 - alongX) - .35);
        if (!drag.moved) desired[2] = desired[3] = .9;
      } else if (!drag && hover?.index === i) {
        desired[0] += (hover.x - body.base[0]) * .13;
        desired[1] += (hover.y - body.base[1]) * .13;
        desired[2] *= 1.035; desired[3] *= 1.035;
      }
      for (let axis = 0; axis < 4; axis++) {
        if (reducedMotion.matches) { body.p[axis] = axis < 2 ? 0 : 1; body.v[axis] = 0; continue; }
        const step = axis < 2 && drag ? glide : rebound;
        [body.p[axis], body.v[axis]] = step(body.p[axis], body.v[axis], desired[axis], dt, 5);
        if (Math.abs(body.p[axis] - desired[axis]) + Math.abs(body.v[axis]) > .003) moving = true;
        else { body.p[axis] = desired[axis]; body.v[axis] = 0; }
      }
    });
    paint(pair, fusion);
    container.toggleAttribute('data-liquid-moving', moving);
    frame = moving ? requestAnimationFrame(tick) : 0;
  }
  function wake() {
    if (frame) return;
    previous = performance.now();
    frame = requestAnimationFrame(tick);
  }
  function settle() {
    cancelAnimationFrame(frame); frame = 0;
    position = buttons.indexOf(target); velocity = 0;
    connection = connectionSpeed = 0;
    // The SVG viewport includes the full rubber-band excursion and its shadow (Safari clips filter output).
    svg.setAttribute('viewBox', `-64 -64 ${container.offsetWidth + 128} ${container.offsetHeight + 128}`);
    bodies.forEach(body => {
      body.base = [body.button.offsetLeft + body.button.offsetWidth / 2, body.button.offsetTop + body.button.offsetHeight / 2];
      body.p = [0, 0, 1, 1]; body.v = [0, 0, 0, 0];
    });
    paint([0, 1], 0);
    container.removeAttribute('data-liquid-moving');
    complete?.(); complete = undefined;
  }
  async function move(button, signal) {
    complete?.(); complete = undefined;
    target = button;
    if (reducedMotion.matches) { settle(); return; }
    const abort = () => { complete?.(); complete = undefined; };
    signal?.addEventListener('abort', abort, { once: true });
    await new Promise(resolve => { complete = resolve; wake(); });
    signal?.removeEventListener('abort', abort);
  }
  const local = event => ({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  buttons.forEach((button, index) => {
    button.addEventListener('pointerenter', event => {
      if (button.disabled || event.pointerType !== 'mouse' || drag) return;
      bounds = container.getBoundingClientRect(); hover = { index, ...local(event) }; wake();
    });
    button.addEventListener('pointerleave', () => { hover = undefined; wake(); });
    button.addEventListener('pointerdown', event => {
      if (button.disabled || !event.isPrimary || event.button !== 0 || drag) return;
      bounds = container.getBoundingClientRect();
      const point = local(event);
      drag = { index, id: event.pointerId, ...point, startX: point.x, startY: point.y, moved: false };
      hover = undefined; button.setPointerCapture(event.pointerId); wake();
    });
    button.addEventListener('pointermove', event => {
      if (drag?.id === event.pointerId) {
        Object.assign(drag, local(event));
        drag.moved ||= Math.hypot(drag.x - drag.startX, drag.y - drag.startY) > 6;
        wake();
      } else if (hover?.index === index) { Object.assign(hover, local(event)); wake(); }
    });
    function release(event) {
      if (drag?.id !== event.pointerId) return;
      const ended = drag; drag = undefined;
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      const cancelled = event.type !== 'pointerup';
      suppressClick = ended.moved || cancelled;
      if (ended.moved && !cancelled) {
        const nearest = bodies.map((body, i) => ({ i, d: Math.hypot(body.base[0] - ended.x, body.base[1] - ended.y) }))
          .sort((a, b) => a.d - b.d)[0];
        if (nearest.d < 40) buttons[nearest.i].click();
      }
      setTimeout(() => { suppressClick = false; }, 0);
      wake();
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('click', event => {
      if (suppressClick && event.detail > 0) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    // A button drag must not also start the site's full-page swipe gesture.
    for (const type of ['touchstart', 'touchmove']) button.addEventListener(type, event => event.stopPropagation(), { passive: true });
  });
  container.setAttribute('data-liquid', '');
  settle();
  new ResizeObserver(() => { drag = hover = undefined; settle(); }).observe(container);
  reducedMotion.addEventListener('change', () => { drag = hover = undefined; settle(); });
  return move;
}
