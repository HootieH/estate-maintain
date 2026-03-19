const Projects = {
  _currentPage: 1,
  _pagination: null,

  statusColors: {
    draft: '#6B7280', bidding: '#3B82F6', evaluating: '#F59E0B',
    awarded: '#10B981', in_progress: '#8B5CF6', completed: '#059669', cancelled: '#EF4444'
  },

  categoryLabels: {
    materials: 'Materials & Supplies', labor: 'Labor', equipment: 'Equipment & Rentals',
    permits: 'Permits & Fees', subcontractors: 'Subcontractors', overhead: 'Overhead & Markup', other: 'Other'
  },

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading projects...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      const data = await API.get(`/projects?${params.toString()}`);
      const { items: projects, pagination } = Pagination.extract(data, 'projects');
      this._pagination = pagination;

      container.innerHTML = `
        <div class="page-header">
          <h1>Projects & Bids <span class="tip-trigger" data-tip="project"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/projects/new')">
            <i data-lucide="plus"></i> New Project
          </button>
        </div>

        ${projects.length === 0 ? `
          <div class="empty-state">
            <div class="empty-state-icon"><i data-lucide="briefcase"></i></div>
            <h2>No Projects Yet</h2>
            <p class="empty-state-desc">Projects let you define a scope of work, collect competitive bids from vendors, compare them side by side, and award the winner — automatically creating a Purchase Order.</p>
            <div class="empty-state-features">
              <div class="empty-state-feature">
                <i data-lucide="file-text"></i>
                <div><strong>Define Scope</strong><span>Describe the work, set a budget range and deadline</span></div>
              </div>
              <div class="empty-state-feature">
                <i data-lucide="users"></i>
                <div><strong>Collect Bids</strong><span>Enter bids from multiple vendors with line item breakdowns</span></div>
              </div>
              <div class="empty-state-feature">
                <i data-lucide="columns-3"></i>
                <div><strong>Level & Compare</strong><span>Side-by-side comparison normalized by category</span></div>
              </div>
              <div class="empty-state-feature">
                <i data-lucide="trophy"></i>
                <div><strong>Award & Create PO</strong><span>Select the winner and auto-generate a Purchase Order</span></div>
              </div>
            </div>
            <button class="btn btn-primary" onclick="Router.navigate('#/projects/new')">
              <i data-lucide="plus"></i> Create Your First Project
            </button>
          </div>
        ` : `
          <div class="card">
            <div class="card-body no-padding">
              <table class="table">
                <thead>
                  <tr><th>Project</th><th>Property</th><th>Bids</th><th>Budget</th><th>Bid Range</th><th>Status</th><th>Deadline</th></tr>
                </thead>
                <tbody>
                  ${projects.map(p => `
                    <tr class="clickable-row" onclick="Router.navigate('#/projects/${p.id}')">
                      <td><strong>${p.title}</strong>${p.category ? `<br><span class="text-muted" style="font-size:12px">${p.category}</span>` : ''}</td>
                      <td>${p.property_name || '-'}</td>
                      <td><span class="badge" style="background:var(--primary-lighter);color:var(--primary)">${p.bid_count || 0} bids</span></td>
                      <td>${p.budget_min || p.budget_max ? `$${(p.budget_min || 0).toLocaleString()} - $${(p.budget_max || 0).toLocaleString()}` : '-'}</td>
                      <td>${p.lowest_bid ? `$${p.lowest_bid.toLocaleString()} - $${p.highest_bid.toLocaleString()}` : '-'}</td>
                      <td><span class="badge" style="background:${this.statusColors[p.status]}15;color:${this.statusColors[p.status]}">${p.status}</span></td>
                      <td>${Dashboard.formatDate(p.deadline)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ${Pagination.render(pagination, 'Projects')}
            </div>
          </div>
        `}
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  goToPage(page) { this.list(page); },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const project = await API.get(`/projects/${params.id}`);
      const bids = project.bids || [];

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/projects')"><i data-lucide="arrow-left"></i> Back</button>
            <h1>${project.title}</h1>
            <span class="badge" style="background:${this.statusColors[project.status]}15;color:${this.statusColors[project.status]};padding:6px 14px">${project.status}</span>
          </div>
          <div class="page-header-actions">
            ${!project.awarded_bid_id && bids.length >= 2 ? `
              <button class="btn btn-primary" onclick="Projects.showComparison('${params.id}')">
                <i data-lucide="columns-3"></i> Compare Bids
              </button>
            ` : ''}
            ${!project.awarded_bid_id ? `
              <button class="btn btn-primary" onclick="Projects.showAddBid('${params.id}')">
                <i data-lucide="plus"></i> Add Bid
              </button>
            ` : ''}
            ${project.purchase_order_id ? `
              <button class="btn btn-secondary" onclick="Router.navigate('#/purchaseorders/${project.purchase_order_id}')">
                <i data-lucide="shopping-cart"></i> View PO
              </button>
            ` : ''}
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Scope of Work</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field"><label>Property</label><p>${project.property_name ? `<a href="#/properties/${project.property_id}">${project.property_name}</a>` : '-'}</p></div>
                <div class="detail-field"><label>Category</label><p>${project.category || '-'}</p></div>
                <div class="detail-field"><label>Budget Range</label><p>${project.budget_min || project.budget_max ? `$${(project.budget_min || 0).toLocaleString()} - $${(project.budget_max || 0).toLocaleString()}` : 'Not set'}</p></div>
                <div class="detail-field"><label>Deadline</label><p>${Dashboard.formatDate(project.deadline)}</p></div>
                ${project.description ? `<div class="detail-field detail-field-full"><label>Description</label><p>${project.description}</p></div>` : ''}
                ${project.scope_of_work ? `<div class="detail-field detail-field-full"><label>Detailed Scope</label><p style="white-space:pre-wrap">${project.scope_of_work}</p></div>` : ''}
              </div>
            </div>
          </div>
        </div>

        ${project.awarded_bid_id ? `
          <div class="card" style="margin-bottom:20px;border:2px solid var(--success)">
            <div class="card-header" style="background:var(--success-bg)">
              <h3 style="color:var(--success)"><i data-lucide="trophy" style="width:18px;height:18px;vertical-align:middle"></i> Awarded Bid</h3>
            </div>
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <strong style="font-size:16px">${project.awarded_bid?.vendor_name || 'Unknown'}</strong>
                  <div style="font-size:24px;font-weight:700;color:var(--success);margin-top:4px">$${(project.awarded_bid?.total_amount || 0).toLocaleString()}</div>
                  ${project.awarded_bid?.timeline_days ? `<div style="color:var(--text-muted);font-size:13px">${project.awarded_bid.timeline_days} day timeline</div>` : ''}
                </div>
                ${project.purchase_order_id ? `
                  <a href="#/purchaseorders/${project.purchase_order_id}" class="btn btn-success">View Purchase Order</a>
                ` : ''}
              </div>
            </div>
          </div>
        ` : ''}

        <div class="card">
          <div class="card-header">
            <h3>Bids (${bids.length})</h3>
          </div>
          <div class="card-body">
            ${bids.length === 0 ? `
              <div class="empty-state-sm">No bids yet. Add bids from your vendors to start comparing.</div>
            ` : `
              <div class="bid-cards">
                ${bids.map((bid, i) => `
                  <div class="bid-card ${bid.status === 'selected' ? 'bid-card-selected' : bid.status === 'rejected' ? 'bid-card-rejected' : ''}">
                    <div class="bid-card-header">
                      <div>
                        <strong>${bid.vendor_name}</strong>
                        ${bid.vendor_specialty ? `<span class="text-muted" style="font-size:12px;margin-left:8px">${bid.vendor_specialty}</span>` : ''}
                      </div>
                      <span class="badge" style="background:${bid.status === 'selected' ? '#10B981' : bid.status === 'rejected' ? '#EF4444' : '#3B82F6'}15;color:${bid.status === 'selected' ? '#10B981' : bid.status === 'rejected' ? '#EF4444' : '#3B82F6'}">${bid.status}</span>
                    </div>
                    <div class="bid-card-amount">
                      <span class="bid-amount">$${bid.total_amount.toLocaleString()}</span>
                      ${i === 0 && bids.length > 1 ? '<span class="bid-lowest">Lowest</span>' : ''}
                    </div>
                    <div class="bid-card-details">
                      ${bid.timeline_days ? `<span><i data-lucide="clock" class="icon-xs"></i> ${bid.timeline_days} days</span>` : ''}
                      ${bid.warranty_terms ? `<span><i data-lucide="shield" class="icon-xs"></i> ${bid.warranty_terms}</span>` : ''}
                      ${bid.payment_terms ? `<span><i data-lucide="credit-card" class="icon-xs"></i> ${bid.payment_terms}</span>` : ''}
                    </div>
                    ${bid.items && bid.items.length > 0 ? `
                      <div class="bid-card-breakdown">
                        ${Object.entries(this.categoryLabels).map(([cat, label]) => {
                          const catTotal = bid.items.filter(i => i.category === cat).reduce((s, i) => s + i.amount, 0);
                          return catTotal > 0 ? `<div class="bid-cat-row"><span>${label}</span><span>$${catTotal.toLocaleString()}</span></div>` : '';
                        }).join('')}
                      </div>
                    ` : ''}
                    ${bid.inclusions ? `<div class="bid-terms"><strong>Includes:</strong> ${bid.inclusions}</div>` : ''}
                    ${bid.exclusions ? `<div class="bid-terms bid-terms-warn"><strong>Excludes:</strong> ${bid.exclusions}</div>` : ''}
                    <div class="bid-card-actions">
                      ${!project.awarded_bid_id && bid.status !== 'rejected' ? `
                        <button class="btn btn-sm btn-success" onclick="Projects.awardBid('${params.id}', '${bid.id}', '${bid.vendor_name}')">
                          <i data-lucide="trophy"></i> Award
                        </button>
                      ` : ''}
                      <button class="btn btn-sm btn-secondary" onclick="Projects.editBid('${params.id}', '${bid.id}')">
                        <i data-lucide="edit"></i>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async form() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const propData = await API.get('/properties').catch(() => []);
      const properties = Array.isArray(propData) ? propData : (propData.data || propData.properties || []);

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/projects')"><i data-lucide="arrow-left"></i> Back</button>
            <h1>New Project</h1>
          </div>
        </div>
        <div class="card">
          <div class="card-body">
            <form id="project-form" onsubmit="Projects.handleCreate(event)">
              <div class="form-group">
                <label for="proj-title">Project Title *</label>
                <input type="text" id="proj-title" class="form-control" required placeholder="e.g., Battery Backup System Installation">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="proj-property">Property</label>
                  <select id="proj-property" class="form-control">
                    <option value="">Select property...</option>
                    ${properties.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group">
                  <label for="proj-category">Category</label>
                  <input type="text" id="proj-category" class="form-control" placeholder="e.g., Electrical, Renovation, Landscaping">
                </div>
              </div>
              <div class="form-group">
                <label for="proj-desc">Description</label>
                <textarea id="proj-desc" class="form-control" rows="2" placeholder="Brief summary of the project..."></textarea>
              </div>
              <div class="form-group">
                <label for="proj-scope">Detailed Scope of Work</label>
                <textarea id="proj-scope" class="form-control" rows="5" placeholder="Full specifications, requirements, materials, quality standards..."></textarea>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="proj-budget-min">Budget Min ($)</label>
                  <input type="number" id="proj-budget-min" class="form-control" step="0.01" min="0" placeholder="e.g., 15000">
                </div>
                <div class="form-group">
                  <label for="proj-budget-max">Budget Max ($)</label>
                  <input type="number" id="proj-budget-max" class="form-control" step="0.01" min="0" placeholder="e.g., 25000">
                </div>
                <div class="form-group">
                  <label for="proj-deadline">Deadline</label>
                  <input type="date" id="proj-deadline" class="form-control">
                </div>
              </div>
              <div id="proj-form-error" class="form-error" style="display:none"></div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" onclick="Router.navigate('#/projects')">Cancel</button>
                <button type="submit" class="btn btn-primary" id="proj-submit">Create Project</button>
              </div>
            </form>
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async handleCreate(e) {
    e.preventDefault();
    const btn = document.getElementById('proj-submit');
    const errorEl = document.getElementById('proj-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const body = {
        title: document.getElementById('proj-title').value,
        property_id: document.getElementById('proj-property').value || null,
        category: document.getElementById('proj-category').value || null,
        description: document.getElementById('proj-desc').value || null,
        scope_of_work: document.getElementById('proj-scope').value || null,
        budget_min: parseFloat(document.getElementById('proj-budget-min').value) || null,
        budget_max: parseFloat(document.getElementById('proj-budget-max').value) || null,
        deadline: document.getElementById('proj-deadline').value || null
      };
      const result = await API.post('/projects', body);
      App.toast('Project created', 'success');
      Router.navigate(`#/projects/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Create Project'; }
  },

  async showAddBid(projectId) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Add Vendor Bid';
    modal.querySelector('.modal-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    try {
      const vendorData = await API.get('/vendors');
      const vendors = Array.isArray(vendorData) ? vendorData : (vendorData.data || []);

      modal.querySelector('.modal-body').innerHTML = `
        <form id="bid-form" onsubmit="Projects.handleAddBid(event, '${projectId}')">
          <div class="form-row">
            <div class="form-group">
              <label>Vendor *</label>
              <select id="bid-vendor" class="form-control" required>
                <option value="">Select vendor...</option>
                ${vendors.map(v => `<option value="${v.id}">${v.name}${v.specialty ? ' (' + v.specialty + ')' : ''}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Timeline (days)</label>
              <input type="number" id="bid-timeline" class="form-control" min="1" placeholder="e.g., 30">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Start Date</label>
              <input type="date" id="bid-start" class="form-control">
            </div>
            <div class="form-group">
              <label>Completion Date</label>
              <input type="date" id="bid-completion" class="form-control">
            </div>
          </div>

          <h4 style="margin:16px 0 8px;font-size:14px">Line Items</h4>
          <div id="bid-items-list">
            <div class="bid-item-row">
              <div class="form-row">
                <div class="form-group" style="flex:1">
                  <select class="form-control bi-cat">
                    <option value="materials">Materials</option>
                    <option value="labor">Labor</option>
                    <option value="equipment">Equipment</option>
                    <option value="permits">Permits</option>
                    <option value="subcontractors">Subcontractors</option>
                    <option value="overhead">Overhead</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="form-group" style="flex:2"><input type="text" class="form-control bi-desc" placeholder="Description" required></div>
                <div class="form-group" style="flex:0.5"><input type="number" class="form-control bi-qty" value="1" min="0" step="any"></div>
                <div class="form-group" style="flex:0.7"><input type="number" class="form-control bi-cost" placeholder="Cost" step="0.01" min="0"></div>
              </div>
            </div>
          </div>
          <button type="button" class="btn btn-sm btn-secondary" onclick="Projects.addBidItemRow()" style="margin:8px 0 16px">
            <i data-lucide="plus"></i> Add Line
          </button>

          <div class="form-group"><label>Warranty Terms</label><input type="text" id="bid-warranty" class="form-control" placeholder="e.g., 2-year parts and labor"></div>
          <div class="form-group"><label>Payment Terms</label><input type="text" id="bid-payment" class="form-control" placeholder="e.g., 50% upfront, 50% on completion"></div>
          <div class="form-group"><label>Inclusions</label><textarea id="bid-inclusions" class="form-control" rows="2" placeholder="What's included in this bid..."></textarea></div>
          <div class="form-group"><label>Exclusions</label><textarea id="bid-exclusions" class="form-control" rows="2" placeholder="What's NOT included..."></textarea></div>
          <div class="form-group"><label>Notes</label><textarea id="bid-notes" class="form-control" rows="2"></textarea></div>

          <div id="bid-form-error" class="form-error" style="display:none"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="bid-submit">Submit Bid</button>
          </div>
        </form>
      `;
      lucide.createIcons();
    } catch (e) {
      modal.querySelector('.modal-body').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  },

  addBidItemRow() {
    const container = document.getElementById('bid-items-list');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'bid-item-row';
    div.innerHTML = `
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <select class="form-control bi-cat">
            <option value="materials">Materials</option><option value="labor">Labor</option>
            <option value="equipment">Equipment</option><option value="permits">Permits</option>
            <option value="subcontractors">Subcontractors</option><option value="overhead">Overhead</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group" style="flex:2"><input type="text" class="form-control bi-desc" placeholder="Description" required></div>
        <div class="form-group" style="flex:0.5"><input type="number" class="form-control bi-qty" value="1" min="0" step="any"></div>
        <div class="form-group" style="flex:0.7"><input type="number" class="form-control bi-cost" placeholder="Cost" step="0.01" min="0"></div>
        <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.bid-item-row').remove()" style="margin-top:22px"><i data-lucide="trash-2"></i></button>
      </div>
    `;
    container.appendChild(div);
    lucide.createIcons({ nodes: [div] });
  },

  async handleAddBid(e, projectId) {
    e.preventDefault();
    const btn = document.getElementById('bid-submit');
    const errorEl = document.getElementById('bid-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Submitting...';
    try {
      const items = [];
      document.querySelectorAll('.bid-item-row').forEach(row => {
        const desc = row.querySelector('.bi-desc').value;
        const qty = parseFloat(row.querySelector('.bi-qty').value) || 1;
        const cost = parseFloat(row.querySelector('.bi-cost').value) || 0;
        const cat = row.querySelector('.bi-cat').value;
        if (desc) items.push({ category: cat, description: desc, quantity: qty, unit_cost: cost });
      });

      await API.post(`/projects/${projectId}/bids`, {
        vendor_id: parseInt(document.getElementById('bid-vendor').value),
        timeline_days: parseInt(document.getElementById('bid-timeline').value) || null,
        start_date: document.getElementById('bid-start').value || null,
        completion_date: document.getElementById('bid-completion').value || null,
        warranty_terms: document.getElementById('bid-warranty').value || null,
        payment_terms: document.getElementById('bid-payment').value || null,
        inclusions: document.getElementById('bid-inclusions').value || null,
        exclusions: document.getElementById('bid-exclusions').value || null,
        notes: document.getElementById('bid-notes').value || null,
        items
      });
      App.closeModal();
      App.toast('Bid added', 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Submit Bid'; }
  },

  async showComparison(projectId) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading comparison...</p></div>';

    try {
      const data = await API.get(`/projects/${projectId}/compare`);
      const { bids, categories, lowestByCategory, project } = data;

      if (bids.length < 2) {
        App.toast('Need at least 2 bids to compare', 'error');
        Projects.detail({ id: projectId });
        return;
      }

      const catLabels = this.categoryLabels;

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Projects.detail({id:'${projectId}'})"><i data-lucide="arrow-left"></i> Back to Project</button>
            <h1>Bid Leveling: ${project.title}</h1>
          </div>
        </div>

        ${project.budget_min || project.budget_max ? `
          <div style="margin-bottom:16px;padding:12px 16px;background:var(--primary-lighter);border-radius:8px;font-size:14px">
            <strong>Budget Range:</strong> $${(project.budget_min || 0).toLocaleString()} - $${(project.budget_max || 0).toLocaleString()}
          </div>
        ` : ''}

        <div class="card" style="overflow-x:auto">
          <div class="card-body no-padding">
            <table class="table compare-table">
              <thead>
                <tr>
                  <th style="min-width:180px;position:sticky;left:0;background:var(--card-bg);z-index:1">Category</th>
                  ${bids.map(b => `
                    <th style="min-width:160px;text-align:right">
                      <div style="font-size:14px">${b.vendor_name}</div>
                      <div style="font-size:11px;color:var(--text-muted);font-weight:400">${b.timeline_days ? b.timeline_days + ' days' : ''}</div>
                    </th>
                  `).join('')}
                </tr>
              </thead>
              <tbody>
                ${categories.map(cat => {
                  const hasData = bids.some(b => (b.by_category[cat] || 0) > 0);
                  if (!hasData) return '';
                  return `
                    <tr>
                      <td style="position:sticky;left:0;background:var(--card-bg);font-weight:600">${catLabels[cat] || cat}</td>
                      ${bids.map(b => {
                        const val = b.by_category[cat] || 0;
                        const isLowest = val > 0 && val <= lowestByCategory[cat];
                        return `<td style="text-align:right;${isLowest ? 'color:var(--success);font-weight:700' : ''}">
                          ${val > 0 ? '$' + val.toLocaleString() : '-'}
                          ${isLowest && bids.length > 1 ? ' <i data-lucide="check" style="width:14px;height:14px;color:var(--success)"></i>' : ''}
                        </td>`;
                      }).join('')}
                    </tr>
                  `;
                }).join('')}
                <tr style="border-top:2px solid var(--border);font-weight:700;font-size:15px">
                  <td style="position:sticky;left:0;background:var(--card-bg)">Total</td>
                  ${bids.map((b, i) => `
                    <td style="text-align:right;${i === 0 ? 'color:var(--success)' : ''}">
                      $${b.total_amount.toLocaleString()}
                      ${i === 0 ? ' <span class="bid-lowest">Best Price</span>' : ''}
                    </td>
                  `).join('')}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(${Math.min(bids.length, 3)}, 1fr);gap:16px;margin-top:20px">
          ${bids.map(b => `
            <div class="card">
              <div class="card-header"><h3>${b.vendor_name}</h3></div>
              <div class="card-body" style="font-size:13px">
                ${b.timeline_days ? `<p><strong>Timeline:</strong> ${b.timeline_days} days ${b.start_date ? '(starts ' + Dashboard.formatDate(b.start_date) + ')' : ''}</p>` : ''}
                ${b.warranty_terms ? `<p><strong>Warranty:</strong> ${b.warranty_terms}</p>` : ''}
                ${b.payment_terms ? `<p><strong>Payment:</strong> ${b.payment_terms}</p>` : ''}
                ${b.inclusions ? `<p style="color:var(--success)"><strong>Includes:</strong> ${b.inclusions}</p>` : ''}
                ${b.exclusions ? `<p style="color:var(--danger)"><strong>Excludes:</strong> ${b.exclusions}</p>` : ''}
                ${b.notes ? `<p><strong>Notes:</strong> ${b.notes}</p>` : ''}
                <div style="margin-top:12px">
                  ${!data.project.awarded_bid_id ? `
                    <button class="btn btn-sm btn-success" onclick="Projects.awardBid('${projectId}', '${b.id}', '${b.vendor_name}')">
                      <i data-lucide="trophy"></i> Award This Bid
                    </button>
                  ` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async awardBid(projectId, bidId, vendorName) {
    if (!confirm(`Award this project to ${vendorName}? This will create a Purchase Order and reject all other bids.`)) return;
    try {
      const result = await API.post(`/projects/${projectId}/award/${bidId}`);
      App.toast(`${result.message}. PO ${result.po_number} created.`, 'success');
      Projects.detail({ id: projectId });
    } catch (e) { App.toast(e.message, 'error'); }
  },

  async editBid(projectId, bidId) {
    App.toast('Edit bid coming soon', 'info');
  }
};
