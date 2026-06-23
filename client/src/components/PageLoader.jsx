import React, { useContext } from 'react';
import { Cloud, Plus, Grid, Folder, Image as ImageIcon } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import './PageLoader.css';

const PageLoader = ({ appName = 'Mashcloud', type = 'default' }) => {
    const { user } = useContext(AuthContext);
    const profilePhotoUrl = user?.profile_photo || `https://ui-avatars.com/api/?name=${user?.firstName || 'M'}+${user?.lastName || 'C'}&background=0a84ff&color=fff`;

    return (
        <div className="page-loader-container">
            <nav className="page-loader-nav">
                <div className="page-loader-nav-left">
                    <Cloud size={20} />
                    <span>Mashcloud</span>
                </div>
                <div className="page-loader-nav-right">
                    <button className="page-loader-icon-btn"><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ff3b30', color: '#fff', borderRadius: '50%', width: '18px', height: '18px', fontSize: '12px', fontWeight: 'bold' }}>!</div></button>
                    <button className="page-loader-icon-btn"><Plus size={20} /></button>
                    <button className="page-loader-icon-btn"><Grid size={20} /></button>
                    <img src={profilePhotoUrl} alt="Profile" style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                </div>
            </nav>

            <div className="page-loader-content">
                {type === 'drive' && (
                    <div className="page-loader-app-icon drive">
                        <Folder size={32} color="#0a84ff" fill="#0a84ff" />
                    </div>
                )}
                
                {type === 'photos' && (
                    <div className="page-loader-app-icon photos" style={{ background: '#333' }}>
                        <ImageIcon size={32} color="#ff3b30" />
                    </div>
                )}
                
                {type === 'dashboard' && (
                    <div className="page-loader-app-icon dashboard" style={{ background: 'linear-gradient(180deg, #0a84ff, #0056b3)' }}>
                        <Cloud size={32} color="#fff" />
                    </div>
                )}

                <h1 className="page-loader-title">{appName}</h1>
                
                <div className="page-loader-dots">
                    <div className="page-loader-dot"></div>
                    <div className="page-loader-dot"></div>
                    <div className="page-loader-dot"></div>
                </div>
            </div>

            <footer className="page-loader-footer">
                <div className="page-loader-footer-links">
                    <a href="#" onClick={e => e.preventDefault()}>System Status</a>
                    <span>|</span>
                    <a href="#" onClick={e => e.preventDefault()}>Privacy Policy</a>
                    <span>|</span>
                    <a href="#" onClick={e => e.preventDefault()}>Terms & Conditions</a>
                </div>
                <div>
                    Copyright © 2026 Mashcloud Inc. All rights reserved.
                </div>
            </footer>
        </div>
    );
};

export default PageLoader;
