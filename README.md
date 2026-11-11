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

Le bandeau d'indicateurs de la section 1 est masqué par défaut (bouton « Indicateurs » dans
l'en-tête de section, choix mémorisé). Une question se supprime par `🗑`, depuis la section 5 ou
depuis la carte de l'étape : seule la question part, l'étape reste.

Une pièce jointe n'est pas une entité autonome : elle appartient à une étape de la chronologie
(champs code + nom). Dans le bordereau, `✕` détache la pièce de son étape — l'étape, elle, reste —,
`✎` ouvre l'étape, et « Renuméroter par date » comble les trous de numérotation laissés.

Le glisser-déposer de la chronologie est désactivé tant qu'un filtre ou une recherche est actif
(l'ordre affiché serait partiel). Chaque déplacement est annulable (`Ctrl+Z`).

## Données : rien n'est jamais perdu

- Base locale : `localStorage`, clé `vuejs_assurance_db_v1`, enregistrement automatique 300 ms après
  chaque modification, **vidé immédiatement** à la fermeture, au changement d'onglet, à la mise en
  veille mobile (`beforeunload`, `pagehide`, `blur`, `visibilitychange`). `navigator.storage.persist()`
  est demandé pour éviter l'éviction par le navigateur.
- **Deux onglets** : chaque écriture porte un numéro de révision. Une écriture concurrente est
  détectée et **fusionnée** (dossier par dossier, puis étape par étape : l'union l'emporte sur la
  suppression) au lieu d'écraser ; l'autre onglet se recharge et le signale.
- **Corbeille** : supprimer un dossier le met à la corbeille (menu 📁), restaurable sans limite de
  temps. L'effacement définitif prend une sauvegarde forcée juste avant.
- **Catégories** : la suppression est douce — les étapes gardent leur classement (marqué `⌀`) et la
  catégorie se restaure d'un clic dans ⚙ Catégories.
- **Import dans le dossier courant** : la version remplacée part à la corbeille (« … (avant import) »).
- **Sauvegardes automatiques** (Fichier ▸ Sauvegardes automatiques) : anneau de 8 copies de la base,
  prises avant les modifications (au plus une toutes les deux minutes, toujours avant une action
  destructive). Restaurer **ajoute** les dossiers en copies datées, rien n'est écrasé.
- **Stockage illisible** (corruption, format d'une version future) : jamais écrasé, mis de côté sous
  une clé horodatée et téléchargeable depuis le même dialogue.
- **Quota saturé** : bandeau persistant avec téléchargement immédiat de toute la base.
- Les exports `.json` embarquent dossiers, corbeille, catalogue d'intervenants et catégories ; un
  dossier réimporté ailleurs garde donc ses catégories. Les anciennes clés `chronoassur_*` sont lues
  mais jamais effacées.
- Rien ne sort du navigateur : aucune requête réseau en dehors de la police Inter.
- Correction orthographique du navigateur désactivée sur toute l'application.

## Gains de temps

- **Capture rapide** : une ligne + `Entrée`. Date (`12/09`, `hier`, `14h30`), montant (`285€`),
  catégorie (`tech:`, `admin:`, `relance:`) et pièce (`PJ Nom`) reconnues ; `|` sépare
  fait / acteur / pièce. Un aperçu montre l'interprétation avant validation.
- **Catégories extensibles** : les cinq natives (sinistre, technique, administratif, blocage,
  échéance) peuvent être complétées par vos propres catégories — libellé, nom court, icône, couleur —
  partagées par tous les dossiers. Supprimer une catégorie reclasse ses étapes au lieu de les perdre.
  Suggestions prêtes à l'emploi : observation, question, expertise, chantier, désordre.
- **Canal de l'échange** sur chaque étape : e-mail, LRAR, courrier, SMS, téléphone, réunion, visio,
  portail, main propre. Badge sur la carte (LRAR en rouge : c'est la preuve de notification), colonne
  du tableau et du CSV, mention « par lettre recommandée… » dans le courrier, filtre par canal. En
  capture rapide, le canal se déduit du texte (« LRAR au MOE », « appel du gestionnaire »).
- **Intervenants multiples** : une étape cite autant d'intervenants que nécessaire (assuré, expert,
  entreprise…), sous forme de puces. Le catalogue est alimenté automatiquement à chaque étape
  enregistrée, partagé par tous les dossiers, filtrable à la frappe, avec suppression des entrées
  inutiles. En capture rapide : `… | Assuré & Expert judiciaire`.
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
