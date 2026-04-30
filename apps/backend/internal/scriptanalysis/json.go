package scriptanalysis

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/model"
)

func ExtractJSONObject(raw string) (map[string]interface{}, string, error) {
	body := strings.TrimSpace(raw)
	if strings.HasPrefix(body, "```json") {
		body = strings.TrimPrefix(body, "```json")
		if end := strings.LastIndex(body, "```"); end >= 0 {
			body = body[:end]
		}
	} else if strings.HasPrefix(body, "```") {
		body = strings.TrimPrefix(body, "```")
		if end := strings.LastIndex(body, "```"); end >= 0 {
			body = body[:end]
		}
	}
	body = strings.TrimSpace(body)
	if !strings.HasPrefix(body, "{") {
		if start := strings.Index(body, "{"); start >= 0 {
			body = body[start:]
		}
	}
	if !strings.HasSuffix(body, "}") {
		if end := strings.LastIndex(body, "}"); end >= 0 {
			body = body[:end+1]
		}
	}

	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(body), &payload); err != nil {
		return nil, body, fmt.Errorf("parse analysis JSON: %w", err)
	}
	return payload, body, nil
}

func ToJSON(value interface{}) string {
	if value == nil {
		return ""
	}
	b, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	return string(b)
}

func NormalizePayloadForScript(script model.Script, payload map[string]interface{}) map[string]interface{} {
	if payload == nil {
		payload = map[string]interface{}{}
	}
	normalized := make(map[string]interface{}, len(payload)+2)
	for key, value := range payload {
		normalized[key] = value
	}

	switch script.ScriptType {
	case "episode":
		if scenes, ok := normalized["involved_scenes"]; ok {
			normalized["planned_scene_count"] = countItems(scenes)
			appendEntityCandidates(normalized, scenes, "scene_script")
		}
	case "main":
		appendEntityCandidates(normalized, normalized["episode_scripts"], "episode")
		appendEntityCandidates(normalized, normalized["scene_scripts"], "scene_script")
		appendEntityCandidates(normalized, normalized["settings"], "setting")
	}
	if _, ok := normalized["planned_character_count"]; !ok {
		if count := countItems(normalized["structured_characters"]); count > 0 {
			normalized["planned_character_count"] = count
		} else if count := countItems(normalized["character_profiles"]); count > 0 {
			normalized["planned_character_count"] = count
		}
	}

	return normalized
}

func countItems(value interface{}) int {
	switch items := value.(type) {
	case []interface{}:
		return len(items)
	case []map[string]interface{}:
		return len(items)
	default:
		return 0
	}
}

func appendEntityCandidates(payload map[string]interface{}, raw interface{}, defaultType string) {
	items := normalizedItems(raw)
	if len(items) == 0 {
		return
	}
	candidates := entityCandidateSlice(payload["entity_candidates"])
	seen := make(map[string]struct{}, len(candidates)+len(items))
	for _, candidate := range candidates {
		seen[candidateKey(candidate)] = struct{}{}
	}
	for index, item := range items {
		source := item
		candidate := map[string]interface{}{
			"id":          firstString(source, "id"),
			"type":        firstString(source, "type"),
			"name":        firstString(source, "title", "name", "location_text"),
			"summary":     firstString(source, "summary", "description", "outline", "plot"),
			"description": firstString(source, "description", "summary", "outline"),
			"outline":     firstString(source, "outline", "summary", "description"),
			"evidence":    firstString(source, "source_range", "evidence"),
		}
		copyCandidateField(candidate, source, "order")
		copyCandidateField(candidate, source, "hook")
		copyCandidateField(candidate, source, "content")
		copyCandidateField(candidate, source, "raw_source")
		copyCandidateField(candidate, source, "source_range")
		copyCandidateField(candidate, source, "episode_id")
		copyCandidateField(candidate, source, "scene_refs")
		copyCandidateField(candidate, source, "time_text")
		copyCandidateField(candidate, source, "location_text")
		copyCandidateField(candidate, source, "characters")
		copyCandidateField(candidate, source, "plot")
		copyCandidateField(candidate, source, "atmosphere")
		if candidate["id"] == "" {
			candidate["id"] = fmt.Sprintf("%s_%d", defaultType, index+1)
		}
		if candidate["type"] == "" {
			candidate["type"] = defaultType
		}
		key := candidateKey(candidate)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		candidates = append(candidates, candidate)
	}
	payload["entity_candidates"] = candidates
}

func normalizedItems(raw interface{}) []map[string]interface{} {
	switch items := raw.(type) {
	case []interface{}:
		out := make([]map[string]interface{}, 0, len(items))
		for index, item := range items {
			switch source := item.(type) {
			case map[string]interface{}:
				out = append(out, source)
			case string:
				text := strings.TrimSpace(source)
				if text != "" {
					out = append(out, map[string]interface{}{"id": fmt.Sprintf("item_%d", index+1), "name": text, "description": text})
				}
			}
		}
		return out
	case []map[string]interface{}:
		return append([]map[string]interface{}{}, items...)
	case []string:
		out := make([]map[string]interface{}, 0, len(items))
		for index, text := range items {
			text = strings.TrimSpace(text)
			if text != "" {
				out = append(out, map[string]interface{}{"id": fmt.Sprintf("item_%d", index+1), "name": text, "description": text})
			}
		}
		return out
	case map[string]interface{}:
		return []map[string]interface{}{items}
	case string:
		lines := strings.Split(items, "\n")
		out := make([]map[string]interface{}, 0, len(lines))
		for index, line := range lines {
			text := strings.TrimSpace(strings.TrimLeft(line, "-* "))
			if text != "" {
				out = append(out, map[string]interface{}{"id": fmt.Sprintf("item_%d", index+1), "name": text, "description": text})
			}
		}
		return out
	default:
		return nil
	}
}

func copyCandidateField(candidate map[string]interface{}, source map[string]interface{}, key string) {
	if value, ok := source[key]; ok {
		candidate[key] = value
	}
}

func entityCandidateSlice(raw interface{}) []interface{} {
	items, ok := raw.([]interface{})
	if !ok {
		return []interface{}{}
	}
	return append([]interface{}{}, items...)
}

func candidateKey(candidate interface{}) string {
	item, ok := candidate.(map[string]interface{})
	if !ok {
		return fmt.Sprintf("%v", candidate)
	}
	return firstString(item, "type") + ":" + firstString(item, "id", "name", "title")
}

func firstString(item map[string]interface{}, keys ...string) string {
	for _, key := range keys {
		if value, ok := item[key]; ok {
			text := strings.TrimSpace(fmt.Sprint(value))
			if text != "" && text != "<nil>" {
				return text
			}
		}
	}
	return ""
}
