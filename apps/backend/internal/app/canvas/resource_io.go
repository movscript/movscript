package canvas

import (
	"bytes"
	"context"
	cryptorand "crypto/rand"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/canvasruntime"
	"github.com/movscript/movscript/internal/domain/model"
)

func (h *Service) completeResourceSinkTask(ctx context.Context, task *model.CanvasTask, node *model.CanvasNode, nd nodeData, user *model.User, value canvasPortValue) map[string]canvasPortValue {
	h.db.Model(task).Update("status", "running")
	value.Normalize()
	if value.ResourceID != nil && *value.ResourceID > 0 {
		outputs := map[string]canvasPortValue{
			canvasruntime.DefaultSourceHandleForNode(node.Type, nd): value,
			"": value,
		}
		h.updateTaskOutputValues(task, outputs)
		h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": *value.ResourceID})
		nd.Status = "done"
		nd.ResourceID = value.ResourceID
		nd.TaskID = &task.ID
		if task.CanvasRunID == nil {
			h.updateNodeData(node, nd)
		}
		h.updateRunStatus(task.CanvasRunID)
		return outputs
	}

	data, mimeType, ext, err := canvasPortValueResourcePayload(value)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return nil
	}
	name := canvasResourceSinkName(node, nd, task.ID, ext)
	r, err := h.createCanvasResourceFromBytes(ctx, user.ID, name, data, mimeType)
	if err != nil {
		h.failTask(task, node, nd, err.Error())
		return nil
	}
	outputValue := canvasruntime.PortValueFromResource(&r.ID, "resource")
	outputs := map[string]canvasPortValue{
		canvasruntime.DefaultSourceHandleForNode(node.Type, nd): outputValue,
		"": outputValue,
	}
	h.updateTaskOutputValues(task, outputs)
	h.db.Model(task).Updates(map[string]any{"status": "done", "resource_id": r.ID})
	nd.Status = "done"
	nd.ResourceID = &r.ID
	nd.TaskID = &task.ID
	if task.CanvasRunID == nil {
		h.updateNodeData(node, nd)
	}
	h.updateRunStatus(task.CanvasRunID)
	return outputs
}

func canvasPortValueResourcePayload(value canvasPortValue) ([]byte, string, string, error) {
	value.Normalize()
	switch value.Type {
	case "json":
		data, err := json.MarshalIndent(value.JSON, "", "  ")
		if err != nil {
			return nil, "", "", fmt.Errorf("encode json resource: %w", err)
		}
		return data, "application/json", "json", nil
	case "number", "boolean", "text":
		text := canvasruntime.PortValueText(value)
		return []byte(text), "text/plain; charset=utf-8", "txt", nil
	default:
		text := canvasruntime.PortValueText(value)
		if strings.TrimSpace(text) == "" {
			return nil, "", "", fmt.Errorf("resource sink can only persist resource or inline text/json/number/boolean values")
		}
		return []byte(text), "text/plain; charset=utf-8", "txt", nil
	}
}

func canvasResourceSinkName(_ *model.CanvasNode, nd nodeData, taskID uint, ext string) string {
	if ext == "" {
		ext = "bin"
	}
	name := sanitizeCanvasResourceFileName(nd.ParamName)
	if name == "" {
		return fmt.Sprintf("resource_%s.%s", randomCanvasResourceNameToken(taskID), ext)
	}
	if filepath.Ext(name) != "" {
		return name
	}
	return fmt.Sprintf("%s.%s", name, ext)
}

func sanitizeCanvasResourceFileName(name string) string {
	name = strings.TrimSpace(filepath.Base(name))
	name = strings.Trim(regexp.MustCompile(`[^a-zA-Z0-9._-]+`).ReplaceAllString(name, "_"), "._-")
	return name
}

func randomCanvasResourceNameToken(taskID uint) string {
	var b [6]byte
	if _, err := cryptorand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	return fmt.Sprintf("%d_%d", taskID, time.Now().UnixNano())
}

