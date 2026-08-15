import React from 'react';
import ReactDOM from 'react-dom/client';

import { AdminConfirmationManager } from '../../src/components/AdminConfirmationManager';
import { AdminExchangeManager } from '../../src/components/AdminExchangeManager';
import { DashboardHeader } from '../../src/components/DashboardHeader';
import { PdfExporter } from '../../src/components/PdfExporter';
import { ScheduleMatrix } from '../../src/components/ScheduleMatrix';
import { VolunteerManager } from '../../src/components/VolunteerManager';
import { ROLES, SHIFTS } from '../../src/domain/catalog';
import '../../src/styles/main.css';

const volunteers = Array.from({ length: 36 }, (_, index) => ({
  id: String(index + 1),
  name: `Voluntário de teste ${String(index + 1).padStart(2, '0')}`,
  email: `voluntario.mobile.${index + 1}@igreja.org`,
  phone: '',
  active: true,
  allowedShift: 'ALL',
  proficiencies: Object.fromEntries(ROLES.map((role) => [role.id, role.id === 'FREEHAND' ? 2 : 0]))
}));

const sunday = { date: '2026-08-02', formatted: '02/08/2026', label: '1º Domingo' };
const emptyShift = Object.fromEntries(ROLES.map((role) => [role.id, { main: '', trainee: '' }]));
const morningShift = {
  ...emptyShift,
  FREEHAND: { main: '1', trainee: '2' }
};
const fixtureSchedule = { [sunday.date]: { MORNING: morningShift, NIGHT: emptyShift } };

function ScheduleFixture() {
  return (
    <ScheduleMatrix
      sundays={[sunday]}
      shifts={SHIFTS}
      roles={ROLES}
      volunteers={volunteers}
      schedule={fixtureSchedule}
      unavailabilities={[]}
      lockedSlots={[]}
      onScheduleChange={() => {}}
      onGenerateAuto={() => {}}
      onToggleLockSlot={() => {}}
      readOnly
    />
  );
}

function PdfFixture() {
  const pdfVolunteers = volunteers.map((volunteer) =>
    volunteer.id === '1'
      ? { ...volunteer, name: 'Nome Atual Diferente' }
      : volunteer.id === '2'
        ? { ...volunteer, name: 'Outro Nome Atual' }
        : volunteer
  );
  const publishedVersion = {
    version: 1,
    matrix: fixtureSchedule,
    volunteerNames: {
      1: { name: 'Maria Eduarda de Souza' },
      2: { name: 'Joana Clara Pereira' }
    }
  };

  return (
    <PdfExporter
      schedule={fixtureSchedule}
      volunteers={pdfVolunteers}
      sundays={[sunday]}
      shifts={SHIFTS}
      roles={ROLES}
      monthLabel="Agosto 2026"
      status="published"
      version={1}
      versions={[publishedVersion]}
    />
  );
}

function HeaderFixture() {
  return (
    <DashboardHeader
      currentMonth="Agosto 2026"
      status="published"
      activeTab="schedule"
      onMonthChange={() => {}}
      onToggleStatus={() => {}}
      onGenerateAuto={() => {}}
      onTabChange={() => {}}
      onOpenPdfModal={() => {}}
      onLogout={() => {}}
      disabled={false}
      hasSchedule
      pendingCount={0}
    />
  );
}

function LabelsFixture() {
  return (
    <>
      <AdminConfirmationManager
        confirmations={[
          {
            id: 'confirmation-1',
            date: '2026-08-16',
            shift: 'MORNING',
            role: 'FIXED_CAM',
            volunteerName: 'Maria Eduarda',
            isTrainee: false,
            status: 'AWAITING',
            reminderCount: 1,
            recipientEmail: 'maria@example.com'
          }
        ]}
      />
      <AdminExchangeManager
        exchanges={[
          {
            id: 'exchange-1',
            date: '2026-08-16',
            shift: 'MORNING',
            targetDate: '2026-08-30',
            targetShift: 'NIGHT',
            requesterName: 'Maria Eduarda',
            targetVolunteerName: 'João Pedro',
            status: 'PENDING',
            reason: 'Compromisso familiar'
          }
        ]}
      />
    </>
  );
}

function LeaderMobileFixture() {
  const scenario = new URLSearchParams(window.location.search).get('scenario');
  return (
    <div className="app-container">
      {scenario === 'header' ? (
        <HeaderFixture />
      ) : (
        <main className="main-content">
          {scenario === 'schedule' ? (
            <ScheduleFixture />
          ) : scenario === 'pdf' ? (
            <PdfFixture />
          ) : scenario === 'labels' ? (
            <LabelsFixture />
          ) : (
            <VolunteerManager
              volunteers={volunteers}
              roles={ROLES}
              onUpdateProficiency={() => {}}
              onUpdateAllowedShift={() => {}}
              onUpdateVolunteer={() => {}}
              onAddVolunteer={async () => true}
              onToggleVolunteerStatus={() => {}}
              disabled={false}
            />
          )}
        </main>
      )}
    </div>
  );
}

const root = document.getElementById('root');

if (!root) throw new Error('Fixture root not found.');

ReactDOM.createRoot(root).render(<LeaderMobileFixture />);
