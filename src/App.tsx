// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, RefreshCw, X } from 'lucide-react';

import { api } from './api/client';
import { DashboardHeader } from './components/DashboardHeader';
import { PdfExporter } from './components/PdfExporter';
import { ScheduleMatrix } from './components/ScheduleMatrix';
import { UnavailabilityManager } from './components/UnavailabilityManager';
import { VolunteerManager } from './components/VolunteerManager';
import { LoginPage } from './components/LoginPage';
import { VolunteerPortal } from './components/VolunteerPortal';
import { AdminExchangeManager } from './components/AdminExchangeManager';
import { PasswordRecoveryPage } from './components/PasswordRecoveryPage';
import { PendingRegistrationManager } from './components/PendingRegistrationManager';
import { RegistrationPage } from './components/RegistrationPage';
import { ResetPasswordPage } from './components/ResetPasswordPage';
import { ServiceConfirmationPage } from './components/ServiceConfirmationPage';
import { AdminConfirmationManager } from './components/AdminConfirmationManager';
import { CoordinatorDashboard } from './components/CoordinatorDashboard';
import { getCurrentBusinessMonth, getSundaysForMonth, MONTH_NAMES, ROLES, SHIFTS } from './domain/catalog';
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
    lockedSlots: remote.lockedSlots !== undefined ? remote.lockedSlots : fallback.lockedSlots,
    warnings: remote.warnings !== undefined ? remote.warnings : fallback.warnings
  };
}

