package ai

import "fmt"

type ValidationError struct {
	Code          string         `json:"code"`
	Message       string         `json:"message"`
	Field         string         `json:"field,omitempty"`
	AllowedValues []string       `json:"allowed_values,omitempty"`
	SuggestedFix  map[string]any `json:"suggested_fix,omitempty"`
}

func (e *ValidationError) Error() string {
	if e == nil {
		return ""
	}
	return e.Message
}

func newValidationError(code, message, field string) *ValidationError {
	return &ValidationError{
		Code:    code,
		Message: message,
		Field:   field,
	}
}

func unsupportedParameterError(key, model string) *ValidationError {
	return newValidationError(
		"UNSUPPORTED_PARAMETER",
		fmt.Sprintf("parameter %q is not supported by model %q", key, model),
		key,
	)
}

func invalidParamTypeError(key, expected string) *ValidationError {
	return newValidationError(
		"INVALID_PARAMETER_TYPE",
		fmt.Sprintf("parameter %q must be %s", key, expected),
		key,
	)
}

func invalidParamOptionError(key string, allowed []string) *ValidationError {
	err := newValidationError(
		"INVALID_PARAMETER_OPTION",
		fmt.Sprintf("parameter %q must be one of [%s]", key, joinStrings(allowed, ", ")),
		key,
	)
	err.AllowedValues = append([]string{}, allowed...)
	if len(allowed) > 0 {
		err.SuggestedFix = map[string]any{key: allowed[0]}
	}
	return err
}

func invalidParamRangeError(key, op string, limit float64) *ValidationError {
	return newValidationError(
		"INVALID_PARAMETER_RANGE",
		fmt.Sprintf("parameter %q must be %s %v", key, op, limit),
		key,
	)
}

func invalidParamCombinationError(message string, fields ...string) *ValidationError {
	field := ""
	if len(fields) > 0 {
		field = fields[0]
	}
	return newValidationError("INVALID_PARAMETER_COMBINATION", message, field)
}

func joinStrings(values []string, sep string) string {
	if len(values) == 0 {
		return ""
	}
	out := values[0]
	for _, value := range values[1:] {
		out += sep + value
	}
	return out
}
