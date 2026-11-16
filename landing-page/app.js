(function () {
  const STORAGE_THEME_KEY = 'cura_landing_theme';
  let currentTheme = 'obsidian';

  function getLogoSVG(isDark) {
    const p1 = isDark ? '#C4B5FD' : '#6366F1';
    const p2 = isDark ? '#8B7CF6' : '#4F46E5';
    const s1 = isDark ? '#2DD4BF' : '#0D9488';
    const s2 = isDark ? '#99F6E4' : '#14B8A6';
    const sp = isDark ? '#F3F5FA' : '#4F46E5';
    const uid = isDark ? 'd' : 'l';

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%" aria-hidden="true">
        <defs>
          <linearGradient id="wl-p-${uid}" x1="15%" y1="10%" x2="85%" y2="90%">
            <stop offset="0%" stop-color="${p1}" />
            <stop offset="100%" stop-color="${p2}" />
          </linearGradient>
          <linearGradient id="wl-s-${uid}" x1="10%" y1="85%" x2="90%" y2="20%">
            <stop offset="0%" stop-color="${s1}" />
            <stop offset="100%" stop-color="${s2}" />
          </linearGradient>
        </defs>
        <path d="M 388 148 C 350 96, 286 66, 216 74 C 118 85, 52 172, 62 272 C 72 372, 158 444, 258 438 C 326 434, 384 398, 416 344 C 424 330, 412 314, 398 322 C 358 346, 308 356, 258 346 C 188 332, 140 268, 148 196 C 156 128, 218 82, 286 96 C 322 103, 354 124, 372 154 C 380 166, 396 158, 388 148 Z" fill="url(#wl-p-${uid})" />
        <path d="M 142 328 C 178 392, 256 426, 332 402 C 378 387, 414 352, 430 310 C 435 297, 420 286, 409 296 C 378 326, 332 340, 286 330 C 236 320, 198 286, 184 242 C 178 224, 152 228, 146 248 C 136 276, 134 304, 142 328 Z" fill="url(#wl-s-${uid})" />
        <path d="M 336 168 Q 336 218, 386 218 Q 336 218, 336 268 Q 336 218, 286 218 Q 336 218, 336 168 Z" fill="${sp}" />
        <circle cx="336" cy="218" r="10" fill="${s1}" />
      </svg>
    `;
  }

  function applyTheme(mode) {
    currentTheme = mode === 'alabaster' ? 'alabaster' : 'obsidian';
    const root = document.getElementById('wl-root');
    root.classList.remove('theme-obsidian', 'theme-alabaster');
    root.classList.add('theme-' + currentTheme);

    const isDark = currentTheme === 'obsidian';
    const btn = document.getElementById('btn-theme');
    if (btn) {
      btn.textContent = isDark ? '☀️' : '🌙';
    }

    const svg = getLogoSVG(isDark);
    ['nav-logo', 'hero-logo', 'footer-logo'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = svg;
    });

    try {
      localStorage.setItem(STORAGE_THEME_KEY, currentTheme);
    } catch (_) {}
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  async function submitWaitlist(source) {
    const form = document.getElementById('form-' + source);
    const input = document.getElementById('email-' + source);
    const msg = document.getElementById('msg-' + source);
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    if (!input || !msg) return;

    const email = input.value.trim();
    if (!isValidEmail(email)) {
      msg.textContent = 'Please enter a valid email address.';
      msg.classList.remove('hidden');
      msg.classList.add('is-error');
      return;
    }

    msg.classList.remove('is-error');
    const originalText = submitBtn ? submitBtn.textContent : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';
    }

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: source }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Could not save your spot right now.');
      }

      msg.textContent = data.alreadyExists
        ? `✦ You're already on the list (${email})! We'll message you on launch day.`
        : `✦ Spot saved for ${email}! We'll message you on launch day.`;
      msg.classList.remove('hidden');
      input.value = '';
    } catch (err) {
      msg.textContent = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      msg.classList.remove('hidden');
      msg.classList.add('is-error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    let initialTheme = 'obsidian';
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved === 'obsidian' || saved === 'alabaster') {
        initialTheme = saved;
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
        initialTheme = 'alabaster';
      }
    } catch (_) {}

    applyTheme(initialTheme);

    const themeBtn = document.getElementById('btn-theme');
    if (themeBtn) {
      themeBtn.addEventListener('click', function () {
        applyTheme(currentTheme === 'obsidian' ? 'alabaster' : 'obsidian');
      });
    }

    ['hero', 'footer'].forEach(function (source) {
      const form = document.getElementById('form-' + source);
      if (form) {
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          submitWaitlist(source);
        });
      }
    });
  });
})();
