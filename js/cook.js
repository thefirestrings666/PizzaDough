// Mode cuisine : une étape à la fois en plein écran, avec un minuteur,
// une alerte à la fin et l'écran qui reste allumé.

const $ = (id) => document.getElementById(id);
const dialog = $('cook');
const timeFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

let steps = [];
let index = 0;
let remainingMs = 0; // temps restant quand le minuteur est en pause
let endAt = 0;       // heure de fin quand le minuteur tourne (0 = en pause)
let tick = null;
let wakeLock = null;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function fmt(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(s)}` : `${p(m)}:${p(s)}`;
}

function render() {
  const st = steps[index];
  $('cookProgress').textContent = `Étape ${index + 1} / ${steps.length}`;
  $('cookWhen').textContent = `Prévu ${timeFmt.format(st.start)}${st.parallel ? ' (en parallèle)' : ''}`;
  $('cookTitle').textContent = st.title;
  $('cookDetail').textContent = st.detail;
  $('cookIngredients').innerHTML = st.ingredients.map(([n, q]) => `<li><span>${esc(n)}</span><b>${esc(q)}</b></li>`).join('');
  $('cookPrev').disabled = index === 0;
  $('cookNext').textContent = index === steps.length - 1 ? 'Terminer ✓' : 'Suivant →';
  renderTimer();
}

function renderTimer() {
  const running = endAt > 0;
  const left = running ? endAt - Date.now() : remainingMs;
  $('timerValue').textContent = fmt(left);
  $('timerToggle').textContent = running ? 'Pause' : (left < steps[index].durationMin * 60e3 && left > 0 ? 'Reprendre' : 'Démarrer le minuteur');
  $('timer').classList.toggle('done', left <= 0);
}

function resetTimer() {
  stop();
  remainingMs = steps[index].durationMin * 60e3;
  $('timer').classList.remove('done');
  renderTimer();
}

function stop() {
  clearInterval(tick);
  tick = null;
  if (endAt) remainingMs = Math.max(0, endAt - Date.now());
  endAt = 0;
}

function start() {
  if (remainingMs <= 0) remainingMs = steps[index].durationMin * 60e3;
  endAt = Date.now() + remainingMs;
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  tick = setInterval(() => {
    if (Date.now() >= endAt) {
      stop();
      remainingMs = 0;
      alarm(steps[index].title);
    }
    renderTimer();
  }, 250);
  renderTimer();
}

function alarm(title) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.frequency.value = 880;
      gn.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      gn.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.connect(gn).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.32);
    });
  } catch { /* son indisponible */ }
  navigator.vibrate?.([300, 150, 300]);
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('🍕 Minuteur terminé', { body: title });
    }
  } catch { /* certaines plateformes exigent un service worker */ }
}

async function keepAwake() {
  if (!('wakeLock' in navigator)) {
    $('wakeNote').textContent = 'Ton navigateur ne permet pas de garder l’écran allumé.';
    return;
  }
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    $('wakeNote').textContent = 'L’écran reste allumé tant que le mode cuisine est ouvert.';
  } catch {
    $('wakeNote').textContent = '';
  }
}

function go(i) {
  index = Math.max(0, Math.min(steps.length - 1, i));
  render();
  resetTimer();
}

/** Ouvre le mode cuisine sur l'étape en cours (selon l'heure actuelle). */
export function openCook(newSteps) {
  if (!newSteps.length) return;
  steps = newSteps;
  const now = Date.now();
  const currentIdx = steps.findLastIndex((s) => !s.parallel && s.start.getTime() <= now);
  go(currentIdx < 0 ? 0 : currentIdx);
  dialog.showModal();
  keepAwake();
}

$('cookPrev').addEventListener('click', () => go(index - 1));
$('cookNext').addEventListener('click', () => (index === steps.length - 1 ? dialog.close() : go(index + 1)));
$('timerToggle').addEventListener('click', () => (endAt ? stop() : start(), renderTimer()));
$('timerReset').addEventListener('click', resetTimer);
$('cookClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  stop();
  wakeLock?.release().catch(() => {});
  wakeLock = null;
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && dialog.open && (!wakeLock || wakeLock.released)) keepAwake();
});
