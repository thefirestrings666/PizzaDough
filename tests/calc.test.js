import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directDough, roundDough, estimateYeastPct, estimateYeastPctPhases, withPreferment, round } from '../js/calc.js';

// Implémentation de référence de la formule, écrite indépendamment de calc.js.
function reference(B7, B8, B9) {
  const flour = round((B7 * B8) / (1 + B9 / 100 + 0.03 + 0.002), 1);
  return {
    flour,
    water: round((flour * B9) / 100, 1),
    salt: round(0.03 * flour, 1),
    yeast: round(0.002 * flour, 1),
  };
}

test('quantités de référence (valeurs par défaut)', () => {
  const r = roundDough(directDough({ count: 1, ballWeight: 250, hydration: 57 }));
  assert.equal(r.flour, 156.1);
  assert.equal(r.water, 89);
  assert.equal(r.salt, 4.7);
  assert.equal(round(r.yeast, 1), 0.3);
});

test('formule de référence sur une grille de valeurs', () => {
  for (const n of [1, 2, 4, 7, 12]) {
    for (const w of [180, 200, 250, 280, 300]) {
      for (const h of [50, 55, 57, 60, 65, 70]) {
        const r = roundDough(directDough({ count: n, ballWeight: w, hydration: h }));
        const o = reference(n, w, h);
        assert.equal(r.flour, o.flour, `farine ${n}×${w}@${h}`);
        assert.equal(r.water, o.water, `eau ${n}×${w}@${h}`);
        assert.equal(r.salt, o.salt, `sel ${n}×${w}@${h}`);
        // Levure affichée au centième (la référence arrondit au dixième).
        assert.ok(Math.abs(r.yeast - o.yeast) <= 0.0501, `levure ${n}×${w}@${h}`);
      }
    }
  }
});

test('le poids total correspond à la demande', () => {
  const d = directDough({ count: 4, ballWeight: 280, hydration: 65, saltPct: 2.8, yeastPct: 0.15 });
  const sum = d.flour + d.water + d.salt + (d.flour * 0.15) / 100;
  assert.ok(Math.abs(sum - 1120) < 1e-9);
});

test('conversion du type de levure', () => {
  const fresh = directDough({ count: 2, ballWeight: 250, hydration: 60 });
  const dry = directDough({ count: 2, ballWeight: 250, hydration: 60, yeastType: 'dry' });
  const inst = directDough({ count: 2, ballWeight: 250, hydration: 60, yeastType: 'instant' });
  assert.equal(dry.flour, fresh.flour);
  assert.ok(Math.abs(dry.yeast - fresh.yeast * 0.4) < 1e-12);
  assert.ok(Math.abs(inst.yeast - fresh.yeast * 0.33) < 1e-12);
});

test('estimation de la levure : calibrage et tendances', () => {
  assert.ok(Math.abs(estimateYeastPct(8, 23) - 0.2) < 1e-12);
  assert.ok(estimateYeastPct(24, 23) < estimateYeastPct(8, 23));
  assert.ok(estimateYeastPct(8, 18) > estimateYeastPct(8, 23));
  assert.equal(estimateYeastPct(1, 4), 2); // borne haute
  assert.equal(estimateYeastPct(200, 30), 0.02); // borne basse
});

for (const type of ['poolish', 'biga']) {
  test(`${type} : les totaux sont conservés`, () => {
    const d = directDough({ count: 4, ballWeight: 250, hydration: 65 });
    const p = withPreferment(d, { type });
    assert.ok(Math.abs(p.preferment.flour + p.final.flour - d.flour) < 1e-9);
    assert.ok(Math.abs(p.preferment.water + p.final.water - d.water) < 1e-9);
    assert.equal(p.final.salt, d.salt);
    assert.ok(p.final.water >= 0 && p.final.flour > 0 && p.final.yeast >= 0);
  });
}

test('poolish : la part de farine est limitée par l’eau disponible', () => {
  const d = directDough({ count: 1, ballWeight: 250, hydration: 57 });
  const p = withPreferment(d, { type: 'poolish', flourShare: 80 });
  assert.equal(p.clamped, true);
  assert.ok(Math.abs(p.flourShare - 57) < 1e-9);
  assert.ok(Math.abs(p.final.water) < 1e-9);
});

test('estimation multi-phases : le réfrigérateur ralentit la fermentation', () => {
  const room = estimateYeastPctPhases([{ hours: 24, tempC: 22 }]);
  const fridge = estimateYeastPctPhases([{ hours: 24, tempC: 4 }]);
  assert.ok(fridge > room);
  assert.ok(Math.abs(estimateYeastPctPhases([{ hours: 4, tempC: 23 }, { hours: 4, tempC: 23 }]) - 0.2) < 1e-12);
});
