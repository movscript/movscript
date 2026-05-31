package shotreference

import (
	"regexp"
	"strings"

	domainshotreference "github.com/movscript/movscript/internal/domain/shotreference"
)

type shotVocabularyTerm struct {
	ID       string
	Category string
	Labels   []string
	Aliases  []string
}

type shotQueryTranslation struct {
	OriginalQuery string
	Terms         []string
	CanonicalTags map[string][]string
}

var shotSearchVocabulary = []shotVocabularyTerm{
	term("reveal_information", "intent", "揭示信息", "Reveal information", "发现真相", "揭开真相", "发现线索", "信息揭示", "reveal", "discovery", "find the truth"),
	term("create_tension", "intent", "制造紧张感", "Create tension", "气氛变紧", "气氛慢慢变紧", "压迫感", "紧张感", "悬疑感", "tension", "suspense", "pressure"),
	term("isolate_character", "intent", "突出角色孤立", "Isolate character", "孤独", "孤立", "疏离", "一个人", "lonely", "isolate", "alone"),
	term("evoke_memory", "intent", "唤起回忆", "Evoke memory", "回忆", "记忆感", "怀旧", "memory", "nostalgia"),
	term("show_power_shift", "intent", "表现权力变化", "Show power shift", "权力变化", "威胁", "压制", "power shift", "threat", "dominance"),
	term("slow_viewer_down", "intent", "让观众放慢感受", "Slow the viewer down", "慢下来", "沉浸感", "停顿感", "slow down", "linger"),
	term("guide_attention", "intent", "引导注意力", "Guide attention", "引导视线", "强调重点", "guide attention", "direct focus"),

	term("slow_push_in", "pattern", "慢推近", "Slow push-in", "慢慢推近", "镜头缓慢靠近", "慢慢靠近", "靠近角色脸", "压迫式推进", "slow dolly in", "push in", "gradual push"),
	term("handheld_follow", "pattern", "手持跟拍", "Handheld follow", "手持", "跟拍", "晃动跟随", "handheld", "handheld follow", "shaky follow"),
	term("foreground_obstruction", "pattern", "前景遮挡", "Foreground obstruction", "遮挡", "门框遮挡", "窗框遮挡", "偷看感", "foreground obstruction", "frame obstruction", "hidden observer"),
	term("negative_space_pressure", "pattern", "留白压迫", "Negative-space pressure", "留白", "空镜压迫", "空旷压迫", "远景孤立", "negative space", "wide empty frame"),
	term("reaction_close_up", "pattern", "反应特写", "Reaction close-up", "表情特写", "脸部特写", "反应镜头", "reaction close-up", "face close-up"),
	term("static_observation", "pattern", "静态观察", "Static observation", "固定机位", "静静观察", "克制观察", "locked-off", "static observation"),
	term("insert_detail", "pattern", "细节插入", "Insert detail", "细节镜头", "物件特写", "线索特写", "insert shot", "detail insert"),

	term("reference_moment", "shotFunction", "参考片刻", "Reference moment", "参考镜头", "参考片段", "reference shot"),
	term("visual_cue", "shotFunction", "视觉提示", "Visual cue", "视觉线索", "提示信息", "visual cue"),
	term("tension_buildup", "shotFunction", "铺垫紧张", "Tension buildup", "气氛慢慢变紧", "紧张铺垫", "逐渐紧张", "气氛累积", "tension buildup"),
	term("emotional_pause", "shotFunction", "情绪停顿", "Emotional pause", "情绪停留", "沉默停顿", "emotional pause"),
	term("delayed_reveal", "shotFunction", "延迟揭示", "Delayed reveal", "延迟揭露", "先藏后露", "慢慢揭示", "delayed reveal"),
	term("build_tension", "shotFunction", "积累紧张", "Build tension", "积累压迫", "紧张累积", "build tension"),

	term("landscape_frame", "visualPreference", "横构图", "Landscape frame", "横屏", "横画幅", "landscape"),
	term("vertical_frame", "visualPreference", "竖构图", "Vertical frame", "竖屏", "竖画幅", "vertical"),
	term("square_frame", "visualPreference", "方构图", "Square frame", "方画幅", "square"),
	term("restrained_pacing", "visualPreference", "克制节奏", "Restrained pacing", "克制", "慢节奏", "不急", "restrained pacing"),
	term("compact_pacing", "visualPreference", "紧凑节奏", "Compact pacing", "紧凑", "快速", "compact pacing"),
	term("video_reference", "visualPreference", "视频参考", "Video reference", "视频镜头", "video reference"),

	term("reference_mood", "emotionalEffect", "参考氛围", "Reference mood", "氛围参考", "reference mood"),
	term("suspense", "emotionalEffect", "悬疑感", "Suspense", "悬疑", "紧张", "不安", "suspense", "unease"),
	term("isolation", "emotionalEffect", "孤立感", "Isolation", "孤独感", "疏离感", "isolation", "loneliness"),

	term("medium_shot", "visual", "中景", "Medium shot", "中景镜头", "medium shot"),
	term("close_up", "visual", "特写", "Close-up", "近景", "脸部特写", "close-up"),
	term("wide_shot", "visual", "远景", "Wide shot", "大远景", "环境远景", "wide shot"),
	term("push_in", "visual", "推近", "Push in", "推进", "靠近", "push in"),
	term("slow", "visual", "缓慢", "Slow", "慢", "slow"),
	term("psychological_pressure", "visual", "心理压迫", "Psychological pressure", "压迫感", "psychological pressure"),
	term("foreground_obstruction", "visual", "前景遮挡", "Foreground obstruction", "遮挡", "foreground obstruction"),
	term("negative_space", "visual", "留白空间", "Negative space", "大面积留白", "negative space"),
	term("low_key", "visual", "低调光", "Low-key lighting", "暗调光线", "low key"),

	term("withhold_then_reveal", "narrative", "隐藏后揭示", "Withhold then reveal", "先藏后露", "延迟揭示", "withhold then reveal"),
	term("setup_or_payoff", "narrative", "铺垫或兑现", "Setup or payoff", "铺垫兑现", "setup payoff"),
	term("narrows_attention", "narrative", "收窄注意力", "Narrows attention", "聚焦视线", "narrows attention"),
	term("prepares_reaction", "narrative", "准备反应镜头", "Prepares reaction", "引出反应", "prepares reaction"),

	term("suspense_or_discovery", "scene", "悬疑或发现", "Suspense or discovery", "发现真相场景", "悬疑发现", "suspense discovery"),
	term("discovery", "scene", "发现", "Discovery", "发现线索", "discovery"),
	term("before_reveal", "scene", "揭示前", "Before reveal", "真相揭示前", "before reveal"),

	term("hidden_observer", "emotion", "隐蔽观察者", "Hidden observer", "偷看者视角", "hidden observer"),
	term("distant_observer", "emotion", "疏离观察者", "Distant observer", "远距离旁观", "distant observer"),

	term("reference_shot", "production", "参考镜头", "Reference shot", "镜头参考", "reference shot"),
	term("slow_dolly_or_gimbal", "production", "慢速轨道或稳定器", "Slow dolly or gimbal", "轨道车", "稳定器慢推", "slow dolly", "gimbal"),
	term("foreground_layer", "production", "前景层", "Foreground layer", "前景物", "foreground layer"),
	term("controlled_focus", "production", "可控焦点", "Controlled focus", "控制焦点", "controlled focus"),
}

