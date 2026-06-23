import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { AuthContext } from "../context/AuthContext";
import { 
  Cloud, Grid, FileText, Image as ImageIcon, Folder,
  Settings, ShieldCheck, Menu, X, AlertTriangle, LogOut
} from "lucide-react";
import $ from "jquery";
import "./Dashboard.css";
import Toast from './Toast';
import GlobalUploadButton from './GlobalUploadButton';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [recentFiles, setRecentFiles] = useState([]);
  const [recentPhotos, setRecentPhotos] = useState([]);
  const [storageUsed, setStorageUsed] = useState(0);
  const [toast, setToast] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const showToast = (message, type = 'info') => setToast({ message, type });
  const storageQuota = user?.storage_quota || (5 * 1024 * 1024 * 1024);
  
  useEffect(() => {
    $("body").addClass("dashboard-theme");
    fetchData();
    return () => {
      $("body").removeClass("dashboard-theme");
    };
  }, []);

  const fetchData = async () => {
    try {
      const filesRes = await api("/api/files");
      if (filesRes.ok) {
        const data = await filesRes.json();
        setRecentFiles(data.slice(0, 4)); // Top 4 for Drive widget
        const used = data.reduce((acc, f) => acc + parseInt(f.size, 10), 0);
        setStorageUsed(used);
      }

      const photosRes = await api("/api/photos");
      if (photosRes.ok) {
        const data = await photosRes.json();
        setRecentPhotos(data.slice(0, 6)); // Top 6 for Photos widget mosaic
      }
    } catch (error) {
      console.error("Error fetching data", error);
    }
  };

  const storagePercent = Math.min((storageUsed / storageQuota) * 100, 100).toFixed(0);
  const storageUsedFormatted = (storageUsed / (1024*1024*1024)).toFixed(2) + ' GB';
  const storageQuotaFormatted = (storageQuota / (1024*1024*1024)).toFixed(0) + ' GB';
  const profilePhotoUrl = user?.profile_photo || `https://ui-avatars.com/api/?name=${user?.firstName || "M"}+${user?.lastName || "C"}&background=0a84ff&color=fff`;

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
            <button className="mc-nav-item active" onClick={() => navigate("/dashboard")}>
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
            <button className="mc-nav-item" onClick={() => navigate("/compliance")}>
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
          <div className="mc-storage-mini">
            <div className="mc-storage-labels">
              <span>{storagePercent}% Used</span>
              <span>{storageQuotaFormatted}</span>
            </div>
            <div className="mc-storage-bar-bg">
              <div className="mc-storage-bar-fill" style={{ width: `${storagePercent}%` }}></div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="mc-main-content">
        <div className="mc-content-header">
          <h1>Dashboard</h1>
          <div className="mc-header-actions">
            <GlobalUploadButton showToast={showToast} />
            {storagePercent >= 90 && (
              <button className="mc-btn-warning" onClick={() => navigate("/plan")}>
                <AlertTriangle size={16} /> Upgrade
              </button>
            )}
          </div>
        </div>

        <div className="mc-dashboard-grid">
          {/* Drive Widget */}
          <div className="mc-widget glass-elevated" onClick={() => navigate("/drive")}>
            <div className="mc-widget-header">
              <div className="mc-widget-title">
                <div className="mc-app-icon drive"><Folder size={20} /></div>
                <div>
                  <h3>iCloud Drive</h3>
                  <p>Recent Files</p>
                </div>
              </div>
            </div>
            <div className="mc-widget-body">
              {recentFiles.length === 0 ? (
                <div className="mc-empty-state">No recent files</div>
              ) : (
                <div className="mc-file-list">
                  {recentFiles.map(file => (
                    <div key={file.id} className="mc-file-row">
                      <FileText size={16} color="var(--text-secondary)" />
                      <span className="mc-file-name">{file.original_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Photos Widget */}
          <div className="mc-widget glass-elevated" onClick={() => navigate("/photos")}>
            <div className="mc-widget-header">
              <div className="mc-widget-title">
                <div className="mc-app-icon photos"><ImageIcon size={20} color="#fff" /></div>
                <div>
                  <h3>Photos</h3>
                  <p>Library</p>
                </div>
              </div>
            </div>
            <div className="mc-widget-body" style={{ padding: 0 }}>
              <div className="mc-photos-mosaic">
                {recentPhotos.map((photo, i) => (
                  <div key={photo.id} className={`mc-mosaic-item item-${i}`}>
                    <img src={photo.url || '#'} alt="Memory" />
                  </div>
                ))}
                {recentPhotos.length === 0 && <div className="mc-empty-state" style={{ padding: 'var(--space-md)' }}>No photos yet</div>}
              </div>
            </div>
          </div>

        </div>
      </main>

      {/* Overlay for mobile sidebar */}
      {isMobileMenuOpen && <div className="mc-sidebar-overlay" onClick={() => setIsMobileMenuOpen(false)}></div>}


      <footer className="dashboard-footer-section">
        <div className="footer-stats-container">
          <div className="footer-stat" onClick={() => navigate("/plan")}>
            <h3>Your Plan <ChevronRight size={24} color="#a1a1a6" /></h3>
            <div className="stat-subtitle"><Cloud color="#0a84ff" fill="#0a84ff" size={20} /> Standard</div>
            <p className="stat-value">{storageQuotaFormatted} Storage</p>
            <p className="stat-desc">Free</p>
          </div>

          <div className="footer-stat" onClick={() => navigate("/storage")}>
            <h3>Your Storage <ChevronRight size={24} color="#a1a1a6" /></h3>
            <div className="storage-bar-container">
              <div className="storage-segment-1" style={{ width: `${storagePercent}%` }}></div>
            </div>
            <p className="stat-value">{storageUsedFormatted} Used</p>
            <p className="stat-desc">{storagePercent}% of {storageQuotaFormatted}</p>
          </div>

          <div className="footer-stat" onClick={() => navigate("/data-recovery")}>
            <h3>Data Recovery <ChevronRight size={24} color="#a1a1a6" /></h3>
            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <div style={{ background: "#bf5af2", borderRadius: "50%", padding: "4px" }}><FileText size={16} color="#fff" /></div>
              <div style={{ background: "#ff9500", borderRadius: "50%", padding: "4px" }}><BookOpen size={16} color="#fff" /></div>
              <div style={{ background: "#0a84ff", borderRadius: "50%", padding: "4px" }}><Users size={16} color="#fff" /></div>
              <div style={{ background: "#ff3b30", borderRadius: "50%", padding: "4px" }}><Calendar size={16} color="#fff" /></div>
            </div>
            <p className="stat-desc" style={{ lineHeight: "1.4" }}>Restore deleted files, bookmarks,<br/>contacts, and calendars.</p>
          </div>
        </div>

        <div className="footer-links-container">
          <div className="footer-links">
            <a href="#" onClick={(e) => { e.preventDefault(); showToast("Coming Soon", "info"); }}>System Status</a>
            <span>|</span>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/privacy'); }}>Privacy Policy</a>
            <span>|</span>
            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/terms'); }}>Terms & Conditions</a>
          </div>
          <div>Copyright © 2026 Mashcloud. All rights reserved.</div>
        </div>
      </footer>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
};

export default Dashboard;
