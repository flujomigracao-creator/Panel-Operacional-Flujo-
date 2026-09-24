import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(_error) {
        // Update state so the next render will show the fallback UI.
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // You can also log the error to an error reporting service
        console.error('Error caught by boundary:', error, errorInfo);
        this.setState({
            error: error,
            errorInfo: errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            // You can render any custom fallback UI
            return (
                <div style={{
                    padding: '2rem',
                    textAlign: 'center',
                    color: 'var(--color-text-primary, #333)',
                    backgroundColor: 'var(--color-bg-canvas, #fff)',
                    minHeight: '100vh',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}>
                    <h2 style={{
                        color: 'var(--color-error, #ef4444)',
                        marginBottom: '1rem',
                        fontSize: '1.5rem'
                    }}>Algo salió mal.</h2>
                    <details style={{
                        whiteSpace: 'pre-wrap',
                        textAlign: 'left',
                        marginTop: '1rem',
                        padding: '1rem',
                        background: 'var(--color-bg-elevated, #f5f5f5)',
                        borderRadius: 'var(--radius-md, 4px)',
                        maxHeight: '200px',
                        overflow: 'auto',
                        border: '1px solid var(--color-border, #ddd)'
                    }}>
                        <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>Detalles del error</summary>
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo?.componentStack}
                    </details>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            marginTop: '1rem',
                            padding: '0.5rem 1rem',
                            backgroundColor: 'var(--color-primary, #007bff)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md, 4px)',
                            cursor: 'pointer'
                        }}
                    >
                        Recargar Página
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export { ErrorBoundary };
