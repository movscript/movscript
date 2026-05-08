package canvas

import (
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	domainresource "github.com/movscript/movscript/internal/domain/resource"
	"github.com/movscript/movscript/internal/infra/ai"
)

func (h *Service) applyPromptPortInputs(ctx context.Context, nd *nodeData, portInputs canvasPortInputMap) {
	if nd == nil || len(portInputs) == 0 {
		return
	}
	promptTexts := h.readCanvasTextValues(ctx, portInputs["prompt"])
	if len(promptTexts) > 0 {
		if strings.TrimSpace(nd.Prompt) == "" {
			nd.Prompt = strings.Join(promptTexts, "\n\n")
		} else {
			nd.Prompt = strings.TrimSpace(nd.Prompt + "\n\n" + strings.Join(promptTexts, "\n\n"))
		}
	}
	if nd.ExecutableSpec != nil {
		specPrompt := strings.TrimSpace(nd.ExecutableSpec.Prompt)
		if len(promptTexts) > 0 {
			if specPrompt == "" {
				nd.ExecutableSpec.Prompt = strings.Join(promptTexts, "\n\n")
			} else {
				nd.ExecutableSpec.Prompt = strings.TrimSpace(specPrompt + "\n\n" + strings.Join(promptTexts, "\n\n"))
			}
		}
	}
}

func (h *Service) readCanvasTextValues(ctx context.Context, values []canvasPortValue) []string {
	if len(values) == 0 {
		return nil
	}
	texts := make([]string, 0, len(values))
	var resourcePtrs []*uint
	for _, value := range values {
		if text := strings.TrimSpace(canvasruntime.PortValueText(value)); text != "" {
			texts = append(texts, text)
			continue
		}
		if value.ResourceID != nil {
			resourcePtrs = append(resourcePtrs, value.ResourceID)
		}
	}
	texts = append(texts, h.readCanvasTextInputs(ctx, resourcePtrs)...)
	return texts
}

