export const INITIAL_ROLES = [
  { id: 'FREEHAND', name: 'Freehand', shortName: 'FREEHAND' },
  { id: 'VMIX', name: 'vMix', shortName: 'VMIX' },
  { id: 'FIXED_CAM', name: 'Câmera Fixa', shortName: 'FIXA' },
  { id: 'SWITCHER', name: 'Corte', shortName: 'CORTE' },
  { id: 'JIB', name: 'Grua', shortName: 'GRUA' },
  { id: 'COORDINATOR', name: 'Coordenador', shortName: 'COORDENADOR' }
];

export const RAW_VOLUNTEER_SURVEY = [
  { id: 1, name: 'Ana Clara Oliveira Santos', phone: '31972168105', active: true, shifts: ['NIGHT'], roles: ['SWITCHER'], notes: '' },
  { id: 2, name: 'Luiza Vithoria Lima Valinas', phone: '31991085607', active: true, shifts: ['NIGHT'], roles: ['FIXED_CAM'], notes: '' },
  { id: 3, name: 'Samuel gaúcho', phone: '51997976723', active: true, shifts: ['MORNING', 'NIGHT'], roles: ['JIB', 'SWITCHER', 'FREEHAND'], notes: '' },
  { id: 4, name: 'Raissa Fonseca', phone: '31991819075', active: true, shifts: ['MORNING'], roles: ['FIXED_CAM'], notes: '' },
  { id: 5, name: 'Breno Sotero', phone: '31989647532', active: true, shifts: ['MORNING'], roles: ['SWITCHER'], notes: 'Posso servir somente de manhã devido ao trabalho' },
  { id: 6, name: 'Karen Marques', phone: '31993013606', active: true, shifts: ['MORNING'], roles: ['VMIX'], notes: 'Sempre opto pelo domingo de manhã...' },
  { id: 7, name: 'Valerio', phone: '31990726775', active: true, shifts: ['MORNING'], roles: ['VMIX', 'SWITCHER', 'FREEHAND'], notes: '31/05 cedo eu posso' },
  { id: 8, name: 'Mateus Mendes', phone: '31998645558', active: true, shifts: ['NIGHT'], roles: ['FREEHAND'], notes: '' },
  { id: 9, name: 'Isadora Nepomuceno e Silva', phone: '(31) 98741-7605', active: true, shifts: ['MORNING'], roles: ['JIB', 'FREEHAND', 'COORDINATOR'], notes: '' },
  { id: 10, name: 'Rafael de Souza Nascimento', phone: '31987893172', active: true, shifts: ['MORNING'], roles: ['FIXED_CAM'], notes: '' },
  { id: 11, name: 'Pedrin ph', phone: '31992931281', active: true, shifts: ['NIGHT'], roles: ['JIB', 'FREEHAND'], notes: 'Nao posso servir de manha' },
  { id: 12, name: 'Helton Neves', phone: '31993744258', active: true, shifts: ['NIGHT'], roles: ['JIB', 'SWITCHER', 'FIXED_CAM', 'FREEHAND', 'COORDINATOR'], notes: '' },
  { id: 13, name: 'Karen Giovanna', phone: '31971839695', active: true, shifts: ['MORNING'], roles: ['VMIX', 'COORDINATOR'], notes: '' },
  { id: 14, name: 'Gustavo Marcos evangelista', phone: '31983903426', active: false, shifts: ['MORNING'], roles: ['FREEHAND'], notes: 'Por enquanto indisponível' },
  { id: 15, name: 'Brenda Garcia', phone: '31989099837', active: true, shifts: ['NIGHT'], roles: ['JIB', 'FIXED_CAM'], notes: '' },
  { id: 16, name: 'Lucas de Araújo Lima', phone: '31 995484360', active: true, shifts: ['MORNING', 'NIGHT'], roles: ['JIB', 'SWITCHER', 'FIXED_CAM'], notes: '' },
  { id: 17, name: 'Gabriela Fraga', phone: '31991826166', active: true, shifts: ['MORNING'], roles: ['FIXED_CAM'], notes: '' },
  { id: 18, name: 'Jonathan Augusto Mattos de Oliveira', phone: '3197225-2298', active: true, shifts: ['MORNING'], roles: ['JIB', 'SWITCHER', 'FREEHAND'], notes: '' },
  { id: 19, name: 'Alisser Alex Cardoso Costa', phone: '31985823459', active: true, shifts: ['MORNING'], roles: ['JIB', 'VMIX', 'SWITCHER', 'FIXED_CAM', 'FREEHAND', 'COORDINATOR'], notes: 'Bora!!!' },
  { id: 20, name: 'Vitor Santos Munaier', phone: '31 989581475', active: true, shifts: ['NIGHT'], roles: ['FREEHAND'], notes: '' },
  { id: 21, name: 'Ailton rosa campos', phone: '31987701468', active: true, shifts: ['MORNING'], roles: ['JIB', 'SWITCHER', 'FREEHAND', 'COORDINATOR'], notes: '' },
  { id: 22, name: 'Larissa Juliana Marçal', phone: '31991180016', active: true, shifts: ['NIGHT'], roles: ['FIXED_CAM'], notes: '' },
  { id: 23, name: 'Filipe Natanael', phone: '31 998926222', active: true, shifts: ['MORNING'], roles: ['JIB', 'SWITCHER', 'FIXED_CAM', 'FREEHAND', 'COORDINATOR'], notes: '' },
  { id: 24, name: 'Camila souto mendes', phone: '31 986181057', active: true, shifts: ['MORNING', 'NIGHT'], roles: ['SWITCHER', 'FREEHAND'], notes: '' },
  { id: 25, name: 'Daniel Kevin', phone: '31980161236', active: true, shifts: ['NIGHT'], roles: ['JIB', 'FREEHAND'], notes: '' },
  { id: 26, name: 'Mateus Peres', phone: '31983283247', active: true, shifts: ['MORNING', 'NIGHT'], roles: ['VMIX'], notes: '' },
  { id: 27, name: 'Davidson de Almeida Ribeiro', phone: '31982868839', active: true, shifts: ['MORNING', 'NIGHT'], roles: ['JIB', 'FREEHAND'], notes: '' },
  { id: 28, name: 'Pedro Valentim Mota', phone: '31975659721', active: true, shifts: ['NIGHT'], roles: ['VMIX', 'SWITCHER', 'FREEHAND'], notes: '' },
  { id: 29, name: 'Carlos Antônio de Jesus Eugênio', phone: '3199188-0702', active: true, shifts: ['MORNING'], roles: ['JIB', 'FREEHAND'], notes: '' },
  { id: 30, name: 'Samuel Henrique De Souza Oliveira', phone: '31992090486', active: true, shifts: ['MORNING'], roles: ['JIB', 'SWITCHER', 'FIXED_CAM', 'FREEHAND'], notes: '' },
  { id: 31, name: 'Regiane', phone: '99445-4904', active: true, shifts: ['MORNING'], roles: ['SWITCHER'], notes: '' },
  { id: 32, name: 'Bernardo Reis', phone: '31988216918', active: true, shifts: ['MORNING', 'NIGHT'], roles: ['VMIX', 'SWITCHER', 'FREEHAND', 'COORDINATOR'], notes: 'Kayke é o cara' },
  { id: 33, name: 'Mateus Esteves', phone: '31999451073', active: true, shifts: ['MORNING'], roles: ['FIXED_CAM'], notes: '' },
  { id: 34, name: 'Felipe Rodrigues De Almeida', phone: '31995787947', active: true, shifts: ['MORNING'], roles: ['FIXED_CAM', 'FREEHAND'], notes: '' },
  { id: 35, name: 'Maria Fernanda', phone: '31993276729', active: true, shifts: ['NIGHT'], roles: ['FREEHAND'], notes: '' },
  { id: 36, name: 'Joshua', phone: '31995630543', active: true, shifts: ['MORNING', 'NIGHT'], roles: ['VMIX'], notes: '' },
  { id: 37, name: 'Elen Santos', phone: '31 994241605', active: true, shifts: ['MORNING', 'NIGHT'], roles: ['FREEHAND'], notes: '' },
  { id: 38, name: 'Kayque Orlando', phone: '31 900000000', active: true, shifts: ['MORNING', 'NIGHT'], roles: ['VMIX', 'COORDINATOR'], notes: '' },
  { id: 39, name: 'Juan', phone: '31 900000001', active: true, shifts: ['NIGHT'], roles: ['SWITCHER', 'FIXED_CAM'], notes: '' },
  { id: 40, name: 'Rafael Rodrigues', phone: '31 900000002', active: true, shifts: ['MORNING'], roles: ['FIXED_CAM', 'FREEHAND'], notes: '' }
];

