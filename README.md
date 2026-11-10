# vuejs.assurance

Application Vue 3 pour construire la **chronologie factuelle d'un sinistre**, numéroter les pièces
justificatives, suivre les points d'arbitrage et générer le courrier à l'assureur.

Stack : Vue 3 (SFC, `<script setup>`) · Pinia · Vite · vuedraggable / SortableJS.
Données locales (localStorage), sauvegarde et rechargement par fichier `.json`.

## Démarrer

```bash
npm install
npm run dev      # serveur de développement
npm run build    # bundle de production dans dist/
npm run preview  # prévisualisation du bundle
```

Le bundle est produit en IIFE : `dist/index.html` fonctionne aussi en double-clic (`file://`),
sans serveur.

## Structure

```
index.html              coquille Vite
vite.config.js          build IIFE + alias @ → src/
wrangler.toml           déploiement Cloudflare Workers (assets statiques)
src/
  main.js               point d'entrée (createApp + Pinia)
  App.vue               mise en page, dialogues, raccourcis, dépôt de fichier
  components/           AppTopBar, SummaryPanel, QuickCapture, QuestionsPanel,
                        TimelinePanel, StepCard, StepTable, BordereauPanel,
                        StepDrawer, BaseDialog, ToastHost, dialogs/*
  stores/
    dossiers.js         dossiers, étapes, questions, historique, persistance
    ui.js               thème, densité, filtres, dialogues, notifications
  composables/          useTimeline, useFiles, useHotkeys, useClickOutside
  lib/                  model, parse (capture rapide), exporters (CSV/courrier),
                        storage (localStorage + reprises), format, presets
  styles/base.css       design system (thèmes clair/sombre, impression A4)
archive/                page HTML monolithique d'origine + prototype Vue via CDN
```

## Glisser-déposer

| Zone | Effet du glisser |
| --- | --- |
| Chronologie (poignée `⠿`) | réordonne les étapes et bascule le dossier en **ordre manuel** |
| Bordereau des pièces | **renumérote** tout le bordereau (PJ-01, PJ-02…) dans le nouvel ordre |
| Questions générales | définit l'ordre de priorité repris dans le courrier généré |
| Fichier `.json` déposé sur la page | import direct dans la base locale |

Le glisser-déposer de la chronologie est désactivé tant qu'un filtre ou une recherche est actif
(l'ordre affiché serait partiel). Chaque déplacement est annulable (`Ctrl+Z`).

## Données

- Base locale : `localStorage`, clé `vuejs_assurance_db_v1`, enregistrement automatique (300 ms).
- Plusieurs dossiers en parallèle (créer / dupliquer / renommer / supprimer).
- Reprise automatique des versions précédentes : clés `chronoassur_db_v2` et
  `chronoassur_dossier_v1`, ainsi que leurs exports `.json`.
- Sauvegarde fichier : dossier courant `.json`, base complète `.json`, chronologie `.csv`.
- Rien ne sort du navigateur : aucune requête réseau en dehors de la police Inter.

## Gains de temps

- **Capture rapide** : une ligne + `Entrée`. Date (`12/09`, `hier`, `14h30`), montant (`285€`),
  catégorie (`tech:`, `admin:`, `relance:`) et pièce (`PJ Nom`) reconnues ; `|` sépare
  fait / acteur / pièce. Un aperçu montre l'interprétation avant validation.
- **Modèles de sinistre** (dégât des eaux, incendie, vol, auto) : chronologie pré-rédigée,
  pièces déjà numérotées.
- **Étapes types** : relance, expertise, proposition d'indemnisation, désaccord…
- **Courrier généré** (synthèse ou relance) : objet, chronologie, total chiffré, points en attente
  de position écrite, bordereau — à copier ou télécharger.
- **Indicateurs** : sommes engagées, faits sans preuve, questions ouvertes, « dernier mouvement
  J+n » en alerte au-delà de 15 jours, écarts de délai entre étapes.
- **Impression A4** propre (`Ctrl+P`) : interface masquée, en-tête officiel, pied récapitulatif.

## Raccourcis

| Touche | Action |
| --- | --- |
| `N` | nouvelle étape détaillée |
| `/` | capture rapide |
| `F` | rechercher |
| `Ctrl+S` | sauvegarder le dossier en `.json` |
| `Ctrl+Z` / `Ctrl+Maj+Z` | annuler / rétablir |
| `Ctrl+↵` | enregistrer l'étape ouverte |
| `Maj+↑` / `Maj+↓` | décaler la date d'un jour (poignée `⠿` sélectionnée) |
| `Ctrl+P` | imprimer / PDF |
| `Échap` | fermer le panneau ouvert |
| `?` | aide et méthode |

## Déploiement Cloudflare

`wrangler.toml` publie `dist/` en assets statiques Workers, **sans URL `*.workers.dev` ni URL de
preview** (`workers_dev = false`, `preview_urls = false`) : le site n'est joignable que par la route
de domaine personnalisé que vous décommentez dans le fichier.

```bash
npx wrangler login      # une seule fois
npm run deploy          # build + wrangler deploy
```
