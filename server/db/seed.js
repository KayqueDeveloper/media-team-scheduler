import { getDatabase, closeDatabase } from './index.js';
import * as repository from './repository.js';
import { ROLES, SHIFTS, SCHEDULE_STATUS } from './constants.js';
import fs from 'fs';
import { fileURLToPath } from 'url';

export default function seedDatabase(dbPath) {
  // If dbPath is specified, ensure clean state or use configured DB
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const db = getDatabase(dbPath);

  console.log('🌱 Starting Database Seeding...');

  // Reset existing tables for idempotent seed execution
  db.prepare(`DELETE FROM assignments`).run();
  db.prepare(`DELETE FROM unavailabilities`).run();
  db.prepare(`DELETE FROM proficiencies`).run();
  db.prepare(`DELETE FROM schedules`).run();
  db.prepare(`DELETE FROM volunteers`).run();

  // 1. Create Volunteers with realistic names & constraints
  const volunteerDataList = [
    { name: 'Lucas Oliveira', email: 'lucas.oliveira@church.org', phone: '(11) 98765-4321', maxMonthlyFrequency: 4, maxConsecutiveSundays: 2 },
    { name: 'Mariana Santos', email: 'mariana.santos@church.org', phone: '(11) 98765-4322', maxMonthlyFrequency: 3, maxConsecutiveSundays: 2 },
    { name: 'Gabriel Costa', email: 'gabriel.costa@church.org', phone: '(11) 98765-4323', maxMonthlyFrequency: 4, maxConsecutiveSundays: 2 },
    { name: 'Beatriz Lima', email: 'beatriz.lima@church.org', phone: '(11) 98765-4324', maxMonthlyFrequency: 2, maxConsecutiveSundays: 1 },
    { name: 'Matheus Pereira', email: 'matheus.pereira@church.org', phone: '(11) 98765-4325', maxMonthlyFrequency: 4, maxConsecutiveSundays: 2 },
    { name: 'Sophia Rodrigues', email: 'sophia.rodrigues@church.org', phone: '(11) 98765-4326', maxMonthlyFrequency: 3, maxConsecutiveSundays: 2 },
    { name: 'Enzo Almeida', email: 'enzo.almeida@church.org', phone: '(11) 98765-4327', maxMonthlyFrequency: 4, maxConsecutiveSundays: 2 },
    { name: 'Larissa Ferreira', email: 'larissa.ferreira@church.org', phone: '(11) 98765-4328', maxMonthlyFrequency: 2, maxConsecutiveSundays: 1 },
    { name: 'Thiago Silva', email: 'thiago.silva@church.org', phone: '(11) 98765-4329', maxMonthlyFrequency: 4, maxConsecutiveSundays: 2 },
    { name: 'Camila Barbosa', email: 'camila.barbosa@church.org', phone: '(11) 98765-4330', maxMonthlyFrequency: 3, maxConsecutiveSundays: 2 },
    { name: 'Rafael Souza', email: 'rafael.souza@church.org', phone: '(11) 98765-4331', maxMonthlyFrequency: 4, maxConsecutiveSundays: 2 },
    { name: 'Isabela Martins', email: 'isabela.martins@church.org', phone: '(11) 98765-4332', maxMonthlyFrequency: 2, maxConsecutiveSundays: 1 },
    { name: 'Felipe Carvalho', email: 'felipe.carvalho@church.org', phone: '(11) 98765-4333', maxMonthlyFrequency: 4, maxConsecutiveSundays: 2 },
    { name: 'Amanda Rocha', email: 'amanda.rocha@church.org', phone: '(11) 98765-4334', maxMonthlyFrequency: 3, maxConsecutiveSundays: 2 },
    { name: 'Bruno Mendes', email: 'bruno.mendes@church.org', phone: '(11) 98765-4335', maxMonthlyFrequency: 4, maxConsecutiveSundays: 2 },
    { name: 'Carolina Ribeiro', email: 'carolina.ribeiro@church.org', phone: '(11) 98765-4336', maxMonthlyFrequency: 2, maxConsecutiveSundays: 1 },
    { name: 'Daniel Cardoso', email: 'daniel.cardoso@church.org', phone: '(11) 98765-4337', maxMonthlyFrequency: 4, maxConsecutiveSundays: 2 },
    { name: 'Fernanda Teixeira', email: 'fernanda.teixeira@church.org', phone: '(11) 98765-4338', maxMonthlyFrequency: 3, maxConsecutiveSundays: 2 }
  ];

  const createdVolunteers = volunteerDataList.map(v => repository.createVolunteer(v));
  console.log(`✅ Created ${createdVolunteers.length} volunteers.`);

  // Helper map by index
  const v = createdVolunteers;

  // 2. Assign Proficiencies across the 6 roles
  // Roles: JIB, FIXED_CAM, SWITCHER, VMIX, COORDINATOR, FREEHAND
  // Levels: 1 (Training), 2 (Qualified), 3 (Senior)
  const proficienciesData = [
    // Lucas (Senior Coordinator, Qualified Switcher, Qualified vMix)
    { vId: v[0].id, profs: { [ROLES.COORDINATOR]: 3, [ROLES.SWITCHER]: 2, [ROLES.VMIX]: 2 } },
    // Mariana (Senior vMix, Qualified Switcher)
    { vId: v[1].id, profs: { [ROLES.VMIX]: 3, [ROLES.SWITCHER]: 2 } },
    // Gabriel (Senior Switcher, Qualified Fixed Cam, Training Jib)
    { vId: v[2].id, profs: { [ROLES.SWITCHER]: 3, [ROLES.FIXED_CAM]: 2, [ROLES.JIB]: 1 } },
    // Beatriz (Senior Fixed Cam, Qualified Freehand)
    { vId: v[3].id, profs: { [ROLES.FIXED_CAM]: 3, [ROLES.FREEHAND]: 2 } },
    // Matheus (Senior Jib, Qualified Fixed Cam)
    { vId: v[4].id, profs: { [ROLES.JIB]: 3, [ROLES.FIXED_CAM]: 2 } },
    // Sophia (Senior Freehand, Qualified Fixed Cam, Training Coordinator)
    { vId: v[5].id, profs: { [ROLES.FREEHAND]: 3, [ROLES.FIXED_CAM]: 2, [ROLES.COORDINATOR]: 1 } },
    // Enzo (Senior Coordinator, Senior Switcher)
    { vId: v[6].id, profs: { [ROLES.COORDINATOR]: 3, [ROLES.SWITCHER]: 3 } },
    // Larissa (Qualified vMix, Qualified Fixed Cam)
    { vId: v[7].id, profs: { [ROLES.VMIX]: 2, [ROLES.FIXED_CAM]: 2 } },
    // Thiago (Senior Jib, Senior Freehand, Qualified Fixed Cam)
    { vId: v[8].id, profs: { [ROLES.JIB]: 3, [ROLES.FREEHAND]: 3, [ROLES.FIXED_CAM]: 2 } },
    // Camila (Qualified Switcher, Senior vMix)
    { vId: v[9].id, profs: { [ROLES.SWITCHER]: 2, [ROLES.VMIX]: 3 } },
    // Rafael (Qualified Fixed Cam, Qualified Freehand, Training Jib)
    { vId: v[10].id, profs: { [ROLES.FIXED_CAM]: 2, [ROLES.FREEHAND]: 2, [ROLES.JIB]: 1 } },
    // Isabela (Training Switcher, Qualified Fixed Cam)
    { vId: v[11].id, profs: { [ROLES.SWITCHER]: 1, [ROLES.FIXED_CAM]: 2 } },
    // Felipe (Senior Freehand, Qualified Jib)
    { vId: v[12].id, profs: { [ROLES.FREEHAND]: 3, [ROLES.JIB]: 2 } },
    // Amanda (Qualified Coordinator, Senior Fixed Cam)
    { vId: v[13].id, profs: { [ROLES.COORDINATOR]: 2, [ROLES.FIXED_CAM]: 3 } },
    // Bruno (Senior Switcher, Senior vMix, Qualified Coordinator)
    { vId: v[14].id, profs: { [ROLES.SWITCHER]: 3, [ROLES.VMIX]: 3, [ROLES.COORDINATOR]: 2 } },
    // Carolina (Qualified Fixed Cam, Training vMix)
    { vId: v[15].id, profs: { [ROLES.FIXED_CAM]: 2, [ROLES.VMIX]: 1 } },
    // Daniel (Senior Jib, Qualified Freehand)
    { vId: v[16].id, profs: { [ROLES.JIB]: 3, [ROLES.FREEHAND]: 2 } },
    // Fernanda (Qualified Coordinator, Qualified Switcher)
    { vId: v[17].id, profs: { [ROLES.COORDINATOR]: 2, [ROLES.SWITCHER]: 2 } }
  ];

  let profCount = 0;
  proficienciesData.forEach(item => {
    repository.setVolunteerProficiencies(item.vId, item.profs);
    profCount += Object.keys(item.profs).length;
  });
  console.log(`✅ Seeded ${profCount} proficiencies across all volunteers.`);

  // 3. Seed Test Unavailabilities for August 2026
  const unavailabilities = [
    { volunteerId: v[0].id, date: '2026-08-09', shift: SHIFTS.MORNING, reason: 'Viagem de trabalho' },
    { volunteerId: v[2].id, date: '2026-08-16', shift: 'ALL', reason: 'Compromisso familiar' },
    { volunteerId: v[4].id, date: '2026-08-23', shift: SHIFTS.NIGHT, reason: 'Estudos' },
    { volunteerId: v[6].id, date: '2026-08-02', shift: SHIFTS.MORNING, reason: 'Consulta médica' },
    { volunteerId: v[8].id, date: '2026-08-30', shift: 'ALL', reason: 'Férias' },
    { volunteerId: v[13].id, date: '2026-08-16', shift: SHIFTS.NIGHT, reason: 'Evento externo' }
  ];

  unavailabilities.forEach(u => repository.addUnavailability(u));
  console.log(`✅ Seeded ${unavailabilities.length} unavailabilities for testing.`);

  // 4. Seed Past Schedule & Assignments (July 2026 - Published)
  const julySchedule = repository.createSchedule({ year: 2026, month: 7, status: SCHEDULE_STATUS.PUBLISHED });
  console.log(`✅ Created July 2026 schedule (ID: ${julySchedule.id}).`);

  // July Sundays: 2026-07-05, 2026-07-12, 2026-07-19, 2026-07-26
  const pastAssignments = [
    // 2026-07-05 Morning
    { scheduleId: julySchedule.id, volunteerId: v[0].id, date: '2026-07-05', shift: SHIFTS.MORNING, role: ROLES.COORDINATOR },
    { scheduleId: julySchedule.id, volunteerId: v[1].id, date: '2026-07-05', shift: SHIFTS.MORNING, role: ROLES.VMIX },
    { scheduleId: julySchedule.id, volunteerId: v[2].id, date: '2026-07-05', shift: SHIFTS.MORNING, role: ROLES.SWITCHER },
    { scheduleId: julySchedule.id, volunteerId: v[3].id, date: '2026-07-05', shift: SHIFTS.MORNING, role: ROLES.FIXED_CAM },
    { scheduleId: julySchedule.id, volunteerId: v[4].id, date: '2026-07-05', shift: SHIFTS.MORNING, role: ROLES.JIB },
    { scheduleId: julySchedule.id, volunteerId: v[5].id, date: '2026-07-05', shift: SHIFTS.MORNING, role: ROLES.FREEHAND },

    // 2026-07-05 Night
    { scheduleId: julySchedule.id, volunteerId: v[6].id, date: '2026-07-05', shift: SHIFTS.NIGHT, role: ROLES.COORDINATOR },
    { scheduleId: julySchedule.id, volunteerId: v[9].id, date: '2026-07-05', shift: SHIFTS.NIGHT, role: ROLES.VMIX },
    { scheduleId: julySchedule.id, volunteerId: v[14].id, date: '2026-07-05', shift: SHIFTS.NIGHT, role: ROLES.SWITCHER },
    { scheduleId: julySchedule.id, volunteerId: v[7].id, date: '2026-07-05', shift: SHIFTS.NIGHT, role: ROLES.FIXED_CAM },
    { scheduleId: julySchedule.id, volunteerId: v[8].id, date: '2026-07-05', shift: SHIFTS.NIGHT, role: ROLES.JIB },
    { scheduleId: julySchedule.id, volunteerId: v[10].id, date: '2026-07-05', shift: SHIFTS.NIGHT, role: ROLES.FREEHAND }
  ];

  repository.bulkCreateAssignments(pastAssignments);
  console.log(`✅ Seeded ${pastAssignments.length} past assignments in July 2026.`);

  console.log('✨ Database seeding completed successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase();
  closeDatabase();
}
