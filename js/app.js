// Relie le formulaire aux calculs : recalcul en direct, sauvegarde des
// réglages et affichage des résultats et des étapes.
import { directDough, roundDough, withPreferment, estimateYeastPctPhases, PREFERMENTS, YEAST_TYPES, round } from './calc.js';
import { buildSchedule, totalHours, toICS } from './schedule.js';
import { openCook } from './cook.js';

const STORAGE_KEY = 'pizzadough:v1';
const FRIDGE_TEMP = 4;

const $ = (id) => document.getElementById(id);
const form = $('form');

const PRESETS = {
  classic: { count: null, ballWeight: 250, hydration: 57, saltPct: 3, yeastMode: 'classic', method: 'direct', bulkHours: 2, proofHours: 4, fridge: false },
  neo: { count: null, ballWeight: 270, hydration: 65, saltPct: 2.8, yeastMode: 'auto', method: 'direct', bulkHours: 24, proofHours: 4, fridge: true },
  romana: { count: null, ballWeight: 180, hydration: 60, saltPct: 2.5, yeastMode: 'auto', method: 'direct', bulkHours: 2, proofHours: 6, fridge: false },
};

const METHOD_HINTS = {
  direct: 'Tout se mélange en une fois. C’est la méthode la plus simple.',
  poolish: 'Préferment liquide (100 % d’eau) préparé 12 à 16 h avant. Il donne une pâte plus aromatique et plus alvéolée.',
  biga: 'Préferment ferme (45 % d’eau) préparé 16 à 24 h avant, au frais. Il donne beaucoup de goût et une mie très légère.',
};

const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' });

const num = (v, fallback) => {
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
};
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

// ---------- Lecture et écriture du formulaire ----------

function readState() {
  const f = form.elements;
  return {
    count: clamp(Math.round(num(f.count.value, 1)), 1, 100),
    ballWeight: clamp(num(f.ballWeight.value, 250), 50, 2000),
    hydration: clamp(num(f.hydration.value, 57), 40, 100),
    saltPct: clamp(num(f.saltPct.value, 3), 0, 10),
    yeastType: f.yeastType.value,
    yeastMode: f.yeastMode.value,
    yeastPct: clamp(num(f.yeastPct.value, 0.2), 0.01, 5),
    method: f.method.value,
    flourShare: clamp(num(f.flourShare.value, 30), 5, 100),
    mealTime: f.mealTime.value,
    prefermentHours: clamp(num(f.prefermentHours.value, 14), 0.5, 72),
    bulkHours: clamp(num(f.bulkHours.value, 2), 0.25, 120),
    proofHours: clamp(num(f.proofHours.value, 4), 0.25, 48),
    roomTemp: clamp(num(f.roomTemp.value, 22), 5, 40),
    fridge: f.fridge.checked,
  };
}

function writeState(s) {
  const f = form.elements;
  for (const [k, v] of Object.entries(s)) {
    if (v == null || !f[k]) continue;
    if (k === 'fridge') f.fridge.checked = !!v;
    else f[k].value = v; // fonctionne aussi pour les groupes de boutons radio (RadioNodeList)
  }
}

function save(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* stockage indisponible */ }
}

function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; }
}

