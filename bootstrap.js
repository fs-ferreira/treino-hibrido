import { account } from "./lib/account.js";
import { apiRequest, createRemoteDiary } from "./lib/remote-diary.js";
import { notify, dismissNotification } from "./lib/notifications.js";
import { createMotion, TIMES } from "./lib/motion.js?v=1.6.0";

const gate = document.querySelector("#account-gate"),
  shell = document.querySelector(".shell"),
  splash = document.querySelector("#auth-splash"),
  splashStatus = document.querySelector("#auth-splash-status"),
  googleLogin = document.querySelector("#google-login"),
  loginLabel = document.querySelector("[data-login-label]"),
  skip = document.querySelector(".skip"),
  motion = createMotion();
const accessError = "Não foi possível acessar. Tente novamente.",
  actionError = "Não foi possível concluir. Tente novamente.";
const loginTitle = document.querySelector("#account-title").innerHTML;
const loginMessage = document.querySelector("#account-message").textContent;
let mounted = false,
  appLoad,
  appLoadFailed = false,
  generation = 0,
  operation = null;

function isCurrent(value) {
  return operation === value && generation === value.id;
}
function setAccessState(state) {
  gate.dataset.state = state;
  googleLogin.disabled = state !== "idle";
  googleLogin.setAttribute("aria-busy", String(state !== "idle"));
  loginLabel.textContent =
    state === "signing-in" ? "Entrando…" : "Entrar com Google";
}
function announce(message) {
  if (splashStatus.textContent !== message) splashStatus.textContent = message;
}
function setCovered(element, covered) {
  element.inert = covered;
  if (covered) element.setAttribute("aria-hidden", "true");
  else element.removeAttribute("aria-hidden");
}
function beginAccess(state, message) {
  operation?.controller.abort();
  motion.stop(splash);
  const value = {
    id: ++generation,
    controller: new AbortController(),
  };
  operation = value;
  account.blocked = true;
  for (const element of [gate, shell, skip]) setCovered(element, true);
  gate.hidden = shell.hidden = true;
  splash.hidden = false;
  document.body.dataset.accountView = "loading";
  setAccessState(state);
  announce(message);
  dismissNotification();
  return value;
}
function gateOptions() {
  return {
    retry: !document.querySelector("#account-retry").hidden,
    recovery: !document.querySelector("#account-recovery").hidden,
  };
}
function prepareGate({ retry = false, recovery = false } = {}) {
  account.blocked = true;
  shell.hidden = true;
  setCovered(shell, true);
  gate.hidden = false;
  googleLogin.hidden = recovery;
  gate.dataset.recovery = String(recovery);
  document.querySelector("#account-title").innerHTML = recovery
    ? "Recuperar alterações"
    : loginTitle;
  document.querySelector("#account-message").textContent = recovery
    ? "Revise as alterações deste dispositivo para continuar."
    : loginMessage;
  skip.href = "#google-login";
  skip.textContent = "Pular para o acesso";
  document.querySelector("#account-retry").hidden = !retry;
  document.querySelector("#account-recovery").hidden = !recovery;
  document.querySelector("#pending-export").hidden = !account.remote?.pending();
}
function settleView(view, focus) {
  splash.hidden = true;
  setCovered(gate, view !== "login");
  setCovered(shell, view !== "diary");
  setCovered(skip, false);
  document.body.dataset.accountView = view;
  operation = null;
  setAccessState("idle");
  focus?.focus({ preventScroll: true });
}
async function reveal(value, view, focus) {
  if (!isCurrent(value)) return false;
  await motion.play(splash, [{ opacity: 1 }, { opacity: 0 }], {
    duration: TIMES.feedback,
  });
  if (!isCurrent(value)) return false;
  settleView(view, focus);
  return true;
}
function clearDiary() {
  account.blocked = true;
  account.lock?.();
  document.querySelector("#main").replaceChildren();
  document.querySelector("#account-name").textContent = "";
  document.querySelector("#account-email").textContent = "";
  account.identity = account.data = null;
}
function blockAccess() {
  generation++;
  operation?.controller.abort();
  motion.stop(splash);
  clearDiary();
  prepareGate({ retry: true });
  settleView("login", googleLogin);
  notify(accessError);
}
let pendingNotice = null;
function updateStatus(value) {
  account.status = value;
  const notice = ["local", "memory", "unavailable"].includes(value.state);
  if (notice) pendingNotice = value;
  else if (["cloud", "blocked", "recovery"].includes(value.state))
    pendingNotice = null;
  const displayed =
    pendingNotice && ["loading", "saving"].includes(value.state)
      ? pendingNotice
      : value;
  for (const el of document.querySelectorAll("[data-sync-status]")) {
    if (el.textContent !== displayed.message)
      el.textContent = displayed.message;
    el.dataset.state = displayed.state;
    el.classList.toggle(
      "sr-only",
      ["cloud", "loading", "saving"].includes(displayed.state),
    );
  }
}
const syncElement = document.querySelector("[data-sync-status]");
new ResizeObserver(() =>
  document.documentElement.style.setProperty(
    "--sync-height",
    syncElement.classList.contains("sr-only")
      ? "0px"
      : `${syncElement.getBoundingClientRect().height}px`,
  ),
).observe(syncElement);
function download(value) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "hibrido-pendencias.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function mount(value) {
  if (!isCurrent(value)) return;
  announce("Abrindo seu diário…");
  account.blocked = false;
  gate.hidden = true;
  shell.hidden = false;
  // Keep the layout measurable for navigation, but inaccessible under the splash.
  setCovered(shell, true);
  skip.href = "#main";
  skip.textContent = "Pular para o conteúdo";
  if (!mounted) {
    appLoad ??= import("./app.js?v=7.1.1").catch((error) => {
      appLoadFailed = true;
      throw error;
    });
    await appLoad;
    mounted = true;
    if (!isCurrent(value)) return;
  } else account.update?.(account.data, true);
  document.querySelector("#account-name").textContent =
    account.identity.user.name;
  document.querySelector("#account-email").textContent =
    account.identity.user.email;
  updateStatus(account.status);
  await reveal(value, "diary");
}
async function start({ initial = false, force = false } = {}) {
  if (operation && !force) return;
  const value = beginAccess("checking", "Preparando seu acesso…");
  account.remote?.stop();
  // Browsers cache failed ES modules; retry them in a fresh document.
  if (appLoadFailed) {
    location.reload();
    return;
  }
  const remote = createRemoteDiary({
    onOpenPhase(phase) {
      if (isCurrent(value))
        announce(
          phase === "loading"
            ? "Abrindo seu diário…"
            : "Preparando seu acesso…",
        );
    },
    onStatus(status) {
      if (account.remote === remote) updateStatus(status);
    },
    onBlocked() {
      if (account.remote === remote) blockAccess();
    },
    onData(data) {
      if (account.remote !== remote) return;
      account.data = data;
      if (!account.blocked) account.update?.(data);
    },
  });
  account.remote = remote;
  try {
    const opened = await remote.open();
    if (!isCurrent(value)) return;
    account.identity = opened.identity;
    account.data = opened.data;
    if (opened.recovery) {
      prepareGate({ recovery: true });
      document.querySelector("#pending-resume").disabled =
        opened.recovery.generation !== opened.identity.generation;
      const incompatible =
        opened.recovery.generation !== opened.identity.generation;
      document.querySelector("#recovery-explanation").textContent = incompatible
        ? "O diário da conta foi substituído. Estas alterações não podem ser reaplicadas diretamente. Baixe uma cópia para recuperá-las por importação antes de descartar."
        : "Estas alterações ainda não foram enviadas. Continue com elas ou baixe uma cópia antes de descartá-las.";
      await reveal(
        value,
        "login",
        document.querySelector(
          incompatible ? "#pending-export" : "#pending-resume",
        ),
      );
    } else await mount(value);
  } catch (error) {
    if (!isCurrent(value)) return;
    clearDiary();
    prepareGate({ retry: error.status !== 401 });
    const shown = await reveal(value, "login", initial ? null : googleLogin);
    if (shown && (!initial || error.status !== 401)) notify(accessError);
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-account-action]");
  if (!button || button.disabled || operation) return;
  const action = button.dataset.accountAction,
    previousGate = gateOptions();
  let value;
  button.disabled = true;
  try {
    if (action === "login") {
      value = beginAccess("signing-in", "Entrando…");
      const result = await apiRequest("/auth/sign-in/social", {
        method: "POST",
        body: { provider: "google" },
        signal: value.controller.signal,
      });
      if (!isCurrent(value)) return;
      const url = new URL(result.url);
      if (url.protocol !== "https:" || url.hostname !== "accounts.google.com")
        throw Error("Não foi possível iniciar o login.");
      location.assign(url.href);
    }
    if (action === "retry") await start();
    if (action === "export") download(account.remote.recoveryData());
    if (action === "resume" || action === "discard") {
      value = beginAccess("checking", "Abrindo seu diário…");
      const result = await account.remote.recover(action === "resume");
      if (!isCurrent(value) || result?.saved === "blocked") return;
      document.querySelector("#account-recovery").hidden = true;
      await mount(value);
    }
    if (action === "logout" || action === "discard-logout") {
      if (action === "logout" && account.remote.pending()) {
        document.querySelector("#logout-panel").hidden = false;
        return;
      }
      value = beginAccess("checking", "Saindo…");
      await account.remote.logout({ discard: action === "discard-logout" });
      if (!isCurrent(value)) return;
      clearDiary();
      location.reload();
    }
    if (action === "cancel-logout")
      document.querySelector("#logout-panel").hidden = true;
  } catch (error) {
    if (value && !isCurrent(value)) return;
    if (action === "logout" || action === "discard-logout") {
      if ([401, 403].includes(error.status)) {
        blockAccess();
        return;
      }
      account.blocked = false;
      shell.hidden = false;
      if (await reveal(value, "diary")) {
        document.querySelector("#account-action-error").textContent =
          actionError;
        button.disabled = false;
        button.focus({ preventScroll: true });
      }
    } else if (value) {
      prepareGate(previousGate);
      if (await reveal(value, "login", googleLogin))
        notify(action === "login" ? accessError : actionError);
    } else notify(actionError);
  } finally {
    // A successful redirect keeps its busy state until navigation or BFCache return.
    if (!operation) button.disabled = false;
  }
});

function checkInBackground() {
  if (!operation && !account.blocked) void account.remote?.check();
}
window.addEventListener("online", checkInBackground);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) checkInBackground();
});
setInterval(() => {
  if (!document.hidden) checkInBackground();
}, 15000);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) void start({ force: true });
});
const currentUrl = new URL(location.href);
if (currentUrl.searchParams.has("authError")) {
  currentUrl.searchParams.delete("authError");
  history.replaceState(
    history.state,
    "",
    currentUrl.pathname + currentUrl.search + currentUrl.hash,
  );
  prepareGate();
  settleView("login");
  notify(accessError);
} else void start({ initial: true });
