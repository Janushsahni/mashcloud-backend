import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Cloud, ArrowLeft, AlertCircle, Laptop } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api';
import './Dashboard.css';

const StoragePage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useContext(AuthContext);

    const [photosSize, setPhotosSize] = useState(0);
    const [photosCount, setPhotosCount] = useState(0);
    const [filesSize, setFilesSize] = useState(0);
    const [filesCount, setFilesCount] = useState(0);

    useEffect(() => {
        document.body.classList.add('settings-theme');

        const fetchData = async () => {
            try {
                // Fetch Photos
                const pRes = await api('/api/photos');
                if (pRes.ok) {
                    const photos = await pRes.json();
                    setPhotosCount(photos.length);
                    const pSize = photos.reduce((acc, curr) => acc + parseInt(curr.size || 0), 0);
                    setPhotosSize(pSize);
                }

                // Fetch Files
                const fRes = await api('/api/files');
                if (fRes.ok) {
                    const files = await fRes.json();
                    setFilesCount(files.length);
                    const fSize = files.reduce((acc, curr) => acc + parseInt(curr.size || 0), 0);
                    setFilesSize(fSize);
                }
            } catch (err) {
                console.error("Failed to fetch storage breakdown", err);
            }
        };
        fetchData();

        return () => {
            document.body.classList.remove('settings-theme');
        };
    }, []);

    const formatBytes = (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const storageQuota = user?.storage_quota || 5368709120;
    const storageUsed = user?.storage_used || 0;
    const storageFree = Math.max(0, storageQuota - storageUsed);
    const storagePercent = storageQuota > 0 ? (storageUsed / storageQuota) * 100 : 0;

    const isFull = storagePercent >= 98;

    const photosPercent = storageUsed > 0 ? (photosSize / storageUsed) * 100 : 0;
    const filesPercent = storageUsed > 0 ? (filesSize / storageUsed) * 100 : 0;
    
    // Fallback widths if there's no data
    const barWidth = Math.max(storagePercent, 0);

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
            </nav>
            
            <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '0 var(--space-md)', color: '#fff', width: '100%' }}>
                {/* Sub Navigation */}
                <div className="settings-sub-nav">
                    <SubNavItem label="Your Mashcloud Plan" path="/plan" />
                    <SubNavItem label="Your Mashcloud Storage" path="/storage" />
                    <SubNavItem label="Data Recovery" path="/data-recovery" />
                    <SubNavItem label="Settings" path="/settings" />
                </div>

                <div style={{ marginBottom: 'var(--space-xxl)' }}>
                    <h1 style={{ fontSize: '40px', fontWeight: '700', marginBottom: 'var(--space-xs)', letterSpacing: '-0.04em' }}>Your Mashcloud Storage</h1>
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: '600px' }}>
                        Use your Mashcloud storage to keep your most important information—like your photos, files, and more—secure, up to date, and available across all your devices.
                    </p>
                </div>

                {/* Storage Bar Card */}
                <div className="setting-block" style={{ marginBottom: 'var(--space-xl)', padding: 'var(--space-lg)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'var(--space-md)' }}>
                        <div style={{ position: 'relative' }}>
                            <div style={{ 
                                background: '#fff', 
                                color: '#000', 
                                padding: 'var(--space-xs) var(--space-md)', 
                                borderRadius: 'var(--radius-md)',
                                fontSize: '24px',
                                fontWeight: '700',
                                display: 'inline-block'
                            }}>
                                {formatBytes(storageQuota)}
                            </div>
                        </div>
                        <div style={{ fontSize: '15px', fontWeight: '600', color: 'var(--text-primary)' }}>
                            <span style={{ color: 'var(--text-muted)' }}>Free {formatBytes(storageFree)}</span> • Used {formatBytes(storageUsed)}
                        </div>
                    </div>

                    <div style={{ 
                        height: '12px', 
                        background: 'var(--surface-3)', 
                        borderRadius: 'var(--radius-full)', 
                        overflow: 'hidden',
                        display: 'flex'
                    }}>
                        {storageUsed > 0 ? (
                            <>
                                <div style={{ width: `${(photosSize / storageQuota) * 100}%`, background: '#ffcc00', height: '100%' }}></div>
                                <div style={{ width: `${(filesSize / storageQuota) * 100}%`, background: 'var(--accent-primary)', height: '100%' }}></div>
                                <div style={{ width: `${((storageUsed - photosSize - filesSize) / storageQuota) * 100}%`, background: '#ff9500', height: '100%' }}></div>
                            </>
                        ) : (
                            <div style={{ width: '0%', height: '100%' }}></div>
                        )}
                    </div>
                </div>

                {/* Warning Alert if full */}
                {isFull && (
                    <div className="setting-block" style={{ borderLeft: '4px solid var(--accent-error)', display: 'flex', alignItems: 'center', gap: 'var(--space-md)', background: 'rgba(255, 69, 58, 0.1)' }}>
                        <AlertCircle color="var(--accent-error)" size={32} />
                        <div>
                            <h3 style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>Mashcloud Storage is Full</h3>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '8px' }}>Upgrade to Mashcloud+ to make sure your data keeps syncing to Mashcloud.</p>
                            <a href="#" onClick={(e) => { e.preventDefault(); navigate('/plan'); }} className="text-link-btn">Upgrade to Premium ↗</a>
                        </div>
                    </div>
                )}

                {/* Breakdown List */}
                <div style={{ marginBottom: 'var(--space-xxl)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-md) 0', borderBottom: '1px solid var(--surface-border)' }}>
                        <div style={{ width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: 'var(--space-md)' }}>
                            <div style={{ width: '32px', height: '32px', background: 'conic-gradient(from 180deg at 50% 50%, #ff3b30, #ff9500, #ffcc00, #4cd964, #5ac8fa, #007aff, #5856d6, #ff2d55, #ff3b30)', borderRadius: 'var(--radius-sm)' }}></div>
                        </div>
                        <div style={{ flexGrow: 1, fontSize: '16px', fontWeight: '600' }}>Photos</div>
                        <div style={{ width: '200px', fontSize: '14px', color: 'var(--text-muted)' }}>{photosCount} Photos</div>
                        <div style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                            {formatBytes(photosSize)} <span style={{ width: '8px', height: '8px', borderRadius: 'var(--radius-full)', background: '#ffcc00' }}></span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-md) 0', borderBottom: '1px solid var(--surface-border)' }}>
                        <div style={{ width: '40px', height: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', marginRight: 'var(--space-md)' }}>
                            <div style={{ width: '32px', height: '32px', background: '#fff', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Cloud size={20} color="var(--accent-primary)" fill="var(--accent-primary)" />
                            </div>
                        </div>
                        <div style={{ flexGrow: 1, fontSize: '16px', fontWeight: '600' }}>Mashcloud Drive</div>
                        <div style={{ width: '200px', fontSize: '14px', color: 'var(--text-muted)' }}>{filesCount} Files</div>
                        <div style={{ fontSize: '16px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                            {formatBytes(filesSize)} <span style={{ width: '8px', height: '8px', borderRadius: 'var(--radius-full)', background: 'var(--accent-primary)' }}></span>
                        </div>
                    </div>
                </div>

                {/* Manage Storage Box */}
                <div className="setting-block" style={{ padding: 'var(--space-lg)', marginBottom: 'var(--space-xxl)' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: 'var(--space-xs)' }}>How to Manage Your Mashcloud Storage</h3>
                    <p style={{ fontSize: '15px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-lg)' }}>
                        Use Mashcloud Drive or Photos to review and delete items you no longer need. This will free up space across all your devices instantly.
                    </p>
                    <div style={{ display: 'flex', gap: 'var(--space-lg)' }}>
                        <button 
                            onClick={() => navigate('/photos')}
                            className="text-link-btn" style={{ fontSize: '15px' }}>
                            <Laptop size={18} /> Manage Photos...
                        </button>
                        <button 
                            onClick={() => navigate('/drive')}
                            className="text-link-btn" style={{ fontSize: '15px' }}>
                            <Laptop size={18} /> Manage Drive...
                        </button>
                    </div>
                </div>

                {/* Bottom Footer Text */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: 'var(--space-lg) var(--space-md)', borderTop: '1px solid var(--surface-border)', margin: '0 calc(-1 * var(--space-md))' }}>
                    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'var(--text-muted)' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                            <span style={{ cursor: 'pointer' }}>System Status</span>
                            <span style={{ cursor: 'pointer' }}>Privacy Policy</span>
                            <span style={{ cursor: 'pointer' }}>Terms & Conditions</span>
                        </div>
                        <div>Copyright © 2026 Mashcloud Inc. All rights reserved.</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StoragePage;
