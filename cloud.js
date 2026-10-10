/* ============================================================
   CSL Cloud Sync — السحابة الخاصة (Cloudflare Worker)
   مفيش حسابات ولا Authentication: مفتاح سري واحد + HTTP بسيط.
   الشغل محلي دايماً (أوفلاين)، وأي تعديل بيترفع تلقائياً،
   وأول ما النت يرجع بنزامن كل حاجة.
   ============================================================ */
(function () {
  const SYNC_URL = 'https://csl-sync.m-tayea93.workers.dev';
  const SYNC_KEY = 'csl-sync-9f31kx7qv2mhmd93';

  const CLOUD = {
    ok: true,
    lastMetaPush: null,     // آخر updatedAt اترفع من الجهاز ده
    lastMetaApplied: null,  // آخر payload اتطبق (منع الحلقات)
    lastLabApplied: null,
    metaErr: null
  };
  window.CLOUD = CLOUD;

  /* ---------- نقل HTTP بسيط ---------- */
  function req(path, method, body) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 25000);
    return fetch(SYNC_URL + path + '?key=' + SYNC_KEY, {
      method: method || 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body || undefined,
      signal: ctl.signal
    }).then(r => {
      clearTimeout(t);
      if (!r.ok) throw new Error('http-' + r.status);
      return r.json();
    }).catch(e => {
      clearTimeout(t);
      throw new Error('offline');
    });
  }

  window.metaErrText = function (e) {
    if (!e || e.message === 'offline') return 'مفيش نت على الجهاز ده — الشغل محفوظ محلياً وهيترفع أول ما النت يوصل';
    return 'تعذّر الاتصال بالسحابة — هيتم التلقائي أول ما النت يستقر';
  };

  window.updateSyncBadge = function (forceStatus, forceText) {
    const el = document.getElementById('sync-badge');
    if (!el) return;
    if (!CLOUD.ok || !navigator.onLine) {
      el.textContent = '📴 أوفلاين — الشغل محلي وهيترفع لما النت يرجع';
      el.className = 'sync-badge off';
      return;
    }
    if (forceStatus) {
      el.textContent = forceText;
      el.className = 'sync-badge ' + (forceStatus === 'ok' ? 'on' : 'warn');
    }
  };

  window.cloudInit = function () {
    CLOUD.ok = true;
    window.addEventListener('online', onBackOnline);
    window.addEventListener('offline', () => updateSyncBadge());
    setInterval(pollTick, 45000);
    updateSyncBadge('busy', '☁️ جاري الاتصال بالسحابة…');
  };

  function onBackOnline() {
    updateSyncBadge('busy', '☁️ النت رجع — بنزامن…');
    cloudPullMeta();
    try { if (typeof LABID !== 'undefined' && LABID) cloudPullLab(LABID); } catch (e) {}
    try { cloudPushMeta(); } catch (e) {}
  }

  function pollTick() {
    if (!navigator.onLine) return;
    try {
      const s = (typeof session === 'function') ? session() : null;
      if (s && s.type === 'super') pullMeta(true);
      if (typeof LABID !== 'undefined' && LABID) pullLab(LABID, true);
    } catch (e) {}
  }

  /* ---------- دمج قايمة المعاملات (الاتحاد بالـ id، السحابة تكسب عند التعارض) ---------- */
  function applyMetaRemote(remoteData) {
    if (!remoteData || typeof remoteData !== 'object' || Array.isArray(remoteData)) return false;
    if (typeof META === 'undefined' || !META) { META = remoteData; try { saveMeta(); } catch (e) {} return true; }
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
      /* في معاملات محلية مش على السحابة: ارفع القايمة المدموجة */
      setTimeout(() => { try { cloudPushMeta(); } catch (e) {} }, 1200);
    }
    if (changed) {
      CLOUD.lastMetaApplied = JSON.stringify(META);
      try { saveMeta(); } catch (e) {}
    }
    return changed;
  }

  /* ---------- دفع/سحب بيانات الموزّع ---------- */
  async function cloudPushMeta() {
    if (!CLOUD.ok || typeof META === 'undefined' || !META) return;
    const payload = JSON.stringify(META);
    if (payload === CLOUD.lastMetaApplied) return;
    const at = new Date().toISOString();
    try {
      await req('/meta', 'PUT', JSON.stringify({ v: META, at: at }));
      CLOUD.lastMetaPush = at;
      CLOUD.lastMetaApplied = payload;
      CLOUD.metaErr = null;
      updateSyncBadge('ok', '☁️ متزامن مع السحابة');
    } catch (e) {
      CLOUD.metaErr = metaErrText(e);
      updateSyncBadge('err', '⚠️ هيتم الرفع أول ما النت يوصل');
    }
  }

  function pullMeta(silent) {
    return req('/meta').then(doc => {
      if (!doc || doc.found === false) {
        /* السحابة فاضية → ارفع المحلي */
        return cloudPushMeta();
      }
      CLOUD.metaErr = null;
      if (!silent) updateSyncBadge('ok', '☁️ متزامن مع السحابة');
      if (doc.at === CLOUD.lastMetaPush) return;
      const changed = applyMetaRemote(doc.v);
      if (changed && !silent && typeof session === 'function' && session() && session().type === 'super') route();
    }).catch(e => {
      CLOUD.metaErr = metaErrText(e);
      if (!silent) updateSyncBadge('err', '⚠️ ' + CLOUD.metaErr);
      throw e;
    });
  }

  window.cloudPullMeta = function () {
    if (!CLOUD.ok || typeof META === 'undefined' || !META) return;
    pullMeta(false).catch(() => {});
  };

  window.cloudPullMetaAwait = function () {
    if (!CLOUD.ok || typeof META === 'undefined' || !META) return Promise.reject(new Error('offline'));
    return pullMeta(false);
  };

  window.cloudScheduleMetaPush = function () {
    if (!CLOUD.ok) return;
    clearTimeout(CLOUD.metaTimer);
    CLOUD.metaTimer = setTimeout(cloudPushMeta, 800);
  };

  /* ---------- دفع/سحب بيانات المعمل (آخر تعديل يكسب بالتاريخ) ---------- */
  async function cloudPushLab() {
    if (!CLOUD.ok || typeof LABID === 'undefined' || !LABID || typeof DB === 'undefined' || !DB) return;
    const payload = JSON.stringify(DB);
    if (payload === CLOUD.lastLabApplied) { updateSyncBadge('ok', '☁️ متزامن مع السحابة'); return; }
    updateSyncBadge('busy', '⏳ جاري المزامنة…');
    const at = new Date().toISOString();
    try {
      await req('/lab/' + LABID, 'PUT', JSON.stringify({ v: DB, at: at }));
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

  function pullLab(labId, silent) {
    return req('/lab/' + labId).then(doc => {
      if (!doc || doc.found === false) { cloudPushLab(); return; }
      const localAt = localStorage.getItem('csl_sync_' + labId);
      const localRaw = localStorage.getItem(labKey(labId));
      if (!localAt && localRaw) {
        /* جهاز عليه شغل من قبل النظام الجديد: ارفع المحلي بدل ما تمسحه */
        cloudPushLab();
        return;
      }
      if (localAt && doc.at <= localAt) return; /* المحلي أحدث — هيترفع لوحده */
      /* السحابة أحدث → طبقها */
      DB = doc.v;
      localStorage.setItem(labKey(labId), JSON.stringify(DB));
      localStorage.setItem('csl_sync_' + labId, doc.at);
      CLOUD.lastLabApplied = JSON.stringify(DB);
      if (!silent) updateSyncBadge('ok', '☁️ اتزامن من السحابة');
      if (!silent && typeof route === 'function') route();
    }).catch(e => {
      if (!silent) updateSyncBadge('err', '⚠️ ' + metaErrText(e));
    });
  }

  window.cloudPullLab = function (labId) {
    if (!CLOUD.ok) return;
    pullLab(labId, false);
  };

  window.cloudSchedulePush = function () {
    if (!CLOUD.ok) return;
    clearTimeout(CLOUD.labTimer);
    CLOUD.labTimer = setTimeout(cloudPushLab, 800);
  };

  window.cloudSchedulePushLab = async function (labId, dbObj) {
    if (!CLOUD.ok) return;
    const at = new Date().toISOString();
    try {
      await req('/lab/' + labId, 'PUT', JSON.stringify({ v: dbObj, at: at }));
      localStorage.setItem('csl_sync_' + labId, at);
      updateSyncBadge('ok', '☁️ متزامن مع السحابة');
    } catch (e) {
      updateSyncBadge('err', '⚠️ ' + metaErrText(e));
    }
  };

  window.cloudFetchLabUsers = function (labId) {
    if (!CLOUD.ok) return toast('⚠️ السحابة مش متاحة');
    toast('⏳ بجيب بيانات المعمل من السحابة…');
    req('/lab/' + labId).then(doc => {
      if (!doc || doc.found === false) return toast('⚠️ المعمل لسه مااتفتحش على أي جهاز — مفيش نسخة سحابية');
      localStorage.setItem(labKey(labId), JSON.stringify(doc.v));
      localStorage.setItem('csl_sync_' + labId, doc.at);
      renderDistUsers(labId, doc.v);
    }).catch(() => toast('⚠️ تعذّر السحب من السحابة'));
  };

  window.cloudStatusInfo = function () {
    const last = (typeof LABID !== 'undefined' && LABID) ? localStorage.getItem('csl_sync_' + LABID) : null;
    return { ok: CLOUD.ok && navigator.onLine, last: last };
  };

  window.cloudSignOut = function () { /* مفيش جلسات تتقفل — السحابة بتشتغل من غير دخول */ };

  /* ---------- زرار حماية السحابة (دلوقتي حالاً) ---------- */
  window.cloudBackupNow = async function () {
    if (!navigator.onLine) return toast('⚠️ مفيش نت — البيانات محفوظة على الجهاز وهتترفع أول ما النت يوصل');
    updateSyncBadge('busy', '⏳ جاري رفع نسخة الحماية…');
    CLOUD.lastLabApplied = null;
    await cloudPushLab();
    if (typeof META !== 'undefined' && META) { CLOUD.lastMetaApplied = null; await cloudPushMeta(); }
  };

  window.cloudRestoreNow = function () {
    if (!navigator.onLine) return toast('⚠️ مفيش نت — السحابة مش متاحة دلوقتي');
    if (!confirm('استرجاع نسخة السحابة هيسحب آخر نسخة محفوظة ويستبدل بيها بيانات الجهاز ده. متأكد؟')) return;
    toast('⏳ بجيب نسخة الحماية من السحابة…');
    req('/lab/' + LABID).then(doc => {
      if (!doc || doc.found === false) return toast('⚠️ مفيش نسخة سحابية للمعمل ده لسه — ارفع نسخة الأول');
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
