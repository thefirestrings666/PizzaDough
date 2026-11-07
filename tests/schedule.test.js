import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, totalHours, toICS } from '../js/schedule.js';

const meal = new Date('2026-11-08T19:30:00Z');

test('pâte directe : étapes dans l’ordre, finit à l’heure du repas', () => {
  const s = buildSchedule({ mealTime: meal, bulkHours: 2, proofHours: 4 });
  const ids = s.filter((x) => !x.parallel).map((x) => x.id);
  assert.deepEqual(ids, ['mix', 'bulk', 'ball', 'proof', 'bake']);
  const bake = s.find((x) => x.id === 'bake');
  assert.equal(bake.start.getTime() + 15 * 60000, meal.getTime());
  // 20 min + 2 h + 15 min + 4 h + 15 min = 6 h 50
  assert.ok(Math.abs(totalHours(s, meal) - (6 + 50 / 60)) < 1e-9);
});

test('poolish : le préferment commence en premier', () => {
  const s = buildSchedule({ mealTime: meal, method: 'poolish', prefermentHours: 14 });
  assert.equal(s[0].id, 'preferment');
  const mix = s.find((x) => x.id === 'mix');
  assert.equal(mix.start.getTime() - s[0].start.getTime(), 14 * 3600000);
});

test('préchauffage 45 min avant la cuisson', () => {
  const s = buildSchedule({ mealTime: meal });
  const pre = s.find((x) => x.id === 'preheat');
  const bake = s.find((x) => x.id === 'bake');
  assert.equal(bake.start - pre.start, 45 * 60000);
});

test('export ICS', () => {
  const ics = toICS(buildSchedule({ mealTime: meal }), new Date('2026-11-01T00:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR/);
  assert.equal(ics.match(/BEGIN:VEVENT/g).length, 6);
  assert.match(ics, /DTSTART:20261108T191500Z/);
});
