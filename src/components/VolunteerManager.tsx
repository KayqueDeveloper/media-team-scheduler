// @ts-nocheck -- Legacy compatibility module; migrate types incrementally at typed boundaries.
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
  UserPlus,
  Sun,
  Moon,
  Clock
} from 'lucide-react';

export const VolunteerManager = ({
  volunteers,
  roles,
  onUpdateProficiency,
  onUpdateAllowedShift,
  onUpdateVolunteer,
  onAddVolunteer,
  onToggleVolunteerStatus,
  disabled = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newVolName, setNewVolName] = useState('');
  const [newVolEmail, setNewVolEmail] = useState('');
  const [newVolPhone, setNewVolPhone] = useState('');
  const [newVolShift, setNewVolShift] = useState('ALL');
  const [editingVolunteerId, setEditingVolunteerId] = useState(null);

  const filteredVolunteers = volunteers.filter(v => 
    (v.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreateVolunteer = async (e) => {
    e.preventDefault();
    if (!newVolName.trim()) return;
    
    const details = {
      name: newVolName.trim(),
      email: newVolEmail.trim(),
      phone: newVolPhone.trim(),
      allowedShift: newVolShift
    };
    const saved = editingVolunteerId
      ? await onUpdateVolunteer(editingVolunteerId, details)
      : await onAddVolunteer({
          ...details,
          maxShiftsPerMonth: 2,
          active: true,
          proficiencies: {
            FREEHAND: 0,
            VMIX: 0,
            FIXED_CAM: 0,
            SWITCHER: 0,
            JIB: 0,
            COORDINATOR: 0
          }
        });

    if (!saved) return;
    setNewVolName('');
    setNewVolEmail('');
    setNewVolPhone('');
    setNewVolShift('ALL');
    setEditingVolunteerId(null);
    setIsAddModalOpen(false);
  };

  const openCreateModal = () => {
    setEditingVolunteerId(null);
    setNewVolName('');
    setNewVolEmail('');
    setNewVolPhone('');
    setNewVolShift('ALL');
    setIsAddModalOpen(true);
  };

  const openEditModal = (volunteer) => {
    setEditingVolunteerId(volunteer.id);
    setNewVolName(volunteer.name || '');
    setNewVolEmail(volunteer.email || '');
    setNewVolPhone(volunteer.phone || '');
    setNewVolShift(volunteer.allowedShift || 'ALL');
    setIsAddModalOpen(true);
  };

  return (
    <section className="manager-container glass-panel">
      <div className="manager-toolbar">
        <div>
          <h2>Gestão de Voluntários & Matriz de Proficiência</h2>
          <p>Cadastre voluntários, defina restrição de turnos (Manhã/Noite) e ajuste o nível técnico nas 6 funções.</p>
        </div>

        <div className="manager-toolbar-actions">
          <div className="search-box">
            <Search size={16} style={{ color: 'var(--text-muted)' }} />
            <input 
              type="text" 
              placeholder="Buscar por nome ou e-mail..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button className="btn btn-primary" onClick={openCreateModal} disabled={disabled}>
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

              <div className="volunteer-card-actions">
                <button
                  className="btn btn-outline"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => openEditModal(vol)}
                  disabled={disabled}
                  title="Editar dados do voluntário"
                >
                  <Sliders size={12} /> Editar
                </button>
                <button
                  className={`btn ${vol.active ? 'btn-outline' : 'btn-danger'}`}
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }}
                  onClick={() => onToggleVolunteerStatus(vol.id)}
                  disabled={disabled}
                  title="Alternar Ativo/Inativo"
                >
                  {vol.active ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                  {vol.active ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            </div>

            {/* Shift Restriction Lock Selector */}
            <div className="shift-restriction">
              <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Turno Permitido:</span>
              <div className="shift-restriction-actions">
                <button 
                  type="button"
                  className={`btn ${(vol.allowedShift || 'ALL') === 'ALL' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                  onClick={() => onUpdateAllowedShift && onUpdateAllowedShift(vol.id, 'ALL')}
                  disabled={disabled}
                  title="Pode servir em qualquer turno"
                >
                  <Clock size={12} /> Ambos
                </button>
                <button 
                  type="button"
                  className={`btn ${(vol.allowedShift || 'ALL') === 'MORNING' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                  onClick={() => onUpdateAllowedShift && onUpdateAllowedShift(vol.id, 'MORNING')}
                  disabled={disabled}
                  title="Travar voluntário APENAS no turno da Manhã"
                >
                  <Sun size={12} /> Manhã
                </button>
                <button 
                  type="button"
                  className={`btn ${(vol.allowedShift || 'ALL') === 'NIGHT' ? 'btn-primary' : 'btn-outline'}`}
                  style={{ padding: '0.2rem 0.45rem', fontSize: '0.72rem' }}
                  onClick={() => onUpdateAllowedShift && onUpdateAllowedShift(vol.id, 'NIGHT')}
                  disabled={disabled}
                  title="Travar voluntário APENAS no turno da Noite"
                >
                  <Moon size={12} /> Noite
                </button>
              </div>
            </div>

            <div className="proficiencies-list">
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                Níveis de Proficiência (Clique no nível ativo para remover / N0):
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
                          onClick={() => onUpdateProficiency(vol.id, role.id, currentLevel === lvl ? 0 : lvl)}
                          disabled={disabled}
                          title={currentLevel === lvl ? `Remover proficiência de ${role.name}` : `Definir Nível ${lvl} para ${role.name}`}
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
        <div className="modal-overlay" role="presentation">
          <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="volunteer-modal-title">
            <div className="modal-header">
              <h3 id="volunteer-modal-title">{editingVolunteerId ? 'Editar Voluntário' : 'Cadastrar Novo Voluntário'}</h3>
              <button type="button" className="close-btn" aria-label="Fechar diálogo" onClick={() => setIsAddModalOpen(false)}>✕</button>
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

              <div className="form-group">
                <label>Restrição de Turno</label>
                <select 
                  className="form-select"
                  value={newVolShift}
                  onChange={(e) => setNewVolShift(e.target.value)}
                >
                  <option value="ALL">Ambos os Turnos (Manhã e Noite)</option>
                  <option value="MORNING">Apenas Turno da Manhã (09h00)</option>
                  <option value="NIGHT">Apenas Turno da Noite (18h00)</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setIsAddModalOpen(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={disabled}>
                  {editingVolunteerId ? 'Salvar Alterações' : 'Salvar Cadastramento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
