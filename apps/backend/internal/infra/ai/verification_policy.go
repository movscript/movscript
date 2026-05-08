package ai

import "strings"

// RequiresImageVerification reports whether this model family should enforce
// verified image inputs before video generation.
func (def *ModelDef) RequiresImageVerification() bool {
	if def == nil {
		return false
	}
	id := strings.ToLower(strings.TrimSpace(def.ID))
	return strings.Contains(id, "seedance")
}
