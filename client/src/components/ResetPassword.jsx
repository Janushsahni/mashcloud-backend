import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Cloud, ArrowLeft } from 'lucide-react';
import { apiJson } from '../api';
import $ from 'jquery';
import './SignIn.css';

const ResetPassword = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [status, setStatus] = useState('idle'); // idle, loading, success, error
    const [message, setMessage] = useState('');

    useEffect(() => {
        $('body').addClass('signin-theme');
        return () => {
            $('body').removeClass('signin-theme');
        };
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!token) {
            setStatus('error');
            setMessage('Invalid or missing reset token.');
            return;
        }
        
        if (password.length < 8) {
            setStatus('error');
            setMessage('Password must be at least 8 characters long.');
            return;
        }
        
        if (password !== confirm) {
            setStatus('error');
            setMessage('Passwords do not match.');
            return;
        }
        
        setStatus('loading');
        try {
            const res = await apiJson('/api/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token, password })
            });
            
            setStatus('success');
            setMessage('Your password has been successfully reset. You can now sign in with your new password.');
        } catch (error) {
            setStatus('error');
            setMessage(error.message || 'An error occurred. The token may be expired.');
        }
    };

    return (
        <div className="signin-page">
            <nav className="signin-nav">
                <div className="nav-left" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
                    <Cloud className="mashcloud-icon-small" size={20} />
                    <span className="mashcloud-text">Mashcloud</span>
                </div>
            </nav>

            <main className="signin-main">
                <div className="signin-card">
                    <div className="graphic-container">
                        <Cloud size={48} color="var(--accent-primary)" />
                    </div>

                    <h1 className="signin-title">Create New Password</h1>
                    <p style={{textAlign: 'center', color: 'var(--text-secondary)', fontSize: '15px', marginBottom: 'var(--space-xl)', lineHeight: 1.5}}>
                        Enter your new password below to regain access to your account.
                    </p>

                    {status === 'success' ? (
                        <div style={{textAlign: 'center'}}>
                            <div className="ui-success-msg">
                                {message}
                            </div>
                            <button className="btn-signin active" onClick={() => navigate('/signin')}>
                                Go to Sign In
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            {status === 'error' && (
                                <div className="ui-error-msg">
                                    {message}
                                </div>
                            )}
                            
                            {!token && status !== 'error' && (
                                <div className="ui-error-msg" style={{ background: 'rgba(255, 159, 10, 0.1)', color: 'var(--accent-warning)', border: '1px solid rgba(255, 159, 10, 0.2)' }}>
                                    Warning: No reset token found in the URL.
                                </div>
                            )}
                            
                            <div className="input-group">
                                <input 
                                    type="password" 
                                    className="signin-input" 
                                    placeholder="New Password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            <div className="input-group" style={{marginTop: 'var(--space-sm)'}}>
                                <input 
                                    type="password" 
                                    className="signin-input" 
                                    placeholder="Confirm New Password"
                                    value={confirm}
                                    onChange={(e) => setConfirm(e.target.value)}
                                    required
                                />
                            </div>
                            
                            <div style={{marginTop: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)'}}>
                                <button 
                                    type="submit" 
                                    className={`btn-signin ${password && confirm ? 'active' : ''}`}
                                    disabled={!password || !confirm || status === 'loading'}
                                >
                                    {status === 'loading' ? 'Saving...' : 'Reset Password'}
                                </button>
                                
                                <button 
                                    type="button"
                                    className="btn-signin" 
                                    onClick={() => navigate('/signin')}
                                    style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-xs)', background: 'transparent', color: 'var(--accent-primary)'}}
                                >
                                    <ArrowLeft size={16} /> Cancel
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </main>

            <footer style={{ background: 'rgba(0,0,0,0.2)', padding: 'var(--space-lg) var(--space-md)', borderTop: '1px solid var(--surface-border)', color: 'var(--text-muted)', fontSize: '12px', textAlign: 'center' }}>
                <div style={{ marginBottom: 'var(--space-xs)' }}>
                    <a href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>Privacy Policy</a> | 
                    <a href="/terms" style={{ color: 'inherit', textDecoration: 'none', marginLeft: 'var(--space-xs)' }}>Terms & Conditions</a>
                </div>
                <div>Copyright © 2026 Mashcloud Inc. All rights reserved.</div>
            </footer>
        </div>
    );
};

export default ResetPassword;
