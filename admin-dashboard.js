#!/usr/bin/env node
/**
 * Estate Maintain — Local Admin Dashboard
 * Runs on localhost:3100 (not exposed via tunnel)
 * Shows host status, service health, tunnel connections
 */

const http = require('http');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3100;
const APP_PORT = 3003;
const PROJECT_DIR = path.resolve(__dirname);
const DB_PATH = path.join(PROJECT_DIR, 'data/estate.db');

// --- Health Check Helpers ---

function run(cmd, fallback = '') {
  try { return execSync(cmd, { timeout: 5000, encoding: 'utf8' }).trim(); } catch { return fallback; }
}

function getNodeStatus() {
  const pid = run(`lsof -ti:${APP_PORT}`, '');
  if (!pid) return { running: false, pid: null, uptime: null, memory: null };

  const lines = run(`ps -o pid=,etime=,rss= -p ${pid.split('\n')[0]}`);
  const parts = lines.trim().split(/\s+/);
  const rss = parts[2] ? (parseInt(parts[2]) / 1024).toFixed(1) : null;
  return { running: true, pid: pid.split('\n')[0], uptime: parts[1] || 'unknown', memoryMB: rss };
}

function getTunnelStatus() {
  const pid = run("pgrep -f 'cloudflared.*tunnel run'", '');
  if (!pid) return { running: false, pid: null, connections: 0, edges: [] };

  const logPath = path.join(PROJECT_DIR, 'logs/tunnel-error.log');
  let connections = 0;
  let edges = [];
  try {
    const log = fs.readFileSync(logPath, 'utf8');
    const connLines = log.match(/Registered tunnel connection.*connIndex=\d/g) || [];
    connections = connLines.length;
    edges = [...new Set(connLines.map(l => {
      const m = l.match(/location=(\w+)/);
      return m ? m[1] : null;
    }).filter(Boolean))];
  } catch {}

  return { running: true, pid: pid.split('\n')[0], connections, edges };
}

async function getSiteHealth() {
  const start = Date.now();
  return new Promise(resolve => {
    const req = http.get(`http://localhost:${APP_PORT}/api/auth/users`, { timeout: 3000 }, res => {
      const ms = Date.now() - start;
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        resolve({ reachable: true, statusCode: res.statusCode, responseMs: ms, healthy: res.statusCode < 500 });
      });
    });
    req.on('error', () => resolve({ reachable: false, statusCode: null, responseMs: null, healthy: false }));
    req.on('timeout', () => { req.destroy(); resolve({ reachable: false, statusCode: null, responseMs: null, healthy: false }); });
  });
}

function getDBStatus() {
  try {
    const stat = fs.statSync(DB_PATH);
    const walPath = DB_PATH + '-wal';
    const walSize = fs.existsSync(walPath) ? fs.statSync(walPath).size : 0;
    return { exists: true, sizeKB: (stat.size / 1024).toFixed(1), walKB: (walSize / 1024).toFixed(1), modified: stat.mtime.toISOString() };
  } catch { return { exists: false }; }
}

function getRecentLogs(logPath, lines = 20) {
  try {
    const content = fs.readFileSync(logPath, 'utf8');
    return content.split('\n').filter(Boolean).slice(-lines);
  } catch { return []; }
}

