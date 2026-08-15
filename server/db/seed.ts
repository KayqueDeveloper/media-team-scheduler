// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import { getDatabase, closeDatabase } from './index.js';
import * as repository from './repository.js';
import { ROLES, SHIFTS, SCHEDULE_STATUS } from './constants.js';
import { fileURLToPath } from 'url';

export const REAL_VOLUNTEER_SURVEY_DATA = [
  { name: 'Ana Clara Oliveira Santos', available: true, phone: '31972168105', shifts: ['NIGHT'], roles: ['SWITCHER'], notes: '' },
  { name: 'Luiza Vithoria Lima Valinas', available: true, phone: '31991085607', shifts: ['NIGHT'], roles: ['FIXED_CAM'], notes: '' },
  { name: 'Samuel gaúcho', available: true, phone: '51997976723', shifts: ['MORNING', 'NIGHT'], roles: ['JIB', 'SWITCHER', 'FREEHAND'], notes: '' },
  { name: 'Raissa Fonseca', available: true, phone: '31991819075', shifts: ['MORNING'], roles: ['FIXED_CAM'], notes: '' },
  { name: 'Breno Sotero', available: true, phone: '31989647532', shifts: ['MORNING'], roles: ['SWITCHER'], notes: 'Posso servir somente de manhã devido ao trabalho' },
  { name: 'Karen Marques', available: true, phone: '31993013606', shifts: ['MORNING'], roles: ['VMIX'], notes: 'Sempre opto pelo domingo de manhã, pois trabalho alguns domingos à noite.' },
  { name: 'Valerio', available: true, phone: '31990726775', shifts: ['MORNING'], roles: ['VMIX', 'SWITCHER', 'FREEHAND'], notes: '31/05 cedo eu posso' },
  { name: 'Mateus Mendes', available: true, phone: '31998645558', shifts: ['NIGHT'], roles: ['FREEHAND'], notes: '' },
  { name: 'Isadora Nepomuceno e Silva', available: true, phone: '(31) 98741-7605', shifts: ['MORNING'], roles: ['JIB', 'FREEHAND', 'COORDINATOR'], notes: '' },
  { name: 'Rafael de Souza Nascimento', available: true, phone: '31987893172', shifts: ['MORNING'], roles: ['FIXED_CAM'], notes: '' },
  { name: 'Pedrin ph', available: true, phone: '31992931281', shifts: ['NIGHT'], roles: ['JIB', 'FREEHAND'], notes: 'Nao posso servir de manha, por que tenho edd' },
  { name: 'Helton Neves', available: true, phone: '31993744258', shifts: ['NIGHT'], roles: ['JIB', 'SWITCHER', 'FIXED_CAM', 'FREEHAND', 'COORDINATOR'], notes: '' },
  { name: 'Karen Giovanna', available: true, phone: '31971839695', shifts: ['MORNING'], roles: ['VMIX', 'COORDINATOR'], notes: '' },
  { name: 'Gustavo Marcos evangelista', available: false, phone: '31983903426', shifts: ['MORNING'], roles: ['FREEHAND'], notes: 'Por enquanto indisponível' },
  { name: 'Brenda Garcia', available: true, phone: '31989099837', shifts: ['NIGHT'], roles: ['JIB', 'FIXED_CAM'], notes: 'Já fiquei na grua, fixa e vmix com ajuda' },
  { name: 'Lucas de Araújo Lima', available: true, phone: '31 995484360', shifts: ['MORNING', 'NIGHT'], roles: ['JIB', 'SWITCHER', 'FIXED_CAM'], notes: '' },
  { name: 'Gabriela Fraga', available: true, phone: '31991826166', shifts: ['MORNING'], roles: ['FIXED_CAM'], notes: '' },
  { name: 'Jonathan Augusto Mattos de Oliveira', available: true, phone: '3197225-2298', shifts: ['MORNING'], roles: ['JIB', 'SWITCHER', 'FREEHAND'], notes: '' },
  { name: 'Alisser Alex Cardoso Costa', available: true, phone: '31985823459', shifts: ['MORNING'], roles: ['JIB', 'VMIX', 'SWITCHER', 'FIXED_CAM', 'FREEHAND', 'COORDINATOR'], notes: 'Bora!!!' },
  { name: 'Vitor Santos Munaier', available: true, phone: '31 989581475', shifts: ['NIGHT'], roles: ['FREEHAND'], notes: 'Os outros dias vou viajar ou já estou escalado em outro' },
  { name: 'Ailton rosa campos', available: true, phone: '31987701468', shifts: ['MORNING'], roles: ['JIB', 'SWITCHER', 'FREEHAND', 'COORDINATOR'], notes: '' },
  { name: 'Larissa Juliana Marçal', available: true, phone: '31991180016', shifts: ['NIGHT'], roles: ['FIXED_CAM'], notes: '' },
  { name: 'Filipe Natanael', available: true, phone: '31 998926222', shifts: ['MORNING'], roles: ['JIB', 'SWITCHER', 'FIXED_CAM', 'FREEHAND', 'COORDINATOR'], notes: '' },
  { name: 'Camila souto mendes', available: true, phone: '31 986181057', shifts: ['MORNING', 'NIGHT'], roles: ['SWITCHER', 'FREEHAND'], notes: '' },
  { name: 'Daniel Kevin', available: true, phone: '31980161236', shifts: ['NIGHT'], roles: ['JIB', 'FREEHAND'], notes: '' },
  { name: 'Mateus Peres', available: true, phone: '31983283247', shifts: ['MORNING', 'NIGHT'], roles: ['VMIX'], notes: '' },
  { name: 'Davidson de Almeida Ribeiro', available: true, phone: '31982868839', shifts: ['MORNING', 'NIGHT'], roles: ['JIB', 'FREEHAND'], notes: '' },
  { name: 'Pedro Valentim Mota', available: true, phone: '31975659721', shifts: ['NIGHT'], roles: ['VMIX', 'SWITCHER', 'FREEHAND'], notes: '' },
  { name: 'Carlos Antônio de Jesus Eugênio', available: true, phone: '3199188-0702', shifts: ['MORNING'], roles: ['JIB', 'FREEHAND'], notes: '' },
  { name: 'Samuel Henrique De Souza Oliveira', available: true, phone: '31992090486', shifts: ['MORNING'], roles: ['JIB', 'SWITCHER', 'FIXED_CAM', 'FREEHAND'], notes: '' },
  { name: 'Regiane', available: true, phone: '99445-4904', shifts: ['MORNING'], roles: ['SWITCHER'], notes: '' },
  { name: 'Bernardo Reis', available: true, phone: '31988216918', shifts: ['MORNING', 'NIGHT'], roles: ['VMIX', 'SWITCHER', 'FREEHAND', 'COORDINATOR'], notes: 'Kayke é o cara' },
  { name: 'Mateus Esteves', available: true, phone: '31999451073', shifts: ['MORNING'], roles: ['FIXED_CAM'], notes: '' },
  { name: 'Felipe Rodrigues De Almeida', available: true, phone: '31995787947', shifts: ['MORNING'], roles: ['FIXED_CAM', 'FREEHAND'], notes: '' },
  { name: 'Maria Fernanda', available: true, phone: '31993276729', shifts: ['NIGHT'], roles: ['FREEHAND'], notes: '' },
  { name: 'Joshua', available: true, phone: '31995630543', shifts: ['MORNING', 'NIGHT'], roles: ['VMIX'], notes: '' },
  { name: 'Elen Santos', available: true, phone: '31 994241605', shifts: ['MORNING', 'NIGHT'], roles: ['FREEHAND'], notes: '' }
];

