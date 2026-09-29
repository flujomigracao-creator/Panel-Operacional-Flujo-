import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        // El CRM se diseñó en claro: es el tema por defecto. 'theme_v2' ignora la preferencia vieja
        // (que se guardaba siempre como 'dark' aunque nadie la hubiera elegido).
        try {
            return localStorage.getItem('theme_v2') || 'light';
        } catch {
            return 'light';
        }
    });

    useEffect(() => {
        // Apply theme to document element
        document.documentElement.setAttribute('data-theme', theme);
        // Save to localStorage
        try { localStorage.setItem('theme_v2', theme); } catch { /* sin storage */ }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    const value = {
        theme,
        toggleTheme,
        setTheme
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};