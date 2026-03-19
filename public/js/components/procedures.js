const Procedures = {
  _steps: [],
  _currentPage: 1,
  _pagination: null,

  async list(page) {
    this._currentPage = page || 1;
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading procedures...</p></div>';

    try {
      const params = new URLSearchParams({ page: this._currentPage, limit: 25 });
      const data = await API.get(`/procedures?${params.toString()}`);
      const { items: procedures, pagination } = Pagination.extract(data, 'procedures');
      this._pagination = pagination;

      container.innerHTML = `
        <div class="page-header">
          <h1>Procedures <span class="tip-trigger" data-tip="procedure"><i data-lucide="help-circle" class="tip-badge-icon"></i></span></h1>
          <button class="btn btn-primary" onclick="Router.navigate('#/procedures/new')">
            <i data-lucide="plus"></i> New Procedure
          </button>
        </div>

        <div class="card">
          <div class="card-body no-padding">
            <table class="table" id="proc-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Category</th>
                  <th>Steps</th>
                  <th>Created By</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                ${procedures.length === 0 ? '' : procedures.map(p => `
                  <tr class="clickable-row" onclick="Router.navigate('#/procedures/${p.id}')">
                    <td><strong>${p.title}</strong></td>
                    <td>${p.category ? `<span class="badge">${p.category}</span>` : '-'}</td>
                    <td>${p.step_count || 0} steps</td>
                    <td>${p.created_by_name || '-'}</td>
                    <td>${Dashboard.formatDate(p.created_at)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            ${procedures.length === 0 ? `
              <div class="empty-state">
                <div class="empty-state-icon">
                  <i data-lucide="clipboard-check"></i>
                </div>
                <h2>No Procedures Yet</h2>
                <p class="empty-state-desc">Build reusable checklists to ensure every maintenance task is done right, every time. Attach procedures to work orders for consistent quality.</p>
                <div class="empty-state-features">
                  <div class="empty-state-feature">
                    <i data-lucide="clipboard-check"></i>
                    <div>
                      <strong>Step-by-Step Checklists</strong>
                      <span>Checkbox, text, number, and pass/fail step types</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="copy"></i>
                    <div>
                      <strong>Reusable Templates</strong>
                      <span>Create once, attach to any work order</span>
                    </div>
                  </div>
                  <div class="empty-state-feature">
                    <i data-lucide="shield-check"></i>
                    <div>
                      <strong>Quality Assurance</strong>
                      <span>Required steps must be completed before a task can close</span>
                    </div>
                  </div>
                </div>
                <div class="empty-state-connections">
                  <span class="empty-state-conn"><i data-lucide="link"></i> Templates attached to Work Orders</span>
                </div>
                <button class="btn btn-primary" onclick="Router.navigate('#/procedures/new')">
                  <i data-lucide="plus"></i> Create First Procedure
                </button>
              </div>
            ` : Pagination.render(pagination, 'Procedures')}
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  goToPage(page) {
    if (page < 1 || (this._pagination && page > this._pagination.totalPages)) return;
    this.list(page);
  },

  async detail(params) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const proc = await API.get(`/procedures/${params.id}`);
      const steps = proc.steps || [];
      const stepTypeLabels = { checkbox: 'Checkbox', text_input: 'Text Input', number_input: 'Number Input', pass_fail: 'Pass/Fail' };

      container.innerHTML = `
        <div class="page-header">
          <div class="page-header-left">
            <button class="btn btn-secondary btn-sm" onclick="Router.navigate('#/procedures')">
              <i data-lucide="arrow-left"></i> Back
            </button>
            <h1>${proc.title}</h1>
            ${proc.category ? `<span class="badge">${proc.category}</span>` : ''}
          </div>
          <div class="page-header-actions">
            ${QRCodes.button('procedure', params.id, proc.title, proc.category || '')}
            <button class="btn btn-secondary" onclick="Procedures.duplicate('${params.id}')">
              <i data-lucide="copy"></i> Duplicate
            </button>
            <button class="btn btn-secondary" onclick="Procedures.showAttachModal('${params.id}')">
              <i data-lucide="link"></i> Attach to Work Order
            </button>
            <button class="btn btn-secondary" onclick="Procedures.edit('${params.id}')">
              <i data-lucide="edit"></i> Edit
            </button>
            <button class="btn btn-danger" onclick="Procedures.remove('${params.id}')">
              <i data-lucide="trash-2"></i> Delete
            </button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="card">
            <div class="card-header"><h3>Details</h3></div>
            <div class="card-body">
              <div class="detail-fields">
                <div class="detail-field">
                  <label>Category</label>
                  <p>${proc.category || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Created By</label>
                  <p>${proc.created_by_name || '-'}</p>
                </div>
                <div class="detail-field">
                  <label>Created</label>
                  <p>${Dashboard.formatDate(proc.created_at)}</p>
                </div>
                <div class="detail-field">
                  <label>Updated</label>
                  <p>${Dashboard.formatDate(proc.updated_at)}</p>
                </div>
                <div class="detail-field detail-field-full">
                  <label>Description</label>
                  <p>${proc.description || '-'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><h3>Steps (${steps.length})</h3></div>
          <div class="card-body">
            ${steps.length === 0 ? '<div class="empty-state-sm">No steps defined</div>' : `
              <div class="steps-list">
                ${steps.map((s, i) => `
                  <div class="step-item">
                    <div class="step-number">${s.step_number}</div>
                    <div class="step-info">
                      <strong>${s.title}</strong>
                      ${s.description ? `<div class="text-muted" style="font-size: 0.85em; margin-top: 2px;">${s.description}</div>` : ''}
                      <div class="step-meta">
                        <span class="badge badge-sm">${stepTypeLabels[s.step_type] || s.step_type}</span>
                        ${s.is_required ? '<span class="badge badge-sm badge-critical">Required</span>' : ''}
                        ${s.step_type === 'number_input' && (s.min_value != null || s.max_value != null) ? `<span class="badge badge-sm">Range: ${s.min_value != null ? s.min_value : '...'} - ${s.max_value != null ? s.max_value : '...'}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>

        ${Attachments.placeholder('procedure', params.id)}
      `;
      lucide.createIcons();
      Attachments.load('procedure', params.id);
    } catch (e) {
      container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
    }
  },

  async form(editId) {
    const container = document.getElementById('main-content');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    let proc = null;
    if (editId) {
      try {
        proc = await API.get(`/procedures/${editId}`);
        this._steps = (proc.steps || []).map(s => ({
          title: s.title,
          description: s.description || '',
          step_type: s.step_type,
          is_required: !!s.is_required,
          min_value: s.min_value != null ? s.min_value : '',
          max_value: s.max_value != null ? s.max_value : ''
        }));
      } catch (e) {
        container.innerHTML = `<div class="error-state"><p>${e.message}</p></div>`;
        return;
      }
    } else {
      this._steps = [];
    }

    const isEdit = !!proc;
    const backRoute = isEdit ? `#/procedures/${editId}` : '#/procedures';

    container.innerHTML = `
      <div class="page-header">
        <div class="page-header-left">
          <button class="btn btn-secondary btn-sm" onclick="Router.navigate('${backRoute}')">
            <i data-lucide="arrow-left"></i> Back
          </button>
          <h1>${isEdit ? 'Edit Procedure' : 'New Procedure'}</h1>
        </div>
      </div>
      <div class="card">
        <div class="card-body">
          <form id="proc-form" onsubmit="Procedures.handleSave(event, ${editId ? `'${editId}'` : 'null'})">
            <div class="form-group">
              <label for="proc-title">Title *</label>
              <input type="text" id="proc-title" class="form-control" required placeholder="Procedure name" value="${proc ? proc.title : ''}">
            </div>
            <div class="form-group">
              <label for="proc-description">Description</label>
              <textarea id="proc-description" class="form-control" rows="3" placeholder="What this procedure is for...">${proc ? (proc.description || '') : ''}</textarea>
            </div>
            <div class="form-group">
              <label for="proc-category">Category</label>
              <input type="text" id="proc-category" class="form-control" placeholder="e.g., Safety, HVAC, Plumbing" value="${proc ? (proc.category || '') : ''}">
            </div>

            <div class="form-group">
              <label>Steps</label>
              <div id="steps-builder"></div>
              <button type="button" class="btn btn-secondary btn-sm" onclick="Procedures.addStep()" style="margin-top: 8px">
                <i data-lucide="plus"></i> Add Step
              </button>
            </div>

            <div id="proc-form-error" class="form-error" style="display:none"></div>
            <div class="form-actions">
              <button type="button" class="btn btn-secondary" onclick="Router.navigate('${backRoute}')">Cancel</button>
              <button type="submit" class="btn btn-primary" id="proc-submit">${isEdit ? 'Save Changes' : 'Create Procedure'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.renderSteps();
    lucide.createIcons();
  },

  addStep() {
    this._steps.push({ title: '', description: '', step_type: 'checkbox', is_required: false, min_value: '', max_value: '' });
    this.renderSteps();
  },

  removeStep(index) {
    this._steps.splice(index, 1);
    this.renderSteps();
  },

  moveStep(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= this._steps.length) return;
    const temp = this._steps[index];
    this._steps[index] = this._steps[newIndex];
    this._steps[newIndex] = temp;
    this.renderSteps();
  },

  updateStepField(index, field, value) {
    if (this._steps[index]) {
      this._steps[index][field] = field === 'is_required' ? value : value;
    }
  },

  toggleStepDesc(index) {
    if (this._steps[index]) {
      this._steps[index]._showDesc = true;
      this.renderSteps();
    }
  },

  renderSteps() {
    const builder = document.getElementById('steps-builder');
    if (!builder) return;

    if (this._steps.length === 0) {
      builder.innerHTML = '<div class="empty-state-sm">No steps added yet. Click "Add Step" to begin.</div>';
      lucide.createIcons();
      return;
    }

    builder.innerHTML = this._steps.map((s, i) => `
      <div class="step-builder-item">
        <div class="step-builder-number">${i + 1}</div>
        <div class="step-builder-fields">
          <input type="text" class="form-control form-control-sm" placeholder="Step title" value="${s.title}" oninput="Procedures.updateStepField(${i}, 'title', this.value)">
          <div class="step-builder-row">
            <select class="form-control form-control-sm" onchange="Procedures.updateStepField(${i}, 'step_type', this.value); Procedures.renderSteps()">
              <option value="checkbox" ${s.step_type === 'checkbox' ? 'selected' : ''}>Checkbox</option>
              <option value="text_input" ${s.step_type === 'text_input' ? 'selected' : ''}>Text Input</option>
              <option value="number_input" ${s.step_type === 'number_input' ? 'selected' : ''}>Number Input</option>
              <option value="pass_fail" ${s.step_type === 'pass_fail' ? 'selected' : ''}>Pass/Fail</option>
            </select>
            <label class="step-required-label">
              <input type="checkbox" ${s.is_required ? 'checked' : ''} onchange="Procedures.updateStepField(${i}, 'is_required', this.checked)"> Required
            </label>
          </div>
          ${s.step_type === 'number_input' ? `
            <div class="step-builder-range">
              <input type="number" class="form-control form-control-sm" placeholder="Min" value="${s.min_value}" oninput="Procedures.updateStepField(${i}, 'min_value', this.value)" style="width: 100px">
              <span style="color: var(--text-muted); font-size: 0.85em;">to</span>
              <input type="number" class="form-control form-control-sm" placeholder="Max" value="${s.max_value}" oninput="Procedures.updateStepField(${i}, 'max_value', this.value)" style="width: 100px">
              <span style="color: var(--text-muted); font-size: 0.8em;">expected range (optional)</span>
            </div>
          ` : ''}
          ${s.description || s._showDesc ? `
            <textarea class="form-control form-control-sm" rows="2" placeholder="Description / instructions for this step..." oninput="Procedures.updateStepField(${i}, 'description', this.value)">${s.description || ''}</textarea>
          ` : `
            <a href="#" class="step-add-details-link" onclick="event.preventDefault(); Procedures.toggleStepDesc(${i})">+ Add details</a>
          `}
        </div>
        <div class="step-builder-actions">
          <button type="button" class="btn-icon btn-icon-sm" onclick="Procedures.moveStep(${i}, -1)" title="Move up" ${i === 0 ? 'disabled' : ''}>
            <i data-lucide="chevron-up"></i>
          </button>
          <button type="button" class="btn-icon btn-icon-sm" onclick="Procedures.moveStep(${i}, 1)" title="Move down" ${i === this._steps.length - 1 ? 'disabled' : ''}>
            <i data-lucide="chevron-down"></i>
          </button>
          <button type="button" class="btn-icon btn-icon-sm text-danger" onclick="Procedures.removeStep(${i})" title="Remove">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
    `).join('');

    lucide.createIcons();
  },

  async handleSave(e, editId) {
    e.preventDefault();
    const btn = document.getElementById('proc-submit');
    const errorEl = document.getElementById('proc-form-error');
    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = editId ? 'Saving...' : 'Creating...';

    try {
      // Validate steps have titles
      const invalidSteps = this._steps.filter(s => !s.title.trim());
      if (invalidSteps.length > 0) {
        throw new Error('All steps must have a description');
      }

      const body = {
        title: document.getElementById('proc-title').value,
        description: document.getElementById('proc-description').value,
        category: document.getElementById('proc-category').value || null,
        steps: this._steps.map(s => ({
          title: s.title,
          description: s.description || null,
          step_type: s.step_type,
          is_required: s.is_required,
          min_value: s.min_value !== '' && s.min_value != null ? parseFloat(s.min_value) : null,
          max_value: s.max_value !== '' && s.max_value != null ? parseFloat(s.max_value) : null
        }))
      };

      let result;
      if (editId) {
        result = await API.put(`/procedures/${editId}`, body);
        App.toast('Procedure updated', 'success');
      } else {
        result = await API.post('/procedures', body);
        App.toast('Procedure created', 'success');
      }
      Router.navigate(`#/procedures/${result.id}`);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = editId ? 'Save Changes' : 'Create Procedure';
    }
  },

  async edit(id) {
    await this.form(id);
  },

  async remove(id) {
    if (!confirm('Are you sure you want to delete this procedure?')) return;
    try {
      await API.delete(`/procedures/${id}`);
      App.toast('Procedure deleted', 'success');
      Router.navigate('#/procedures');
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async duplicate(id) {
    try {
      const result = await API.post(`/procedures/${id}/duplicate`);
      App.toast('Procedure duplicated', 'success');
      Router.navigate(`#/procedures/${result.id}`);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async showAttachModal(procedureId) {
    try {
      const woData = await API.get('/workorders');
      const workorders = Array.isArray(woData) ? woData : (woData.data || woData.workorders || []);
      const openWOs = workorders.filter(wo => wo.status !== 'completed' && wo.status !== 'cancelled');

      const overlay = document.getElementById('modal-overlay');
      document.querySelector('.modal-title').textContent = 'Attach to Work Order';
      document.querySelector('.modal-body').innerHTML = `
        ${openWOs.length === 0 ? '<p>No open work orders found.</p>' : `
          <div class="form-group">
            <label for="attach-wo-select">Select Work Order</label>
            <select id="attach-wo-select" class="form-control">
              ${openWOs.map(wo => `<option value="${wo.id}">${wo.title} (${wo.status})</option>`).join('')}
            </select>
          </div>
        `}
      `;
      document.querySelector('.modal-footer').innerHTML = openWOs.length === 0 ? `
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      ` : `
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Procedures.attachToWorkOrder('${procedureId}')">Attach</button>
      `;
      overlay.style.display = 'flex';
      lucide.createIcons();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async attachToWorkOrder(procedureId) {
    const select = document.getElementById('attach-wo-select');
    if (!select) return;
    const workOrderId = select.value;

    try {
      await API.post(`/procedures/${procedureId}/attach/${workOrderId}`);
      App.toast('Procedure attached to work order', 'success');
      App.closeModal();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  // Renders attached procedures inside a work order detail view
  async renderWorkOrderProcedures(workOrderId, containerEl) {
    try {
      const wops = await API.get(`/procedures/workorder/${workOrderId}`);
      if (!wops || wops.length === 0) {
        containerEl.innerHTML = `
          <div class="card">
            <div class="card-header">
              <h3>Procedures</h3>
              <button class="btn btn-secondary btn-sm" onclick="Procedures.showAttachModalFromWO('${workOrderId}')">
                <i data-lucide="plus"></i> Attach Procedure
              </button>
            </div>
            <div class="card-body">
              <div class="empty-state-sm">No procedures attached</div>
            </div>
          </div>
        `;
        lucide.createIcons();
        return;
      }

      const stepTypeLabels = { checkbox: 'Checkbox', text_input: 'Text Input', number_input: 'Number Input', pass_fail: 'Pass/Fail' };

      containerEl.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3>Procedures</h3>
            <button class="btn btn-secondary btn-sm" onclick="Procedures.showAttachModalFromWO('${workOrderId}')">
              <i data-lucide="plus"></i> Attach Procedure
            </button>
          </div>
          <div class="card-body">
            ${wops.map(wop => `
              <div class="procedure-block">
                <div class="procedure-block-header">
                  <div>
                    <strong>${wop.title}</strong>
                    ${wop.category ? `<span class="badge badge-sm">${wop.category}</span>` : ''}
                    <span class="badge badge-sm badge-status-${wop.status}">${wop.status}</span>
                  </div>
                  <div class="procedure-progress">
                    ${wop.progress.completed}/${wop.progress.total} completed
                  </div>
                </div>
                <div class="procedure-progress-bar">
                  <div class="procedure-progress-fill" style="width: ${wop.progress.total > 0 ? Math.round((wop.progress.completed / wop.progress.total) * 100) : 0}%"></div>
                </div>
                <div class="procedure-steps">
                  ${(wop.steps || []).map(step => `
                    <div class="procedure-step ${step.response_value !== null ? 'procedure-step-done' : ''}">
                      <div class="procedure-step-num">${step.step_number}</div>
                      <div class="procedure-step-content">
                        <div class="procedure-step-title">
                          ${step.title}
                          ${step.is_required ? '<span class="text-danger">*</span>' : ''}
                        </div>
                        ${step.description ? `<div class="text-muted" style="font-size: 0.85em; margin: 2px 0 4px;">${step.description}</div>` : ''}
                        <div class="procedure-step-input">
                          ${Procedures.renderStepInput(step, wop.id, workOrderId)}
                        </div>
                        ${step.response_notes ? `<div class="text-muted" style="font-size: 0.85em; margin-top: 4px; font-style: italic;">Notes: ${step.response_notes}</div>` : ''}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
      lucide.createIcons();
    } catch (e) {
      containerEl.innerHTML = `<div class="card"><div class="card-body"><p class="text-danger">${e.message}</p></div></div>`;
    }
  },

  renderStepInput(step, wopId, workOrderId) {
    const val = step.response_value;
    const doneClass = val !== null ? 'step-completed' : '';

    switch (step.step_type) {
      case 'checkbox':
        return `
          <label class="step-checkbox ${doneClass}">
            <input type="checkbox" ${val ? 'checked' : ''} onchange="Procedures.respondStep(${wopId}, ${step.id}, this.checked ? 'done' : null, '${workOrderId}')">
            <span>${val ? 'Completed' : 'Mark complete'}</span>
          </label>
        `;
      case 'text_input':
        return `
          <div class="step-text-input ${doneClass}">
            <input type="text" class="form-control form-control-sm" placeholder="Enter value..." value="${val || ''}" id="step-input-${step.id}">
            <button class="btn btn-primary btn-sm" onclick="Procedures.respondStep(${wopId}, ${step.id}, document.getElementById('step-input-${step.id}').value, '${workOrderId}')">Save</button>
          </div>
        `;
      case 'number_input': {
        const hasRange = step.min_value != null || step.max_value != null;
        const numVal = val != null && val !== '' ? parseFloat(val) : null;
        const isOutOfRange = hasRange && numVal != null && (
          (step.min_value != null && numVal < step.min_value) ||
          (step.max_value != null && numVal > step.max_value)
        );
        return `
          <div class="step-text-input ${doneClass}">
            <input type="number" class="form-control form-control-sm${isOutOfRange ? ' step-out-of-range' : ''}" placeholder="Enter number..." value="${val || ''}" id="step-input-${step.id}" oninput="Procedures.checkNumberRange(this, ${step.min_value != null ? step.min_value : 'null'}, ${step.max_value != null ? step.max_value : 'null'})">
            <button class="btn btn-primary btn-sm" onclick="Procedures.respondStep(${wopId}, ${step.id}, document.getElementById('step-input-${step.id}').value, '${workOrderId}')">Save</button>
          </div>
          ${hasRange ? `<div class="step-range-indicator${isOutOfRange ? ' step-range-warning' : ''}">Expected range: ${step.min_value != null ? step.min_value : '...'} - ${step.max_value != null ? step.max_value : '...'}</div>` : ''}
          ${isOutOfRange ? `<div class="step-range-warning-text">Value is outside the expected range</div>` : ''}
        `;
      }
      case 'pass_fail':
        return `
          <div class="step-pass-fail ${doneClass}">
            <button class="btn btn-sm ${val === 'pass' ? 'btn-success' : 'btn-secondary'}" onclick="Procedures.respondPassFail(${wopId}, ${step.id}, 'pass', '${workOrderId}')">
              <i data-lucide="check"></i> Pass
            </button>
            <button class="btn btn-sm ${val === 'fail' ? 'btn-danger' : 'btn-secondary'}" onclick="Procedures.respondPassFail(${wopId}, ${step.id}, 'fail', '${workOrderId}')">
              <i data-lucide="x"></i> Fail
            </button>
          </div>
          <div class="step-notes-section" id="step-notes-section-${step.id}" style="${val === 'fail' ? '' : 'display:none;'}">
            <textarea class="form-control form-control-sm" id="step-notes-${step.id}" rows="2" placeholder="${val === 'fail' ? 'Failure notes (required)...' : 'Add notes (optional)...'}">${step.response_notes || ''}</textarea>
            <button class="btn btn-secondary btn-sm" style="margin-top: 4px;" onclick="Procedures.saveStepNotes(${wopId}, ${step.id}, '${workOrderId}')">Save Notes</button>
          </div>
        `;
      default:
        return '-';
    }
  },

  async respondStep(wopId, stepId, value, workOrderId) {
    try {
      const result = await API.post('/procedures/respond', {
        work_order_procedure_id: wopId,
        procedure_step_id: stepId,
        value: value
      });
      if (result.out_of_range && result.warning) {
        App.toast(result.warning, 'warning');
      }
      // Re-render the procedures section
      const procContainer = document.getElementById('wo-procedures-section');
      if (procContainer) {
        await Procedures.renderWorkOrderProcedures(workOrderId, procContainer);
      }
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async respondPassFail(wopId, stepId, value, workOrderId) {
    if (value === 'fail') {
      // Show notes section and prompt for notes
      const notesSection = document.getElementById(`step-notes-section-${stepId}`);
      const notesInput = document.getElementById(`step-notes-${stepId}`);
      if (notesSection) {
        notesSection.style.display = '';
        if (notesInput) {
          notesInput.placeholder = 'Failure notes (required)...';
          notesInput.focus();
        }
      }
      const notes = notesInput ? notesInput.value.trim() : '';
      if (!notes) {
        App.toast('Please add notes explaining the failure, then click Save Notes', 'warning');
        // Still save the fail value but show the notes section prominently
      }
      try {
        await API.post('/procedures/respond', {
          work_order_procedure_id: wopId,
          procedure_step_id: stepId,
          value: value,
          notes: notes || null
        });
        const procContainer = document.getElementById('wo-procedures-section');
        if (procContainer) {
          await Procedures.renderWorkOrderProcedures(workOrderId, procContainer);
        }
      } catch (e) {
        App.toast(e.message, 'error');
      }
    } else {
      // Pass — include any existing notes
      const notesInput = document.getElementById(`step-notes-${stepId}`);
      const notes = notesInput ? notesInput.value.trim() : '';
      try {
        await API.post('/procedures/respond', {
          work_order_procedure_id: wopId,
          procedure_step_id: stepId,
          value: value,
          notes: notes || null
        });
        const procContainer = document.getElementById('wo-procedures-section');
        if (procContainer) {
          await Procedures.renderWorkOrderProcedures(workOrderId, procContainer);
        }
      } catch (e) {
        App.toast(e.message, 'error');
      }
    }
  },

  async saveStepNotes(wopId, stepId, workOrderId) {
    const notesInput = document.getElementById(`step-notes-${stepId}`);
    const notes = notesInput ? notesInput.value.trim() : '';
    try {
      // Re-submit the current value with updated notes
      await API.post('/procedures/respond', {
        work_order_procedure_id: wopId,
        procedure_step_id: stepId,
        value: null, // will be overridden by existing value on re-render
        notes: notes || null
      });
      App.toast('Notes saved', 'success');
      const procContainer = document.getElementById('wo-procedures-section');
      if (procContainer) {
        await Procedures.renderWorkOrderProcedures(workOrderId, procContainer);
      }
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  checkNumberRange(input, min, max) {
    const val = parseFloat(input.value);
    if (isNaN(val)) {
      input.classList.remove('step-out-of-range');
      return;
    }
    const outOfRange = (min != null && val < min) || (max != null && val > max);
    if (outOfRange) {
      input.classList.add('step-out-of-range');
    } else {
      input.classList.remove('step-out-of-range');
    }
  },

  async showAttachModalFromWO(workOrderId) {
    try {
      const procData = await API.get('/procedures');
      const procedures = Array.isArray(procData) ? procData : (procData.data || procData.procedures || []);

      const overlay = document.getElementById('modal-overlay');
      document.querySelector('.modal-title').textContent = 'Attach Procedure';
      document.querySelector('.modal-body').innerHTML = `
        ${procedures.length === 0 ? '<p>No procedures available. Create one first.</p>' : `
          <div class="form-group">
            <label for="attach-proc-select">Select Procedure</label>
            <select id="attach-proc-select" class="form-control">
              ${procedures.map(p => `<option value="${p.id}">${p.title} (${p.step_count || 0} steps)</option>`).join('')}
            </select>
          </div>
        `}
      `;
      document.querySelector('.modal-footer').innerHTML = procedures.length === 0 ? `
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      ` : `
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="Procedures.doAttachFromWO('${workOrderId}')">Attach</button>
      `;
      overlay.style.display = 'flex';
      lucide.createIcons();
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  async doAttachFromWO(workOrderId) {
    const select = document.getElementById('attach-proc-select');
    if (!select) return;
    const procedureId = select.value;

    try {
      await API.post(`/procedures/${procedureId}/attach/${workOrderId}`);
      App.toast('Procedure attached', 'success');
      App.closeModal();
      // Re-render procedures section
      const procContainer = document.getElementById('wo-procedures-section');
      if (procContainer) {
        await Procedures.renderWorkOrderProcedures(workOrderId, procContainer);
      }
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
};
