const Guide = {
  _activeTab: 'flow',

  render() {
    const container = document.getElementById('main-content');
    container.innerHTML = `
      <div class="page-header">
        <h1><i data-lucide="book-open" style="width:24px;height:24px;margin-right:8px;vertical-align:middle"></i> How It Works</h1>
      </div>

      <div class="guide-tabs">
        <button class="guide-tab ${this._activeTab === 'flow' ? 'active' : ''}" onclick="Guide.switchTab('flow')">
          <i data-lucide="git-branch"></i> How Things Connect
        </button>
        <button class="guide-tab ${this._activeTab === 'workflows' ? 'active' : ''}" onclick="Guide.switchTab('workflows')">
          <i data-lucide="route"></i> Common Workflows
        </button>
        <button class="guide-tab ${this._activeTab === 'reference' ? 'active' : ''}" onclick="Guide.switchTab('reference')">
          <i data-lucide="layout-grid"></i> Quick Reference
        </button>
      </div>

      <div id="guide-content">
        ${this.renderTab()}
      </div>
    `;
    lucide.createIcons();
  },

  switchTab(tab) {
    this._activeTab = tab;
    this.render();
  },

  renderTab() {
    switch (this._activeTab) {
      case 'flow': return this.renderFlow();
      case 'workflows': return this.renderWorkflows();
      case 'reference': return this.renderReference();
      default: return '';
    }
  },

  renderFlow() {
    return `
      <div class="guide-section">
        <div class="guide-intro">
          <h2>The Big Picture</h2>
          <p>Everything in Estate Maintain connects. Here's how information flows through the system — from a maintenance need being identified all the way through to completion and reporting.</p>
        </div>

        <div class="flow-diagram">
          <div class="flow-stage flow-stage-intake">
            <div class="flow-stage-label">How Work Gets Created</div>
            <div class="flow-sources">
              <div class="flow-node flow-node-source">
                <div class="flow-node-icon" style="background:#06B6D4">
                  <i data-lucide="inbox"></i>
                </div>
                <div class="flow-node-text">
                  <strong>Work Request</strong>
                  <span>Resident/guest submits via public form</span>
                </div>
                <div class="flow-arrow-down"></div>
                <div class="flow-action">Manager approves</div>
              </div>
              <div class="flow-node flow-node-source">
                <div class="flow-node-icon" style="background:#F59E0B">
                  <i data-lucide="calendar-clock"></i>
                </div>
                <div class="flow-node-text">
                  <strong>PM Schedule</strong>
                  <span>Recurring task comes due</span>
                </div>
                <div class="flow-arrow-down"></div>
                <div class="flow-action">Auto-generated</div>
              </div>
              <div class="flow-node flow-node-source">
                <div class="flow-node-icon" style="background:#8B5CF6">
                  <i data-lucide="copy"></i>
                </div>
                <div class="flow-node-text">
                  <strong>Template</strong>
                  <span>Quick-create from saved template</span>
                </div>
                <div class="flow-arrow-down"></div>
                <div class="flow-action">One-click create</div>
              </div>
              <div class="flow-node flow-node-source">
                <div class="flow-node-icon" style="background:#6366F1">
                  <i data-lucide="plus-circle"></i>
                </div>
                <div class="flow-node-text">
                  <strong>Manual</strong>
                  <span>Staff creates directly</span>
                </div>
                <div class="flow-arrow-down"></div>
                <div class="flow-action">Created by staff</div>
              </div>
            </div>
          </div>

          <div class="flow-connector-main">
            <div class="flow-connector-line"></div>
            <div class="flow-connector-label">All paths lead to...</div>
          </div>

          <div class="flow-stage flow-stage-core">
            <div class="flow-core-node">
              <div class="flow-core-icon">
                <i data-lucide="clipboard-list"></i>
              </div>
              <div class="flow-core-text">
                <strong>Work Order</strong>
                <span>The central unit of work — every task lives here</span>
              </div>
            </div>
          </div>

          <div class="flow-branches">
            <div class="flow-branch">
              <div class="flow-branch-line"></div>
              <div class="flow-branch-node">
                <i data-lucide="users"></i>
                <strong>Assigned To</strong>
                <span>Team or technician</span>
              </div>
            </div>
            <div class="flow-branch">
              <div class="flow-branch-line"></div>
              <div class="flow-branch-node">
                <i data-lucide="clipboard-check"></i>
                <strong>Procedure</strong>
                <span>Step-by-step checklist</span>
              </div>
            </div>
            <div class="flow-branch">
              <div class="flow-branch-line"></div>
              <div class="flow-branch-node">
                <i data-lucide="package"></i>
                <strong>Parts Used</strong>
                <span>Auto-deducts inventory</span>
              </div>
            </div>
            <div class="flow-branch">
              <div class="flow-branch-line"></div>
              <div class="flow-branch-node">
                <i data-lucide="clock"></i>
                <strong>Time Logged</strong>
                <span>Hours tracked</span>
              </div>
            </div>
          </div>

          <div class="flow-connector-main">
            <div class="flow-connector-line"></div>
          </div>

          <div class="flow-stage flow-stage-complete">
            <div class="flow-complete-steps">
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#10B981">
                  <i data-lucide="check"></i>
                </div>
                <span>Completed</span>
              </div>
              <div class="flow-complete-arrow"></div>
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#3B82F6">
                  <i data-lucide="pen-line"></i>
                </div>
                <span>Signed Off</span>
              </div>
              <div class="flow-complete-arrow"></div>
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#8B5CF6">
                  <i data-lucide="bar-chart-3"></i>
                </div>
                <span>Reported</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flow-sidebar-diagram">
          <h3>Supporting Systems</h3>
          <div class="flow-support-grid">
            <div class="flow-support-card">
              <div class="flow-support-icon" style="background:#8B5CF615;color:#8B5CF6"><i data-lucide="building-2"></i></div>
              <div>
                <strong>Properties</strong>
                <span>Physical locations. Everything happens at a property. Properties contain assets and locations.</span>
              </div>
            </div>
            <div class="flow-support-card">
              <div class="flow-support-icon" style="background:#10B98115;color:#10B981"><i data-lucide="wrench"></i></div>
              <div>
                <strong>Assets</strong>
                <span>Equipment &amp; systems at a property. Assets break down, need maintenance, and have meters to track usage.</span>
              </div>
            </div>
            <div class="flow-support-card">
              <div class="flow-support-icon" style="background:#EC489915;color:#EC4899"><i data-lucide="truck"></i></div>
              <div>
                <strong>Vendors &amp; Purchase Orders</strong>
                <span>When you need parts, create a PO to a vendor. When received, inventory auto-updates.</span>
              </div>
            </div>
            <div class="flow-support-card">
              <div class="flow-support-icon" style="background:#F59E0B15;color:#F59E0B"><i data-lucide="users"></i></div>
              <div>
                <strong>Teams</strong>
                <span>Groups of staff by specialty. Assign properties and work orders to the right team.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  renderWorkflows() {
    const workflows = [
      {
        title: 'A resident reports a problem',
        icon: 'inbox',
        color: '#06B6D4',
        steps: [
          { icon: 'globe', text: 'Resident fills out the public <strong>Work Request</strong> form (no login needed)', link: '#/requests' },
          { icon: 'bell', text: 'You get a notification — a new request is pending review' },
          { icon: 'check-circle', text: 'Review the request and <strong>Approve</strong> it — this auto-creates a <strong>Work Order</strong>', link: '#/requests' },
          { icon: 'user', text: 'Assign the work order to a <strong>technician</strong> or <strong>team</strong>' },
          { icon: 'clipboard-check', text: 'Technician follows the attached <strong>Procedure</strong> checklist' },
          { icon: 'package', text: 'Parts used are logged — <strong>inventory auto-deducts</strong>' },
          { icon: 'check', text: 'Work order marked <strong>Completed</strong>, then <strong>Signed Off</strong> by manager' }
        ]
      },
      {
        title: 'Setting up recurring maintenance',
        icon: 'calendar-clock',
        color: '#F59E0B',
        steps: [
          { icon: 'building-2', text: 'Make sure your <strong>Property</strong> and <strong>Assets</strong> are set up', link: '#/properties' },
          { icon: 'clipboard-check', text: 'Create a <strong>Procedure</strong> with step-by-step instructions for the task', link: '#/procedures' },
          { icon: 'calendar-clock', text: 'Create a <strong>PM Schedule</strong> — set the frequency, assign a team, and attach the procedure', link: '#/preventive/new' },
          { icon: 'zap', text: 'The system <strong>auto-creates work orders</strong> when the schedule comes due — overnight, every night' },
          { icon: 'clipboard-list', text: 'Technician sees the work order with the procedure already attached — they know exactly what to do' },
          { icon: 'repeat', text: 'After completion, the next due date is <strong>auto-calculated</strong> and the cycle continues' }
        ]
      },
      {
        title: 'Managing parts and procurement',
        icon: 'package',
        color: '#EF4444',
        steps: [
          { icon: 'package', text: 'Add your <strong>Parts</strong> to inventory with stock levels and minimum quantities', link: '#/parts/new' },
          { icon: 'clipboard-list', text: 'When working on a work order, technicians <strong>log parts used</strong> — inventory auto-deducts' },
          { icon: 'alert-triangle', text: 'When stock drops below minimum, you see a <strong>low stock alert</strong> on the dashboard' },
          { icon: 'truck', text: 'Add your <strong>Vendors</strong> — the suppliers you order from', link: '#/vendors/new' },
          { icon: 'shopping-cart', text: 'Create a <strong>Purchase Order</strong> with line items for the parts you need', link: '#/purchaseorders/new' },
          { icon: 'check-circle', text: 'PO goes through <strong>Draft → Submit → Approve → Receive</strong>' },
          { icon: 'package', text: 'When you mark a PO as <strong>Received</strong>, part quantities <strong>auto-update</strong>' }
        ]
      },
      {
        title: 'Onboarding a new property',
        icon: 'building-2',
        color: '#8B5CF6',
        steps: [
          { icon: 'building-2', text: 'Create the <strong>Property</strong> with address and type', link: '#/properties/new' },
          { icon: 'map', text: 'Add <strong>Locations</strong> to organize the property — buildings, floors, rooms' },
          { icon: 'wrench', text: 'Register <strong>Assets</strong> — every piece of equipment that needs maintenance', link: '#/assets/new' },
          { icon: 'gauge', text: 'Add <strong>Meters</strong> to assets to track usage (hours, miles, cycles)' },
          { icon: 'users', text: 'Assign a <strong>Team</strong> to the property', link: '#/teams' },
          { icon: 'calendar-clock', text: 'Set up <strong>PM Schedules</strong> for recurring maintenance', link: '#/preventive/new' },
          { icon: 'package', text: 'Stock <strong>Parts</strong> that you\'ll need for this property', link: '#/parts/new' }
        ]
      },
      {
        title: 'Getting competitive bids on a project',
        icon: 'briefcase',
        color: '#6366F1',
        steps: [
          { icon: 'file-text', text: 'Create a <strong>Project</strong> with a detailed scope of work, budget range, and deadline', link: '#/projects/new' },
          { icon: 'users', text: 'Invite bids from multiple <strong>Vendors</strong> — enter each bid with line item breakdowns by category (materials, labor, equipment, permits, overhead)' },
          { icon: 'columns-3', text: 'Use <strong>Bid Leveling</strong> to compare all bids side by side — see which vendor is cheapest per category and overall' },
          { icon: 'eye', text: 'Review terms: <strong>warranty, payment terms, timeline, inclusions, and exclusions</strong> — the cheapest bid isn\'t always the best' },
          { icon: 'trophy', text: '<strong>Award</strong> the winning bid — this auto-creates a <strong>Purchase Order</strong> with the bid line items' },
          { icon: 'shopping-cart', text: 'The PO flows through your normal procurement pipeline: <strong>Submit → Approve → Receive → Invoice → Payment</strong>', link: '#/purchaseorders' }
        ]
      }
    ];

    return `
      <div class="guide-section">
        <div class="guide-intro">
          <h2>Common Workflows</h2>
          <p>Step-by-step walkthroughs of the most common tasks. Click any highlighted item to jump to that section.</p>
        </div>

        <div class="workflow-list">
          ${workflows.map((wf, i) => `
            <div class="workflow-card">
              <div class="workflow-header" onclick="Guide.toggleWorkflow(${i})">
                <div class="workflow-header-left">
                  <div class="workflow-icon" style="background:${wf.color}15;color:${wf.color}">
                    <i data-lucide="${wf.icon}"></i>
                  </div>
                  <strong>${wf.title}</strong>
                </div>
                <i data-lucide="chevron-down" class="workflow-chevron" id="wf-chevron-${i}"></i>
              </div>
              <div class="workflow-steps" id="wf-steps-${i}" style="display:${i === 0 ? 'block' : 'none'}">
                ${wf.steps.map((step, j) => `
                  <div class="workflow-step">
                    <div class="workflow-step-number">${j + 1}</div>
                    <div class="workflow-step-connector"></div>
                    <div class="workflow-step-icon"><i data-lucide="${step.icon}"></i></div>
                    <div class="workflow-step-text">
                      ${step.link ? `<a href="${step.link}">${step.text}</a>` : `<span>${step.text}</span>`}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },

  toggleWorkflow(index) {
    const el = document.getElementById('wf-steps-' + index);
    const chevron = document.getElementById('wf-chevron-' + index);
    if (!el) return;
    if (el.style.display === 'none') {
      el.style.display = 'block';
      if (chevron) chevron.style.transform = 'rotate(180deg)';
    } else {
      el.style.display = 'none';
      if (chevron) chevron.style.transform = '';
    }
  },

  renderReference() {
    const modules = [
      { icon: 'clipboard-list', name: 'Work Orders', color: '#3B82F6', route: '#/workorders',
        when: 'Any time maintenance work needs to be tracked',
        what: 'Create, assign, prioritize, and track tasks to completion. Log parts used, time spent, and follow procedures.',
        creates: 'Created by: staff, PM schedules, approved requests, templates' },
      { icon: 'inbox', name: 'Work Requests', color: '#06B6D4', route: '#/requests',
        when: 'A non-staff person needs maintenance',
        what: 'Public intake form. Residents/guests submit without logging in. You review and approve into work orders, or decline.',
        creates: 'Becomes: a Work Order (when approved)' },
      { icon: 'calendar-clock', name: 'Preventive Maintenance', color: '#F59E0B', route: '#/preventive',
        when: 'You want recurring maintenance on a schedule',
        what: 'Set frequency (daily to annual), attach a procedure, assign a team. System auto-creates work orders when due.',
        creates: 'Creates: Work Orders automatically' },
      { icon: 'clipboard-check', name: 'Procedures', color: '#F97316', route: '#/procedures',
        when: 'You need consistent steps for a task',
        what: 'Step-by-step checklists (checkbox, text, number, pass/fail). Attach to work orders or PM schedules.',
        creates: 'Attached to: Work Orders, PM Schedules' },
      { icon: 'building-2', name: 'Properties', color: '#8B5CF6', route: '#/properties',
        when: 'Adding a new location to your portfolio',
        what: 'Your physical locations. Each property has locations, assets, and assigned teams.',
        creates: 'Contains: Locations, Assets' },
      { icon: 'wrench', name: 'Assets', color: '#10B981', route: '#/assets',
        when: 'Equipment or systems need tracking',
        what: 'Everything that needs maintenance — HVAC, pools, generators. Track make/model, warranty, meters, and downtime.',
        creates: 'Linked to: Properties, Work Orders, Meters' },
      { icon: 'package', name: 'Parts & Inventory', color: '#EF4444', route: '#/parts',
        when: 'Tracking spare parts and supplies',
        what: 'Stock levels, min quantities, costs. Parts are consumed on work orders and restocked via purchase orders.',
        creates: 'Used by: Work Orders. Restocked by: Purchase Orders' },
      { icon: 'truck', name: 'Vendors', color: '#EC4899', route: '#/vendors',
        when: 'You need to track suppliers',
        what: 'Your external suppliers and contractors. Track contact info, specialties, and linked purchase orders.',
        creates: 'Linked to: Purchase Orders' },
      { icon: 'shopping-cart', name: 'Purchase Orders', color: '#14B8A6', route: '#/purchaseorders',
        when: 'Ordering parts or services',
        what: 'Formal procurement: Draft → Submit → Approve → Receive. Receiving auto-updates parts inventory.',
        creates: 'Restocks: Parts inventory' },
      { icon: 'briefcase', name: 'Projects & Bids', color: '#6366F1', route: '#/projects',
        when: 'Soliciting competitive bids from vendors',
        what: 'Define scope of work, collect vendor bids with category breakdowns, level them side by side, and award the winner. Award auto-creates a Purchase Order.',
        creates: 'Creates: Purchase Orders. Links to: Vendors, Properties' },
      { icon: 'users', name: 'Teams', color: '#6366F1', route: '#/teams',
        when: 'Organizing staff by specialty',
        what: 'Group technicians by skill — grounds, interior, security. Assign properties and work orders to teams.',
        creates: 'Assigned to: Properties, Work Orders' },
      { icon: 'message-circle', name: 'Messages', color: '#8B5CF6', route: '#/messages',
        when: 'Communicating with staff',
        what: 'Direct messages, team channels, and work-order-specific discussions. All communication in context.',
        creates: 'Channels: Direct, Team, Work Order' },
      { icon: 'bar-chart-3', name: 'Reports', color: '#10B981', route: '#/reports',
        when: 'Analyzing performance',
        what: 'Completion rates, response times, costs, team performance, PM compliance. Export any data as CSV.',
        creates: 'Uses data from: all modules' }
    ];

    return `
      <div class="guide-section">
        <div class="guide-intro">
          <h2>Quick Reference</h2>
          <p>Every module at a glance — what it does, when to use it, and how it connects to everything else.</p>
        </div>

        <div class="reference-grid">
          ${modules.map(m => `
            <a href="${m.route}" class="reference-card">
              <div class="reference-icon" style="background:${m.color}12;color:${m.color}">
                <i data-lucide="${m.icon}"></i>
              </div>
              <div class="reference-content">
                <strong>${m.name}</strong>
                <div class="reference-when"><i data-lucide="help-circle" style="width:12px;height:12px"></i> <em>When:</em> ${m.when}</div>
                <p>${m.what}</p>
                <div class="reference-connects">${m.creates}</div>
              </div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }
};
