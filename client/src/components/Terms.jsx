import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, ArrowLeft } from 'lucide-react';
import './Dashboard.css'; // Reuse dashboard styles for header

const Terms = () => {
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
                <h1 style={{ marginBottom: '20px' }}>Terms of Service</h1>
                <p>Last updated: October 2026</p>
                <h3 style={{ marginTop: '20px' }}>1. Acceptance of Terms</h3>
                <p>By accessing and using Mashcloud, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our service.</p>
                
                <h3 style={{ marginTop: '20px' }}>2. Description of Service</h3>
                <p>Mashcloud provides cloud storage services. You are responsible for all data you upload. We reserve the right to modify or terminate the service at any time.</p>
                
                <h3 style={{ marginTop: '20px' }}>3. User Conduct</h3>
                <p>You agree not to upload any illegal, copyrighted, or malicious content. We reserve the right to terminate accounts that violate these terms.</p>
                
                <h3 style={{ marginTop: '20px' }}>4. Limitation of Liability</h3>
                <p>Mashcloud is provided "as is". We are not liable for any data loss, corruption, or service interruptions.</p>
            </div>
        </div>
    );
};

export default Terms;
