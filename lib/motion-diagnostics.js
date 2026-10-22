// Opt-in, local diagnostics: append ?motion-debug=1. No collection or network requests.
export function createMotionDiagnostics() {
  if (!new URLSearchParams(location.search).has("motion-debug"))
    return undefined;
  const output = document.createElement("output");
  output.id = "motion-diagnostics";
  output.setAttribute("aria-live", "off");
  Object.assign(output.style, {
    position: "fixed",
    top: "6px",
    right: "6px",
    zIndex: "10000",
    maxWidth: "220px",
    padding: "6px",
    font: "11px monospace",
    color: "#fff",
    background: "#20242bea",
    pointerEvents: "none",
    whiteSpace: "pre-line",
  });
  document.body.append(output);
  const frames = [],
    intervals = [],
    tasks = [];
  let active = 0,
    frame = 0,
    last = null;
  const supportsTasks =
    globalThis.PerformanceObserver?.supportedEntryTypes?.includes("longtask");
  function render() {
    const sorted = [...frames].sort((a, b) => a - b);
    const p95 = sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
    output.textContent = `MOTION · ${frames.length} quadros\np95 ${p95.toFixed(1)} ms · máx. ${Math.max(0, ...frames).toFixed(1)} ms\nTarefas >50 ms: ${supportsTasks ? tasks.length : "API indisponível"}`;
  }
  function tick(now) {
    if (!active) return;
    if (last !== null) frames.push(now - last);
    if (frames.length > 2000) frames.shift();
    last = now;
    frame = requestAnimationFrame(tick);
  }
  if (supportsTasks) {
    const observer = new PerformanceObserver((list) => {
      for (const task of list.getEntries()) {
        if (
          intervals.some(
            (range) =>
              task.startTime < range.end &&
              task.startTime + task.duration > range.start,
          )
        )
          tasks.push(task.duration);
      }
      render();
    });
    observer.observe({ type: "longtask" });
    window.addEventListener("pagehide", () => observer.disconnect(), {
      once: true,
    });
  }
  render();
  return () => {
    const range = { start: performance.now(), end: Infinity };
    intervals.push(range);
    if (intervals.length > 200) intervals.shift();
    if (active++ === 0) {
      last = null;
      frame = requestAnimationFrame(tick);
    }
    return () => {
      range.end = performance.now();
      if (--active === 0) {
        cancelAnimationFrame(frame);
        last = null;
      }
      render();
    };
  };
}
