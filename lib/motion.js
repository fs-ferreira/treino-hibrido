export const EASING = "cubic-bezier(0.22, 0.61, 0.36, 1)";
export const TIMES = Object.freeze({
  route: 300,
  day: 260,
  week: 320,
  expand: 320,
  feedback: 240,
  panelIn: 420,
  panelOut: 320,
  dialogIn: 320,
  dialogOut: 260,
});

// One animation per element. Replacement cancels stale work; reduced motion settles it.
export function createMotion(environment = {}) {
  const supported =
    environment.supported ??
    (!globalThis.Element || typeof Element.prototype.animate === "function");
  const doc = environment.document ?? globalThis.document;
  const preference =
    environment.preference ??
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  const active = new Map();
  function stop(element, finish = false) {
    active.get(element)?.settle(finish);
  }
  function finishAll() {
    for (const entry of [...active.values()]) entry.settle(true);
  }
  function play(element, frames, options = {}) {
    stop(element);
    if (!supported || !element?.animate || preference?.matches || doc?.hidden)
      return Promise.resolve(true);
    return new Promise((resolve) => {
      let animation;
      const endSample = environment.onStart?.();
      const entry = {
        settle(result) {
          if (active.get(element) !== entry) return;
          active.delete(element);
          animation?.cancel();
          endSample?.();
          resolve(result);
        },
      };
      active.set(element, entry);
      try {
        animation = element.animate(frames, {
          duration: TIMES.feedback,
          easing: EASING,
          ...options,
        });
        animation.finished.then(
          () => entry.settle(true),
          () => entry.settle(false),
        );
      } catch {
        entry.settle(true);
      }
    });
  }
  const changed = () => {
    if (preference?.matches || doc?.hidden) finishAll();
  };
  preference?.addEventListener("change", changed);
  doc?.addEventListener("visibilitychange", changed);
  return {
    play,
    stop,
    finishAll,
    get reduced() {
      return !supported || Boolean(preference?.matches);
    },
    enter(element, kind = "route", direction = 0) {
      return play(
        element,
        [
          {
            opacity: 0,
            transform: direction
              ? `translateX(${direction * 12}px)`
              : `translateY(${kind === "route" ? 6 : 0}px)`,
          },
          { opacity: 1, transform: "translate(0, 0)" },
        ],
        { duration: TIMES[kind] ?? TIMES.route },
      );
    },
    feedback(element) {
      return play(element, [
        { transform: "scale(1)" },
        { transform: "scale(1.06)", offset: 0.45 },
        { transform: "scale(1)" },
      ]);
    },
    dispose() {
      finishAll();
      preference?.removeEventListener("change", changed);
      doc?.removeEventListener("visibilitychange", changed);
    },
  };
}

export function createAccordions(motion, onChange = () => {}) {
  const active = new Map();
  function settle(card, state) {
    if (active.get(card) !== state) return;
    active.delete(card);
    card.open = state.open;
    card.style.height = "";
    card.querySelector(".exercise-body").inert = false;
    delete card.dataset.expanded;
  }
  return {
    toggle(card) {
      const open = !(active.get(card)?.open ?? card.open);
      const start = card.getBoundingClientRect().height;
      motion.stop(card);
      const state = { open };
      active.set(card, state);
      const body = card.querySelector(".exercise-body");
      if (!open && body.contains(card.ownerDocument.activeElement))
        card.querySelector("summary").focus({ preventScroll: true });
      body.inert = !open;
      card.open = true;
      card.style.height = "auto";
      const end = open
        ? card.getBoundingClientRect().height
        : card.querySelector("summary").getBoundingClientRect().height +
          card.clientTop * 2;
      card.style.height = `${end}px`;
      card.dataset.expanded = String(open);
      onChange(card, open);
      motion
        .play(card, [{ height: `${start}px` }, { height: `${end}px` }], {
          duration: TIMES.expand,
        })
        .then(() => settle(card, state));
    },
    finish() {
      for (const [card, state] of active) {
        motion.stop(card);
        settle(card, state);
      }
    },
  };
}

export function createDialogController(dialog, motion, environment = {}) {
  const doc = environment.document ?? globalThis.document;
  const win = environment.window ?? globalThis.window;
  const mobile =
    environment.mobile ?? (() => win.matchMedia("(max-width: 600px)").matches);
  let state = "closed",
    generation = 0,
    opener,
    savedScroll,
    savedStyles;
  const properties = [
    "position",
    "top",
    "left",
    "right",
    "overflow",
    "paddingRight",
  ];
  function unlock() {
    if (!savedStyles) return;
    for (const name of properties) doc.body.style[name] = savedStyles[name];
    savedStyles = null;
    win.scrollTo({
      left: savedScroll.x,
      top: savedScroll.y,
      behavior: "instant",
    });
  }
  function cleanup() {
    if (state === "closed") return;
    state = "closed";
    delete dialog.dataset.state;
    unlock();
    environment.onClose?.();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }
  function forceClose() {
    generation++;
    motion.stop(dialog);
    if (dialog.open) dialog.close();
    cleanup();
  }
  function close(accept) {
    if (state !== "open") return false;
    state = "closing";
    const token = ++generation;
    dialog.dataset.state = "closing";
    environment.onClosing?.();
    accept?.(); // Commit immediately, once; animation never gates persistence.
    motion
      .play(
        dialog,
        [
          { opacity: 1, transform: "translateY(0)" },
          {
            opacity: mobile() ? 1 : 0,
            transform: mobile() ? "translateY(100%)" : "translateY(8px)",
          },
        ],
        { duration: mobile() ? TIMES.panelOut : TIMES.dialogOut },
      )
      .then(() => {
        if (generation !== token || state !== "closing") return;
        dialog.close();
        cleanup();
      });
    return true;
  }
  function show() {
    generation++;
    motion.stop(dialog);
    if (!dialog.open) {
      opener = doc.activeElement;
      savedScroll = { x: win.scrollX, y: win.scrollY };
      savedStyles = Object.fromEntries(
        properties.map((name) => [name, doc.body.style[name]]),
      );
      const gap = Math.max(0, win.innerWidth - doc.documentElement.clientWidth);
      const padding =
        parseFloat(win.getComputedStyle(doc.body).paddingRight) || 0;
      Object.assign(doc.body.style, {
        position: "fixed",
        top: `${-savedScroll.y}px`,
        left: "0",
        right: "0",
        overflow: "hidden",
        paddingRight: `${padding + gap}px`,
      });
      dialog.showModal();
    }
    state = "open";
    dialog.dataset.state = "open";
    dialog.scrollTop = 0;
    dialog.querySelector(".close-button")?.focus({ preventScroll: true });
    motion.play(
      dialog,
      [
        {
          opacity: mobile() ? 1 : 0,
          transform: mobile() ? "translateY(100%)" : "translateY(8px)",
        },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: mobile() ? TIMES.panelIn : TIMES.dialogIn },
    );
  }
  const cancel = (event) => {
    event.preventDefault();
    close();
  };
  const closed = () => {
    if (!dialog.open) {
      motion.stop(dialog);
      cleanup();
    }
  };
  dialog.addEventListener("cancel", cancel);
  dialog.addEventListener("close", closed);
  return {
    show,
    close,
    forceClose,
    get closing() {
      return state === "closing";
    },
  };
}
