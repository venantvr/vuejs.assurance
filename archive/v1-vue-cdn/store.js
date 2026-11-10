/* ============================================================
   ChronoAssur — base de données locale (localStorage) + utilitaires
   Scripts classiques (pas de modules ES) pour fonctionner aussi en
   ouverture directe du fichier (file://).
   ============================================================ */
(function (global) {
  'use strict';

  var DB_KEY = 'chronoassur_db_v2';
  var LEGACY_KEY = 'chronoassur_dossier_v1'; // ancienne version mono-dossier
  var PREFS_KEY = 'chronoassur_prefs_v1';
  var DB_VERSION = 2;

  /* ---------------- Catégories ---------------- */

  var CATEGORIES = {
    SINISTRE: { label: 'Fait générateur / Sinistre', short: 'Sinistre', icon: '⚠' },
    TECHNIQUE: { label: 'Mesure conservatoire / Technique', short: 'Technique', icon: '🔧' },
    ADMIN: { label: 'Administratif / Juridique', short: 'Administratif', icon: '📄' },
    BLOCAGE: { label: 'Point de blocage / Relance', short: 'Blocage / Relance', icon: '🔔' },
    ECHEANCE: { label: 'Échéance / Rendez-vous à venir', short: 'Échéance', icon: '📅' }
  };

  var CATEGORY_ORDER = ['SINISTRE', 'TECHNIQUE', 'ADMIN', 'BLOCAGE', 'ECHEANCE'];

  /* ---------------- Modèles de dossiers (gain de temps) ---------------- */

  var SINISTRE_TYPES = [
    {
      id: 'DDE',
      name: 'Dégât des eaux',
      object: 'Dégât des eaux : infiltration / fuite avec dommages aux biens immobiliers et mobiliers.',
      steps: [
        { category: 'SINISTRE', fact: 'Découverte du sinistre : [décrire la trace, l\'écoulement, la zone touchée et la surface approximative].', actor: 'Assuré', impact: 'Dommages constatés', pjName: 'Photos-datees' },
        { category: 'TECHNIQUE', fact: 'Mesure conservatoire : coupure de l\'arrivée d\'eau / épongeage / protection du mobilier.', actor: 'Assuré', impact: 'Limitation du dommage' },
        { category: 'TECHNIQUE', fact: 'Recherche de fuite non destructive réalisée. Conclusion du rapport : [origine de la fuite].', actor: 'Entreprise de recherche de fuite', pjName: 'Rapport-recherche-de-fuite' },
        { category: 'ADMIN', fact: 'Déclaration du sinistre à l\'assureur et transmission du constat amiable dégât des eaux.', actor: 'Assuré', pjName: 'Constat-amiable-DDE' },
        { category: 'ADMIN', fact: 'Transmission du devis de remise en état (assèchement, traitement, peinture).', actor: 'Entreprise de travaux', pjName: 'Devis-remise-en-etat' }
      ]
    },
    {
      id: 'INCENDIE',
      name: 'Incendie / Fumées',
      object: 'Incendie : dommages par le feu, la chaleur et les fumées.',
      steps: [
        { category: 'SINISTRE', fact: 'Départ de feu constaté : [origine, pièce, heure].', actor: 'Assuré', impact: 'Dommages feu et fumées' },
        { category: 'TECHNIQUE', fact: 'Intervention des services de secours — rapport d\'intervention demandé.', actor: 'Pompiers', pjName: 'Rapport-intervention-pompiers' },
        { category: 'ADMIN', fact: 'Déclaration du sinistre à l\'assureur avec inventaire provisoire des biens détruits.', actor: 'Assuré', pjName: 'Inventaire-biens-detruits' },
        { category: 'TECHNIQUE', fact: 'Mesures conservatoires : sécurisation, bâchage, nettoyage des suies.', actor: 'Entreprise' },
        { category: 'ADMIN', fact: 'Passage de l\'expert mandaté par l\'assureur.', actor: 'Expert assureur', pjName: 'Compte-rendu-expertise' }
      ]
    },
    {
      id: 'VOL',
      name: 'Vol / Vandalisme',
      object: 'Vol par effraction : disparition de biens et dégradations des accès.',
      steps: [
        { category: 'SINISTRE', fact: 'Découverte de l\'effraction et du vol : [point d\'entrée, dégradations, biens manquants].', actor: 'Assuré', pjName: 'Photos-effraction' },
        { category: 'ADMIN', fact: 'Dépôt de plainte au commissariat / à la gendarmerie.', actor: 'Assuré', pjName: 'Depot-de-plainte' },
        { category: 'TECHNIQUE', fact: 'Sécurisation en urgence de l\'ouvrant fracturé.', actor: 'Serrurier', pjName: 'Facture-serrurier' },
        { category: 'ADMIN', fact: 'Déclaration du vol à l\'assureur avec état estimatif des biens volés et justificatifs d\'achat.', actor: 'Assuré', pjName: 'Etat-estimatif-et-factures' }
      ]
    },
    {
      id: 'AUTO',
      name: 'Automobile',
      object: 'Sinistre automobile : collision avec dommages matériels.',
      steps: [
        { category: 'SINISTRE', fact: 'Accident / collision : [lieu, circonstances, véhicules impliqués].', actor: 'Assuré', pjName: 'Photos-vehicule' },
        { category: 'ADMIN', fact: 'Constat amiable rempli et signé par les deux parties.', actor: 'Assuré & tiers', pjName: 'Constat-amiable-auto' },
        { category: 'ADMIN', fact: 'Déclaration du sinistre à l\'assureur.', actor: 'Assuré' },
        { category: 'TECHNIQUE', fact: 'Devis de réparation établi par le garage.', actor: 'Garage', pjName: 'Devis-reparation' },
        { category: 'ADMIN', fact: 'Expertise du véhicule.', actor: 'Expert auto', pjName: 'Rapport-expertise-auto' }
      ]
    },
    {
      id: 'VIDE',
      name: 'Dossier vierge',
      object: '',
      steps: []
    }
  ];

  /* Étapes prêtes à insérer, quel que soit le dossier */
  var STEP_PRESETS = [
    { category: 'BLOCAGE', fact: 'Relance écrite adressée au gestionnaire — absence de réponse depuis [X] jours sur [objet].', actor: 'Assuré', impact: 'Dossier à l\'arrêt', question: 'Pouvez-vous m\'indiquer sous quel délai une décision de prise en charge sera rendue ?' },
    { category: 'BLOCAGE', fact: 'Relance téléphonique — interlocuteur : [nom]. Engagement annoncé : [réponse obtenue].', actor: 'Assuré' },
    { category: 'ADMIN', fact: 'Transmission des pièces complémentaires demandées par l\'assureur : [liste].', actor: 'Assuré' },
    { category: 'ADMIN', fact: 'Réception du courrier / mail de l\'assureur : [contenu de la position prise].', actor: 'Assureur', pjName: 'Courrier-assureur' },
    { category: 'ADMIN', fact: 'Passage de l\'expert mandaté par l\'assureur. Points relevés : [observations].', actor: 'Expert assureur', pjName: 'Compte-rendu-expertise' },
    { category: 'TECHNIQUE', fact: 'Intervention d\'urgence / mesure conservatoire : [nature des travaux].', actor: 'Entreprise' },
    { category: 'ADMIN', fact: 'Réception du devis / de la facture : [prestation].', actor: 'Entreprise', pjName: 'Devis-ou-facture' },
    { category: 'ECHEANCE', fact: 'Rendez-vous à venir : [objet du rendez-vous].', actor: 'À confirmer' },
    { category: 'ADMIN', fact: 'Réception de la proposition d\'indemnisation : [montant et mode de calcul].', actor: 'Assureur', pjName: 'Proposition-indemnisation', question: 'Pouvez-vous me détailler le calcul de la vétusté appliquée et la franchise retenue ?' },
    { category: 'BLOCAGE', fact: 'Désaccord notifié sur [point] : [motif factuel du désaccord].', actor: 'Assuré', impact: 'Point d\'arbitrage ouvert' }
  ];

  /* ---------------- Utilitaires ---------------- */

  function uid(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function todayISO() {
    var d = new Date();
    return isoOf(d);
  }

  function isoOf(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var j = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + j;
  }

  function daysBetween(isoA, isoB) {
    if (!isoA || !isoB) return null;
    var a = new Date(isoA + 'T00:00:00');
    var b = new Date(isoB + 'T00:00:00');
    if (isNaN(a) || isNaN(b)) return null;
    return Math.round((b - a) / 86400000);
  }

  function formatDateFR(iso) {
    if (!iso) return '—';
    var p = String(iso).split('-');
    if (p.length !== 3) return iso;
    return p[2] + '/' + p[1] + '/' + p[0];
  }

  function formatCurrency(v) {
    var n = parseFloat(v) || 0;
    return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  }

  function slugify(str) {
    return String(str || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'document';
  }

  function pjFilename(step) {
    var code = (step.pjCode || 'PJ').trim().replace(/\s+/g, '-');
    return code + '_' + (step.date || 'date') + '_' + slugify(step.pjName || 'document') + '.pdf';
  }

  /* ---------------- Modèle de dossier ---------------- */

  function newStep(over) {
    var s = {
      id: uid('step'),
      date: todayISO(),
      time: '',
      category: 'ADMIN',
      fact: '',
      actor: '',
      amount: 0,
      impact: '',
      pjCode: '',
      pjName: '',
      question: '',
      questionResolved: false,
      questionAnswer: ''
    };
    if (over) for (var k in over) if (Object.prototype.hasOwnProperty.call(over, k)) s[k] = over[k];
    return s;
  }

  function newDossier(name, typeId) {
    var type = null;
    for (var i = 0; i < SINISTRE_TYPES.length; i++) if (SINISTRE_TYPES[i].id === typeId) type = SINISTRE_TYPES[i];
    var now = new Date().toISOString();
    var steps = [];
    if (type && type.steps.length) {
      var base = new Date();
      for (var j = 0; j < type.steps.length; j++) {
        var t = type.steps[j];
        var d = new Date(base.getTime());
        d.setDate(d.getDate() - (type.steps.length - 1 - j));
        steps.push(newStep({ date: isoOf(d), category: t.category, fact: t.fact, actor: t.actor || '', impact: t.impact || '', pjName: t.pjName || '', question: t.question || '' }));
      }
      // numérotation auto des PJ pré-remplies
      var n = 0;
      for (var k2 = 0; k2 < steps.length; k2++) {
        if (steps[k2].pjName) { n++; steps[k2].pjCode = 'PJ-' + String(n).padStart(2, '0'); }
      }
    }
    return {
      id: uid('dos'),
      name: name || 'Nouveau dossier',
      createdAt: now,
      updatedAt: now,
      meta: {
        ref: '',
        parties: '',
        status: '',
        object: type ? type.object : '',
        insurer: '',
        deductible: ''
      },
      steps: steps,
      globalQuestions: [],
      ui: { sortAsc: true, viewMode: 'CARDS' }
    };
  }

  function sanitizeDossier(raw, fallbackName) {
    var d = newDossier(fallbackName || 'Dossier importé', 'VIDE');
    if (!raw || typeof raw !== 'object') return d;
    if (raw.id) d.id = String(raw.id);
    if (raw.name) d.name = String(raw.name);
    if (raw.createdAt) d.createdAt = raw.createdAt;
    if (raw.updatedAt) d.updatedAt = raw.updatedAt;
    var m = raw.meta || {};
    d.meta = {
      ref: m.ref || '', parties: m.parties || '', status: m.status || '',
      object: m.object || '', insurer: m.insurer || '', deductible: m.deductible || ''
    };
    d.steps = (Array.isArray(raw.steps) ? raw.steps : []).map(function (s) {
      return newStep({
        id: s.id || uid('step'),
        date: s.date || todayISO(),
        time: s.time || '',
        category: CATEGORIES[s.category] ? s.category : 'ADMIN',
        fact: s.fact || '',
        actor: s.actor || '',
        amount: parseFloat(s.amount) || 0,
        impact: s.impact || '',
        pjCode: s.pjCode || '',
        pjName: s.pjName || '',
        question: s.question || '',
        questionResolved: !!s.questionResolved,
        questionAnswer: s.questionAnswer || ''
      });
    });
    d.globalQuestions = (Array.isArray(raw.globalQuestions) ? raw.globalQuestions : []).map(function (q) {
      return {
        id: q.id || uid('gq'),
        text: q.text || '',
        status: q.status === 'RESOLVED' ? 'RESOLVED' : 'PENDING',
        answer: q.answer || ''
      };
    });
    d.ui = {
      sortAsc: raw.ui ? raw.ui.sortAsc !== false : true,
      viewMode: raw.ui && raw.ui.viewMode === 'TABLE' ? 'TABLE' : 'CARDS'
    };
    if (!raw.name && d.meta.ref) d.name = d.meta.ref;
    return d;
  }

  /* ---------------- Persistance ---------------- */

  function emptyDb() {
    return { version: DB_VERSION, activeId: null, dossiers: [] };
  }

  function loadDb() {
    var db = emptyDb();
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.dossiers)) {
          db.dossiers = parsed.dossiers.map(function (d) { return sanitizeDossier(d); });
          db.activeId = parsed.activeId || (db.dossiers[0] && db.dossiers[0].id) || null;
        }
      }
    } catch (e) { /* stockage illisible : on repart propre */ }

    // Reprise automatique de l'ancienne version mono-dossier
    if (!db.dossiers.length) {
      try {
        var legacy = localStorage.getItem(LEGACY_KEY);
        if (legacy) {
          var ld = sanitizeDossier(JSON.parse(legacy), 'Dossier repris (version 1)');
          db.dossiers = [ld];
          db.activeId = ld.id;
        }
      } catch (e2) { /* ignore */ }
    }
    if (db.dossiers.length && !findDossier(db, db.activeId)) db.activeId = db.dossiers[0].id;
    return db;
  }

  function saveDb(db) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify({
        version: DB_VERSION, activeId: db.activeId, dossiers: db.dossiers
      }));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e && e.name === 'QuotaExceededError' ? 'Stockage navigateur saturé' : String(e && e.message || e) };
    }
  }

  function findDossier(db, id) {
    for (var i = 0; i < db.dossiers.length; i++) if (db.dossiers[i].id === id) return db.dossiers[i];
    return null;
  }

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch (e) { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  /* ---------------- Capture rapide : analyse d'une ligne ---------------- */
  /*
     Exemples acceptés :
       "12/09 relance téléphonique du gestionnaire"
       "hier 14h30 technique | intervention plombier | AquaFuite | 285€"
       "intervention plombier 285,00 € PJ Facture-plombier"
  */
  var CAT_HINTS = [
    { cat: 'ADMIN', words: ['déclaration', 'declaration', 'courrier', 'recommandé', 'recommande', 'plainte', 'contrat'] },
    { cat: 'SINISTRE', words: ['dégât', 'degat', 'fuite constatée', 'découverte', 'decouverte', 'incendie', 'effraction', 'accident', 'apparition', 'départ de feu', 'depart de feu'] },
    { cat: 'TECHNIQUE', words: ['plombier', 'intervention', 'travaux', 'recherche de fuite', 'assèchement', 'assechement', 'serrurier', 'devis', 'réparation', 'reparation', 'technique', 'garage', 'bâchage', 'bachage'] },
    { cat: 'BLOCAGE', words: ['relance', 'blocage', 'sans réponse', 'sans reponse', 'refus', 'désaccord', 'desaccord', 'retard', 'litige', 'mise en demeure'] },
    { cat: 'ECHEANCE', words: ['rendez-vous', 'rdv', 'à venir', 'a venir', 'prévu', 'prevu', 'échéance', 'echeance', 'convocation'] },
    { cat: 'ADMIN', words: ['déclaration', 'declaration', 'courrier', 'mail', 'expert', 'constat', 'plainte', 'facture', 'contrat', 'lettre', 'recommandé', 'recommande'] }
  ];

  function parseQuickLine(line) {
    var txt = String(line || '').trim();
    if (!txt) return null;
    var out = { date: todayISO(), time: '', category: null, fact: '', actor: '', amount: 0, pjName: '' };
    var explicit = { date: false, category: false };

    // Séparateurs explicites : fait | acteur | montant
    var parts = txt.split('|').map(function (s) { return s.trim(); }).filter(function (s) { return s; });
    if (parts.length > 1) {
      txt = parts[0];
      for (var i = 1; i < parts.length; i++) {
        var p = parts[i];
        var mm = p.match(/^(\d+(?:[.,]\d+)?)\s*(?:€|eur|euros)?$/i);
        if (mm) out.amount = parseFloat(mm[1].replace(',', '.'));
        else if (/^PJ[\s:-]/i.test(p)) out.pjName = p.replace(/^PJ[\s:-]+/i, '').trim();
        else if (!out.actor) out.actor = p;
      }
    }

    // Date en tête : 12/09, 12/09/2026, 2026-09-12, aujourd'hui, hier, avant-hier
    var low = txt.toLowerCase();
    var mDate;
    if (/^avant[- ]hier\b/.test(low)) {
      var d2 = new Date(); d2.setDate(d2.getDate() - 2); out.date = isoOf(d2);
      txt = txt.replace(/^avant[- ]hier\s*/i, ''); explicit.date = true;
    } else if (/^hier\b/.test(low)) {
      var d1 = new Date(); d1.setDate(d1.getDate() - 1); out.date = isoOf(d1);
      txt = txt.replace(/^hier\s*/i, ''); explicit.date = true;
    } else if (/^(aujourd'hui|auj)\b/.test(low)) {
      txt = txt.replace(/^(aujourd'hui|auj)\s*/i, ''); explicit.date = true;
    } else if ((mDate = txt.match(/^(\d{4})-(\d{2})-(\d{2})\s*/))) {
      out.date = mDate[1] + '-' + mDate[2] + '-' + mDate[3];
      txt = txt.slice(mDate[0].length); explicit.date = true;
    } else if ((mDate = txt.match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?\s*/))) {
      var year = mDate[3] ? (mDate[3].length === 2 ? '20' + mDate[3] : mDate[3]) : String(new Date().getFullYear());
      out.date = year + '-' + String(mDate[2]).padStart(2, '0') + '-' + String(mDate[1]).padStart(2, '0');
      txt = txt.slice(mDate[0].length); explicit.date = true;
    }

    // Heure : 14h30, 14:30, 9h
    var mTime = txt.match(/^(\d{1,2})\s*[h:]\s*(\d{2})?\s*/);
    if (mTime) {
      out.time = String(mTime[1]).padStart(2, '0') + ':' + (mTime[2] || '00');
      txt = txt.slice(mTime[0].length);
    }

    // Catégorie explicite en tête : "tech:", "admin -", "blocage"
    var alias = { sinistre: 'SINISTRE', tech: 'TECHNIQUE', technique: 'TECHNIQUE', admin: 'ADMIN', administratif: 'ADMIN', blocage: 'BLOCAGE', relance: 'BLOCAGE', echeance: 'ECHEANCE', 'échéance': 'ECHEANCE', rdv: 'ECHEANCE' };
    var mCat = txt.match(/^([a-zA-Zéè]+)\s*[:>-]\s*/);
    if (mCat && alias[mCat[1].toLowerCase()]) {
      out.category = alias[mCat[1].toLowerCase()];
      txt = txt.slice(mCat[0].length);
      explicit.category = true;
    }

    // Montant dans le texte : "285 €", "1 840,00€"
    if (!out.amount) {
      var mAmt = txt.match(/(\d{1,3}(?:[  ]\d{3})*|\d+)(?:[.,](\d{1,2}))?\s*(?:€|eur\b|euros\b)/i);
      if (mAmt) {
        var intPart = mAmt[1].replace(/[  ]/g, '');
        out.amount = parseFloat(intPart + (mAmt[2] ? '.' + mAmt[2] : ''));
        txt = (txt.slice(0, mAmt.index) + txt.slice(mAmt.index + mAmt[0].length)).replace(/\s{2,}/g, ' ').trim();
      }
    }

    // Pièce jointe : "PJ Facture-plombier" en fin de ligne
    if (!out.pjName) {
      var mPj = txt.match(/\bPJ\s*[:=-]?\s*([^\s|]{3,})\s*$/i);
      if (mPj) { out.pjName = mPj[1]; txt = txt.slice(0, mPj.index).trim(); }
    }

    out.fact = txt.replace(/^[\s:,-]+/, '').trim();

    // Catégorie devinée par mots-clés
    if (!out.category) {
      var hay = (out.fact + ' ' + out.actor).toLowerCase();
      for (var h = 0; h < CAT_HINTS.length; h++) {
        for (var w = 0; w < CAT_HINTS[h].words.length; w++) {
          if (hay.indexOf(CAT_HINTS[h].words[w]) !== -1) { out.category = CAT_HINTS[h].cat; break; }
        }
        if (out.category) break;
      }
    }
    if (!out.category) out.category = 'ADMIN';
    out.guessedCategory = !explicit.category;
    out.guessedDate = !explicit.date;
    if (!out.fact) return null;
    return out;
  }

  /* ---------------- Export fichiers ---------------- */

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function csvCell(v) {
    var s = String(v == null ? '' : v).replace(/"/g, '""');
    return '"' + s + '"';
  }

  function dossierToCsv(dossier) {
    var head = ['Date', 'Heure', 'Catégorie', 'Fait', 'Acteur', 'Montant EUR', 'Impact', 'Code PJ', 'Nom PJ', 'Question', 'Question résolue', 'Réponse'];
    var rows = [head.map(csvCell).join(';')];
    var steps = dossier.steps.slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
    steps.forEach(function (s) {
      rows.push([
        s.date, s.time, (CATEGORIES[s.category] || {}).short || s.category, s.fact, s.actor,
        (parseFloat(s.amount) || 0).toFixed(2).replace('.', ','), s.impact, s.pjCode, s.pjName,
        s.question, s.question ? (s.questionResolved ? 'oui' : 'non') : '', s.questionAnswer
      ].map(csvCell).join(';'));
    });
    return '﻿' + rows.join('\r\n');
  }

  /* ---------------- Brouillon de courrier / mail ---------------- */

  function buildMail(dossier, opts) {
    opts = opts || {};
    var steps = dossier.steps.slice().sort(function (a, b) { return (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')); });
    var total = steps.reduce(function (t, s) { return t + (parseFloat(s.amount) || 0); }, 0);
    var openQ = [];
    steps.forEach(function (s) { if (s.question && !s.questionResolved) openQ.push(s.question); });
    dossier.globalQuestions.forEach(function (q) { if (q.status !== 'RESOLVED') openQ.push(q.text); });

    var L = [];
    L.push('Objet : ' + (dossier.meta.ref ? dossier.meta.ref + ' — ' : '') + (opts.kind === 'RELANCE'
      ? 'relance et point d\'avancement du dossier'
      : 'chronologie factuelle et pièces justificatives'));
    L.push('');
    L.push('Madame, Monsieur,');
    L.push('');
    if (dossier.meta.object) {
      L.push('Je reviens vers vous au sujet du sinistre suivant : ' + dossier.meta.object);
    } else {
      L.push('Je reviens vers vous au sujet du dossier référencé en objet.');
    }
    if (dossier.meta.parties) L.push('Parties concernées : ' + dossier.meta.parties + '.');
    if (dossier.meta.status) L.push('État actuel du dossier : ' + dossier.meta.status + '.');
    L.push('');
    L.push('Afin de vous faire gagner du temps dans l\'instruction, vous trouverez ci-dessous la chronologie factuelle des événements, chaque élément clé étant appuyé par une pièce justificative numérotée.');
    L.push('');
    L.push('— CHRONOLOGIE —');
    steps.forEach(function (s) {
      var line = '• ' + formatDateFR(s.date) + (s.time ? ' à ' + s.time : '') + ' — ' + s.fact.replace(/\s+/g, ' ').trim();
      var extra = [];
      if (s.actor) extra.push('intervenant : ' + s.actor);
      if (parseFloat(s.amount) > 0) extra.push('montant : ' + formatCurrency(s.amount));
      if (s.pjCode) extra.push(s.pjCode);
      if (extra.length) line += ' (' + extra.join(' ; ') + ')';
      L.push(line);
    });
    if (total > 0) {
      L.push('');
      L.push('Total des sommes engagées / chiffrées à ce jour : ' + formatCurrency(total) + '.');
    }
    if (openQ.length) {
      L.push('');
      L.push('— POINTS NÉCESSITANT VOTRE POSITION ÉCRITE —');
      openQ.forEach(function (q, i) { L.push((i + 1) + '. ' + q); });
    }
    var pjs = steps.filter(function (s) { return s.pjCode; });
    if (pjs.length) {
      L.push('');
      L.push('— BORDEREAU DES PIÈCES JOINTES —');
      pjs.forEach(function (s) { L.push(s.pjCode + ' — ' + (s.pjName || 'document') + ' (' + formatDateFR(s.date) + ')'); });
    }
    L.push('');
    if (opts.kind === 'RELANCE') {
      L.push('Sauf erreur de ma part, ce dossier est sans évolution depuis le ' + (steps.length ? formatDateFR(steps[steps.length - 1].date) : formatDateFR(todayISO())) + '. Je vous remercie de bien vouloir m\'indiquer par écrit la suite réservée aux points ci-dessus, ainsi que le délai prévisionnel de traitement.');
    } else {
      L.push('Je reste à votre disposition pour tout complément et vous remercie de bien vouloir me confirmer par écrit votre position sur les points listés ci-dessus.');
    }
    L.push('');
    L.push('Dans l\'attente de votre retour, je vous prie d\'agréer, Madame, Monsieur, l\'expression de mes salutations distinguées.');
    L.push('');
    L.push('[Nom, prénom]');
    L.push('[Numéro de contrat / de sinistre : ' + (dossier.meta.ref || 'à compléter') + ']');
    L.push('[Téléphone / courriel]');
    return L.join('\n');
  }

  global.CA = {
    DB_KEY: DB_KEY, PREFS_KEY: PREFS_KEY,
    CATEGORIES: CATEGORIES, CATEGORY_ORDER: CATEGORY_ORDER,
    SINISTRE_TYPES: SINISTRE_TYPES, STEP_PRESETS: STEP_PRESETS,
    uid: uid, todayISO: todayISO, isoOf: isoOf, daysBetween: daysBetween,
    formatDateFR: formatDateFR, formatCurrency: formatCurrency,
    slugify: slugify, pjFilename: pjFilename,
    newStep: newStep, newDossier: newDossier, sanitizeDossier: sanitizeDossier,
    emptyDb: emptyDb, loadDb: loadDb, saveDb: saveDb, findDossier: findDossier,
    loadPrefs: loadPrefs, savePrefs: savePrefs,
    parseQuickLine: parseQuickLine,
    download: download, dossierToCsv: dossierToCsv, buildMail: buildMail
  };
})(window);
