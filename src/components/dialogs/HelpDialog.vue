<script setup>
import BaseDialog from '../BaseDialog.vue'
import { useUiStore } from '@/stores/ui.js'
import { DB_KEY } from '@/lib/storage.js'

const ui = useUiStore()

const shortcuts = [
  ['N', 'nouvelle étape détaillée'],
  ['/', 'capture rapide'],
  ['F', 'rechercher dans la chronologie'],
  ['Ctrl+S', 'sauvegarder le dossier en .json'],
  ['Ctrl+Z / Ctrl+Maj+Z', 'annuler / rétablir'],
  ['Ctrl+↵', "enregistrer l'étape ouverte"],
  ['Maj+↑ / Maj+↓', "décaler la date d'un jour (poignée ⠿ sélectionnée)"],
  ['Ctrl+P', 'imprimer / PDF'],
  ['Échap', 'fermer le panneau ouvert'],
  ['?', 'cette aide']
]
</script>

<template>
  <BaseDialog title="Aide, méthode &amp; raccourcis" @close="ui.closeDialog()">
    <section>
      <b class="small">4 règles d'or pour accélérer l'indemnisation</b>
      <ol class="small rules">
        <li><b>Zéro affect, 100 % factuel.</b> « Délai d'intervention de 6 jours » plutôt que « un temps interminable ».</li>
        <li><b>Un fait = une preuve.</b> Chaque ligne clé porte une pièce numérotée (PJ-01, PJ-02…).</li>
        <li><b>Isolez vos questions.</b> Une question listée à part obtient une réponse écrite ; noyée dans un mail, elle est ignorée.</li>
        <li><b>Nommage strict des fichiers.</b> Copiez le nom généré (<code>PJ-01_2026-09-12_Nom.pdf</code>) pour renommer vos PDF.</li>
      </ol>
    </section>

    <section>
      <b class="small">Glisser-déposer</b>
      <ul class="small rules">
        <li>Chronologie : poignée <code>⠿</code> pour réordonner les étapes — le dossier bascule en <b>ordre manuel</b>.</li>
        <li>Bordereau : glisser une pièce <b>renumérote</b> tout le bordereau (PJ-01, PJ-02…).</li>
        <li>Une pièce n'existe pas seule : elle appartient à une étape. <code>✕</code> la détache (l'étape reste),
          <code>✎</code> ouvre l'étape. « Renuméroter par date » comble ensuite les trous de numérotation.</li>
        <li>Questions générales : glisser définit l'ordre de priorité repris dans le courrier.</li>
        <li>Toute question se supprime par <code>🗑</code> — depuis la section 5 ou depuis la carte de l'étape ;
          l'étape, elle, est conservée.</li>
        <li>Un fichier <code>.json</code> déposé sur la page est importé directement.</li>
      </ul>
    </section>

    <section>
      <b class="small">Catégories</b>
      <p class="small muted">
        Les cinq catégories natives ne couvrent pas tous les dossiers : <code>⚙ Catégories</code> (barre de
        filtres ou tiroir d'édition) permet d'en ajouter — libellé, nom court, icône, couleur —, de les
        modifier et de les supprimer. Supprimer une catégorie reclasse ses étapes en « Administratif /
        Juridique » plutôt que de les perdre. Le nom court sert aussi de préfixe en capture rapide
        (<code>observation: fissure en façade nord</code>).
      </p>
    </section>

    <section>
      <b class="small">Pièces sur Google Drive</b>
      <p class="small muted">
        « Connecter Google Drive (lecture seule) » ouvre la fenêtre Google et ne rapporte qu'un jeton
        <code>drive.readonly</code>, vérifié. Une seule fois, renseignez via ⚙ un <b>client ID OAuth</b> de type
        « Application Web » (identifiant public, conservé dans ce navigateur — jamais le <i>client secret</i>,
        qui n'a pas sa place dans une application statique). Rien ne part vers Google tant que vous ne cliquez
        pas sur « Connecter ».
      </p>
    </section>

    <section>
      <b class="small">Parties &amp; coordonnées</b>
      <p class="small muted">
        L'encart « Parties » (avant la chronologie) rassemble, pour chaque intervenant, rôle, nom, adresse,
        identifiants (SIRET, RCS), références (contrat, sinistre, n° d'assuré) et contact. Il s'imprime en tête
        du dossier et figure dans le courrier généré. Les cartes se réordonnent par glisser-déposer.
      </p>
    </section>

    <section>
      <b class="small">Canal de l'échange</b>
      <p class="small muted">
        Chaque étape peut préciser son support — e-mail, <b>LRAR</b>, courrier, SMS, téléphone, réunion… — pour
        prouver une notification ou dater un accord. En capture rapide il se déduit du texte ; le filtre
        « Tous canaux » isole par exemple les seules lettres recommandées.
      </p>
    </section>

    <section>
      <b class="small">Intervenants</b>
      <p class="small muted">
        Une étape peut citer <b>plusieurs intervenants</b> (assuré, expert, entreprise…). Le champ puise
        dans un catalogue partagé par tous les dossiers :
        <code>▾</code> ouvre la liste, la frappe la filtre, « Mémoriser » y ajoute la saisie courante et
        <code>✕</code> retire une entrée (les étapes qui la citent ne changent pas). Tout intervenant saisi lors
        de l'enregistrement d'une étape est mémorisé automatiquement. En capture rapide, séparez-les par
        <code>&amp;</code> : <code>… | Assuré &amp; Expert judiciaire</code>.
      </p>
    </section>

    <section>
      <b class="small">Raccourcis clavier</b>
      <div class="grid-2 small shortcuts">
        <div v-for="[keys, label] in shortcuts" :key="keys">
          <kbd>{{ keys }}</kbd> {{ label }}
        </div>
      </div>
    </section>

    <section>
      <b class="small">Où sont mes données, et que se passe-t-il si… ?</b>
      <ul class="small rules">
        <li>Tout est stocké dans <b>votre navigateur</b> (localStorage, clé <code>{{ DB_KEY }}</code>) ; rien n'est envoyé sur internet.</li>
        <li><b>Deux onglets ouverts</b> : les modifications sont fusionnées, jamais écrasées ; l'autre onglet se recharge.</li>
        <li><b>Dossier supprimé</b> : il va à la corbeille (menu 📁), restaurable à tout moment.</li>
        <li><b>Catégorie supprimée</b> : les étapes gardent leur classement (<code>⌀</code>), la catégorie se restaure dans ⚙ Catégories.</li>
        <li><b>Mauvaise manipulation</b> : <kbd>Ctrl+Z</kbd> en session, puis <b>Fichier ▸ Sauvegardes automatiques</b> (copies prises avant vos modifications, restaurées en copie).</li>
        <li><b>Stockage saturé ou illisible</b> : un bandeau vous propose de tout télécharger ; un contenu illisible est mis de côté, jamais écrasé.</li>
        <li>Vider les données du navigateur efface tout de même l'ensemble : <b>Fichier ▸ Sauvegarder (.json)</b> reste la référence hors du navigateur.</li>
      </ul>
    </section>

    <template #footer>
      <button class="btn btn-primary" @click="ui.closeDialog()">Compris</button>
      <span class="grow" />
      <span class="small muted">Vue 3 · Pinia · Vite — la page HTML d'origine est conservée dans <code>archive/</code>.</span>
    </template>
  </BaseDialog>
</template>

<style scoped>
.rules { margin: 8px 0 0; padding-left: 18px; line-height: 1.75; }
.shortcuts { margin-top: 8px; }
</style>
