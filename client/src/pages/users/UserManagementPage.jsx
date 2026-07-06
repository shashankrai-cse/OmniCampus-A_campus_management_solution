import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import api from '../../api/client.js';
import { DEPARTMENTS } from '../../constants.js';

const ROLE_COLORS = {
  student: { bg: '#dbeafe', text: '#1e40af', dot: '#3b82f6' },
  teacher: { bg: '#ede9fe', text: '#6d28d9', dot: '#8b5cf6' },
  admin:   { bg: '#fef3c7', text: '#b45309', dot: '#f59e0b' },
};

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #667eea, #764ba2)',
  'linear-gradient(135deg, #f093fb, #f5576c)',
  'linear-gradient(135deg, #4facfe, #00f2fe)',
  'linear-gradient(135deg, #43e97b, #38f9d7)',
  'linear-gradient(135deg, #fa709a, #fee140)',
  'linear-gradient(135deg, #a18cd1, #fbc2eb)',
  'linear-gradient(135deg, #fccb90, #d57eeb)',
  'linear-gradient(135deg, #e0c3fc, #8ec5fc)',
];

function getAvatarGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export default function UserManagementPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Filtering state
  const [filterDept, setFilterDept] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterRole, setFilterRole] = useState('');

  // Editing state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({ fullName: '', department: '', enrollmentYear: '', section: '', rollNumber: '' });

  // Bulk Promote state
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({ targetDepartment: '', targetYear: '', targetSection: '', newYear: '', newSection: '' });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const { data } = await api.get('/users');
      setUsers(data.data.users);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Are you sure you want to permanently delete this user?')) return;
    try {
      await api.delete(`/users/${id}`);
      setUsers(users.filter(u => u._id !== id));
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to delete user');
    }
  }

  function startEdit(usr) {
    setEditingUser(usr);
    setEditForm({
      fullName: usr.fullName || '',
      department: usr.department || '',
      enrollmentYear: usr.enrollmentYear || '',
      section: usr.section || '',
      rollNumber: usr.rollNumber || ''
    });
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    try {
      await api.put(`/users/${editingUser._id}`, editForm);
      setEditingUser(null);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update user');
    }
  }

  async function handleBulkPromoteSubmit(e) {
    e.preventDefault();
    try {
      const payload = {
        targetDepartment: bulkForm.targetDepartment,
        targetYear: bulkForm.targetYear ? Number(bulkForm.targetYear) : null
      };
      if (bulkForm.targetSection) payload.targetSection = bulkForm.targetSection;
      if (bulkForm.newYear) payload.newYear = Number(bulkForm.newYear);
      if (bulkForm.newSection) payload.newSection = bulkForm.newSection;

      const { data } = await api.post('/users/bulk-promote', payload);
      alert(data.message);
      setShowBulkModal(false);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to run bulk action');
    }
  }

  const addFileInputRef = useRef(null);
  const removeFileInputRef = useRef(null);

  const handleBulkAddCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) return alert('Invalid CSV format. Needs headers and data.');
      
      const headers = lines[0].split(',').map(h => h.trim());
      const usersData = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const userObj = {};
        headers.forEach((h, idx) => {
          if (values[idx]) userObj[h] = values[idx];
        });
        if (userObj.email && userObj.fullName && userObj.password) {
          usersData.push(userObj);
        }
      }
      
      if (usersData.length === 0) return alert('No valid users found in CSV.');
      
      try {
        const { data } = await api.post('/users/bulk-add', usersData);
        alert(data.message + (data.errors ? '\nErrors: ' + data.errors.join(', ') : ''));
        fetchUsers();
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to bulk add users.');
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const handleBulkRemoveCsv = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 2) return alert('Invalid CSV format. Needs header and data.');
      
      const headers = lines[0].split(',').map(h => h.trim());
      if (headers[0] !== 'email') return alert('CSV header must be exactly "email".');
      
      const emails = [];
      for (let i = 1; i < lines.length; i++) {
        const email = lines[i].split(',')[0]?.trim();
        if (email) emails.push(email);
      }
      
      if (emails.length === 0) return alert('No valid emails found in CSV.');
      
      if (!window.confirm(`Are you sure you want to bulk delete ${emails.length} users?`)) {
        e.target.value = null;
        return;
      }

      try {
        const { data } = await api.post('/users/bulk-remove', emails);
        alert(data.message);
        fetchUsers();
      } catch (err) {
        alert(err.response?.data?.message || 'Failed to bulk remove users.');
      }
      e.target.value = null;
    };
    reader.readAsText(file);
  };

  const filteredUsers = users.filter(u => {
    if (filterDept && u.department !== filterDept) return false;
    if (filterYear && String(u.enrollmentYear) !== filterYear) return false;
    if (filterSection && u.section !== filterSection) return false;
    if (filterRole && u.role !== filterRole) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!u.fullName.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Summary stats
  const totalStudents = users.filter(u => u.role === 'student').length;
  const totalTeachers = users.filter(u => u.role === 'teacher').length;
  const totalAdmins = users.filter(u => u.role === 'admin').length;

  return (
    <div className="mod-container animate-fade-in" style={{ maxWidth: '1200px', margin: '0 auto' }}>

      {/* ─── Header ─── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
        <div>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #667eea, #764ba2)', fontSize: '1.2rem' }}>👥</span>
            People Directory
          </h2>
          <p style={{ fontSize: '0.95rem', color: '#6b7280', marginTop: '0.4rem', fontWeight: 500 }}>
            Manage campus roster, update student records, and handle promotions
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <input type="file" accept=".csv" ref={addFileInputRef} style={{ display: 'none' }} onChange={handleBulkAddCsv} />
          <input type="file" accept=".csv" ref={removeFileInputRef} style={{ display: 'none' }} onChange={handleBulkRemoveCsv} />
          
          <button 
            className="btn-outline"
            onClick={() => addFileInputRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', color: '#059669', borderColor: '#34d399' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            Add (CSV)
          </button>

          <button 
            className="btn-outline"
            onClick={() => removeFileInputRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: '#fff', color: '#dc2626', borderColor: '#fca5a5' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Remove (CSV)
          </button>

          <button 
            className="btn-primary"
            onClick={() => setShowBulkModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', boxShadow: '0 8px 16px rgba(17,24,39,0.15)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            Bulk Promote
          </button>
        </div>
      </div>

      {/* ─── Summary Stats ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Users', value: users.length, color: '#111827', bg: '#f9fafb', icon: '👥' },
          { label: 'Students', value: totalStudents, color: '#1e40af', bg: '#eff6ff', icon: '🎓' },
          { label: 'Teachers', value: totalTeachers, color: '#6d28d9', bg: '#f5f3ff', icon: '📚' },
          { label: 'Admins', value: totalAdmins, color: '#b45309', bg: '#fffbeb', icon: '🛡️' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: stat.bg, borderRadius: '14px', padding: '1.2rem 1.5rem',
            border: '1px solid rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', gap: '1rem'
          }}>
            <span style={{ fontSize: '1.8rem' }}>{stat.icon}</span>
            <div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600, marginTop: '0.15rem' }}>{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ─── Search & Filters ─── */}
      <div style={{
        display: 'flex', gap: '0.75rem', flexWrap: 'wrap', background: '#fff',
        borderRadius: '14px', padding: '1rem 1.25rem', border: '1px solid rgba(0,0,0,0.06)',
        marginBottom: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.02)', alignItems: 'center'
      }}>
        {/* Search */}
        <div style={{ 
          flex: '1 1 220px', display: 'flex', alignItems: 'center', gap: '0.5rem', 
          background: '#f9fafb', borderRadius: '8px', padding: '0.55rem 0.8rem', border: '1px solid #e5e7eb'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input 
            placeholder="Search by name or email..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)}
            style={{ border: 'none', background: 'transparent', outline: 'none', width: '100%', fontSize: '0.9rem', color: '#111827' }}
          />
        </div>

        {/* Role Filter */}
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{
          padding: '0.55rem 0.8rem', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.85rem',
          color: '#374151', background: '#f9fafb', cursor: 'pointer', fontWeight: 500
        }}>
          <option value="">All Roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="admin">Admins</option>
        </select>

        {/* Department Filter */}
        <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{
          padding: '0.55rem 0.8rem', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.85rem',
          color: '#374151', background: '#f9fafb', cursor: 'pointer', fontWeight: 500
        }}>
          <option value="">All Depts</option>
          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        {/* Year & Section */}
        <input type="number" placeholder="Year" min="1" max="6" value={filterYear} onChange={e => setFilterYear(e.target.value)} style={{
          padding: '0.55rem 0.8rem', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.85rem',
          color: '#374151', background: '#f9fafb', width: '80px', fontWeight: 500
        }} />
        <input placeholder="Sec" value={filterSection} onChange={e => setFilterSection(e.target.value)} style={{
          padding: '0.55rem 0.8rem', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.85rem',
          color: '#374151', background: '#f9fafb', width: '70px', fontWeight: 500
        }} />

        {/* Clear */}
        {(filterDept || filterYear || filterSection || filterRole || searchQuery) && (
          <button onClick={() => { setFilterDept(''); setFilterYear(''); setFilterSection(''); setFilterRole(''); setSearchQuery(''); }} style={{
            padding: '0.55rem 0.8rem', borderRadius: '8px', background: '#fee2e2', color: '#dc2626',
            border: '1px solid #fecaca', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.3rem'
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            Clear
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#9ca3af', fontWeight: 600 }}>
          {filteredUsers.length} result{filteredUsers.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* ─── User Cards Grid ─── */}
      {loading ? (
        <div className="mod-spinner-wrap"><div className="mod-spinner"/></div>
      ) : filteredUsers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', background: 'rgba(255,255,255,0.5)', borderRadius: '16px', border: '1px dashed rgba(0,0,0,0.1)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" style={{ margin: '0 auto 1rem' }}><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>
          <div style={{ color: '#4b5563', fontSize: '1.1rem', fontWeight: 600 }}>No Users Found</div>
          <div style={{ color: '#9ca3af', fontSize: '0.9rem', marginTop: '0.4rem' }}>Try adjusting your search or filter criteria</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {filteredUsers.map(u => {
            const roleStyle = ROLE_COLORS[u.role] || ROLE_COLORS.student;
            return (
              <div key={u._id} style={{
                background: '#fff', borderRadius: '16px', padding: '1.5rem', border: '1px solid rgba(0,0,0,0.05)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.02)', transition: 'all 0.2s ease',
                position: 'relative', overflow: 'hidden'
              }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 30px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.02)'; e.currentTarget.style.transform = 'translateY(0)'; }}
              >
                {/* Accent stripe */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', background: roleStyle.dot }} />
                
                {/* Top: Avatar + Info */}
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                  {/* Avatar */}
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '14px', flexShrink: 0,
                    background: getAvatarGradient(u.fullName),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em'
                  }}>
                    {u.fullName.charAt(0).toUpperCase()}
                  </div>

                  {/* Name & Email */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.fullName}</h3>
                      <span style={{
                        display: 'inline-flex', padding: '0.15rem 0.5rem', borderRadius: '99px', fontSize: '0.65rem',
                        fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                        background: roleStyle.bg, color: roleStyle.text
                      }}>
                        {u.role}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#6b7280', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.email}
                    </div>
                  </div>
                </div>

                {/* Details row */}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem' }}>
                  {u.department && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', borderRadius: '8px', background: '#f3f4f6', fontSize: '0.78rem', fontWeight: 600, color: '#374151' }}>
                      🏛️ {u.department}
                    </span>
                  )}
                  {u.role === 'student' && u.enrollmentYear && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', borderRadius: '8px', background: '#eff6ff', fontSize: '0.78rem', fontWeight: 600, color: '#1e40af' }}>
                      📅 Year {u.enrollmentYear}
                    </span>
                  )}
                  {u.role === 'student' && u.section && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', borderRadius: '8px', background: '#f0fdf4', fontSize: '0.78rem', fontWeight: 600, color: '#166534' }}>
                      🔤 Sec {u.section}
                    </span>
                  )}
                  {u.role === 'student' && u.rollNumber && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', borderRadius: '8px', background: '#fef3c7', fontSize: '0.78rem', fontWeight: 600, color: '#b45309' }}>
                      # {u.rollNumber}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', paddingTop: '0.8rem', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
                  <button onClick={() => startEdit(u)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    padding: '0.5rem', borderRadius: '8px', background: '#eff6ff', color: '#2563eb',
                    border: '1px solid #bfdbfe', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </button>
                  <button onClick={() => handleDelete(u._id)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                    padding: '0.5rem', borderRadius: '8px', background: '#fef2f2', color: '#dc2626',
                    border: '1px solid #fecaca', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Edit Modal ─── */}
      {editingUser && (
        <div className="dash-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="auth-card" style={{ width: '100%', maxWidth: '480px', padding: '2.5rem', borderRadius: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              <div style={{
                width: '44px', height: '44px', borderRadius: '12px',
                background: getAvatarGradient(editingUser.fullName),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.1rem', fontWeight: 800, color: '#fff'
              }}>
                {editingUser.fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#111827' }}>Edit Profile</h3>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>{editingUser.email}</p>
              </div>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              <div className="auth-field">
                <label>Full Name</label>
                <div className="auth-input-wrap"><input required value={editForm.fullName} onChange={e => setEditForm({...editForm, fullName: e.target.value})} /></div>
              </div>

              {editingUser.role === 'student' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="auth-field">
                      <label>Department</label>
                      <div className="auth-input-wrap">
                        <select value={editForm.department} onChange={e => setEditForm({...editForm, department: e.target.value})} style={{ width: '100%', border: 'none', background: 'transparent' }}>
                          <option value="">Select</option>
                          {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="auth-field">
                      <label>Year</label>
                      <div className="auth-input-wrap"><input type="number" min="1" max="6" value={editForm.enrollmentYear} onChange={e => setEditForm({...editForm, enrollmentYear: e.target.value})} /></div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div className="auth-field">
                      <label>Section</label>
                      <div className="auth-input-wrap"><input value={editForm.section} onChange={e => setEditForm({...editForm, section: e.target.value})} placeholder="e.g. A" /></div>
                    </div>
                    <div className="auth-field">
                      <label>Roll Number</label>
                      <div className="auth-input-wrap"><input value={editForm.rollNumber} onChange={e => setEditForm({...editForm, rollNumber: e.target.value})} placeholder="e.g. 2201" /></div>
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn-outline" onClick={() => setEditingUser(null)} style={{ background: '#fff' }}>Cancel</button>
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Bulk Promote Modal ─── */}
      {showBulkModal && (
        <div className="dash-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="auth-card" style={{ width: '100%', maxWidth: '560px', padding: '2.5rem', borderRadius: '1.5rem', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.5rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', fontSize: '1.2rem' }}>⚡</span>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, color: '#111827' }}>Bulk Promote Section</h3>
            </div>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
              Select a target demographic of students and instantly upgrade their year or re-assign their section globally.
            </p>
            
            <form onSubmit={handleBulkPromoteSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
              {/* Target Selection */}
              <div style={{ background: '#fef2f2', borderRadius: '12px', padding: '1rem', border: '1px solid #fecaca' }}>
                <label style={{ display: 'block', fontWeight: 700, color: '#dc2626', marginBottom: '0.8rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Target Selection</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="auth-field">
                    <label style={{ fontSize: '0.8rem' }}>Department *</label>
                    <div className="auth-input-wrap">
                      <select required value={bulkForm.targetDepartment} onChange={e => setBulkForm({...bulkForm, targetDepartment: e.target.value})} style={{ width: '100%', border: 'none', background: 'transparent' }}>
                        <option value="">Select...</option>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="auth-field">
                    <label style={{ fontSize: '0.8rem' }}>Year *</label>
                    <div className="auth-input-wrap"><input required type="number" min="1" max="6" placeholder="e.g. 1" value={bulkForm.targetYear} onChange={e => setBulkForm({...bulkForm, targetYear: e.target.value})} /></div>
                  </div>
                </div>
                <div className="auth-field" style={{ marginTop: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem' }}>Section (Optional)</label>
                  <div className="auth-input-wrap"><input placeholder="Limit to section e.g. A" value={bulkForm.targetSection} onChange={e => setBulkForm({...bulkForm, targetSection: e.target.value})} /></div>
                </div>
              </div>

              {/* Promotion Action */}
              <div style={{ background: '#f0fdf4', borderRadius: '12px', padding: '1rem', border: '1px solid #bbf7d0' }}>
                <label style={{ display: 'block', fontWeight: 700, color: '#166534', marginBottom: '0.8rem', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Promote To</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="auth-field">
                    <label style={{ fontSize: '0.8rem' }}>New Year</label>
                    <div className="auth-input-wrap"><input type="number" min="1" max="6" placeholder="Leave blank to skip" value={bulkForm.newYear} onChange={e => setBulkForm({...bulkForm, newYear: e.target.value})} /></div>
                  </div>
                  <div className="auth-field">
                    <label style={{ fontSize: '0.8rem' }}>New Section</label>
                    <div className="auth-input-wrap"><input placeholder="Leave blank to skip" value={bulkForm.newSection} onChange={e => setBulkForm({...bulkForm, newSection: e.target.value})} /></div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn-outline" onClick={() => setShowBulkModal(false)} style={{ background: '#fff' }}>Cancel</button>
                <button type="submit" className="btn-primary" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>Execute Promotion</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
