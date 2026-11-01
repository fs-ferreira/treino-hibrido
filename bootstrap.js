import { account } from "./lib/account.js";
import { apiRequest, createRemoteDiary } from "./lib/remote-diary.js";
import { notify, dismissNotification } from "./lib/notifications.js";
const gate = document.querySelector("#account-gate"),
  shell = document.querySelector(".shell"),
  googleLogin = document.querySelector("#google-login"),
  loginLabel = document.querySelector("[data-login-label]"),
  progress = document.querySelector("#account-progress"),
  skip = document.querySelector(".skip");
const accessError = "Não foi possível acessar. Tente novamente.",
  actionError = "Não foi possível concluir. Tente novamente.";
let mounted = false,
  starting = false,
  signingIn = false,
  redirecting = false;
function setAccessState(state) {
  gate.dataset.state = state;
  googleLogin.disabled = state !== "idle";
  googleLogin.setAttribute("aria-busy", String(state !== "idle"));
  loginLabel.textContent =
    state === "signing-in" ? "Entrando…" : "Entrar com Google";
  progress.textContent = state === "checking" ? "Preparando seu acesso…" : "";
}
function showGate({ retry = false, recovery = false } = {}) {
  account.blocked = true;
  shell.hidden = true;
  gate.hidden = false;
  document.body.dataset.accountView = "login";
  skip.href = "#google-login";
  skip.textContent = "Pular para o acesso";
  document.querySelector("#account-retry").hidden = !retry;
  document.querySelector("#account-recovery").hidden = !recovery;
  document.querySelector("#pending-export").hidden = !account.remote?.pending();
  if (!signingIn) setAccessState("idle");
}
function updateStatus(value) {
  account.status = value;
  for (const el of document.querySelectorAll("[data-sync-status]")) {
    el.textContent = value.message;
    el.dataset.state = value.state;
  }
}
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
async function mount() {
  account.blocked = false;
  gate.hidden = true;
  shell.hidden = false;
  document.body.dataset.accountView = "diary";
  skip.href = "#main";
  skip.textContent = "Pular para o conteúdo";
  dismissNotification();
  if (!mounted) {
    await import("./app.js?v=2.1.0");
    mounted = true;
  } else account.update?.(account.data, true);
  document.querySelector("#account-name").textContent =
    account.identity.user.name;
  document.querySelector("#account-email").textContent =
    account.identity.user.email;
  updateStatus(account.status);
}
async function start({ initial = false } = {}) {
  if (starting || signingIn) return;
  starting = true;
  setAccessState("checking");
  try {
    account.remote?.stop();
    const remote = createRemoteDiary({
      onStatus(value) {
        if (account.remote === remote) updateStatus(value);
      },
      onBlocked() {
        if (account.remote !== remote) return;
        showGate({ retry: true });
        account.lock?.();
        notify(accessError);
        if (!signingIn) googleLogin.focus({ preventScroll: true });
      },
      onData(data) {
        if (account.remote !== remote) return;
        account.data = data;
        if (!account.blocked) account.update?.(data);
      },
    });
    account.remote = remote;
    const opened = await remote.open();
    account.identity = opened.identity;
    account.data = opened.data;
    if (opened.recovery) {
      showGate({ recovery: true });
      document.querySelector("#pending-resume").disabled =
        opened.recovery.generation !== opened.identity.generation;
    } else await mount();
  } catch (error) {
    showGate({ retry: error.status !== 401 });
    account.lock?.();
    if (!initial || error.status !== 401) notify(accessError);
  } finally {
    starting = false;
    setAccessState("idle");
    if (!initial && !gate.hidden) googleLogin.focus({ preventScroll: true });
  }
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-account-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.accountAction;
  try {
    if (action === "login") {
      if (starting || signingIn) return;
      signingIn = true;
      dismissNotification();
      setAccessState("signing-in");
      const value = await apiRequest("/auth/sign-in/social", {
        method: "POST",
        body: { provider: "google" },
      });
      const url = new URL(value.url);
      if (url.protocol !== "https:" || url.hostname !== "accounts.google.com")
        throw Error("Não foi possível iniciar o login.");
      location.assign(url.href);
      redirecting = true;
    }
    if (action !== "login") button.disabled = true;
    if (action === "retry") await start();
    if (action === "export") download(account.remote.recoveryData());
    if (action === "resume" || action === "discard") {
      const result = await account.remote.recover(action === "resume");
      if (result?.saved === "blocked") return;
      document.querySelector("#account-recovery").hidden = true;
      await mount();
    }
    if (action === "logout") {
      if (account.remote.pending()) {
        document.querySelector("#logout-panel").hidden = false;
        return;
      }
      await account.remote.logout();
      location.reload();
    }
    if (action === "cancel-logout")
      document.querySelector("#logout-panel").hidden = true;
    if (action === "discard-logout") {
      await account.remote.logout({ discard: true });
      location.reload();
    }
  } catch (error) {
    if (gate.hidden) {
      const el = document.querySelector("#account-action-error");
      el.textContent = error.message || "Não foi possível concluir.";
    } else notify(action === "login" ? accessError : actionError);
  } finally {
    if (action === "login") {
      if (!redirecting) {
        signingIn = false;
        setAccessState("idle");
        googleLogin.focus({ preventScroll: true });
      }
    } else button.disabled = false;
  }
});
window.addEventListener("online", () => {
  if (!account.blocked) void account.remote?.check();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !account.blocked) void account.remote?.check();
});
setInterval(() => {
  if (!document.hidden && !account.blocked) void account.remote?.check();
}, 15000);
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    signingIn = redirecting = false;
    setAccessState("idle");
  }
});
const currentUrl = new URL(location.href);
if (currentUrl.searchParams.has("authError")) {
  showGate();
  currentUrl.searchParams.delete("authError");
  history.replaceState(
    history.state,
    "",
    currentUrl.pathname + currentUrl.search + currentUrl.hash,
  );
  notify(accessError);
} else void start({ initial: true });
