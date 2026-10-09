/* ================= المزامنة السحابية (Firebase + Auth) =================
   كل معمل بيتزامن على Firestore في كولكشن csl — مستند لكل معمل + مستند _meta للموزّع.
   الأمان: كل جهاز لازم يعمل Firebase Auth بحساب خاص بمعمله (البريد مشتق من كود
   التفعيل) — Firestore Rules بترفض أي طلب من غير مصادقة أو لمعمل غيره.
   آخر كتابة تكسب. شغال تلقائياً وحتى بدون نت بيشتغل محلي. */
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAcLAL-3zzx4biBn97QqBiaWS4MU7Cf3E",
    authDomain: "lab-inventory-b2f6e.firebaseapp.com",
    databaseURL: "https://lab-inventory-b2f6e-default-rtdb.firebaseio.com",
    projectId: "lab-inventory-b2f6e",
    storageBucket: "lab-inventory-b2f6e.firebasestorage.app",
    messagingSenderId: "694689884198",
    appId: "1:694689884198:web:e8919388ce0041a8d11ee7",
    measurementId: "G-4TVTS8QKE2"
  };

  /* بريد المعرف الخاص بكيان (معمل/موزّع) — مشتق من id فقط، مفيش أسرار فيه */
  const mailFor = id => ('csl_' + id.replace(/[^a-z0-9]/gi, '_') + '@csl-app.web.app').toLowerCase();

  const CLOUD = {
    ok: false, db: null, auth: null,
    labUnsub: null, metaUnsub: null,
    lastLabPush: null, lastMetaPush: null,
    lastLabApplied: null, lastMetaApplied: null,
    labTimer: null, metaTimer: null,
    authLab: null,     // معمل آخر عملنا login لحسابه
    authSuper: false,
    authing: null,     // وعد المصادقة الجاري
    metaErr: null      // سبب آخر فشل في سحب بيانات الموزّع (عربي، يظهر عند الدخول بالكود)
  };
  window.CLOUD = CLOUD;

  window.cloudInit = function () {
    try {
      if (typeof firebase === 'undefined') return;
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      CLOUD.db = firebase.firestore();
      CLOUD.auth = firebase.auth();
      CLOUD.ok = true;
    } catch (e) { console.error('Cloud init error:', e); CLOUD.ok = false; }
    updateSyncBadge();
  };

  window.updateSyncBadge = function (forceStatus, forceText) {
    const el = document.getElementById('sync-badge');
    if (!el) return;
    if (!CLOUD.ok) { el.textContent = '📴 محلي فقط'; el.className = 'sync-badge off'; return; }
    if (forceStatus) { el.textContent = forceText; el.className = 'sync-badge ' + (forceStatus === 'ok' ? 'on' : 'warn'); }
  };

  /* ---------- مصادقة Firebase Auth ---------- */
  async function authAs(labId) {
    if (!CLOUD.ok || !CLOUD.auth) throw new Error('offline');
    if (CLOUD.authLab === labId && CLOUD.auth.currentUser) return CLOUD.auth.currentUser;
    const lab = (typeof META !== 'undefined' && META && META.labs) ? META.labs.find(l => l.id === labId) : null;
    const code = lab && lab.code;
    if (!code) throw new Error('no-code');
    const email = mailFor(labId);
    const trySign = () => CLOUD.auth.signInWithEmailAndPassword(email, code);
    try {
      await trySign();
    } catch (e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/invalid-login-credentials') {
        // أول مرة: أنشئ حساب المعمل بالكود ككلمة سر
        try {
          await CLOUD.auth.createUserWithEmailAndPassword(email, code);
        } catch (e2) {
          if (e2.code === 'auth/email-already-in-use') {
            /* الحساب موجود بالفعل بس الباسورد مش متطابق (حساب قديم من نسخة سابقة) —
               جرّب الصيغ القديمة المحتملة، ولو وحدة نجحت حدّث الباسورد للكود الحالي */
            const legacy = [code.replace(/-/g, ''), 'csl-' + code, 'csl' + code.replace(/-/g, ''), code.toUpperCase(), code.toLowerCase()];
            let fixed = false;
            for (const lp of legacy) {
              try {
                await CLOUD.auth.signInWithEmailAndPassword(email, lp);
                await CLOUD.auth.currentUser.updatePassword(code);
                fixed = true; break;
              } catch (e3) { /* جرّب اللي بعدها */ }
            }
            if (!fixed) throw new Error('auth-stale-password');
          }
          else if (e2.code === 'auth/operation-not-allowed') throw new Error('auth-provider-disabled');
          else throw e2;
        }
      } else if (e.code === 'auth/wrong-password') {
        throw new Error('auth-stale-password');
      } else if (e.code === 'auth/operation-not-allowed') {
        throw new Error('auth-provider-disabled');
      } else if (e.code === 'auth/too-many-requests') {
        await new Promise(r => setTimeout(r, 4000));
        await trySign();
      } else throw e;
    }
    CLOUD.authLab = labId; CLOUD.authSuper = false;
    return CLOUD.auth.currentUser;
  }

  async function authSuper() {
    if (!CLOUD.ok || !CLOUD.auth) throw new Error('offline');
    if (CLOUD.authSuper && CLOUD.auth.currentUser) return CLOUD.auth.currentUser;
    const su = (typeof META !== 'undefined' && META && META.superUser) || { user: 'mt', pass: 'mhmd@1993' };
    const email = mailFor('super_' + su.user);
    const LEGACY = ['mozo']; /* باسوردات قديمة — الدخول بيها بيحدّث حساب Firebase Auth للجديد تلقائياً */
    const signIn = p => CLOUD.auth.signInWithEmailAndPassword(email, p);
    const create = p => CLOUD.auth.createUserWithEmailAndPassword(email, p);
    let ok = false;
    for (const p of [su.pass, ...LEGACY]) {
      try { await signIn(p); ok = true; if (p !== su.pass) { try { await CLOUD.auth.currentUser.updatePassword(su.pass); } catch (e) {} } break; }
      catch (e) {
        if (e.code === 'auth/network-request-failed') throw new Error('offline');
        if (e.code === 'auth/operation-not-allowed') throw new Error('auth-provider-disabled');
        if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential' || e.code === 'auth/invalid-login-credentials') {
          try { await create(p); ok = true; break; } catch (e2) { /* email-in-use → جرّب اللي بعده */ }
        }
        /* wrong-password → جرّب اللي بعده */
      }
    }
    if (!ok) throw new Error('auth-failed');
    CLOUD.authSuper = true; CLOUD.authLab = null;
    return CLOUD.auth.currentUser;
  }

  /* قارئ _meta فقط: لو حساب الموزّع متسجل بباسورد قديمة (غير متطابقة) أي جهاز جديد يقدر يعمل
     حساب قارئ مؤقت بصيغة csl_super_r* — القواعد تسمح لأي csl_super_* بقراءة _meta.
     بيتعمل مرة واحدة لكل جهاز وبتتحفظ بياناته عليه. */
  function authSuperReader() {
    if (!CLOUD.ok || !CLOUD.auth) throw new Error('offline');
    let cred = null;
    try { cred = JSON.parse(localStorage.getItem('csl_super_reader') || 'null'); } catch (e) {}
    if (!cred) {
      cred = {
        email: 'csl_super_r' + Math.random().toString(36).slice(2, 12) + '@csl-app.web.app',
        pass: Math.random().toString(36).slice(2, 16) + 'A1!'
      };
    }
    const fail = e => {
      if (e.code === 'auth/network-request-failed') throw new Error('offline');
      if (e.code === 'auth/operation-not-allowed') throw new Error('auth-provider-disabled');
      throw new Error('auth-failed');
    };
    const save = () => {
      try { localStorage.setItem('csl_super_reader', JSON.stringify(cred)); } catch (e) {}
      CLOUD.authSuper = true; CLOUD.authLab = null;
      return CLOUD.auth.currentUser;
    };
    return CLOUD.auth.signInWithEmailAndPassword(cred.email, cred.pass)
      .then(save)
      .catch(() => CLOUD.auth.createUserWithEmailAndPassword(cred.email, cred.pass).then(save).catch(fail));
  }
  window.authSuperReader = authSuperReader;

  /* دمج بيانات الموزّع القادمة من السحابة: القايمتين بيدمجوا مع بعض —
     معاملات الجهاز متمسحش، والنسخة الأحدث من نفس المعمل هي اللي تكسب */
  function applyMetaRemote(remoteData) {
    if (!META) { META = remoteData; try { saveMeta(); } catch (e) {} return true; }
    const rLabs = Array.isArray(remoteData && remoteData.labs) ? remoteData.labs : [];
    const lLabs = Array.isArray(META.labs) ? META.labs : [];
    let changed = false;
    const byId = {};
    lLabs.forEach(l => { byId[l.id] = l; });
    rLabs.forEach(l => { byId[l.id] = l; }); /* نسخة السحابة تكسب عند التعارض */
    const mergedLabs = Object.values(byId);
    const merged = Object.assign({}, remoteData, { labs: mergedLabs });
    if (JSON.stringify(merged) !== JSON.stringify(META)) { META = merged; changed = true; }
    if (mergedLabs.length > rLabs.length) {
      /* في معاملات محلية مش على السحابة: ارفع القايمة المدموجة */
      setTimeout(() => { try { cloudPushMeta(); } catch (e) {} }, 1500);
    }
    if (changed) {
      CLOUD.lastMetaApplied = JSON.stringify(META);
      try { saveMeta(); } catch (e) {}
    }
    return changed;
  }

  /* ---------- دفع بيانات (مع منع الحلقات) ---------- */
  async function cloudPushLab() {
    if (!CLOUD.ok || !LABID || !DB) return;
    const payload = JSON.stringify(DB);
    if (payload === CLOUD.lastLabApplied) { updateSyncBadge('ok', '☁️ متزامن مع السحابة'); return; }
    updateSyncBadge('busy', '⏳ جاري المزامنة…');
    const at = new Date().toISOString();
    try {
      await authAs(LABID);
      CLOUD.lastLabPush = at;
      CLOUD.lastLabApplied = payload;
      const req = CLOUD.db.collection('csl').doc(LABID).set({ dataJson: payload, updatedAt: at });
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000));
      await Promise.race([req, timeout]);
      try { localStorage.setItem('csl_sync_' + LABID, at); } catch (e) {}
      updateSyncBadge('ok', '☁️ متزامن مع السحابة');
      if (typeof window.__cloudPushed === 'function') window.__cloudPushed();
    } catch (e) {
      console.error('Cloud push error:', e);
      if (e.message === 'auth-provider-disabled')
        updateSyncBadge('err', '🚫 فعّل «البريد/كلمة السر» من Firebase Console ← Authentication ← Sign-in method');
      else if (e.message === 'auth-stale-password')
        updateSyncBadge('err', '⚠️ حساب المزامنة قديم: Firebase ← Authentication ← Users ← امسح ' + mailFor(LABID));
      else if (e.code === 'permission-denied')
        updateSyncBadge('err', '🚫 انشر ملف firestore.rules في Firebase Console ← Firestore ← Rules');
      else if (e.code && e.code.indexOf('auth/') === 0 && e.code !== 'auth/network-request-failed')
        updateSyncBadge('err', '⚠️ رُفضت المزامنة — صلاحية غير كافية');
      else
        updateSyncBadge('err', '⚠️ تعذّر المزامنة — محفوظ محلياً');
    }
  }

  async function cloudPushMeta() {
    if (!CLOUD.ok || !META) return;
    const payload = JSON.stringify(META);
    if (payload === CLOUD.lastMetaApplied) return;
    const at = new Date().toISOString();
    try {
      try { await authSuper(); }
      catch (e) { if (e.message !== 'auth-failed') throw e; await authSuperReader(); }
      CLOUD.lastMetaPush = at;
      CLOUD.lastMetaApplied = payload;
      await CLOUD.db.collection('csl').doc('_meta').set({ dataJson: payload, updatedAt: at });
      updateSyncBadge('ok', '☁️ متزامن مع السحابة');
    } catch (e) { console.error('Meta push:', e); updateSyncBadge('err', '⚠️ المزامنة فشلت — محفوظ محلياً'); }
  }

  window.cloudSchedulePush = function () {
    if (!CLOUD.ok) return;
    clearTimeout(CLOUD.labTimer);
    CLOUD.labTimer = setTimeout(cloudPushLab, 800);
  };
  /* دفع بيانات معمل محدد (من لوحة الموزّع — مثلاً بعد ريسيت كلمة سر) */
  window.cloudSchedulePushLab = async function (labId, dbObj) {
    if (!CLOUD.ok) return;
    const payload = JSON.stringify(dbObj);
    const at = new Date().toISOString();
    try {
      await authAs(labId);
      await CLOUD.db.collection('csl').doc(labId).set({ dataJson: payload, updatedAt: at });
    } catch (e) { console.error('push lab:', e); }
  };
  /* سحب مستخدمي معمل من السحابة لو مش موجودين محلياً */
  window.cloudFetchLabUsers = function (labId) {
    if (!CLOUD.ok) return toast('⚠️ السحابة مش متاحة');
    toast('⏳ بجيب بيانات المعمل من السحابة…');
    authAs(labId).then(() => CLOUD.db.collection('csl').doc(labId).get()).then(snap => {
      if (!snap.exists) return toast('⚠️ المعمل لسه مااتفتحش على أي جهاز — مفيش نسخة سحابية');
      const remote = snap.data();
      const db = remote.dataJson ? JSON.parse(remote.dataJson) : remote.data;
      localStorage.setItem(labKey(labId), JSON.stringify(db));
      renderDistUsers(labId, db);
    }).catch(e => { console.error(e); toast('⚠️ تعذّر السحب من السحابة'); });
  };

  window.cloudScheduleMetaPush = function () {
    if (!CLOUD.ok) return;
    clearTimeout(CLOUD.metaTimer);
    CLOUD.metaTimer = setTimeout(cloudPushMeta, 800);
  };

  /* ---------- سحب بيانات عند فتح المعمل ---------- */
  window.cloudPullLab = function (labId, localUpdatedGuess) {
    if (!CLOUD.ok) return;
    authAs(labId).then(() => CLOUD.db.collection('csl').doc(labId).get()).then(snap => {
      if (!snap.exists) { cloudPushLab(); return; } // السحابة فاضية → ارفع المحلي
      const remote = snap.data();
      const remoteData = remote.dataJson ? JSON.parse(remote.dataJson) : remote.data;
      const localRaw = localStorage.getItem(labKey(labId));
      const local = localRaw ? JSON.parse(localRaw) : null;
      if (!local) {
        LABID = labId; DB = remoteData;
        localStorage.setItem(labKey(labId), JSON.stringify(DB));
        route();
      }
      subscribeLab(labId);
      updateSyncBadge('ok', '☁️ متصل بالسحابة');
    }).catch(e => {
      console.error('Cloud pull:', e);
      updateSyncBadge();
    });
  };

  function subscribeLab(labId) {
    if (CLOUD.labUnsub) { CLOUD.labUnsub(); CLOUD.labUnsub = null; }
    try {
      CLOUD.labUnsub = CLOUD.db.collection('csl').doc(labId).onSnapshot(snap => {
        if (!snap.exists) return;
        const remote = snap.data();
        if (remote.updatedAt === CLOUD.lastLabPush) return;
        const remoteData = remote.dataJson ? JSON.parse(remote.dataJson) : remote.data;
        const localRaw = localStorage.getItem(labKey(labId));
        const local = localRaw ? JSON.parse(localRaw) : null;
        if (!local || JSON.stringify(local) !== JSON.stringify(remoteData)) {
          CLOUD.lastLabApplied = JSON.stringify(remoteData);
          DB = remoteData;
          localStorage.setItem(labKey(labId), JSON.stringify(DB));
          if (session() && session().labId === labId) {
            updateSyncBadge('ok', '☁️ اتحدّث من جهاز آخر');
            route();
          }
        }
      }, e => console.error('lab snapshot:', e));
    } catch (e) { console.error(e); }
  }

  /* ---------- زرار حماية السحابة (دلوقتي حالاً) ---------- */
  window.cloudBackupNow = async function () {
    if (!CLOUD.ok) return toast('⚠️ مفيش نت — السحابة مش متاحة دلوقتي (البيانات محفوظة على الجهاز)');
    updateSyncBadge('busy', '⏳ جاري رفع نسخة الحماية…');
    CLOUD.lastLabApplied = null;
    await cloudPushLab();
    if (typeof META !== 'undefined' && META) { CLOUD.lastMetaApplied = null; await cloudPushMeta(); }
  };

  window.cloudRestoreNow = function () {
    if (!CLOUD.ok) return toast('⚠️ مفيش نت — السحابة مش متاحة دلوقتي');
    if (!confirm('استرجاع نسخة السحابة هيسحب آخر نسخة محفوظة ويستبدل بيها بيانات الجهاز ده. متأكد؟')) return;
    toast('⏳ بجيب نسخة الحماية من السحابة…');
    authAs(LABID).then(() => CLOUD.db.collection('csl').doc(LABID).get()).then(snap => {
      if (!snap.exists) return toast('⚠️ مفيش نسخة سحابية للمعمل ده لسه — ارفع نسخة الأول');
      const remote = snap.data();
      DB = remote.dataJson ? JSON.parse(remote.dataJson) : remote.data;
      localStorage.setItem(labKey(LABID), JSON.stringify(DB));
      updateSyncBadge('ok', '☁️ اتحرّست النسخة');
      toast('✅ اتحرّست نسخة السحابة على الجهاز ده');
      route();
    }).catch(e => { console.error(e); toast('⚠️ تعذّر السحب من السحابة'); });
  };

  window.cloudStatusInfo = function () {
    return {
      ok: CLOUD.ok && !!(CLOUD.auth && CLOUD.auth.currentUser),
      last: LABID ? localStorage.getItem('csl_sync_' + LABID) : null
    };
  };

  function metaErrText(e) {
    if (!e) return 'تعذّر الاتصال بالسحابة';
    if (e.message === 'auth-provider-disabled') return 'فعّل «البريد الإلكتروني/كلمة السر» من Firebase Console ← Authentication ← Sign-in method';
    if (e.message === 'auth-failed') return 'مشكلة في حسابات Firebase — امسح كل المستخدمين من Authentication ← Users وفعّل Email/Password وحاول تاني';
    if (e.code === 'permission-denied') return 'انشر ملف firestore.rules من الريبو في Firebase Console ← Firestore ← Rules ← Publish';
    if (e.code === 'auth/network-request-failed' || (e.message && e.message.indexOf('network') >= 0) || e.message === 'offline') return 'مفيش نت على الجهاز ده';
    return 'تعذّر سحب بيانات الموزّع من السحابة';
  }
  window.metaErrText = metaErrText;

  /* سحب واحد بـ promise — بيرمي الخطأ لو فشل */
  window.cloudPullMetaAwait = function () {
    if (!CLOUD.ok || !META) return Promise.reject(new Error('offline'));
    const pull = fn => fn().then(() => CLOUD.db.collection('csl').doc('_meta').get());
    /* القارئ المؤقت هو الأساس: شغال حتى لو حساب الموزّع متسجل بباسورد قديمة */
    return pull(authSuperReader)
      .catch(e => {
        if (e.message !== 'auth-failed') throw e;
        return pull(authSuper);
      })
      .then(snap => {
        CLOUD.metaErr = null;
        updateSyncBadge('ok', '☁️ متزامن مع السحابة');
        if (!snap.exists) { try { Promise.resolve(cloudPushMeta()).catch(() => {}); } catch (e) {} return; }
        const remote = snap.data();
        if (remote.updatedAt === CLOUD.lastMetaPush) return;
        const remoteData = remote.dataJson ? JSON.parse(remote.dataJson) : remote.data;
        if (applyMetaRemote(remoteData) && session() && session().type === 'super') route();
      })
      .catch(e => { CLOUD.metaErr = metaErrText(e); throw e; });
  };

  window.cloudPullMeta = function () {
    if (!CLOUD.ok || !META) return;
    authSuper().then(() => CLOUD.db.collection('csl').doc('_meta').get()).then(snap => {
      if (!snap.exists) { cloudPushMeta(); return; }
      const remote = snap.data();
      if (remote.updatedAt === CLOUD.lastMetaPush) return;
      const remoteData = remote.dataJson ? JSON.parse(remote.dataJson) : remote.data;
      if (applyMetaRemote(remoteData) && session() && session().type === 'super') route();
      if (CLOUD.metaUnsub) CLOUD.metaUnsub();
      CLOUD.metaUnsub = CLOUD.db.collection('csl').doc('_meta').onSnapshot(s => {
        if (!s.exists) return;
        const r = s.data();
        if (r.updatedAt === CLOUD.lastMetaPush) return;
        const rData = r.dataJson ? JSON.parse(r.dataJson) : r.data;
        if (applyMetaRemote(rData) && session() && session().type === 'super') route();
      }, () => {});
    }).catch(e => { CLOUD.metaErr = metaErrText(e); console.error('meta pull:', e); updateSyncBadge('err', '⚠️ ' + CLOUD.metaErr); });
  };

  /* خروج المصادقة السحابية عند تسجيل الخروج من النظام */
  window.cloudSignOut = function () {
    CLOUD.authLab = null; CLOUD.authSuper = false;
    if (CLOUD.labUnsub) { CLOUD.labUnsub(); CLOUD.labUnsub = null; }
    if (CLOUD.metaUnsub) { CLOUD.metaUnsub(); CLOUD.metaUnsub = null; }
    if (CLOUD.auth) CLOUD.auth.signOut().catch(() => {});
  };
})();
