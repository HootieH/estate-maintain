const Attachments = {
  // Render attachments section for any entity
  // Usage: Attachments.render('work_order', 42, document.getElementById('attachments-container'))
  async renderInto(entityType, entityId, containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = '<div class="loading" style="padding:16px"><div class="spinner"></div></div>';

    try {
      const data = await API.get(`/attachments/${entityType}/${entityId}`);
      const attachments = data.attachments || [];
      const folderLink = data.folderLink;

      containerEl.innerHTML = `
        <div class="attachments-section">
          <div class="attachments-header">
            <h4>Files & Attachments ${attachments.length > 0 ? `<span class="text-muted" style="font-weight:400;font-size:13px">(${attachments.length})</span>` : ''}</h4>
            <div class="attachments-actions">
              ${folderLink ? `<a href="${folderLink}" target="_blank" class="btn btn-sm btn-secondary" title="Open folder in Google Drive"><i data-lucide="external-link"></i> Drive</a>` : ''}
              <button class="btn btn-sm btn-primary" onclick="Attachments.showUpload('${entityType}', ${entityId})">
                <i data-lucide="paperclip"></i> Attach
              </button>
            </div>
          </div>
          ${attachments.length === 0 ? `
            <div class="attachments-empty">
              <i data-lucide="paperclip" style="width:20px;height:20px;color:var(--text-light);margin-bottom:4px"></i>
              <span>No files attached</span>
            </div>
          ` : `
            <div class="attachments-grid">
              ${attachments.map(a => this.renderFile(a, entityType, entityId)).join('')}
            </div>
          `}
        </div>
      `;
      lucide.createIcons({ nodes: [containerEl] });
    } catch (e) {
      containerEl.innerHTML = `<div class="attachments-section"><p class="text-muted" style="padding:12px;font-size:13px">Unable to load attachments</p></div>`;
    }
  },

  renderFile(a, entityType, entityId) {
    const isImage = a.mime_type && a.mime_type.startsWith('image/');
    const isPdf = a.mime_type === 'application/pdf';
    const isSheet = a.mime_type && (a.mime_type.includes('spreadsheet') || a.mime_type.includes('excel'));
    const isDoc = a.mime_type && (a.mime_type.includes('document') || a.mime_type.includes('word'));

    const iconMap = {
      image: 'image',
      pdf: 'file-text',
      sheet: 'table-2',
      doc: 'file-text',
      default: 'file'
    };
    const icon = isImage ? iconMap.image : isPdf ? iconMap.pdf : isSheet ? iconMap.sheet : isDoc ? iconMap.doc : iconMap.default;
    const colorMap = {
      image: '#10B981',
      pdf: '#EF4444',
      sheet: '#10B981',
      doc: '#3B82F6',
      default: '#6B7280'
    };
    const color = isImage ? colorMap.image : isPdf ? colorMap.pdf : isSheet ? colorMap.sheet : isDoc ? colorMap.doc : colorMap.default;

    const sizeStr = a.size_bytes ? this.formatSize(a.size_bytes) : '';

    return `
      <div class="attachment-file">
        ${isImage && a.thumbnail_url ? `
          <div class="attachment-thumb" style="background-image:url('${a.thumbnail_url}')" onclick="window.open('${a.web_view_link}','_blank')"></div>
        ` : `
          <div class="attachment-icon" style="background:${color}12;color:${color}" onclick="window.open('${a.web_view_link}','_blank')">
            <i data-lucide="${icon}"></i>
          </div>
        `}
        <div class="attachment-info">
          <a href="${a.web_view_link || '#'}" target="_blank" class="attachment-name" title="${a.filename}">${a.filename}</a>
          <span class="attachment-meta">${sizeStr}${a.uploaded_by_name ? (sizeStr ? ' · ' : '') + a.uploaded_by_name : ''}${a.created_at ? ' · ' + Dashboard.formatDate(a.created_at) : ''}</span>
        </div>
        <button class="btn-icon" onclick="Attachments.deleteFile('${entityType}', ${entityId}, ${a.id})" title="Remove">
          <i data-lucide="x" style="width:14px;height:14px"></i>
        </button>
      </div>
    `;
  },

  formatSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  },

  async showUpload(entityType, entityId) {
    // First check if Google Drive is connected
    try {
      const status = await API.get('/attachments/status/check');
      if (!status.connected) {
        App.toast('Google Drive not connected. Set up in Integrations.', 'error');
        // Offer to navigate
        if (confirm('Google Drive is not connected. Go to Integrations to set it up?')) {
          Router.navigate('#/integrations');
        }
        return;
      }
    } catch {
      // Status check failed, try upload anyway
    }

    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'Attach File';
    modal.querySelector('.modal-body').innerHTML = `
      <div class="upload-area" id="upload-drop-area">
        <div class="upload-area-content">
          <i data-lucide="upload-cloud" style="width:40px;height:40px;color:var(--primary-light);margin-bottom:12px"></i>
          <p style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:4px">Drop files here or click to browse</p>
          <p style="font-size:12px;color:var(--text-muted)">Photos, PDFs, spreadsheets, documents</p>
          <input type="file" id="upload-file-input" multiple style="display:none" onchange="Attachments.handleFiles(event, '${entityType}', ${entityId})">
        </div>
      </div>
      <div id="upload-progress" style="display:none;margin-top:12px"></div>
      <div id="upload-error" class="form-error" style="display:none;margin-top:12px"></div>
    `;
    modal.querySelector('.modal-footer').innerHTML = `
      <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
    `;
    modal.style.display = 'flex';
    lucide.createIcons();

    // Wire up click and drag events
    const dropArea = document.getElementById('upload-drop-area');
    dropArea.onclick = () => document.getElementById('upload-file-input').click();

    dropArea.ondragover = (e) => { e.preventDefault(); dropArea.classList.add('upload-drag-over'); };
    dropArea.ondragleave = () => dropArea.classList.remove('upload-drag-over');
    dropArea.ondrop = (e) => {
      e.preventDefault();
      dropArea.classList.remove('upload-drag-over');
      if (e.dataTransfer.files.length > 0) {
        this.processFiles(e.dataTransfer.files, entityType, entityId);
      }
    };
  },

  handleFiles(event, entityType, entityId) {
    const files = event.target.files;
    if (files.length > 0) {
      this.processFiles(files, entityType, entityId);
    }
  },

  async processFiles(fileList, entityType, entityId) {
    const progressEl = document.getElementById('upload-progress');
    const errorEl = document.getElementById('upload-error');
    if (progressEl) progressEl.style.display = 'block';
    if (errorEl) errorEl.style.display = 'none';

    let uploaded = 0;
    const total = fileList.length;

    for (const file of fileList) {
      if (progressEl) {
        progressEl.innerHTML = `<div style="font-size:13px;color:var(--text-muted)">Uploading ${uploaded + 1} of ${total}: ${file.name}...</div>
          <div class="project-progress-track" style="margin-top:6px"><div class="project-progress-fill" style="width:${(uploaded / total) * 100}%"></div></div>`;
      }

      try {
        // Read file as base64
        const base64 = await this.readFileAsBase64(file);
        await API.post(`/attachments/${entityType}/${entityId}/upload`, {
          filename: file.name,
          mimeType: file.type,
          data: base64
        });
        uploaded++;
      } catch (e) {
        if (errorEl) {
          errorEl.textContent = `Failed to upload ${file.name}: ${e.message}`;
          errorEl.style.display = 'block';
        }
      }
    }

    if (progressEl) {
      progressEl.innerHTML = `<div style="font-size:13px;color:var(--success);font-weight:500">${uploaded} file${uploaded !== 1 ? 's' : ''} uploaded</div>`;
    }

    // Refresh the attachments section on the page
    App.toast(`${uploaded} file${uploaded !== 1 ? 's' : ''} attached`, 'success');

    // Close modal after a beat
    setTimeout(() => {
      App.closeModal();
      // Re-render the attachments section if it exists on the current page
      const container = document.getElementById(`attachments-${entityType}-${entityId}`);
      if (container) {
        this.renderInto(entityType, entityId, container);
      }
    }, 800);
  },

  readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        // Remove the data URL prefix (e.g., "data:image/png;base64,")
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  async deleteFile(entityType, entityId, attachmentId) {
    if (!confirm('Remove this attachment?')) return;
    try {
      await API.delete(`/attachments/${entityType}/${entityId}/${attachmentId}`);
      App.toast('Attachment removed', 'success');
      const container = document.getElementById(`attachments-${entityType}-${entityId}`);
      if (container) {
        this.renderInto(entityType, entityId, container);
      }
    } catch (e) {
      App.toast(e.message, 'error');
    }
  },

  // Helper to generate an attachments container div for embedding in detail pages
  // Returns HTML string. After rendering the page, call Attachments.renderInto() to populate.
  placeholder(entityType, entityId) {
    return `<div id="attachments-${entityType}-${entityId}" class="card" style="margin-top:16px">
      <div class="card-body" style="padding:16px"><div class="loading" style="padding:8px"><div class="spinner"></div></div></div>
    </div>`;
  },

  // Call after page renders to load attachments into the placeholder
  load(entityType, entityId) {
    const el = document.getElementById(`attachments-${entityType}-${entityId}`);
    if (el) {
      this.renderInto(entityType, entityId, el);
    }
  }
};