/** Format attendu par <input type="datetime-local"> (heure locale). */
function toLocalInput(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Heure du repas par défaut : le prochain 20 h qui laisse assez de temps. */
function defaultMealTime(hoursNeeded) {
  const d = new Date();
  d.setHours(20, 0, 0, 0);
  while (d.getTime() - Date.now() < hoursNeeded * 3600e3) d.setDate(d.getDate() + 1);
  return d;
}

// ---------- Calcul ----------

function compute(s) {
  let yeastPct = 0.2;
  if (s.yeastMode === 'custom') yeastPct = s.yeastPct;
  if (s.yeastMode === 'auto') {
    yeastPct = estimateYeastPctPhases([
      { hours: s.bulkHours, tempC: s.fridge ? FRIDGE_TEMP : s.roomTemp },
      { hours: s.proofHours, tempC: s.roomTemp },
    ]);
  }
  const dough = directDough({ count: s.count, ballWeight: s.ballWeight, hydration: s.hydration, saltPct: s.saltPct, yeastPct, yeastType: s.yeastType });
  const split = s.method === 'direct' ? null : withPreferment(dough, { type: s.method, flourShare: s.flourShare });

  const meal = s.mealTime ? new Date(s.mealTime) : null;
  const steps = meal && !isNaN(meal) ? buildSchedule({
    mealTime: meal, method: s.method, prefermentHours: s.prefermentHours,
    bulkHours: s.bulkHours, proofHours: s.proofHours, fridge: s.fridge,
  }) : [];
  return { s, yeastPct, dough, split, meal, steps };
}

// ---------- Affichage ----------

const yeastName = (type) => YEAST_TYPES[type]?.label ?? 'Levure';
const g = (v, digits = 1) => `${(digits === 2 ? nf2 : nf1).format(round(v, digits))}`;

function ingredientItems(x, yeastType, { salt = true } = {}) {
  const items = [
    ['Farine', x.flour, 'g', 1],
    ['Eau', x.water, 'g', 1],
  ];
  if (salt) items.push(['Sel', x.salt, 'g', 1]);
  items.push([yeastName(yeastType), x.yeast, 'g', 2]);
  return items;
}

function renderIngredients(items, compact = false) {
  return `<ul class="ingredients${compact ? ' compact' : ''}">${items.map(([name, v, unit, d]) =>
    `<li><span class="qty">${g(v, d)}<small>${unit}</small></span><span class="name">${name}</span></li>`).join('')}</ul>`;
}

function renderResults({ s, yeastPct, dough, split }) {
  const out = $('results');
  const r = roundDough(dough);
  if (!split) {
    out.innerHTML = renderIngredients(ingredientItems(r, s.yeastType))
      + `<p class="total-line">${s.count} pâton${s.count > 1 ? 's' : ''} de ${nf1.format(s.ballWeight)} g, soit ${nf1.format(dough.total)} g de pâte.</p>`;
  } else {
    const cfg = PREFERMENTS[split.type];
    out.innerHTML = `
      <h3>${cfg.label} : à préparer ${nf1.format(s.prefermentHours)} h avant</h3>
      ${renderIngredients(ingredientItems(split.preferment, s.yeastType, { salt: false }), true)}
      <h3>Pâte finale : ${cfg.label.toLowerCase()} +</h3>
      ${renderIngredients(ingredientItems(split.final, s.yeastType), true)}
      <h3>Total</h3>
      ${renderIngredients(ingredientItems(r, s.yeastType).slice(0, 3), true)}
      ${split.clamped ? `<p class="warn">Part du préferment limitée à ${nf1.format(split.flourShare)} % : il ne peut pas contenir plus d’eau que la pâte entière.</p>` : ''}
      <p class="total-line">${s.count} pâton${s.count > 1 ? 's' : ''} de ${nf1.format(s.ballWeight)} g, soit ${nf1.format(dough.total)} g de pâte.</p>`;
  }

  const notes = [];
  if (s.yeastMode === 'classic') notes.push('La quantité de levure paraît très faible, mais ça marche. Essaie !');
  if (s.yeastMode === 'auto') notes.push(`Levure estimée à ${nf2.format(round(yeastPct, 3))} % (équivalent levure fraîche) pour ce planning. C’est une estimation : ajuste-la selon ta cuisine.`);
  if (dough.yeast < 1) notes.push('Moins d’1 g ? Dissous 1 g dans 10 g d’eau et prends-en la quantité voulue × 10.');
  $('yeastNote').textContent = notes.join(' ');
}

function dayLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((day - today) / 864e5);
  if (diff === 0) return 'aujourd’hui';
  if (diff === 1) return 'demain';
  if (diff === -1) return 'hier';
  return dayFmt.format(d);
}

