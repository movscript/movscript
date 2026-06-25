// Package api defines structured API error responses.
// Each response carries a machine-readable code and an optional action that
// tells the client how to react (e.g. redirect, logout, or retry).
package api

// Error codes — stable identifiers the client can switch on.
const (
	CodeNotFound      = "NOT_FOUND"
	CodeInvalidInput  = "INVALID_INPUT"
	CodeForbidden     = "FORBIDDEN"
	CodeAuthRequired  = "AUTH_REQUIRED"
	CodeInternalError = "INTERNAL_ERROR"
	CodeCycleDetected = "CYCLE_DETECTED"
	CodeConflict      = "CONFLICT"
)

// Client-side actions the frontend should execute after showing the error.
const (
	ActionNone             = ""
	ActionLogout           = "logout"            // clear session, redirect to login
	ActionRedirectProjects = "redirect_projects" // go back to project list
	ActionRetry            = "retry"             // surface a retry button
)

// Response is the standard API error body.
type Response struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Action  string `json:"action,omitempty"`
	Debug   any    `json:"debug,omitempty"`
}

func NotFound(msg string) Response {
	return Response{Code: CodeNotFound, Message: msg}
}

func InvalidInput(msg string) Response {
	return Response{Code: CodeInvalidInput, Message: msg}
}

func Forbidden(msg string) Response {
	return Response{Code: CodeForbidden, Message: msg}
}

// ForbiddenProject is like Forbidden but also tells the client to redirect to the project list.
func ForbiddenProject(msg string) Response {
	return Response{Code: CodeForbidden, Message: msg, Action: ActionRedirectProjects}
}

func AuthRequired() Response {
	return Response{Code: CodeAuthRequired, Message: "请先登录", Action: ActionLogout}
}

func Internal(msg string) Response {
	return Response{Code: CodeInternalError, Message: msg, Action: ActionRetry}
}

func Cycle(msg string) Response {
	return Response{Code: CodeCycleDetected, Message: msg}
}

func Conflict(msg string) Response {
	return Response{Code: CodeConflict, Message: msg}
}

func NotFoundDebug(msg string, debug any) Response {
	return Response{Code: CodeNotFound, Message: msg, Debug: debug}
}

func InvalidInputDebug(msg string, debug any) Response {
	return Response{Code: CodeInvalidInput, Message: msg, Debug: debug}
}
