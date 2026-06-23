import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Cloud, ArrowLeft } from 'lucide-react';
import { apiJson } from '../api';
import $ from 'jquery';
import './SignIn.css';

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
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
        if (!email) return;
        
        setStatus('loading');
        try {
            const res = await apiJson('/api/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
            
            setStatus('success');
            setMessage('If an account exists for this email, a password reset link has been sent.');
        } catch (error) {
            setStatus('error');
            setMessage(error.message || 'An error occurred. Please try again.');
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

                    <h1 className="signin-title">Reset Password</h1>
                    <p style={{textAlign: 'center', color: 'var(--text-secondary)', fontSize: '15px', marginBottom: 'var(--space-xl)', lineHeight: 1.5}}>
                        Enter your email address and we'll send you a link to reset your password.
                    </p>

                    {status === 'success' ? (
                        <div style={{textAlign: 'center'}}>
                            <div className="ui-success-msg">
                                {message}
                            </div>
                            <button className="btn-signin active" onClick={() => navigate('/signin')}>
                                Return to Sign In
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit}>
                            {status === 'error' && (
                                <div className="ui-error-msg">
                                    {message}
                                </div>
                            )}
                            
                            <div className="input-group">
                                <input 
                                    type="email" 
                                    className="signin-input" 
                                    placeholder="Email Address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    autoFocus
                                />
                            </div>
                            
                            <div style={{marginTop: 'var(--space-xl)', display: 'flex', flexDirection: 'column', gap: 'var(--space-md)'}}>
                                <button 
                                    type="submit" 
                                    className={`btn-signin ${email ? 'active' : ''}`}
                                    disabled={!email || status === 'loading'}
                                >
                                    {status === 'loading' ? 'Sending...' : 'Send Reset Link'}
                                </button>
                                
                                <button 
                                    type="button"
                                    className="btn-signin" 
                                    onClick={() => navigate('/signin')}
                                    style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-xs)', background: 'transparent', color: 'var(--accent-primary)'}}
                                >
                                    <ArrowLeft size={16} /> Back to Sign In
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

export default ForgotPassword;
