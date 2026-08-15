// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import * as repository from './repository.js';
import seedDatabase from './seed.js';
import { closeDatabase } from './index.js';
import { ROLES, SHIFTS, SCHEDULE_STATUS } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('🧪 Starting Database & Repository Verification Tests...\n');

  const testDbPath = path.join(__dirname, 'test_database.sqlite');
  process.env.DB_PATH = testDbPath;

  // 1. Seed Database
  console.log('--- Test 1: Database Initialization & Seeding ---');
  await seedDatabase(testDbPath);

  // 2. Verify Volunteers Query
  console.log('\n--- Test 2: Volunteers Query & CRUD ---');
  const volunteers = await repository.getAllVolunteers();
  console.log(`[PASS] Total volunteers retrieved: ${volunteers.length}`);
  if (volunteers.length < 15) {
    throw new Error(`Expected at least 15 volunteers, found ${volunteers.length}`);
  }

  // Create new test volunteer
  const newVol = await repository.createVolunteer({
    name: 'Test User',
    email: 'test.user@church.org',
    phone: '(11) 99999-9999',
    maxMonthlyFrequency: 3,
    maxConsecutiveSundays: 2
  });
  console.log(`[PASS] Created volunteer: ${newVol.name} (ID: ${newVol.id})`);

  // Update volunteer
  const updatedVol = await repository.updateVolunteer(newVol.id, { name: 'Updated Test User', maxMonthlyFrequency: 2 });
  if (updatedVol.name !== 'Updated Test User' || updatedVol.max_monthly_frequency !== 2) {
    throw new Error('Volunteer update failed');
  }
  console.log(`[PASS] Updated volunteer name to: ${updatedVol.name}`);

  // Permanently delete volunteer and linked records
  const deleted = await repository.deleteVolunteer(newVol.id);
  if (!deleted || await repository.getVolunteerById(newVol.id) !== null) {
    throw new Error('Volunteer deletion failed');
  }
  console.log(`[PASS] Permanently deleted volunteer ID: ${newVol.id}`);

  // 3. Verify Proficiencies
  console.log('\n--- Test 3: Proficiencies CRUD & Level Validation ---');
  const firstVol = volunteers[0];
  console.log(`Volunteer ${firstVol.name} initial proficiencies:`, firstVol.proficiencies);

  await repository.setProficiency(firstVol.id, ROLES.JIB, 2);
  const updatedProfs = await repository.getProficienciesByVolunteerId(firstVol.id);
  if (updatedProfs[ROLES.JIB] !== 2) {
    throw new Error('Proficiency set failed');
  }
  console.log(`[PASS] Set ${firstVol.name}'s JIB proficiency level to 2`);

  // 4. Verify Unavailabilities
  console.log('\n--- Test 4: Unavailabilities Management ---');
  const unavailList = await repository.getAllUnavailabilities();
  console.log(`[PASS] Total unavailabilities registered: ${unavailList.length}`);

  const augustUnavail = await repository.getUnavailabilitiesByDateRange('2026-08-01', '2026-08-31');
  console.log(`[PASS] August 2026 unavailabilities count: ${augustUnavail.length}`);

  // 5. Verify Schedules & Assignments
  console.log('\n--- Test 5: Schedules & Assignments ---');
  const pastSchedule = await repository.getScheduleByMonthYear(2026, 9);
  if (!pastSchedule) {
    throw new Error('September 2026 schedule not found');
  }
  console.log(`[PASS] Retrieved September 2026 Schedule (Status: ${pastSchedule.status}, Assignments: ${pastSchedule.assignments.length})`);

  // Test creating new August Schedule
  const augSchedule = await repository.createSchedule({ year: 2026, month: 8, status: SCHEDULE_STATUS.DRAFT });
  console.log(`[PASS] Created August 2026 Schedule ID: ${augSchedule.id}`);

  // Add assignment to August Schedule
  const newAssignment = await repository.createAssignment({
    scheduleId: augSchedule.id,
    volunteerId: firstVol.id,
    date: '2026-08-02',
    shift: SHIFTS.MORNING,
    role: ROLES.COORDINATOR
  });
  console.log(`[PASS] Assigned ${firstVol.name} to COORDINATOR on 2026-08-02 MORNING (ID: ${newAssignment.id})`);

  // Past assignments lookup for volunteer equity tracking
  const pastVolAssignments = await repository.getPastAssignmentsByVolunteerId(firstVol.id);
  console.log(`[PASS] Past assignments for ${firstVol.name}: ${pastVolAssignments.length}`);

  // Update schedule status
  const publishedAug = await repository.publishSchedule(augSchedule.id);
  if (publishedAug.status !== SCHEDULE_STATUS.PUBLISHED) {
    throw new Error('Schedule status update failed');
  }
  console.log(`[PASS] Updated August Schedule status to: ${publishedAug.status}`);

  await repository.reopenSchedule(augSchedule.id);
  const historyAfterReopen = await repository.getAssignmentsByDateRange('2026-08-01', '2026-09-01');
  if (!historyAfterReopen.some(assignment => assignment.volunteer_id === firstVol.id)) {
    throw new Error('Published assignment disappeared from equity history after reopening');
  }
  console.log('[PASS] Published history remains available after reopening the draft');

  // Cleanup test DB
  await closeDatabase();
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  console.log('\n🎉 ALL DATABASE AND REPOSITORY VERIFICATION TESTS PASSED SUCCESSFULLY!');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
