let toastTimer;

export function dismissNotification() {
  clearTimeout(toastTimer);
  document.querySelector("#toast").classList.remove("visible");
}

export function notify(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(dismissNotification, 4000);
}