function getSystemInfo() {
  return {
    hostname: os.hostname(),
    platform: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemGB: (os.totalmem() / 1073741824).toFixed(1),
    freeMemGB: (os.freemem() / 1073741824).toFixed(1),
    nodeVersion: process.version,
    uptime: formatUptime(os.uptime())
  };
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// --- Dashboard HTML ---

function renderDashboard(data) {
  const { node, tunnel, site, db, system, tunnelLogs, serverLogs } = data;

  const statusDot = (ok) => `<span class="dot ${ok ? 'dot-green' : 'dot-red'}"></span>`;
  const badge = (text, color) => `<span class="badge" style="background:${color}20;color:${color}">${text}</span>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ops.estate — Admin Dashboard</title>
<meta http-equiv="refresh" content="15">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: #0F172A; color: #E2E8F0; min-height: 100vh; padding: 24px; }
  a { color: #60A5FA; text-decoration: none; }
  h1 { font-size: 22px; font-weight: 700; color: white; margin-bottom: 4px; }
  h2 { font-size: 15px; font-weight: 600; color: #94A3B8; margin-bottom: 16px; }
  h3 { font-size: 14px; font-weight: 600; color: #CBD5E1; margin-bottom: 12px; }
  .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
  .header-right { font-size: 12px; color: #64748B; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: #1E293B; border: 1px solid #334155; border-radius: 12px; padding: 20px; }
  .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
  .service-status { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
  .service-name { font-size: 16px; font-weight: 600; color: white; }
  .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .dot-green { background: #10B981; box-shadow: 0 0 8px #10B98180; }
  .dot-red { background: #EF4444; box-shadow: 0 0 8px #EF444480; }
  .dot-yellow { background: #F59E0B; box-shadow: 0 0 8px #F59E0B80; }
  .badge { display: inline-flex; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
  .stat-row { display: flex; gap: 24px; margin-top: 12px; flex-wrap: wrap; }
  .stat { display: flex; flex-direction: column; gap: 2px; }
  .stat-value { font-size: 18px; font-weight: 700; color: white; }
  .stat-label { font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; }
  .log-box { background: #0F172A; border: 1px solid #334155; border-radius: 8px; padding: 12px; max-height: 200px; overflow-y: auto; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 11px; line-height: 1.6; color: #94A3B8; white-space: pre-wrap; word-break: break-all; }
  .log-line { padding: 1px 0; }
  .log-line:hover { background: #334155; }
  .controls { display: flex; gap: 8px; margin-top: 12px; }
  .btn { display: inline-flex; align-items: center; gap: 6px; padding: 6px 14px; border: 1px solid #475569; border-radius: 8px; background: #1E293B; color: #E2E8F0; font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; text-decoration: none; }
  .btn:hover { background: #334155; border-color: #60A5FA; color: white; }
  .btn-danger { border-color: #991B1B; }
  .btn-danger:hover { background: #7F1D1D; border-color: #EF4444; }
  .health-bar { display: flex; gap: 8px; align-items: center; padding: 10px 14px; background: ${site.healthy ? '#05291810' : '#45090A'};  border: 1px solid ${site.healthy ? '#10B981' : '#EF4444'}40; border-radius: 10px; margin-bottom: 20px; }
  .health-text { font-size: 14px; font-weight: 600; color: ${site.healthy ? '#10B981' : '#EF4444'}; }
  .health-detail { font-size: 12px; color: #64748B; margin-left: auto; }
  .edges { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .edge-tag { padding: 2px 10px; border-radius: 6px; background: #334155; font-size: 11px; color: #94A3B8; font-weight: 500; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <h1>ops.estate</h1>
      <h2>Local Admin Dashboard</h2>
    </div>
    <div class="header-right">
      Auto-refreshes every 15s &middot; ${new Date().toLocaleTimeString()}<br>
      ${system.hostname} &middot; ${system.platform} &middot; Node ${system.nodeVersion}
    </div>
  </div>

  <div class="health-bar">
    ${statusDot(site.healthy)}
    <span class="health-text">${site.healthy ? 'Site is UP' : site.reachable ? 'Site is DEGRADED' : 'Site is DOWN'}</span>
    <span class="health-detail">
      ${site.reachable ? `HTTP ${site.statusCode} &middot; ${site.responseMs}ms` : 'Not reachable on port ' + APP_PORT}
      &middot; <a href="https://ops.estate" target="_blank">ops.estate</a>
    </span>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-header">
        <div class="service-status">
          ${statusDot(node.running)}
          <span class="service-name">Node.js Server</span>
        </div>
        ${node.running ? badge('Running', '#10B981') : badge('Stopped', '#EF4444')}
      </div>
      <div class="stat-row">
        <div class="stat"><div class="stat-value">${node.pid || '-'}</div><div class="stat-label">PID</div></div>
        <div class="stat"><div class="stat-value">${node.uptime || '-'}</div><div class="stat-label">Uptime</div></div>
        <div class="stat"><div class="stat-value">${node.memoryMB ? node.memoryMB + ' MB' : '-'}</div><div class="stat-label">Memory</div></div>
        <div class="stat"><div class="stat-value">${APP_PORT}</div><div class="stat-label">Port</div></div>
      </div>
      <div class="controls">
        <a class="btn" href="/action/restart-server" onclick="return confirm('Restart the Node.js server?')">↻ Restart Server</a>
        <a class="btn" href="/action/stop-server" onclick="return confirm('Stop the Node.js server?')">⏹ Stop</a>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="service-status">
          ${statusDot(tunnel.running)}
          <span class="service-name">Cloudflare Tunnel</span>
        </div>
        ${tunnel.running ? badge('Connected', '#10B981') : badge('Disconnected', '#EF4444')}
      </div>
      <div class="stat-row">
        <div class="stat"><div class="stat-value">${tunnel.pid || '-'}</div><div class="stat-label">PID</div></div>
        <div class="stat"><div class="stat-value">${tunnel.connections}</div><div class="stat-label">Connections</div></div>
      </div>
      ${tunnel.edges.length > 0 ? `<div class="edges">${tunnel.edges.map(e => `<span class="edge-tag">${e}</span>`).join('')}</div>` : ''}
      <div class="controls">
        <a class="btn" href="/action/restart-tunnel" onclick="return confirm('Restart the Cloudflare tunnel?')">↻ Restart Tunnel</a>
        <a class="btn" href="/action/stop-tunnel" onclick="return confirm('Stop the tunnel?')">⏹ Stop</a>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="service-status">
          ${statusDot(db.exists)}
          <span class="service-name">Database</span>
        </div>
        ${db.exists ? badge('OK', '#10B981') : badge('Missing', '#EF4444')}
      </div>
      <div class="stat-row">
        <div class="stat"><div class="stat-value">${db.sizeKB || '0'} KB</div><div class="stat-label">DB Size</div></div>
        <div class="stat"><div class="stat-value">${db.walKB || '0'} KB</div><div class="stat-label">WAL Size</div></div>
      </div>
      <div style="margin-top:8px;font-size:11px;color:#64748B">
        Last modified: ${db.modified ? new Date(db.modified).toLocaleString() : '-'}
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="service-name">System</span>
      </div>
      <div class="stat-row">
        <div class="stat"><div class="stat-value">${system.uptime}</div><div class="stat-label">System Uptime</div></div>
        <div class="stat"><div class="stat-value">${system.freeMemGB} / ${system.totalMemGB} GB</div><div class="stat-label">Free Memory</div></div>
        <div class="stat"><div class="stat-value">${system.cpus}</div><div class="stat-label">CPU Cores</div></div>
      </div>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h3>Tunnel Log (Recent)</h3>
      <div class="log-box">${tunnelLogs.length > 0 ? tunnelLogs.map(l => `<div class="log-line">${escapeHtml(l)}</div>`).join('') : '<span style="color:#475569">No tunnel logs</span>'}</div>
    </div>
    <div class="card">
      <h3>Server Log (Recent)</h3>
      <div class="log-box">${serverLogs.length > 0 ? serverLogs.map(l => `<div class="log-line">${escapeHtml(l)}</div>`).join('') : '<span style="color:#475569">No server logs</span>'}</div>
    </div>
  </div>

</body>
</html>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- HTTP Server ---

const server = http.createServer(async (req, res) => {
  // Service control actions
  if (req.url.startsWith('/action/')) {
    const action = req.url.split('/action/')[1];
    let msg = '';
    try {
      switch (action) {
        case 'restart-server':
          run('launchctl kickstart -k gui/$(id -u)/com.ops-estate.server');
          msg = 'Server restart initiated';
          break;
        case 'stop-server':
          run('launchctl stop com.ops-estate.server');
          msg = 'Server stop initiated';
          break;
        case 'restart-tunnel':
          run('launchctl kickstart -k gui/$(id -u)/com.ops-estate.tunnel');
          msg = 'Tunnel restart initiated';
          break;
        case 'stop-tunnel':
          run('launchctl stop com.ops-estate.tunnel');
          msg = 'Tunnel stop initiated';
          break;
        default:
          msg = 'Unknown action';
      }
    } catch (e) { msg = 'Error: ' + e.message; }

    // Redirect back after 2 seconds
    res.writeHead(302, { Location: '/' });
    res.end();
    return;
  }

  // API endpoint for JSON status
  if (req.url === '/api/status') {
    const [node, tunnel, site, db, system] = await Promise.all([
      getNodeStatus(),
      getTunnelStatus(),
      getSiteHealth(),
      getDBStatus(),
      getSystemInfo()
    ].map(p => p instanceof Promise ? p : Promise.resolve(p)));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ node, tunnel, site, db, system, timestamp: new Date().toISOString() }));
    return;
  }

  // Dashboard HTML
  const [node, tunnel, site, db, system] = await Promise.all([
    Promise.resolve(getNodeStatus()),
    Promise.resolve(getTunnelStatus()),
    getSiteHealth(),
    Promise.resolve(getDBStatus()),
    Promise.resolve(getSystemInfo())
  ]);

  const tunnelLogs = getRecentLogs(path.join(PROJECT_DIR, 'logs/tunnel-error.log'), 20);
  const serverLogs = getRecentLogs('/tmp/ops-estate-server-error.log', 20);

  const html = renderDashboard({ node, tunnel, site, db, system, tunnelLogs, serverLogs });

  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(html);
});

// Bind to localhost ONLY — not accessible from outside
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Admin dashboard running at http://localhost:${PORT}`);
});
