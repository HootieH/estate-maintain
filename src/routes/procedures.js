const express = require('express');
const { db, logActivity } = require('../db');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);

// GET / — list all procedures (with step count)
router.get('/', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 25;
    const offset = (page - 1) * limit;

    const { total } = db.prepare(`SELECT COUNT(*) as total FROM procedures`).get();

    const procedures = db.prepare(`
      SELECT p.*,
        u.name AS created_by_name,
        (SELECT COUNT(*) FROM procedure_steps ps WHERE ps.procedure_id = p.id) AS step_count
      FROM procedures p
      LEFT JOIN users u ON p.created_by = u.id
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset);
    res.json({
      data: procedures,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch procedures', details: err.message });
  }
});

// GET /workorder/:workOrderId — get procedures attached to a work order with responses
router.get('/workorder/:workOrderId', (req, res) => {
  try {
    const wops = db.prepare(`
      SELECT wop.*, p.title, p.description, p.category
      FROM work_order_procedures wop
      JOIN procedures p ON wop.procedure_id = p.id
      WHERE wop.work_order_id = ?
      ORDER BY wop.id ASC
    `).all(req.params.workOrderId);

    for (const wop of wops) {
      const steps = db.prepare(`
        SELECT ps.*, pr.value AS response_value, pr.notes AS response_notes, pr.completed_by, pr.completed_at AS response_completed_at,
          u.name AS completed_by_name
        FROM procedure_steps ps
        LEFT JOIN procedure_responses pr ON pr.procedure_step_id = ps.id AND pr.work_order_procedure_id = ?
        LEFT JOIN users u ON pr.completed_by = u.id
        WHERE ps.procedure_id = ?
        ORDER BY ps.step_number ASC
      `).all(wop.id, wop.procedure_id);
      wop.steps = steps;

      const totalRequired = steps.filter(s => s.is_required).length;
      const completedRequired = steps.filter(s => s.is_required && s.response_value !== null).length;
      const totalCompleted = steps.filter(s => s.response_value !== null).length;
      wop.progress = {
        total: steps.length,
        completed: totalCompleted,
        required: totalRequired,
        required_completed: completedRequired
      };
    }

    res.json(wops);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch work order procedures', details: err.message });
  }
});

// GET /:id — get procedure with all steps
router.get('/:id', (req, res) => {
  try {
    const procedure = db.prepare(`
      SELECT p.*, u.name AS created_by_name
      FROM procedures p
      LEFT JOIN users u ON p.created_by = u.id
      WHERE p.id = ?
    `).get(req.params.id);

    if (!procedure) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    const steps = db.prepare(
      'SELECT * FROM procedure_steps WHERE procedure_id = ? ORDER BY step_number ASC'
    ).all(req.params.id);

    res.json({ ...procedure, steps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch procedure', details: err.message });
  }
});

// POST / — create procedure (admin/manager)
router.post('/', requireRole('admin', 'manager'), (req, res) => {
  try {
    const { title, description, category, steps } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = db.prepare(`
      INSERT INTO procedures (title, description, category, created_by)
      VALUES (?, ?, ?, ?)
    `).run(title, description || null, category || null, req.user.id);

    const procedureId = result.lastInsertRowid;

    if (steps && Array.isArray(steps)) {
      const insertStep = db.prepare(`
        INSERT INTO procedure_steps (procedure_id, step_number, title, description, step_type, is_required, min_value, max_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        insertStep.run(procedureId, i + 1, s.title, s.description || null, s.step_type || 'checkbox', s.is_required ? 1 : 0, s.min_value != null ? s.min_value : null, s.max_value != null ? s.max_value : null);
      }
    }

    const procedure = db.prepare('SELECT * FROM procedures WHERE id = ?').get(procedureId);
    const savedSteps = db.prepare('SELECT * FROM procedure_steps WHERE procedure_id = ? ORDER BY step_number ASC').all(procedureId);
    logActivity('procedure', procedureId, 'created', `Procedure "${title}" created`, req.user.id);

    res.status(201).json({ ...procedure, steps: savedSteps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create procedure', details: err.message });
  }
});

// PUT /:id — update procedure (admin/manager)
router.put('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM procedures WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    const { title, description, category, steps } = req.body;

    db.prepare(`
      UPDATE procedures SET
        title = ?, description = ?, category = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title || existing.title,
      description !== undefined ? description : existing.description,
      category !== undefined ? category : existing.category,
      req.params.id
    );

    // If steps are provided, replace all steps
    if (steps && Array.isArray(steps)) {
      db.prepare('DELETE FROM procedure_steps WHERE procedure_id = ?').run(req.params.id);
      const insertStep = db.prepare(`
        INSERT INTO procedure_steps (procedure_id, step_number, title, description, step_type, is_required, min_value, max_value)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (let i = 0; i < steps.length; i++) {
        const s = steps[i];
        insertStep.run(req.params.id, i + 1, s.title, s.description || null, s.step_type || 'checkbox', s.is_required ? 1 : 0, s.min_value != null ? s.min_value : null, s.max_value != null ? s.max_value : null);
      }
    }

    const procedure = db.prepare('SELECT * FROM procedures WHERE id = ?').get(req.params.id);
    const savedSteps = db.prepare('SELECT * FROM procedure_steps WHERE procedure_id = ? ORDER BY step_number ASC').all(req.params.id);
    logActivity('procedure', parseInt(req.params.id), 'updated', `Procedure "${procedure.title}" updated`, req.user.id);

    res.json({ ...procedure, steps: savedSteps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update procedure', details: err.message });
  }
});

