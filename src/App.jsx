import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, X } from 'lucide-react';

import { api } from './api/client';
import { DashboardHeader } from './components/DashboardHeader';
import { PdfExporter } from './components/PdfExporter';
import { ScheduleMatrix } from './components/ScheduleMatrix';
import { UnavailabilityManager } from './components/UnavailabilityManager';
import { VolunteerManager } from './components/VolunteerManager';
import { getSundaysForMonth, MONTH_NAMES, ROLES, SHIFTS } from './domain/catalog';
import {
  collectScheduleWarnings,
  ensureScheduleSlots,
  updateScheduleSlot,
  validateScheduleChange
} from './utils/scheduleUtils';
import './styles/main.css';

const initialScheduleState = {
  id: null,
  status: 'draft',
  matrix: {},
  lockedSlots: [],
  warnings: [],
  publishedVersion: null
};

function hasMatrixData(matrix) {
  return Object.keys(matrix || {}).length > 0;
}

function mergeScheduleResponse(remote, fallback, sundays) {
  return {
    ...fallback,
    ...remote,
    id: remote.id || fallback.id,
    matrix: ensureScheduleSlots(hasMatrixData(remote.matrix) ? remote.matrix : fallback.matrix, sundays, SHIFTS, ROLES),
    lockedSlots: remote.lockedSlots?.length ? remote.lockedSlots : fallback.lockedSlots,
    warnings: remote.warnings?.length ? remote.warnings : fallback.warnings
  };
}

