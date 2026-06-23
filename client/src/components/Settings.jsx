import React, { useEffect, useContext, useState } from 'react';
import { api, apiJson } from '../api';
import { useNavigate, useLocation } from 'react-router-dom';
import { Cloud, ChevronRight, ArrowLeft } from 'lucide-react';
import './Dashboard.css';
import './Settings.css';
import { AuthContext } from '../context/AuthContext';
import PhotoModal from './PhotoModal';
import Toast from './Toast';

const Settings = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, logout, refreshUser } = useContext(AuthContext);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        document.body.classList.add('settings-theme');
        return () => {
            document.body.classList.remove('settings-theme');
        };
    }, []);

    const showToast = (message, type = 'info') => {
        setToast({ message, type });
    };

    const handlePhotoSave = async (photoBase64) => {
        try {
            const res = await apiJson('/api/auth/me/photo', {
                method: 'POST',
                body: JSON.stringify({ photo: photoBase64 })
            });
            if (res.ok) {
                showToast('Profile photo updated successfully', 'success');
                refreshUser();
            } else {
                showToast('Failed to update profile photo', 'error');
            }
        } catch (error) {
            showToast('Error updating profile photo', 'error');
        }
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm("Are you sure you want to permanently delete your account and all your files? This action cannot be undone.")) {
            return;
        }
        setIsDeleting(true);
        try {
            const res = await api('/api/auth/me', { method: 'DELETE' });
            if (res.ok) {
                logout();
                navigate('/signin');
            } else {
                showToast("Failed to delete account", "error");
                setIsDeleting(false);
            }
        } catch (error) {
            console.error("Error deleting account", error);
            showToast("Error deleting account", "error");
            setIsDeleting(false);
        }
    };

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const storageQuotaFormatted = formatBytes(user?.storage_quota || 5368709120);
    const profilePhotoUrl = user?.profile_photo || `https://ui-avatars.com/api/?name=${user?.firstName || 'M'}+${user?.lastName || 'C'}&background=0a84ff&color=fff`;

    const SubNavItem = ({ label, path }) => {
        const isActive = location.pathname === path;
        return (
            <div 
                onClick={() => navigate(path)}
                className={`sub-nav-item ${isActive ? 'active' : ''}`}
            >
                {label}
            </div>
        );
    };

    return (
        <div className="settings-page">
            <nav className="settings-nav">
                <div className="nav-left" style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
                    <ArrowLeft size={20} />
                    <Cloud size={24} />
                    <span>Mashcloud</span>
                </div>
                <div className="nav-right">
                    <div className="nav-avatar" onClick={() => navigate('/settings')}>
                        <img src={profilePhotoUrl} alt="Profile" />
                    </div>
                </div>
            </nav>

            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 var(--space-md)', width: '100%' }}>
                <div className="settings-sub-nav">
                    <SubNavItem label="Your Mashcloud Plan" path="/plan" />
                    <SubNavItem label="Your Mashcloud Storage" path="/storage" />
                    <SubNavItem label="Data Recovery" path="/data-recovery" />
                    <SubNavItem label="Settings" path="/settings" />
                </div>

                <div style={{ paddingBottom: 'var(--space-xxl)' }}>
                    <h1 style={{ fontSize: '40px', fontWeight: '700', marginBottom: 'var(--space-lg)', letterSpacing: '-0.04em' }}>
                        {user ? `${user.firstName} ${user.lastName}` : 'Mashcloud User'}
                    </h1>

                    <div className="settings-main-grid">
                        <div className="settings-col">
                            <div className="mc-blue-card">
                                <h2>Mashcloud</h2>
                                <div className="mc-card-bottom">
                                    <div className="mc-card-links">
                                        <div onClick={() => navigate('/plan')}>Plan <ChevronRight size={14}/></div>
                                        <div onClick={() => navigate('/storage')}>Storage <ChevronRight size={14}/></div>
                                    </div>
                                    <div className="mc-card-quota">{storageQuotaFormatted}</div>
                                </div>
                            </div>

                            <div style={{ marginTop: 'var(--space-xl)' }}>
                                <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: '600', marginBottom: 'var(--space-xs)' }}>Account Management</h3>
                                <div className="inset-group">
                                    <div className="inset-row" onClick={() => { logout(); navigate('/signin'); }}>
                                        <span className="inset-row-left" style={{ color: 'var(--accent-error)' }}>Sign Out Of All Browsers</span>
                                        <ChevronRight size={16} color="var(--text-muted)" />
                                    </div>
                                    <div className="inset-row" onClick={handleDeleteAccount}>
                                        <span className="inset-row-left" style={{ color: 'var(--accent-error)' }}>{isDeleting ? 'Deleting...' : 'Delete Account'}</span>
                                        <ChevronRight size={16} color="var(--text-muted)" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="settings-col">
                            <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: '600', marginBottom: 'var(--space-xs)' }}>Account Details</h3>
                            <div className="inset-group">
                                <div className="inset-row" style={{ cursor: 'default' }}>
                                    <span className="inset-row-left">Email</span>
                                    <span className="inset-row-right">{user?.email}</span>
                                </div>
                                <div className="inset-row" onClick={() => setIsPhotoModalOpen(true)}>
                                    <span className="inset-row-left">Profile Photo</span>
                                    <span className="inset-row-right">
                                        <img src={profilePhotoUrl} alt="Profile" style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--surface-border-strong)', objectFit: 'cover' }} />
                                        <ChevronRight size={16} />
                                    </span>
                                </div>
                                <div className="inset-row" onClick={() => navigate('/plan')}>
                                    <span className="inset-row-left">Subscription Plan</span>
                                    <span className="inset-row-right">
                                        Standard Plan
                                        <ChevronRight size={16} />
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="upgrade-section">
                <div className="upgrade-content">
                    <h2 style={{ fontSize: '32px', fontWeight: '700', marginBottom: 'var(--space-xs)', letterSpacing: '-0.03em' }}>Upgrade to Mashcloud+</h2>
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)', maxWidth: '600px', lineHeight: '1.5' }}>
                        When you upgrade to Mashcloud+ you get the storage you need plus premium features to protect your privacy.
                    </p>

                    <div className="upgrade-cards-grid">
                        <div className="upgrade-dark-card">
                            <div className="udc-icon"><Cloud size={24} color="var(--accent-primary)" fill="var(--accent-primary)"/></div>
                            <h4>More Storage</h4>
                            <p>Choose the amount of storage that's right for you. Mashcloud+ plans include 50 GB, 200 GB, 2 TB, 6 TB or 12 TB of storage.</p>
                            <div onClick={() => navigate('/plan')} className="udc-link">Learn more about Mashcloud+ Plans and Pricing ↗</div>
                            
                            <div className="udc-graphic">
                                <div className="udc-bubble c1"></div>
                                <div className="udc-bubble c2"></div>
                                <div className="udc-bubble c3"></div>
                                <div className="udc-bubble c-avatar"><img src={profilePhotoUrl} alt="Avatar" /></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.2)', padding: 'var(--space-lg) var(--space-md)', borderTop: '1px solid var(--surface-border)' }}>
                <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                        <span style={{ cursor: 'pointer' }}>System Status</span>
                        <span style={{ cursor: 'pointer' }}>Privacy Policy</span>
                        <span style={{ cursor: 'pointer' }}>Terms & Conditions</span>
                    </div>
                    <div>Copyright © 2026 Mashcloud Inc. All rights reserved.</div>
                </div>
            </div>

            <PhotoModal 
                isOpen={isPhotoModalOpen} 
                onClose={() => setIsPhotoModalOpen(false)}
                onSave={handlePhotoSave}
                currentPhoto={profilePhotoUrl}
            />
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default Settings;