export const getSundaysForMonth = (year, monthIndex) => {
  const sundays = [];
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  let count = 1;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(Date.UTC(year, monthIndex, day));
    if (d.getUTCDay() === 0) { // Sunday
      const yStr = d.getUTCFullYear();
      const mStr = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dStr = String(d.getUTCDate()).padStart(2, '0');
      sundays.push({
        date: `${yStr}-${mStr}-${dStr}`,
        formatted: `${dStr}/${mStr}/${yStr}`,
        label: `${count}º Domingo`
      });
      count++;
    }
  }
  return sundays;
};

export const INITIAL_VOLUNTEERS = [
    {
        "id": "1",
        "name": "Ana Clara Oliveira Santos",
        "email": "ana.clara.oliveira.santos@igreja.org",
        "phone": "31972168105",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "2",
        "name": "Luiza Vithoria Lima Valinas",
        "email": "luiza.vithoria.lima.valinas@igreja.org",
        "phone": "31991085607",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "3",
        "name": "Samuel gaúcho",
        "email": "samuel.gaúcho@igreja.org",
        "phone": "51997976723",
        "maxMonthlyFrequency": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "4",
        "name": "Raissa Fonseca",
        "email": "raissa.fonseca@igreja.org",
        "phone": "31991819075",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "5",
        "name": "Breno Sotero",
        "email": "breno.sotero@igreja.org",
        "phone": "31989647532",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "6",
        "name": "Karen Marques",
        "email": "karen.marques@igreja.org",
        "phone": "31993013606",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 2,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "7",
        "name": "Valerio",
        "email": "valerio@igreja.org",
        "phone": "31990726775",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 2,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "8",
        "name": "Mateus Mendes",
        "email": "mateus.mendes@igreja.org",
        "phone": "31998645558",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "9",
        "name": "Isadora Nepomuceno e Silva",
        "email": "isadora.nepomuceno.e.silva@igreja.org",
        "phone": "(31) 98741-7605",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 2,
            "COORDINATOR": 3
        }
    },
    {
        "id": "10",
        "name": "Rafael de Souza Nascimento",
        "email": "rafael.de.souza.nascimento@igreja.org",
        "phone": "31987893172",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "11",
        "name": "Pedrin ph",
        "email": "pedrin.ph@igreja.org",
        "phone": "31992931281",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "12",
        "name": "Helton Neves",
        "email": "helton.neves@igreja.org",
        "phone": "31993744258",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": false,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 2,
            "JIB": 2,
            "COORDINATOR": 3
        }
    },
    {
        "id": "13",
        "name": "Karen Giovanna",
        "email": "karen.giovanna@igreja.org",
        "phone": "31971839695",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 2,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 3
        }
    },
    {
        "id": "14",
        "name": "Gustavo Marcos evangelista",
        "email": "gustavo.marcos.evangelista@igreja.org",
        "phone": "31983903426",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "15",
        "name": "Brenda Garcia",
        "email": "brenda.garcia@igreja.org",
        "phone": "31989099837",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 0,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "16",
        "name": "Lucas de Araújo Lima",
        "email": "lucas.de.araújo.lima@igreja.org",
        "phone": "31 995484360",
        "maxMonthlyFrequency": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 2,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "17",
        "name": "Gabriela Fraga",
        "email": "gabriela.fraga@igreja.org",
        "phone": "31991826166",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "18",
        "name": "Jonathan Augusto Mattos de Oliveira",
        "email": "jonathan.augusto.mattos.de.oliveira@igreja.org",
        "phone": "3197225-2298",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "19",
        "name": "Alisser Alex Cardoso Costa",
        "email": "alisser.alex.cardoso.costa@igreja.org",
        "phone": "31985823459",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 2,
            "FIXED_CAM": 2,
            "SWITCHER": 2,
            "JIB": 2,
            "COORDINATOR": 3
        }
    },
    {
        "id": "20",
        "name": "Vitor Santos Munaier",
        "email": "vitor.santos.munaier@igreja.org",
        "phone": "31 989581475",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "21",
        "name": "Ailton rosa campos",
        "email": "ailton.rosa.campos@igreja.org",
        "phone": "31987701468",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 2,
            "COORDINATOR": 3
        }
    },
    {
        "id": "22",
        "name": "Larissa Juliana Marçal",
        "email": "larissa.juliana.marçal@igreja.org",
        "phone": "31991180016",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "23",
        "name": "Filipe Natanael",
        "email": "filipe.natanael@igreja.org",
        "phone": "31 998926222",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 2,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "24",
        "name": "Camila souto mendes",
        "email": "camila.souto.mendes@igreja.org",
        "phone": "31 986181057",
        "maxMonthlyFrequency": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "25",
        "name": "Daniel Kevin",
        "email": "daniel.kevin@igreja.org",
        "phone": "31980161236",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "26",
        "name": "Mateus Peres",
        "email": "mateus.peres@igreja.org",
        "phone": "31983283247",
        "maxMonthlyFrequency": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 2,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "27",
        "name": "Davidson de Almeida Ribeiro",
        "email": "davidson.de.almeida.ribeiro@igreja.org",
        "phone": "31982868839",
        "maxMonthlyFrequency": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "28",
        "name": "Pedro Valentim Mota",
        "email": "pedro.valentim.mota@igreja.org",
        "phone": "31975659721",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 2,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "29",
        "name": "Carlos Antônio de Jesus Eugênio",
        "email": "carlos.antônio.de.jesus.eugênio@igreja.org",
        "phone": "3199188-0702",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": false,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "30",
        "name": "Samuel Henrique De Souza Oliveira",
        "email": "samuel.henrique.de.souza.oliveira@igreja.org",
        "phone": "31992090486",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": false,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 2,
            "JIB": 2,
            "COORDINATOR": 0
        }
    },
    {
        "id": "31",
        "name": "Regiane",
        "email": "regiane@igreja.org",
        "phone": "99445-4904",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "32",
        "name": "Bernardo Reis",
        "email": "bernardo.reis@igreja.org",
        "phone": "31988216918",
        "maxMonthlyFrequency": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 2,
            "FIXED_CAM": 0,
            "SWITCHER": 2,
            "JIB": 0,
            "COORDINATOR": 3
        }
    },
    {
        "id": "33",
        "name": "Mateus Esteves",
        "email": "mateus.esteves@igreja.org",
        "phone": "31999451073",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "34",
        "name": "Felipe Rodrigues De Almeida",
        "email": "felipe.rodrigues.de.almeida@igreja.org",
        "phone": "31995787947",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "35",
        "name": "Maria Fernanda",
        "email": "maria.fernanda@igreja.org",
        "phone": "31993276729",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "36",
        "name": "Joshua",
        "email": "joshua@igreja.org",
        "phone": "31995630543",
        "maxMonthlyFrequency": 2,
        "allowedShift": "ALL",
        "active": false,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 2,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "37",
        "name": "Elen Santos",
        "email": "elen.santos@igreja.org",
        "phone": "31 994241605",
        "maxMonthlyFrequency": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "38",
        "name": "Kayque Orlando",
        "email": "kayque.orlando@igreja.org",
        "phone": "31 900000000",
        "maxMonthlyFrequency": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 2,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 3
        }
    },
    {
        "id": "39",
        "name": "Juan",
        "email": "juan@igreja.org",
        "phone": "31 900000001",
        "maxMonthlyFrequency": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 2,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "id": "40",
        "name": "Rafael Rodrigues",
        "email": "rafael.rodrigues@igreja.org",
        "phone": "31 900000002",
        "maxMonthlyFrequency": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 2,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        }
    },
    {
        "name": "Felipe Adriano",
        "email": "1223@abc.com",
        "phone": "123",
        "maxShiftsPerMonth": 2,
        "allowedShift": "NIGHT",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        },
        "id": "vol-1785633174410"
    },
    {
        "name": "Rafael Rodrigues",
        "email": "123@abc.com",
        "phone": "123",
        "maxShiftsPerMonth": 2,
        "allowedShift": "ALL",
        "active": false,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        },
        "id": "vol-1785633200520"
    },
    {
        "name": "Higor (guito)",
        "email": "abc@abc.com",
        "phone": "123",
        "maxShiftsPerMonth": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 0,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        },
        "id": "vol-1785633280467"
    },
    {
        "name": "João Pedro",
        "email": "abc@abc.com",
        "phone": "123",
        "maxShiftsPerMonth": 2,
        "allowedShift": "ALL",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 0,
            "COORDINATOR": 0
        },
        "id": "vol-1785633334744"
    },
    {
        "name": "Ricardo Dias",
        "email": "abc@abc.com",
        "phone": "123",
        "maxShiftsPerMonth": 2,
        "allowedShift": "MORNING",
        "active": true,
        "proficiencies": {
            "FREEHAND": 2,
            "VMIX": 0,
            "FIXED_CAM": 0,
            "SWITCHER": 0,
            "JIB": 2,
            "COORDINATOR": 0
        },
        "id": "vol-1785633429931"
    }
];

