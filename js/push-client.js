/* ============================================================
   YouCanSmile — Web Push client (subscribe after login)
   ============================================================ */
const YcsPush = (() => {
  let asked = false;

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function ensureSw() {
    if (!('serviceWorker' in navigator)) return null;
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return reg;
  }

  async function subscribe(forcePrompt) {
    if (!('Notification' in window) || !('PushManager' in window)) return false;
    if (typeof Api === 'undefined' || Api.mode !== 'remote') return false;
    try {
      const me = await Api.getMe();
      if (!me || (me.role !== 'customer' && me.role !== 'admin')) return false;

      let permission = Notification.permission;
      if (permission === 'default' && (forcePrompt || !asked)) {
        asked = true;
        permission = await Notification.requestPermission();
      }
      if (permission !== 'granted') return false;

      const vapid = await Api._remote('/api/push');
      if (!vapid || !vapid.publicKey) return false;

      const reg = await ensureSw();
      if (!reg) return false;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid.publicKey),
        });
      }
      const json = sub.toJSON();
      await Api._remote('/api/push', 'POST', {
        endpoint: json.endpoint,
        keys: json.keys,
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function warm() {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => subscribe(false), { timeout: 5000 });
    } else {
      setTimeout(() => subscribe(false), 2000);
    }
  }

  return { subscribe, warm, ensureSw };
})();
