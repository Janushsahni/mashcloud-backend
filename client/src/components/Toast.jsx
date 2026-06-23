import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, XCircle } from 'lucide-react';
import './Toast.css';

const Toast = ({ message, type = 'info', onClose, duration = 3000 }) => {
    useEffect(() => {
        if (duration) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [duration, onClose]);

    const getIcon = () => {
        switch (type) {
            case 'success': return <CheckCircle2 size={18} className="toast-icon success" />;
            case 'error': return <XCircle size={18} className="toast-icon error" />;
            case 'warning': return <AlertCircle size={18} className="toast-icon warning" />;
            default: return <Info size={18} className="toast-icon info" />;
        }
    };

    return (
        <div className={`toast-notification toast-animate-in type-${type}`}>
            {getIcon()}
            <span className="toast-message">{message}</span>
            <button className="toast-close" onClick={onClose}>&times;</button>
        </div>
    );
};

export default Toast;
