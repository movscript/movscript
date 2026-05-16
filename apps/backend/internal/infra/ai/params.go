package ai

type generationParamAlias struct {
	Canonical       string
	Legacy          string
	DefaultLabel    string
	ReplaceLabels   []string
	NormalizeLegacy bool
}

var generationParamAliases = []generationParamAlias{
	{Canonical: "aspect_ratio", Legacy: "ratio", DefaultLabel: "画面比例", ReplaceLabels: []string{"ratio"}, NormalizeLegacy: true},
	{Canonical: "duration", Legacy: "duration_seconds", DefaultLabel: "时长(秒)", ReplaceLabels: []string{"duration_seconds"}, NormalizeLegacy: true},
	{Canonical: "image_size", Legacy: "size", DefaultLabel: "画面尺寸", ReplaceLabels: []string{"尺寸"}, NormalizeLegacy: false},
	{Canonical: "prompt_strength", Legacy: "guidance_scale", DefaultLabel: "提示词强度", ReplaceLabels: []string{"文本权重"}, NormalizeLegacy: false},
	{Canonical: "image_count", Legacy: "max_images", DefaultLabel: "生成张数", ReplaceLabels: []string{"最多张数"}, NormalizeLegacy: false},
	{Canonical: "fixed_camera", Legacy: "camera_fixed", DefaultLabel: "固定镜头", ReplaceLabels: []string{"固定镜头"}, NormalizeLegacy: false},
	{Canonical: "audio", Legacy: "generate_audio", DefaultLabel: "生成音频", ReplaceLabels: []string{"生成音频"}, NormalizeLegacy: false},
}

func generationParamAliasMap() map[string]string {
	aliases := make(map[string]string, len(generationParamAliases))
	for _, alias := range generationParamAliases {
		aliases[alias.Legacy] = alias.Canonical
	}
	return aliases
}

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
	for _, alias := range generationParamAliases {
		if alias.NormalizeLegacy {
			copyIfMissing(out, alias.Canonical, alias.Legacy)
			continue
		}
		copyIfMissing(out, alias.Legacy, alias.Canonical)
	}
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
	for _, alias := range generationParamAliases {
		moveParamAlias(out, alias.Canonical, alias.Legacy)
	}
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
		p = normalizeParamDefAlias(p)
		for i, key := range p.ConflictsWith {
			p.ConflictsWith[i] = normalizeParamKey(key)
		}
		for i := range p.ConditionalEnum {
			p.ConditionalEnum[i].WhenParam = normalizeParamKey(p.ConditionalEnum[i].WhenParam)
		}
		for i := range p.ConditionalConst {
			p.ConditionalConst[i].WhenParam = normalizeParamKey(p.ConditionalConst[i].WhenParam)
		}
		for i := range p.RequiresValue {
			p.RequiresValue[i].Param = normalizeParamKey(p.RequiresValue[i].Param)
		}
		out = append(out, p)
	}
	return out
}

func normalizeParamDefAlias(p ParamDef) ParamDef {
	for _, alias := range generationParamAliases {
		if p.Key != alias.Legacy {
			continue
		}
		p.Key = alias.Canonical
		if shouldReplaceParamLabel(p.Label, alias.ReplaceLabels) {
			p.Label = alias.DefaultLabel
		}
		return p
	}
	return p
}

func shouldReplaceParamLabel(label string, replaceLabels []string) bool {
	if label == "" {
		return true
	}
	for _, replaceLabel := range replaceLabels {
		if label == replaceLabel {
			return true
		}
	}
	return false
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
