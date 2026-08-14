# Démo « Nouveautés depuis la certification » — Eclor Waterfall 1.2.0.0 → 1.3.1.0

Rapport PBIP de démonstration de **toutes** les fonctionnalités ajoutées depuis
la version certifiée 1.1.76.0, construit sur **le modèle et le thème du pbix
réellement soumis à Microsoft**.

> **Le dossier s'appelle `demo-1.3.0` mais embarque la 1.3.1.0.** Le nom est
> conservé pour ne pas casser les liens ; c'est la version du tableau ci-dessous
> qui fait foi. La 1.3.1.0 est née de ce rapport : les deux changements qu'elle
> apporte ont été trouvés en regardant ces pages dans Power BI Desktop.

| | |
|---|---|
| Visuel | **1.3.1.0**, `releases/eclorWaterfallECLOR2026.1.3.1.0.pbiviz` republié sous le GUID privé `eclorWaterfallPREVIEW130` et embarqué dans `demo-1-3-0.Report/CustomVisuals/` |
| Modèle | **Copie verbatim de [`sample/demo-report`](../demo-report)** — `FACT_ECLOR_FINANCIALS` ⟵ `DIM_TIME` + `_MEASURES`, import de [`sample/base/Financial Sample.xlsx`](../base/) via le paramètre `DataFolder` |
| Thème | « eclor — Light » ([`sample/base/eclor-light.theme.json`](../base/eclor-light.theme.json)) + `logo.svg` |
| Canevas | 1920 × 1080, `FitToPage`, segment `YearMonth` synchronisé calé sur **2026-12** |

## Avant d'ouvrir — trois points non négociables

