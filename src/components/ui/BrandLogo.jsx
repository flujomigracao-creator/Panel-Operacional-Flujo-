import React from 'react';

export function BrandLogo({ size = 32, className = '', animated = true }) {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Glow and Energy Gradients - INCREASED BRIGHTNESS */}
        <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#d8b4fe" stopOpacity="1" />
          <stop offset="40%" stopColor="#a855f7" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#4c1d95" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="energyStream1" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67e8f9" stopOpacity="0" />
          <stop offset="0.5" stopColor="#d8b4fe" stopOpacity="1" />
          <stop offset="1" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>

        <linearGradient id="energyStream2" x1="100" y1="100" x2="0" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a5b4fc" stopOpacity="0" />
          <stop offset="0.5" stopColor="#e879f9" stopOpacity="1" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </linearGradient>

        {/* Heavy Neon Glow Filter */}
        <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {animated && (
        <>
          <style>
            {`
              @keyframes pulseCore {
                0% { transform: scale(0.9); opacity: 0.7; }
                50% { transform: scale(1.3); opacity: 1; }
                100% { transform: scale(0.9); opacity: 0.7; }
              }
              @keyframes orbitRight {
                0% { transform: rotate(0deg) scale(1); }
                50% { transform: rotate(180deg) scale(1.05); }
                100% { transform: rotate(360deg) scale(1); }
              }
              @keyframes orbitLeft {
                0% { transform: rotate(360deg) scale(1); }
                50% { transform: rotate(180deg) scale(0.95); }
                100% { transform: rotate(0deg) scale(1); }
              }
              @keyframes streamFlow {
                from { stroke-dashoffset: 150; }
                to { stroke-dashoffset: -150; }
              }
              
              .logo-core-glow {
                transform-origin: 50px 50px;
                animation: pulseCore 4s ease-in-out infinite;
              }
              .logo-orbit-1 {
                transform-origin: 50px 50px;
                animation: orbitRight 12s linear infinite;
              }
              .logo-orbit-2 {
                transform-origin: 50px 50px;
                animation: orbitLeft 15s linear infinite;
              }
              .logo-stream {
                stroke-dasharray: 20 130;
                animation: streamFlow 3s linear infinite;
              }
              .logo-stream-delayed {
                stroke-dasharray: 15 135;
                animation: streamFlow 4s linear infinite;
                animation-delay: -1.5s;
              }
              .logo-stream-fast {
                stroke-dasharray: 30 120;
                animation: streamFlow 2.5s linear infinite;
                animation-delay: -0.8s;
              }
            `}
          </style>

          {/* Core background aura */}
          <circle cx="50" cy="50" r="55" fill="url(#coreGlow)" className="logo-core-glow" />

          {/* Glowing Animated Effects Layer */}
          <g filter="url(#neonGlow)">
            {/* Orbital energy rings */}
            <ellipse cx="50" cy="50" rx="45" ry="18" fill="none" stroke="url(#energyStream1)" strokeWidth="1.2" className="logo-orbit-1" opacity="0.9" />
            <ellipse cx="50" cy="50" rx="20" ry="50" fill="none" stroke="url(#energyStream2)" strokeWidth="1.2" className="logo-orbit-2" opacity="0.8" />

            {/* Shooting light streams (Particles) */}
            <path d="M 10 90 C -20 40, 20 -20, 80 10" fill="none" stroke="url(#energyStream1)" strokeWidth="2" className="logo-stream" strokeLinecap="round" />
            <path d="M 90 90 C 120 40, 80 -20, 20 10" fill="none" stroke="url(#energyStream2)" strokeWidth="1.5" className="logo-stream-delayed" strokeLinecap="round" />
            <path d="M 30 100 C 0 60, 10 0, 90 40" fill="none" stroke="#67e8f9" strokeWidth="1.8" className="logo-stream-fast" strokeLinecap="round" opacity="1" />
            <path d="M 70 100 C 100 60, 90 0, 10 40" fill="none" stroke="#e879f9" strokeWidth="1.2" className="logo-stream" strokeLinecap="round" opacity="0.9" style={{ animationDuration: '3.5s' }} />
          </g>
        </>
      )}

      {/* Right Leg (Darker, behind) */}
      <path d="M 50 10 L 75 90 L 100 90 L 60 10 Z" fill="#5b21b6" />

      {/* Left Leg 3D (Front Face) */}
      <path d="M 40 10 L 0 90 L 14 90 L 45 10 Z" fill="#a855f7" />

      {/* Left Leg 3D (Side Face, darker) */}
      <path d="M 45 10 L 14 90 L 25 90 L 50 10 Z" fill="#7c3aed" />

      {/* Database Disks (Stacked inside) */}
      <g stroke="#09090b" strokeWidth="3.5" strokeLinejoin="round">
        {/* Bottom Disk */}
        <path d="M 29 74 v 14 a 21 7 0 0 0 42 0 v -14 Z" fill="#4c1d95" />
        <ellipse cx="50" cy="74" rx="21" ry="7" fill="#7c3aed" />

        {/* Middle Disk */}
        <path d="M 29 58 v 14 a 21 7 0 0 0 42 0 v -14 Z" fill="#4c1d95" />
        <ellipse cx="50" cy="58" rx="21" ry="7" fill="#8b5cf6" />

        {/* Top Disk */}
        <path d="M 29 42 v 14 a 21 7 0 0 0 42 0 v -14 Z" fill="#4c1d95" />
        <ellipse cx="50" cy="42" rx="21" ry="7" fill="#a855f7" />
      </g>
    </svg>
  );
}

export function BrandLogoText({ size = 24, className = '', showText = true, href, onClick }) {
  const content = (
    <div className={`flex items-center gap-1 font-bold ${className}`} style={{ fontSize: size }}>
      {showText && <span className="tracking-widest" style={{ color: 'var(--color-text-primary)' }}>OPERACIONAL PCBR</span>}
    </div>
  );

  if (href) {
    return (
      <a href={href} onClick={onClick} style={{ textDecoration: 'none', cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = 0.85} onMouseLeave={(e) => e.currentTarget.style.opacity = 1}>
        {content}
      </a>
    );
  }

  if (onClick) {
    return (
      <div onClick={onClick} style={{ cursor: 'pointer', transition: 'opacity 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.opacity = 0.85} onMouseLeave={(e) => e.currentTarget.style.opacity = 1}>
        {content}
      </div>
    );
  }

  return content;
}
