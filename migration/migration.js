import { KEY, validateBackup } from './lib/core.js';
const status = document.querySelector('#migration-status'), button = document.querySelector('#export-legacy');
let raw;
try {
  raw = localStorage.getItem(KEY);
  if (raw) {
    button.disabled = false;
    try { const data = validateBackup(JSON.parse(raw)); status.textContent = `${Object.keys(data.sessions).length} sessões encontradas neste navegador.`; }
    catch { status.textContent = 'Não foi possível validar o diário. Baixe uma cópia dos dados originais antes de continuar.'; }
  } else status.textContent = 'Nenhum diário encontrado neste navegador. Se usava outro aparelho ou navegador, faça a exportação nele.';
} catch { status.textContent = 'Não foi possível acessar o armazenamento. Tente no navegador em que você registrava os treinos.'; }
button.addEventListener('click', () => {
  if (!raw) return;
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' })), link = document.createElement('a');
  link.href = url; link.download = 'hibrido-diario-anterior.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
try {
  const { url } = await (await fetch('./migration-target.json')).json(), target = new URL(url);
  if (target.protocol === 'https:') { const link = document.querySelector('#new-app'); link.href = target.origin; link.hidden = false; }
} catch { /* The export remains available even if the destination cannot load. */ }
