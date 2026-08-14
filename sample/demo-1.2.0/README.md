# Démo « Nouveautés 1.2.0.0 » — Eclor Waterfall

Rapport PBIP de démonstration des trois nouveautés de la 1.2.0.0. **Double-cliquer
sur [`demo-1-2-0.pbip`](demo-1-2-0.pbip)** — rien d'autre à faire : pas de refresh,
pas de fichier externe, pas d'import de visuel.

| | |
|---|---|
| Visuel | 1.2.0.0, embarqué dans `demo-1-2-0.Report/CustomVisuals/` |
| Modèle | 3 tables DAX calculées (`DATATABLE`), aucune source externe |
| Thème | « eclor — Light » (`sample/base/eclor-light.theme.json`) |
| Canevas | 1920 × 1080, `FitToPage` |

## Les pages

### 0 · Accueil
Sommaire + navigateur de pages + description du jeu de données.

### 1 · Orientation verticale
Deux waterfalls côte à côte, **mêmes données et mêmes réglages** : seule
l'orientation diffère. Table Analysis (`Segment`) et rail de variance (`Δ vs LY`)
actifs des deux côtés — en vertical, l'axe des valeurs passe en haut, les
catégories descendent de haut en bas, la table devient un bloc de colonnes à
gauche et le rail une colonne à droite.

> **Volet Format → General → Orientation** (`Horizontal` / `Vertical`)

*Limite 1.2.0.0 assumée* : en vertical, les styles de rails et les styles de
remplissage des piliers retombent silencieusement sur « barres pleines » /
« solide ». Les réglages restent persistés et réapparaissent en horizontal.

### 2 · Variance : position & styles
Quatre waterfalls, mêmes données, la même mesure `Δ vs LY` dans le rôle **Variance** :

| Graphe | Ce qu'il montre |
|---|---|
| Haut gauche | `position = Bottom` + style global `Bars`, avec un **override par mesure** qui passe le seul rail `Δ% vs LY` en `Pin` |
| Haut droit | `railStyle = Pin` (IBCS : tige + tête ronde) |
| Bas gauche | `railStyle = Labels only` (▲/▼ + valeur signée, aucune géométrie) |
| Bas droit | `railStyle = Chips` + `neutralThresholdPct = 8` → le pas « Mix » (5 % du plus gros écart) passe en gris neutre |

> **Volet Format → Variance → Layout → Position / Style / Neutral threshold (% of max)**
> Override par mesure : **Format → Variance — per measure → `<mesure>` → Style**

Un rail n'existe que si une mesure est posée dans le rôle **Variance**.

### 3 · Piliers : styles de remplissage & contour
- **Gauche** — scénarios IBCS `AC` / `BU` / `FC`, trois piliers, un override de
  remplissage chacun : `solid`, `outlined`, `hatched` (le global reste `Solid`).
- **Droite** — le pont FY24 → FY25 avec le contour activé sur tous les piliers
  (ink, 2,5 px, `dashed`).

> Global : **Volet Format → Pillars → Colors → Fill style**
> Contour : **Volet Format → Pillars → Outline** (interrupteur du groupe) → *Outline color* / *Outline width (px)* / *Outline style*
> Override par pilier : **Volet Format → Pillars → `<catégorie>` → Fill style**

## Le jeu de données

`FACT_DEMO` — pont FY24 → FY25, ventilé sur 3 segments (Retail / Wholesale / Digital) :

| Étape | Montant | Δ vs LY |
|---|---:|---:|
| FY24 | 100 000 | +6 000 |
| Volume | +12 000 | +1 800 |
| Price | +8 000 | −2 400 |
| Mix | −5 000 | +300 |
| Churn | −7 000 | −1 200 |
| FY25 | 108 000 | +4 500 |

`|Δ| Mix` vaut 5 % du plus gros écart (6 000) : c'est lui qui bascule en gris dès
que le seuil de neutralité dépasse 5 % (la page 2 utilise 8 %).

`_MEASURES` — `Actual`, `Actual LY`, `Δ vs LY`, `Δ% vs LY` (ratio, donc juste à
n'importe quelle granularité), `Scenario value`.
`SCENARIO` — `AC` 108 000, `BU` 112 000, `FC` 110 000.

## Pourquoi le visuel embarqué porte le GUID `eclorWaterfallPREVIEW120`

Power BI Desktop **substitue systématiquement la version AppSource** à tout
`visualType` qu'il reconnaît dans la marketplace : avec le GUID publié
`eclorWaterfallECLOR2026`, Desktop chargeait la 1.1.76.0 au lieu de la copie
1.2.0.0 posée dans `CustomVisuals/`, ignorait silencieusement `general.orientation`,
`rails.position`, `rails.railStyle`, `pillars.fillStyle`… et, à la sauvegarde,
supprimait le dossier `CustomVisuals/` en ajoutant `publicCustomVisuals` dans
`report.json`. (C'est exactement ce qui est arrivé à `sample/demo-report/`.)

Le binaire embarqué ici est **la 1.2.0.0 de `releases/`, inchangée**, republiée
sous un GUID privé (`guid` + les 4 occurrences dans le bundle) pour échapper à
cette substitution. Code, capabilities, ressources de chaînes et assets sont
identiques ; seul l'identifiant change, plus le `displayName`
(« Eclor Waterfall 1.2.0 (preview) ») pour le distinguer dans le volet
Visualisations. Le jour où la 1.2.0.0 sera publiée sur AppSource, ce rapport
continuera d'afficher exactement ce build.

## Captures

[`screenshots/`](screenshots/) — une image par page, prises dans Power BI Desktop.
