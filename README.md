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
(champs code + nom + lien). Dans le bordereau, `✕` détache la pièce de son étape — l'étape, elle, reste —,
`✎` ouvre l'étape, et « Renuméroter par date » comble les trous de numérotation laissés.

Le glisser-déposer de la chronologie est désactivé tant qu'un filtre ou une recherche est actif
(l'ordre affiché serait partiel). Chaque déplacement est annulable (`Ctrl+Z`).

## Pièces justificatives

Une étape porte **autant de pièces que nécessaire** (« ＋ Pièce » dans le tiroir) : chacune a son
code (PJ-01…, « № » donne le suivant), son nom, son lien de consultation et, pour un fichier Drive,
son lien de **téléchargement direct** (⬇ sur la carte et dans le tiroir ; récupéré à la sélection,
ou déduit de l'identifiant si vous collez une URL Drive à la main — les documents Google natifs n'en
ont pas). Les anciens dossiers à pièce unique sont repris automatiquement.

Chaque pièce peut porter un **lien de consultation** : URL libre, ou fichier choisi sur Google Drive
via « 🔍 Drive » sur la ligne de la pièce.

**Connexion en un clic** : bouton « Connecter Google Drive (lecture seule) ». La fenêtre Google
s'ouvre, l'application reçoit un jeton d'accès limité au scope `drive.readonly` — portée vérifiée
auprès de Google (`tokeninfo`), tout droit d'écriture refusé. Il faut, une seule fois, un
**client ID OAuth** (⚙ dans le sélecteur) :

1. console Google Cloud → *Identifiants* → *Créer un ID client OAuth* → type **Application Web** ;
2. *Origines JavaScript autorisées* : l'URL où tourne l'app (`http://localhost:5173` en dev, votre
   domaine Cloudflare en prod) — aucun URI de redirection n'est nécessaire ;
3. coller le client ID dans ⚙. **Le client secret ne sert pas** et ne doit jamais être saisi : une
   application statique n'a aucun endroit où le cacher.

Le client ID est un identifiant public par conception ; il vit dans les préférences locales du
navigateur (`vuejs_assurance_prefs_v1`), comme le jeton, et n'apparaît **jamais** dans le code, la
base, les exports `.json`, le CSV ou le courrier. « Oublier le client ID » l'efface. Google Identity
Services n'est chargé qu'au clic sur « Connecter » : tant que Drive n'est pas utilisé, rien ne part
vers Google.

Le sélecteur s'ouvre dans le dossier **`Assurance`** à la racine du Drive (chemin réglable dans ⚙,
`Assurance/2026` accepté ; vide = racine). Fil d'Ariane, sous-dossiers au clic. La recherche par mot-clé est
**récursive** sous le dossier affiché (arborescence parcourue une fois par session, requêtes
groupées), chaque résultat indiquant son sous-dossier ; une case la limite au niveau courant. Si le
dossier manque, repli sur la racine avec un avis.

Le **collage manuel** d'un jeton (ex. [OAuth Playground](https://developers.google.com/oauthplayground))
reste possible, avec la même exigence de lecture seule. Un jeton expire au bout d'une heure : le
sélecteur l'indique et propose « renouveler ». Seul le **lien** (`webViewLink`) est enregistré dans le
dossier — jamais le fichier ni le jeton. Les liens s'ouvrent depuis la carte d'étape (🔗 consulter, ⬇ télécharger) et sont repris dans le
CSV (colonnes « Lien PJ » et « Téléchargement PJ ») et le courrier.

## Synchronisation chiffrée (Cloudflare, automatique)

Sur la version hébergée, la base se **synchronise toute seule** avec le KV Cloudflare : au démarrage,
au retour sur l'onglet, à la reconnexion, chaque minute et ~3 s après chaque modification (cycle :
récupérer → fusionner sans rien écraser → envoyer si la base a changé). Réglage **une seule fois par
appareil** (jeton + passphrase, proposé au premier lancement, ensuite via la pastille ☁ de la barre du
haut ou Fichier ▸ Synchronisation). Pastille : ☁✔ synchronisé · ⟳ en cours · ☁✕ hors ligne (nouvel essai
automatique) · ☁⚠ erreur (jeton ou passphrase). Décochable dans le dialogue. Base sauvegardée/synchronisée sur le
déploiement Cloudflare existant, **chiffrée de bout en bout** — le serveur ne stocke que des
enveloppes AES-GCM 256 illisibles (clé dérivée d'une passphrase par PBKDF2 600 k itérations,
qui ne quitte jamais le navigateur ; elle est mémorisée dans le navigateur, comme vos dossiers, pour que
tout soit automatique).