func (h *Service) createCanvasResourceFromSource(ctx context.Context, ownerID uint, name string, source string, mimeType string) (*model.RawResource, error) {
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, fmt.Errorf("generated result is empty")
	}
	var data []byte
	if strings.HasPrefix(source, "data:") {
		semi := strings.Index(source, ";")
		comma := strings.Index(source, ",")
		if semi < 0 || comma < 0 || comma <= semi {
			return nil, fmt.Errorf("malformed data URI")
		}
		mimeType = strings.TrimPrefix(source[:semi], "data:")
		decoded, err := base64.StdEncoding.DecodeString(source[comma+1:])
		if err != nil {
			return nil, fmt.Errorf("decode generated data: %w", err)
		}
		data = decoded
	} else if strings.HasPrefix(source, "http://") || strings.HasPrefix(source, "https://") {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
		if err != nil {
			return nil, fmt.Errorf("build generated result request: %w", err)
		}
		resp, err := (&http.Client{Timeout: 2 * time.Minute}).Do(req)
		if err != nil {
			return nil, fmt.Errorf("download generated result: %w", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return nil, fmt.Errorf("download generated result returned %d", resp.StatusCode)
		}
		if ct := resp.Header.Get("Content-Type"); ct != "" {
			mimeType = ct
		}
		data, err = io.ReadAll(resp.Body)
		if err != nil {
			return nil, fmt.Errorf("read generated result: %w", err)
		}
	} else {
		var err error
		data, err = os.ReadFile(source)
		if err != nil {
			return nil, fmt.Errorf("read generated result file: %w", err)
		}
	}
	return h.createCanvasResourceFromBytes(ctx, ownerID, name, data, mimeType)
}

func (h *Service) createCanvasResourceFromBytes(ctx context.Context, ownerID uint, name string, data []byte, mimeType string) (*model.RawResource, error) {
	if h.store == nil {
		return nil, fmt.Errorf("resource storage is not configured")
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	resType := mimeToType(mimeType, name)
	key := fmt.Sprintf("canvas/%d/%d_%s", ownerID, time.Now().UnixNano(), filepath.Base(name))
	r := model.RawResource{
		OwnerID:        ownerID,
		Type:           resType,
		Name:           name,
		MimeType:       mimeType,
		Size:           int64(len(data)),
		FilePath:       "pending",
		StorageBackend: h.store.Backend(),
		StorageKey:     key,
	}
	if err := h.db.Create(&r).Error; err != nil {
		return nil, fmt.Errorf("create resource record: %w", err)
	}
	if err := h.store.Put(ctx, key, bytes.NewReader(data), int64(len(data)), mimeType); err != nil {
		h.db.Delete(&r)
		return nil, fmt.Errorf("store resource: %w", err)
	}
	h.db.Model(&r).Update("file_path", "stored:"+key)
	r.FilePath = "stored:" + key
	return &r, nil
}

func canvasExtFromMime(mimeType string) string {
	base := strings.TrimSpace(strings.Split(mimeType, ";")[0])
	if exts, err := mime.ExtensionsByType(base); err == nil && len(exts) > 0 {
		return strings.TrimPrefix(exts[0], ".")
	}
	switch mimeToType(base, "") {
	case "image":
		return "png"
	case "video":
		return "mp4"
	case "audio":
		return "mp3"
	case "text":
		return "txt"
	default:
		return "bin"
	}
}

func mimeToType(mimeType, filename string) string {
	switch {
	case strings.HasPrefix(mimeType, "image/"):
		return "image"
	case strings.HasPrefix(mimeType, "video/"):
		return "video"
	case strings.HasPrefix(mimeType, "audio/"):
		return "audio"
	case strings.HasPrefix(mimeType, "text/"):
		return "text"
	case mimeType == "application/json", mimeType == "application/xml", mimeType == "application/yaml", mimeType == "application/x-yaml":
		return "text"
	}
	ext := strings.ToLower(filepath.Ext(filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif":
		return "image"
	case ".mp4", ".mov", ".avi", ".webm":
		return "video"
	case ".mp3", ".wav", ".ogg", ".aac", ".flac":
		return "audio"
	case ".txt", ".md", ".json", ".csv", ".ts", ".tsx", ".js", ".jsx", ".css", ".html", ".xml", ".yaml", ".yml", ".log":
		return "text"
	}
	return "file"
}
