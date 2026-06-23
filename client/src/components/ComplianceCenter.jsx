import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api';
import { 
  Cloud, Grid, Folder, Image as ImageIcon, ShieldCheck, 
  MapPin, Lock, FileKey, CheckCircle, Menu, X 
} from 'lucide-react';
import './Dashboard.css';

const ComplianceCenter = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  
  // Storage logic for sidebar (same as dashboard)
  const storageQuota = user?.storage_quota || (5 * 1024 * 1024 * 1024);
  const storageUsed = 0; // Mocked for UI simplicity here, but should fetch
  const storagePercent = 0;
  const storageQuotaFormatted = (storageQuota / (1024*1024*1024)).toFixed(0) + ' GB';
  const profilePhotoUrl = user?.profile_photo || `https://ui-avatars.com/api/?name=${user?.firstName || "M"}+${user?.lastName || "C"}&background=007aff&color=fff`;

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const fetchAuditLogs = async () => {
    try {
      // Mocking logs for now if endpoint isn't fully ready for frontend
      setLogs([
        { id: 1, action: 'LOGIN_SUCCESS', ip: '122.161.44.2', location: 'New Delhi, IN', time: 'Just now', status: 'Safe' },
        { id: 2, action: 'FILE_ENCRYPTED', resource: 'Q3_Tax_Report.pdf', location: 'Encrypted on Device', time: '1 hr ago', status: 'E2EE' },
        { id: 3, action: 'LOGIN_FAILED', ip: '104.28.12.3', location: 'London, UK (VPN)', time: '5 hrs ago', status: 'Blocked (DPDP)' },
        { id: 4, action: 'SHARD_SYNC', resource: 'MinIO Node JPR-01', location: 'Jaipur, IN', time: '12 hrs ago', status: 'Residency OK' },
      ]);
    } catch (e) {}
  };

  return (
    <div className="mc-layout">
      {/* Mobile Header */}
      <div className="mc-mobile-header">
        <div className="mc-brand">
          <Cloud size={24} color="var(--accent-primary)" />
          <span>Mashcloud</span>
        </div>
        <button className="mc-icon-btn" onClick={() => setIsMobileMenuOpen(true)}>
          <Menu size={24} />
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`mc-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="mc-sidebar-header">
          <div className="mc-brand">
            <Cloud size={28} color="var(--accent-primary)" />
            <span>Mashcloud</span>
          </div>
          <button className="mc-mobile-close" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <nav className="mc-sidebar-nav">
          <div className="mc-nav-group">
            <div className="mc-nav-label">Apps</div>
            <button className="mc-nav-item" onClick={() => navigate("/dashboard")}>
              <Grid size={18} /> Dashboard
            </button>
            <button className="mc-nav-item" onClick={() => navigate("/drive")}>
              <Folder size={18} /> Drive
            </button>
            <button className="mc-nav-item" onClick={() => navigate("/photos")}>
              <ImageIcon size={18} /> Photos
            </button>
          </div>

          <div className="mc-nav-group">
            <div className="mc-nav-label">Compliance</div>
            <button className="mc-nav-item active" onClick={() => navigate("/compliance")}>
              <ShieldCheck size={18} /> Trust Center
            </button>
          </div>
        </nav>

        <div className="mc-sidebar-footer">
          <div className="mc-user-card" onClick={() => navigate("/settings")}>
            <img src={profilePhotoUrl} alt="User" className="mc-avatar" />
            <div className="mc-user-info">
              <div className="mc-user-name">{user?.firstName || "User"}</div>
              <div className="mc-user-plan">{user?.plan || 'Free'} Plan</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="mc-main-content">
        <div className="mc-content-header">
          <div>
            <h1>Trust & Compliance</h1>
            <p style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>Verifiable proof that your data never leaves Indian soil.</p>
          </div>
        </div>

        <div className="mc-dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          
          {/* Data Sovereignty Map */}
          <div className="mc-widget glass-elevated" style={{ gridColumn: '1 / -1' }}>
            <div className="mc-widget-header">
              <div className="mc-widget-title">
                <div className="mc-app-icon" style={{ background: '#34c759' }}><MapPin size={20} /></div>
                <div>
                  <h3>100% Data Sovereignty</h3>
                  <p>DPDP Act 2023 Compliant</p>
                </div>
              </div>
            </div>
            <div className="mc-widget-body" style={{ display: 'flex', gap: 'var(--space-xl)', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-md)' }}>
                  Mashcloud guarantees physical data residency. We actively block foreign IPs and VPNs at the network edge. 
                  Your encrypted file shards are distributed strictly across our Tier-2 Indian data center backbone.
                </p>
                <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
                    <CheckCircle size={16} color="#34c759" /> JPR-01 (Jaipur) Online
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 600 }}>
                    <CheckCircle size={16} color="#34c759" /> IND-02 (Indore) Online
                  </div>
                </div>
              </div>
              <div style={{ width: '200px', height: '140px', background: 'var(--surface-2)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--surface-border)' }}>
                <span style={{ color: 'var(--text-muted)' }}>[Map of India UI]</span>
              </div>
            </div>
          </div>

          {/* Encryption Status */}
          <div className="mc-widget glass-elevated">
            <div className="mc-widget-header">
              <div className="mc-widget-title">
                <div className="mc-app-icon" style={{ background: '#007AFF' }}><Lock size={20} /></div>
                <div>
                  <h3>End-to-End Encryption</h3>
                  <p>Client-side AES-256-GCM</p>
                </div>
              </div>
            </div>
            <div className="mc-widget-body">
              <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' }}>
                Your private key is derived from your password using PBKDF2. Files are encrypted on your device. We never possess your key.
              </p>
              <div style={{ background: 'var(--surface-3)', padding: 'var(--space-md)', borderRadius: 'var(--radius-md)', fontFamily: 'monospace', fontSize: '12px', color: 'var(--accent-primary)', wordBreak: 'break-all' }}>
                LOCAL_KEY_HASH: {user?.password ? '********************************' : 'Awaiting Generation...'}
              </div>
            </div>
          </div>

          {/* Real-time Audit Log */}
          <div className="mc-widget glass-elevated">
            <div className="mc-widget-header">
              <div className="mc-widget-title">
                <div className="mc-app-icon" style={{ background: '#ff9f0a' }}><FileKey size={20} /></div>
                <div>
                  <h3>Security Audit Log</h3>
                  <p>CERT-In Compliant Event Stream</p>
                </div>
              </div>
            </div>
            <div className="mc-widget-body">
              <div className="mc-file-list">
                {logs.map(log => (
                  <div key={log.id} className="mc-file-row" style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span className="mc-file-name" style={{ fontWeight: 600 }}>{log.action}</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{log.location} • {log.ip || log.resource}</span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: log.status.includes('Blocked') ? 'var(--accent-error)' : 'var(--accent-success)' }}>
                      {log.status}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Overlay for mobile sidebar */}
      {isMobileMenuOpen && <div className="mc-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)}></div>}
    </div>
  );
};

export default ComplianceCenter;