- **Worker** : `worker/index.js` répond sur `/api/sync` (même origine uniquement : aucun CORS).
  Chaque écriture porte une révision ; une écriture concurrente renvoie 409 et c'est le client,
  seul capable de déchiffrer, qui fusionne (mêmes règles sans perte que deux onglets) puis renvoie.
  Un historique de révisions est gardé **sans limite de durée** dans KV (une par heure d'activité) ; le dialogue de synchronisation le liste
  (`GET /api/sync?list=1`, `?rev=N`) et permet de **restaurer une révision en copies datées** (déchiffrée dans
  le navigateur, rien n'est écrasé) ou de **faire le ménage** à la main (cases à cocher, « Garder 1 par jour »,
  suppression ; la version courante n'est jamais supprimable).
- **Activation** (sinon l'API répond « non configuré » et l'app reste 100 % locale) :
  1. `npx wrangler kv namespace create SYNC_KV` puis coller l'id dans `wrangler.toml` ;
  2. `npx wrangler secret put VUEJS_ASSURANCE_TOKEN` (longue chaîne aléatoire, à coller dans le dialogue) ;
  3. recommandé : placer le domaine derrière **Cloudflare Access** (Zero Trust).
- **Récupérer et fusionner** n'écrase jamais l'état local (union dossier par dossier, annulable
  Ctrl+Z, sauvegarde forcée prise avant la fusion).
- Passphrase perdue sur tous les appareils = enveloppes distantes illisibles : les exports `.json` restent la
  vraie porte de sortie. Jeton et passphrase sont des préférences locales, jamais exportées.

## Application installable (Android, Chrome/Edge)

L'application est une **PWA** : manifeste (`public/manifest.webmanifest`), icônes 192/512 px et
« maskable » (`public/icons/`), service worker (`public/sw.js`). Chrome la juge installable
(vérifié par `Page.getInstallabilityErrors`) et elle se **rouvre hors ligne**.

- **Installer** : ouvrir le site en **https** dans Chrome Android → menu ⋮ ▸ *Installer l'application*,
  ou Fichier ▸ « 📲 Installer l'application » (visible dès que le navigateur la propose). Raccourcis
  d'icône (appui long) : *Nouvelle étape* et *Capture rapide*.
- **Hors ligne** : réseau d'abord (4 s), cache en secours, de sorte qu'une mise à jour est vue dès
  qu'on est en ligne. Le service worker ne touche **jamais** à `/api/*` ni aux autres origines
  (Drive, authentification) et ne met en cache que des réponses 200 : aucune donnée n'y transite.
  Les dossiers restent dans le `localStorage`.
- **Cloudflare Access** : le manifeste est déclaré `crossorigin="use-credentials"` pour être servi
  avec le cookie de session (sans quoi Access le redirigerait et l'installation échouerait).
- Mobile : barre du haut sur une seule rangée, tiroir plein écran, pièces regroupées, saisie en 16 px
  (pas de zoom automatique), zones sûres (encoche, barre de gestes) respectées.

## Archive « dossier + pièces » (.zip)

Fichier ▸ **Dossier + pièces (.zip)** : une archive autonome avec le **JSON** du dossier
(réimportable), le **même dossier en Markdown** lisible (chronologie, parties, questions, liens
relatifs vers les pièces), un dossier `pieces/` et un `LISEZMOI.txt` qui dit pour chaque pièce si elle
est incluse ou pourquoi elle ne l'est pas. Les fichiers sont lus **par l'API Drive avec le jeton
lecture seule** (un navigateur ne peut pas lire un simple lien de partage) : les documents Google
natifs sont exportés en PDF, les fichiers de plus de 200 Mo et les liens hors Drive sont listés mais
non copiés. Sans jeton Drive valide, l'export prévient et propose de continuer avec le JSON seul.
Nom : `{compteur}_assurance_{référence}_avec-pieces_{date}.zip`.

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
- **Parties & coordonnées** (encart avant la chronologie) : pour chaque intervenant — MOA, MOE,
  assureurs, experts, entreprises — rôle, nom, adresse, identifiants (SIRET, RCS), références (contrat,
  sinistre, n° d'assuré), contact. Réordonnable par glisser-déposer, imprimé en tête du dossier, repris
  dans le courrier généré, copiable en un bloc.
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
  J+n » en alerte au-delà de 15 jours.
- **Écarts de temps** entre deux étapes (« 72 jours plus tard »), désactivables d'un clic. L'écart
  n'est signalé comme *délai opposable* que si l'étape précédente attendait une réponse : LRAR,
  relance, question restée ouverte — un simple espacement du calendrier reste neutre.
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
