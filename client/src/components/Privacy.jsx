import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, ArrowLeft } from 'lucide-react';
import './Dashboard.css';

const Privacy = () => {
    const navigate = useNavigate();
    return (
        <div className="dashboard-page" style={{ overflowY: 'auto' }}>
            <nav className="dashboard-nav">
                <div className="nav-left" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <ArrowLeft size={20} style={{ marginRight: '10px' }} />
                    <Cloud size={20} />
                    <span className="mashcloud-text">Mashcloud</span>
                </div>
            </nav>
            <div style={{ maxWidth: '800px', margin: '40px auto', padding: '20px', color: '#fff' }}>
                <h1 style={{ marginBottom: '20px' }}>Privacy Policy</h1>
                <p>Last updated: October 2026</p>
                <h3 style={{ marginTop: '20px' }}>1. Data Collection</h3>
                <p>We collect your email address, name, and the files you upload to our service. We also collect usage data (storage quotas).</p>
                
                <h3 style={{ marginTop: '20px' }}>2. Data Usage</h3>
                <p>Your data is used solely to provide the Mashcloud service. We do not sell your personal information or files to third parties.</p>
                
                <h3 style={{ marginTop: '20px' }}>3. Data Privacy (GDPR/CCPA) & Deletion</h3>
                <p>You have the right to request deletion of your account and all associated data. You can permanently delete your account and all files directly from the Settings page.</p>
                
                <h3 style={{ marginTop: '20px' }}>4. Security</h3>
                <p>We take reasonable measures to protect your data, but no electronic storage system is 100% secure.</p>
            </div>
        </div>
    );
};

export default Privacy;
