/* ============================================================
   ChronoAssur — application Vue 3 (build global, sans étape de compilation)
   ============================================================ */
(function () {
  'use strict';

  var CA = window.CA;
  var MAX_HISTORY = 60;

  var app = Vue.createApp({
    data: function () {
      var prefs = CA.loadPrefs();
      return {
        db: CA.emptyDb(),
        theme: prefs.theme === 'dark' ? 'dark' : 'light',

        saveState: 'saved',
        saveError: '',
        saveTimer: null,

        undoStack: [],
        redoStack: [],

        menu: null,
        quickLine: '',
        search: '',
        filter: 'ALL',
        onlyOpenQ: false,
        onlyNoPj: false,

        editing: null,
        editingIsNew: false,

        showPresets: false,
        showHelp: false,
        showNew: false,
        newName: '',
        newType: 'DDE',

        mailText: null,
        mailKind: 'SYNTHESE',

        confirmBox: null,
        importMode: 'merge',
        dragging: false,
        toasts: [],
        toastSeq: 0,

        catOrder: CA.CATEGORY_ORDER,
        presets: CA.STEP_PRESETS,
        types: CA.SINISTRE_TYPES,
        printDate: new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      };
    },

    computed: {
      dossier: function () {
        return CA.findDossier(this.db, this.db.activeId);
      },
      sortedDossiers: function () {
        return this.db.dossiers.slice().sort(function (a, b) {
          return String(b.updatedAt).localeCompare(String(a.updatedAt));
        });
      },
      sortedSteps: function () {
        if (!this.dossier) return [];
        var asc = this.dossier.ui.sortAsc;
        return this.dossier.steps.slice().sort(function (a, b) {
          var ka = a.date + 'T' + (a.time || '00:00');
          var kb = b.date + 'T' + (b.time || '00:00');
          return asc ? ka.localeCompare(kb) : kb.localeCompare(ka);
        });
      },
      visibleSteps: function () {
        var q = this.search.trim().toLowerCase();
        var self = this;
        return this.sortedSteps.filter(function (s) {
          if (self.filter !== 'ALL' && s.category !== self.filter) return false;
          if (self.onlyOpenQ && !(s.question && !s.questionResolved)) return false;
          if (self.onlyNoPj && (s.pjCode || s.pjName)) return false;
          if (q) {
            var hay = [s.fact, s.actor, s.impact, s.pjCode, s.pjName, s.question, s.questionAnswer, s.date].join(' ').toLowerCase();
            if (hay.indexOf(q) === -1) return false;
          }
          return true;
        });
      },
      countByCat: function () {
        var out = {};
        if (!this.dossier) return out;
        this.dossier.steps.forEach(function (s) { out[s.category] = (out[s.category] || 0) + 1; });
        return out;
      },
      pjSteps: function () {
        return this.sortedSteps.filter(function (s) { return s.pjCode || s.pjName; });
      },
      knownActors: function () {
        var seen = {};
        var out = [];
        this.db.dossiers.forEach(function (d) {
          d.steps.forEach(function (s) {
            var a = (s.actor || '').trim();
            if (a && !seen[a]) { seen[a] = 1; out.push(a); }
          });
        });
        return out.sort();
      },
      allQuestions: function () {
        var out = [];
        this.sortedSteps.forEach(function (s) {
          if (s.question && s.question.trim()) {
            out.push({
              key: 'st-' + s.id, stepId: s.id, date: s.date,
              text: s.question, resolved: !!s.questionResolved, answer: s.questionAnswer || ''
            });
          }
        });
        if (this.dossier) {
          this.dossier.globalQuestions.forEach(function (g) {
            out.push({
              key: 'gq-' + g.id, gqId: g.id, date: null,
              text: g.text, resolved: g.status === 'RESOLVED', answer: g.answer || ''
            });
          });
        }
        return out.sort(function (a, b) { return (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0); });
      },
      kpi: function () {
        var d = this.dossier;
        var empty = { total: 0, withAmount: 0, pjCount: 0, missingPj: 0, openQuestions: 0, spanDays: null, silenceDays: null };
        if (!d) return empty;
        var total = 0, withAmount = 0, pjCount = 0, openQ = 0;
        d.steps.forEach(function (s) {
          var a = parseFloat(s.amount) || 0;
          if (a) { total += a; withAmount++; }
          if (s.pjCode || s.pjName) pjCount++;
          if (s.question && s.question.trim() && !s.questionResolved) openQ++;
        });
        d.globalQuestions.forEach(function (g) { if (g.status !== 'RESOLVED' && (g.text || '').trim()) openQ++; });
        var dates = d.steps.map(function (s) { return s.date; }).filter(Boolean).sort();
        var span = dates.length ? CA.daysBetween(dates[0], dates[dates.length - 1]) : null;
        var silence = dates.length ? CA.daysBetween(dates[dates.length - 1], CA.todayISO()) : null;
        if (silence !== null && silence < 0) silence = 0;
        return {
          total: total, withAmount: withAmount, pjCount: pjCount,
          missingPj: d.steps.length - pjCount, openQuestions: openQ,
          spanDays: span, silenceDays: silence
        };
      },
      quickParsed: function () {
        return CA.parseQuickLine(this.quickLine);
      }
    },

    watch: {
      db: {
        deep: true,
        handler: function () { this.scheduleSave(); }
      },
      theme: function (v) {
        document.documentElement.setAttribute('data-theme', v);
        var p = CA.loadPrefs(); p.theme = v; CA.savePrefs(p);
      }
    },

    created: function () {
      var db = CA.loadDb();
      if (!db.dossiers.length) {
        var d = CA.newDossier('Dossier de démonstration', 'DDE');
        d.meta.ref = 'Sinistre #2026-94810 / Contrat MRH-774201';
        d.meta.parties = 'M. Martin (assuré) / Syndic GestiCopro / Entreprise AquaFuite';
        d.meta.status = 'Attente de validation du devis de remise en état';
        d.meta.insurer = 'À compléter';
        if (d.steps[2]) { d.steps[2].amount = 285; d.steps[2].question = 'Confirmez-vous le remboursement des 285,00 € TTC avancés au titre de la recherche de fuite ?'; }
        if (d.steps[4]) { d.steps[4].amount = 1840; d.steps[4].category = 'BLOCAGE'; }
        db.dossiers = [d];
        db.activeId = d.id;
      }
      this.db = db;
      document.documentElement.setAttribute('data-theme', this.theme);
    },

    mounted: function () {
      document.addEventListener('keydown', this.onKey);
      document.addEventListener('click', this.onDocClick);
      window.addEventListener('beforeunload', this.flushSave);
    },

    unmounted: function () {
      document.removeEventListener('keydown', this.onKey);
      document.removeEventListener('click', this.onDocClick);
      window.removeEventListener('beforeunload', this.flushSave);
    },

    methods: {
      /* ---------- helpers de rendu ---------- */
      cat: function (c) { return CA.CATEGORIES[c] || CA.CATEGORIES.ADMIN; },
      fr: function (iso) { return CA.formatDateFR(iso); },
      money: function (v) { return CA.formatCurrency(v); },
      num: function (v) { return parseFloat(v) || 0; },
      pjName: function (s) { return CA.pjFilename(s); },
      relativeTime: function (iso) {
        var t = new Date(iso).getTime();
        if (isNaN(t)) return '—';
        var s = Math.round((Date.now() - t) / 1000);
        if (s < 60) return 'à l\'instant';
        if (s < 3600) return 'il y a ' + Math.round(s / 60) + ' min';
        if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
        return 'le ' + new Date(t).toLocaleDateString('fr-FR');
      },
      gapBefore: function (i) {
        if (i === 0) return null;
        var a = this.visibleSteps[i - 1], b = this.visibleSteps[i];
        if (!a || !b) return null;
        var g = CA.daysBetween(a.date, b.date);
        if (g === null) return null;
        g = Math.abs(g);
        return g >= 2 ? g : null;
      },

      /* ---------- persistance ---------- */
      scheduleSave: function () {
        this.saveState = 'dirty';
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(this.flushSave, 350);
      },
      flushSave: function () {
        if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
        var res = CA.saveDb(this.db);
        if (res.ok) { this.saveState = 'saved'; this.saveError = ''; }
        else {
          this.saveState = 'error';
          this.saveError = res.error;
          this.toast('Impossible d\'enregistrer : ' + res.error + ' — sauvegardez en .json', true);
        }
      },
      touch: function () {
        if (this.dossier) this.dossier.updatedAt = new Date().toISOString();
        this.scheduleSave();
      },
      snapshot: function () {
        try {
          this.undoStack.push(JSON.stringify({ activeId: this.db.activeId, dossiers: this.db.dossiers }));
          if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
          this.redoStack = [];
        } catch (e) { /* ignore */ }
      },
      applyState: function (json) {
        var parsed = JSON.parse(json);
        this.db.dossiers = parsed.dossiers.map(function (d) { return CA.sanitizeDossier(d); });
        this.db.activeId = parsed.activeId;
        this.scheduleSave();
      },
      undo: function () {
        if (!this.undoStack.length) return;
        var cur = JSON.stringify({ activeId: this.db.activeId, dossiers: this.db.dossiers });
        this.applyState(this.undoStack.pop());
        this.redoStack.push(cur);
        this.toast('Action annulée');
      },
      redo: function () {
        if (!this.redoStack.length) return;
        var cur = JSON.stringify({ activeId: this.db.activeId, dossiers: this.db.dossiers });
        this.applyState(this.redoStack.pop());
        this.undoStack.push(cur);
        this.toast('Action rétablie');
      },

      /* ---------- UI ---------- */
      toggleMenu: function (name) { this.menu = this.menu === name ? null : name; },
      onDocClick: function (e) {
        if (this.menu && !e.target.closest('.menu-wrap')) this.menu = null;
      },
      toggleTheme: function () { this.theme = this.theme === 'dark' ? 'light' : 'dark'; },
      printDoc: function () { this.menu = null; window.print(); },
      toast: function (msg, err) {
        var id = ++this.toastSeq;
        this.toasts.push({ id: id, msg: msg, err: !!err });
        var self = this;
        setTimeout(function () {
          self.toasts = self.toasts.filter(function (t) { return t.id !== id; });
        }, err ? 6000 : 2600);
      },
      copy: function (text, msg) {
        var self = this;
        var done = function () { self.toast(msg || 'Copié'); };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { self.copyFallback(text, done); });
        } else this.copyFallback(text, done);
      },
      copyFallback: function (text, done) {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); }
        catch (e) { this.toast('Copie impossible — sélectionnez le texte manuellement', true); }
        document.body.removeChild(ta);
      },
      ask: function (title, message, ok, action) {
        this.confirmBox = { title: title, message: message, ok: ok, action: action };
      },
      runConfirm: function () {
        var box = this.confirmBox;
        this.confirmBox = null;
        if (box && typeof box.action === 'function') box.action();
      },

      onKey: function (e) {
        var tag = (e.target.tagName || '').toLowerCase();
        var typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

        if (e.key === 'Escape') {
          if (this.confirmBox) this.confirmBox = null;
          else if (this.mailText !== null) this.mailText = null;
          else if (this.showHelp) this.showHelp = false;
          else if (this.showPresets) this.showPresets = false;
          else if (this.showNew) this.showNew = false;
          else if (this.editing) this.closeStep();
          else if (this.menu) this.menu = null;
          else if (typing) e.target.blur();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); this.exportDossier(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
          if (typing) return;
          e.preventDefault();
          if (e.shiftKey) this.redo(); else this.undo();
          return;
        }
        if (typing) return;
        if (e.key === 'n' || e.key === 'N') { e.preventDefault(); this.openStep(); }
        else if (e.key === '/') { e.preventDefault(); this.focusRef('capture'); }
        else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); this.focusRef('search'); }
        else if (e.key === '?') { e.preventDefault(); this.showHelp = true; }
      },
      focusRef: function (name) {
        var el = this.$refs[name];
        if (el && el.focus) el.focus();
      },

      /* ---------- dossiers ---------- */
      selectDossier: function (id) {
        this.db.activeId = id;
        this.menu = null;
        this.search = ''; this.filter = 'ALL'; this.onlyOpenQ = false; this.onlyNoPj = false;
        this.scheduleSave();
      },
      openNewDossier: function () {
        this.menu = null;
        this.newName = '';
        this.newType = 'DDE';
        this.showNew = true;
        var self = this;
        this.$nextTick(function () { self.focusRef('newNameField'); });
      },
      createDossier: function () {
        this.snapshot();
        var d = CA.newDossier(this.newName.trim() || 'Nouveau dossier', this.newType);
        this.db.dossiers.push(d);
        this.db.activeId = d.id;
        this.showNew = false;
        this.touch();
        this.toast('Dossier créé');
      },
      duplicateDossier: function () {
        if (!this.dossier) return;
        this.snapshot();
        var copy = CA.sanitizeDossier(JSON.parse(JSON.stringify(this.dossier)));
        copy.id = CA.uid('dos');
        copy.name = this.dossier.name + ' (copie)';
        copy.createdAt = copy.updatedAt = new Date().toISOString();
        copy.steps.forEach(function (s) { s.id = CA.uid('step'); });
        copy.globalQuestions.forEach(function (q) { q.id = CA.uid('gq'); });
        this.db.dossiers.push(copy);
        this.db.activeId = copy.id;
        this.menu = null;
        this.toast('Dossier dupliqué');
      },
      renameDossier: function () {
        if (!this.dossier) return;
        var name = window.prompt('Nom du dossier :', this.dossier.name);
        if (name === null) return;
        this.snapshot();
        this.dossier.name = name.trim() || this.dossier.name;
        this.menu = null;
        this.touch();
      },
      askDeleteDossier: function () {
        if (!this.dossier) return;
        var self = this;
        var name = this.dossier.name;
        this.menu = null;
        this.ask('Supprimer le dossier ?', '« ' + name + ' » et ses ' + this.dossier.steps.length + ' étapes seront retirés du stockage local. Action annulable avec Ctrl+Z.', 'Supprimer', function () {
          self.snapshot();
          var id = self.db.activeId;
          self.db.dossiers = self.db.dossiers.filter(function (d) { return d.id !== id; });
          if (!self.db.dossiers.length) {
            var d = CA.newDossier('Nouveau dossier', 'VIDE');
            self.db.dossiers.push(d);
          }
          self.db.activeId = self.db.dossiers[0].id;
          self.scheduleSave();
          self.toast('Dossier supprimé');
        });
      },

      /* ---------- étapes ---------- */
      openStep: function (id) {
        if (!this.dossier) return;
        var src = id ? this.dossier.steps.find(function (s) { return s.id === id; }) : null;
        if (src) {
          this.editing = JSON.parse(JSON.stringify(src));
          this.editingIsNew = false;
        } else {
          this.editing = CA.newStep();
          this.editingIsNew = true;
        }
        var self = this;
        this.$nextTick(function () { self.focusRef('factField'); });
      },
      closeStep: function () { this.editing = null; this.editingIsNew = false; },
      saveStep: function () {
        if (!this.editing) return;
        if (!this.editing.fact.trim()) { this.toast('Le fait constaté est obligatoire', true); return; }
        if (!this.editing.date) { this.toast('La date est obligatoire', true); return; }
        this.snapshot();
        var data = JSON.parse(JSON.stringify(this.editing));
        data.amount = parseFloat(data.amount) || 0;
        var idx = this.dossier.steps.findIndex(function (s) { return s.id === data.id; });
        if (idx >= 0) this.dossier.steps.splice(idx, 1, data);
        else this.dossier.steps.push(data);
        this.closeStep();
        this.touch();
        this.toast(idx >= 0 ? 'Étape mise à jour' : 'Étape ajoutée');
      },
      insertAfter: function (step) {
        this.openStep();
        var d = new Date(step.date + 'T00:00:00');
        if (!isNaN(d)) { d.setDate(d.getDate() + 1); this.editing.date = CA.isoOf(d); }
        this.editing.category = step.category;
      },
      duplicateStep: function (id) {
        var src = this.dossier.steps.find(function (s) { return s.id === id; });
        if (!src) return;
        this.snapshot();
        var copy = JSON.parse(JSON.stringify(src));
        copy.id = CA.uid('step');
        copy.pjCode = '';
        this.dossier.steps.push(copy);
        this.touch();
        this.toast('Étape dupliquée');
      },
      askDeleteStep: function (id) {
        var src = this.dossier.steps.find(function (s) { return s.id === id; });
        if (!src) return;
        var self = this;
        this.ask('Supprimer cette étape ?', (src.fact || '').slice(0, 140) + ((src.fact || '').length > 140 ? '…' : ''), 'Supprimer', function () {
          self.snapshot();
          self.dossier.steps = self.dossier.steps.filter(function (s) { return s.id !== id; });
          if (self.editing && self.editing.id === id) self.closeStep();
          self.touch();
          self.toast('Étape supprimée');
        });
      },
      addQuick: function () {
        var p = this.quickParsed;
        if (!p) { this.toast('Saisissez au moins la description du fait', true); return; }
        this.snapshot();
        var step = CA.newStep({
          date: p.date, time: p.time, category: p.category,
          fact: p.fact, actor: p.actor, amount: p.amount, pjName: p.pjName
        });
        if (p.pjName) step.pjCode = this.nextPjCode();
        this.dossier.steps.push(step);
        this.quickLine = '';
        this.touch();
        this.toast('Étape ajoutée le ' + CA.formatDateFR(step.date));
      },
      usePreset: function (p) {
        this.snapshot();
        var step = CA.newStep({
          category: p.category, fact: p.fact, actor: p.actor || '',
          impact: p.impact || '', pjName: p.pjName || '', question: p.question || ''
        });
        if (step.pjName) step.pjCode = this.nextPjCode();
        this.dossier.steps.push(step);
        this.showPresets = false;
        this.touch();
        this.editing = JSON.parse(JSON.stringify(step));
        this.editingIsNew = false;
        var self = this;
        this.$nextTick(function () { self.focusRef('factField'); });
      },
      nextPjCode: function () {
        var max = 0;
        this.dossier.steps.forEach(function (s) {
          var m = /(\d+)/.exec(s.pjCode || '');
          if (m) max = Math.max(max, parseInt(m[1], 10));
        });
        return 'PJ-' + String(max + 1).padStart(2, '0');
      },
      suggestPj: function () {
        if (!this.editing) return;
        this.editing.pjCode = this.nextPjCode();
      },
      renumberPj: function () {
        this.snapshot();
        var ordered = this.dossier.steps.slice().sort(function (a, b) {
          return (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''));
        });
        var n = 0;
        ordered.forEach(function (s) {
          if (s.pjCode || s.pjName) { n++; s.pjCode = 'PJ-' + String(n).padStart(2, '0'); }
        });
        this.touch();
        this.toast(n + ' pièce(s) renumérotée(s) dans l\'ordre chronologique');
      },
      copyBordereau: function () {
        if (!this.pjSteps.length) { this.toast('Aucune pièce à copier', true); return; }
        var lines = this.pjSteps.map(function (s) {
          return (s.pjCode || 'PJ') + ' — ' + (s.pjName || 'document') + ' (' + CA.formatDateFR(s.date) + ') — fichier : ' + CA.pjFilename(s);
        });
        this.copy(lines.join('\n'), 'Bordereau copié (' + lines.length + ' pièces)');
      },

      /* ---------- questions ---------- */
      openGlobalQuestion: function () {
        this.snapshot();
        this.dossier.globalQuestions.push({ id: CA.uid('gq'), text: '', status: 'PENDING', answer: '' });
        this.touch();
        this.toast('Question ajoutée — rédigez-la ci-dessous');
      },
      toggleQuestion: function (q) {
        this.snapshot();
        if (q.stepId) {
          var s = this.dossier.steps.find(function (x) { return x.id === q.stepId; });
          if (s) s.questionResolved = !s.questionResolved;
        } else {
          var g = this.dossier.globalQuestions.find(function (x) { return x.id === q.gqId; });
          if (g) g.status = g.status === 'RESOLVED' ? 'PENDING' : 'RESOLVED';
        }
        this.touch();
      },
      setQuestionAnswer: function (q, val) {
        if (q.stepId) {
          var s = this.dossier.steps.find(function (x) { return x.id === q.stepId; });
          if (s) s.questionAnswer = val;
        } else {
          var g = this.dossier.globalQuestions.find(function (x) { return x.id === q.gqId; });
          if (g) g.answer = val;
        }
        this.touch();
      },
      setQuestionText: function (q, val) {
        var g = this.dossier.globalQuestions.find(function (x) { return x.id === q.gqId; });
        if (g) g.text = val;
        this.touch();
      },
      deleteGlobalQuestion: function (id) {
        this.snapshot();
        this.dossier.globalQuestions = this.dossier.globalQuestions.filter(function (q) { return q.id !== id; });
        this.touch();
      },

      /* ---------- courrier ---------- */
      openMail: function (kind) {
        this.menu = null;
        this.mailKind = kind;
        this.mailText = CA.buildMail(this.dossier, { kind: kind });
      },
      downloadMail: function () {
        var base = CA.slugify(this.dossier.meta.ref || this.dossier.name);
        CA.download((this.mailKind === 'RELANCE' ? 'relance_' : 'synthese_') + base + '.txt', this.mailText, 'text/plain');
        this.toast('Courrier téléchargé');
      },

      /* ---------- fichiers ---------- */
      exportDossier: function () {
        if (!this.dossier) return;
        this.menu = null;
        var payload = { app: 'ChronoAssur', kind: 'dossier', version: 2, exportedAt: new Date().toISOString(), dossier: this.dossier };
        CA.download('chronoassur_' + CA.slugify(this.dossier.meta.ref || this.dossier.name) + '_' + CA.todayISO() + '.json',
          JSON.stringify(payload, null, 2), 'application/json');
        this.toast('Dossier sauvegardé sur votre ordinateur');
      },
      exportAll: function () {
        this.menu = null;
        var payload = { app: 'ChronoAssur', kind: 'base', version: 2, exportedAt: new Date().toISOString(), dossiers: this.db.dossiers };
        CA.download('chronoassur_sauvegarde-complete_' + CA.todayISO() + '.json', JSON.stringify(payload, null, 2), 'application/json');
        this.toast(this.db.dossiers.length + ' dossier(s) sauvegardé(s)');
      },
      exportCsv: function () {
        this.menu = null;
        CA.download('chronoassur_chronologie_' + CA.slugify(this.dossier.name) + '.csv', CA.dossierToCsv(this.dossier), 'text/csv');
        this.toast('Chronologie exportée en CSV');
      },
      pickFile: function (mode) {
        this.importMode = mode || 'merge';
        this.menu = null;
        if (this.$refs.fileInput) { this.$refs.fileInput.value = ''; this.$refs.fileInput.click(); }
      },
      onFilePicked: function (e) {
        var f = e.target.files && e.target.files[0];
        if (f) this.readFile(f);
      },
      onDrop: function (e) {
        this.dragging = false;
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        this.importMode = 'merge';
        this.readFile(f);
      },
      readFile: function (file) {
        var self = this;
        var reader = new FileReader();
        reader.onload = function (ev) {
          try { self.importPayload(JSON.parse(ev.target.result), file.name); }
          catch (err) { self.toast('Fichier illisible : JSON invalide', true); }
        };
        reader.onerror = function () { self.toast('Lecture du fichier impossible', true); };
        reader.readAsText(file);
      },
      importPayload: function (data, filename) {
        var incoming = [];
        if (data && Array.isArray(data.dossiers)) incoming = data.dossiers;
        else if (data && data.dossier) incoming = [data.dossier];
        else if (data && (Array.isArray(data.steps) || data.meta)) incoming = [data]; // export de l'ancienne version
        if (!incoming.length) { this.toast('Aucun dossier ChronoAssur trouvé dans ce fichier', true); return; }

        this.snapshot();
        var fallback = (filename || 'Dossier importé').replace(/\.json$/i, '');

        if (this.importMode === 'replace' && this.dossier) {
          var merged = CA.sanitizeDossier(incoming[0], fallback);
          merged.id = this.dossier.id;
          merged.name = this.dossier.name;
          merged.updatedAt = new Date().toISOString();
          var idx = this.db.dossiers.findIndex(function (d) { return d.id === merged.id; });
          this.db.dossiers.splice(idx, 1, merged);
          this.toast('Dossier courant remplacé par le contenu du fichier');
        } else {
          var self = this;
          var added = 0, lastId = null;
          incoming.forEach(function (raw) {
            var d = CA.sanitizeDossier(raw, fallback);
            if (CA.findDossier(self.db, d.id)) d.id = CA.uid('dos');
            d.updatedAt = new Date().toISOString();
            self.db.dossiers.push(d);
            lastId = d.id; added++;
          });
          if (lastId) this.db.activeId = lastId;
          this.toast(added + ' dossier(s) importé(s) dans la base locale');
        }
        this.scheduleSave();
      }
    }
  });

  app.mount('#app');
})();
