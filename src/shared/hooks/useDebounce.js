import { useState, useEffect } from 'react';

// Hook personalizado para implementar debouncing en la búsqueda
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        // Actualiza debouncedValue después del delay
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        // Cancela el timeout si el valor cambia antes del delay
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
};

export default useDebounce;