1. **Copier le dossier sous une racine COURTE** (`C:\wf-test\` ou équivalent).
   L'arborescence PBIP mange ~95 caractères et Desktop applique MAX_PATH
   strictement (`PBIProjectUtils.EnsureNotLong` refuse la lecture et Desktop
   meurt à l'ouverture). Le chemin le plus profond ici fait 131 caractères
   depuis la racine du dépôt.
2. **Une actualisation est nécessaire au premier ouverture.** Contrairement à
   [`sample/demo-1.2.0`](../demo-1.2.0) (tables DAX autonomes, `cache.abf`
   versionné), ce rapport tourne sur le VRAI modèle publié — un import Excel.
   Le paramètre `DataFolder` pointe sur `sample/base` en absolu ; si le dépôt
   n'est pas en `C:\Users\proni\Dev\eclor-waterfall`, corriger le paramètre
   dans Power Query.
3. **Ne pas re-pointer le visuel sur le GUID publié.** Desktop substitue
   systématiquement la copie AppSource à tout `visualType` qu'il reconnaît dans
   la marketplace : sous `eclorWaterfallECLOR2026`, c'est la **1.1.76.0** qui se
   charge, toutes les propriétés démontrées ici sont silencieusement ignorées,
   et la sauvegarde suivante **supprime le dossier `CustomVisuals/`**. Le GUID
   privé est ce qui fige ce rapport sur le build 1.3.0.0.

## Les pages

| Page | Version | Ce qu'elle prouve | Propriétés exercées |
|---|---|---|---|
| **0 · Accueil** | — | Sommaire, modèle, mode d'emploi | — |
| **1 · Orientation** | 1.2.0.0 | Deux waterfalls identiques, seule l'orientation diffère : catégories top→bottom, axe des valeurs en haut, table Analysis en colonnes à gauche, rail de variance en colonne à droite | `general.orientation` |
| **2 · Rails — position** | 1.2.0.0 | `Top` (historique) vs `Bottom`, avec un override de style **par mesure** qui passe le seul rail `Δ M-1 %` en Pin | `rails.position`, `varianceMeasure.style` |
| **3 · Rails — styles** | 1.2.0.0 | Les 7 styles (pin, labels, chips, outlined, hatched, auto-by-format, bars) + le seuil de neutralité comparé 0 % vs 40 % | `rails.railStyle`, `rails.neutralThresholdPct` |
| **4 · Piliers — remplissage & contour** | 1.2.0.0 | Global `Solid` + override par catégorie (solid / outlined / hatched, notation scénario IBCS) ; global `Hatched` + groupe Outline (encre, 2,5 px, dashed) | `pillars.pillarFillStyle`, `pillars.fillStyle` (par catégorie), `outlineShow/Color/Width/Style` |
| **5 · Overrides par pilier-mesure** | **1.3.0.0** | Le trou fonctionnel comblé : en comparaison + dimension + M ≥ 2, les piliers SONT les mesures. Référence / overrides complets / cas sans dimension mais avec légende (détection élargie) | `pillars.fillStyle` + `outlineMode`, `outlineColorOverride`, `outlineWidthOverride`, `outlineStyleOverride` (sélecteur `metadata`) |
| **6 · Masquer un segment** | **1.3.0.0** + **1.3.1.0** | Décomposition complète vs premier segment masqué : l'arc et le connecteur pointillé du pilier restent, les colonnes de bridge de la table Analysis disparaissent. **Depuis la 1.3.1.0 le connecteur ENTRE les deux piliers devenus adjacents n'est plus tracé** — il affirmait un report de cumul que plus aucun pont n'explique | `pillars.showBridgesBefore` |
| **7 · Largeur de la table Analysis** | **1.3.0.0** + **1.3.1.0** | Auto vs explicite dans les deux orientations, sur une dimension à libellés longs (`Segment`). Les deux graphes verticaux opposent le symptôme (Auto, 1 ligne, tronqué) au remède 1.3.1.0 : **100 px + 2 lignes**, soit un libellé entier dans une bande plus étroite que les 150 px qu'il fallait sur une ligne | `analysisTable.rowHeaderWidth`, `analysisTable.columnWidth`, `analysisTable.headerLines` |

Les **19 propriétés** ajoutées à `capabilities.json` depuis `a0ad7a6` (la
soumission certifiée) sont toutes exercées par au moins un visuel — vérifié
mécaniquement contre `capabilities.json` (objets, propriétés, valeurs d'énum).

## Le modèle — repris tel quel, un seul ajout

Le dossier `demo-1-3-0.SemanticModel` est une **copie de celui de
[`sample/demo-report`](../demo-report)**, lui-même reconstruit sur
[`sample/base`](../base/MODEL.md) : Financial Sample dépivoté en
`Category` / `Amount` (coûts négatifs, tri par `Order_Category`), calendrier
`DIM_TIME`, mesures `Actual`, `Actual M-1`, `Δ M-1`, `Δ M-1 %`,
`Ratio to Gross Sales` et les mesures couleur `_Color_Category` /
`_Color_Country`.

**Un seul ajout, documenté dans le TMDL :**

```dax
Actual M-2 = CALCULATE([Actual], DATEADD('DIM_TIME'[Date], -2, MONTH))
```

Pourquoi : `showBridgesBefore` n'est défini que dans la **comparaison
synthétique** (comparaison + dimension + M ≥ 2 mesures) — c'est le seul mode où
« le segment entre deux piliers » a un sens. Avec deux mesures il n'existe qu'un
seul segment, et le masquer laisse deux piliers nus ; il faut un **troisième
niveau** pour montrer un segment masqué à côté d'un segment conservé. Même
idiome DAX, même table, même source, aucun jeu de données inventé.

Le contexte temporel vient du segment `YearMonth` calé sur **2026-12** (le mois
du pbix publié) : `M-1` = 2026-11 et `M-2` = 2026-10 sont tous deux peuplés
(les années source 2013 / 2014 sont remappées en 2026 / 2025).

## Ce que ce rapport ne prouve PAS

- ~~Le rendu réel~~ — **fait le 2026-08-14** : les 8 pages ont été ouvertes et
  capturées dans Power BI Desktop sur le vrai modèle actualisé (voir
  [`screenshots/`](screenshots/)). C'est ce passage qui a produit les deux
  changements de la 1.3.1.0. En revanche le RESTE du smoke test de certification
  — persistance du volet Format au save/reload, cross-filter, lecteur d'écran,
  thèmes contrastés Windows, aller-retour entre pages — n'est **pas** couvert
  par ces captures.
- **Les styles de rails et de remplissage en VERTICAL.** Limite 1.2.0.0
  assumée : en vertical, les rails retombent sur des barres pleines et les
  piliers sur `solid`. Les réglages restent persistés et réapparaissent en
  horizontal. C'est pour ça que les pages 3 et 4 sont en horizontal.
- **Le défaut `defaultPillarColor` épinglé.** Les pages en comparaison
  (5 et 6) utilisent des couleurs par mesure explicites, donc aucune règle fx
  n'y interfère. Les pages cumulatives colorent les piliers par la mesure
  `_Color_Category` (le motif du pbix publié) et n'ont pas d'ancre synthétique.

## Régénérer le binaire embarqué

```bash
node tools/repack-preview-visual.mjs releases/eclorWaterfallECLOR2026.1.3.1.0.pbiviz --guid eclorWaterfallPREVIEW130 --display-name "Eclor Waterfall 1.3.1 (preview)" --report "sample/demo-1.3.0/demo-1-3-0.Report"
```

Les pages elles-mêmes se régénèrent avec
[`tools/gen-demo-130.mjs`](../../tools/gen-demo-130.mjs) (le JSON PBIR émis est
l'artefact committé ; le script est l'échafaudage).

Le code, les capabilities, les ressources de chaînes et les assets sont
identiques au `.pbiviz` de `releases/` ; seuls le `guid` (dans `package.json`,
le json de ressources et les 4 occurrences dans `content.js`) et le
`displayName` changent.
