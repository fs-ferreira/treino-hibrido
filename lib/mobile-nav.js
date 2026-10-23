import { TIMES, motionProgress } from "./motion.js?v=1.6.0";

export const wrap = (value, count) => ((value % count) + count) % count;
export const circularDistance = (value, count) =>
  wrap(value + count / 2, count) - count / 2;

// Estimate a short coast from recent pointer samples, never from wrapped items.
export function navRelease(position, samples, releasedAt, stride) {
  const snap = {
    target: Math.round(position),
    duration: TIMES.week,
    inertia: false,
  };
  const recent = samples.filter((s) => releasedAt - s.t <= 100),
    last = recent.at(-1);
  let first = last,
    lastDirection = 0;
  for (let i = recent.length - 2; i >= 0; i--) {
    const dx = recent[i + 1].x - recent[i].x;
    if (Math.abs(dx) >= 1) {
      if (lastDirection && Math.sign(dx) !== lastDirection) break;
      lastDirection = Math.sign(dx);
    }
    first = recent[i];
  }
  if (
    !first ||
    !last ||
    stride <= 0 ||
    releasedAt - last.t > 80 ||
    releasedAt - first.t < 8
  )
    return snap;
  const velocity = Math.max(
    -2,
    Math.min(2, (last.x - first.x) / (releasedAt - first.t)),
  );
  if (Math.abs(velocity) < 0.18) return snap;
  const direction = -Math.sign(velocity),
    travel = Math.min(1.25, (Math.abs(velocity) * 135) / stride);
  let target = Math.round(position + direction * travel);
  if (Math.abs(target - position) > 1.5) target -= direction;
  // A tiny/slow release can still snap back; never call that forward inertia.
  if ((target - position) * direction <= 0) return snap;
  return {
    target,
    duration: Math.max(
      320,
      Math.min(
        460,
        (3 * Math.abs(target - position) * stride) / Math.abs(velocity),
      ),
    ),
    inertia: true,
  };
}
export function navPositions(width, position, count = 5) {
  const stride = width / 3.5;
  return Array.from({ length: count }, (_, index) => ({
    x:
      (width - stride) / 2 +
      circularDistance(index - position, count) * stride +
      4,
    width: stride - 8,
  }));
}

