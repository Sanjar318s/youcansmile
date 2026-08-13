/* Lazy-load chat.js after idle / first interaction — keeps critical path light. */
const ChatLazy = (() => {
  let loading = null;
  let src = 'js/chat.js';

  function detectSrc() {
    const scripts = document.querySelectorAll('script[src*="chat-lazy"], script[src*="chat.js"]');
    for (const s of scripts) {
      const m = String(s.getAttribute('src') || '').match(/[?&]v=([^&]+)/);
      if (m) {
        src = `js/chat.js?v=${m[1]}`;
        return;
      }
    }
    const any = document.querySelector('script[src*="js/"]');
    const m = any && String(any.getAttribute('src') || '').match(/[?&]v=([^&]+)/);
    if (m) src = `js/chat.js?v=${m[1]}`;
  }

  function ensure() {
    if (typeof Chat !== 'undefined') return Promise.resolve(Chat);
    if (loading) return loading;
    detectSrc();
    loading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.async = true;
      el.onload = () => {
        try {
          if (typeof Chat !== 'undefined' && Chat.init) Chat.init();
        } catch (_) {}
        resolve(typeof Chat !== 'undefined' ? Chat : null);
      };
      el.onerror = () => reject(new Error('chat-load-fail'));
      document.head.appendChild(el);
    });
    return loading;
  }

  function arm() {
    const kick = () => {
      ensure().catch(() => {});
      window.removeEventListener('pointerdown', kick, true);
      window.removeEventListener('scroll', kick, true);
      window.removeEventListener('keydown', kick, true);
    };
    window.addEventListener('pointerdown', kick, { once: true, capture: true });
    window.addEventListener('scroll', kick, { once: true, capture: true, passive: true });
    window.addEventListener('keydown', kick, { once: true, capture: true });
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => ensure().catch(() => {}), { timeout: 4000 });
    } else {
      setTimeout(() => ensure().catch(() => {}), 2500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arm);
  } else {
    arm();
  }

  return { ensure };
})();
