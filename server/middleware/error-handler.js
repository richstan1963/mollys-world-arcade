// _next param required by Express to recognize this as an error handler
export function errorHandler(err, req, res, _next) {
    console.error(`[ERROR] ${req.method} ${req.path}:`, err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
    });
}
