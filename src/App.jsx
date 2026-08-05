import React, { useState, useMemo, useEffect } from 'react';
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
  getSundaysForMonth,
  generateInitialSchedule 
} from './mockData/initialData';
import { Sparkles, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import { getSlotAssignment } from './utils/scheduleUtils';

export function App() {
  const [monthIndex, setMonthIndex] = useState(7); // August (0-indexed)
  const [year] = useState(2026);
  const [status, setStatus] = useState('draft'); // 'draft' | 'published'
  const [activeTab, setActiveTab] = useState('schedule');
  const [notification, setNotification] = useState(null);

  const [roles] = useState(INITIAL_ROLES);
  const [shifts] = useState(SHIFTS);

  // Persistent State via localStorage
  const [volunteers, setVolunteers] = useState(() => {
    try {
      const saved = localStorage.getItem('escala_volunteers');
      return saved ? JSON.parse(saved) : INITIAL_VOLUNTEERS;
    } catch {
      return INITIAL_VOLUNTEERS;
    }
  });

  const [unavailabilities, setUnavailabilities] = useState(() => {
    try {
      const saved = localStorage.getItem('escala_unavailabilities');
      return saved ? JSON.parse(saved) : INITIAL_UNAVAILABILITIES;
    } catch {
      return INITIAL_UNAVAILABILITIES;
    }
  });

  // Compute sundays dynamically for selected month
  const sundays = useMemo(() => {
    return getSundaysForMonth(year, monthIndex);
  }, [year, monthIndex]);

  const [schedule, setSchedule] = useState(() => {
    try {
      const saved = localStorage.getItem('escala_schedule');
      return saved ? JSON.parse(saved) : generateInitialSchedule(INITIAL_SUNDAYS);
    } catch {
      return generateInitialSchedule(INITIAL_SUNDAYS);
    }
  });

  // Auto-save changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('escala_volunteers', JSON.stringify(volunteers));
    } catch (e) {
      console.error('Error saving volunteers to localStorage', e);
    }
  }, [volunteers]);

  useEffect(() => {
    try {
      localStorage.setItem('escala_unavailabilities', JSON.stringify(unavailabilities));
    } catch (e) {
      console.error('Error saving unavailabilities to localStorage', e);
    }
  }, [unavailabilities]);

  useEffect(() => {
    try {
      localStorage.setItem('escala_schedule', JSON.stringify(schedule));
    } catch (e) {
      console.error('Error saving schedule to localStorage', e);
    }
  }, [schedule]);

  // Auto initialize schedule slots when sundays change if not present
  useEffect(() => {
    setSchedule(prev => {
      const updated = { ...prev };
      let changed = false;
      sundays.forEach(sunday => {
        if (!updated[sunday.date]) {
          changed = true;
          updated[sunday.date] = {
            MORNING: { FREEHAND: '', VMIX: '', FIXED_CAM: '', SWITCHER: '', JIB: '', COORDINATOR: '' },
            NIGHT: { FREEHAND: '', VMIX: '', FIXED_CAM: '', SWITCHER: '', JIB: '', COORDINATOR: '' }
          };
        }
      });
      return changed ? updated : prev;
    });
  }, [sundays]);

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
    setNotification(null);
  };

  const handleToggleStatus = () => {
    setStatus(prev => prev === 'draft' ? 'published' : 'draft');
  };

  // Schedule slot change handler (type = 'main' | 'trainee')
  const handleScheduleChange = (date, shiftId, roleId, volunteerId, type = 'main') => {
    setSchedule(prev => {
      const current = getSlotAssignment(prev, date, shiftId, roleId);
      const updatedSlot = {
        ...current,
        [type]: volunteerId
      };
      return {
        ...prev,
        [date]: {
          ...prev[date],
          [shiftId]: {
            ...prev[date]?.[shiftId],
            [roleId]: updatedSlot
          }
        }
      };
    });
  };

  // Automated AI/Algorithm schedule generator connected to official Constraint Solver
  const INITIAL_LOCKED_SLOTS = [
    '2026-08-02:MORNING:COORDINATOR',
    '2026-08-02:MORNING:VMIX',
    '2026-08-02:MORNING:FIXED_CAM',
    '2026-08-02:MORNING:FREEHAND',
    '2026-08-02:MORNING:SWITCHER',
    '2026-08-02:MORNING:JIB',
    '2026-08-02:NIGHT:COORDINATOR',
    '2026-08-02:NIGHT:VMIX',
    '2026-08-02:NIGHT:FIXED_CAM',
    '2026-08-02:NIGHT:FREEHAND',
    '2026-08-02:NIGHT:JIB'
  ];

  const [lockedSlots, setLockedSlots] = useState(() => {
    try {
      const saved = localStorage.getItem('escala_locked_slots');
      return saved ? JSON.parse(saved) : INITIAL_LOCKED_SLOTS;
    } catch {
      return INITIAL_LOCKED_SLOTS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('escala_locked_slots', JSON.stringify(lockedSlots));
    } catch (e) {
      console.error('Error saving lockedSlots to localStorage', e);
    }
  }, [lockedSlots]);

  const handleToggleLockSlot = (date, shiftId, roleId) => {
    const slotKey = `${date}:${shiftId}:${roleId}`;
    setLockedSlots(prev => {
      if (prev.includes(slotKey)) {
        return prev.filter(k => k !== slotKey);
      } else {
        return [...prev, slotKey];
      }
    });
  };

  // Automated AI/Algorithm schedule generator connected to official Constraint Solver
  const handleGenerateAutoSchedule = () => {
    setNotification(null);
    try {
      const yearNum = year;
      const monthNum = monthIndex + 1;

      const profList = [];
      volunteers.forEach(v => {
        if (v.proficiencies) {
          Object.entries(v.proficiencies).forEach(([roleId, level]) => {
            if (level > 0) {
              profList.push({ volunteerId: String(v.id), role: roleId, level });
            }
          });
        }
      });

      // Collect ONLY user-locked slots
      const lockedAssignments = [];
      if (schedule && lockedSlots) {
        lockedSlots.forEach(slotKey => {
          const [d, s, r] = slotKey.split(':');
          const slotVal = getSlotAssignment(schedule, d, s, r);
          if (slotVal.main) {
            lockedAssignments.push({
              date: d,
              shift: s,
              role: r,
              volunteerId: String(slotVal.main)
            });
          }
        });
      }

      const result = generateSchedule({
        year: yearNum,
        month: monthNum,
        volunteers: volunteers.filter(v => v.active).map(v => ({ ...v, id: String(v.id) })),
        proficiencies: profList,
        unavailabilities: unavailabilities.map(u => ({ ...u, volunteerId: String(u.volunteerId) })),
        pastAssignments: [],
        roles: roles.map(r => r.id),
        shifts: shifts.map(s => s.id),
        lockedAssignments,
        force: true
      });

      if (result && result.success && result.bySunday) {
        setSchedule(prev => {
          const updated = { ...prev };
          sundays.forEach(sunday => {
            updated[sunday.date] = updated[sunday.date] || { MORNING: {}, NIGHT: {} };
            shifts.forEach(shift => {
              updated[sunday.date][shift.id] = updated[sunday.date][shift.id] || {};
              roles.forEach(role => {
                const slotKey = `${sunday.date}:${shift.id}:${role.id}`;
                if (!lockedSlots.includes(slotKey)) {
                  const generatedVal = result.bySunday[sunday.date]?.[shift.id]?.[role.id];
                  if (typeof generatedVal === 'object') {
                    updated[sunday.date][shift.id][role.id] = {
                      main: generatedVal.main || '',
                      trainee: generatedVal.trainee || ''
                    };
                  } else {
                    updated[sunday.date][shift.id][role.id] = {
                      main: generatedVal || '',
                      trainee: ''
                    };
                  }
                }
              });
            });
          });
          return updated;
        });

        const traineeCount = result.metrics?.traineeSlotsAssigned || result.trainees?.length || 0;
        setNotification({
          type: 'success',
          message: `✨ Nova proposta de escala gerada com sucesso! ${traineeCount > 0 ? `${traineeCount} voluntários N1 foram adicionados para treinamento em dupla com operadores N2+.` : ''}`
        });
      } else {
        setNotification({
          type: 'warning',
          message: '⚠️ Não foi possível preencher todas as vagas. Verifique se há voluntários suficientes cadastrados.'
        });
      }
    } catch (err) {
      console.error(err);
      setNotification({
        type: 'error',
        message: 'Erro ao gerar escala: ' + err.message
      });
    }
  };

  // Volunteer Handlers
  const handleUpdateProficiency = (volunteerId, roleId, level) => {
    const vIdStr = String(volunteerId);
    setVolunteers(prev => prev.map(v => {
      if (String(v.id) === vIdStr) {
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

  const handleUpdateAllowedShift = (volunteerId, allowedShift) => {
    const vIdStr = String(volunteerId);
    setVolunteers(prev => prev.map(v => {
      if (String(v.id) === vIdStr) {
        return { ...v, allowedShift };
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
    const vIdStr = String(volunteerId);
    setVolunteers(prev => prev.map(v => {
      if (String(v.id) === vIdStr) {
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

      {notification && (
        <div 
          style={{
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            background: notification.type === 'success' 
              ? 'rgba(16, 185, 129, 0.15)' 
              : notification.type === 'warning'
              ? 'rgba(245, 158, 11, 0.15)'
              : 'rgba(244, 63, 94, 0.15)',
            border: notification.type === 'success'
              ? '1px solid rgba(16, 185, 129, 0.4)'
              : notification.type === 'warning'
              ? '1px solid rgba(245, 158, 11, 0.4)'
              : '1px solid rgba(244, 63, 94, 0.4)',
            color: notification.type === 'success'
              ? '#34d399'
              : notification.type === 'warning'
              ? '#fbbf24'
              : '#f87171'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontWeight: 600, fontSize: '0.95rem' }}>
            {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            <span>{notification.message}</span>
          </div>
          <button 
            onClick={() => setNotification(null)}
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <main className="main-content">
        {activeTab === 'schedule' && (
          <ScheduleMatrix
            sundays={sundays}
            shifts={shifts}
            roles={roles}
            volunteers={volunteers}
            schedule={schedule}
            unavailabilities={unavailabilities}
            lockedSlots={lockedSlots}
            onScheduleChange={handleScheduleChange}
            onGenerateAuto={handleGenerateAutoSchedule}
            onToggleLockSlot={handleToggleLockSlot}
          />
        )}

        {activeTab === 'volunteers' && (
          <VolunteerManager
            volunteers={volunteers}
            roles={roles}
            onUpdateProficiency={handleUpdateProficiency}
            onUpdateAllowedShift={handleUpdateAllowedShift}
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

