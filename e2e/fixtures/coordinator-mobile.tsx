import React from 'react';
import ReactDOM from 'react-dom/client';

import { CoordinatorDashboard } from '../../src/components/CoordinatorDashboard';
import '../../src/styles/main.css';

const services = [
  {
    scheduleId: 1,
    date: '2026-08-16',
    shift: 'MORNING',
    team: [
      {
        assignmentId: 10,
        volunteerId: 20,
        volunteerName: 'Voluntária sem resposta',
        email: 'sem-resposta@example.com',
        phone: '31999990000',
        role: 'VMIX',
        isTrainee: false,
        confirmationStatus: 'AWAITING',
        coverageRequestId: null,
        coverageStatus: null,
        contactAttemptCount: 1
      },
      {
        assignmentId: 11,
        volunteerId: 21,
        volunteerName: 'Coordenador de teste',
        email: 'coordenador@example.com',
        phone: '31999991111',
        role: 'COORDINATOR',
        isTrainee: true,
        confirmationStatus: 'CONFIRMED',
        confirmationSource: 'VOLUNTEER',
        coverageRequestId: null,
        coverageStatus: null,
        contactAttemptCount: 0
      }
    ]
  }
];

const candidates = [
  { id: 30, name: 'Candidata N3', proficiency_level: 3, previous_assignments: 1 },
  { id: 31, name: 'Candidato N2', proficiency_level: 2, previous_assignments: 2 }
];

const api = {
  async getCoordinatorServices() {
    return services;
  },
  async getCoverageCandidates() {
    return candidates;
  },
  async createCoverageRequest(assignmentId, data) {
    document.body.dataset.coverageRequest = JSON.stringify({ assignmentId, ...data });
    return { id: 50, status: 'OPEN' };
  },
  async recordCoordinatorContact() {
    return { id: 1 };
  },
  async confirmAssignmentManually() {
    return {};
  }
};

const root = document.getElementById('root');
if (!root) throw new Error('Fixture root not found.');

ReactDOM.createRoot(root).render(
  <main className="portal-container">
    <CoordinatorDashboard
      user={{ id: 1, name: 'Coordenador de teste', role: 'VOLUNTEER', scopes: ['COORDINATOR'] }}
      api={api}
      year={2026}
      month={8}
    />
  </main>
);
