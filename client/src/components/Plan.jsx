import React, { useContext, useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Cloud, ArrowLeft, CloudRain, Shield, Link as LinkIcon, HeadphonesIcon } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { api } from '../api';
import './Dashboard.css';
import Toast from './Toast';

const Plan = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, login } = useContext(AuthContext);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState(null);

    useEffect(() => {
        document.body.classList.add('settings-theme');
        fetchPlans();
        return () => {
            document.body.classList.remove('settings-theme');
        };
    }, []);

    const fetchPlans = async () => {
        try {
            const res = await api('/api/plans');
            if (res.ok) {
                const data = await res.json();
                setPlans(data.plans || []);
            }
        } catch (err) {
            console.error('Failed to fetch plans', err);
        }
    };

    const handleUpgrade = async (planKey) => {
        setLoading(true);
        try {
            // 1. Create Order on Backend
            const orderRes = await api('/api/payments/create-order', {
                method: 'POST',
                body: JSON.stringify({ plan: planKey })
            });
            
            if (!orderRes.ok) {
                const err = await orderRes.json();
                throw new Error(err.error || 'Failed to create order');
            }
            
            const order = await orderRes.json();

            // 2. Open Razorpay Checkout UI
            const options = {
                key: order.keyId,
                amount: order.amount,
                currency: order.currency,
                name: "Mashcloud",
                description: `Upgrade to ${order.planName} Plan`,
                image: "/favicon.svg",
                order_id: order.orderId,
                handler: async function (response) {
                    // 3. Verify Payment on Backend
                    try {
                        const verifyRes = await api('/api/payments/verify', {
                            method: 'POST',
                            body: JSON.stringify({
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature
                            })
                        });

                        if (verifyRes.ok) {
                            const data = await verifyRes.json();
                            setToast({ message: data.message, type: 'success' });
                            // Refresh user context to update storage quota
                            // In a real app you might trigger a re-fetch of /api/auth/me here
                            setTimeout(() => window.location.reload(), 2000);
                        } else {
                            throw new Error('Payment verification failed');
                        }
                    } catch (err) {
                        setToast({ message: err.message, type: 'error' });
                    }
                },
                prefill: {
                    name: user?.firstName + ' ' + user?.lastName,
                    email: user?.email,
                    contact: user?.phone || ""
                },
                theme: {
                    color: "#0a84ff"
                }
            };
            
            const rzp = new window.Razorpay(options);
            rzp.on('payment.failed', function (response){
                setToast({ message: 'Payment failed. Please try again.', type: 'error' });
            });
            rzp.open();

        } catch (err) {
            setToast({ message: err.message, type: 'error' });
        } finally {
            setLoading(false);
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
        <>
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

                {/* Hero Section */}
                <div style={{ marginBottom: 'var(--space-xxl)' }}>
                    <h1 style={{ fontSize: '40px', fontWeight: '700', marginBottom: 'var(--space-xs)', letterSpacing: '-0.04em' }}>Your Mashcloud Plan</h1>
                    <div style={{ fontSize: '20px', fontWeight: '600', marginBottom: '4px' }}>{storageQuotaFormatted} storage</div>
                    <div style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)' }}>{user?.plan ? `${user.plan.charAt(0).toUpperCase() + user.plan.slice(1)} Plan` : 'Free Plan'}</div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-xl)' }}>
                        {/* Left Column: Includes */}
                        <div className="setting-block" style={{ padding: 'var(--space-lg)' }}>
                            <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-md)', letterSpacing: '0.1em', fontWeight: 700 }}>Includes</h3>
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 var(--space-lg) 0' }}>
                                <li style={{ position: 'relative', paddingLeft: '24px', fontSize: '15px', marginBottom: '12px', color: 'var(--text-primary)' }}>
                                    <span style={{ position: 'absolute', left: 0, top: '8px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }}></span>
                                    {storageQuotaFormatted} of storage
                                </li>
                            </ul>

                            <h3 style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 'var(--space-md)', letterSpacing: '0.1em', fontWeight: 700 }}>Apps and Features</h3>
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 var(--space-md) 0' }}>
                                <li style={{ position: 'relative', paddingLeft: '24px', fontSize: '15px', marginBottom: '12px', color: 'var(--text-primary)' }}>
                                    <span style={{ position: 'absolute', left: 0, top: '8px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }}></span>
                                    Mashcloud Photos
                                </li>
                                <li style={{ position: 'relative', paddingLeft: '24px', fontSize: '15px', marginBottom: '12px', color: 'var(--text-primary)' }}>
                                    <span style={{ position: 'absolute', left: 0, top: '8px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }}></span>
                                    Mashcloud Drive
                                </li>
                                <li style={{ position: 'relative', paddingLeft: '24px', fontSize: '15px', marginBottom: '12px', color: 'var(--text-primary)' }}>
                                    <span style={{ position: 'absolute', left: 0, top: '8px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)' }}></span>
                                    Mashcloud Backup
                                </li>
                            </ul>
                            <a href="#" className="text-link-btn" style={{ fontSize: '14px' }}>See all apps and features ↗</a>
                        </div>

                        {/* Right Column: Upgrade Cards */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
                            {plans.map((plan) => (
                                <div key={plan.key} className="mc-blue-card" style={{ height: 'auto', padding: 0 }}>
                                    <div style={{ padding: 'var(--space-lg)', background: 'var(--surface-2)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-xs)' }}>
                                            <h3 style={{ fontSize: '20px', fontWeight: '700', letterSpacing: '-0.02em' }}>Mashcloud+ {plan.name}</h3>
                                            <span style={{ fontSize: '18px', fontWeight: '600', color: 'var(--accent-primary)' }}>{plan.amountDisplay}/mo</span>
                                        </div>
                                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 'var(--space-md)' }}>
                                            {formatBytes(plan.storageLimitBytes)} storage. {plan.features.join(' • ')}
                                        </p>
                                        <button 
                                            className="btn-signin active" 
                                            style={{ width: '100%', padding: 'var(--space-xs) var(--space-md)', fontSize: '14px' }}
                                            onClick={() => handleUpgrade(plan.key)}
                                            disabled={loading}
                                        >
                                            {loading ? 'Processing...' : `Upgrade to ${plan.name}`}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Upgrade Features Grid Section */}
                <div style={{ paddingBottom: 'var(--space-xxl)' }}>
                    <h2 style={{ fontSize: '32px', fontWeight: '700', marginBottom: 'var(--space-xs)', letterSpacing: '-0.03em' }}>Upgrade to Mashcloud+</h2>
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: 'var(--space-xl)', maxWidth: '700px', lineHeight: 1.5 }}>When you upgrade to Mashcloud+ you get the storage you need plus premium features to protect your privacy.</p>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-lg)' }}>
                        
                        {/* Feature Card 1 */}
                        <div className="setting-block" style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column' }}>
                            <Cloud size={32} color="var(--accent-primary)" style={{ marginBottom: 'var(--space-md)' }} />
                            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: 'var(--space-xs)' }}>More Storage</h3>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-md)', flexGrow: 1 }}>
                                Choose the amount of storage that's right for you. Mashcloud+ plans include 50 GB, 200 GB, 2 TB, 6 TB or 12 TB of storage.
                            </p>
                            <a href="#" className="text-link-btn">Learn more ↗</a>
                        </div>

                        {/* Feature Card 2 */}
                        <div className="setting-block" style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column' }}>
                            <Shield size={32} color="var(--accent-primary)" style={{ marginBottom: 'var(--space-md)' }} />
                            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: 'var(--space-xs)' }}>Advanced Data Protection</h3>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-md)', flexGrow: 1 }}>
                                Use Advanced Data Protection to keep your files, photos, and backups end-to-end encrypted so only you can access them.
                            </p>
                            <a href="#" className="text-link-btn">Learn more ↗</a>
                        </div>

                        {/* Feature Card 3 */}
                        <div className="setting-block" style={{ padding: 'var(--space-lg)', display: 'flex', flexDirection: 'column' }}>
                            <LinkIcon size={32} color="var(--accent-primary)" style={{ marginBottom: 'var(--space-md)' }} />
                            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: 'var(--space-xs)' }}>Secure Link Sharing</h3>
                            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-md)', flexGrow: 1 }}>
                                Create password-protected and expiring links to safely share your files and folders with anyone, keeping your data secure.
                            </p>
                            <a href="#" className="text-link-btn">Learn more ↗</a>
                        </div>

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
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );
};

export default Plan;
