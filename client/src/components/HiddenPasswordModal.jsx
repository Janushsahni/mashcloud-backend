import React, { useState } from 'react';
import { X, Lock } from 'lucide-react';
import API_BASE, { api } from '../api';

const HiddenPasswordModal = ({ mode, onSuccess, onCancel }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (mode === 'setup') {
            if (password.length < 4) {
                return setError('Password must be at least 4 characters');
            }
            if (password !== confirmPassword) {
                return setError('Passwords do not match');
            }
        } else {
            if (!password) {
                return setError('Please enter your password');
            }
        }

        setIsLoading(true);
        try {
            if (mode === 'setup') {
                const res = await api('/api/hidden-password/set', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to set password');
                onSuccess();
            } else {
                const res = await api('/api/hidden-password/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Incorrect password');
                onSuccess();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
        }}>
            <div style={{
                backgroundColor: '#1c1c1e',
                borderRadius: '16px',
                padding: '32px',
                width: '100%',
                maxWidth: '400px',
                border: '1px solid #424245',
                position: 'relative'
            }}>
                <button
                    onClick={onCancel}
                    style={{
                        position: 'absolute',
                        top: '16px',
                        right: '16px',
                        background: 'none',
                        border: 'none',
                        color: '#a1a1a6',
                        cursor: 'pointer'
                    }}
                >
                    <X size={20} />
                </button>

                <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(10, 132, 255, 0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 16px'
                    }}>
                        <Lock size={24} color="#0a84ff" />
                    </div>
                    <h2 style={{ margin: 0, color: '#fff', fontSize: '20px', fontWeight: '600' }}>
                        {mode === 'setup' ? 'Set Hidden Password' : 'Enter Hidden Password'}
                    </h2>
                    <p style={{ margin: '8px 0 0', color: '#a1a1a6', fontSize: '14px' }}>
                        {mode === 'setup'
                            ? 'Create a password to protect your hidden photos. Do not forget it!'
                            : 'This folder is protected. Enter your password to view it.'}
                    </p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '16px' }}>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '12px 16px',
                                backgroundColor: '#2c2c2e',
                                border: '1px solid #424245',
                                borderRadius: '8px',
                                color: '#fff',
                                fontSize: '15px',
                                outline: 'none'
                            }}
                            autoFocus
                        />
                    </div>

                    {mode === 'setup' && (
                        <div style={{ marginBottom: '24px' }}>
                            <input
                                type="password"
                                placeholder="Confirm Password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 16px',
                                    backgroundColor: '#2c2c2e',
                                    border: '1px solid #424245',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    fontSize: '15px',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    )}

                    {error && (
                        <div style={{
                            color: '#ff453a',
                            fontSize: '14px',
                            marginBottom: '16px',
                            textAlign: 'center'
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{
                            width: '100%',
                            padding: '14px',
                            backgroundColor: '#0a84ff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '15px',
                            fontWeight: '600',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            opacity: isLoading ? 0.7 : 1,
                            transition: 'background-color 0.2s',
                            marginBottom: mode === 'verify' ? '16px' : '0'
                        }}
                    >
                        {isLoading ? 'Processing...' : (mode === 'setup' ? 'Set Password' : 'Unlock')}
                    </button>

                    {mode === 'verify' && (
                        <div style={{ textAlign: 'center' }}>
                            <button
                                type="button"
                                onClick={() => alert('Password recovery via email/codes will be available in a future update.')}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#0a84ff',
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                    textDecoration: 'none'
                                }}
                            >
                                Forgot Password?
                            </button>
                        </div>
                    )}
                </form>
            </div>
        </div>
    );
};

export default HiddenPasswordModal;
