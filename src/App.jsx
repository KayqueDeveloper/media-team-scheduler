import React, { useState } from 'react';
import { generateSchedule } from '../server/solver/scheduler.js';
import './styles/main.css';
import { DashboardHeader } from './components/DashboardHeader';
import { ScheduleMatrix } from './components/ScheduleMatrix';
import { VolunteerManager } from './components/VolunteerManager';
import { UnavailabilityManager } from './components/UnavailabilityManager';
import { PdfExporter } from './components/PdfExporter';
import { 
  INITIAL_ROLES, 
  INITIAL_VOLUNTEERS, 
  INITIAL_SUNDAYS, 
  SHIFTS, 
  INITIAL_UNAVAILABILITIES,
  generateInitialSchedule 
} from './mockData/initialData';

export function App() {
  const [monthIndex, setMonthIndex] = useState(8); // September (0-indexed)
  const [year] = useState(2026);
  const [status, setStatus] = useState('draft'); // 'draft' | 'published'
  const [activeTab, setActiveTab] = useState('schedule');

  const [roles] = useState(INITIAL_ROLES);
  const [volunteers, setVolunteers] = useState(INITIAL_VOLUNTEERS);
  const [sundays] = useState(INITIAL_SUNDAYS);
  const [shifts] = useState(SHIFTS);
  const [unavailabilities, setUnavailabilities] = useState(INITIAL_UNAVAILABILITIES);

  const [schedule, setSchedule] = useState(() => generateInitialSchedule());

  const monthNames = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const currentMonthLabel = `${monthNames[monthIndex]} ${year}`;

  const handleMonthChange = (delta) => {
    let newIndex = monthIndex + delta;
    if (newIndex < 0) newIndex = 11;
    if (newIndex > 11) newIndex = 0;
    setMonthIndex(newIndex);
  };

  const handleToggleStatus = () => {
    setStatus(prev => prev === 'draft' ? 'published' : 'draft');
  };

  // Schedule slot change handler
  const handleScheduleChange = (date, shiftId, roleId, volunteerId) => {
    setSchedule(prev => ({
      ...prev,
      [date]: {
        ...prev[date],
        [shiftId]: {
          ...prev[date]?.[shiftId],
          [roleId]: volunteerId
        }
      }
    }));
  };

  // Automated AI/Algorithm schedule generator connected to official Constraint Solver
  const handleGenerateAutoSchedule = () => {
    try {
      const yearNum = year;
      const monthNum = monthIndex + 1;

      const profList = [];
      volunteers.forEach(v => {
        if (v.proficiencies) {
          Object.entries(v.proficiencies).forEach(([roleId, level]) => {
            if (level > 0) {
              profList.push({ volunteerId: v.id, role: roleId, level });
            }
          });
        }
      });

      const result = generateSchedule({
        year: yearNum,
        month: monthNum,
        volunteers: volunteers.filter(v => v.active),
        proficiencies: profList,
        unavailabilities: unavailabilities,
        roles: roles.map(r => r.id),
        shifts: shifts.map(s => s.id)
      });

      if (result && result.success && result.bySunday) {
        setSchedule(result.bySunday);
        alert('✨ Nova proposta de escala gerada com sucesso respeitando todas as regras dos ADRs (equidade de histórico, proficiência, máx 1 turno por domingo e sem domingos consecutivos)!');
      } else {
        alert('⚠️ Não foi possível preencher todas as vagas respeitando 100% das restrições duras. Dica: Cadastre mais voluntários ou revise o nível de proficiência nas funções.');
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar escala: ' + err.message);
    }
  };

  // Volunteer Handlers
  const handleUpdateProficiency = (volunteerId, roleId, level) => {
    setVolunteers(prev => prev.map(v => {
      if (v.id === volunteerId) {
        return {
          ...v,
          proficiencies: {
            ...v.proficiencies,
            [roleId]: level
          }
        };
      }
      return v;
    }));
  };

  const handleAddVolunteer = (newVol) => {
    const created = {
      ...newVol,
      id: `vol-${Date.now()}`
    };
    setVolunteers(prev => [...prev, created]);
  };

  const handleToggleVolunteerStatus = (volunteerId) => {
    setVolunteers(prev => prev.map(v => {
      if (v.id === volunteerId) {
        return { ...v, active: !v.active };
      }
      return v;
    }));
  };

  // Unavailability Handlers
  const handleAddUnavailability = (newUnavail) => {
    setUnavailabilities(prev => [...prev, newUnavail]);
  };

  const handleRemoveUnavailability = (id) => {
    setUnavailabilities(prev => prev.filter(u => u.id !== id));
  };

  return (
    <div className="app-container">
      <DashboardHeader
        currentMonth={currentMonthLabel}
        status={status}
        activeTab={activeTab}
        onMonthChange={handleMonthChange}
        onToggleStatus={handleToggleStatus}
        onGenerateAuto={handleGenerateAutoSchedule}
        onTabChange={setActiveTab}
        onOpenPdfModal={() => setActiveTab('print')}
      />

      <main className="main-content">
        {activeTab === 'schedule' && (
          <ScheduleMatrix
            sundays={sundays}
            shifts={shifts}
            roles={roles}
            volunteers={volunteers}
            schedule={schedule}
            unavailabilities={unavailabilities}
            onScheduleChange={handleScheduleChange}
          />
        )}

        {activeTab === 'volunteers' && (
          <VolunteerManager
            volunteers={volunteers}
            roles={roles}
            onUpdateProficiency={handleUpdateProficiency}
            onAddVolunteer={handleAddVolunteer}
            onToggleVolunteerStatus={handleToggleVolunteerStatus}
          />
        )}

        {activeTab === 'unavailability' && (
          <UnavailabilityManager
            unavailabilities={unavailabilities}
            volunteers={volunteers}
            sundays={sundays}
            shifts={shifts}
            onAddUnavailability={handleAddUnavailability}
            onRemoveUnavailability={handleRemoveUnavailability}
          />
        )}

        {activeTab === 'print' && (
          <PdfExporter
            schedule={schedule}
            volunteers={volunteers}
            sundays={sundays}
            shifts={shifts}
            roles={roles}
            monthLabel={currentMonthLabel}
            status={status}
          />
        )}
      </main>
    </div>
  );
}
