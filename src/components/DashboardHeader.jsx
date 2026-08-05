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
  Grid
} from 'lucide-react';

export const DashboardHeader = ({
  currentMonth,
  status,
  activeTab,
  onMonthChange,
  onToggleStatus,
  onGenerateAuto,
  onTabChange,
  onOpenPdfModal
}) => {
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
            >
              <ChevronLeft size={18} />
            </button>
            <span className="month-display">{currentMonth}</span>
            <button 
              className="month-btn" 
              onClick={() => onMonthChange(1)} 
              title="Próximo Mês"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Status Badge & Toggle Button */}
          <div 
            className={`status-badge ${status}`} 
            onClick={onToggleStatus}
            style={{ cursor: 'pointer' }}
            title="Clique para alternar entre Rascunho e Publicado"
          >
            <span className="status-dot"></span>
            {status === 'draft' ? (
              <>
                <AlertCircle size={14} /> Rascunho
              </>
            ) : (
              <>
                <CheckCircle2 size={14} /> Publicado
              </>
            )}
          </div>

          {/* Action Buttons */}
          <button className="btn btn-secondary" onClick={onGenerateAuto}>
            <Sparkles size={16} />
            Gerar Automático (IA)
          </button>

          <button className="btn btn-primary" onClick={onOpenPdfModal}>
            <Download size={16} />
            Exportação PDF
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="header-tabs">
        <button
          className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => onTabChange('schedule')}
        >
          <Grid size={16} />
          Matriz de Escala
        </button>

        <button
          className={`tab-btn ${activeTab === 'volunteers' ? 'active' : ''}`}
          onClick={() => onTabChange('volunteers')}
        >
          <Users size={16} />
          Voluntários & Proficiências
        </button>

        <button
          className={`tab-btn ${activeTab === 'unavailability' ? 'active' : ''}`}
          onClick={() => onTabChange('unavailability')}
        >
          <Clock size={16} />
          Indisponibilidades
        </button>

        <button
          className={`tab-btn ${activeTab === 'print' ? 'active' : ''}`}
          onClick={() => onTabChange('print')}
        >
          <Printer size={16} />
          Visualização para Impressão
        </button>
      </nav>
    </header>
  );
};
