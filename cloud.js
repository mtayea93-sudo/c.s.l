/* ============================================================
   CSL Cloud Sync — مزامنة Firebase Realtime (مشروع sakrlab2026)
   دخول مجهول (Anonymous) — من غير حسابات ولا كلمات مرور.
   الشغل محلي دايماً (أوفلاين)، وأي تعديل بيترفع تلقائياً،
   وكل الأجهزة بتتزامن لحظياً أول ما النت يوصل.
   ============================================================ */
(function () {
  const FB_CONFIG = {
    apiKey: "AIzaSyAPawpCwihRHOaPjMzhhcsSDa9WAy0Qx-Q",
    authDomain: "sakrlab2026.firebaseapp.com",
    databaseURL: "https://sakrlab2026-default-rtdb.firebaseio.com",
    projectId: "sakrlab2026",
    storageBucket: "sakrlab2026.firebasestorage.app",
    messagingSenderId: "1049726811378",
    appId: "1:1049726811378:web:0959efa43bad0f7e24e46b"
  };

  const CLOUD = {
    ok: true,               // هل Firebase متاح أصلاً (السكربتات اتحملت)
    ready: false,           // هل الدخول المجهول نجح والمستمعين شغالين
    authed: false,
    lastMetaPush: null,
    lastMetaApplied: null,
    lastLabApplied: null,
    metaErr: null,
    labErr: null,
    fb: null                // مرجع قاعدة البيانات بعد التهيئة
  };
  window.CLOUD = CLOUD;

  window.metaErrText = function (e) {
    if (!navigator.onLine) return 'مفيش نت على الجهاز ده — الشغل محفوظ محلياً وهيترفع أول ما النت يوصل';
    if (e && e.code === 'PERMISSION_DENIED') return 'مفيش صلاحية على السحابة — جرّب تسجل خروج ودخول تاني';
    return 'تعذّر الاتصال بالسحابة — هيحصل تلقائياً أول ما النت يستقر';
  };

  window.updateSyncBadge = function (forceStatus, forceText) {
    const el = document.getElementById('sync-badge');
    if (!el) return;
    if (!CLOUD.ok || !navigator.onLine) {
      el.textContent = '📴 أوفلاين — الشغل محلي وهيترفع لما النت يرجع';
      el.className = 'sync-badge off';
      return;
    }
    if (!CLOUD.ready) {
      if (CLOUD.gaveUp) {
        el.textContent = '📴 السحابة مش متاحة — الشغل محلي على الجهاز';
        el.className = 'sync-badge off';
        return;
      }
      el.textContent = '☁️ جاري الاتصال بالسحابة…';
      el.className = 'sync-badge busy';
      return;
    }
    if (forceStatus) {
      el.textContent = forceText;
      el.className = 'sync-badge ' + (forceStatus === 'ok' ? 'on' : forceStatus === 'busy' ? 'busy' : 'warn');
    } else {
      el.textContent = '☁️ متزامن مع السحابة';
      el.className = 'sync-badge on';
    }
  };

  /* ---------- تهيئة Firebase + دخول مجهول + مستمعين ---------- */
  window.cloudInit = function () {
    if (CLOUD._init) return;
    CLOUD._init = true;
    CLOUD.ok = (typeof firebase !== 'undefined') && !!firebase.database;
    window.addEventListener('online', onBackOnline);
    window.addEventListener('offline', () => updateSyncBadge());
    setInterval(() => { /* نبضة خفيفة — المستمعين بيعملوا المزامنة اللحظية */ }, 45000);
    updateSyncBadge();
    if (!CLOUD.ok) { updateSyncBadge(); return; }
    try { firebase.initializeApp(FB_CONFIG); } catch (e) {}
    CLOUD.fb = firebase.database();
    tryAuth(0);
  };

  /* دخول مجهول مع 3 محاولات — لو الشبكة مش بتوصل لجوجل نشتغل محلي بالكامل */
  function tryAuth(n) {
    firebase.auth().signInAnonymously().then(() => {
      CLOUD.authed = true; CLOUD.ready = true;
      startListeners();
    }).catch(e => {
      console.warn('cloud auth:', e && e.code);
      if (n >= 2) {
        try { CLOUD.fb.goOffline(); } catch (err) {}
        CLOUD.gaveUp = true;
        updateSyncBadge();
        return;
      }
      setTimeout(() => tryAuth(n + 1), 8000);
    });
  }

  function startListeners() {
    /* مستمع بيانات الموزّع — أي جهاز يعدّل بنتسمع فوراً */
    CLOUD.fb.ref('csl/meta').on('value', snap => {
      const doc = snap.val();
      if (!doc || typeof doc.v === 'undefined') {
        /* السحابة فاضية → ارفع المحلي */
        setTimeout(cloudPushMeta, 500);
        return;
      }
      CLOUD.metaErr = null;
      const payload = JSON.stringify(doc.v);
      if (payload === CLOUD.lastMetaApplied) { updateSyncBadge('ok', '☁️ متزامن مع السحابة'); return; }
      const changed = applyMetaRemote(doc.v);
      if (changed) {
        CLOUD.lastMetaApplied = JSON.stringify(META);
        try { saveMeta(); } catch (e) {}
        updateSyncBadge('ok', '☁️ اتزامن من السحابة');
        try { const s = session(); if (s && s.type === 'super') route(); } catch (e) {}
      } else {
        updateSyncBadge('ok', '☁️ متزامن مع السحابة');
      }
    }, err => {
      CLOUD.metaErr = metaErrText(err);
      updateSyncBadge('err', '⚠️ ' + CLOUD.metaErr);
    });

    /* مستمع معمل المستخدم الحالي (لو داخل بمعمل) */
    try {
      if (typeof LABID !== 'undefined' && LABID) attachLabListener(LABID);
    } catch (e) {}
    updateSyncBadge('busy', '☁️ جاري المزامنة…');
  }

  function attachLabListener(labId) {
    if (CLOUD._labListener === labId) return;
    if (CLOUD._labListener) { try { CLOUD.fb.ref('csl/labs/' + CLOUD._labListener).off(); } catch (e) {} }
    CLOUD._labListener = labId;
    CLOUD.fb.ref('csl/labs/' + labId).on('value', snap => {
      const doc = snap.val();
      if (!doc || typeof doc.v === 'undefined') {
        /* مفيش نسخة سحابية → ارفع المحلي (حماية لشغل جهاز قديم) */
        setTimeout(cloudPushLab, 500);
        return;
      }
      const payload = JSON.stringify(doc.v);
      if (payload === CLOUD.lastLabApplied) { updateSyncBadge('ok', '☁️ متزامن مع السحابة'); return; }
      const localAt = localStorage.getItem('csl_sync_' + labId);
      const localRaw = localStorage.getItem((typeof labKey === 'function') ? labKey(labId) : ('csl_v1_' + labId));
      if (!localAt && localRaw) {
        /* جهاز عليه شغل من قبل المزامنة: ارفع المحلي بدل ما تمسحه */
        cloudPushLab();
        return;
      }
      if (localAt && doc.at && doc.at <= localAt) return; /* المحلي أحدث — هيترفع لوحده */
      /* السحابة أحدث → طبّقها */
      try {
        DB = doc.v;
        localStorage.setItem((typeof labKey === 'function') ? labKey(labId) : ('csl_v1_' + labId), JSON.stringify(DB));
        localStorage.setItem('csl_sync_' + labId, doc.at);
        CLOUD.lastLabApplied = JSON.stringify(DB);
        updateSyncBadge('ok', '☁️ اتزامن من السحابة');
        try { if (typeof route === 'function') route(); } catch (e) {}
      } catch (e) {}
    }, err => {
      CLOUD.labErr = metaErrText(err);
      updateSyncBadge('err', '⚠️ ' + CLOUD.labErr);
    });
  }

  function onBackOnline() {
    updateSyncBadge('busy', '☁️ النت رجع — بنزامن…');
    try { if (typeof LABID !== 'undefined' && LABID) attachLabListener(LABID); } catch (e) {}
    try { cloudPushMeta(); } catch (e) {}
    try { cloudPushLab(); } catch (e) {}
  }

  /* ---------- دمج قايمة المعاملات (الاتحاد بالـ id، السحابة تكسب عند التعارض) ---------- */
  function applyMetaRemote(remoteData) {
    if (!remoteData || typeof remoteData !== 'object' || Array.isArray(remoteData)) return false;
    if (typeof META === 'undefined' || !META) { META = remoteData; return true; }
    const rLabs = Array.isArray(remoteData.labs) ? remoteData.labs : [];
    const lLabs = Array.isArray(META.labs) ? META.labs : [];
    const byId = {};
    lLabs.forEach(l => { byId[l.id] = l; });
    rLabs.forEach(l => { byId[l.id] = l; });
    const mergedLabs = Object.values(byId);
    const merged = Object.assign({}, remoteData, { labs: mergedLabs });
    let changed = false;
    if (JSON.stringify(merged) !== JSON.stringify(META)) { META = merged; changed = true; }
    if (mergedLabs.length > rLabs.length) {
      setTimeout(() => { try { cloudPushMeta(); } catch (e) {} }, 1200);
    }
    return changed;
  }

  /* ---------- دفع/سحب بيانات الموزّع ---------- */
  async function cloudPushMeta() {
    if (!CLOUD.ready || typeof META === 'undefined' || !META) return;
    const payload = JSON.stringify(META);
    if (payload === CLOUD.lastMetaApplied) return;
    updateSyncBadge('busy', '⏳ جاري رفع بيانات الموزّع…');
    const at = new Date().toISOString();
    try {
      await CLOUD.fb.ref('csl/meta').set({ v: META, at: at });
      CLOUD.lastMetaPush = at;
      CLOUD.lastMetaApplied = payload;
      CLOUD.metaErr = null;
      updateSyncBadge('ok', '☁️ متزامن مع السحابة');
    } catch (e) {
      CLOUD.metaErr = metaErrText(e);
      updateSyncBadge('err', '⚠️ هيتم الرفع أول ما النت يوصل');
    }
  }

  window.cloudPullMeta = function () {
    if (!CLOUD.ready || typeof META === 'undefined' || !META) return;
    /* المستمع شغال دائماً — دي بس بتطلب قراءة فورية */
    CLOUD.fb.ref('csl/meta').once('value').then(snap => {
      const doc = snap.val();
      if (!doc) { cloudPushMeta(); return; }
      if (doc.at === CLOUD.lastMetaPush) return;
      if (applyMetaRemote(doc.v)) {
        CLOUD.lastMetaApplied = JSON.stringify(META);
        try { saveMeta(); } catch (e) {}
      }
    }).catch(() => {});
  };

  window.cloudPullMetaAwait = function () {
    if (!CLOUD.ready) return Promise.reject(new Error('offline'));
    return CLOUD.fb.ref('csl/meta').once('value').then(snap => {
      const doc = snap.val();
      if (!doc) return cloudPushMeta();
      if (doc.at === CLOUD.lastMetaPush) return;
      if (applyMetaRemote(doc.v)) {
        CLOUD.lastMetaApplied = JSON.stringify(META);
        try { saveMeta(); } catch (e) {}
      }
    });
  };

  window.cloudScheduleMetaPush = function () {
    if (!CLOUD.ok) return;
    clearTimeout(CLOUD.metaTimer);
    CLOUD.metaTimer = setTimeout(cloudPushMeta, 800);
  };

  /* ---------- دفع/سحب بيانات المعمل (آخر تعديل يكسب بالتاريخ) ---------- */
  async function cloudPushLab() {
    if (!CLOUD.ready || typeof LABID === 'undefined' || !LABID || typeof DB === 'undefined' || !DB) return;
    const payload = JSON.stringify(DB);
    if (payload === CLOUD.lastLabApplied) { updateSyncBadge('ok', '☁️ متزامن مع السحابة'); return; }
    updateSyncBadge('busy', '⏳ جاري المزامنة…');
    const at = new Date().toISOString();
    try {
      await CLOUD.fb.ref('csl/labs/' + LABID).set({ v: DB, at: at });
      try { localStorage.setItem('csl_sync_' + LABID, at); } catch (e) {}
      CLOUD.lastLabApplied = payload;
      CLOUD.labErr = null;
      updateSyncBadge('ok', '☁️ متزامن مع السحابة');
      if (typeof window.__cloudPushed === 'function') window.__cloudPushed();
    } catch (e) {
      CLOUD.labErr = metaErrText(e);
      updateSyncBadge('err', '⚠️ هيتم الرفع أول ما النت يوصل');
    }
  }

  window.cloudPullLab = function (labId) {
    if (!CLOUD.ok) return;
    if (CLOUD.ready) attachLabListener(labId);
    CLOUD.fb.ref('csl/labs/' + labId).once('value').then(snap => {
      const doc = snap.val();
      if (!doc) { cloudPushLab(); return; }
      const localAt = localStorage.getItem('csl_sync_' + labId);
      if (localAt && doc.at && doc.at <= localAt) return;
      if (JSON.stringify(doc.v) === CLOUD.lastLabApplied) return;
      try {
        DB = doc.v;
        localStorage.setItem(labKey(labId), JSON.stringify(DB));
        localStorage.setItem('csl_sync_' + labId, doc.at);
        CLOUD.lastLabApplied = JSON.stringify(DB);
        updateSyncBadge('ok', '☁️ اتزامن من السحابة');
        try { route(); } catch (e) {}
      } catch (e) {}
    }).catch(() => {});
  };

  window.cloudSchedulePush = function () {
    if (!CLOUD.ok) return;
    clearTimeout(CLOUD.labTimer);
    CLOUD.labTimer = setTimeout(cloudPushLab, 800);
  };

  window.cloudSchedulePushLab = async function (labId, dbObj) {
    if (!CLOUD.ready) { updateSyncBadge('err', '⚠️ السحابة مش متاحة دلوقتي'); return; }
    const at = new Date().toISOString();
    try {
      await CLOUD.fb.ref('csl/labs/' + labId).set({ v: dbObj, at: at });
      localStorage.setItem('csl_sync_' + labId, at);
      CLOUD.lastLabApplied = JSON.stringify(dbObj);
      updateSyncBadge('ok', '☁️ متزامن مع السحابة');
    } catch (e) {
      updateSyncBadge('err', '⚠️ ' + metaErrText(e));
    }
  };

  window.cloudFetchLabUsers = function (labId) {
    if (!CLOUD.ready) return toast('⚠️ السحابة مش متاحة');
    toast('⏳ بجيب بيانات المعمل من السحابة…');
    CLOUD.fb.ref('csl/labs/' + labId).once('value').then(snap => {
      const doc = snap.val();
      if (!doc || typeof doc.v === 'undefined') return toast('⚠️ المعمل لسه مااتفتحش على أي جهاز — مفيش نسخة سحابية');
      localStorage.setItem(labKey(labId), JSON.stringify(doc.v));
      localStorage.setItem('csl_sync_' + labId, doc.at);
      renderDistUsers(labId, doc.v);
    }).catch(() => toast('⚠️ تعذّر السحب من السحابة'));
  };

  window.cloudStatusInfo = function () {
    const last = (typeof LABID !== 'undefined' && LABID) ? localStorage.getItem('csl_sync_' + LABID) : null;
    return { ok: CLOUD.ready && navigator.onLine, last: last };
  };

  window.cloudSignOut = function () { /* الدخول المجهول مفيهوش جلسات تتقفل */ };

  /* ---------- زرار حماية السحابة (دلوقتي حالاً) ---------- */
  window.cloudBackupNow = async function () {
    if (!navigator.onLine) return toast('⚠️ مفيش نت — البيانات محفوظة على الجهاز وهتترفع أول ما النت يوصل');
    if (!CLOUD.ready) return toast('⚠️ جاري الاتصال بالسحابة — استنى شوية وجرب تاني');
    updateSyncBadge('busy', '⏳ جاري رفع نسخة الحماية…');
    CLOUD.lastLabApplied = null;
    await cloudPushLab();
    if (typeof META !== 'undefined' && META) { CLOUD.lastMetaApplied = null; await cloudPushMeta(); }
  };

  window.cloudRestoreNow = function () {
    if (!navigator.onLine) return toast('⚠️ مفيش نت — السحابة مش متاحة دلوقتي');
    if (!CLOUD.ready) return toast('⚠️ جاري الاتصال بالسحابة — استنى شوية وجرب تاني');
    if (!confirm('استرجاع نسخة السحابة هيسحب آخر نسخة محفوظة ويستبدل بيها بيانات الجهاز ده. متأكد؟')) return;
    toast('⏳ بجيب نسخة الحماية من السحابة…');
    CLOUD.fb.ref('csl/labs/' + LABID).once('value').then(snap => {
      const doc = snap.val();
      if (!doc || typeof doc.v === 'undefined') return toast('⚠️ مفيش نسخة سحابية للمعمل ده لسه — ارفع نسخة الأول');
      DB = doc.v;
      localStorage.setItem(labKey(LABID), JSON.stringify(DB));
      localStorage.setItem('csl_sync_' + LABID, doc.at);
      CLOUD.lastLabApplied = JSON.stringify(DB);
      updateSyncBadge('ok', '☁️ اتحرّست النسخة');
      toast('✅ اتحرّست نسخة السحابة على الجهاز ده');
      route();
    }).catch(() => toast('⚠️ تعذّر السحب من السحابة'));
  };
})();
