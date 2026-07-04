export const LOCAL_BACKEND_PORT = process.env.MOVSCRIPT_LOCAL_BACKEND_PORT?.trim() || '8766'
export const LOCAL_BACKEND_URL = process.env.MOVSCRIPT_LOCAL_BACKEND_URL?.trim() || `http://localhost:${LOCAL_BACKEND_PORT}`
