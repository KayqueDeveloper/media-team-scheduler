// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
import React from 'react';
import { 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Download, 
  Users, 
  Clock, 
  CheckCircle2, 
  AlertCircle,
  Printer,
  Grid,
  ArrowLeftRight,
  UserCheck,
  BellRing
} from 'lucide-react';

export const DashboardHeader = ({
  currentMonth,
  status,
  activeTab,
  onMonthChange,
  onToggleStatus,
  onGenerateAuto,
  onTabChange,
  onOpenPdfModal,
  disabled = false,
  busyAction = '',
  hasSchedule = false,
  onLogout,
  pendingCount = 0
}) => {
  const sectionLabels = {
    schedule: 'Matriz de Escala',
    volunteers: 'Voluntários & Proficiências',
    unavailability: 'Indisponibilidades',
    print: 'Visualização para Impressão',
    exchanges: 'Trocas',
    confirmations: 'Confirmações',
    registrations: `Cadastros${pendingCount > 0 ? ` (${pendingCount})` : ''}`
  };

  return (
    <header className="dashboard-header glass-panel">
      <div className="header-top">
        <div className="brand-section">
          <div className="brand-icon">
            <Sparkles size={24} />
          </div>
          <div className="brand-title">
            <h1>Escala de Transmissão</h1>
            <p>Painel Administrativo do Líder & Master Control</p>
          </div>
        </div>

        <div className="header-controls">
          {/* Month Selector */}
          <div className="month-selector">
            <button 
              className="month-btn" 
              onClick={() => onMonthChange(-1)} 
              title="Mês Anterior"
              aria-label="Mês anterior"
              disabled={disabled}
            >
              <ChevronLeft size={18} />
            </button>
            <span className="month-display">{currentMonth}</span>
            <button 
              className="month-btn" 
              onClick={() => onMonthChange(1)} 
              title="Próximo Mês"
              aria-label="Próximo mês"
              disabled={disabled}
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Status Badge & Toggle Button */}
          <button
            type="button"
            className={`status-badge ${status}`} 
            onClick={onToggleStatus}
            disabled={disabled || (!hasSchedule && status === 'draft')}
            title={status === 'draft' ? 'Publicar a escala' : 'Reabrir a escala para edição'}
          >
            <span className="status-dot"></span>
            {status === 'draft' ? (
              <><AlertCircle size={14} /> {busyAction === 'publishing' ? 'Publicando…' : 'Rascunho · Publicar'}</>
            ) : (
              <>
                <CheckCircle2 size={14} /> {busyAction === 'reopening' ? 'Reabrindo…' : 'Publicada · Reabrir'}
              </>
            )}
          </button>

          {/* Action Buttons */}
          <button className="btn btn-secondary" onClick={onGenerateAuto} disabled={disabled || status === 'published'}>
            <Sparkles size={16} />
            {busyAction === 'generating' ? 'Gerando…' : 'Gerar automaticamente'}
          </button>

          <button className="btn btn-primary" onClick={onOpenPdfModal} disabled={disabled}>
            <Download size={16} />
            Exportação PDF
          </button>
          <button className="btn btn-secondary" onClick={onLogout} disabled={disabled}>
            Sair
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <label className="mobile-section-nav">
        <span>Seção do painel</span>
        <select
          value={activeTab}
          onChange={event => onTabChange(event.target.value)}
          disabled={disabled}
          aria-label="Seção do painel"
        >
          {Object.entries(sectionLabels).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>

      <nav className="header-tabs">
        <button
          className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => onTabChange('schedule')}
          disabled={disabled}
        >
          <Grid size={16} />
          Matriz de Escala
        </button>

        <button
          className={`tab-btn ${activeTab === 'volunteers' ? 'active' : ''}`}
          onClick={() => onTabChange('volunteers')}
          disabled={disabled}
        >
          <Users size={16} />
          Voluntários & Proficiências
        </button>

        <button
          className={`tab-btn ${activeTab === 'unavailability' ? 'active' : ''}`}
          onClick={() => onTabChange('unavailability')}
          disabled={disabled}
        >
          <Clock size={16} />
          Indisponibilidades
        </button>

        <button
          className={`tab-btn ${activeTab === 'print' ? 'active' : ''}`}
          onClick={() => onTabChange('print')}
          disabled={disabled}
        >
          <Printer size={16} />
          Visualização para Impressão
        </button>

        <button
          className={`tab-btn ${activeTab === 'exchanges' ? 'active' : ''}`}
          onClick={() => onTabChange('exchanges')}
          disabled={disabled}
        >
          <ArrowLeftRight size={16} />
          Trocas
        </button>

        <button
          className={`tab-btn ${activeTab === 'confirmations' ? 'active' : ''}`}
          onClick={() => onTabChange('confirmations')}
          disabled={disabled}
        >
          <BellRing size={16} />
          Confirmações
        </button>

        <button
          className={`tab-btn ${activeTab === 'registrations' ? 'active' : ''}`}
          onClick={() => onTabChange('registrations')}
          disabled={disabled}
        >
          <UserCheck size={16} />
          Cadastros
          {pendingCount > 0 && <span className="tab-count">{pendingCount}</span>}
        </button>
      </nav>
    </header>
  );
};
