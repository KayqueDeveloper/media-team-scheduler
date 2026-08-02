export const INITIAL_ROLES = [
  { id: 'FREEHAND', name: 'Freehand', shortName: 'FREEHAND' },
  { id: 'VMIX', name: 'vMix', shortName: 'VMIX' },
  { id: 'FIXED_CAM', name: 'Câmera Fixa', shortName: 'FIXA' },
  { id: 'SWITCHER', name: 'Corte', shortName: 'CORTE' },
  { id: 'JIB', name: 'Grua', shortName: 'GRUA' },
  { id: 'COORDINATOR', name: 'Coordenador', shortName: 'COORDENADOR' }
];

export const INITIAL_VOLUNTEERS = [
  {
    id: 1,
    name: 'Lucas Oliveira',
    email: 'lucas.oliveira@church.org',
    phone: '(11) 98765-4321',
    maxMonthlyFrequency: 4,
    active: true,
    proficiencies: {
      COORDINATOR: 3,
      SWITCHER: 2,
      VMIX: 2,
      JIB: 1,
      FIXED_CAM: 1,
      FREEHAND: 1
    }
  },
  {
    id: 2,
    name: 'Mariana Santos',
    email: 'mariana.santos@church.org',
    phone: '(11) 98765-4322',
    maxMonthlyFrequency: 3,
    active: true,
    proficiencies: {
      VMIX: 3,
      SWITCHER: 2,
      FREEHAND: 2,
      FIXED_CAM: 2,
      JIB: 1,
      COORDINATOR: 1
    }
  },
  {
    id: 3,
    name: 'Gabriel Costa',
    email: 'gabriel.costa@church.org',
    phone: '(11) 98765-4323',
    maxMonthlyFrequency: 4,
    active: true,
    proficiencies: {
      SWITCHER: 3,
      FIXED_CAM: 2,
      JIB: 1,
      VMIX: 1,
      FREEHAND: 1,
      COORDINATOR: 1
    }
  },
  {
    id: 4,
    name: 'Beatriz Lima',
    email: 'beatriz.lima@church.org',
    phone: '(11) 98765-4324',
    maxMonthlyFrequency: 2,
    active: true,
    proficiencies: {
      FIXED_CAM: 3,
      FREEHAND: 2,
      JIB: 1,
      SWITCHER: 1,
      VMIX: 1,
      COORDINATOR: 1
    }
  },
  {
    id: 5,
    name: 'Matheus Pereira',
    email: 'matheus.pereira@church.org',
    phone: '(11) 98765-4325',
    maxMonthlyFrequency: 4,
    active: true,
    proficiencies: {
      JIB: 3,
      FIXED_CAM: 2,
      FREEHAND: 2,
      SWITCHER: 1,
      VMIX: 1,
      COORDINATOR: 1
    }
  },
  {
    id: 6,
    name: 'Sophia Rodrigues',
    email: 'sophia.rodrigues@church.org',
    phone: '(11) 98765-4326',
    maxMonthlyFrequency: 3,
    active: true,
    proficiencies: {
      FREEHAND: 3,
      FIXED_CAM: 2,
      COORDINATOR: 1,
      JIB: 1,
      SWITCHER: 1,
      VMIX: 1
    }
  },
  {
    id: 7,
    name: 'Enzo Almeida',
    email: 'enzo.almeida@church.org',
    phone: '(11) 98765-4327',
    maxMonthlyFrequency: 4,
    active: true,
    proficiencies: {
      COORDINATOR: 3,
      SWITCHER: 3,
      VMIX: 2,
      JIB: 2,
      FIXED_CAM: 2,
      FREEHAND: 2
    }
  },
  {
    id: 8,
    name: 'Larissa Ferreira',
    email: 'larissa.ferreira@church.org',
    phone: '(11) 98765-4328',
    maxMonthlyFrequency: 2,
    active: true,
    proficiencies: {
      VMIX: 2,
      FIXED_CAM: 2,
      FREEHAND: 1,
      JIB: 1,
      SWITCHER: 1,
      COORDINATOR: 1
    }
  }
];

export const INITIAL_SUNDAYS = [
  { date: '2026-09-06', formatted: '06/09/2026', label: '1º Domingo' },
  { date: '2026-09-13', formatted: '13/09/2026', label: '2º Domingo' },
  { date: '2026-09-20', formatted: '20/09/2026', label: '3º Domingo' },
  { date: '2026-09-27', formatted: '27/09/2026', label: '4º Domingo' }
];

export const SHIFTS = [
  { id: 'MORNING', name: 'Manhã', time: '09h00 - 12h00' },
  { id: 'NIGHT', name: 'Noite', time: '18h00 - 21h00' }
];

export const INITIAL_UNAVAILABILITIES = [
  { id: 1, volunteerId: 3, date: '2026-09-13', shift: 'MORNING', reason: 'Viagem de trabalho' },
  { id: 2, volunteerId: 5, date: '2026-09-20', shift: 'NIGHT', reason: 'Compromisso familiar' },
  { id: 3, volunteerId: 7, date: '2026-09-06', shift: 'NIGHT', reason: 'Estudos / Prova' }
];

export const generateInitialSchedule = () => {
  const schedule = {};
  INITIAL_SUNDAYS.forEach(sunday => {
    schedule[sunday.date] = {
      MORNING: {
        FREEHAND: 6,
        VMIX: 2,
        FIXED_CAM: 4,
        SWITCHER: 3,
        JIB: 5,
        COORDINATOR: 1
      },
      NIGHT: {
        FREEHAND: 6,
        VMIX: 2,
        FIXED_CAM: 8,
        SWITCHER: 7,
        JIB: 5,
        COORDINATOR: 7
      }
    };
  });
  return schedule;
};
