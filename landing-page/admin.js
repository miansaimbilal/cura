(function () {
  const STORAGE_THEME_KEY = 'cura_landing_theme';
  const STORAGE_ADMIN_TOKEN_KEY = 'cura_admin_token';

  let currentTheme = 'obsidian';
  let allEntries = [];

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
          <linearGradient id="ad-p-${uid}" x1="15%" y1="10%" x2="85%" y2="90%">
            <stop offset="0%" stop-color="${p1}" />
            <stop offset="100%" stop-color="${p2}" />
          </linearGradient>
          <linearGradient id="ad-s-${uid}" x1="10%" y1="85%" x2="90%" y2="20%">
            <stop offset="0%" stop-color="${s1}" />
            <stop offset="100%" stop-color="${s2}" />
          </linearGradient>
        </defs>
        <path d="M 388 148 C 350 96, 286 66, 216 74 C 118 85, 52 172, 62 272 C 72 372, 158 444, 258 438 C 326 434, 384 398, 416 344 C 424 330, 412 314, 398 322 C 358 346, 308 356, 258 346 C 188 332, 140 268, 148 196 C 156 128, 218 82, 286 96 C 322 103, 354 124, 372 154 C 380 166, 396 158, 388 148 Z" fill="url(#ad-p-${uid})" />
        <path d="M 142 328 C 178 392, 256 426, 332 402 C 378 387, 414 352, 430 310 C 435 297, 420 286, 409 296 C 378 326, 332 340, 286 330 C 236 320, 198 286, 184 242 C 178 224, 152 228, 146 248 C 136 276, 134 304, 142 328 Z" fill="url(#ad-s-${uid})" />
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
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';

    const svg = getLogoSVG(isDark);
    ['nav-logo', 'login-logo'].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.innerHTML = svg;
    });

    try {
      localStorage.setItem(STORAGE_THEME_KEY, currentTheme);
    } catch (_) {}
  }

  function getToken() {
    try {
      return localStorage.getItem(STORAGE_ADMIN_TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) {
        localStorage.setItem(STORAGE_ADMIN_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(STORAGE_ADMIN_TOKEN_KEY);
      }
    } catch (_) {}
  }

  function showToast(text, isError) {
    const toast = document.getElementById('admin-status-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.remove('hidden', 'is-error');
    if (isError) toast.classList.add('is-error');
    setTimeout(function () {
      toast.classList.add('hidden');
    }, 3500);
  }

  function showLoginView() {
    document.getElementById('admin-login-section').classList.remove('hidden');
    document.getElementById('admin-dashboard-section').classList.add('hidden');
    document.getElementById('btn-logout').classList.add('hidden');
  }

  function showDashboardView() {
    document.getElementById('admin-login-section').classList.add('hidden');
    document.getElementById('admin-dashboard-section').classList.remove('hidden');
    document.getElementById('btn-logout').classList.remove('hidden');
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderStats() {
    document.getElementById('stat-total').textContent = String(allEntries.length);

    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentCount = allEntries.filter(function (item) {
      return new Date(item.createdAt).getTime() >= dayAgo;
    }).length;
    document.getElementById('stat-today').textContent = String(recentCount);

    let heroCount = 0;
    let footerCount = 0;
    allEntries.forEach(function (item) {
      if (item.source === 'footer') footerCount += 1;
      else heroCount += 1;
    });

    if (allEntries.length === 0) {
      document.getElementById('stat-source').textContent = '—';
    } else {
      document.getElementById('stat-source').textContent =
        heroCount >= footerCount ? `Hero (${heroCount})` : `Footer (${footerCount})`;
    }
  }

  function renderTable() {
    const query = (document.getElementById('search-input').value || '').trim().toLowerCase();
    const filtered = query
      ? allEntries.filter(function (item) {
          return item.email.toLowerCase().includes(query);
        })
      : allEntries;

    document.getElementById('filtered-count').textContent = `${filtered.length} shown`;

    const tbody = document.getElementById('waitlist-tbody');
    const emptyState = document.getElementById('empty-state');

    if (filtered.length === 0) {
      tbody.innerHTML = '';
      emptyState.classList.remove('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    tbody.innerHTML = filtered
      .map(function (item, idx) {
        const safeEmail = escapeHTML(item.email);
        const safeSource = item.source === 'footer' ? 'Footer' : 'Hero';
        const safeDate = escapeHTML(formatDate(item.createdAt));
        return `
          <tr>
            <td class="faint-text">${idx + 1}</td>
            <td class="email-cell"><strong>${safeEmail}</strong></td>
            <td><span class="source-pill">${safeSource}</span></td>
            <td class="date-cell">${safeDate}</td>
            <td class="text-right row-actions">
              <button type="button" class="mini-action-btn" data-copy="${safeEmail}">Copy</button>
              <button type="button" class="mini-action-btn danger" data-delete="${safeEmail}">Remove</button>
            </td>
          </tr>
        `;
      })
      .join('');
  }

  async function fetchWaitlist() {
    const token = getToken();
    if (!token) {
      showLoginView();
      return;
    }

    const res = await fetch('/api/admin-waitlist', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      setToken('');
      showLoginView();
      return;
    }

    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Could not load waitlist.', true);
      return;
    }

    allEntries = Array.isArray(data.entries) ? data.entries : [];
    document.getElementById('storage-mode-label').textContent = `Storage: ${data.storageMode || 'Active'}`;
    document.getElementById('default-pw-banner').classList.toggle('hidden', !data.usingDefaultPassword);

    showDashboardView();
    renderStats();
    renderTable();
  }

  async function handleDelete(email) {
    const token = getToken();
    if (!token || !email) return;

    const res = await fetch('/api/admin-waitlist', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: email }),
    });

    if (res.status === 401) {
      setToken('');
      showLoginView();
      return;
    }

    if (!res.ok) {
      showToast('Failed to remove email.', true);
      return;
    }

    allEntries = allEntries.filter(function (item) {
      return item.email !== email;
    });
    renderStats();
    renderTable();
    showToast(`Removed ${email}`, false);
  }

  function exportCSV() {
    if (allEntries.length === 0) {
      showToast('No emails to export yet.', true);
      return;
    }
    const escapeCSV = function (val) {
      const s = String(val ?? '');
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = ['email,source,created_at'];
    allEntries.forEach(function (item) {
      lines.push([escapeCSV(item.email), escapeCSV(item.source), escapeCSV(item.createdAt)].join(','));
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cura-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported ${allEntries.length} email(s) to CSV.`, false);
  }

  document.addEventListener('DOMContentLoaded', function () {
    let initialTheme = 'obsidian';
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved === 'obsidian' || saved === 'alabaster') {
        initialTheme = saved;
      }
    } catch (_) {}
    applyTheme(initialTheme);

    document.getElementById('btn-theme').addEventListener('click', function () {
      applyTheme(currentTheme === 'obsidian' ? 'alabaster' : 'obsidian');
    });

    document.getElementById('admin-login-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const passwordInput = document.getElementById('admin-password');
      const errEl = document.getElementById('login-error');
      const submitBtn = document.getElementById('btn-login-submit');

      errEl.classList.add('hidden');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Checking...';

      try {
        const res = await fetch('/api/admin-waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: passwordInput.value }),
        });
        const data = await res.json();
        if (!res.ok || !data.token) {
          errEl.textContent = data.error || 'Incorrect password.';
          errEl.classList.remove('hidden');
        } else {
          setToken(data.token);
          passwordInput.value = '';
          await fetchWaitlist();
        }
      } catch {
        errEl.textContent = 'Could not reach server. Make sure the landing server is running.';
        errEl.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Unlock Waitlist →';
      }
    });

    document.getElementById('btn-logout').addEventListener('click', function () {
      setToken('');
      allEntries = [];
      showLoginView();
    });

    document.getElementById('btn-refresh').addEventListener('click', fetchWaitlist);
    document.getElementById('search-input').addEventListener('input', renderTable);
    document.getElementById('btn-export-csv').addEventListener('click', exportCSV);

    document.getElementById('btn-copy-all').addEventListener('click', async function () {
      if (allEntries.length === 0) {
        showToast('No emails to copy yet.', true);
        return;
      }
      const text = allEntries.map(function (item) { return item.email; }).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        showToast(`Copied ${allEntries.length} email(s) to clipboard.`, false);
      } catch {
        showToast('Clipboard permission denied.', true);
      }
    });

    document.getElementById('waitlist-tbody').addEventListener('click', async function (e) {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const copyEmail = target.getAttribute('data-copy');
      if (copyEmail) {
        try {
          await navigator.clipboard.writeText(copyEmail);
          showToast(`Copied ${copyEmail}`, false);
        } catch {
          showToast('Could not copy email.', true);
        }
        return;
      }

      const deleteEmail = target.getAttribute('data-delete');
      if (deleteEmail) {
        await handleDelete(deleteEmail);
      }
    });

    fetchWaitlist();
  });
})();
