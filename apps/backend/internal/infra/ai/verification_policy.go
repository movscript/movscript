package ai

// RequiresImageVerification reports whether this model family should enforce
// verified image inputs before video generation.
//
// TODO: 真人认证仅在极少数情况下触发，后续需要按具体模型 / 业务场景填入白名单。
// 当前先留空，所有模型均不触发认证。
func (def *ModelDef) RequiresImageVerification() bool {
	if def == nil {
		return false
	}
	return false
}
