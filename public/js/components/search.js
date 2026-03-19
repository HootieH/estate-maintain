const Search = {
  _timeout: null,
  _open: false,

  toggle() {
    if (this._open) {
      this.close();
    } else {
      this.open();
    }
  },

  open() {
    let overlay = document.getElementById('search-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'search-overlay';
      overlay.className = 'search-overlay';
      overlay.onclick = (e) => { if (e.target === overlay) Search.close(); };
      overlay.innerHTML = `
        <div class="search-dialog">
          <div class="search-input-wrapper">
            <i data-lucide="search" class="search-input-icon"></i>
            <input type="text" id="search-input" class="search-input" placeholder="Search work orders, properties, assets, parts..." autocomplete="off">
            <kbd class="search-kbd">ESC</kbd>
          </div>
          <div id="search-results" class="search-results"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      lucide.createIcons({ nodes: [overlay] });
    }

    overlay.style.display = 'flex';
    requestAnimationFrame(() => overlay.classList.add('search-visible'));
    this._open = true;

    const input = document.getElementById('search-input');
    input.value = '';
    input.focus();
    document.getElementById('search-results').innerHTML = this.renderHints();

    input.oninput = () => {
      clearTimeout(this._timeout);
      this._timeout = setTimeout(() => this.doSearch(input.value), 250);
    };

    input.onkeydown = (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key === 'Enter') {
        const first = document.querySelector('.search-result-item');
        if (first) first.click();
      }
    };
  },

  close() {
    const overlay = document.getElementById('search-overlay');
    if (overlay) {
      overlay.classList.remove('search-visible');
      setTimeout(() => { overlay.style.display = 'none'; }, 200);
    }
    this._open = false;
  },

  renderHints() {
    return `
      <div class="search-hints">
        <p class="search-hint-title">Quick Navigation</p>
        <div class="search-hint-grid">
          <a href="#/workorders" onclick="Search.close()" class="search-hint-item">
            <i data-lucide="clipboard-list"></i> Work Orders
          </a>
          <a href="#/properties" onclick="Search.close()" class="search-hint-item">
            <i data-lucide="building-2"></i> Properties
          </a>
          <a href="#/assets" onclick="Search.close()" class="search-hint-item">
            <i data-lucide="wrench"></i> Assets
          </a>
          <a href="#/parts" onclick="Search.close()" class="search-hint-item">
            <i data-lucide="package"></i> Parts
          </a>
          <a href="#/teams" onclick="Search.close()" class="search-hint-item">
            <i data-lucide="users"></i> Teams
          </a>
          <a href="#/preventive" onclick="Search.close()" class="search-hint-item">
            <i data-lucide="calendar-clock"></i> PM Schedules
          </a>
        </div>
      </div>
    `;
  },

  async doSearch(query) {
    const resultsEl = document.getElementById('search-results');
    if (!resultsEl) return;

    if (!query || query.length < 2) {
      resultsEl.innerHTML = this.renderHints();
      lucide.createIcons({ nodes: [resultsEl] });
      return;
    }

    resultsEl.innerHTML = '<div class="search-loading">Searching...</div>';

    try {
      const data = await API.get(`/search?q=${encodeURIComponent(query)}`);
      const results = data.results || [];

      if (results.length === 0) {
        resultsEl.innerHTML = `
          <div class="search-empty">
            <i data-lucide="search-x"></i>
            <p>No results for "${query}"</p>
          </div>
        `;
      } else {
        // Group by type
        const grouped = {};
        results.forEach(r => {
          if (!grouped[r.type]) grouped[r.type] = [];
          grouped[r.type].push(r);
        });

        const typeLabels = {
          work_order: 'Work Orders', property: 'Properties', asset: 'Assets',
          part: 'Parts', team: 'Teams', vendor: 'Vendors', user: 'Users', procedure: 'Procedures'
        };

        resultsEl.innerHTML = Object.entries(grouped).map(([type, items]) => `
          <div class="search-group">
            <div class="search-group-label">${typeLabels[type] || type}</div>
            ${items.map(r => `
              <a href="${r.route}" class="search-result-item" onclick="Search.close()">
                <i data-lucide="${r.icon}" class="search-result-icon"></i>
                <div class="search-result-text">
                  <strong>${this.highlight(r.label, query)}</strong>
                  ${r.status ? `<span class="badge badge-status-${r.status.replace(/\s+/g,'_')}" style="font-size:10px">${r.status}</span>` : ''}
                  ${r.priority ? `<span class="badge badge-${r.priority}" style="font-size:10px">${r.priority}</span>` : ''}
                </div>
              </a>
            `).join('')}
          </div>
        `).join('');
      }

      lucide.createIcons({ nodes: [resultsEl] });
    } catch (e) {
      resultsEl.innerHTML = `<div class="search-empty"><p>Search error: ${e.message}</p></div>`;
    }
  },

  highlight(text, query) {
    if (!query) return text;
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }
};

// Global keyboard shortcut: Cmd/Ctrl+K to open search
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    Search.toggle();
  }
});