// DELETE /:id — delete procedure (admin/manager)
router.delete('/:id', requireRole('admin', 'manager'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM procedures WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    db.prepare('DELETE FROM procedures WHERE id = ?').run(req.params.id);
    logActivity('procedure', parseInt(req.params.id), 'deleted', `Procedure "${existing.title}" deleted`, req.user.id);

    res.json({ message: 'Procedure deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete procedure', details: err.message });
  }
});

// POST /:id/steps — add step to procedure
router.post('/:id/steps', requireRole('admin', 'manager'), (req, res) => {
  try {
    const procedure = db.prepare('SELECT id FROM procedures WHERE id = ?').get(req.params.id);
    if (!procedure) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    const { title, description, step_type, is_required, min_value, max_value } = req.body;
    if (!title) {
      return res.status(400).json({ error: 'Step title is required' });
    }

    // Get the next step number
    const maxStep = db.prepare('SELECT MAX(step_number) AS max_num FROM procedure_steps WHERE procedure_id = ?').get(req.params.id);
    const stepNumber = (maxStep.max_num || 0) + 1;

    const result = db.prepare(`
      INSERT INTO procedure_steps (procedure_id, step_number, title, description, step_type, is_required, min_value, max_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.params.id, stepNumber, title, description || null, step_type || 'checkbox', is_required ? 1 : 0, min_value != null ? min_value : null, max_value != null ? max_value : null);

    db.prepare('UPDATE procedures SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    const step = db.prepare('SELECT * FROM procedure_steps WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(step);
  } catch (err) {
    res.status(500).json({ error: 'Failed to add step', details: err.message });
  }
});

// PUT /:id/steps/:stepId — update a step
router.put('/:id/steps/:stepId', requireRole('admin', 'manager'), (req, res) => {
  try {
    const step = db.prepare('SELECT * FROM procedure_steps WHERE id = ? AND procedure_id = ?').get(req.params.stepId, req.params.id);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }

    const { title, description, step_type, is_required, step_number, min_value, max_value } = req.body;

    db.prepare(`
      UPDATE procedure_steps SET
        title = ?, description = ?, step_type = ?, is_required = ?, step_number = ?, min_value = ?, max_value = ?
      WHERE id = ?
    `).run(
      title || step.title,
      description !== undefined ? (description || null) : step.description,
      step_type || step.step_type,
      is_required !== undefined ? (is_required ? 1 : 0) : step.is_required,
      step_number !== undefined ? step_number : step.step_number,
      min_value !== undefined ? min_value : step.min_value,
      max_value !== undefined ? max_value : step.max_value,
      req.params.stepId
    );

    db.prepare('UPDATE procedures SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    const updated = db.prepare('SELECT * FROM procedure_steps WHERE id = ?').get(req.params.stepId);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update step', details: err.message });
  }
});

// DELETE /:id/steps/:stepId — delete a step
router.delete('/:id/steps/:stepId', requireRole('admin', 'manager'), (req, res) => {
  try {
    const step = db.prepare('SELECT * FROM procedure_steps WHERE id = ? AND procedure_id = ?').get(req.params.stepId, req.params.id);
    if (!step) {
      return res.status(404).json({ error: 'Step not found' });
    }

    db.prepare('DELETE FROM procedure_steps WHERE id = ?').run(req.params.stepId);

    // Renumber remaining steps
    const remaining = db.prepare('SELECT id FROM procedure_steps WHERE procedure_id = ? ORDER BY step_number ASC').all(req.params.id);
    const updateNum = db.prepare('UPDATE procedure_steps SET step_number = ? WHERE id = ?');
    remaining.forEach((s, i) => updateNum.run(i + 1, s.id));

    db.prepare('UPDATE procedures SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id);

    res.json({ message: 'Step deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete step', details: err.message });
  }
});

// POST /:id/attach/:workOrderId — attach procedure to work order
router.post('/:id/attach/:workOrderId', (req, res) => {
  try {
    const procedure = db.prepare('SELECT id FROM procedures WHERE id = ?').get(req.params.id);
    if (!procedure) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    const workOrder = db.prepare('SELECT id FROM work_orders WHERE id = ?').get(req.params.workOrderId);
    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    // Check if already attached
    const existing = db.prepare(
      'SELECT id FROM work_order_procedures WHERE work_order_id = ? AND procedure_id = ?'
    ).get(req.params.workOrderId, req.params.id);
    if (existing) {
      return res.status(400).json({ error: 'Procedure already attached to this work order' });
    }

    const result = db.prepare(
      'INSERT INTO work_order_procedures (work_order_id, procedure_id) VALUES (?, ?)'
    ).run(req.params.workOrderId, req.params.id);

    const wop = db.prepare('SELECT * FROM work_order_procedures WHERE id = ?').get(result.lastInsertRowid);
    logActivity('work_order', parseInt(req.params.workOrderId), 'procedure_attached', `Procedure attached to work order`, req.user.id);

    res.status(201).json(wop);
  } catch (err) {
    res.status(500).json({ error: 'Failed to attach procedure', details: err.message });
  }
});

// POST /respond — submit a step response
router.post('/respond', (req, res) => {
  try {
    const { work_order_procedure_id, procedure_step_id, value, notes } = req.body;

    if (!work_order_procedure_id || !procedure_step_id) {
      return res.status(400).json({ error: 'work_order_procedure_id and procedure_step_id are required' });
    }

    const wop = db.prepare('SELECT * FROM work_order_procedures WHERE id = ?').get(work_order_procedure_id);
    if (!wop) {
      return res.status(404).json({ error: 'Work order procedure not found' });
    }

    // Check range for number_input steps
    let out_of_range = false;
    let warning = null;
    const stepDef = db.prepare('SELECT * FROM procedure_steps WHERE id = ?').get(procedure_step_id);
    if (stepDef && stepDef.step_type === 'number_input' && value != null && value !== '') {
      const numVal = parseFloat(value);
      if (!isNaN(numVal)) {
        if (stepDef.min_value != null && numVal < stepDef.min_value) {
          out_of_range = true;
          warning = `Value ${numVal} is below the expected minimum of ${stepDef.min_value}`;
        }
        if (stepDef.max_value != null && numVal > stepDef.max_value) {
          out_of_range = true;
          warning = `Value ${numVal} is above the expected maximum of ${stepDef.max_value}`;
        }
      }
    }

    // Upsert response
    const existing = db.prepare(
      'SELECT id FROM procedure_responses WHERE work_order_procedure_id = ? AND procedure_step_id = ?'
    ).get(work_order_procedure_id, procedure_step_id);

    if (existing) {
      db.prepare(
        'UPDATE procedure_responses SET value = ?, notes = ?, completed_by = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).run(value, notes || null, req.user.id, existing.id);
    } else {
      db.prepare(
        'INSERT INTO procedure_responses (work_order_procedure_id, procedure_step_id, value, notes, completed_by) VALUES (?, ?, ?, ?, ?)'
      ).run(work_order_procedure_id, procedure_step_id, value, notes || null, req.user.id);
    }

    // Update work_order_procedure status
    if (wop.status === 'pending') {
      db.prepare("UPDATE work_order_procedures SET status = 'in_progress', started_at = CURRENT_TIMESTAMP WHERE id = ?").run(work_order_procedure_id);
    }

    // Check if all required steps are completed
    const steps = db.prepare('SELECT * FROM procedure_steps WHERE procedure_id = ?').all(wop.procedure_id);
    const responses = db.prepare('SELECT * FROM procedure_responses WHERE work_order_procedure_id = ?').all(work_order_procedure_id);
    const responseMap = {};
    responses.forEach(r => { responseMap[r.procedure_step_id] = r; });

    const allRequiredDone = steps.filter(s => s.is_required).every(s => responseMap[s.id] && responseMap[s.id].value !== null);
    const allDone = steps.every(s => responseMap[s.id] && responseMap[s.id].value !== null);

    if (allDone || allRequiredDone) {
      db.prepare("UPDATE work_order_procedures SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?").run(work_order_procedure_id);
    }

    const result = { message: 'Response saved' };
    if (out_of_range) {
      result.out_of_range = true;
      result.warning = warning;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save response', details: err.message });
  }
});

// POST /:id/duplicate — duplicate a procedure and its steps
router.post('/:id/duplicate', requireRole('admin', 'manager'), (req, res) => {
  try {
    const original = db.prepare('SELECT * FROM procedures WHERE id = ?').get(req.params.id);
    if (!original) {
      return res.status(404).json({ error: 'Procedure not found' });
    }

    const result = db.prepare(`
      INSERT INTO procedures (title, description, category, created_by)
      VALUES (?, ?, ?, ?)
    `).run(original.title + ' (Copy)', original.description, original.category, req.user.id);

    const newId = result.lastInsertRowid;

    const originalSteps = db.prepare('SELECT * FROM procedure_steps WHERE procedure_id = ? ORDER BY step_number ASC').all(req.params.id);
    const insertStep = db.prepare(`
      INSERT INTO procedure_steps (procedure_id, step_number, title, description, step_type, is_required, min_value, max_value)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of originalSteps) {
      insertStep.run(newId, s.step_number, s.title, s.description, s.step_type, s.is_required, s.min_value, s.max_value);
    }

    const newProc = db.prepare('SELECT * FROM procedures WHERE id = ?').get(newId);
    const newSteps = db.prepare('SELECT * FROM procedure_steps WHERE procedure_id = ? ORDER BY step_number ASC').all(newId);
    logActivity('procedure', Number(newId), 'created', `Procedure "${newProc.title}" duplicated from "${original.title}"`, req.user.id);

    res.status(201).json({ ...newProc, steps: newSteps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to duplicate procedure', details: err.message });
  }
});

module.exports = router;