export function App() {
  const businessMonth = useMemo(() => getCurrentBusinessMonth(), []);
  const [monthIndex, setMonthIndex] = useState(businessMonth.monthIndex);
  const [year, setYear] = useState(businessMonth.year);
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
  const [adminExchanges, setAdminExchanges] = useState([]);
  const [serviceConfirmations, setServiceConfirmations] = useState([]);
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authPath, setAuthPath] = useState(() => window.location.pathname);
  const [recoveryEmail, setRecoveryEmail] = useState('');

  useEffect(() => {
    const syncPath = () => setAuthPath(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    return () => window.removeEventListener('popstate', syncPath);
  }, []);

  function navigateAuth(path) {
    window.history.pushState({}, '', path);
    setAuthPath(window.location.pathname);
  }

  useEffect(() => {
    api.getCurrentUser()
      .then(setAuthUser)
      .catch(error => {
        if (error.status !== 401) setAuthError(error.message);
        if (error.payload?.code === 'AUTH_APPROVAL_PENDING' && window.location.pathname !== '/redefinir-senha') {
          api.logout().catch(() => {});
        }
      })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => api.subscribeToAuthState(
    user => {
      setAuthUser(user);
      if (!user) setAuthError('');
    },
    error => {
      if (error.status === 401 || error.status === 403) {
        setAuthUser(null);
        setAuthError(error.message);
        if (error.payload?.code === 'AUTH_APPROVAL_PENDING' && window.location.pathname !== '/redefinir-senha') {
          api.logout().catch(() => {});
        }
      }
    }
  ), []);

  const sundays = useMemo(() => getSundaysForMonth(year, monthIndex), [year, monthIndex]);
  const month = monthIndex + 1;
  const currentMonthLabel = `${MONTH_NAMES[monthIndex]} ${year}`;
  const isPublished = scheduleState.status === 'published';
  const isBusy = Boolean(busyAction);
  const confirmationToken = authPath === '/confirmar-presenca'
    ? new URLSearchParams(window.location.search).get('token') || ''
    : '';

  useEffect(() => {
    if (!authUser || authUser.role !== 'LEADER') return undefined;
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
        if (error.name === 'AbortError') return;
        if (error.status === 401) {
          setAuthUser(null);
          setAuthError('Sua sessão expirou. Entre novamente para continuar.');
        } else {
          setLoadError(error.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [authUser, year, month, sundays, reloadToken]);

  useEffect(() => {
    if (!authUser || authUser.role !== 'LEADER') return undefined;
    let cancelled = false;
    Promise.all([api.getAdminExchanges(), api.getAdminServiceConfirmations(year, month)])
      .then(([items, confirmations]) => {
        if (!cancelled) {
          setAdminExchanges(items);
          setServiceConfirmations(confirmations);
        }
      })
      .catch(error => {
        if (!cancelled) {
          if (error.status === 401) {
            setAuthUser(null);
            setAuthError('Sua sessão expirou. Entre novamente para continuar.');
          }
          setAdminExchanges([]);
          setServiceConfirmations([]);
          if (error.status !== 401) {
            setNotification({ type: 'error', message: `Não foi possível carregar as trocas: ${error.message}` });
          }
        }
      });
    return () => { cancelled = true; };
  }, [authUser, year, month, reloadToken]);

  useEffect(() => {
    if (!authUser || authUser.role !== 'LEADER') return undefined;
    let cancelled = false;
    api.getPendingRegistrations()
      .then(items => { if (!cancelled) setPendingRegistrations(items); })
      .catch(error => {
        if (cancelled) return;
        setPendingRegistrations([]);
        if (error.status === 401) {
          setAuthUser(null);
          setAuthError('Sua sessão expirou. Entre novamente para continuar.');
        } else {
          setNotification({ type: 'error', message: `Não foi possível carregar os cadastros: ${error.message}` });
        }
      });
    return () => { cancelled = true; };
  }, [authUser, reloadToken]);

  async function handleLogin(email, password) {
    setAuthBusy(true);
    setAuthError('');
    try {
      setAuthUser(await api.login(email, password));
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleLogout() {
    try {
      await api.logout();
    } catch (error) {
      setAuthError(error.message);
    } finally {
      setAuthUser(null);
    }
  }

  if (authPath === '/confirmar-presenca') return <ServiceConfirmationPage token={confirmationToken} api={api} />;
  if (authLoading) return <div className="app-state"><LoaderCircle className="spin" size={30} /><p>Verificando acesso…</p></div>;
  if (!authUser && authPath === '/cadastro') return (
    <RegistrationPage
      onRegister={api.register}
      confirmed={new URLSearchParams(window.location.search).get('confirmado') === '1'}
      onBack={() => navigateAuth('/')}
      onRecover={email => {
        setRecoveryEmail(email);
        navigateAuth('/recuperar-senha');
      }}
    />
  );
  if (!authUser && authPath === '/recuperar-senha') return (
    <PasswordRecoveryPage initialEmail={recoveryEmail} onRequest={api.requestPasswordReset} onBack={() => navigateAuth('/')} />
  );
  if (authPath === '/redefinir-senha') return (
    <ResetPasswordPage
      onUpdate={api.updatePassword}
      onDone={async () => {
        await api.logout().catch(() => {});
        setAuthUser(null);
        setAuthError('Senha atualizada. Entre novamente para continuar.');
        navigateAuth('/');
      }}
    />
  );
  if (!authUser) return (
    <LoginPage
      onLogin={handleLogin}
      onOpenRegistration={() => navigateAuth('/cadastro')}
      onOpenRecovery={email => {
        setRecoveryEmail(email);
        navigateAuth('/recuperar-senha');
      }}
      error={authError}
      busy={authBusy}
    />
  );
  if (authUser.role === 'VOLUNTEER') return (
    <VolunteerPortal
      user={authUser}
      api={api}
      onLogout={handleLogout}
      onSessionExpired={() => {
        setAuthUser(null);
        setAuthError('Sua sessão expirou. Entre novamente para continuar.');
      }}
    />
  );

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
      if (error.status === 401) {
        setAuthUser(null);
        setAuthError('Sua sessão expirou. Entre novamente para continuar.');
      }
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

  async function handleUpdatePendingRegistration(id, changes) {
    return runMutation('updating-registration', async () => {
      const updated = await api.updatePendingRegistration(id, changes);
      setPendingRegistrations(current => current.map(item => item.id === id ? updated : item));
      notify('success', 'Cadastro pendente atualizado.');
    });
  }

  async function handleApprovePendingRegistration(id) {
    return runMutation('approving-registration', async () => {
      const { volunteer } = await api.approvePendingRegistration(id);
      setPendingRegistrations(current => current.filter(item => item.id !== id));
      setVolunteers(current => [...current.filter(item => item.id !== volunteer.id), volunteer]
        .sort((a, b) => a.name.localeCompare(b.name)));
      notify('success', 'Cadastro aprovado. O voluntário já pode acessar o portal.');
    });
  }

  async function handleRejectPendingRegistration(id) {
    return runMutation('rejecting-registration', async () => {
      await api.rejectPendingRegistration(id);
      setPendingRegistrations(current => current.filter(item => item.id !== id));
      notify('success', 'Cadastro rejeitado e excluído definitivamente.');
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
            onLogout={handleLogout}
        onOpenPdfModal={() => setActiveTab('print')}
        disabled={loading || isBusy}
        busyAction={busyAction}
        hasSchedule={Boolean(scheduleState.id)}
        pendingCount={pendingRegistrations.length}
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

            {activeTab === 'exchanges' && (
              <AdminExchangeManager exchanges={adminExchanges} />
            )}

            {activeTab === 'confirmations' && (
              <>
                <CoordinatorDashboard user={authUser} api={api} year={year} month={month} />
                <AdminConfirmationManager confirmations={serviceConfirmations} />
              </>
            )}

            {activeTab === 'registrations' && (
              <PendingRegistrationManager
                registrations={pendingRegistrations}
                onUpdate={handleUpdatePendingRegistration}
                onApprove={handleApprovePendingRegistration}
                onReject={handleRejectPendingRegistration}
                disabled={isBusy}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}
