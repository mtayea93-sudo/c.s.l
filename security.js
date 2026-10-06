/* ================= الأمان (CSL Security) =================
   1) Hash لكلمات المرور: SHA-256 + Salt فريد لكل مستخدم (WebCrypto)
   2) ترقية تلقائية: أول دخولة ناجحة بكلمة سر قديمة (نص صريح) بتتحفظ مشفرة
   3) توقيع الجلسة: تعديل بيانات الجلسة من كونسول المتصفح يفصلك فوراً */
(function () {
  const te = new TextEncoder();

  function rndHex(n) {
    const b = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => b[i] = Math.random() * 256 | 0);
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  }

  async function sha256Hex(str) {
    const buf = await crypto.subtle.digest('SHA-256', te.encode(str));
    return Array.from(new Uint8Array(buf), x => x.toString(16).padStart(2, '0')).join('');
  }

  /* توليد سجل كلمة سر جديد: {salt, pass: hash(salt + pass)} */
  window.hashNewPass = async function (plain) {
    const salt = rndHex(16);
    const pass = await sha256Hex(salt + ':' + plain);
    return { salt, pass };
  };

  /* تحقق من كلمة السر — بيقبل القديم النصي ويرقّيه (بيرجع {ok, upgraded, rec}) */
  window.verifyPass = async function (usr, plain) {
    if (!usr) return { ok: false };
    if (usr.salt && usr.pass) {
      const h = await sha256Hex(usr.salt + ':' + plain);
      return { ok: h === usr.pass };
    }
    if (usr.pass === plain) { // قديم نص صريح → رقّيه
      const rec = await hashNewPass(plain);
      return { ok: true, upgraded: true, rec };
    }
    return { ok: false };
  };

  /* ---------- توقيع الجلسة (ردع التلاعب) ---------- */
  function cyrb(str, seed) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }

  window.signSession = function (sess) {
    const lab = (typeof META !== 'undefined' && META) ? (META.labs || []).find(l => l.id === sess.labId) : null;
    const raw = JSON.parse(localStorage.getItem(labKey(sess.labId)) || 'null');
    const usr = raw && raw.users ? raw.users.find(x => x.user === sess.user) : null;
    const secret = [(lab && lab.code) || '', sess.user, sess.role, (usr && usr.pass) || '', sess.name].join('|');
    return cyrb(secret, 7) + cyrb(secret.split('').reverse().join(''), 13);
  };

  window.sessionTampered = function () {
    const s = session();
    if (!s) return false;
    if (s.type !== 'lab') return false;
    try { return !s.sig || s.sig !== signSession(s); } catch (e) { return true; }
  };
})();