export const INITIAL_SUNDAYS = getSundaysForMonth(2026, 7); // Default August 2026 (0-indexed month 7)

export const SHIFTS = [
  { id: 'MORNING', name: 'Manhã', time: '09h00 - 12h00' },
  { id: 'NIGHT', name: 'Noite', time: '18h00 - 21h00' }
];

export const INITIAL_UNAVAILABILITIES = [
  // Registered from WhatsApp messages for August 2026
  { id: 'un-wa-1', volunteerId: '40', date: '2026-08-09', shift: 'NIGHT', reason: 'Trabalho após 14h (Rafael Rodrigues)' },
  { id: 'un-wa-2', volunteerId: '40', date: '2026-08-23', shift: 'NIGHT', reason: 'Trabalho após 14h (Rafael Rodrigues)' },
  
  { id: 'un-wa-3', volunteerId: '4', date: '2026-08-02', shift: 'NIGHT', reason: 'Disponível prioritariamente de manhã (Raissa)' },
  { id: 'un-wa-4', volunteerId: '4', date: '2026-08-09', shift: 'NIGHT', reason: 'Disponível prioritariamente de manhã (Raissa)' },
  { id: 'un-wa-5', volunteerId: '4', date: '2026-08-16', shift: 'NIGHT', reason: 'Disponível prioritariamente de manhã (Raissa)' },
  { id: 'un-wa-6', volunteerId: '4', date: '2026-08-23', shift: 'NIGHT', reason: 'Disponível prioritariamente de manhã (Raissa)' },
  { id: 'un-wa-7', volunteerId: '4', date: '2026-08-30', shift: 'NIGHT', reason: 'Disponível prioritariamente de manhã (Raissa)' },

  { id: 'un-wa-8', volunteerId: '37', date: '2026-08-02', shift: 'MORNING', reason: 'Não consegue 02/08 manhã (Elen Santos)' },
  { id: 'un-wa-9', volunteerId: '37', date: '2026-08-23', shift: 'NIGHT', reason: 'Não consegue 23/08 noite (Elen Santos)' },

  { id: 'un-wa-10', volunteerId: '11', date: '2026-08-09', shift: 'NIGHT', reason: 'Escala do outro time / Indisponível (Pedrin ph)' },
  { id: 'un-wa-11', volunteerId: '11', date: '2026-08-23', shift: 'NIGHT', reason: 'Escala do outro time / Indisponível (Pedrin ph)' },

  { id: 'un-wa-12', volunteerId: '14', date: '2026-08-09', shift: 'ALL', reason: 'Viagem (Guito)' },
  { id: 'un-wa-13', volunteerId: '14', date: '2026-08-23', shift: 'ALL', reason: 'Viagem (Guito)' },

  { id: 'un-wa-14', volunteerId: '39', date: '2026-08-09', shift: 'NIGHT', reason: 'Indisponível à noite (Juan)' },
  { id: 'un-wa-15', volunteerId: '39', date: '2026-08-23', shift: 'NIGHT', reason: 'Indisponível à noite (Juan)' },

  { id: 'un-wa-16', volunteerId: '33', date: '2026-08-30', shift: 'ALL', reason: 'Sem disponibilidade dia 30/08 (Mateus Esteves)' },

  { id: 'un-wa-17', volunteerId: '20', date: '2026-08-02', shift: 'ALL', reason: 'Disponível apenas 16 e 23 (Vitor Munaier)' },
  { id: 'un-wa-18', volunteerId: '20', date: '2026-08-09', shift: 'ALL', reason: 'Disponível apenas 16 e 23 (Vitor Munaier)' },
  { id: 'un-wa-19', volunteerId: '20', date: '2026-08-30', shift: 'ALL', reason: 'Disponível apenas 16 e 23 (Vitor Munaier)' },

  { id: 'un-wa-20', volunteerId: '2', date: '2026-08-16', shift: 'ALL', reason: 'Não consegue servir dia 16/08 (Luiza Valinas)' }
];

