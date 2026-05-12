package ai

// NormalizeGenerationParams accepts the abstract parameter keys exposed to admins
// and users, while preserving backward compatibility with older provider-native
// keys stored in existing model configs/jobs.
func NormalizeGenerationParams(params map[string]any) map[string]any {
	if params == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(params)+4)
	for k, v := range params {
		out[k] = v
	}
	copyIfMissing(out, "aspect_ratio", "ratio")
	copyIfMissing(out, "duration", "duration_seconds")
	copyIfMissing(out, "size", "image_size")
	copyIfMissing(out, "guidance_scale", "prompt_strength")
	copyIfMissing(out, "max_images", "image_count")
	copyIfMissing(out, "camera_fixed", "fixed_camera")
	copyIfMissing(out, "generate_audio", "audio")
	return out
}

func CanonicalizeGenerationParams(params map[string]any) map[string]any {
	if params == nil {
		return map[string]any{}
	}
	out := make(map[string]any, len(params))
	for k, v := range params {
		if isGenerationMetadataParam(k) {
			continue
		}
		out[k] = v
	}
	moveParamAlias(out, "aspect_ratio", "ratio")
	moveParamAlias(out, "duration", "duration_seconds")
	moveParamAlias(out, "image_size", "size")
	moveParamAlias(out, "prompt_strength", "guidance_scale")
	moveParamAlias(out, "image_count", "max_images")
	moveParamAlias(out, "fixed_camera", "camera_fixed")
	moveParamAlias(out, "audio", "generate_audio")
	return out
}

func isGenerationMetadataParam(key string) bool {
	switch key {
	case "source", "asset_slot_id", "asset_kind":
		return true
	default:
		return false
	}
}

func NormalizeParamDefsForUI(params []ParamDef) []ParamDef {
	out := make([]ParamDef, 0, len(params))
	for _, p := range params {
		switch p.Key {
		case "ratio":
			p.Key = "aspect_ratio"
			if p.Label == "" || p.Label == "ratio" {
				p.Label = "画面比例"
			}
		case "size":
			p.Key = "image_size"
			if p.Label == "" || p.Label == "尺寸" {
				p.Label = "画面尺寸"
			}
		case "guidance_scale":
			p.Key = "prompt_strength"
			if p.Label == "" || p.Label == "文本权重" {
				p.Label = "提示词强度"
			}
		case "max_images":
			p.Key = "image_count"
			if p.Label == "" || p.Label == "最多张数" {
				p.Label = "生成张数"
			}
		case "camera_fixed":
			p.Key = "fixed_camera"
			if p.Label == "" || p.Label == "固定镜头" {
				p.Label = "固定镜头"
			}
		case "generate_audio":
			p.Key = "audio"
			if p.Label == "" || p.Label == "生成音频" {
				p.Label = "生成音频"
			}
		}
		for i, key := range p.ConflictsWith {
			p.ConflictsWith[i] = normalizeParamKey(key)
		}
		for i := range p.ConditionalEnum {
			p.ConditionalEnum[i].WhenParam = normalizeParamKey(p.ConditionalEnum[i].WhenParam)
		}
		out = append(out, p)
	}
	return out
}

func copyIfMissing(params map[string]any, target, source string) {
	if _, ok := params[target]; ok {
		return
	}
	if v, ok := params[source]; ok {
		params[target] = v
	}
}

func moveParamAlias(params map[string]any, target, source string) {
	if _, ok := params[target]; !ok {
		if v, ok := params[source]; ok {
			params[target] = v
		}
	}
	delete(params, source)
}
