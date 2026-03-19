const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET / — list meters (optionally filtered by asset)
router.get('/', (req, res) => {
  try {
    let sql = `
      SELECT m.*, a.name AS asset_name
      FROM meters m
      LEFT JOIN assets a ON m.asset_id = a.id
    `;
    const params = [];

    if (req.query.asset_id) {
      sql += ' WHERE m.asset_id = ?';
      params.push(req.query.asset_id);
    }

    sql += ' ORDER BY m.name';
    const meters = db.prepare(sql).all(...params);
    res.json(meters);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meters', details: err.message });
  }
});

// GET /:id — get meter with recent readings (last 20)
router.get('/:id', (req, res) => {
  try {
    const meter = db.prepare(`
      SELECT m.*, a.name AS asset_name
      FROM meters m
      LEFT JOIN assets a ON m.asset_id = a.id
      WHERE m.id = ?
    `).get(req.params.id);

    if (!meter) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    const readings = db.prepare(`
      SELECT mr.*, u.name AS recorded_by_name
      FROM meter_readings mr
      LEFT JOIN users u ON mr.recorded_by = u.id
      WHERE mr.meter_id = ?
      ORDER BY mr.recorded_at DESC
      LIMIT 20
    `).all(req.params.id);

    const triggers = db.prepare(`
      SELECT mt.*, ps.title AS schedule_title
      FROM meter_triggers mt
      LEFT JOIN preventive_schedules ps ON mt.preventive_schedule_id = ps.id
      WHERE mt.meter_id = ?
    `).all(req.params.id);

    res.json({ ...meter, readings, triggers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch meter', details: err.message });
  }
});

// POST / — create meter
router.post('/', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const { asset_id, name, unit } = req.body;

    if (!asset_id || !name || !unit) {
      return res.status(400).json({ error: 'asset_id, name, and unit are required' });
    }

    const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(asset_id);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found' });
    }

    const result = db.prepare(
      'INSERT INTO meters (asset_id, name, unit) VALUES (?, ?, ?)'
    ).run(asset_id, name, unit);

    const meter = db.prepare('SELECT * FROM meters WHERE id = ?').get(result.lastInsertRowid);
    logActivity('meter', meter.id, 'created', `Meter "${name}" created for asset "${asset.name}"`, req.user.id);

    res.status(201).json(meter);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create meter', details: err.message });
  }
});

// PUT /:id — update meter
router.put('/:id', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM meters WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    const { name, unit } = req.body;

    db.prepare('UPDATE meters SET name = ?, unit = ? WHERE id = ?').run(
      name || existing.name,
      unit || existing.unit,
      req.params.id
    );

    const meter = db.prepare('SELECT * FROM meters WHERE id = ?').get(req.params.id);
    logActivity('meter', meter.id, 'updated', `Meter "${meter.name}" updated`, req.user.id);

    res.json(meter);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update meter', details: err.message });
  }
});

// DELETE /:id — delete meter
router.delete('/:id', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM meters WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    db.prepare('DELETE FROM meters WHERE id = ?').run(req.params.id);
    logActivity('meter', parseInt(req.params.id), 'deleted', `Meter "${existing.name}" deleted`, req.user.id);

    res.json({ message: 'Meter deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete meter', details: err.message });
  }
});

// POST /:id/readings — add reading, auto-update current_reading, check triggers
router.post('/:id/readings', requireRole('admin', 'manager', 'technician'), (req, res) => {
  try {
    const meter = db.prepare('SELECT * FROM meters WHERE id = ?').get(req.params.id);
    if (!meter) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    const { value, notes } = req.body;
    if (value === undefined || value === null) {
      return res.status(400).json({ error: 'value is required' });
    }

    const readingValue = parseFloat(value);

    // Insert reading
    const result = db.prepare(
      'INSERT INTO meter_readings (meter_id, value, recorded_by, notes) VALUES (?, ?, ?, ?)'
    ).run(req.params.id, readingValue, req.user.id, notes || null);

    // Update current_reading on the meter
    db.prepare('UPDATE meters SET current_reading = ? WHERE id = ?').run(readingValue, req.params.id);

    // Check triggers
    const triggers = db.prepare('SELECT * FROM meter_triggers WHERE meter_id = ?').all(req.params.id);
    const triggeredSchedules = [];

    for (const trigger of triggers) {
      const sinceLastTrigger = readingValue - trigger.last_triggered_value;
      if (sinceLastTrigger >= trigger.trigger_every) {
        // Update last_triggered_value
        db.prepare('UPDATE meter_triggers SET last_triggered_value = ? WHERE id = ?').run(readingValue, trigger.id);

        // If linked to a preventive schedule, create a work order
        if (trigger.preventive_schedule_id) {
          const schedule = db.prepare('SELECT * FROM preventive_schedules WHERE id = ?').get(trigger.preventive_schedule_id);
          if (schedule) {
            const asset = db.prepare('SELECT * FROM assets WHERE id = ?').get(meter.asset_id);
            const woResult = db.prepare(`
              INSERT INTO work_orders (title, description, property_id, asset_id, assigned_team_id, priority, status, category)
              VALUES (?, ?, ?, ?, ?, ?, 'open', ?)
            `).run(
              `[Meter Trigger] ${schedule.title}`,
              `Triggered by meter "${meter.name}" reaching ${readingValue} ${meter.unit} (every ${trigger.trigger_every} ${meter.unit})`,
              schedule.property_id,
              schedule.asset_id,
              schedule.assigned_team_id,
              schedule.priority || 'medium',
              schedule.category
            );
            logActivity('work_order', woResult.lastInsertRowid, 'created',
              `Auto-created from meter trigger on "${meter.name}" (${readingValue} ${meter.unit})`, req.user.id);
            triggeredSchedules.push(schedule.title);
          }
        }
      }
    }

    const reading = db.prepare(`
      SELECT mr.*, u.name AS recorded_by_name
      FROM meter_readings mr
      LEFT JOIN users u ON mr.recorded_by = u.id
      WHERE mr.id = ?
    `).get(result.lastInsertRowid);

    logActivity('meter', parseInt(req.params.id), 'reading_recorded',
      `Reading ${readingValue} ${meter.unit} recorded`, req.user.id);

    res.status(201).json({
      reading,
      triggered: triggeredSchedules
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to record reading', details: err.message });
  }
});

// GET /:id/readings — get reading history (last 50)
router.get('/:id/readings', (req, res) => {
  try {
    const meter = db.prepare('SELECT * FROM meters WHERE id = ?').get(req.params.id);
    if (!meter) {
      return res.status(404).json({ error: 'Meter not found' });
    }

    const readings = db.prepare(`
      SELECT mr.*, u.name AS recorded_by_name
      FROM meter_readings mr
      LEFT JOIN users u ON mr.recorded_by = u.id
      WHERE mr.meter_id = ?
      ORDER BY mr.recorded_at DESC
      LIMIT 50
    `).all(req.params.id);

    res.json(readings);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch readings', details: err.message });
  }
});

module.exports = router;