export function App() {
  const today = useMemo(() => new Date(), []);
  const [monthIndex, setMonthIndex] = useState(today.getMonth());
  const [year, setYear] = useState(today.getFullYear());
  const [activeTab, setActiveTab] = useState('schedule');
  const [volunteers, setVolunteers] = useState([]);
  const [unavailabilities, setUnavailabilities] = useState([]);
  const [scheduleState, setScheduleState] = useState(initialScheduleState);
  const [publishedVersions, setPublishedVersions] = useState([]);
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  const sundays = useMemo(() => getSundaysForMonth(year, monthIndex), [year, monthIndex]);
  const month = monthIndex + 1;
  const currentMonthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;
  const isPublished = scheduleState.status === 'published';
  const isBusy = Boolean(busyAction);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError('');
    setNotification(null);

    api.loadMonth(year, month, { signal: controller.signal })
      .then(data => {
        setVolunteers(data.volunteers);
        setUnavailabilities(data.unavailabilities);
        setScheduleState({
          ...initialScheduleState,
          ...data.schedule,
          matrix: ensureScheduleSlots(data.schedule.matrix, sundays, SHIFTS, ROLES)
        });
        setPublishedVersions(data.versions || []);
      })
      .catch(error => {
        if (error.name !== 'AbortError') setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [year, month, sundays, reloadToken]);

  function notify(type, message) {
    setNotification({ type, message });
  }

  async function runMutation(action, operation) {
    if (isBusy) return false;
    setBusyAction(action);
    setNotification(null);
    try {
      await operation();
      return true;
    } catch (error) {
      notify('error', error.message);
      return false;
    } finally {
      setBusyAction('');
    }
  }

  function handleMonthChange(delta) {
    const next = new Date(Date.UTC(year, monthIndex + delta, 1));
    setYear(next.getUTCFullYear());
    setMonthIndex(next.getUTCMonth());
  }

  async function persistSchedule(candidate, successMessage) {
    if (!candidate.id) throw new Error('Gere a escala para criar o rascunho antes de fazer ajustes manuais.');
    const remote = await api.saveSchedule(candidate.id, {
      year,
      month,
      matrix: candidate.matrix,
      lockedSlots: candidate.lockedSlots,
      warnings: candidate.warnings
    });
    setScheduleState(mergeScheduleResponse(remote, candidate, sundays));
    if (successMessage) notify('success', successMessage);
  }

  async function handleScheduleChange(date, shift, role, volunteerId, type = 'main') {
    if (isPublished) {
      notify('warning', 'Reabra a escala antes de editar alocações.');
      return false;
    }
    const validationError = validateScheduleChange({
      schedule: scheduleState.matrix,
      volunteers,
      unavailabilities,
      sundays,
      date,
      shift,
      role,
      volunteerId,
      type
    });
    if (validationError) {
      notify('warning', validationError);
      return false;
    }

    const candidate = {
      ...scheduleState,
      matrix: updateScheduleSlot(scheduleState.matrix, date, shift, role, volunteerId, type)
    };
    candidate.warnings = collectScheduleWarnings({
      schedule: candidate.matrix,
      sundays,
      shifts: SHIFTS,
      roles: ROLES,
      volunteers
    });
    return runMutation('saving-schedule', () => persistSchedule(candidate, 'Alocação salva no rascunho.'));
  }

  async function handleToggleLockSlot(date, shift, role) {
    if (isPublished) {
      notify('warning', 'Reabra a escala antes de alterar vagas travadas.');
      return;
    }
    const key = `${date}:${shift}:${role}`;
    const lockedSlots = scheduleState.lockedSlots.includes(key)
      ? scheduleState.lockedSlots.filter(item => item !== key)
      : [...scheduleState.lockedSlots, key];
    const candidate = { ...scheduleState, lockedSlots };
    await runMutation('saving-locks', () => persistSchedule(candidate, 'Vagas travadas atualizadas.'));
  }

  async function handleGenerateAutoSchedule() {
    if (isPublished) {
      notify('warning', 'Reabra a escala antes de gerar uma nova proposta.');
      return;
    }
    await runMutation('generating', async () => {
      const generated = await api.generateSchedule({
        year,
        month,
        lockedSlots: scheduleState.lockedSlots,
        matrix: scheduleState.matrix
      });
      const next = mergeScheduleResponse(generated, scheduleState, sundays);
      next.warnings = [...new Set([
        ...(generated.warnings || []),
        ...collectScheduleWarnings({
          schedule: next.matrix,
          sundays,
          shifts: SHIFTS,
          roles: ROLES,
          volunteers
        })
      ])];
      setScheduleState(next);
      notify(next.warnings.length ? 'warning' : 'success', next.warnings.length
        ? `Proposta gerada com ${next.warnings.length} alerta(s) para revisão.`
        : 'Nova proposta de escala gerada e persistida com sucesso.');
    });
  }

  async function handlePublishOrReopen() {
    if (!scheduleState.id) {
      notify('warning', 'Gere uma escala antes de publicar.');
      return;
    }

    if (isPublished) {
      if (!window.confirm('Reabrir esta escala? Ela voltará a ser um rascunho editável.')) return;
      await runMutation('reopening', async () => {
        const remote = await api.reopenSchedule(scheduleState.id);
        setScheduleState(mergeScheduleResponse(remote, { ...scheduleState, status: 'draft' }, sundays));
        notify('success', 'Escala reaberta para edição.');
      });
      return;
    }

    const warnings = [...new Set([
      ...scheduleState.warnings,
      ...collectScheduleWarnings({
        schedule: scheduleState.matrix,
        sundays,
        shifts: SHIFTS,
        roles: ROLES,
        volunteers
      })
    ])];
    const warningText = warnings.length
      ? `\n\nAlertas que serão confirmados e registrados:\n- ${warnings.join('\n- ')}`
      : '';
    if (!window.confirm(`Publicar ${currentMonthLabel} como escala oficial?${warningText}`)) return;

    await runMutation('publishing', async () => {
      const remote = await api.publishSchedule(scheduleState.id, {
        warnings,
        confirmedWarnings: warnings.length > 0
      });
      setScheduleState(mergeScheduleResponse(remote, { ...scheduleState, status: 'published', warnings }, sundays));
      setPublishedVersions(await api.getScheduleVersions(scheduleState.id));
      notify('success', 'Escala publicada. PDF e WhatsApp oficiais estão liberados.');
    });
  }

  async function handleAddVolunteer(newVolunteer) {
    return runMutation('creating-volunteer', async () => {
      const created = await api.createVolunteer(newVolunteer);
      setVolunteers(current => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      notify('success', 'Voluntário cadastrado.');
    });
  }

  async function handleUpdateProficiency(volunteerId, role, level) {
    const volunteer = volunteers.find(item => String(item.id) === String(volunteerId));
    if (!volunteer) return false;
    const proficiencies = { ...volunteer.proficiencies, [role]: level };
    return runMutation('updating-volunteer', async () => {
      await api.updateProficiencies(volunteerId, proficiencies);
      setVolunteers(current => current.map(item => String(item.id) === String(volunteerId)
        ? { ...item, proficiencies }
        : item));
      notify('success', 'Proficiência atualizada.');
    });
  }

  async function handleUpdateAllowedShift(volunteerId, allowedShift) {
    return runMutation('updating-volunteer', async () => {
      const updated = await api.updateVolunteer(volunteerId, { allowedShift });
      setVolunteers(current => current.map(item => String(item.id) === String(volunteerId) ? updated : item));
      notify('success', 'Turno permitido atualizado.');
    });
  }

  async function handleUpdateVolunteer(volunteerId, changes) {
    return runMutation('updating-volunteer', async () => {
      const updated = await api.updateVolunteer(volunteerId, changes);
      setVolunteers(current => current.map(item => String(item.id) === String(volunteerId) ? updated : item));
      notify('success', 'Dados do voluntário atualizados.');
    });
  }

  async function handleToggleVolunteerStatus(volunteerId) {
    const volunteer = volunteers.find(item => String(item.id) === String(volunteerId));
    if (!volunteer) return;
    await runMutation('updating-volunteer', async () => {
      const updated = await api.updateVolunteer(volunteerId, { active: !volunteer.active });
      setVolunteers(current => current.map(item => String(item.id) === String(volunteerId) ? updated : item));
      notify('success', updated.active ? 'Voluntário reativado.' : 'Voluntário inativado e preservado no histórico.');
    });
  }

  async function handleAddUnavailability(newUnavailability) {
    return runMutation('creating-unavailability', async () => {
      const created = await api.createUnavailability(newUnavailability);
      setUnavailabilities(current => [...current, created].sort((a, b) => a.date.localeCompare(b.date)));
      notify('success', 'Indisponibilidade registrada.');
    });
  }

  async function handleRemoveUnavailability(id) {
    if (!window.confirm('Remover esta indisponibilidade?')) return;
    await runMutation('deleting-unavailability', async () => {
      await api.deleteUnavailability(id);
      setUnavailabilities(current => current.filter(item => String(item.id) !== String(id)));
      notify('success', 'Indisponibilidade removida.');
    });
  }

  return (
    <div className="app-container">
      <DashboardHeader
        currentMonth={currentMonthLabel}
        status={scheduleState.status}
        activeTab={activeTab}
        onMonthChange={handleMonthChange}
        onToggleStatus={handlePublishOrReopen}
        onGenerateAuto={handleGenerateAutoSchedule}
        onTabChange={setActiveTab}
        onOpenPdfModal={() => setActiveTab('print')}
        disabled={loading || isBusy}
        busyAction={busyAction}
        hasSchedule={Boolean(scheduleState.id)}
      />

      {notification && (
        <div className={`app-notification ${notification.type}`} role="status">
          <div>
            {notification.type === 'success' ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            <span>{notification.message}</span>
          </div>
          <button onClick={() => setNotification(null)} aria-label="Fechar aviso"><X size={18} /></button>
        </div>
      )}

      <main className="main-content">
        {loading ? (
          <div className="app-state glass-panel"><LoaderCircle className="spin" size={30} /><p>Carregando dados de {currentMonthLabel}…</p></div>
        ) : loadError ? (
          <div className="app-state app-state-error glass-panel">
            <AlertTriangle size={30} />
            <h2>Não foi possível carregar o painel</h2>
            <p>{loadError}</p>
            <button className="btn btn-primary" onClick={() => setReloadToken(value => value + 1)}><RefreshCw size={16} /> Tentar novamente</button>
          </div>
        ) : (
          <>
            {activeTab === 'schedule' && (
              <ScheduleMatrix
                sundays={sundays}
                shifts={SHIFTS}
                roles={ROLES}
                volunteers={volunteers}
                schedule={scheduleState.matrix}
                unavailabilities={unavailabilities}
                lockedSlots={scheduleState.lockedSlots}
                onScheduleChange={handleScheduleChange}
                onGenerateAuto={handleGenerateAutoSchedule}
                onToggleLockSlot={handleToggleLockSlot}
                readOnly={isPublished || isBusy}
              />
            )}

            {activeTab === 'volunteers' && (
              <VolunteerManager
                volunteers={volunteers}
                roles={ROLES}
                onUpdateProficiency={handleUpdateProficiency}
                onUpdateAllowedShift={handleUpdateAllowedShift}
                onUpdateVolunteer={handleUpdateVolunteer}
                onAddVolunteer={handleAddVolunteer}
                onToggleVolunteerStatus={handleToggleVolunteerStatus}
                disabled={isBusy}
              />
            )}

            {activeTab === 'unavailability' && (
              <UnavailabilityManager
                unavailabilities={unavailabilities}
                volunteers={volunteers}
                sundays={sundays}
                shifts={SHIFTS}
                onAddUnavailability={handleAddUnavailability}
                onRemoveUnavailability={handleRemoveUnavailability}
                disabled={isBusy}
              />
            )}

            {activeTab === 'print' && (
              <PdfExporter
                schedule={scheduleState.matrix}
                volunteers={volunteers}
                sundays={sundays}
                shifts={SHIFTS}
                roles={ROLES}
                monthLabel={currentMonthLabel}
                status={scheduleState.status}
                version={scheduleState.publishedVersion}
                versions={publishedVersions}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
