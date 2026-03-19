const ReviewQueue = {
  async render() {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading review queue...</p></div>';

    try {
      const data = await API.get('/reviews/queue');
      const reviews = Array.isArray(data) ? data : (data.data || data.reviews || []);
      const pendingCount = reviews.length;

      // Update sidebar badge
      const badge = document.getElementById('reviews-pending-badge');
      if (badge) {
        badge.textContent = pendingCount;
        badge.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
      }

      container.innerHTML = `
        <div class="page-header">
          <h1>
            Review Queue
            ${pendingCount > 0 ? `<span style="display:inline-flex;align-items:center;justify-content:center;background:var(--primary,#3B82F6);color:#fff;border-radius:999px;font-size:0.875rem;min-width:24px;height:24px;padding:0 8px;margin-left:8px;font-weight:600">${pendingCount}</span>` : ''}
          </h1>
        </div>

        ${reviews.length === 0 ? `
          <div class="empty-state">
            <i data-lucide="check-circle" class="empty-icon"></i>
            <h2>No Work Orders Pending Review</h2>
            <p>All completed work orders have been reviewed. Check back later.</p>
          </div>
        ` : `
          <div class="card-grid" style="display:flex;flex-direction:column;gap:16px">
            ${reviews.map(r => `
              <div class="card">
                <div class="card-body" style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
                  <div style="flex:1;min-width:200px">
                    <h3 style="margin:0 0 8px">
                      <a href="#/workorders/${r.work_order_id || r.id}" style="text-decoration:none;color:inherit">${r.title || r.work_order_title || 'Work Order'}</a>
                    </h3>
                    <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:0.875rem;color:var(--text-muted)">
                      ${r.property_name ? `
                        <span><i data-lucide="building-2" style="width:14px;height:14px;vertical-align:middle"></i> ${r.property_name}</span>
                      ` : ''}
                      ${r.assigned_to_name || r.technician_name ? `
                        <span class="user-cell" style="display:inline-flex;align-items:center;gap:4px">
                          <div class="user-avatar-sm" style="background:${r.technician_avatar_color || r.assigned_avatar_color || '#3B82F6'};width:20px;height:20px;font-size:0.625rem">
                            ${((r.assigned_to_name || r.technician_name || 'U').charAt(0)).toUpperCase()}
                          </div>
                          ${r.assigned_to_name || r.technician_name}
                        </span>
                      ` : ''}
                      ${r.completed_at ? `
                        <span><i data-lucide="calendar-check" style="width:14px;height:14px;vertical-align:middle"></i> Completed ${new Date(r.completed_at).toLocaleDateString()}</span>
                      ` : ''}
                    </div>
                    <div style="display:flex;flex-wrap:wrap;gap:16px;margin-top:8px;font-size:0.875rem">
                      ${r.total_hours != null ? `
                        <span><strong>${r.total_hours}</strong> hours logged</span>
                      ` : ''}
                      ${r.parts_cost != null ? `
                        <span>Parts: <strong>$${r.parts_cost.toFixed(2)}</strong></span>
                      ` : ''}
                    </div>
                  </div>
                  <div style="display:flex;gap:8px;flex-shrink:0">
                    <button class="btn btn-sm" style="background:#10B981;color:#fff;border:none" onclick="ReviewQueue.approve('${r.id || r.work_order_id}')">
                      <i data-lucide="check" style="width:14px;height:14px"></i> Approve
                    </button>
                    <button class="btn btn-sm" style="background:#F59E0B;color:#fff;border:none" onclick="ReviewQueue.showReworkModal('${r.id || r.work_order_id}')">
                      <i data-lucide="rotate-ccw" style="width:14px;height:14px"></i> Request Rework
                    </button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async approve(id) {
    if (!confirm('Approve this work order?')) return;
    try {
      await API.post('/reviews/' + id + '/approve');
      App.toast('Work order approved', 'success');
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  showReworkModal(id) {
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Request Rework';
    modal.querySelector('.modal-body').innerHTML = `
      <div class="form-group">
        <label for="rework-notes">Notes *</label>
        <textarea id="rework-notes" class="form-control" rows="4" required placeholder="Describe what needs to be reworked..."></textarea>
      </div>
    `;
    modal.querySelector('.modal-footer').innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
      <button class="btn btn-primary" style="background:#F59E0B;border-color:#F59E0B" onclick="ReviewQueue.rework('${id}')">Request Rework</button>
    `;
    modal.style.display = 'flex';
  },

  async rework(id) {
    const notes = document.getElementById('rework-notes');
    if (!notes || !notes.value.trim()) {
      App.toast('Please provide rework notes', 'error');
      return;
    }
    try {
      await API.post('/reviews/' + id + '/rework', { notes: notes.value });
      App.closeModal();
      App.toast('Rework requested', 'success');
      this.render();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