var searchPunctuationPattern = regexp.MustCompile(`[，。！？、；：,.!?;:()\[\]{}"'` + "`" + `~|/\\_-]+`)

func term(id string, category string, labelsAndAliases ...string) shotVocabularyTerm {
	labels := []string{}
	aliases := []string{}
	if len(labelsAndAliases) > 0 {
		labels = append(labels, labelsAndAliases[0])
	}
	if len(labelsAndAliases) > 1 {
		labels = append(labels, labelsAndAliases[1])
	}
	if len(labelsAndAliases) > 2 {
		aliases = append(aliases, labelsAndAliases[2:]...)
	}
	return shotVocabularyTerm{ID: id, Category: category, Labels: labels, Aliases: aliases}
}

func translateShotQuery(query string) shotQueryTranslation {
	normalizedQuery := normalizeSearchText(query)
	canonicalTags := map[string][]string{}
	expanded := []string{}
	expanded = appendUniqueString(expanded, query)
	expanded = append(expanded, splitSearchTerms(query)...)

	for _, item := range shotSearchVocabulary {
		if !vocabularyTermMatches(normalizedQuery, item) {
			continue
		}
		canonicalTags[item.Category] = appendUniqueString(canonicalTags[item.Category], item.ID)
		expanded = appendUniqueString(expanded, item.ID)
		expanded = appendUniqueString(expanded, item.Labels...)
		expanded = appendUniqueString(expanded, item.Aliases...)
	}

	terms := []string{}
	for _, value := range expanded {
		clean := normalizeSearchText(value)
		if usefulSearchTerm(clean) {
			terms = appendUniqueString(terms, clean)
		}
	}
	return shotQueryTranslation{
		OriginalQuery: strings.TrimSpace(query),
		Terms:         terms,
		CanonicalTags: canonicalTags,
	}
}

