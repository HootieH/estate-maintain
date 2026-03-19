require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { db, logActivity } = require('./src/db');
const { authenticate } = require('./src/middleware/auth');

const authRoutes = require('./src/routes/auth');
const teamRoutes = require('./src/routes/teams');
const propertyRoutes = require('./src/routes/properties');
const assetRoutes = require('./src/routes/assets');
const workOrderRoutes = require('./src/routes/workorders');
const preventiveRoutes = require('./src/routes/preventive');
const partRoutes = require('./src/routes/parts');
const dashboardRoutes = require('./src/routes/dashboard');
const activityRoutes = require('./src/routes/activity');
const reportRoutes = require('./src/routes/reports');
const timeLogRoutes = require('./src/routes/timelogs');
const notificationRoutes = require('./src/routes/notifications');
const procedureRoutes = require('./src/routes/procedures');
const messageRoutes = require('./src/routes/messages');
const requestRoutes = require('./src/routes/requests');
const meterRoutes = require('./src/routes/meters');
const locationRoutes = require('./src/routes/locations');
const vendorRoutes = require('./src/routes/vendors');
const purchaseOrderRoutes = require('./src/routes/purchaseorders');
const onboardingRoutes = require('./src/routes/onboarding');
const tagRoutes = require('./src/routes/tags');
const favoriteRoutes = require('./src/routes/favorites');
const templateRoutes = require('./src/routes/templates');
const searchRoutes = require('./src/routes/search');
const exportRoutes = require('./src/routes/export');
const settingsApiRoutes = require('./src/routes/settings-api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/workorders', workOrderRoutes);
app.use('/api/preventive', preventiveRoutes);
app.use('/api/parts', partRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/activity', authenticate, activityRoutes);
app.use('/api/reports', authenticate, reportRoutes);
app.use('/api/time-logs', authenticate, timeLogRoutes);
app.use('/api/notifications', authenticate, notificationRoutes);
app.use('/api/procedures', procedureRoutes);
app.use('/api/messages', authenticate, messageRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/meters', meterRoutes);
app.use('/api/locations', locationRoutes);
app.use('/api/vendors', vendorRoutes);
app.use('/api/purchaseorders', purchaseOrderRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/tags', authenticate, tagRoutes);
app.use('/api/favorites', authenticate, favoriteRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/search', authenticate, searchRoutes);
app.use('/api/export', authenticate, exportRoutes);
app.use('/api/settings-api', settingsApiRoutes);

// Serve public request page before SPA fallback
app.get('/request', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'request.html'));
});

// Preventive maintenance cron job - runs daily at midnight
cron.schedule('0 0 * * *', () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const overdueSchedules = db.prepare(
      "SELECT * FROM preventive_schedules WHERE is_active = 1 AND next_due <= ?"
    ).all(today);

    for (const schedule of overdueSchedules) {
      // Create a work order for the overdue preventive task
      const result = db.prepare(`
        INSERT INTO work_orders (title, description, property_id, asset_id, assigned_team_id, priority, status, category)
        VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
      `).run(
        `[PM] ${schedule.title}`,
        schedule.description || `Preventive maintenance: ${schedule.title}`,
        schedule.property_id,
        schedule.asset_id,
        schedule.assigned_team_id,
        schedule.priority || 'medium',
        schedule.category
      );

      logActivity('work_order', result.lastInsertRowid, 'created', `Auto-created from preventive schedule "${schedule.title}"`, null);

      // Auto-attach procedure if PM schedule has one
      if (schedule.procedure_id) {
        db.prepare('INSERT INTO work_order_procedures (work_order_id, procedure_id) VALUES (?, ?)').run(result.lastInsertRowid, schedule.procedure_id);
      }

      // Calculate and update next_due
      const nextDate = new Date(schedule.next_due);
      switch (schedule.frequency) {
        case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
        case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
        case 'biweekly': nextDate.setDate(nextDate.getDate() + 14); break;
        case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
        case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
        case 'semiannual': nextDate.setMonth(nextDate.getMonth() + 6); break;
        case 'annual': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
      }

      db.prepare('UPDATE preventive_schedules SET next_due = ? WHERE id = ?').run(
        nextDate.toISOString().split('T')[0],
        schedule.id
      );
    }

    if (overdueSchedules.length > 0) {
      console.log(`[CRON] Created ${overdueSchedules.length} work orders from overdue preventive schedules`);
    }
  } catch (err) {
    console.error('[CRON] Preventive maintenance check failed:', err.message);
  }
});

// Recurring work order cron job - runs daily at 00:05
cron.schedule('5 0 * * *', () => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const dueSchedules = db.prepare(
      "SELECT rs.*, wot.* FROM recurring_schedules rs JOIN work_order_templates wot ON rs.template_id = wot.id WHERE rs.is_active = 1 AND rs.next_due <= ?"
    ).all(today);

    for (const sched of dueSchedules) {
      const result = db.prepare(`
        INSERT INTO work_orders (title, description, property_id, asset_id, assigned_to, assigned_team_id, priority, status, category, template_id, estimated_hours)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
      `).run(
        sched.title, sched.description, sched.property_id, sched.asset_id,
        sched.assigned_to, sched.assigned_team_id, sched.priority || 'medium',
        sched.category, sched.template_id, sched.estimated_hours
      );

      logActivity('work_order', result.lastInsertRowid, 'created', `Auto-created from recurring template "${sched.title}"`, null);

      // Calculate next due
      const nextDate = new Date(sched.next_due);
      switch (sched.frequency) {
        case 'daily': nextDate.setDate(nextDate.getDate() + 1); break;
        case 'weekly': nextDate.setDate(nextDate.getDate() + 7); break;
        case 'biweekly': nextDate.setDate(nextDate.getDate() + 14); break;
        case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
        case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
        case 'semiannual': nextDate.setMonth(nextDate.getMonth() + 6); break;
        case 'annual': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
      }
      db.prepare('UPDATE recurring_schedules SET next_due = ? WHERE id = ?').run(nextDate.toISOString().split('T')[0], sched.id);
    }

    if (dueSchedules.length > 0) {
      console.log(`[CRON] Created ${dueSchedules.length} work orders from recurring templates`);
    }
  } catch (err) {
    console.error('[CRON] Recurring schedule check failed:', err.message);
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`Estate Maintain server running on port ${PORT}`);
});

// Graceful shutdown
function shutdown() {
  console.log('\nShutting down gracefully...');
  server.close(() => {
    db.close();
    console.log('Database connection closed');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