func (h *Service) readCanvasTextInputs(ctx context.Context, resourcePtrs []*uint) []string {
	if len(resourcePtrs) == 0 {
		return nil
	}
	ids := make([]uint, 0, len(resourcePtrs))
	seen := map[uint]bool{}
	for _, ptr := range resourcePtrs {
		if ptr == nil || *ptr == 0 || seen[*ptr] {
			continue
		}
		seen[*ptr] = true
		ids = append(ids, *ptr)
	}
	if len(ids) == 0 {
		return nil
	}
	resources, err := h.canvasRepo().FindResources(ctx, ids)
	if err != nil {
		return nil
	}
	byID := make(map[uint]domainresource.RawResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	texts := make([]string, 0, len(ids))
	for _, id := range ids {
		r, ok := byID[id]
		if !ok {
			continue
		}
		if r.Type != "text" && !strings.HasPrefix(strings.ToLower(r.MimeType), "text/") {
			continue
		}
		data, _, err := h.readCanvasResourceBytes(ctx, r)
		if err != nil {
			continue
		}
		if text := strings.TrimSpace(string(data)); text != "" {
			texts = append(texts, text)
		}
	}
	return texts
}

func (h *Service) loadCanvasInputResources(ctx context.Context, nd nodeData, upstreamResources []*uint) (imageData, videoData []ai.MediaData) {
	ids := h.collectCanvasInputResourceIDs(nd, upstreamResources)
	if len(ids) == 0 {
		return nil, nil
	}

	resources, err := h.canvasRepo().FindResources(ctx, ids)
	if err != nil {
		return nil, nil
	}
	return h.mediaDataFromCanvasResources(ctx, ids, resources)
}

func (h *Service) loadCanvasInputResourceRows(ctx context.Context, nd nodeData, upstreamResources []*uint) ([]uint, []domainresource.RawResource, error) {
	ids := h.collectCanvasInputResourceIDs(nd, upstreamResources)
	if len(ids) == 0 {
		return nil, nil, nil
	}
	resources, err := h.canvasRepo().FindResources(ctx, ids)
	if err != nil {
		return ids, nil, err
	}
	return ids, resources, nil
}

func (h *Service) mediaDataFromCanvasResources(ctx context.Context, ids []uint, resources []domainresource.RawResource) (imageData, videoData []ai.MediaData) {
	byID := make(map[uint]domainresource.RawResource, len(resources))
	for _, r := range resources {
		byID[r.ID] = r
	}
	for _, id := range ids {
		r, ok := byID[id]
		if !ok {
			continue
		}
		data, mime, err := h.readCanvasResourceBytes(ctx, r)
		if err != nil || len(data) == 0 {
			continue
		}
		md := ai.MediaData{Bytes: data, MimeType: mime}
		switch r.Type {
		case "image":
			imageData = append(imageData, md)
		case "video":
			videoData = append(videoData, md)
		}
	}
	return imageData, videoData
}

func (h *Service) collectCanvasInputResourceIDs(nd nodeData, upstreamResources []*uint) []uint {
	ids := make([]uint, 0, len(nd.InputResourceIDs)+len(upstreamResources))
	seen := map[uint]bool{}
	for _, id := range nd.InputResourceIDs {
		if id == 0 || seen[id] {
			continue
		}
		seen[id] = true
		ids = append(ids, id)
	}
	for _, ptr := range upstreamResources {
		if ptr == nil || *ptr == 0 || seen[*ptr] {
			continue
		}
		seen[*ptr] = true
		ids = append(ids, *ptr)
	}
	return ids
}

func (h *Service) readCanvasResourceBytes(ctx context.Context, r domainresource.RawResource) ([]byte, string, error) {
	mimeType := r.MimeType
	if r.StorageKey != "" && h.store != nil {
		rc, _, storedMime, err := h.store.GetObject(ctx, r.StorageKey, -1, -1)
		if err != nil {
			return nil, "", err
		}
		defer rc.Close()
		data, err := io.ReadAll(rc)
		if storedMime != "" {
			mimeType = storedMime
		}
		return data, mimeType, err
	}

	if strings.HasPrefix(r.FilePath, "data:") {
		semi := strings.Index(r.FilePath, ";")
		comma := strings.Index(r.FilePath, ",")
		if semi < 0 || comma < 0 || comma <= semi {
			return nil, "", fmt.Errorf("malformed data URI")
		}
		mimeType = strings.TrimPrefix(r.FilePath[:semi], "data:")
		data, err := base64.StdEncoding.DecodeString(r.FilePath[comma+1:])
		return data, mimeType, err
	}

	if strings.HasPrefix(r.FilePath, "http://") || strings.HasPrefix(r.FilePath, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, r.FilePath, nil)
		if err != nil {
			return nil, "", err
		}
		resp, err := (&http.Client{Timeout: 2 * time.Minute}).Do(req)
		if err != nil {
			return nil, "", err
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, "", fmt.Errorf("download resource returned %d", resp.StatusCode)
		}
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			mimeType = ct
		}
		data, err := io.ReadAll(resp.Body)
		return data, mimeType, err
	}

	if r.FilePath != "" {
		data, err := os.ReadFile(r.FilePath)
		return data, mimeType, err
	}
	return nil, "", fmt.Errorf("resource has no readable data")
}

func resolveCanvasMentions(prompt string) (string, []uint) {
	re := regexp.MustCompile(`@\[resource:(\d+)\]`)
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
	cleaned := re.ReplaceAllStringFunc(prompt, func(match string) string {
		sub := re.FindStringSubmatch(match)
		if len(sub) < 2 {
			return ""
		}
		id64, err := strconv.ParseUint(sub[1], 10, 64)
		if err != nil {
			return ""
		}
		return fmt.Sprintf("图片%d", seen[uint(id64)])
	})
	return strings.TrimSpace(cleaned), order
}