func vocabularyTermMatches(normalizedQuery string, item shotVocabularyTerm) bool {
	if normalizedQuery == "" {
		return false
	}
	probes := []string{item.ID}
	probes = append(probes, item.Labels...)
	probes = append(probes, item.Aliases...)
	for _, probe := range probes {
		if probeMatchesQuery(normalizedQuery, probe) {
			return true
		}
	}
	return false
}

func probeMatchesQuery(normalizedQuery string, probe string) bool {
	normalizedProbe := normalizeSearchText(probe)
	if normalizedProbe == "" {
		return false
	}
	if isShortASCIIToken(normalizedProbe) {
		for _, term := range strings.Fields(normalizedQuery) {
			if term == normalizedProbe {
				return true
			}
		}
		return false
	}
	return strings.Contains(normalizedQuery, normalizedProbe)
}

func normalizeSearchText(value string) string {
	clean := strings.ToLower(strings.TrimSpace(value))
	clean = searchPunctuationPattern.ReplaceAllString(clean, " ")
	return strings.Join(strings.Fields(clean), " ")
}

func splitSearchTerms(value string) []string {
	return strings.Fields(normalizeSearchText(value))
}

func usefulSearchTerm(value string) bool {
	if value == "" {
		return false
	}
	if len(value) < 3 && isASCII(value) {
		return false
	}
	switch value {
	case "the", "and", "or", "to", "in", "of", "a", "an":
		return false
	}
	return true
}

func isShortASCIIToken(value string) bool {
	return len(value) <= 4 && isASCII(value) && !strings.Contains(value, " ")
}

func isASCII(value string) bool {
	for _, r := range value {
		if r > 127 {
			return false
		}
	}
	return true
}

func appendUniqueString(target []string, values ...string) []string {
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean == "" || stringSliceContains(target, clean) {
			continue
		}
		target = append(target, clean)
	}
	return target
}

func referenceFacetValues(reference domainshotreference.ShotReference, category string) []string {
	switch category {
	case "visual":
		return uniqueSearchStrings(compactSearchStrings(append([]string{
			reference.VisualAnalysis.ShotSize,
			reference.VisualAnalysis.CameraMovement.Type,
			reference.VisualAnalysis.CameraMovement.Stability,
			reference.VisualAnalysis.Focus.Behavior,
			reference.VisualAnalysis.CameraMovement.Motivation,
		}, append(reference.VisualAnalysis.Framing, reference.VisualAnalysis.Composition...)...)))
	case "narrative":
		return uniqueSearchStrings(compactSearchStrings(append([]string{
			reference.NarrativeFunction.Primary,
			reference.NarrativeFunction.InformationState,
			reference.NarrativeFunction.SequencePosition,
			reference.NarrativeFunction.RelationToPrevious,
			reference.NarrativeFunction.RelationToNext,
		}, reference.NarrativeFunction.Secondary...)))
	case "emotion":
		return uniqueSearchStrings(compactSearchStrings(append(append([]string{
			reference.EmotionalProfile.Valence,
			reference.EmotionalProfile.Arousal,
			reference.EmotionalProfile.Dominance,
			reference.EmotionalProfile.ViewerPosition,
		}, reference.EmotionalProfile.Names...), reference.EmotionalEffect...)))
	case "pattern":
		return uniqueSearchStrings(compactSearchStrings(append(append([]string{}, reference.ReusablePattern.PatternIDs...), reference.Pattern...)))
	case "production":
		return uniqueSearchStrings(compactSearchStrings(append([]string{
			reference.ExecutionDetails.AspectRatio,
			reference.ExecutionDetails.Resolution,
			reference.ExecutionDetails.TransitionIn,
			reference.ExecutionDetails.TransitionOut,
			reference.ExecutionDetails.CoverageRole,
			reference.ExecutionDetails.Difficulty,
		}, reference.ExecutionDetails.Requirements...)))
	default:
		return nil
	}
}

func stringSliceContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func compactSearchStrings(values []string) []string {
	result := []string{}
	for _, value := range values {
		clean := strings.TrimSpace(value)
		if clean != "" {
			result = append(result, clean)
		}
	}
	return result
}

func uniqueSearchStrings(values []string) []string {
	result := []string{}
	for _, value := range values {
		if !stringSliceContains(result, value) {
			result = append(result, value)
		}
	}
	return result
}
