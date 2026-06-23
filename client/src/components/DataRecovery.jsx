import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, File, Trash2, RotateCcw, AlertTriangle, FileText, Image as ImageIcon, Cloud } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api';
import Toast from './Toast';
import './DataRecovery.css';

const DataRecovery = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, refreshUser } = useContext(AuthContext);
    
    const [recoveryItems, setRecoveryItems] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null);
    const [expandedMenuId, setExpandedMenuId] = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchRecoveryItems = async () => {
        setIsLoading(true);
        try {
            const res = await api('/api/recovery');
            if (res.ok) {
                const data = await res.json();
                setRecoveryItems(data);
            }
        } catch (error) {
            console.error('Failed to fetch recovery items:', error);
            showToast('Failed to load recovery items', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        document.body.classList.add('settings-theme');
        if (user) {
            fetchRecoveryItems();
        } else {
            navigate('/signin');
        }

        return () => {
            document.body.classList.remove('settings-theme');
        };
    }, [user, navigate]);

    const handleRestore = async (id, type) => {
        try {
            const res = await api(`/api/recovery/${type}/${id}/restore`, {
                method: 'POST'
            });
            if (res.ok) {
                showToast('Item restored successfully', 'success');
                setRecoveryItems(prev => prev.filter(item => item.id !== id || item.type !== type));
                refreshUser();
            } else {
                showToast('Failed to restore item', 'error');
            }
        } catch (error) {
            showToast('Failed to restore item', 'error');
        }
    };

    const handlePermanentDelete = async (id, type) => {
        if (!window.confirm('Are you sure you want to permanently delete this item? This action cannot be undone.')) return;
        
        try {
            const res = await api(`/api/recovery/${type}/${id}/permanent`, {
                method: 'DELETE'
            });
            if (res.ok) {
                showToast('Item permanently deleted', 'success');
                setRecoveryItems(prev => prev.filter(item => item.id !== id || item.type !== type));
                refreshUser();
            } else {
                showToast('Failed to delete item', 'error');
            }
        } catch (error) {
            showToast('Failed to delete item', 'error');
        }
    };

    const calculateDaysLeft = (deletedAt) => {
        const deletedDate = new Date(deletedAt);
        const expireDate = new Date(deletedDate.getTime() + (30 * 24 * 60 * 60 * 1000));
        const now = new Date();
        const diffTime = expireDate - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays > 0 ? diffDays : 0;
    };

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
        <div className="recovery-page">
            <nav className="recovery-nav">
                <div className="nav-left" style={{ cursor: 'pointer' }} onClick={() => navigate('/dashboard')}>
                    <ArrowLeft size={20} />
                    <Cloud size={24} />
                    <span>Mashcloud</span>
                </div>
            </nav>

            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 var(--space-md)', width: '100%' }}>
                <div className="settings-sub-nav">
                    <SubNavItem label="Your Mashcloud Plan" path="/plan" />
                    <SubNavItem label="Your Mashcloud Storage" path="/storage" />
                    <SubNavItem label="Data Recovery" path="/data-recovery" />
                    <SubNavItem label="Settings" path="/settings" />
                </div>

                <div className="recovery-hero">
                    <h1 className="recovery-title">Data Recovery</h1>
                    <p className="recovery-desc">
                        Recover files and photos deleted from Mashcloud Drive within the last 30 days. Items are permanently deleted after 30 days.
                    </p>
                </div>

                <div className="recovery-content">
                    <div className="recovery-card">
                        <div className="recovery-card-header">
                            <div className="recovery-card-icon-wrapper">
                                <FileText size={20} color="#fff" />
                            </div>
                            <div className="recovery-card-title-group">
                                <h3>Restore Files</h3>
                                <span className="recovery-status">
                                    {isLoading ? 'Loading...' : `${recoveryItems.length} items`}
                                </span>
                            </div>
                        </div>
                        
                        <div className="recovery-list">
                            {isLoading ? (
                                <div className="recovery-empty">Loading...</div>
                            ) : recoveryItems.length === 0 ? (
                                <div className="recovery-empty">No recently deleted files</div>
                            ) : (
                                recoveryItems.map(item => (
                                    <div key={`${item.type}-${item.id}`} className="recovery-item">
                                        <div className="recovery-item-info">
                                            <div className="recovery-item-icon">
                                                {item.type === 'photo' ? <ImageIcon size={24} color="var(--text-secondary)" /> : <File size={24} color="var(--text-secondary)" />}
                                            </div>
                                            <div className="recovery-item-details">
                                                <div className="recovery-item-name">{item.original_name}</div>
                                                <div className="recovery-item-meta">
                                                    {(item.size / (1024 * 1024)).toFixed(2)} MB • {calculateDaysLeft(item.deleted_at)} days left
                                                </div>
                                            </div>
                                        </div>
                                        <div className="recovery-item-actions">
                                            <button className="recovery-btn restore-btn" onClick={() => handleRestore(item.id, item.type)}>
                                                <RotateCcw size={16} /> Restore
                                            </button>
                                            <button className="recovery-btn delete-btn" onClick={() => handlePermanentDelete(item.id, item.type)}>
                                                <Trash2 size={16} /> Delete
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

            </div>
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </div>
    );
};

export default DataRecovery;
