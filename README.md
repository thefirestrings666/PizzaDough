# 🍕 Pâte à pizza

Calculateur de pâte à pizza : tu indiques combien de pizzas tu veux et de quelle taille, et le site calcule le reste.

Il reprend le [calculateur de French Guy Cooking](https://www.frenchguycooking.com/pizzadough), avec les **mêmes formules** pour la pâte directe, et ajoute :

- **Poolish et biga** : quantités du préferment et de la pâte finale, avec des totaux identiques.
- **Sel et levure réglables** : levure fraîche, sèche active ou instantanée. La quantité peut être classique (0,2 %), personnalisée ou estimée selon la durée et la température de fermentation.
- **Planning** : à partir de l'heure du repas, le site calcule l'heure de chaque étape. Les étapes peuvent être exportées vers ton agenda (`.ics`).
- **Mode cuisine** : une étape à la fois en plein écran, avec les quantités, un minuteur et une alarme. L'écran reste allumé.
- **Préréglages** : Napolitaine FGC (57 %), Napolitaine 65 % au réfrigérateur, Romaine.
- **Hors ligne** : le site s'installe sur le téléphone (PWA) et fonctionne sans connexion. Les derniers réglages sont gardés.

## Les formules d'origine

Avec `N` pizzas, des pâtons de `P` grammes et une hydratation `H` % :

```
farine = N × P / (1 + H/100 + 0,03 + 0,002)
eau    = farine × H/100
sel    = farine × 3 %
levure = farine × 0,2 %   (levure fraîche)
```

Exemple : 1 pizza de 250 g à 57 % → 156,1 g de farine, 89 g d'eau, 4,7 g de sel et 0,3 g de levure fraîche.

## Utiliser le site

Aucune installation n'est nécessaire : ce sont de simples fichiers HTML, CSS et JS.

```bash
npm start      # sert le site sur http://localhost:8000
npm test       # tests (Node 18 ou plus)
```

### Mise en ligne sur GitHub Pages

Le workflow `.github/workflows/pages.yml` lance les tests puis publie le site à chaque push sur `main`.
Il faut l'activer une fois : **Settings → Pages → Source : GitHub Actions**.

## Organisation

| Fichier | Rôle |
| --- | --- |
| `js/calc.js` | Calculs : pâte directe, préferments, estimation de la levure |
| `js/schedule.js` | Planning et export `.ics` |
| `js/cook.js` | Mode cuisine (minuteur, écran allumé) |
| `js/app.js` | Formulaire, affichage, sauvegarde des réglages |
| `sw.js` | Cache hors ligne. **Change `VERSION` à chaque mise à jour.** |
| `tests/` | Tests `node:test`, dont la parité avec le site d'origine |
