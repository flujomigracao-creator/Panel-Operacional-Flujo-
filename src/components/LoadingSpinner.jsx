import React from 'react';

const SIZES = {
    sm: 16,
    md: 32,
    lg: 48,
    xl: 64
};

export const LoadingSpinner = ({ size = 'md', className = '', label = 'Cargando' }) => {
    const px = SIZES[size] || SIZES.md;

    return (
        <div
            className={className}
            role="status"
            aria-live="polite"
            aria-label={label}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
            <svg
                className="animate-spin"
                width={px}
                height={px}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                style={{ color: 'var(--brand-primary)' }}
                aria-hidden="true"
            >
                <circle
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    opacity="0.25"
                />
                <path
                    fill="currentColor"
                    opacity="0.85"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
            </svg>
            <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
                {label}
            </span>
        </div>
    );
};

export default LoadingSpinner;