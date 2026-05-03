package job

import (
	"encoding/json"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/movscript/movscript/internal/model"
)

func validateProviderResultURL(providerURL string) error {
	if providerURL == "" {
		return fmt.Errorf("provider result URL is empty")
	}
	if strings.HasPrefix(providerURL, "data:") {
		return nil
	}
	u, err := url.Parse(providerURL)
	if err != nil {
		return fmt.Errorf("provider result URL is invalid: %w", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return fmt.Errorf("provider result URL must use http, https, or data URI, got scheme %q", u.Scheme)
	}
	return nil
}

func parseResourceIDs(s string) []uint {
	if s == "" || s == "[]" {
		return nil
	}
	var ids []uint
	_ = json.Unmarshal([]byte(s), &ids)
	return ids
}

// resolveMentions parses @[resource:ID] markers in the prompt.
// Each marker is replaced with "图片N" (N = order of first appearance, 1-based).
// All mentioned resource IDs are merged into existingInputIDs so that
// loadInputResources picks them up. The first mentioned resource is also promoted
// to InputResourceID for backward-compat.
func (w *Worker) resolveMentions(prompt string, existingInput *uint, existingInputIDs string) (string, *uint, string) {
	re := regexp.MustCompile(`@\[resource:(\d+)\]`)
	inputID := existingInput

	var order []uint
	seen := map[uint]int{}
	for _, sub := range re.FindAllStringSubmatch(prompt, -1) {
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			continue
		}
		id := uint(id64)
		if _, ok := seen[id]; !ok {
			order = append(order, id)
			seen[id] = len(order)
		}
	}

	if len(order) > 0 && inputID == nil {
		first := order[0]
		inputID = &first
	}

	mergedIDs := parseResourceIDs(existingInputIDs)
	existing := make(map[uint]bool, len(mergedIDs))
	for _, id := range mergedIDs {
		existing[id] = true
	}
	for _, id := range order {
		if !existing[id] {
			mergedIDs = append(mergedIDs, id)
		}
	}
	mergedIDsJSON := ""
	if len(mergedIDs) > 0 {
		if b, err := json.Marshal(mergedIDs); err == nil {
			mergedIDsJSON = string(b)
		}
	}

	cleaned := re.ReplaceAllStringFunc(prompt, func(match string) string {
		sub := re.FindStringSubmatch(match)
		if len(sub) < 2 {
			return ""
		}
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			return ""
		}
		id := uint(id64)
		return fmt.Sprintf("图片%d", seen[id])
	})

	cleaned = strings.TrimSpace(cleaned)
	return cleaned, inputID, mergedIDsJSON
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func getBoolPtr(values map[string]interface{}, key string) *bool {
	v, ok := values[key]
	if !ok {
		return nil
	}
	switch t := v.(type) {
	case bool:
		b := t
		return &b
	case string:
		switch strings.ToLower(strings.TrimSpace(t)) {
		case "true", "1", "yes", "on":
			b := true
			return &b
		case "false", "0", "no", "off":
			b := false
			return &b
		}
	}
	return nil
}

func typeFromMime(mime string) string {
	switch {
	case strings.HasPrefix(mime, "image/"):
		return "image"
	case strings.HasPrefix(mime, "video/"):
		return "video"
	case strings.HasPrefix(mime, "audio/"):
		return "audio"
	}
	return "image"
}

func extFromMime(mime string) string {
	switch mime {
	case "image/png":
		return "png"
	case "image/jpeg":
		return "jpg"
	case "image/webp":
		return "webp"
	case "video/mp4":
		return "mp4"
	case "video/webm":
		return "webm"
	default:
		if strings.HasPrefix(mime, "image/") {
			return "png"
		}
		return "mp4"
	}
}

func (w *Worker) loadModelConfig(id uint) *model.AIModelConfig {
	var cfg model.AIModelConfig
	if err := w.db.First(&cfg, id).Error; err != nil {
		return nil
	}
	return &cfg
}
