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

  scoringCriteria: [
    { key: 'price', label: 'Price Competitiveness' },
    { key: 'technical', label: 'Technical Capability' },
    { key: 'timeline', label: 'Timeline Feasibility' },
    { key: 'reputation', label: 'Reputation & References' },
    { key: 'terms', label: 'Terms & Conditions' }
  ],

  statusFlow: ['draft', 'bidding', 'evaluating', 'awarded', 'in_progress', 'completed'],

  // ── List ──────────────────────────────────────────────────────────────

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

  // ── Tab switching ─────────────────────────────────────────────────────

  switchTab(el, tabId) {
    el.parentElement.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById(tabId);
    if (target) target.classList.add('active');
  },

  // ── Detail ────────────────────────────────────────────────────────────

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const project = await API.get(`/projects/${params.id}`);
      const bids = project.bids || [];
      const milestones = project.milestones || [];
      const changeOrders = project.change_orders || [];
      const invitedVendors = project.invited_vendors || [];
      const activities = project.activities || [];
      const statusColor = this.statusColors[project.status] || '#6B7280';
      const isActive = ['awarded', 'in_progress'].includes(project.status);
      const progress = project.progress || 0;

      // Compute quick stats
      const bidCount = bids.length;
      const bidTotals = bids.map(b => b.total_amount || 0).filter(a => a > 0);
      const avgBid = bidTotals.length ? bidTotals.reduce((s, v) => s + v, 0) / bidTotals.length : 0;
      const lowestBid = bidTotals.length ? Math.min(...bidTotals) : 0;
      const highestBid = bidTotals.length ? Math.max(...bidTotals) : 0;
      const bidSpread = highestBid - lowestBid;
      const deadlineDate = project.deadline ? new Date(project.deadline) : null;
      const daysUntilDeadline = deadlineDate ? Math.ceil((deadlineDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
      const lowestTimeline = bids.filter(b => b.timeline_days).map(b => b.timeline_days);
      const costPerDay = lowestBid && lowestTimeline.length ? (lowestBid / Math.min(...lowestTimeline)).toFixed(2) : null;

      // Change order total
      const coTotal = changeOrders.reduce((s, co) => s + (co.amount || 0), 0);
      const approvedCOTotal = changeOrders.filter(co => co.status === 'approved').reduce((s, co) => s + (co.amount || 0), 0);

      container.innerHTML = `
        <!-- Header -->
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/projects')"><i data-lucide="arrow-left"></i> Back</button>
            <h1>${project.title}</h1>
            <span class="badge" style="background:${statusColor}15;color:${statusColor};padding:6px 14px">${project.status}</span>
          </div>
          <div class="page-header-actions">
            <button class="btn btn-secondary btn-sm" onclick="Projects.changeProjectStatus('${params.id}', '${project.status}')">
              <i data-lucide="arrow-right-circle"></i> Status
            </button>
            ${!project.awarded_bid_id ? `
              <button class="btn btn-secondary btn-sm" onclick="Projects.inviteVendors('${params.id}')">
                <i data-lucide="user-plus"></i> Invite
              </button>
            ` : ''}
            ${!project.awarded_bid_id && bids.length >= 2 ? `
              <button class="btn btn-secondary btn-sm" onclick="Projects.showComparison('${params.id}')">
                <i data-lucide="columns-3"></i> Compare
              </button>
            ` : ''}
            ${!project.awarded_bid_id ? `
              <button class="btn btn-primary btn-sm" onclick="Projects.showAddBid('${params.id}')">
                <i data-lucide="plus"></i> Add Bid
              </button>
            ` : ''}
            ${project.purchase_order_id ? `
              <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/purchaseorders/${project.purchase_order_id}')">
                <i data-lucide="shopping-cart"></i> View PO
              </button>
            ` : ''}
            ${typeof QRCodes !== 'undefined' ? QRCodes.button('project', params.id, project.title, project.category || '') : ''}
          </div>
        </div>

        <!-- Progress bar -->
        ${isActive ? `
          <div class="card" style="margin-bottom:16px">
            <div class="card-body" style="padding:12px 16px">
              <div style="display:flex;align-items:center;gap:12px">
                <strong style="white-space:nowrap;font-size:13px">Progress</strong>
                <div style="flex:1;background:var(--border);border-radius:8px;height:20px;overflow:hidden;position:relative">
                  <div style="width:${progress}%;background:var(--primary);height:100%;border-radius:8px;transition:width 0.3s"></div>
                  <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:11px;font-weight:700;color:${progress > 45 ? '#fff' : 'var(--text)'}">${progress}%</span>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="Projects.updateProgress('${params.id}')">
                  <i data-lucide="sliders"></i> Update
                </button>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Quick stats row -->
        ${bidCount > 0 ? `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">
            <div class="card" style="text-align:center;padding:12px 8px">
              <div style="font-size:22px;font-weight:700;color:var(--primary)">${bidCount}</div>
              <div style="font-size:11px;color:var(--text-muted)">Total Bids</div>
            </div>
            <div class="card" style="text-align:center;padding:12px 8px">
              <div style="font-size:22px;font-weight:700;color:var(--primary)">$${Math.round(avgBid).toLocaleString()}</div>
              <div style="font-size:11px;color:var(--text-muted)">Average Bid</div>
            </div>
            <div class="card" style="text-align:center;padding:12px 8px">
              <div style="font-size:22px;font-weight:700;color:${bidSpread > 0 ? '#F59E0B' : 'var(--text)'}">$${Math.round(bidSpread).toLocaleString()}</div>
              <div style="font-size:11px;color:var(--text-muted)">Bid Spread</div>
            </div>
            <div class="card" style="text-align:center;padding:12px 8px">
              <div style="font-size:22px;font-weight:700;color:var(--text)">${project.budget_min || project.budget_max ? `$${(project.budget_min || 0).toLocaleString()} - $${(project.budget_max || 0).toLocaleString()}` : '-'}</div>
              <div style="font-size:11px;color:var(--text-muted)">Budget Range</div>
            </div>
            <div class="card" style="text-align:center;padding:12px 8px">
              <div style="font-size:22px;font-weight:700;color:${daysUntilDeadline !== null && daysUntilDeadline < 7 ? '#EF4444' : 'var(--text)'}">${daysUntilDeadline !== null ? (daysUntilDeadline >= 0 ? daysUntilDeadline + 'd' : Math.abs(daysUntilDeadline) + 'd ago') : '-'}</div>
              <div style="font-size:11px;color:var(--text-muted)">Deadline</div>
            </div>
            ${costPerDay ? `
              <div class="card" style="text-align:center;padding:12px 8px">
                <div style="font-size:22px;font-weight:700;color:var(--success)">$${parseFloat(costPerDay).toLocaleString()}</div>
                <div style="font-size:11px;color:var(--text-muted)">Cost/Day (Low)</div>
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Scope of Work -->
        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Scope of Work</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field"><label>Property</label><p>${project.property_name ? `<a href="#/properties/${project.property_id}">${project.property_name}</a>` : '-'}</p></div>
                <div class="detail-field"><label>Category</label><p>${project.category || '-'}</p></div>
                <div class="detail-field"><label>Budget Range</label><p>${project.budget_min || project.budget_max ? `$${(project.budget_min || 0).toLocaleString()} - $${(project.budget_max || 0).toLocaleString()}` : 'Not set'}</p></div>
                <div class="detail-field"><label>Deadline</label><p>${Dashboard.formatDate(project.deadline)}${daysUntilDeadline !== null ? ` <span style="font-size:12px;color:${daysUntilDeadline < 7 ? '#EF4444' : 'var(--text-muted)'}">(${daysUntilDeadline >= 0 ? daysUntilDeadline + ' days left' : Math.abs(daysUntilDeadline) + ' days overdue'})</span>` : ''}</p></div>
                ${project.description ? `<div class="detail-field detail-field-full"><label>Description</label><p>${project.description}</p></div>` : ''}
                ${project.scope_of_work ? `<div class="detail-field detail-field-full"><label>Detailed Scope</label><p style="white-space:pre-wrap">${project.scope_of_work}</p></div>` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- Awarded Bid -->
        ${project.awarded_bid_id ? `
          <div class="card" style="margin-bottom:20px;border:2px solid var(--success)">
            <div class="card-header" style="background:var(--success-bg)">
              <h3 style="color:var(--success)"><i data-lucide="trophy" style="width:18px;height:18px;vertical-align:middle"></i> Awarded Bid</h3>
            </div>
            <div class="card-body">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
                <div>
                  <strong style="font-size:16px">${project.awarded_bid?.vendor_name || 'Unknown'}</strong>
                  <div style="font-size:24px;font-weight:700;color:var(--success);margin-top:4px">$${(project.awarded_bid?.total_amount || 0).toLocaleString()}</div>
                  ${project.awarded_bid?.timeline_days ? `<div style="color:var(--text-muted);font-size:13px">${project.awarded_bid.timeline_days} day timeline</div>` : ''}
                  ${approvedCOTotal ? `<div style="color:#F59E0B;font-size:13px;margin-top:4px">+ $${approvedCOTotal.toLocaleString()} in change orders (adjusted: $${((project.awarded_bid?.total_amount || 0) + approvedCOTotal).toLocaleString()})</div>` : ''}
                </div>
                ${project.purchase_order_id ? `
                  <a href="#/purchaseorders/${project.purchase_order_id}" class="btn btn-success">View Purchase Order</a>
                ` : ''}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Tabs -->
        <div class="tabs" style="margin-bottom:0">
          <button class="tab active" onclick="Projects.switchTab(this, 'bids-tab')">Bids (${bidCount})</button>
          ${bids.length >= 2 ? `<button class="tab" onclick="Projects.switchTab(this, 'comparison-tab')">Comparison</button>` : ''}
          <button class="tab" onclick="Projects.switchTab(this, 'scoring-tab')">Scoring</button>
          <button class="tab" onclick="Projects.switchTab(this, 'milestones-tab')">Milestones (${milestones.length})</button>
          <button class="tab" onclick="Projects.switchTab(this, 'changeorders-tab')">Change Orders (${changeOrders.length})</button>
          <button class="tab" onclick="Projects.switchTab(this, 'activity-tab')">Activity</button>
        </div>

        <!-- Bids Tab -->
        <div id="bids-tab" class="tab-content active">
          <div class="card" style="border-top-left-radius:0;border-top-right-radius:0">
            <div class="card-body">
              ${bids.length === 0 ? `
                <div class="empty-state-sm">No bids yet. Add bids from your vendors to start comparing.</div>
              ` : `
                <div class="bid-cards">
                  ${bids.map((bid, i) => {
                    const bidCostPerDay = bid.total_amount && bid.timeline_days ? (bid.total_amount / bid.timeline_days).toFixed(2) : null;
                    const scoreAvg = bid.scores && bid.scores.length ? (bid.scores.reduce((s, sc) => s + (sc.score || 0), 0) / bid.scores.length).toFixed(1) : null;
                    return `
                    <div class="bid-card ${bid.status === 'selected' ? 'bid-card-selected' : bid.status === 'rejected' ? 'bid-card-rejected' : ''}">
                      <div class="bid-card-header">
                        <div>
                          <strong>${bid.vendor_name}</strong>
                          ${bid.vendor_specialty ? `<span class="text-muted" style="font-size:12px;margin-left:8px">${bid.vendor_specialty}</span>` : ''}
                        </div>
                        <div style="display:flex;align-items:center;gap:8px">
                          ${scoreAvg ? `<span style="font-size:12px;color:#F59E0B">${Projects._renderStarsInline(parseFloat(scoreAvg))} ${scoreAvg}</span>` : ''}
                          ${bid.comment_count ? `<span class="badge" style="background:#3B82F615;color:#3B82F6;font-size:11px"><i data-lucide="message-square" style="width:12px;height:12px;vertical-align:middle"></i> ${bid.comment_count}</span>` : ''}
                          <span class="badge" style="background:${bid.status === 'selected' ? '#10B981' : bid.status === 'rejected' ? '#EF4444' : '#3B82F6'}15;color:${bid.status === 'selected' ? '#10B981' : bid.status === 'rejected' ? '#EF4444' : '#3B82F6'}">${bid.status}</span>
                        </div>
                      </div>
                      <div class="bid-card-amount">
                        <span class="bid-amount">$${bid.total_amount.toLocaleString()}</span>
                        ${i === 0 && bids.length > 1 ? '<span class="bid-lowest">Lowest</span>' : ''}
                        ${bidCostPerDay ? `<span style="font-size:12px;color:var(--text-muted);margin-left:8px">($${parseFloat(bidCostPerDay).toLocaleString()}/day)</span>` : ''}
                      </div>
                      <div class="bid-card-details">
                        ${bid.timeline_days ? `<span><i data-lucide="clock" class="icon-xs"></i> ${bid.timeline_days} days</span>` : ''}
                        ${bid.warranty_terms ? `<span><i data-lucide="shield" class="icon-xs"></i> ${bid.warranty_terms}</span>` : ''}
                        ${bid.payment_terms ? `<span><i data-lucide="credit-card" class="icon-xs"></i> ${bid.payment_terms}</span>` : ''}
                      </div>
                      ${bid.items && bid.items.length > 0 ? `
                        <div class="bid-card-breakdown">
                          ${Object.entries(Projects.categoryLabels).map(([cat, label]) => {
                            const catTotal = bid.items.filter(it => it.category === cat).reduce((s, it) => s + it.amount, 0);
                            return catTotal > 0 ? `<div class="bid-cat-row"><span>${label}</span><span>$${catTotal.toLocaleString()}</span></div>` : '';
                          }).join('')}
                        </div>
                      ` : ''}
                      ${bid.inclusions ? `<div class="bid-terms"><strong>Includes:</strong> ${bid.inclusions}</div>` : ''}
                      ${bid.exclusions ? `<div class="bid-terms bid-terms-warn"><strong>Excludes:</strong> ${bid.exclusions}</div>` : ''}
                      ${bid.status === 'rejected' && bid.rejection_reason ? `<div class="bid-terms bid-terms-warn" style="border-color:#EF4444"><strong>Rejection Reason:</strong> ${bid.rejection_reason}</div>` : ''}
                      <div class="bid-card-actions" style="flex-wrap:wrap">
                        ${!project.awarded_bid_id && bid.status !== 'rejected' ? `
                          <button class="btn btn-sm btn-success" onclick="Projects.awardBid('${params.id}', '${bid.id}', '${bid.vendor_name.replace(/'/g, "\\'")}')">
                            <i data-lucide="trophy"></i> Award
                          </button>
                        ` : ''}
                        <button class="btn btn-sm btn-secondary" onclick="Projects.scoreBid('${params.id}', '${bid.id}', '${bid.vendor_name.replace(/'/g, "\\'")}')">
                          <i data-lucide="star"></i> Score
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="Projects.showBidComments('${params.id}', '${bid.id}', '${bid.vendor_name.replace(/'/g, "\\'")}')">
                          <i data-lucide="message-square"></i> Comment
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="Projects.editBid('${params.id}', '${bid.id}')">
                          <i data-lucide="edit"></i> Edit
                        </button>
                        <button class="btn btn-sm btn-secondary" onclick="Projects.duplicateBid('${params.id}', '${bid.id}')">
                          <i data-lucide="copy"></i> Duplicate
                        </button>
                        ${!project.awarded_bid_id && bid.status !== 'rejected' ? `
                          <button class="btn btn-sm btn-danger" onclick="Projects.rejectBid('${params.id}', '${bid.id}', '${bid.vendor_name.replace(/'/g, "\\'")}')">
                            <i data-lucide="x-circle"></i> Reject
                          </button>
                        ` : ''}
                      </div>
                    </div>
                  `}).join('')}
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- Comparison Tab -->
        ${bids.length >= 2 ? `
          <div id="comparison-tab" class="tab-content">
            <div class="card" style="border-top-left-radius:0;border-top-right-radius:0">
              <div class="card-header">
                <h3>Bid Comparison</h3>
                <div style="display:flex;gap:8px">
                  <button class="btn btn-sm btn-secondary" onclick="Projects.printComparison('${params.id}')"><i data-lucide="printer"></i> Print</button>
                  <button class="btn btn-sm btn-secondary" onclick="Projects.shareComparison('${params.id}')"><i data-lucide="share-2"></i> Share</button>
                </div>
              </div>
              <div class="card-body no-padding" id="comparison-table-container">
                <div class="loading"><div class="spinner"></div><p>Load comparison tab to see data...</p></div>
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Scoring Tab -->
        <div id="scoring-tab" class="tab-content">
          <div class="card" style="border-top-left-radius:0;border-top-right-radius:0">
            <div class="card-header"><h3>Scoring Matrix</h3></div>
            <div class="card-body">
              ${bids.length === 0 ? `<div class="empty-state-sm">No bids to score.</div>` : `
                <div style="overflow-x:auto">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Criteria</th>
                        ${bids.map(b => `<th style="text-align:center">${b.vendor_name}</th>`).join('')}
                      </tr>
                    </thead>
                    <tbody>
                      ${Projects.scoringCriteria.map(c => `
                        <tr>
                          <td style="font-weight:600">${c.label}</td>
                          ${bids.map(b => {
                            const sc = (b.scores || []).find(s => s.criteria === c.key);
                            const val = sc ? sc.score : null;
                            return `<td style="text-align:center">${val ? Projects._renderStarsInline(val) + ' ' + val : '<span style="color:var(--text-muted)">--</span>'}</td>`;
                          }).join('')}
                        </tr>
                      `).join('')}
                      <tr style="border-top:2px solid var(--border);font-weight:700">
                        <td>Average</td>
                        ${bids.map(b => {
                          const scores = (b.scores || []).filter(s => s.score);
                          const avg = scores.length ? (scores.reduce((s, sc) => s + sc.score, 0) / scores.length).toFixed(1) : '--';
                          return `<td style="text-align:center">${avg}</td>`;
                        }).join('')}
                      </tr>
                    </tbody>
                  </table>
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- Milestones Tab -->
        <div id="milestones-tab" class="tab-content">
          <div class="card" style="border-top-left-radius:0;border-top-right-radius:0">
            <div class="card-header">
              <h3>Milestones</h3>
              <button class="btn btn-sm btn-primary" onclick="Projects.showAddMilestone('${params.id}')"><i data-lucide="plus"></i> Add Milestone</button>
            </div>
            <div class="card-body">
              ${milestones.length === 0 ? `<div class="empty-state-sm">No milestones yet. Add milestones to track project progress.</div>` : `
                <div style="display:flex;flex-direction:column;gap:12px">
                  ${milestones.map(ms => `
                    <div style="display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid var(--border);border-radius:8px;${ms.completed_at ? 'opacity:0.7' : ''}">
                      <div style="width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;${ms.completed_at ? 'background:#10B98115;color:#10B981' : 'background:var(--primary-lighter);color:var(--primary)'}">
                        <i data-lucide="${ms.completed_at ? 'check-circle' : 'circle'}" style="width:18px;height:18px"></i>
                      </div>
                      <div style="flex:1">
                        <strong style="${ms.completed_at ? 'text-decoration:line-through' : ''}">${ms.title}</strong>
                        ${ms.description ? `<p style="font-size:13px;color:var(--text-muted);margin:4px 0 0">${ms.description}</p>` : ''}
                        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">
                          ${ms.due_date ? `Due: ${Dashboard.formatDate(ms.due_date)}` : ''}
                          ${ms.completed_at ? ` | Completed: ${Dashboard.formatDate(ms.completed_at)}` : ''}
                        </div>
                      </div>
                      ${!ms.completed_at ? `
                        <button class="btn btn-sm btn-success" onclick="Projects.completeMilestone('${params.id}', '${ms.id}')">
                          <i data-lucide="check"></i> Complete
                        </button>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- Change Orders Tab -->
        <div id="changeorders-tab" class="tab-content">
          <div class="card" style="border-top-left-radius:0;border-top-right-radius:0">
            <div class="card-header">
              <h3>Change Orders</h3>
              <button class="btn btn-sm btn-primary" onclick="Projects.showAddChangeOrder('${params.id}')"><i data-lucide="plus"></i> Add Change Order</button>
            </div>
            <div class="card-body">
              ${changeOrders.length === 0 ? `<div class="empty-state-sm">No change orders. Change orders track scope or cost adjustments after a bid is awarded.</div>` : `
                <div style="margin-bottom:12px;padding:10px 14px;background:var(--primary-lighter);border-radius:8px;font-size:13px">
                  <strong>Total Impact:</strong> $${coTotal.toLocaleString()} (${changeOrders.filter(co => co.status === 'approved').length} approved: $${approvedCOTotal.toLocaleString()})
                </div>
                <table class="table">
                  <thead>
                    <tr><th>Title</th><th>Amount</th><th>Status</th><th>Created</th><th></th></tr>
                  </thead>
                  <tbody>
                    ${changeOrders.map(co => `
                      <tr>
                        <td>
                          <strong>${co.title}</strong>
                          ${co.description ? `<br><span style="font-size:12px;color:var(--text-muted)">${co.description}</span>` : ''}
                        </td>
                        <td style="font-weight:600;color:${co.amount >= 0 ? '#EF4444' : '#10B981'}">
                          ${co.amount >= 0 ? '+' : ''}$${Math.abs(co.amount || 0).toLocaleString()}
                        </td>
                        <td>
                          <span class="badge" style="background:${co.status === 'approved' ? '#10B981' : co.status === 'rejected' ? '#EF4444' : '#F59E0B'}15;color:${co.status === 'approved' ? '#10B981' : co.status === 'rejected' ? '#EF4444' : '#F59E0B'}">${co.status || 'pending'}</span>
                        </td>
                        <td>${Dashboard.formatDate(co.created_at)}</td>
                        <td>
                          ${co.status === 'pending' ? `
                            <button class="btn btn-sm btn-success" onclick="Projects.approveChangeOrder('${params.id}', '${co.id}')">
                              <i data-lucide="check"></i> Approve
                            </button>
                          ` : ''}
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>
          </div>
        </div>

        <!-- Activity Tab -->
        <div id="activity-tab" class="tab-content">
          <div class="card" style="border-top-left-radius:0;border-top-right-radius:0">
            <div class="card-header"><h3>Activity Feed</h3></div>
            <div class="card-body">
              ${activities.length === 0 ? `<div class="empty-state-sm">No activity recorded yet.</div>` : `
                <div style="display:flex;flex-direction:column;gap:8px">
                  ${activities.map(a => `
                    <div style="display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                      <div style="width:28px;height:28px;border-radius:50%;background:var(--primary-lighter);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                        <i data-lucide="${a.icon || 'activity'}" style="width:14px;height:14px;color:var(--primary)"></i>
                      </div>
                      <div style="flex:1">
                        <div style="font-size:13px">${a.description || a.message || ''}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${a.user_name ? a.user_name + ' - ' : ''}${Dashboard.formatDate(a.created_at)}</div>
                      </div>
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        </div>

        <!-- Invited Vendors -->
        ${invitedVendors.length > 0 ? `
          <div class="card" style="margin-top:16px">
            <div class="card-header"><h3>Invited Vendors</h3></div>
            <div class="card-body">
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${invitedVendors.map(v => `
                  <span class="badge" style="background:var(--primary-lighter);color:var(--primary);padding:6px 12px;font-size:13px">
                    <i data-lucide="user" style="width:14px;height:14px;vertical-align:middle;margin-right:4px"></i> ${v.vendor_name || v.name}
                    ${v.status ? `<span style="margin-left:4px;opacity:0.7">(${v.status})</span>` : ''}
                  </span>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        ${Attachments.placeholder('project', params.id)}
      `;

      // Lazy-load comparison data into the inline tab
      if (bids.length >= 2) {
        this._loadInlineComparison(params.id);
      }

      lucide.createIcons();
      Attachments.load('project', params.id);
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  // ── Inline comparison loader for tab ──────────────────────────────────

  async _loadInlineComparison(projectId) {
    const el = document.getElementById('comparison-table-container');
    if (!el) return;
    try {
      const data = await API.get(`/projects/${projectId}/compare`);
      const { bids, categories, lowestByCategory, project } = data;
      const catLabels = this.categoryLabels;

      el.innerHTML = `
        <table class="table compare-table" id="comparison-print-area">
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
      `;
      lucide.createIcons();
    } catch (e) {
      el.innerHTML = `<p style="padding:16px" class="text-danger">${e.message}</p>`;
    }
  },

  // ── Inline star rendering ─────────────────────────────────────────────

  _renderStarsInline(score) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
      html += i <= Math.round(score) ? '<i data-lucide="star" style="width:14px;height:14px;fill:#F59E0B;color:#F59E0B;vertical-align:middle"></i>' : '<i data-lucide="star" style="width:14px;height:14px;color:#D1D5DB;vertical-align:middle"></i>';
    }
    return html;
  },

  // ── Form (New Project) ────────────────────────────────────────────────

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

  // ── Handle Create ─────────────────────────────────────────────────────

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

  // ── Bid Item Row HTML ─────────────────────────────────────────────────

  _bidItemRowHTML(item) {
    return `
      <div class="bid-item-row">
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <select class="form-control bi-cat">
              <option value="materials" ${item && item.category === 'materials' ? 'selected' : ''}>Materials</option>
              <option value="labor" ${item && item.category === 'labor' ? 'selected' : ''}>Labor</option>
              <option value="equipment" ${item && item.category === 'equipment' ? 'selected' : ''}>Equipment</option>
              <option value="permits" ${item && item.category === 'permits' ? 'selected' : ''}>Permits</option>
              <option value="subcontractors" ${item && item.category === 'subcontractors' ? 'selected' : ''}>Subcontractors</option>
              <option value="overhead" ${item && item.category === 'overhead' ? 'selected' : ''}>Overhead</option>
              <option value="other" ${item && item.category === 'other' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group" style="flex:2"><input type="text" class="form-control bi-desc" placeholder="Description" required value="${item ? (item.description || '') : ''}"></div>
          <div class="form-group" style="flex:0.5"><input type="number" class="form-control bi-qty" value="${item ? (item.quantity || 1) : 1}" min="0" step="any"></div>
          <div class="form-group" style="flex:0.7"><input type="number" class="form-control bi-cost" placeholder="Cost" step="0.01" min="0" value="${item ? (item.unit_cost || '') : ''}"></div>
          <button type="button" class="btn btn-sm btn-danger" onclick="this.closest('.bid-item-row').remove()" style="margin-top:22px"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
    `;
  },

  // ── Bid form body (shared between add and edit) ───────────────────────

  _bidFormBody(projectId, bid, vendors, isEdit) {
    const submitHandler = isEdit
      ? `Projects.handleEditBid(event, '${projectId}', '${bid.id}')`
      : `Projects.handleAddBid(event, '${projectId}')`;
    const submitLabel = isEdit ? 'Update Bid' : 'Submit Bid';
    const items = (bid && bid.items && bid.items.length) ? bid.items : [null];

    return `
      <form id="bid-form" onsubmit="${submitHandler}">
        <div class="form-row">
          <div class="form-group">
            <label>Vendor *</label>
            <select id="bid-vendor" class="form-control" required ${isEdit ? 'disabled' : ''}>
              <option value="">Select vendor...</option>
              ${vendors.map(v => `<option value="${v.id}" ${bid && bid.vendor_id == v.id ? 'selected' : ''}>${v.name}${v.specialty ? ' (' + v.specialty + ')' : ''}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Timeline (days)</label>
            <input type="number" id="bid-timeline" class="form-control" min="1" placeholder="e.g., 30" value="${bid && bid.timeline_days ? bid.timeline_days : ''}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Start Date</label>
            <input type="date" id="bid-start" class="form-control" value="${bid && bid.start_date ? bid.start_date.substring(0, 10) : ''}">
          </div>
          <div class="form-group">
            <label>Completion Date</label>
            <input type="date" id="bid-completion" class="form-control" value="${bid && bid.completion_date ? bid.completion_date.substring(0, 10) : ''}">
          </div>
        </div>

        <h4 style="margin:16px 0 8px;font-size:14px">Line Items</h4>
        <div id="bid-items-list">
          ${items.map(it => this._bidItemRowHTML(it)).join('')}
        </div>
        <button type="button" class="btn btn-sm btn-secondary" onclick="Projects.addBidItemRow()" style="margin:8px 0 16px">
          <i data-lucide="plus"></i> Add Line
        </button>

        <div class="form-group"><label>Warranty Terms</label><input type="text" id="bid-warranty" class="form-control" placeholder="e.g., 2-year parts and labor" value="${bid && bid.warranty_terms ? bid.warranty_terms : ''}"></div>
        <div class="form-group"><label>Payment Terms</label><input type="text" id="bid-payment" class="form-control" placeholder="e.g., 50% upfront, 50% on completion" value="${bid && bid.payment_terms ? bid.payment_terms : ''}"></div>
        <div class="form-group"><label>Inclusions</label><textarea id="bid-inclusions" class="form-control" rows="2" placeholder="What's included in this bid...">${bid && bid.inclusions ? bid.inclusions : ''}</textarea></div>
        <div class="form-group"><label>Exclusions</label><textarea id="bid-exclusions" class="form-control" rows="2" placeholder="What's NOT included...">${bid && bid.exclusions ? bid.exclusions : ''}</textarea></div>
        <div class="form-group"><label>Notes</label><textarea id="bid-notes" class="form-control" rows="2">${bid && bid.notes ? bid.notes : ''}</textarea></div>

        <div id="bid-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="bid-submit">${submitLabel}</button>
        </div>
      </form>
    `;
  },

  // ── Show Add Bid ──────────────────────────────────────────────────────

  async showAddBid(projectId) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Add Vendor Bid';
    modal.querySelector('.modal-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    try {
      const vendorData = await API.get('/vendors');
      const vendors = Array.isArray(vendorData) ? vendorData : (vendorData.data || []);

      modal.querySelector('.modal-body').innerHTML = this._bidFormBody(projectId, null, vendors, false);
      lucide.createIcons();
    } catch (e) {
      modal.querySelector('.modal-body').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  },

  // ── Add Bid Item Row ──────────────────────────────────────────────────

  addBidItemRow() {
    const container = document.getElementById('bid-items-list');
    if (!container) return;
    const div = document.createElement('div');
    div.innerHTML = this._bidItemRowHTML(null);
    const row = div.firstElementChild;
    container.appendChild(row);
    lucide.createIcons({ nodes: [row] });
  },

  // ── Collect bid items from form ───────────────────────────────────────

  _collectBidItems() {
    const items = [];
    document.querySelectorAll('.bid-item-row').forEach(row => {
      const desc = row.querySelector('.bi-desc').value;
      const qty = parseFloat(row.querySelector('.bi-qty').value) || 1;
      const cost = parseFloat(row.querySelector('.bi-cost').value) || 0;
      const cat = row.querySelector('.bi-cat').value;
      if (desc) items.push({ category: cat, description: desc, quantity: qty, unit_cost: cost });
    });
    return items;
  },

  _collectBidPayload() {
    return {
      vendor_id: parseInt(document.getElementById('bid-vendor').value),
      timeline_days: parseInt(document.getElementById('bid-timeline').value) || null,
      start_date: document.getElementById('bid-start').value || null,
      completion_date: document.getElementById('bid-completion').value || null,
      warranty_terms: document.getElementById('bid-warranty').value || null,
      payment_terms: document.getElementById('bid-payment').value || null,
      inclusions: document.getElementById('bid-inclusions').value || null,
      exclusions: document.getElementById('bid-exclusions').value || null,
      notes: document.getElementById('bid-notes').value || null,
      items: this._collectBidItems()
    };
  },

  // ── Handle Add Bid ────────────────────────────────────────────────────

  async handleAddBid(e, projectId) {
    e.preventDefault();
    const btn = document.getElementById('bid-submit');
    const errorEl = document.getElementById('bid-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Submitting...';
    try {
      await API.post(`/projects/${projectId}/bids`, this._collectBidPayload());
      App.closeModal();
      App.toast('Bid added', 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Submit Bid'; }
  },

  // ── Edit Bid (full modal, pre-populated) ──────────────────────────────

  async editBid(projectId, bidId) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Edit Bid';
    modal.querySelector('.modal-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    try {
      const [bid, vendorData] = await Promise.all([
        API.get(`/projects/${projectId}/bids/${bidId}`),
        API.get('/vendors')
      ]);
      const vendors = Array.isArray(vendorData) ? vendorData : (vendorData.data || []);

      modal.querySelector('.modal-body').innerHTML = this._bidFormBody(projectId, bid, vendors, true);
      lucide.createIcons();
    } catch (e) {
      modal.querySelector('.modal-body').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  },

  async handleEditBid(e, projectId, bidId) {
    e.preventDefault();
    const btn = document.getElementById('bid-submit');
    const errorEl = document.getElementById('bid-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Updating...';
    try {
      const payload = this._collectBidPayload();
      await API.put(`/projects/${projectId}/bids/${bidId}`, payload);
      App.closeModal();
      App.toast('Bid updated', 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Update Bid'; }
  },

  // ── Score Bid ─────────────────────────────────────────────────────────

  async scoreBid(projectId, bidId, vendorName) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = `Score Bid: ${vendorName}`;
    modal.querySelector('.modal-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    try {
      let existingScores = {};
      try {
        const bid = await API.get(`/projects/${projectId}/bids/${bidId}`);
        if (bid.scores) {
          bid.scores.forEach(s => { existingScores[s.criteria] = s.score; });
        }
      } catch (_) { /* no existing scores */ }

      modal.querySelector('.modal-body').innerHTML = `
        <form id="score-form" onsubmit="Projects.handleScoreBid(event, '${projectId}', '${bidId}')">
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Rate each criterion from 1 to 5 stars. Click a star to set the rating.</p>
          ${this.scoringCriteria.map(c => `
            <div style="margin-bottom:16px">
              <label style="display:block;font-weight:600;margin-bottom:6px">${c.label}</label>
              <div class="star-rating" data-criteria="${c.key}" style="display:flex;gap:4px;cursor:pointer">
                ${[1,2,3,4,5].map(n => `
                  <span class="star-btn" data-value="${n}" onclick="Projects._setStarRating(this)" style="font-size:24px;color:${existingScores[c.key] && n <= existingScores[c.key] ? '#F59E0B' : '#D1D5DB'};transition:color 0.15s">
                    <i data-lucide="star" style="width:24px;height:24px;${existingScores[c.key] && n <= existingScores[c.key] ? 'fill:#F59E0B;color:#F59E0B' : 'fill:none;color:#D1D5DB'}"></i>
                  </span>
                `).join('')}
                <input type="hidden" name="score-${c.key}" value="${existingScores[c.key] || ''}">
              </div>
            </div>
          `).join('')}

          <div id="score-form-error" class="form-error" style="display:none"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="score-submit">Save Scores</button>
          </div>
        </form>
      `;
      lucide.createIcons();
    } catch (e) {
      modal.querySelector('.modal-body').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  },

  _setStarRating(el) {
    const value = parseInt(el.dataset.value);
    const container = el.closest('.star-rating');
    const criteria = container.dataset.criteria;
    container.querySelector(`input[name="score-${criteria}"]`).value = value;
    container.querySelectorAll('.star-btn').forEach(star => {
      const v = parseInt(star.dataset.value);
      const icon = star.querySelector('i');
      if (v <= value) {
        star.style.color = '#F59E0B';
        if (icon) { icon.style.fill = '#F59E0B'; icon.style.color = '#F59E0B'; }
      } else {
        star.style.color = '#D1D5DB';
        if (icon) { icon.style.fill = 'none'; icon.style.color = '#D1D5DB'; }
      }
    });
  },

  async handleScoreBid(e, projectId, bidId) {
    e.preventDefault();
    const btn = document.getElementById('score-submit');
    const errorEl = document.getElementById('score-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Saving...';
    try {
      const scores = {};
      this.scoringCriteria.forEach(c => {
        const val = document.querySelector(`input[name="score-${c.key}"]`).value;
        if (val) scores[c.key] = parseInt(val);
      });
      if (Object.keys(scores).length === 0) throw new Error('Please rate at least one criterion');
      await API.post(`/projects/${projectId}/bids/${bidId}/scores`, { scores });
      App.closeModal();
      App.toast('Scores saved', 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Save Scores'; }
  },

  // ── Reject Bid ────────────────────────────────────────────────────────

  async rejectBid(projectId, bidId, vendorName) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = `Reject Bid: ${vendorName}`;
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    modal.querySelector('.modal-body').innerHTML = `
      <form id="reject-form" onsubmit="Projects.handleRejectBid(event, '${projectId}', '${bidId}')">
        <p style="margin-bottom:12px">Are you sure you want to reject this bid from <strong>${vendorName}</strong>?</p>
        <div class="form-group">
          <label>Reason (optional)</label>
          <textarea id="reject-reason" class="form-control" rows="3" placeholder="Reason for rejection..."></textarea>
        </div>
        <div id="reject-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-danger" id="reject-submit">Reject Bid</button>
        </div>
      </form>
    `;
  },

  async handleRejectBid(e, projectId, bidId) {
    e.preventDefault();
    const btn = document.getElementById('reject-submit');
    const errorEl = document.getElementById('reject-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Rejecting...';
    try {
      await API.post(`/projects/${projectId}/bids/${bidId}/reject`, {
        reason: document.getElementById('reject-reason').value || null
      });
      App.closeModal();
      App.toast('Bid rejected', 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Reject Bid'; }
  },

  // ── Bid Comments ──────────────────────────────────────────────────────

  async showBidComments(projectId, bidId, vendorName) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = `Comments: ${vendorName}`;
    modal.querySelector('.modal-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    try {
      const data = await API.get(`/projects/${projectId}/bids/${bidId}/comments`);
      const comments = Array.isArray(data) ? data : (data.comments || []);

      modal.querySelector('.modal-body').innerHTML = `
        <div id="comments-list" style="max-height:350px;overflow-y:auto;margin-bottom:16px">
          ${comments.length === 0 ? '<p style="color:var(--text-muted);font-size:13px">No comments yet.</p>' : `
            ${comments.map(c => `
              <div style="display:flex;gap:10px;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border)">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-lighter);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                  <i data-lucide="user" style="width:16px;height:16px;color:var(--primary)"></i>
                </div>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:600">${c.user_name || 'User'} <span style="font-weight:400;color:var(--text-muted);font-size:11px">${Dashboard.formatDate(c.created_at)}</span></div>
                  <div style="font-size:13px;margin-top:4px">${c.content || c.text || ''}</div>
                </div>
              </div>
            `).join('')}
          `}
        </div>

        <form id="comment-form" onsubmit="Projects.addComment(event, '${projectId}', '${bidId}')">
          <div class="form-group">
            <textarea id="comment-text" class="form-control" rows="2" placeholder="Add a comment..." required></textarea>
          </div>
          <div id="comment-form-error" class="form-error" style="display:none"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Close</button>
            <button type="submit" class="btn btn-primary" id="comment-submit">Add Comment</button>
          </div>
        </form>
      `;
      lucide.createIcons();
    } catch (e) {
      modal.querySelector('.modal-body').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  },

  async addComment(e, projectId, bidId) {
    e.preventDefault();
    const btn = document.getElementById('comment-submit');
    const errorEl = document.getElementById('comment-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Posting...';
    try {
      const content = document.getElementById('comment-text').value;
      if (!content.trim()) throw new Error('Comment cannot be empty');
      await API.post(`/projects/${projectId}/bids/${bidId}/comments`, { content });
      App.toast('Comment added', 'success');
      // Reload comments
      const vendorName = document.querySelector('.modal-title').textContent.replace('Comments: ', '');
      Projects.showBidComments(projectId, bidId, vendorName);
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Add Comment'; }
  },

  // ── Change Project Status ─────────────────────────────────────────────

  async changeProjectStatus(projectId, currentStatus) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Change Project Status';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    const flow = this.statusFlow;
    const currentIdx = flow.indexOf(currentStatus);

    modal.querySelector('.modal-body').innerHTML = `
      <form id="status-form" onsubmit="Projects.handleChangeStatus(event, '${projectId}')">
        <p style="margin-bottom:12px;font-size:13px;color:var(--text-muted)">Select the new status for this project.</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
          ${flow.map((s, i) => {
            const color = this.statusColors[s];
            const isCurrent = s === currentStatus;
            const isPast = i < currentIdx;
            return `
              <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;border:2px solid ${isCurrent ? color : 'var(--border)'};border-radius:8px;cursor:pointer;${isCurrent ? 'background:' + color + '10' : ''}">
                <input type="radio" name="new-status" value="${s}" ${isCurrent ? 'checked' : ''} style="accent-color:${color}">
                <span class="badge" style="background:${color}15;color:${color}">${s}</span>
                ${isPast ? '<span style="font-size:11px;color:var(--text-muted)">completed</span>' : ''}
                ${isCurrent ? '<span style="font-size:11px;font-weight:600;color:' + color + '">current</span>' : ''}
              </label>
            `;
          }).join('')}
        </div>
        <div id="status-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="status-submit">Update Status</button>
        </div>
      </form>
    `;
  },

  async handleChangeStatus(e, projectId) {
    e.preventDefault();
    const btn = document.getElementById('status-submit');
    const errorEl = document.getElementById('status-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Updating...';
    try {
      const selected = document.querySelector('input[name="new-status"]:checked');
      if (!selected) throw new Error('Please select a status');
      await API.post(`/projects/${projectId}/status`, { status: selected.value });
      App.closeModal();
      App.toast('Status updated', 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Update Status'; }
  },

  // ── Update Progress ───────────────────────────────────────────────────

  async updateProgress(projectId) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Update Progress';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    let currentProgress = 0;
    try {
      const project = await API.get(`/projects/${projectId}`);
      currentProgress = project.progress || 0;
    } catch (_) { /* use default */ }

    modal.querySelector('.modal-body').innerHTML = `
      <form id="progress-form" onsubmit="Projects.handleUpdateProgress(event, '${projectId}')">
        <div class="form-group">
          <label>Completion Percentage</label>
          <div style="display:flex;align-items:center;gap:12px">
            <input type="range" id="progress-slider" class="form-control" min="0" max="100" step="5" value="${currentProgress}" oninput="document.getElementById('progress-value').textContent = this.value + '%'" style="flex:1">
            <span id="progress-value" style="font-size:18px;font-weight:700;min-width:50px;text-align:center">${currentProgress}%</span>
          </div>
        </div>
        <div id="progress-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="progress-submit">Update</button>
        </div>
      </form>
    `;
  },

  async handleUpdateProgress(e, projectId) {
    e.preventDefault();
    const btn = document.getElementById('progress-submit');
    const errorEl = document.getElementById('progress-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Updating...';
    try {
      const progress = parseInt(document.getElementById('progress-slider').value);
      await API.post(`/projects/${projectId}/progress`, { progress });
      App.closeModal();
      App.toast('Progress updated', 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Update'; }
  },

  // ── Add Milestone ─────────────────────────────────────────────────────

  async showAddMilestone(projectId) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Add Milestone';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    modal.querySelector('.modal-body').innerHTML = `
      <form id="milestone-form" onsubmit="Projects.handleAddMilestone(event, '${projectId}')">
        <div class="form-group">
          <label>Title *</label>
          <input type="text" id="ms-title" class="form-control" required placeholder="e.g., Foundation Complete">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="ms-description" class="form-control" rows="2" placeholder="Details about this milestone..."></textarea>
        </div>
        <div class="form-group">
          <label>Due Date</label>
          <input type="date" id="ms-due-date" class="form-control">
        </div>
        <div id="ms-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="ms-submit">Add Milestone</button>
        </div>
      </form>
    `;
  },

  async handleAddMilestone(e, projectId) {
    e.preventDefault();
    const btn = document.getElementById('ms-submit');
    const errorEl = document.getElementById('ms-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Adding...';
    try {
      await API.post(`/projects/${projectId}/milestones`, {
        title: document.getElementById('ms-title').value,
        description: document.getElementById('ms-description').value || null,
        due_date: document.getElementById('ms-due-date').value || null
      });
      App.closeModal();
      App.toast('Milestone added', 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Add Milestone'; }
  },

  // ── Complete Milestone ────────────────────────────────────────────────

  async completeMilestone(projectId, milestoneId) {
    if (!confirm('Mark this milestone as complete?')) return;
    try {
      await API.post(`/projects/${projectId}/milestones/${milestoneId}/complete`);
      App.toast('Milestone completed', 'success');
      Projects.detail({ id: projectId });
    } catch (e) { App.toast(e.message, 'error'); }
  },

  // ── Add Change Order ──────────────────────────────────────────────────

  async showAddChangeOrder(projectId) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Add Change Order';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    modal.querySelector('.modal-body').innerHTML = `
      <form id="co-form" onsubmit="Projects.handleAddChangeOrder(event, '${projectId}')">
        <div class="form-group">
          <label>Title *</label>
          <input type="text" id="co-title" class="form-control" required placeholder="e.g., Additional wiring for east wing">
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="co-description" class="form-control" rows="2" placeholder="Describe the scope change..."></textarea>
        </div>
        <div class="form-group">
          <label>Amount ($) *</label>
          <input type="number" id="co-amount" class="form-control" step="0.01" required placeholder="e.g., 2500 (positive for addition, negative for credit)">
        </div>
        <div id="co-form-error" class="form-error" style="display:none"></div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" id="co-submit">Add Change Order</button>
        </div>
      </form>
    `;
  },

  async handleAddChangeOrder(e, projectId) {
    e.preventDefault();
    const btn = document.getElementById('co-submit');
    const errorEl = document.getElementById('co-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Adding...';
    try {
      await API.post(`/projects/${projectId}/change-orders`, {
        title: document.getElementById('co-title').value,
        description: document.getElementById('co-description').value || null,
        amount: parseFloat(document.getElementById('co-amount').value)
      });
      App.closeModal();
      App.toast('Change order added', 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Add Change Order'; }
  },

  // ── Approve Change Order ──────────────────────────────────────────────

  async approveChangeOrder(projectId, coId) {
    if (!confirm('Approve this change order?')) return;
    try {
      await API.post(`/projects/${projectId}/change-orders/${coId}/approve`);
      App.toast('Change order approved', 'success');
      Projects.detail({ id: projectId });
    } catch (e) { App.toast(e.message, 'error'); }
  },

  // ── Invite Vendors ────────────────────────────────────────────────────

  async inviteVendors(projectId) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Invite Vendors';
    modal.querySelector('.modal-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';

    try {
      const vendorData = await API.get('/vendors');
      const vendors = Array.isArray(vendorData) ? vendorData : (vendorData.data || []);

      modal.querySelector('.modal-body').innerHTML = `
        <form id="invite-form" onsubmit="Projects.handleInviteVendors(event, '${projectId}')">
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Select vendors to invite to submit bids for this project.</p>
          <div style="max-height:320px;overflow-y:auto;margin-bottom:16px">
            ${vendors.length === 0 ? '<p style="color:var(--text-muted)">No vendors found. Add vendors first.</p>' : `
              ${vendors.map(v => `
                <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;cursor:pointer">
                  <input type="checkbox" name="vendor-ids" value="${v.id}" style="accent-color:var(--primary)">
                  <div>
                    <strong>${v.name}</strong>
                    ${v.specialty ? `<span style="font-size:12px;color:var(--text-muted);margin-left:6px">${v.specialty}</span>` : ''}
                    ${v.email ? `<div style="font-size:11px;color:var(--text-muted)">${v.email}</div>` : ''}
                  </div>
                </label>
              `).join('')}
            `}
          </div>
          <div id="invite-form-error" class="form-error" style="display:none"></div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary" id="invite-submit">Send Invitations</button>
          </div>
        </form>
      `;
    } catch (e) {
      modal.querySelector('.modal-body').innerHTML = `<p class="text-danger">${e.message}</p>`;
    }
  },

  async handleInviteVendors(e, projectId) {
    e.preventDefault();
    const btn = document.getElementById('invite-submit');
    const errorEl = document.getElementById('invite-form-error');
    errorEl.style.display = 'none'; btn.disabled = true; btn.textContent = 'Sending...';
    try {
      const vendorIds = [];
      document.querySelectorAll('input[name="vendor-ids"]:checked').forEach(cb => {
        vendorIds.push(parseInt(cb.value));
      });
      if (vendorIds.length === 0) throw new Error('Please select at least one vendor');
      await API.post(`/projects/${projectId}/invite`, { vendor_ids: vendorIds });
      App.closeModal();
      App.toast(`${vendorIds.length} vendor(s) invited`, 'success');
      Projects.detail({ id: projectId });
    } catch (err) {
      errorEl.textContent = err.message; errorEl.style.display = 'block';
    } finally { btn.disabled = false; btn.textContent = 'Send Invitations'; }
  },

  // ── Duplicate Bid ─────────────────────────────────────────────────────

  async duplicateBid(projectId, bidId) {
    if (!confirm('Duplicate this bid? A copy will be created that you can edit.')) return;
    try {
      await API.post(`/projects/${projectId}/bids/${bidId}/duplicate`);
      App.toast('Bid duplicated', 'success');
      Projects.detail({ id: projectId });
    } catch (e) { App.toast(e.message, 'error'); }
  },

  // ── Print Comparison ──────────────────────────────────────────────────

  async printComparison(projectId) {
    try {
      const data = await API.get(`/projects/${projectId}/compare`);
      const { bids, categories, lowestByCategory, project } = data;
      const catLabels = this.categoryLabels;

      const printWin = window.open('', '_blank', 'width=900,height=700');
      printWin.document.write(`
        <html>
        <head>
          <title>Bid Comparison - ${project.title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; color: #1a1a1a; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .subtitle { color: #666; font-size: 13px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { padding: 8px 12px; border: 1px solid #ddd; text-align: right; }
            th:first-child, td:first-child { text-align: left; font-weight: 600; }
            th { background: #f5f5f5; }
            .lowest { color: #10B981; font-weight: 700; }
            .total-row { border-top: 3px solid #333; font-size: 15px; font-weight: 700; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>Bid Comparison: ${project.title}</h1>
          <div class="subtitle">Generated ${new Date().toLocaleDateString()} | ${bids.length} bids${project.budget_min ? ' | Budget: $' + project.budget_min.toLocaleString() + ' - $' + (project.budget_max || 0).toLocaleString() : ''}</div>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                ${bids.map(b => `<th>${b.vendor_name}<br><small>${b.timeline_days ? b.timeline_days + ' days' : ''}</small></th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${categories.map(cat => {
                const hasData = bids.some(b => (b.by_category[cat] || 0) > 0);
                if (!hasData) return '';
                return `<tr>
                  <td>${catLabels[cat] || cat}</td>
                  ${bids.map(b => {
                    const val = b.by_category[cat] || 0;
                    const isLowest = val > 0 && val <= lowestByCategory[cat];
                    return `<td class="${isLowest ? 'lowest' : ''}">${val > 0 ? '$' + val.toLocaleString() : '-'}</td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
              <tr class="total-row">
                <td>Total</td>
                ${bids.map((b, i) => `<td class="${i === 0 ? 'lowest' : ''}">$${b.total_amount.toLocaleString()}</td>`).join('')}
              </tr>
            </tbody>
          </table>
        </body>
        </html>
      `);
      printWin.document.close();
      printWin.focus();
      setTimeout(() => printWin.print(), 500);
    } catch (e) {
      App.toast('Failed to load comparison for printing: ' + e.message, 'error');
    }
  },

  // ── Share Comparison ──────────────────────────────────────────────────

  async shareComparison(projectId) {
    const url = `${window.location.origin}/#/projects/${projectId}`;
    try {
      await navigator.clipboard.writeText(url);
      App.toast('Comparison URL copied to clipboard', 'success');
    } catch (_) {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      App.toast('Comparison URL copied to clipboard', 'success');
    }
  },

  // ── Show Comparison (standalone page) ─────────────────────────────────

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
          <div class="page-header-actions">
            <button class="btn btn-sm btn-secondary" onclick="Projects.printComparison('${projectId}')"><i data-lucide="printer"></i> Print</button>
            <button class="btn btn-sm btn-secondary" onclick="Projects.shareComparison('${projectId}')"><i data-lucide="share-2"></i> Share</button>
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
                    <button class="btn btn-sm btn-success" onclick="Projects.awardBid('${projectId}', '${b.id}', '${b.vendor_name.replace(/'/g, "\\'")}')">
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

  // ── Award Bid ─────────────────────────────────────────────────────────

  async awardBid(projectId, bidId, vendorName) {
    if (!confirm(`Award this project to ${vendorName}? This will create a Purchase Order and reject all other bids.`)) return;
    try {
      const result = await API.post(`/projects/${projectId}/award/${bidId}`);
      App.toast(`${result.message}. PO ${result.po_number} created.`, 'success');
      Projects.detail({ id: projectId });
    } catch (e) { App.toast(e.message, 'error'); }
  }
};
