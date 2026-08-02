import React, { useState } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  Star, 
  Mail, 
  Phone, 
  CheckCircle2, 
  XCircle,
  Sliders,
  UserPlus
} from 'lucide-react';

export const VolunteerManager = ({
  volunteers,
  roles,
  onUpdateProficiency,
  onAddVolunteer,
  onToggleVolunteerStatus
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newVolName, setNewVolName] = useState('');
  const [newVolEmail, setNewVolEmail] = useState('');
  const [newVolPhone, setNewVolPhone] = useState('');

  const filteredVolunteers = volunteers.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateVolunteer = (e) => {
    e.preventDefault();
    if (!newVolName.trim()) return;
    
    onAddVolunteer({
      name: newVolName,
      email: newVolEmail || `${newVolName.toLowerCase().replace(/\s+/g, '.')}@igreja.org`,
      phone: newVolPhone || '(11) 90000-0000',
      maxShiftsPerMonth: 4,
      active: true,
      proficiencies: {
        FREEHAND: 1,
        VMIX: 1,
        FIXED_CAM: 1,
        SWITCHER: 1,
        JIB: 1,
        COORDINATOR: 1
      }
    });

    setNewVolName('');
    setNewVolEmail('');
    setNewVolPhone('');
    setIsAddModalOpen(false);
  };

  return (
    <section className="manager-container glass-panel">
      <div className="manager-toolbar">
        <div>
          <h2>Gestão de Equipe & Matriz de Proficiência</h2>
          <p>Cadastre voluntários e ajuste o nível técnico (1 a 3) em cada uma das 6 funções de transmissão.</p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="search-box">
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Buscar por nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
            <UserPlus size={16} />
            Novo Voluntário
          </button>
        </div>
      </div>

      <div className="volunteers-grid">
        {filteredVolunteers.map(vol => (
          <div key={vol.id} className="volunteer-card">
            <div className="volunteer-card-header">
              <div className="volunteer-avatar-info">
                <div className="volunteer-avatar">
                  {vol.name.charAt(0)}
                </div>
                <div className="volunteer-name-details">
                  <h3>{vol.name}</h3>
                  <p><Mail size={12} style={{ display: 'inline', marginRight: 4 }} /> {vol.email}</p>
                </div>
              </div>

              <button 
                className={`btn ${vol.active ? 'btn-outline' : 'btn-danger'}`}
                style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                onClick={() => onToggleVolunteerStatus(vol.id)}
                title="Alternar Ativo/Inativo"
              >
                {vol.active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                {vol.active ? 'Ativo' : 'Inativo'}
              </button>
            </div>

            <div className="proficiencies-list">
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Níveis de Proficiência (1: Treinando | 2: Apto | 3: Sênior):
              </div>
              {roles.map(role => {
                const currentLevel = vol.proficiencies[role.id] || 0;
                return (
                  <div key={role.id} className="prof-row">
                    <span className="prof-role-name">{role.shortName}</span>
                    <div className="prof-rating-selector">
                      {[1, 2, 3].map(lvl => (
                        <button
                          key={lvl}
                          type="button"
                          className={`prof-star-btn ${currentLevel === lvl ? `active lvl-${lvl}` : ''}`}
                          onClick={() => onUpdateProficiency(vol.id, role.id, lvl)}
                          title={`Definir Nível ${lvl} para ${role.name}`}
                        >
                          N{lvl}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Modal Add Volunteer */}
      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Cadastrar Novo Voluntário</h3>
              <button className="close-btn" onClick={() => setIsAddModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateVolunteer}>
              <div className="form-group">
                <label>Nome Completo</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required
                  placeholder="Ex: João da Silva"
                  value={newVolName}
                  onChange={(e) => setNewVolName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>E-mail</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="Ex: joao.silva@igreja.org"
                  value={newVolEmail}
                  onChange={(e) => setNewVolEmail(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Telefone / WhatsApp</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Ex: (11) 98888-7777"
                  value={newVolPhone}
                  onChange={(e) => setNewVolPhone(e.target.value)}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setIsAddModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary">
                  Salvar Cadastramento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
