import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Send, Paperclip } from 'lucide-react';
import { api } from '../api';
import './SignIn.css';

const Contact = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        message: ''
    });
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState({ type: '', message: '' });

    useEffect(() => {
        document.body.classList.add('signin-theme');
        return () => document.body.classList.remove('signin-theme');
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setStatus({ type: '', message: '' });

        try {
            const data = new FormData();
            data.append('name', formData.name);
            data.append('email', formData.email);
            data.append('message', formData.message);
            if (file) {
                data.append('attachment', file);
            }

            const res = await api('/api/contact', {
                method: 'POST',
                body: data,
                // Omitting 'Content-Type' so the browser sets the boundary correctly
            });

            const result = await res.json();
            if (res.ok) {
                setStatus({ type: 'success', message: 'Message sent successfully! We will get back to you shortly.' });
                setFormData({ name: '', email: '', message: '' });
                setFile(null);
            } else {
                setStatus({ type: 'error', message: result.error || 'Failed to send message.' });
            }
        } catch (err) {
            setStatus({ type: 'error', message: 'An unexpected error occurred. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="signin-container">
            <div style={{position: 'absolute', top: 30, left: 30, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff'}} onClick={() => navigate(-1)}>
                <ArrowLeft size={20} /> Back
            </div>
            <div className="signin-box" style={{maxWidth: '500px'}}>
                <div className="signin-logo">
                    <Mail size={40} color="#0a84ff" />
                </div>
                <h1 className="signin-title">Contact Us</h1>
                <p className="signin-subtitle">Have a question or need support? Send us a message.</p>

                {status.message && (
                    <div style={{
                        padding: '12px',
                        marginBottom: '20px',
                        borderRadius: '8px',
                        background: status.type === 'error' ? 'rgba(255,59,48,0.1)' : 'rgba(48,209,88,0.1)',
                        color: status.type === 'error' ? '#ff3b30' : '#30d158',
                        fontSize: '14px',
                        textAlign: 'center'
                    }}>
                        {status.message}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="input-group">
                        <label>Your Name</label>
                        <input 
                            type="text" 
                            required 
                            placeholder="John Doe"
                            value={formData.name}
                            onChange={(e) => setFormData({...formData, name: e.target.value})}
                        />
                    </div>
                    <div className="input-group">
                        <label>Email Address</label>
                        <input 
                            type="email" 
                            required 
                            placeholder="you@example.com"
                            value={formData.email}
                            onChange={(e) => setFormData({...formData, email: e.target.value})}
                        />
                    </div>
                    <div className="input-group">
                        <label>Message</label>
                        <textarea 
                            required 
                            placeholder="How can we help you?"
                            rows={5}
                            value={formData.message}
                            onChange={(e) => setFormData({...formData, message: e.target.value})}
                            style={{
                                width: '100%',
                                padding: '14px',
                                background: '#1c1c1e',
                                border: '1px solid #3a3a3c',
                                borderRadius: '12px',
                                color: '#fff',
                                fontSize: '15px',
                                resize: 'vertical'
                            }}
                        />
                    </div>
                    
                    <div className="input-group">
                        <label>Attachment (Optional)</label>
                        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                            <input 
                                type="file" 
                                id="attachment"
                                style={{display: 'none'}}
                                onChange={(e) => setFile(e.target.files[0])}
                            />
                            <button 
                                type="button" 
                                onClick={() => document.getElementById('attachment').click()}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 16px',
                                    background: '#2c2c2e',
                                    border: '1px solid #3a3a3c',
                                    borderRadius: '8px',
                                    color: '#fff',
                                    cursor: 'pointer'
                                }}
                            >
                                <Paperclip size={16} />
                                {file ? file.name : 'Choose File'}
                            </button>
                        </div>
                    </div>

                    <button type="submit" className="signin-button" disabled={loading} style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '24px'}}>
                        {loading ? <div className="spinner" style={{width: '20px', height: '20px', borderWidth: '2px'}}></div> : <><Send size={18} /> Send Message</>}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Contact;
