/* ================= المزامنة السحابية (Firebase) =================
   كل معمل بيتزامن على Firestore في كولكشن tayealab — مستند لكل معمل
   + مستند للموزّع (meta). آخر كتابة تكسب. شغال تلقائياً وحتى بدون نت بيشتغل محلي. */
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

  const CLOUD = {
    ok: false, db: null,
    labUnsub: null, metaUnsub: null,
    lastLabPush: null, lastMetaPush: null,
    lastLabApplied: null, lastMetaApplied: null,
    labTimer: null, metaTimer: null,
    pulling: false
  };
  window.CLOUD = CLOUD;

  window.cloudInit = function () {
    try {
      if (typeof firebase === 'undefined') return;
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      CLOUD.db = firebase.firestore();
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

  /* ---------- دفع بيانات (مع منع الحلقات) ---------- */
  function cloudPushLab() {
    if (!CLOUD.ok || !LABID || !DB) return;
    const payload = JSON.stringify(DB);
    if (payload === CLOUD.lastLabApplied) { updateSyncBadge('ok', '☁️ متزامن مع السحابة'); return; }
    updateSyncBadge('busy', '⏳ جاري المزامنة…');
    const at = new Date().toISOString();
    CLOUD.lastLabPush = at;
    CLOUD.lastLabApplied = payload;
    const req = CLOUD.db.collection('csl').doc(LABID).set({ dataJson: payload, updatedAt: at });
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000));
    Promise.race([req, timeout])
      .then(() => updateSyncBadge('ok', '☁️ متزامن مع السحابة'))
      .catch(e => { console.error('Cloud push error:', e); updateSyncBadge('err', '⚠️ تعذّر المزامنة — محفوظ محلياً'); });
  }

  function cloudPushMeta() {
    if (!CLOUD.ok || !META) return;
    const payload = JSON.stringify(META);
    if (payload === CLOUD.lastMetaApplied) return;
    const at = new Date().toISOString();
    CLOUD.lastMetaPush = at;
    CLOUD.lastMetaApplied = payload;
    CLOUD.db.collection('csl').doc('_meta').set({ dataJson: payload, updatedAt: at }).catch(e => console.error('Meta push:', e));
  }

  window.cloudSchedulePush = function () {
    if (!CLOUD.ok) return;
    clearTimeout(CLOUD.labTimer);
    CLOUD.labTimer = setTimeout(cloudPushLab, 800);
  };
  window.cloudScheduleMetaPush = function () {
    if (!CLOUD.ok) return;
    clearTimeout(CLOUD.metaTimer);
    CLOUD.metaTimer = setTimeout(cloudPushMeta, 800);
  };

  /* ---------- سحب بيانات عند فتح المعمل ---------- */
  window.cloudPullLab = function (labId, localUpdatedGuess) {
    if (!CLOUD.ok) return;
    CLOUD.db.collection('csl').doc(labId).get().then(snap => {
      if (!snap.exists) { cloudPushLab(); return; } // السحابة فاضية → ارفع المحلي
      const remote = snap.data();
      const remoteData = remote.dataJson ? JSON.parse(remote.dataJson) : remote.data;
      const localRaw = localStorage.getItem(labKey(labId));
      const local = localRaw ? JSON.parse(localRaw) : null;
      if (!local) {
        // مفيش محلي → نزّل من السحابة
        LABID = labId; DB = remoteData;
        localStorage.setItem(labKey(labId), JSON.stringify(DB));
        route();
      }
      // الاشتراك اللحظي
      subscribeLab(labId);
      updateSyncBadge('ok', '☁️ متصل بالسحابة');
    }).catch(e => { console.error('Cloud pull:', e); updateSyncBadge(); });
  };

  function subscribeLab(labId) {
    if (CLOUD.labUnsub) { CLOUD.labUnsub(); CLOUD.labUnsub = null; }
    try {
      CLOUD.labUnsub = CLOUD.db.collection('csl').doc(labId).onSnapshot(snap => {
        if (!snap.exists) return;
        const remote = snap.data();
        if (remote.updatedAt === CLOUD.lastLabPush) return; // كتابتنا احنا
        const remoteData = remote.dataJson ? JSON.parse(remote.dataJson) : remote.data;
        const localRaw = localStorage.getItem(labKey(labId));
        const local = localRaw ? JSON.parse(localRaw) : null;
        if (!local || JSON.stringify(local) !== JSON.stringify(remoteData)) {
          CLOUD.lastLabApplied = JSON.stringify(remoteData);
          DB = remoteData;
          localStorage.setItem(labKey(labId), JSON.stringify(DB));
          if (session() && session().labId === labId) {
            updateSyncBadge('ok', '☁️ اتحدّث من جهاز آخر');
            route(); // حدّث الشاشة بالبيانات الجديدة
          }
        }
      }, e => console.error('lab snapshot:', e));
    } catch (e) { console.error(e); }
  }

  window.cloudPullMeta = function () {
    if (!CLOUD.ok || !META) return;
    CLOUD.db.collection('csl').doc('_meta').get().then(snap => {
      if (!snap.exists) { cloudPushMeta(); return; }
      const remote = snap.data();
      if (remote.updatedAt === CLOUD.lastMetaPush) return;
      const remoteData = remote.dataJson ? JSON.parse(remote.dataJson) : remote.data;
      if (JSON.stringify(remoteData) !== JSON.stringify(META)) {
        CLOUD.lastMetaApplied = JSON.stringify(remoteData);
        META = remoteData;
        saveMeta();
        if (session() && session().type === 'super') route();
      }
      if (CLOUD.metaUnsub) CLOUD.metaUnsub();
      CLOUD.metaUnsub = CLOUD.db.collection('csl').doc('_meta').onSnapshot(s => {
        if (!s.exists) return;
        const r = s.data();
        if (r.updatedAt === CLOUD.lastMetaPush) return;
        const rData = r.dataJson ? JSON.parse(r.dataJson) : r.data;
        if (JSON.stringify(rData) !== JSON.stringify(META)) {
          CLOUD.lastMetaApplied = JSON.stringify(rData);
          META = rData; saveMeta();
          if (session() && session().type === 'super') route();
        }
      }, () => {});
    }).catch(e => console.error('meta pull:', e));
  };
})();
