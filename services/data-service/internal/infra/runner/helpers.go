package runner

import (
	"context"
	"encoding/json"
	"fmt"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"net/url"
	"regexp"
	"strconv"
	"strings"
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

// resolveMentions parses @[resource:ID] and typed @[resource:media:role:ID] markers in the prompt.
// Each marker is replaced with "图片N" (N = order of first appearance, 1-based).
// All mentioned resource IDs are merged into existingInputIDs so that
// loadInputResources picks them up. The first mentioned resource is also promoted
// to InputResourceID for backward-compat.
func (w *Worker) resolveMentions(prompt string, existingInput *uint, existingInputIDs string) (string, *uint, string) {
	re := regexp.MustCompile(`@\[resource:([^\]\s]+)\]`)
	inputID := existingInput

	var order []uint
	seen := map[uint]int{}
	for _, sub := range re.FindAllStringSubmatch(prompt, -1) {
		id, ok := resourceIDFromMentionPayload(sub[1])
		if !ok {
			continue
		}
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
		id, ok := resourceIDFromMentionPayload(sub[1])
		if !ok {
			return ""
		}
		return fmt.Sprintf("图片%d", seen[id])
	})

	cleaned = strings.TrimSpace(cleaned)
	return cleaned, inputID, mergedIDsJSON
}

func resourceIDFromMentionPayload(payload string) (uint, bool) {
	payload = strings.TrimSpace(payload)
	if payload == "" {
		return 0, false
	}
	parts := strings.Split(payload, ":")
	raw := strings.TrimSpace(parts[len(parts)-1])
	id64, err := strconv.ParseUint(raw, 10, 64)
	if err != nil || id64 == 0 {
		return 0, false
	}
	return uint(id64), true
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
	case strings.HasPrefix(mime, "text/"), strings.Contains(mime, "json"), strings.Contains(mime, "subrip"):
		return "text"
	}
	return "file"
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
	case "audio/mpeg":
		return "mp3"
	case "audio/wav", "audio/x-wav":
		return "wav"
	case "audio/ogg":
		return "ogg"
	case "audio/aac":
		return "aac"
	case "audio/flac":
		return "flac"
	case "audio/mp4", "audio/m4a":
		return "m4a"
	case "application/x-subrip":
		return "srt"
	case "text/vtt":
		return "vtt"
	case "text/x-ass":
		return "ass"
	case "text/plain":
		return "txt"
	case "application/json":
		return "json"
	default:
		if strings.HasPrefix(mime, "image/") {
			return "png"
		}
		if strings.HasPrefix(mime, "audio/") {
			return "mp3"
		}
		if strings.HasPrefix(mime, "text/") || strings.Contains(mime, "json") {
			return "txt"
		}
		return "bin"
	}
}

func (w *Worker) jobModelDefID(ctx context.Context, job *persistencemodel.Job) string {
	if route, ok := w.catalogRouteForJob(ctx, job); ok {
		return route.ProviderModelID
	}
	return ""
}
