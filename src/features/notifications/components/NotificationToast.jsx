import React, { useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

const TYPE_CONFIG = {
    success: { icon: CheckCircle2, color: 'var(--color-success)', bg: 'var(--color-success-bg)', border: 'var(--color-success-border)' },
    error: { icon: XCircle, color: 'var(--color-danger)', bg: 'var(--color-danger-bg)', border: 'var(--color-danger-border)' },
    warning: { icon: AlertTriangle, color: 'var(--color-warning)', bg: 'var(--color-warning-bg)', border: 'var(--color-warning-border)' },
    info: { icon: Info, color: 'var(--color-info)', bg: 'var(--color-info-bg)', border: 'var(--color-info-border)' },
};

const NotificationToast = ({ notification, onClose }) => {
    useEffect(() => {
        if (!notification) return undefined;
        const timer = setTimeout(() => onClose?.(), 5000);
        return () => clearTimeout(timer);
    }, [notification, onClose]);

    if (!notification) return null;

    const cfg = TYPE_CONFIG[notification.type] || TYPE_CONFIG.info;
    const Icon = cfg.icon;

    return (
        <div
            role={notification.type === 'error' ? 'alert' : 'status'}
            aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
            style={{
                position: 'fixed',
                top: 'var(--section-gap, 16px)',
                right: 'var(--section-gap, 16px)',
                zIndex: 1000,
                minWidth: 280,
                maxWidth: 420,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--gap-md, 12px)',
                padding: 'var(--card-padding, 14px 16px)',
                borderRadius: 'var(--card-radius, 10px)',
                border: `1px solid ${cfg.border}`,
                background: cfg.bg,
                color: 'var(--color-text-primary)',
                boxShadow: 'var(--shadow-md)',
                animation: 'fadeUp var(--transition-normal)'
            }}
        >
            <Icon size={18} color={cfg.color} aria-hidden="true" />
            <div style={{ flex: 1, font: 'var(--font-body)' }}>{notification.message}</div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar notificación"
                style={{
                    width: 32,
                    height: 32,
                    background: 'transparent',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <X size={16} />
            </button>
        </div>
    );
};

export { NotificationToast };
export default NotificationToast;