export const generateInitialSchedule = (sundaysList = INITIAL_SUNDAYS) => {
  const schedule = {};
  sundaysList.forEach(sunday => {
    schedule[sunday.date] = {
      MORNING: {
        FREEHAND: '',
        VMIX: '',
        FIXED_CAM: '',
        SWITCHER: '',
        JIB: '',
        COORDINATOR: ''
      },
      NIGHT: {
        FREEHAND: '',
        VMIX: '',
        FIXED_CAM: '',
        SWITCHER: '',
        JIB: '',
        COORDINATOR: ''
      }
    };
  });

  // Pre-fill locked 1st week schedule for August 02, 2026
  if (schedule['2026-08-02']) {
    schedule['2026-08-02'].MORNING = {
      COORDINATOR: '38', // Kayque
      VMIX: '38',        // Kayque
      FIXED_CAM: '4',    // Raíssa
      FREEHAND: '11',    // PH (Pedrin ph)
      SWITCHER: '1',     // Aninha (Ana Clara)
      JIB: '18'          // Jonathan Augusto
    };

    schedule['2026-08-02'].NIGHT = {
      COORDINATOR: '32', // Bernardo Minc
      VMIX: '32',        // Bernardo Minc
      FIXED_CAM: '2',    // Luiza Valinas
      FREEHAND: '37',    // Elen Karine Santos
      SWITCHER: '',      // (Vago / a preencher)
      JIB: '16'          // Lucas Lima Transmissão
    };
  }

  return schedule;
};