function fmtDuration(min) {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return m ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h`;
}

function renderTimeline({ steps, meal }) {
  const list = $('timeline');
  if (!steps.length) {
    list.innerHTML = '<li><span></span><span class="what"><span>Choisis l’heure du repas pour voir le planning.</span></span></li>';
    $('totalTime').textContent = '';
    return;
  }
  const now = Date.now();
  let lastDay = '';
  list.innerHTML = steps.map((st) => {
    const day = dayLabel(st.start);
    const showDay = day !== lastDay; lastDay = day;
    const end = st.start.getTime() + st.durationMin * 60e3;
    return `<li class="${st.parallel ? 'parallel' : ''}${end < now ? ' past' : ''}">
      <span class="when">${timeFmt.format(st.start)}${showDay ? `<small>${day}</small>` : ''}</span>
      <span class="what"><strong>${st.title}</strong><span>${fmtDuration(st.durationMin)} · ${st.detail}</span></span>
    </li>`;
  }).join('') + `<li><span class="when">${timeFmt.format(meal)}</span><span class="what"><strong>🍕 À table !</strong></span></li>`;
  $('totalTime').textContent = `${fmtDuration(totalHours(steps, meal) * 60)} au total`;
}

function syncControls(s) {
  $('hydrationOut').textContent = s.hydration;
  $('flourShareOut').textContent = s.flourShare;
  $('methodHint').textContent = METHOD_HINTS[s.method];
  $('shareField').hidden = s.method === 'direct';
  $('pfHoursField').hidden = s.method === 'direct';
  for (const btn of document.querySelectorAll('[data-preset]')) {
    const p = PRESETS[btn.dataset.preset];
    const match = Object.entries(p).every(([k, v]) => v == null || String(s[k]) === String(v));
    btn.setAttribute('aria-pressed', String(match));
  }
}

let current;
function update() {
  const s = readState();
  current = compute(s);
  syncControls(s);
  renderResults(current);
  renderTimeline(current);
  save(s);
}

// ---------- Événements ----------

form.addEventListener('input', update);
form.addEventListener('change', update);
form.addEventListener('submit', (e) => e.preventDefault());

form.addEventListener('click', (e) => {
  const stepBtn = e.target.closest('[data-step]');
  if (stepBtn) {
    const [name, delta] = stepBtn.dataset.step.split(':');
    const input = form.elements[name];
    const min = num(input.min, -Infinity), max = num(input.max, Infinity);
    input.value = clamp(num(input.value, 0) + num(delta, 0), min, max);
    update();
  }
  const presetBtn = e.target.closest('[data-preset]');
  if (presetBtn) {
    writeState(PRESETS[presetBtn.dataset.preset]);
    update();
  }
});

// Quand on change de méthode, on applique les valeurs par défaut du préferment.
for (const radio of form.elements.method) {
  radio.addEventListener('change', () => {
    const cfg = PREFERMENTS[radio.value];
    if (cfg) writeState({ flourShare: cfg.flourShare, prefermentHours: cfg.hours });
    update();
  });
}

// Le pointage au réfrigérateur dure généralement 24 h ou plus.
form.elements.fridge.addEventListener('change', (e) => {
  const bulk = form.elements.bulkHours;
  if (e.target.checked && num(bulk.value, 0) < 12) bulk.value = 24;
  if (!e.target.checked && num(bulk.value, 0) > 12) bulk.value = 2;
  update();
});

$('downloadIcs').addEventListener('click', () => {
  if (!current.steps.length) return;
  const blob = new Blob([toICS(current.steps)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'pizza.ics';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('startCook').addEventListener('click', () => {
  const { s, dough, split, steps } = current;
  const r = roundDough(dough);
  const yn = yeastName(s.yeastType);
  const list = (x, withSalt = true) => [
    ['Farine', `${g(x.flour)} g`], ['Eau', `${g(x.water)} g`],
    ...(withSalt ? [['Sel', `${g(x.salt)} g`]] : []), [yn, `${g(x.yeast, 2)} g`],
  ];
  const ingredients = {
    preferment: split ? list(split.preferment, false) : [],
    mix: split ? [[`Tout le ${PREFERMENTS[split.type].label.toLowerCase()}`, `${g(split.preferment.flour + split.preferment.water + split.preferment.yeast)} g`], ...list(split.final)] : list(r),
    ball: [[`${s.count} pâton${s.count > 1 ? 's' : ''}`, `${nf1.format(s.ballWeight)} g`]],
  };
  openCook(steps.map((st) => ({ ...st, ingredients: ingredients[st.id] || [] })));
});

// ---------- Initialisation ----------

const saved = load();
if (saved) writeState(saved);
{
  const s = readState();
  const meal = s.mealTime ? new Date(s.mealTime) : null;
  if (!meal || isNaN(meal) || meal < Date.now()) {
    const need = (s.method !== 'direct' ? s.prefermentHours : 0) + s.bulkHours + s.proofHours + 1;
    form.elements.mealTime.value = toLocalInput(defaultMealTime(need));
  }
}
update();
// Met à jour régulièrement le planning (étapes passées).
setInterval(() => renderTimeline(current), 60e3);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
