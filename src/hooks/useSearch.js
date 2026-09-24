import { useState, useCallback } from 'react';

/**
 * useSearch — Maneja el estado de búsqueda global.
 * @param {function} onSearchStart  Callback cuando el usuario empieza a escribir
 *                                   (p.ej. cambiar a la vista de clientes).
 */
export const useSearch = (onSearchStart) => {
    const [globalSearch, setGlobalSearch] = useState('');

    const handleSearchChange = useCallback((e) => {
        setGlobalSearch(e.target.value);
        if (onSearchStart) {
            onSearchStart();
        }
    }, [onSearchStart]);

    return {
        globalSearch,
        setGlobalSearch,
        handleSearchChange,
    };
};