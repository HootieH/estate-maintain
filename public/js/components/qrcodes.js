const QRCodes = {
  // Base URL for QR codes - uses the live site URL
  baseUrl: window.location.origin,

  // Generate QR code data URL
  generate(type, id, size) {
    size = size || 6;
    const url = `${this.baseUrl}/scan/${type}/${id}`;
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return { dataUrl: qr.createDataURL(size, 0), url };
  },

  // Generate SVG string for high-quality print
  generateSVG(type, id, moduleSize) {
    moduleSize = moduleSize || 4;
    const url = `${this.baseUrl}/scan/${type}/${id}`;
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    return { svg: qr.createSvgTag(moduleSize, 0), url };
  },

  // Show QR code modal for a single entity
  showModal(type, id, name, subtitle) {
    const { dataUrl, url } = this.generate(type, id, 8);
    const modal = document.getElementById('modal-overlay');
    modal.querySelector('.modal-title').textContent = 'QR Code';
    modal.querySelector('.modal-body').innerHTML = `
      <div class="qr-modal">
        <div class="qr-preview">
          <img src="${dataUrl}" alt="QR Code" class="qr-image">
        </div>
        <div class="qr-info">
          <strong class="qr-entity-name">${name}</strong>
          <span class="qr-entity-type">${this.typeLabel(type)}</span>
          ${subtitle ? `<span class="qr-entity-subtitle">${subtitle}</span>` : ''}
          <code class="qr-url">${url}</code>
        </div>
        <div class="qr-actions">
          <button class="btn btn-primary" onclick="QRCodes.printSingle('${type}', '${id}', '${name.replace(/'/g, "\\'")}', '${(subtitle || '').replace(/'/g, "\\'")}')">
            <i data-lucide="printer"></i> Print Label
          </button>
          <button class="btn btn-secondary" onclick="QRCodes.downloadPNG('${type}', '${id}', '${name.replace(/'/g, "\\'")}')">
            <i data-lucide="download"></i> Download PNG
          </button>
          <button class="btn btn-secondary" onclick="QRCodes.copyUrl('${url}')">
            <i data-lucide="copy"></i> Copy URL
          </button>
        </div>
      </div>
    `;
    modal.querySelector('.modal-footer').innerHTML = '';
    modal.style.display = 'flex';
    lucide.createIcons();
  },

  // Print a single QR code label
  printSingle(type, id, name, subtitle) {
    const { svg, url } = this.generateSVG(type, id, 6);
    const printWindow = window.open('', '_blank', 'width=400,height=500');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Label - ${name}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, system-ui, sans-serif; }
          .label {
            width: 2.5in;
            padding: 0.2in;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            page-break-after: always;
          }
          .qr-svg { margin-bottom: 8px; }
          .qr-svg svg { width: 1.8in; height: 1.8in; }
          .name { font-size: 12px; font-weight: 700; margin-bottom: 2px; line-height: 1.2; }
          .type { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
          .subtitle { font-size: 9px; color: #888; margin-bottom: 4px; }
          .url { font-size: 7px; color: #999; word-break: break-all; font-family: monospace; }
          @media print {
            @page { size: 2.5in 3in; margin: 0; }
            body { -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="label">
          <div class="qr-svg">${svg}</div>
          <div class="name">${name}</div>
          <div class="type">${this.typeLabel(type)}</div>
          ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
          <div class="url">${url}</div>
        </div>
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  },

  // Print batch of QR codes (multiple labels per page)
  printBatch(items) {
    // items = [{ type, id, name, subtitle }]
    const labels = items.map(item => {
      const { svg, url } = this.generateSVG(item.type, item.id, 4);
      return `
        <div class="label">
          <div class="qr-svg">${svg}</div>
          <div class="name">${item.name}</div>
          <div class="type">${this.typeLabel(item.type)}</div>
          ${item.subtitle ? `<div class="subtitle">${item.subtitle}</div>` : ''}
        </div>
      `;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Labels (${items.length})</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, system-ui, sans-serif; }
          .grid {
            display: grid;
            grid-template-columns: repeat(3, 2.5in);
            gap: 0.1in;
            padding: 0.25in;
          }
          .label {
            width: 2.5in;
            height: 2.8in;
            padding: 0.15in;
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            border: 1px dashed #ccc;
            page-break-inside: avoid;
          }
          .qr-svg { margin-bottom: 4px; }
          .qr-svg svg { width: 1.5in; height: 1.5in; }
          .name { font-size: 10px; font-weight: 700; line-height: 1.2; margin-bottom: 2px; }
          .type { font-size: 8px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
          .subtitle { font-size: 8px; color: #888; }
          @media print {
            @page { margin: 0.25in; }
            .label { border: none; }
          }
        </style>
      </head>
      <body>
        <div class="grid">${labels}</div>
        <script>window.onload = () => { window.print(); }<\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
  },

  // Download QR as PNG
  downloadPNG(type, id, name) {
    const { dataUrl } = this.generate(type, id, 10);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `qr-${type}-${id}-${name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`;
    a.click();
  },

  // Copy URL to clipboard
  async copyUrl(url) {
    try {
      await navigator.clipboard.writeText(url);
      App.toast('URL copied to clipboard', 'success');
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      App.toast('URL copied', 'success');
    }
  },

  // Type labels
  typeLabel(type) {
    const labels = {
      asset: 'Asset', location: 'Location', part: 'Part', property: 'Property',
      pm: 'PM Schedule', procedure: 'Procedure', wo: 'Work Order', project: 'Project'
    };
    return labels[type] || type;
  },

  // Render inline QR code thumbnail (for embedding in detail pages)
  thumbnail(type, id, size) {
    size = size || 4;
    const { dataUrl } = this.generate(type, id, size);
    return `<img src="${dataUrl}" alt="QR Code" class="qr-thumbnail" style="width:${size * 25}px;height:${size * 25}px;image-rendering:pixelated;border-radius:4px;cursor:pointer">`;
  },

  // Render a QR button for use on detail pages
  button(type, id, name, subtitle) {
    const escapedName = (name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const escapedSub = (subtitle || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<button class="btn btn-secondary btn-sm" onclick="QRCodes.showModal('${type}', '${id}', '${escapedName}', '${escapedSub}')" title="QR Code">
      <i data-lucide="qr-code"></i> QR Code
    </button>`;
  },

  // Print all asset QR codes for a property
  async printPropertyAssets(propertyId, propertyName) {
    try {
      const data = await API.get(`/assets?property_id=${propertyId}`);
      const assets = Array.isArray(data) ? data : (data.data || data.assets || []);
      if (assets.length === 0) {
        App.toast('No assets at this property', 'info');
        return;
      }
      const items = assets.map(a => ({
        type: 'asset',
        id: a.id,
        name: a.name,
        subtitle: `${a.category || ''} | ${propertyName}`
      }));
      this.printBatch(items);
    } catch (e) {
      App.toast('Failed to load assets: ' + e.message, 'error');
    }
  },

  // Print all part QR codes
  async printAllParts() {
    try {
      const data = await API.get('/parts?limit=100');
      const parts = Array.isArray(data) ? data : (data.data || data.parts || []);
      if (parts.length === 0) {
        App.toast('No parts in inventory', 'info');
        return;
      }
      const items = parts.map(p => ({
        type: 'part',
        id: p.id,
        name: p.name,
        subtitle: p.sku || p.category || ''
      }));
      this.printBatch(items);
    } catch (e) {
      App.toast('Failed to load parts: ' + e.message, 'error');
    }
  }
};
