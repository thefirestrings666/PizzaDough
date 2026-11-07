// Calculs de pâte à pizza — fonctions pures, sans accès au DOM.
//
// La pâte directe reprend exactement la formule du calculateur de
// French Guy Cooking (https://www.frenchguycooking.com/pizzadough) :
//   farine = N × poids / (1 + hydratation + 3 % sel + 0,2 % levure)
// Toutes les autres quantités sont des pourcentages de la farine
// (« pourcentages du boulanger »).

/** Arrondi à `precision` décimales, comme la fonction round() du site d'origine. */
export function round(number, precision = 1) {
  const factor = 10 ** precision;
  return Math.round(number * factor) / factor;
}

/**
 * Facteur à appliquer à une quantité de levure fraîche pour obtenir
 * l'équivalent dans un autre type de levure.
 */
export const YEAST_TYPES = {
  fresh: { label: 'Levure fraîche', factor: 1 },
  dry: { label: 'Levure sèche active', factor: 0.4 },
  instant: { label: 'Levure sèche instantanée', factor: 0.33 },
};

/**
 * Pâte directe.
 * @param {object} p
 * @param {number} p.count       nombre de pâtons
 * @param {number} p.ballWeight  poids d'un pâton (g)
 * @param {number} p.hydration   hydratation (% de la farine)
 * @param {number} [p.saltPct=3]   sel (% de la farine)
 * @param {number} [p.yeastPct=0.2] levure fraîche (% de la farine)
 * @param {keyof YEAST_TYPES} [p.yeastType='fresh']
 * Les quantités renvoyées ne sont pas arrondies (voir roundDough).
 */
export function directDough({ count, ballWeight, hydration, saltPct = 3, yeastPct = 0.2, yeastType = 'fresh' }) {
  const total = count * ballWeight;
  // Le calcul de la farine utilise toujours le pourcentage de levure fraîche,
  // pour que le poids total reste celui demandé quelle que soit la levure.
  const flour = total / (1 + hydration / 100 + saltPct / 100 + yeastPct / 100);
  const freshYeast = (flour * yeastPct) / 100;
  return {
    total,
    flour,
    water: (flour * hydration) / 100,
    salt: (flour * saltPct) / 100,
    yeast: freshYeast * (YEAST_TYPES[yeastType]?.factor ?? 1),
    yeastType,
    pct: { hydration, salt: saltPct, yeast: yeastPct * (YEAST_TYPES[yeastType]?.factor ?? 1) },
  };
}

/**
 * Arrondit les quantités comme le site d'origine : la farine à 0,1 g près,
 * puis l'eau, le sel et la levure recalculés à partir de cette farine
 * arrondie. La levure est arrondie au centième, car les quantités sont petites.
 */
export function roundDough(d) {
  if (!(d.flour > 0)) return { ...d, flour: 0, water: 0, salt: 0, yeast: 0 };
  const flour = round(d.flour, 1);
  const { hydration, salt, yeast } = d.pct;
  return {
    ...d,
    flour,
    water: round((flour * hydration) / 100, 1),
    salt: round((flour * salt) / 100, 1),
    yeast: round((flour * yeast) / 100, 2),
  };
}

/**
 * Estimation du pourcentage de levure fraîche selon la durée totale de
 * fermentation et la température. Modèle simple : la quantité est
 * inversement proportionnelle à la durée, et elle double à chaque baisse
 * de 10 °C (Q10 ≈ 2). Le modèle est calibré sur la valeur classique :
 * 0,2 % pour 8 h à 23 °C. Le résultat est borné entre 0,02 % et 2 %.
 * C'est une estimation : le comportement réel dépend de la farine, de la levure, etc.
 */
export function estimateYeastPct(hours, tempC) {
  return estimateYeastPctPhases([{ hours, tempC }]);
}

/**
 * Même modèle que estimateYeastPct, mais pour plusieurs phases, par exemple
 * 24 h au réfrigérateur puis 4 h à température ambiante. Chaque phase compte
 * pour l'équivalent de `heures × 2^((T − 23)/10)` heures à 23 °C.
 * @param {{hours:number,tempC:number}[]} phases
 */
export function estimateYeastPctPhases(phases) {
  const equivHours = phases.reduce((sum, p) => sum + Math.max(0, p.hours || 0) * 2 ** ((p.tempC - 23) / 10), 0);
  if (!(equivHours > 0)) return 0.2;
  return Math.min(2, Math.max(0.02, (0.2 * 8) / equivHours));
}

/** Paramètres par défaut des préferments. */
export const PREFERMENTS = {
  poolish: { label: 'Poolish', hydration: 100, yeastPct: 0.1, flourShare: 30, hours: 14, temp: 'ambiante (18–22 °C)' },
  biga: { label: 'Biga', hydration: 45, yeastPct: 1, flourShare: 50, hours: 18, temp: '16–18 °C' },
};

/**
 * Répartit une pâte (résultat de directDough) entre un préferment et la
 * pâte finale. Les totaux de farine, d'eau et de sel restent identiques.
 * La levure du préferment sert d'abord. La pâte finale ne reçoit que le
 * complément éventuel, et souvent aucun.
 * @param {ReturnType<typeof directDough>} dough
 * @param {object} o
 * @param {'poolish'|'biga'} o.type
 * @param {number} [o.flourShare] part de la farine dans le préferment (%)
 */
export function withPreferment(dough, { type, flourShare }) {
  const cfg = PREFERMENTS[type];
  if (!cfg) throw new Error(`Préferment inconnu : ${type}`);
  let share = (flourShare ?? cfg.flourShare) / 100;
  // Le préferment ne peut pas contenir plus d'eau que la pâte entière.
  const maxShare = dough.water / ((dough.flour * cfg.hydration) / 100);
  const clamped = share > maxShare;
  if (clamped) share = maxShare;

  const factor = YEAST_TYPES[dough.yeastType]?.factor ?? 1;
  const pfFlour = dough.flour * share;
  const pfWater = (pfFlour * cfg.hydration) / 100;
  const pfYeast = ((pfFlour * cfg.yeastPct) / 100) * factor;

  return {
    type,
    flourShare: share * 100,
    clamped,
    preferment: { flour: pfFlour, water: pfWater, yeast: pfYeast },
    final: {
      flour: dough.flour - pfFlour,
      water: dough.water - pfWater,
      salt: dough.salt,
      yeast: Math.max(0, dough.yeast - pfYeast),
    },
  };
}