export default async function seedDatabase() {
  const db = getDatabase();

  console.log('🌱 Clearing old test volunteers and seeding REAL church volunteer responses...');

  // Reset existing tables
  await db.ready;
  await db.transaction(async tx => {
    await tx.run(`DELETE FROM notifications`);
    await tx.run(`DELETE FROM schedule_change_events`);
    await tx.run(`DELETE FROM schedule_exchanges`);
    await tx.run(`DELETE FROM service_confirmations`);
    await tx.run(`DELETE FROM users`);
    await tx.run(`DELETE FROM assignments`);
    await tx.run(`DELETE FROM unavailabilities`);
    await tx.run(`DELETE FROM proficiencies`);
    await tx.run(`DELETE FROM schedules`);
    await tx.run(`DELETE FROM volunteers`);
  });

  let createdCount = 0;
  let profCount = 0;
  let unavailCount = 0;

  const septemberSundays = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'];

  for (const vData of REAL_VOLUNTEER_SURVEY_DATA) {
    const volunteer = await repository.createVolunteer({
      name: vData.name.trim(),
      email: `${vData.name.trim().toLowerCase().replace(/\s+/g, '.')}@igreja.org`,
      phone: vData.phone,
      maxMonthlyFrequency: 2,
      maxConsecutiveSundays: 1,
      active: vData.available ? 1 : 0
    });
    createdCount++;

    // Assign Proficiencies for roles they master (Level 2 = Qualified)
    const profsMap = {};
    Object.values(ROLES).forEach(r => {
      profsMap[r] = vData.roles.includes(r) ? 2 : 0;
    });
    // Set level 3 for multi-skilled leaders
    if (vData.roles.includes('COORDINATOR')) {
      profsMap['COORDINATOR'] = 3;
    }
    await repository.setVolunteerProficiencies(volunteer.id, profsMap);
    profCount += vData.roles.length;

    // Shift Availability -> Add unavailabilities if they cannot serve a shift
    const servesMorning = vData.shifts.includes('MORNING');
    const servesNight = vData.shifts.includes('NIGHT');

    for (const dateStr of septemberSundays) {
      if (!servesMorning) {
        await repository.addUnavailability({
          volunteerId: volunteer.id,
          date: dateStr,
          shift: SHIFTS.MORNING,
          reason: 'Disponível apenas no turno da Noite'
        });
        unavailCount++;
      }
      if (!servesNight) {
        await repository.addUnavailability({
          volunteerId: volunteer.id,
          date: dateStr,
          shift: SHIFTS.NIGHT,
          reason: 'Disponível apenas no turno da Manhã'
        });
        unavailCount++;
      }
    }
  }

  console.log(`✅ Seeded ${createdCount} real volunteers from survey.`);
  console.log(`✅ Seeded ${profCount} proficiency entries across 6 roles.`);
  console.log(`✅ Seeded ${unavailCount} shift unavailability restrictions.`);

  // Create September 2026 Schedule Draft
  const sepSchedule = await repository.createSchedule({ year: 2026, month: 9, status: SCHEDULE_STATUS.DRAFT });
  console.log(`✅ Created September 2026 Schedule (ID: ${sepSchedule.id}).`);

  console.log('✨ Database seeding with REAL data completed successfully.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase()
    .then(() => closeDatabase())
    .catch(error => {
      console.error(error);
      process.exitCode = 1;
    });
}