// Five real anchors, no clones. A link wraps only while fully outside the viewport.
export function createMobileNav(root, environment = {}) {
  const track = root.querySelector(".nav-track");
  const links = Array.from(root.querySelectorAll("[data-nav]"));
  const doc = environment.document ?? root.ownerDocument;
  const win = environment.window ?? doc.defaultView;
  const mobile = environment.mobile ?? win.matchMedia("(max-width: 600px)");
  const preference =
    environment.preference ??
    win.matchMedia("(prefers-reduced-motion: reduce)");
  const requestFrame =
    environment.requestFrame ?? win.requestAnimationFrame?.bind(win);
  const cancelFrame =
    environment.cancelFrame ?? win.cancelAnimationFrame?.bind(win);
  const supported =
    environment.supported ?? typeof win.PointerEvent !== "undefined";
  const now = environment.now ?? (() => win.performance.now());
  const listeners = [];
  let enabled = false,
    width = 0,
    position = 0,
    active = null,
    frame = null,
    tween = null,
    gesture = null,
    suppressClickUntil = 0,
    disposed = false;
  function listen(target, name, callback, options) {
    target?.addEventListener(name, callback, options);
    listeners.push(() => target?.removeEventListener(name, callback, options));
  }
  function stop() {
    if (frame !== null) cancelFrame?.(frame);
    frame = null;
    tween = null;
  }
  function paint() {
    if (!enabled || disposed) return;
    const positions = navPositions(width, position, links.length);
    links.forEach((link, index) => {
      link.style.transform = `translate3d(${positions[index].x}px, 0, 0)`;
    });
  }
  function schedule() {
    if (frame === null) frame = requestFrame(step);
  }
  function step(timestamp) {
    frame = null;
    if (disposed || !enabled) return;
    if (tween) {
      const progress = Math.max(
        0,
        Math.min(1, (timestamp - tween.start) / tween.duration),
      );
      position = wrap(
        tween.from +
          tween.delta *
            (tween.inertia
              ? 1 - (1 - progress) ** 3
              : motionProgress(progress)),
        links.length,
      );
      if (progress === 1) {
        position = tween.target;
        tween = null;
      }
    }
    paint();
    if (tween) schedule();
  }
  function center(index, animate = true, release = null) {
    stop();
    if (!enabled || !links.length) return;
    const delta = circularDistance(index - position, links.length);
    if (
      !animate ||
      preference.matches ||
      doc.hidden ||
      Math.abs(delta) < 0.00001
    ) {
      position = wrap(index, links.length);
      paint();
      return;
    }
    tween = {
      from: position,
      delta,
      target: wrap(index, links.length),
      start: now(),
      duration: release?.duration ?? TIMES.week,
      inertia: Boolean(release?.inertia),
    };
    schedule();
  }
  function releaseCapture(previous) {
    if (previous) {
      try {
        track.releasePointerCapture?.(previous.id);
      } catch {
        /* already released by the browser */
      }
    }
  }
  function cancelGesture() {
    const previous = gesture;
    gesture = null;
    releaseCapture(previous);
  }
  function refresh(force = false) {
    if (disposed) return;
    const nextEnabled = Boolean(
      track &&
        links.length === 5 &&
        mobile.matches &&
        supported &&
        requestFrame &&
        cancelFrame,
    );
    if (!nextEnabled) {
      stop();
      cancelGesture();
      enabled = false;
      root.classList.remove("is-circular");
      links.forEach((link) => {
        link.style.width = "";
        link.style.transform = "";
      });
      if (track) track.scrollLeft = 0;
      return;
    }
    root.classList.add("is-circular");
    const nextWidth = track.getBoundingClientRect().width;
    if (!force && enabled && Math.abs(width - nextWidth) < 0.1) return;
    stop();
    cancelGesture();
    position = enabled
      ? wrap(Math.round(position), links.length)
      : Math.max(
          0,
          links.findIndex((link) => link.dataset.nav === active),
        );
    enabled = true;
    width = nextWidth;
    const positions = navPositions(width, position, links.length);
    links.forEach((link, index) => {
      link.style.width = `${positions[index].width}px`;
    });
    track.scrollLeft = 0;
    paint();
  }
  function setActive(route) {
    const index = links.findIndex((link) => link.dataset.nav === route);
    if (disposed || index < 0) return;
    const first = active === null;
    active = route;
    links.forEach((link, i) => {
      link.classList.toggle("active", index === i);
      if (index === i) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    cancelGesture();
    center(index, !first);
  }
  function down(event) {
    // Yield to native pinch zoom as soon as a second finger touches the menu.
    if (enabled && event.pointerType === "touch" && event.isPrimary === false) {
      if (gesture) {
        settle();
        suppressClickUntil = now() + 400;
      }
      return;
    }
    if (
      !enabled ||
      event.isPrimary === false ||
      (event.button !== undefined && event.button !== 0)
    )
      return;
    stop();
    paint();
    suppressClickUntil = 0;
    gesture = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      start: position,
      touch: event.pointerType === "touch",
      moved: false,
      dragging: false,
      samples: [{ x: event.clientX, t: now() }],
    };
  }
  function sample(current, x) {
    const t = now(),
      last = current.samples.at(-1);
    if (last?.x === x) return;
    if (last?.t === t) last.x = x;
    else current.samples.push({ x, t });
    while (current.samples.length > 2 && current.samples[0].t < t - 100)
      current.samples.shift();
  }
  function move(event) {
    if (!gesture || gesture.id !== event.pointerId || !enabled) return;
    const dx = event.clientX - gesture.x,
      dy = event.clientY - gesture.y;
    sample(gesture, event.clientX);
    gesture.moved ||= Math.max(Math.abs(dx), Math.abs(dy)) >= 8;
    if (!gesture.dragging) {
      if (!gesture.moved) return;
      // The menu owns one-finger touch gestures (CSS pinch-zoom). Do not
      // abandon a swipe because the finger first drifted vertically.
      if (gesture.touch && Math.abs(dx) < 8) return;
      if (!gesture.touch && Math.abs(dy) >= Math.abs(dx)) {
        cancelGesture();
        center(Math.round(position), false);
        return;
      }
      gesture.dragging = true;
      try {
        track.setPointerCapture?.(event.pointerId);
      } catch {
        /* window listeners still handle the gesture */
      }
    }
    position = wrap(gesture.start - dx / (width / 3.5), links.length);
    schedule();
  }
  function up(event) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const previous = gesture;
    gesture = null;
    releaseCapture(previous);
    if (previous.dragging || (previous.touch && previous.moved)) {
      if (
        previous.dragging &&
        event.type === "pointerup" &&
        Number.isFinite(event.clientX)
      ) {
        // Include the final coordinate without turning a stationary hold into velocity.
        if (event.clientX !== previous.samples.at(-1)?.x)
          sample(previous, event.clientX);
        position = wrap(
          previous.start - (event.clientX - previous.x) / (width / 3.5),
          links.length,
        );
      }
      const release =
        previous.dragging &&
        event.type === "pointerup" &&
        !preference.matches &&
        !doc.hidden
          ? navRelease(position, previous.samples, now(), width / 3.5)
          : {
              target: Math.round(position),
              duration: TIMES.week,
              inertia: false,
            };
      suppressClickUntil = now() + Math.max(400, release.duration);
      center(release.target, event.type !== "pointercancel", release);
    } else if (event.type === "pointercancel")
      center(Math.round(position), false);
  }
  function clicked(event) {
    if (enabled && event.detail !== 0 && now() < suppressClickUntil) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }
  function focused(event) {
    if (!enabled) return;
    const index = links.indexOf(event.target.closest?.("[data-nav]"));
    if (index < 0) return;
    // Pointer focus must not move a partially visible link out from under the finger.
    if (!gesture) center(index, false);
    track.scrollLeft = 0;
  }
  function keyed(event) {
    if (
      !enabled ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    )
      return;
    const index = links.indexOf(event.target.closest?.("[data-nav]"));
    if (
      index < 0 ||
      !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
    )
      return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? links.length - 1
          : wrap(index + (event.key === "ArrowRight" ? 1 : -1), links.length);
    cancelGesture();
    links[next].focus({ preventScroll: true });
  }
  function settle() {
    const target = tween ? tween.target : Math.round(position);
    stop();
    cancelGesture();
    center(target, false);
  }
  listen(root, "pointerdown", down);
  listen(win, "pointermove", move);
  listen(win, "pointerup", up);
  listen(win, "pointercancel", up);
  listen(track, "lostpointercapture", (event) => {
    // Touch implicitly captures the hit link/icon. Its capture loss bubbles
    // here when we take over a horizontal drag; only loss of our own capture
    // ends the gesture.
    if (event.target === track) up(event);
  });
  listen(root, "click", clicked, true);
  listen(root, "dragstart", (event) => {
    if (enabled) event.preventDefault();
  });
  listen(root, "focusin", focused);
  listen(root, "keydown", keyed);
  listen(win, "blur", settle);
  listen(win, "resize", () => refresh(true));
  listen(mobile, "change", () => refresh(true));
  listen(preference, "change", () => {
    if (preference.matches) settle();
  });
  listen(doc, "visibilitychange", () => {
    if (doc.hidden) settle();
  });
  const Observer = environment.ResizeObserver ?? win.ResizeObserver;
  const observer = Observer ? new Observer(() => refresh()) : null;
  observer?.observe(root);
  refresh();
  return {
    setActive,
    refresh: () => refresh(true),
    get position() {
      return position;
    },
    get enabled() {
      return enabled;
    },
    dispose() {
      if (disposed) return;
      stop();
      cancelGesture();
      disposed = true;
      observer?.disconnect();
      listeners.forEach((remove) => remove());
      root.classList.remove("is-circular");
      links.forEach((link) => {
        link.style.width = "";
        link.style.transform = "";
      });
    },
  };
}
