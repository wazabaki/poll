(function () {
  const path = window.location.pathname;

  const style = document.createElement('style');
  style.textContent = `
    .cp-nav {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: white; border-bottom: 1.5px solid #e2e8f0;
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 24px; height: 56px;
      box-shadow: 0 1px 8px rgba(0,0,0,0.06);
    }
    .cp-nav-logo {
      font-size: 1.15rem; font-weight: 800; color: #4f46e5;
      text-decoration: none; letter-spacing: -0.3px;
    }
    .cp-nav-links { display: flex; align-items: center; gap: 4px; }
    .cp-nav-link {
      padding: 6px 14px; border-radius: 8px; font-size: 0.875rem;
      font-weight: 600; text-decoration: none; color: #475569;
      transition: background 0.12s, color 0.12s;
    }
    .cp-nav-link:hover { background: #f1f5f9; color: #1e293b; }
    .cp-nav-link.active { background: #eef2ff; color: #4f46e5; }
    .cp-nav-link.primary {
      background: #4f46e5; color: white; margin-left: 6px;
    }
    .cp-nav-link.primary:hover { background: #4338ca; color: white; }
    body { padding-top: 56px !important; }
  `;
  document.head.appendChild(style);

  const nav = document.createElement('nav');
  nav.className = 'cp-nav';

  const isAdmin = path.startsWith('/admin/');
  const isDash  = path === '/dashboard';
  const isCreate = path === '/';

  nav.innerHTML = `
    <a href="/dashboard" class="cp-nav-logo">ClassPoll</a>
    <div class="cp-nav-links">
      <a href="/dashboard" class="cp-nav-link${isDash ? ' active' : ''}">Dashboard</a>
      ${isAdmin ? `<a href="${path}" class="cp-nav-link active">This Poll</a>` : ''}
      <a href="/" class="cp-nav-link primary${isCreate ? '' : ''}">+ New Poll</a>
    </div>
  `;

  document.body.insertBefore(nav, document.body.firstChild);
})();
