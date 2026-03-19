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
        <button class="guide-tab ${this._activeTab === 'users' ? 'active' : ''}" onclick="Guide.switchTab('users')">
          <i data-lucide="shield-check"></i> Users & Permissions
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
      case 'users': return this.renderUsers();
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
            <div class="flow-sources" style="grid-template-columns:repeat(5,1fr)">
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
              <div class="flow-node flow-node-source">
                <div class="flow-node-icon" style="background:#6366F1">
                  <i data-lucide="briefcase"></i>
                </div>
                <div class="flow-node-text">
                  <strong>Project Bid</strong>
                  <span>Awarded bid auto-creates PO</span>
                </div>
                <div class="flow-arrow-down"></div>
                <div class="flow-action">Bid awarded</div>
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

          <div class="flow-connector-main">
            <div class="flow-connector-line"></div>
            <div class="flow-connector-label">When vendors are involved...</div>
          </div>

          <div class="flow-stage">
            <div class="flow-stage-label">Procurement & Payment Pipeline</div>
            <div class="flow-complete-steps" style="flex-wrap:wrap;gap:16px">
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#14B8A6"><i data-lucide="shopping-cart"></i></div>
                <span>Purchase Order</span>
              </div>
              <div class="flow-complete-arrow"></div>
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#8B5CF6"><i data-lucide="receipt"></i></div>
                <span>Invoice</span>
              </div>
              <div class="flow-complete-arrow"></div>
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#00C853"><i data-lucide="send"></i></div>
                <span>Bill.com</span>
              </div>
              <div class="flow-complete-arrow"></div>
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#2CA01C"><i data-lucide="calculator"></i></div>
                <span>QuickBooks</span>
              </div>
            </div>
          </div>
        </div>

        <div class="flow-sidebar-diagram">
          <h3>Supporting Systems</h3>
          <div class="flow-support-grid" style="grid-template-columns:repeat(3,1fr)">
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
            <div class="flow-support-card">
              <div class="flow-support-icon" style="background:#6366F115;color:#6366F1"><i data-lucide="briefcase"></i></div>
              <div>
                <strong>Projects & Bids</strong>
                <span>For larger jobs, define a scope of work and collect competitive bids. Level bids side by side, award the winner, and a PO is auto-created.</span>
              </div>
            </div>
            <div class="flow-support-card">
              <div class="flow-support-icon" style="background:#8B5CF615;color:#8B5CF6"><i data-lucide="receipt"></i></div>
              <div>
                <strong>Invoices & Payments</strong>
                <span>After receiving goods, create an invoice from the PO. 3-way match, approve, and send to Bill.com for payment. QuickBooks stays in sync automatically.</span>
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
        title: 'Using the property hub to manage an estate',
        icon: 'building-2',
        color: '#8B5CF6',
        steps: [
          { icon: 'building-2', text: 'Navigate to <strong>Properties</strong> and click into any property — this is your command center for that estate', link: '#/properties' },
          { icon: 'layout-dashboard', text: 'The <strong>Overview</strong> tab shows everything at a glance: active work, upcoming PM, recent activity, active projects, and spending' },
          { icon: 'wrench', text: 'The <strong>Assets</strong> tab shows all equipment and systems with status badges — see what\'s operational, needs repair, or is down' },
          { icon: 'clipboard-list', text: 'The <strong>Work Orders</strong> tab shows all maintenance tasks with priority and status — spot overdue items instantly' },
          { icon: 'briefcase', text: 'The <strong>Projects</strong> tab shows active bidding projects — see bid counts, budgets, and award status' },
          { icon: 'users', text: 'The <strong>Team</strong> tab shows who\'s assigned to this property and how to reach them' },
          { icon: 'bar-chart-3', text: 'The <strong>stats bar</strong> across the top is your health check: assets, active WOs, PM schedules, projects, parts, and total spend' }
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
        title: 'Using QR codes and NFC tags in the field',
        icon: 'qr-code',
        color: '#0EA5E9',
        steps: [
          { icon: 'printer', text: 'Go to any <strong>Asset</strong>, <strong>Part</strong>, or <strong>Procedure</strong> detail page and click <strong>QR Code</strong> to print a label' },
          { icon: 'layers', text: 'For bulk printing, use <strong>Print QR Labels</strong> on the Assets or Parts list to print all codes at once — ready for label sheets' },
          { icon: 'scan-line', text: 'Stick QR labels on equipment, bins, and room doors. Program NFC tags with the same URL' },
          { icon: 'smartphone', text: 'Staff <strong>scan with any phone camera</strong> — it opens the item directly in Estate Maintain. No app needed.' },
          { icon: 'wrench', text: 'From any scanned page: see maintenance history, log downtime, start a procedure, record meter readings, or update inventory — <strong>all from the item you\'re standing next to</strong>' },
          { icon: 'door-open', text: 'For rooms: scan the <strong>location QR</strong> on the door to see linked procedures, assets in the room, and recent work orders. Tap a procedure to start the checklist.' }
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
      },
      {
        title: 'From bid to vendor payment',
        icon: 'receipt',
        color: '#8B5CF6',
        steps: [
          { icon: 'briefcase', text: '<strong>Award a bid</strong> on a project — a Purchase Order is auto-created with the bid line items', link: '#/projects' },
          { icon: 'shopping-cart', text: 'The PO goes through <strong>Submit → Approve → Receive</strong> as goods/services are delivered', link: '#/purchaseorders' },
          { icon: 'receipt', text: 'Create an <strong>Invoice</strong> from the received PO — the system auto-populates line items and runs a 3-way match', link: '#/invoices' },
          { icon: 'check-circle', text: '<strong>Approve the invoice</strong> — the 3-way match confirms PO amount, received quantity, and invoice total align' },
          { icon: 'send', text: 'Send to <strong>Bill.com</strong> for payment — the vendor gets paid via ACH or check' },
          { icon: 'calculator', text: 'Bill.com syncs with <strong>QuickBooks</strong> automatically — the expense is recorded in your books with the right GL account' }
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

  renderUsers() {
    return `
      <div class="guide-section">
        <div class="guide-intro">
          <h2>Users & Permissions</h2>
          <p>How people, roles, and access control work together in Estatecraft.</p>
        </div>

        <!-- Role Hierarchy -->
        <div class="card" style="margin-bottom:24px">
          <div class="card-header"><h3>Role Hierarchy</h3></div>
          <div class="card-body">
            <div class="hierarchy-chart">
              <div class="hier-node" style="border-color:#7C3AED">
                <div class="hier-icon" style="background:#7C3AED;color:#EDE9FE"><i data-lucide="zap"></i></div>
                <div class="hier-details">
                  <strong>God Mode</strong>
                  <span style="display:inline-flex;align-items:center;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:600;background:#EDE9FE;color:#7C3AED">owner</span>
                  <p>System-level access. Sees all properties across all estates. Manages the entire platform. Can only be granted via server command line — never through the UI or registration.</p>
                </div>
              </div>
              <div class="hier-line"></div>
              <div class="hier-node hier-admin">
                <div class="hier-icon" style="background:#991B1B;color:#FEE2E2"><i data-lucide="crown"></i></div>
                <div class="hier-details">
                  <strong>Administrator</strong>
                  <span class="role-badge role-admin">admin</span>
                  <p>Creates and manages their own properties. Invites others to their properties with role and access scoping. Cannot see other admins' properties.</p>
                </div>
              </div>
              <div class="hier-line"></div>
              <div class="hier-node hier-manager">
                <div class="hier-icon" style="background:#1E40AF;color:#DBEAFE"><i data-lucide="briefcase"></i></div>
                <div class="hier-details">
                  <strong>Manager</strong>
                  <span class="role-badge role-manager">manager</span>
                  <p>Oversees operations. Assigns work, reviews completed work orders, approves purchase orders, manages vendors and teams. Cannot manage user permissions or system settings.</p>
                </div>
              </div>
              <div class="hier-line"></div>
              <div class="hier-fork">
                <div class="hier-fork-line"></div>
                <div class="hier-fork-branches">
                  <div class="hier-node hier-lead">
                    <div class="hier-icon" style="background:#047857;color:#D1FAE5"><i data-lucide="star"></i></div>
                    <div class="hier-details">
                      <strong>Team Lead</strong>
                      <span class="role-badge role-technician" style="border:2px solid #047857">technician + lead</span>
                      <p>A technician with extra powers: can assign work within their team, review their team's work orders, and see team-level reports.</p>
                    </div>
                  </div>
                  <div class="hier-node hier-tech">
                    <div class="hier-icon" style="background:#374151;color:#F3F4F6"><i data-lucide="wrench"></i></div>
                    <div class="hier-details">
                      <strong>Technician</strong>
                      <span class="role-badge role-technician">technician</span>
                      <p>The boots on the ground. Views assigned work orders, logs time and parts, follows procedures, sends messages. Sees only properties they have access to.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Permission System -->
        <div class="card" style="margin-bottom:24px">
          <div class="card-header"><h3>How Permissions Work</h3></div>
          <div class="card-body">
            <div class="perm-flow-diagram">
              <div class="perm-flow-row">
                <div class="perm-flow-box perm-flow-role">
                  <i data-lucide="users"></i>
                  <strong>Role</strong>
                  <span>admin, manager, or technician</span>
                </div>
                <div class="perm-flow-arrow"><i data-lucide="arrow-right"></i></div>
                <div class="perm-flow-box perm-flow-defaults">
                  <i data-lucide="list-checks"></i>
                  <strong>Role Defaults</strong>
                  <span>Each role has a predefined set of 75 permissions like <code>workorders:create</code> or <code>invoices:approve</code></span>
                </div>
              </div>
              <div class="perm-flow-plus">
                <i data-lucide="plus-circle"></i>
              </div>
              <div class="perm-flow-row">
                <div class="perm-flow-box perm-flow-override">
                  <i data-lucide="sliders-horizontal"></i>
                  <strong>Per-User Overrides</strong>
                  <span>Admins can grant or revoke individual permissions for any user, on top of their role defaults</span>
                </div>
                <div class="perm-flow-arrow"><i data-lucide="arrow-right"></i></div>
                <div class="perm-flow-box perm-flow-effective">
                  <i data-lucide="shield-check"></i>
                  <strong>Effective Permissions</strong>
                  <span>The final set that determines what a user can see and do — checked on every API request</span>
                </div>
              </div>
              <div class="perm-flow-note">
                <i data-lucide="lightbulb" style="width:16px;height:16px;flex-shrink:0"></i>
                <span><strong>Role Templates</strong> let you save a permission configuration and apply it to users in one click — useful for custom roles like "Read-Only Auditor" or "Senior Technician".</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Property Access -->
        <div class="card" style="margin-bottom:24px">
          <div class="card-header"><h3>Property Access</h3></div>
          <div class="card-body">
            <div class="prop-access-diagram">
              <div class="prop-access-rule">
                <div class="prop-access-icon" style="background:#8B5CF615;color:#8B5CF6"><i data-lucide="building-2"></i></div>
                <div>
                  <strong>Users only see properties they have access to.</strong>
                  <p>When you create a property, you automatically get access. Other users must be explicitly granted access — either by an admin in User Management, through a bulk grant, or via invitation.</p>
                </div>
              </div>
              <div class="prop-access-examples">
                <div class="prop-access-example">
                  <div class="prop-access-scenario">
                    <i data-lucide="check-circle" style="color:#22C55E"></i>
                    <span>You <strong>created</strong> Lakehouse Estate</span>
                  </div>
                  <div class="prop-access-result">You can see all its work orders, assets, and data</div>
                </div>
                <div class="prop-access-example">
                  <div class="prop-access-scenario">
                    <i data-lucide="check-circle" style="color:#22C55E"></i>
                    <span>Admin <strong>granted you access</strong> to Mountain Lodge</span>
                  </div>
                  <div class="prop-access-result">You can see all its work orders, assets, and data</div>
                </div>
                <div class="prop-access-example">
                  <div class="prop-access-scenario">
                    <i data-lucide="x-circle" style="color:#EF4444"></i>
                    <span>You have <strong>no access</strong> to Harbor Villa</span>
                  </div>
                  <div class="prop-access-result">It doesn't appear in your property list, work orders, or anywhere else</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Lifecycle / How Users Join -->
        <div class="card" style="margin-bottom:24px">
          <div class="card-header"><h3>How Users Join</h3></div>
          <div class="card-body">
            <div class="flow-complete-steps" style="flex-wrap:wrap;gap:16px;justify-content:center">
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#3B82F6"><i data-lucide="mail"></i></div>
                <span>Admin sends invite</span>
                <small style="color:var(--text-muted);font-size:0.75rem">Picks role & team</small>
              </div>
              <div class="flow-complete-arrow"></div>
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#F59E0B"><i data-lucide="link"></i></div>
                <span>User gets invite link</span>
                <small style="color:var(--text-muted);font-size:0.75rem">7-day expiry</small>
              </div>
              <div class="flow-complete-arrow"></div>
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#8B5CF6"><i data-lucide="user-plus"></i></div>
                <span>Sets name & password</span>
                <small style="color:var(--text-muted);font-size:0.75rem">Role auto-assigned</small>
              </div>
              <div class="flow-complete-arrow"></div>
              <div class="flow-complete-step">
                <div class="flow-step-circle" style="background:#10B981"><i data-lucide="check"></i></div>
                <span>Active user</span>
                <small style="color:var(--text-muted);font-size:0.75rem">Onboarding starts</small>
              </div>
            </div>
            <div class="perm-flow-note" style="margin-top:16px">
              <i data-lucide="info" style="width:16px;height:16px;flex-shrink:0"></i>
              <span><strong>User lifecycle:</strong> Invited → Active → Suspended (can't log in, data preserved) → Deactivated (soft-deleted). Admins control transitions from User Management.</span>
            </div>
          </div>
        </div>

        <!-- Review & Approval Chain -->
        <div class="card" style="margin-bottom:24px">
          <div class="card-header"><h3>Review & Approval Chain</h3></div>
          <div class="card-body">
            <div class="chain-diagram">
              <div class="chain-section">
                <h4 style="margin-bottom:12px;color:var(--text-muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em">Work Order Review</h4>
                <div class="chain-flow">
                  <div class="chain-step">
                    <span class="role-badge role-technician">Technician</span>
                    <small>completes work</small>
                  </div>
                  <i data-lucide="arrow-right" style="color:var(--text-muted)"></i>
                  <div class="chain-step">
                    <span class="role-badge role-manager">Manager / Lead</span>
                    <small>reviews & signs off</small>
                  </div>
                  <i data-lucide="arrow-right" style="color:var(--text-muted)"></i>
                  <div class="chain-step chain-step-outcome chain-step-approve">
                    <i data-lucide="check-circle"></i> Approved
                  </div>
                  <span style="color:var(--text-muted);font-size:0.8rem;margin:0 4px">or</span>
                  <div class="chain-step chain-step-outcome chain-step-rework">
                    <i data-lucide="rotate-ccw"></i> Rework
                  </div>
                </div>
              </div>
              <div class="chain-section" style="margin-top:20px">
                <h4 style="margin-bottom:12px;color:var(--text-muted);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.05em">Configurable Approvals (POs, Invoices)</h4>
                <div class="chain-flow">
                  <div class="chain-step">
                    <span style="font-weight:600;font-size:0.85rem">Rule triggers</span>
                    <small>e.g., PO total > $5,000</small>
                  </div>
                  <i data-lucide="arrow-right" style="color:var(--text-muted)"></i>
                  <div class="chain-step">
                    <span class="role-badge role-manager">Required approver</span>
                    <small>or their delegate</small>
                  </div>
                  <i data-lucide="arrow-right" style="color:var(--text-muted)"></i>
                  <div class="chain-step chain-step-outcome chain-step-approve">
                    <i data-lucide="check-circle"></i> Approved
                  </div>
                  <span style="color:var(--text-muted);font-size:0.8rem;margin:0 4px">or</span>
                  <div class="chain-step chain-step-outcome chain-step-reject">
                    <i data-lucide="x-circle"></i> Rejected
                  </div>
                </div>
              </div>
              <div class="perm-flow-note" style="margin-top:16px">
                <i data-lucide="calendar-off" style="width:16px;height:16px;flex-shrink:0"></i>
                <span><strong>Out of office?</strong> Users can delegate their approval authority to a colleague for a date range. Delegated approvals show up in the delegate's queue automatically.</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Sidebar Visibility -->
        <div class="card">
          <div class="card-header"><h3>What Each Role Sees</h3></div>
          <div class="card-body">
            <table class="user-table" style="font-size:0.85rem">
              <thead>
                <tr>
                  <th>Section</th>
                  <th style="text-align:center"><span style="display:inline-flex;padding:2px 8px;border-radius:12px;font-size:0.7rem;font-weight:600;background:#EDE9FE;color:#7C3AED">God</span></th>
                  <th style="text-align:center"><span class="role-badge role-admin">Admin</span></th>
                  <th style="text-align:center"><span class="role-badge role-manager">Manager</span></th>
                  <th style="text-align:center"><span class="role-badge role-technician">Technician</span></th>
                </tr>
              </thead>
              <tbody>
                ${[
                  ['Dashboard', true, true, true, true],
                  ['Work Orders', true, true, true, true],
                  ['Review Queue', true, true, true, false],
                  ['Work Requests', true, true, true, true],
                  ['Approvals', true, true, true, false],
                  ['Properties', true, true, true, true],
                  ['Assets', true, true, true, true],
                  ['Preventive Maintenance', true, true, true, true],
                  ['Procedures', true, true, true, true],
                  ['Parts & Inventory', true, true, true, true],
                  ['Vendors', true, true, true, false],
                  ['Purchase Orders', true, true, true, false],
                  ['Invoices', true, true, true, false],
                  ['Projects & Bids', true, true, true, false],
                  ['Messages', true, true, true, true],
                  ['User Management', true, true, false, false],
                  ['Teams', true, true, true, true],
                  ['Audit Log', true, true, false, false],
                  ['Reports', true, true, true, false],
                  ['Settings', true, true, true, false],
                  ['Integrations', true, true, false, false],
                  ['All Properties (cross-estate)', true, false, false, false],
                ].map(([section, god, admin, manager, tech]) => `
                  <tr>
                    <td>${section}</td>
                    <td style="text-align:center">${god ? '<i data-lucide="check" style="width:16px;height:16px;color:#7C3AED"></i>' : '<i data-lucide="minus" style="width:16px;height:16px;color:var(--border)"></i>'}</td>
                    <td style="text-align:center">${admin ? '<i data-lucide="check" style="width:16px;height:16px;color:#22C55E"></i>' : '<i data-lucide="minus" style="width:16px;height:16px;color:var(--border)"></i>'}</td>
                    <td style="text-align:center">${manager ? '<i data-lucide="check" style="width:16px;height:16px;color:#22C55E"></i>' : '<i data-lucide="minus" style="width:16px;height:16px;color:var(--border)"></i>'}</td>
                    <td style="text-align:center">${tech ? '<i data-lucide="check" style="width:16px;height:16px;color:#22C55E"></i>' : '<i data-lucide="minus" style="width:16px;height:16px;color:var(--border)"></i>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="perm-flow-note" style="margin-top:16px">
              <i data-lucide="sliders-horizontal" style="width:16px;height:16px;flex-shrink:0"></i>
              <span>These are the <strong>defaults</strong>. Admins can customize any user's permissions with per-user overrides — for example, granting a technician access to Reports, or revoking a manager's access to Invoices.</span>
            </div>
          </div>
        </div>
      </div>
    `;
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
      { icon: 'receipt', name: 'Invoices', color: '#8B5CF6', route: '#/invoices',
        when: 'A vendor needs to be paid',
        what: 'Create from received POs with automatic 3-way matching. Approve and send to Bill.com for payment. Track payment status through to completion.',
        creates: 'Sent to: Bill.com. Matched against: Purchase Orders' },
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
        creates: 'Uses data from: all modules' },
      { icon: 'plug-zap', name: 'Integrations', color: '#10B981', route: '#/integrations',
        when: 'Connecting to Bill.com or QuickBooks',
        what: 'Configure OAuth credentials, sync GL accounts from QuickBooks, monitor sync activity, and manage the connection between your systems.',
        creates: 'Connects: Bill.com (payments), QuickBooks (accounting)' },
      { icon: 'qr-code', name: 'QR Codes & NFC', color: '#0EA5E9', route: '#/assets',
        when: 'Making physical items scannable',
        what: 'Print QR labels for assets, parts, locations, and procedures. Scan with any phone to jump directly to that item. Batch print for entire properties.',
        creates: 'Links to: Assets, Parts, Locations, Procedures, PM Schedules' }
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
