import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, ArrowLeft } from 'lucide-react';
import $ from 'jquery';
import './Dashboard.css';

const NotFound = () => {
    const navigate = useNavigate();

    useEffect(() => {
        $('body').addClass('settings-theme');
        return () => {
            $('body').removeClass('settings-theme');
        };
    }, []);

    return (
        <div className="dashboard-page" style={{display: 'flex', flexDirection: 'column', minHeight: '100vh'}}>
            <nav className="dashboard-nav" style={{ background: '#1c1c1e', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="nav-left" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <Cloud size={20} />
                    <span className="mashcloud-text">Mashcloud</span>
                </div>
            </nav>

            <div style={{flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px'}}>
                <Cloud size={64} color="#0a84ff" style={{marginBottom: '24px', opacity: 0.8}} />
                <h1 style={{fontSize: '72px', fontWeight: 700, margin: '0 0 8px 0', letterSpacing: '-2px'}}>404</h1>
                <h2 style={{fontSize: '24px', fontWeight: 500, margin: '0 0 16px 0'}}>Page Not Found</h2>
                <p style={{color: '#a1a1a6', fontSize: '16px', marginBottom: '32px', textAlign: 'center'}}>
                    The page you are looking for doesn't exist or has been moved.
                </p>
                <button 
                    onClick={() => navigate('/dashboard')}
                    style={{
                        background: '#0a84ff', 
                        color: 'white', 
                        border: 'none', 
                        padding: '12px 24px', 
                        borderRadius: '24px',
                        fontSize: '15px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}
                >
                    <ArrowLeft size={16} /> Return to Dashboard
                </button>
            </div>
        </div>
    );
};

export default NotFound;
