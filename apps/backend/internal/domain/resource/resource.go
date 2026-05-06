package resource

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
)

type PageInput struct {
	Page     int
	PageSize int
}

type PageSpec struct {
	Page     int
	PageSize int
	Offset   int
}

type ListFilters struct {
	Types   []string
	Keyword string
}

type NewUploadedResourceSpec struct {
	OwnerID        uint
	OrgID          *uint
	FolderID       *uint
	Name           string
	MimeType       string
	Size           int64
	StorageBackend string
}

type NewStoredGeneratedResourceSpec struct {
	OwnerID        uint
	OrgID          *uint
	Name           string
	MimeType       string
	Size           int64
	StorageBackend string
	StorageKey     string
}

func NormalizePage(input PageInput) PageSpec {
	page := max(1, input.Page)
	pageSize := max(1, input.PageSize)
	if pageSize > 100 {
		pageSize = 100
	}
	return PageSpec{
		Page:     page,
		PageSize: pageSize,
		Offset:   (page - 1) * pageSize,
	}
}

func NewUploadedResource(spec NewUploadedResourceSpec) model.RawResource {
	return model.RawResource{
		OwnerID:        spec.OwnerID,
		OrgID:          spec.OrgID,
		FolderID:       spec.FolderID,
		Type:           MimeToType(spec.MimeType, spec.Name),
		Name:           spec.Name,
		MimeType:       spec.MimeType,
		Size:           spec.Size,
		FilePath:       "",
		StorageBackend: spec.StorageBackend,
	}
}

func NewStoredGeneratedResource(spec NewStoredGeneratedResourceSpec) model.RawResource {
	return model.RawResource{
		OwnerID:        spec.OwnerID,
		OrgID:          spec.OrgID,
		Type:           MimeToType(spec.MimeType, spec.Name),
		Name:           spec.Name,
		MimeType:       spec.MimeType,
		Size:           spec.Size,
		FilePath:       "pending",
		StorageBackend: spec.StorageBackend,
		StorageKey:     spec.StorageKey,
	}
}

func ParseListFilters(resourceType, query string) ListFilters {
	filters := ListFilters{Keyword: strings.ToLower(strings.TrimSpace(query))}
	if typ := strings.TrimSpace(resourceType); typ != "" && typ != "all" {
		parts := strings.Split(typ, ",")
		filters.Types = make([]string, 0, len(parts))
		for _, p := range parts {
			if v := strings.TrimSpace(p); v != "" {
				filters.Types = append(filters.Types, v)
			}
		}
	}
	if filters.Types == nil {
		filters.Types = []string{}
	}
	return filters
}

func MimeToType(mime, filename string) string {
	switch {
	case strings.HasPrefix(mime, "image/"):
		return "image"
	case strings.HasPrefix(mime, "video/"):
		return "video"
	case strings.HasPrefix(mime, "audio/"):
		return "audio"
	case strings.HasPrefix(mime, "text/"):
		return "text"
	case mime == "application/json", mime == "application/xml", mime == "application/yaml", mime == "application/x-yaml":
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

func GenerateStorageKey(resourceID uint, filename string) string {
	ext := filepath.Ext(filename)
	base := sanitizeName(strings.TrimSuffix(filename, ext))
	return fmt.Sprintf("%d_%s%s", resourceID, base, ext)
}

func sanitizeName(s string) string {
	var b strings.Builder
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			b.WriteRune(r)
		} else {
			b.WriteRune('_')
		}
	}
	return b.String()
}

func InOrgScope(resourceOrgID, currentOrgID *uint, ownerID uint, userID uint, includeLegacy bool) bool {
	if sameOrg(resourceOrgID, currentOrgID) {
		return true
	}
	return includeLegacy && resourceOrgID == nil && ownerID == userID
}

func sameOrg(a, b *uint) bool {
	if a == nil || b == nil {
		return a == nil && b == nil
	}
	return *a == *b
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
