import { account } from "./lib/account.js";
import { apiRequest, createRemoteDiary } from "./lib/remote-diary.js";
const gate = document.querySelector("#account-gate"),
  shell = document.querySelector(".shell");
const message = document.querySelector("#account-message");
let mounted = false,
  starting = false;
function showGate(text) {
  account.blocked = true;
  shell.hidden = true;
  gate.hidden = false;
  message.textContent = text;
  document.querySelector("#pending-export").hidden = !account.remote?.pending();
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
  if (!mounted) {
    await import("./app.js");
    mounted = true;
  } else account.update?.(account.data, true);
  document.querySelector("#account-name").textContent =
    account.identity.user.name;
  document.querySelector("#account-email").textContent =
    account.identity.user.email;
  updateStatus(account.status);
}
async function start() {
  if (starting) return;
  starting = true;
  try {
    account.remote?.stop();
    const remote = createRemoteDiary({
      onStatus(value) {
        if (account.remote === remote) updateStatus(value);
      },
      onBlocked(error) {
        if (account.remote !== remote) return;
        showGate(error.message);
        document.querySelector("#account-retry").hidden = false;
        account.lock?.();
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
      showGate(
        "Encontramos alterações locais de uma sessão anterior. Exporte uma cópia e escolha como continuar.",
      );
      document.querySelector("#account-recovery").hidden = false;
      document.querySelector("#pending-resume").disabled =
        opened.recovery.generation !== opened.identity.generation;
    } else await mount();
  } catch (error) {
    showGate(
      error.status === 401
        ? "Entre com sua conta Google autorizada para acessar seu diário."
        : error.message || "Não foi possível conectar. Tente novamente.",
    );
    if (error.status !== 401)
      document.querySelector("#account-retry").hidden = false;
  } finally {
    starting = false;
    document.querySelector("#google-login").disabled = false;
  }
}
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-account-action]");
  if (!button) return;
  const action = button.dataset.accountAction;
  try {
    if (action === "login") {
      button.disabled = true;
      const value = await apiRequest("/auth/sign-in/social", {
        method: "POST",
        body: { provider: "google" },
      });
      const url = new URL(value.url);
      if (url.protocol !== "https:" || url.hostname !== "accounts.google.com")
        throw Error("Não foi possível iniciar o login.");
      location.assign(url.href);
    }
    if (action === "retry") await start();
    if (action === "export") download(account.remote.recoveryData());
    if (action === "resume" || action === "discard") {
      await account.remote.recover(action === "resume");
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
    } else message.textContent = error.message || "Não foi possível concluir.";
  } finally {
    button.disabled = false;
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
if (new URLSearchParams(location.search).has("authError")) {
  showGate(
    "Login não concluído ou conta não autorizada. Tente novamente com uma conta permitida.",
  );
  history.replaceState(null, "", location.pathname + location.hash);
} else void start();
