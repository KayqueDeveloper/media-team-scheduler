import express from 'express';
import cors from 'cors';
import {
  getAllVolunteers,
  createVolunteer,
  updateVolunteer,
  setVolunteerProficiencies,
  getAllUnavailabilities,
  addUnavailability,
  deleteUnavailability,
  getScheduleByMonthYear,
  createSchedule,
  updateScheduleStatus,
  clearScheduleAssignments,
  bulkCreateAssignments,
  getAssignmentsByDateRange
} from './db/repository.js';
import { generateSchedule } from './solver/scheduler.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- Volunteers API ---

app.get('/api/volunteers', (req, res) => {
  try {
    const volunteers = getAllVolunteers({ activeOnly: false, includeProficiencies: true });
    res.json(volunteers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/volunteers', (req, res) => {
  try {
    const volunteer = createVolunteer(req.body);
    if (req.body.proficiencies) {
      setVolunteerProficiencies(volunteer.id, req.body.proficiencies);
    }
    res.status(201).json(getAllVolunteers({ activeOnly: false }).find(v => v.id === volunteer.id));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/volunteers/:id/proficiency', (req, res) => {
  try {
    const { proficiencies } = req.body;
    const updated = setVolunteerProficiencies(parseInt(req.params.id), proficiencies);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Unavailabilities API ---

app.get('/api/unavailabilities', (req, res) => {
  try {
    const list = getAllUnavailabilities();
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/unavailabilities', (req, res) => {
  try {
    const record = addUnavailability(req.body);
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/unavailabilities/:id', (req, res) => {
  try {
    const success = deleteUnavailability(parseInt(req.params.id));
    res.json({ success });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// --- Schedule & Solver API ---

app.get('/api/schedule', (req, res) => {
  try {
    const year = parseInt(req.query.year) || 2026;
    const month = parseInt(req.query.month) || 9;
    const schedule = getScheduleByMonthYear(year, month);
    res.json(schedule || { year, month, status: 'DRAFT', assignments: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schedule/generate', (req, res) => {
  try {
    const year = parseInt(req.body.year) || 2026;
    const month = parseInt(req.body.month) || 9;

    const volunteers = getAllVolunteers({ activeOnly: true, includeProficiencies: true });
    const unavailabilities = getAllUnavailabilities();

    // Query past 90 days assignments for equity scoring
    const pastStartDate = new Date(year, month - 3, 1).toISOString().split('T')[0];
    const currentMonthStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const pastAssignments = getAssignmentsByDateRange(pastStartDate, currentMonthStart);

    // Invoke Constraint Solver Engine
    const result = generateSchedule({
      year,
      month,
      volunteers,
      proficiencies: {}, // included in volunteer objects
      unavailabilities,
      pastAssignments
    });

    if (!result.success && result.assignments.length === 0) {
      return res.status(422).json({ error: result.reason || 'Could not generate schedule matching constraints.' });
    }

    // Persist to SQLite
    let schedule = getScheduleByMonthYear(year, month);
    if (!schedule) {
      schedule = createSchedule({ year, month, status: 'DRAFT' });
    } else {
      clearScheduleAssignments(schedule.id);
    }

    const assignmentsToInsert = result.assignments.map(a => ({
      scheduleId: schedule.id,
      volunteerId: a.volunteerId,
      date: a.date,
      shift: a.shift,
      role: a.role
    }));

    bulkCreateAssignments(assignmentsToInsert);

    const updatedSchedule = getScheduleByMonthYear(year, month);
    res.json({
      schedule: updatedSchedule,
      warnings: result.warnings || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/schedule/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const updated = updateScheduleStatus(parseInt(req.params.id), status);
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
