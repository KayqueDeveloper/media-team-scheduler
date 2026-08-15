// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Users,
  X
} from 'lucide-react';
import { formatScheduleDate, getRoleLabel, getShiftLabel } from '../domain/catalog';

const CONFIRMATION_LABELS = {
  NOT_REQUESTED: 'Lembrete ainda não enviado',
  AWAITING: 'Aguardando confirmação',
  CONFIRMED: 'Confirmado',
  EXCHANGE_PENDING: 'Troca pendente'
};

function whatsappUrl(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}`;
}

export function CoordinatorDashboard({ user, api, year, month, onSessionExpired }) {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [coverageDraft, setCoverageDraft] = useState(null);

  const canCoordinate = user?.role === 'LEADER' || user?.scopes?.includes('COORDINATOR');

  async function load(signal) {
    if (!canCoordinate) return;
    setLoading(true);
    setError('');
    try {
      setServices(await api.getCoordinatorServices(year, month, { signal }));
    } catch (nextError) {
      if (nextError.name === 'AbortError') return;
      if (nextError.status === 401) onSessionExpired?.();
      else setError(nextError.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [year, month, canCoordinate]);

  const totals = useMemo(
    () =>
      services.reduce(
        (summary, service) => {
          for (const member of service.team) {
            summary.total += 1;
            if (member.confirmationStatus === 'CONFIRMED') summary.confirmed += 1;
            if (member.coverageStatus === 'OPEN') summary.coverage += 1;
          }
          return summary;
        },
        { total: 0, confirmed: 0, coverage: 0 }
      ),
    [services]
  );

  async function perform(key, operation, { reload = true } = {}) {
    setBusy(key);
    setError('');
    try {
      const result = await operation();
      if (reload) await load();
      return result;
    } catch (nextError) {
      if (nextError.status === 401) onSessionExpired?.();
      else setError(nextError.message);
      return null;
    } finally {
      setBusy('');
    }
  }

  async function beginCoverage(member) {
    const result = await perform(
      `coverage:${member.assignmentId}`,
      async () => {
        const [candidates, currentRequest] = await Promise.all([
          api.getCoverageCandidates(member.assignmentId),
          member.coverageRequestId ? api.getCoverageRequest(member.coverageRequestId) : Promise.resolve(null)
        ]);
        const invited = new Set((currentRequest?.invitations || []).map((item) => String(item.volunteerId)));
        setCoverageDraft({
          assignmentId: member.assignmentId,
          member,
          request: currentRequest,
          candidates: candidates.filter((candidate) => !invited.has(String(candidate.id))),
          selectedIds: [],
          reason: currentRequest?.reason || 'Não respondeu às tentativas de contato.'
        });
      },
      { reload: false }
    );
    return result;
  }

  function toggleCandidate(candidateId) {
    setCoverageDraft((current) => {
      const id = String(candidateId);
      const selectedIds = current.selectedIds.includes(id)
        ? current.selectedIds.filter((item) => item !== id)
        : current.selectedIds.length < 5
          ? [...current.selectedIds, id]
          : current.selectedIds;
      return { ...current, selectedIds };
    });
  }

  async function submitCoverage(event) {
    event.preventDefault();
    if (!coverageDraft.selectedIds.length) return;
    const saved = await perform('coverage-submit', () =>
      coverageDraft.request
        ? api.addCoverageInvitations(coverageDraft.request.id, coverageDraft.selectedIds)
        : api.createCoverageRequest(coverageDraft.assignmentId, {
            reason: coverageDraft.reason,
            candidateIds: coverageDraft.selectedIds
          })
    );
    if (saved) setCoverageDraft(null);
  }

  async function cancelCoverage() {
    if (!coverageDraft?.request) return;
    const cancelled = await perform('coverage-cancel', () =>
      api.cancelCoverageRequest(coverageDraft.request.id)
    );
    if (cancelled) setCoverageDraft(null);
  }

  if (!canCoordinate) return null;

  return (
    <section className="glass-panel portal-card portal-wide coordinator-dashboard">
      <div className="portal-card-header coordinator-heading">
        <div>
          <p className="portal-kicker">Escopo de coordenação</p>
          <h2>
            <ShieldCheck size={20} /> Preparação dos cultos
          </h2>
        </div>
        <div className="coordinator-summary" aria-label="Resumo das confirmações">
          <span>{services.length} turno(s)</span>
          <span>
            {totals.confirmed}/{totals.total} confirmados
          </span>
          {totals.coverage > 0 && <span className="coverage-warning">{totals.coverage} cobertura(s)</span>}
        </div>
      </div>

      {error && (
        <div className="app-notification error" role="alert">
          <span>{error}</span>
        </div>
      )}
      {loading ? (
        <div className="app-state">
          <RefreshCw className="spin" size={24} />
          <p>Carregando equipes…</p>
        </div>
      ) : services.length === 0 ? (
        <p className="portal-muted">
          {user.role === 'LEADER'
            ? 'Nenhum turno publicado neste mês.'
            : 'Você não está escalado como coordenador em nenhum turno publicado deste mês.'}
        </p>
      ) : (
        <div className="coordinator-services">
          {services.map((service) => (
            <article
              className="coordinator-service"
              key={`${service.scheduleId}:${service.date}:${service.shift}`}
            >
              <header>
                <div>
                  <strong>
                    {formatScheduleDate(service.date)} · {getShiftLabel(service.shift)}
                  </strong>
                  <span>
                    <Users size={14} /> {service.team.length} pessoa(s) na equipe
                  </span>
                </div>
                <span className="portal-tag">
                  {service.team.filter((item) => item.confirmationStatus === 'CONFIRMED').length}/
                  {service.team.length} confirmados
                </span>
              </header>
              <div className="coordinator-team">
                {service.team.map((member) => {
                  const contactUrl = whatsappUrl(member.phone);
                  const confirmed = member.confirmationStatus === 'CONFIRMED';
                  return (
                    <div className="coordinator-team-row" key={member.assignmentId}>
                      <div className="coordinator-member">
                        <strong>{member.volunteerName}</strong>
                        <span>
                          {getRoleLabel(member.role)} · {member.isTrainee ? 'Treinando' : 'Principal'}
                        </span>
                        <small>
                          {CONFIRMATION_LABELS[member.confirmationStatus] || member.confirmationStatus}
                        </small>
                      </div>
                      <div className="coordinator-member-state">
                        <span
                          className={`portal-tag confirmation-${member.confirmationStatus.toLowerCase()}`}
                        >
                          {confirmed ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                          {confirmed
                            ? 'Confirmado'
                            : member.coverageStatus === 'OPEN'
                              ? 'Buscando cobertura'
                              : 'Pendente'}
                        </span>
                        {member.contactAttemptCount > 0 && (
                          <small>{member.contactAttemptCount} contato(s)</small>
                        )}
                      </div>
                      <div className="coordinator-member-actions">
                        {contactUrl && (
                          <a
                            className="icon-button"
                            href={contactUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle size={17} />
                          </a>
                        )}
                        {member.phone && (
                          <a className="icon-button" href={`tel:${member.phone}`} title="Ligar">
                            <Phone size={17} />
                          </a>
                        )}
                        {!confirmed && member.confirmationStatus !== 'EXCHANGE_PENDING' && (
                          <>
                            <button
                              className="btn btn-secondary btn-compact"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                perform(`contact:${member.assignmentId}`, () =>
                                  api.recordCoordinatorContact(member.assignmentId, { channel: 'WHATSAPP' })
                                )
                              }
                            >
                              <MessageCircle size={15} /> Registrar contato
                            </button>
                            <button
                              className="btn btn-secondary btn-compact"
                              disabled={Boolean(busy)}
                              onClick={() =>
                                perform(`confirm:${member.assignmentId}`, () =>
                                  api.confirmAssignmentManually(member.assignmentId)
                                )
                              }
                            >
                              <UserRoundCheck size={15} /> Confirmar
                            </button>
                            <button
                              className="btn btn-primary btn-compact"
                              disabled={Boolean(busy)}
                              onClick={() => beginCoverage(member)}
                            >
                              <Search size={15} />{' '}
                              {member.coverageStatus === 'OPEN' ? 'Ver cobertura' : 'Buscar cobertura'}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}

      {coverageDraft && (
        <form className="coverage-draft" onSubmit={submitCoverage}>
          <div className="coverage-draft-header">
            <div>
              <p className="portal-kicker">
                {coverageDraft.request ? 'Nova rodada' : 'Solicitação de cobertura'}
              </p>
              <h3>
                {coverageDraft.member.volunteerName} · {getRoleLabel(coverageDraft.member.role)}
              </h3>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setCoverageDraft(null)}
              title="Fechar"
            >
              <X size={18} />
            </button>
          </div>
          {coverageDraft.request && (
            <div className="coverage-current-request">
              <strong>Cobertura aberta por {coverageDraft.request.createdByName}</strong>
              <span>{coverageDraft.request.reason}</span>
              {coverageDraft.request.openedEarly && (
                <small className="coverage-warning">Abertura antecipada registrada</small>
              )}
              <small>
                {coverageDraft.request.invitations.filter((item) => item.status === 'PENDING').length}{' '}
                convite(s) aguardando
              </small>
            </div>
          )}
          {!coverageDraft.request && (
            <label>
              Motivo
              <textarea
                value={coverageDraft.reason}
                maxLength={500}
                required
                onChange={(event) =>
                  setCoverageDraft((current) => ({ ...current, reason: event.target.value }))
                }
              />
            </label>
          )}
          <fieldset>
            <legend>Convide até 5 voluntários elegíveis</legend>
            {coverageDraft.candidates.length === 0 ? (
              <p className="portal-muted">Nenhum novo voluntário elegível para esta rodada.</p>
            ) : (
              coverageDraft.candidates.map((candidate) => (
                <label className="coverage-candidate" key={candidate.id}>
                  <input
                    type="checkbox"
                    checked={coverageDraft.selectedIds.includes(String(candidate.id))}
                    onChange={() => toggleCandidate(candidate.id)}
                  />
                  <span>
                    <strong>{candidate.name}</strong>
                    <small>
                      N{candidate.proficiency_level} · {candidate.previous_assignments} escala(s) anteriores
                    </small>
                  </span>
                </label>
              ))
            )}
          </fieldset>
          <div className="coverage-draft-actions">
            {coverageDraft.request && (
              <button
                type="button"
                className="btn btn-secondary danger"
                onClick={cancelCoverage}
                disabled={Boolean(busy)}
              >
                Cancelar cobertura
              </button>
            )}
            <button
              className="btn btn-primary"
              disabled={Boolean(busy) || coverageDraft.selectedIds.length === 0}
            >
              <Search size={16} /> Enviar {coverageDraft.selectedIds.length || ''} convite(s)
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
