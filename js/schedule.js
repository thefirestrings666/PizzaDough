// Planning : on part de l'heure du repas et on remonte le temps pour
// placer chaque étape. Fonctions pures, sans accès au DOM.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * @param {object} o
 * @param {Date} o.mealTime      heure à laquelle on veut manger
 * @param {'direct'|'poolish'|'biga'} [o.method='direct']
 * @param {number} [o.prefermentHours=14]
 * @param {number} [o.bulkHours=2]   pointage (pâte en masse)
 * @param {number} [o.proofHours=4]  apprêt (pâtons)
 * @param {boolean} [o.fridge=false] pointage au réfrigérateur
 * @returns {{id:string,title:string,detail:string,start:Date,durationMin:number,parallel?:boolean}[]}
 *   Étapes triées par heure de début.
 */
export function buildSchedule({ mealTime, method = 'direct', prefermentHours = 14, bulkHours = 2, proofHours = 4, fridge = false }) {
  const meal = new Date(mealTime).getTime();
  const steps = [];
  // On construit les étapes de la fin vers le début. `cursor` est la fin
  // de l'étape en cours de placement.
  let cursor = meal;
  const add = (id, title, detail, durationMin) => {
    cursor -= durationMin * MIN;
    steps.push({ id, title, detail, start: new Date(cursor), durationMin });
  };

  add('bake', 'Façonnage et cuisson', 'Étalez les pâtons à la main, garnissez et enfournez le plus chaud possible.', 15);
  add('proof', 'Apprêt des pâtons', 'Laissez lever les pâtons couverts, à température ambiante.', proofHours * 60);
  add('ball', 'Mise en boules', 'Divisez la pâte et formez des boules bien serrées.', 15);
  if (fridge) {
    add('bulk', 'Pointage au réfrigérateur', 'Pâte en masse, couverte, au réfrigérateur.', bulkHours * 60);
  } else {
    add('bulk', 'Pointage', 'Pâte en masse, couverte, à température ambiante.', bulkHours * 60);
  }
  add('mix', method === 'direct' ? 'Pétrissage' : 'Pétrissage de la pâte finale',
    method === 'direct'
      ? "Dissolvez la levure dans l'eau, ajoutez la farine puis le sel, et pétrissez jusqu'à obtenir une pâte lisse."
      : "Mélangez le préferment avec l'eau restante, ajoutez la farine, la levure éventuelle puis le sel, et pétrissez.",
    20);
  if (method !== 'direct') {
    const name = method === 'poolish' ? 'le poolish' : 'la biga';
    add('preferment', `Préparer ${name}`,
      method === 'poolish'
        ? "Mélangez la farine, l'eau et la levure du poolish. Couvrez et laissez à température ambiante."
        : "Mélangez grossièrement la farine, l'eau et la levure de la biga, sans pétrir. Couvrez, au frais (16–18 °C).",
      prefermentHours * 60);
  }

  steps.reverse();

  // Le préchauffage se fait pendant l'apprêt : le four doit être chaud au moment de cuire.
  const bake = steps.find((s) => s.id === 'bake');
  steps.push({
    id: 'preheat', title: 'Préchauffer le four', detail: 'Four au maximum, avec la pierre ou la plaque à l’intérieur.',
    start: new Date(bake.start.getTime() - 45 * MIN), durationMin: 45, parallel: true,
  });
  return steps.sort((a, b) => a.start - b.start);
}

/** Durée totale entre la première étape et le repas, en heures. */
export function totalHours(steps, mealTime) {
  const first = Math.min(...steps.map((s) => s.start.getTime()));
  return (new Date(mealTime).getTime() - first) / HOUR;
}

function icsDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => '\\' + m);
}

/** Fichier iCalendar (.ics) : un événement par étape, avec un rappel au début. */
export function toICS(steps, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//PizzaDough//FR', 'CALSCALE:GREGORIAN'];
  steps.forEach((s, i) => {
    const end = new Date(s.start.getTime() + s.durationMin * MIN);
    lines.push(
      'BEGIN:VEVENT',
      `UID:pizzadough-${s.start.getTime()}-${i}@pizzadough`,
      `DTSTAMP:${icsDate(now)}`,
      `DTSTART:${icsDate(s.start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:🍕 ${icsEscape(s.title)}`,
      `DESCRIPTION:${icsEscape(s.detail)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(s.title)}`, 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}
