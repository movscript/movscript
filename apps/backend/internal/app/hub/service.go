package hub

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/storage"
	"gorm.io/gorm"
)

const (
	KindPlugin   = "plugin"
	KindAsset    = "asset"
	KindTemplate = "template"
	KindWorkflow = "workflow"
	KindSkill    = "skill"

	StatusPending   = "pending"
	StatusPublished = "published"
	StatusRejected  = "rejected"
	StatusTakenDown = "taken_down"
)

var ErrNotFound = errors.New("hub package not found")

type Service struct {
	db    *gorm.DB
	store storage.Storage
}

func NewService(db *gorm.DB, store storage.Storage) *Service {
	return &Service{db: db, store: store}
}

type Package struct {
	ID              string     `json:"id"`
	Title           string     `json:"title"`
	Kind            string     `json:"kind"`
	Category        string     `json:"category"`
	Creator         string     `json:"creator"`
	License         string     `json:"license"`
	Signal          string     `json:"signal"`
	Summary         string     `json:"summary"`
	Tags            []string   `json:"tags"`
	Downloads       int64      `json:"downloads"`
	Rating          float64    `json:"rating"`
	Version         string     `json:"version"`
	FileSize        string     `json:"fileSize"`
	FileSizeBytes   int64      `json:"fileSizeBytes"`
	FileName        string     `json:"fileName"`
	ContentType     string     `json:"contentType"`
	Compatibility   string     `json:"compatibility"`
	UpdatedAt       string     `json:"updatedAt"`
	InstallCommand  string     `json:"installCommand"`
	Repository      string     `json:"repository,omitempty"`
	Status          string     `json:"status"`
	SubmittedBy     string     `json:"submittedBy,omitempty"`
	ReviewedBy      string     `json:"reviewedBy,omitempty"`
	ReviewNote      string     `json:"reviewNote,omitempty"`
	StorageProvider string     `json:"storageProvider,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	PublishedAt     *time.Time `json:"publishedAt,omitempty"`
	TakenDownAt     *time.Time `json:"takenDownAt,omitempty"`
}

type CreateInput struct {
	Title         string
	Kind          string
	Category      string
	Creator       string
	License       string
	Summary       string
	Tags          []string
	Version       string
	FileSizeBytes int64
	FileName      string
	ContentType   string
	Compatibility string
	Repository    string
	SubmittedBy   string
	Body          io.Reader
}

type PatchInput struct {
	Title         *string  `json:"title"`
	Category      *string  `json:"category"`
	Signal        *string  `json:"signal"`
	Summary       *string  `json:"summary"`
	Tags          []string `json:"tags"`
	Rating        *float64 `json:"rating"`
	Compatibility *string  `json:"compatibility"`
	Repository    *string  `json:"repository"`
	Status        *string  `json:"status"`
	ReviewNote    *string  `json:"reviewNote"`
}

type Download struct {
	Item        Package
	Key         string
	ContentType string
	FileName    string
}

func (s *Service) Seed(ctx context.Context) error {
	var count int64
	if err := s.db.WithContext(ctx).Model(&model.HubPackage{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}
	for _, item := range seedPackages() {
		row := model.HubPackage{
			PackageID:      item.ID,
			Title:          item.Title,
			Kind:           item.Kind,
			Category:       item.Category,
			Creator:        item.Creator,
			License:        item.License,
			Signal:         item.Signal,
			Summary:        item.Summary,
			Tags:           encodeTags(item.Tags),
			Downloads:      item.Downloads,
			Rating:         item.Rating,
			Version:        item.Version,
			FileSizeBytes:  item.FileSizeBytes,
			FileName:       item.FileName,
			ContentType:    item.ContentType,
			Compatibility:  item.Compatibility,
			Repository:     item.Repository,
			Status:         StatusPublished,
			PublicProvider: "seed",
			PublicKey:      "seed/" + item.ID + ".movhub.json",
			PublishedAt:    unixPtr(item.CreatedAt),
		}
		row.CreatedAt = item.CreatedAt
		row.UpdatedAt = item.CreatedAt
		if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) List(ctx context.Context, admin bool) ([]Package, error) {
	var rows []model.HubPackage
	q := s.db.WithContext(ctx).Order("updated_at desc")
	if !admin {
		q = q.Where("status = ?", StatusPublished)
	}
	if err := q.Find(&rows).Error; err != nil {
		return nil, err
	}
	out := make([]Package, 0, len(rows))
	for _, row := range rows {
		out = append(out, toPackage(row))
	}
	return out, nil
}

func (s *Service) Create(ctx context.Context, in CreateInput) (Package, error) {
	id := slugify(in.Title)
	if id == "" {
		id = "pkg-" + randomHex()
	}
	id = s.uniqueID(ctx, id)
	key := path.Join("hub", "staging", time.Now().UTC().Format("2006/01/02"), id+"-"+randomHex()+path.Ext(in.FileName))
	contentType := defaultString(in.ContentType, "application/octet-stream")
	if err := s.store.Put(ctx, key, in.Body, in.FileSizeBytes, contentType); err != nil {
		return Package{}, err
	}
	row := model.HubPackage{
		PackageID:       id,
		Title:           strings.TrimSpace(in.Title),
		Kind:            defaultString(strings.TrimSpace(in.Kind), KindPlugin),
		Category:        strings.TrimSpace(in.Category),
		Creator:         strings.TrimSpace(in.Creator),
		License:         defaultString(strings.TrimSpace(in.License), "Free Community License"),
		Signal:          "待审核",
		Summary:         strings.TrimSpace(in.Summary),
		Tags:            encodeTags(in.Tags),
		Rating:          4.0,
		Version:         defaultString(strings.TrimSpace(in.Version), "0.1.0"),
		FileSizeBytes:   in.FileSizeBytes,
		FileName:        safeFilename(in.FileName, id+".movpkg"),
		ContentType:     contentType,
		Compatibility:   defaultString(strings.TrimSpace(in.Compatibility), "Workbench >= 0.4"),
		Repository:      strings.TrimSpace(in.Repository),
		Status:          StatusPending,
		SubmittedBy:     strings.TrimSpace(in.SubmittedBy),
		StagingProvider: s.store.Backend(),
		StagingKey:      key,
	}
	if err := s.db.WithContext(ctx).Create(&row).Error; err != nil {
		return Package{}, err
	}
	return toPackage(row), nil
}

func (s *Service) Patch(ctx context.Context, id, reviewer string, in PatchInput) (Package, error) {
	row, err := s.find(ctx, id, true)
	if err != nil {
		return Package{}, err
	}
	updates := map[string]any{"reviewed_by": reviewer}
	if in.Title != nil {
		updates["title"] = strings.TrimSpace(*in.Title)
	}
	if in.Category != nil {
		updates["category"] = strings.TrimSpace(*in.Category)
	}
	if in.Signal != nil {
		updates["signal"] = strings.TrimSpace(*in.Signal)
	}
	if in.Summary != nil {
		updates["summary"] = strings.TrimSpace(*in.Summary)
	}
	if in.Tags != nil {
		updates["tags"] = encodeTags(in.Tags)
	}
	if in.Rating != nil {
		updates["rating"] = *in.Rating
	}
	if in.Compatibility != nil {
		updates["compatibility"] = strings.TrimSpace(*in.Compatibility)
	}
	if in.Repository != nil {
		updates["repository"] = strings.TrimSpace(*in.Repository)
	}
	if in.Status != nil {
		status := strings.TrimSpace(*in.Status)
		updates["status"] = status
		if status == StatusTakenDown && row.TakenDownAt == nil {
			updates["taken_down_at"] = time.Now().UTC().Unix()
		}
	}
	if in.ReviewNote != nil {
		updates["review_note"] = strings.TrimSpace(*in.ReviewNote)
	}
	if err := s.db.WithContext(ctx).Model(&row).Updates(updates).Error; err != nil {
		return Package{}, err
	}
	row, err = s.find(ctx, id, true)
	if err != nil {
		return Package{}, err
	}
	return toPackage(row), nil
}

func (s *Service) Publish(ctx context.Context, id, reviewer, note string) (Package, error) {
	row, err := s.find(ctx, id, true)
	if err != nil {
		return Package{}, err
	}
	if row.StagingKey == "" {
		return Package{}, errors.New("package has no staged object")
	}
	publicKey := path.Join("hub", "packages", row.Kind, row.PackageID, row.Version, safeFilename(row.FileName, row.PackageID+".movpkg"))
	rc, size, contentType, err := s.store.GetObject(ctx, row.StagingKey, -1, -1)
	if err != nil {
		return Package{}, err
	}
	defer rc.Close()
	if err := s.store.Put(ctx, publicKey, rc, size, defaultString(row.ContentType, contentType)); err != nil {
		return Package{}, err
	}
	now := time.Now().UTC().Unix()
	signal := row.Signal
	if signal == "" || signal == "待审核" {
		signal = "社区验证"
	}
	if err := s.db.WithContext(ctx).Model(&row).Updates(map[string]any{
		"status":          StatusPublished,
		"signal":          signal,
		"reviewed_by":     reviewer,
		"review_note":     strings.TrimSpace(note),
		"public_provider": s.store.Backend(),
		"public_key":      publicKey,
		"published_at":    now,
		"taken_down_at":   nil,
	}).Error; err != nil {
		return Package{}, err
	}
	row, err = s.find(ctx, id, true)
	if err != nil {
		return Package{}, err
	}
	return toPackage(row), nil
}

func (s *Service) Reject(ctx context.Context, id, reviewer, note string) (Package, error) {
	status := StatusRejected
	return s.Patch(ctx, id, reviewer, PatchInput{Status: &status, ReviewNote: &note})
}

func (s *Service) TakeDown(ctx context.Context, id, reviewer, note string) (Package, error) {
	status := StatusTakenDown
	return s.Patch(ctx, id, reviewer, PatchInput{Status: &status, ReviewNote: &note})
}

func (s *Service) Download(ctx context.Context, id string) (Download, error) {
	row, err := s.find(ctx, id, false)
	if err != nil {
		return Download{}, err
	}
	_ = s.db.WithContext(ctx).Model(&row).UpdateColumn("downloads", gorm.Expr("downloads + 1")).Error
	item := toPackage(row)
	return Download{
		Item:        item,
		Key:         row.PublicKey,
		ContentType: defaultString(row.ContentType, "application/octet-stream"),
		FileName:    safeFilename(row.FileName, row.PackageID+".movpkg"),
	}, nil
}

func (s *Service) find(ctx context.Context, id string, admin bool) (model.HubPackage, error) {
	var row model.HubPackage
	q := s.db.WithContext(ctx).Where("package_id = ?", strings.TrimSpace(id))
	if !admin {
		q = q.Where("status = ?", StatusPublished)
	}
	if err := q.First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return model.HubPackage{}, ErrNotFound
		}
		return model.HubPackage{}, err
	}
	return row, nil
}

func (s *Service) uniqueID(ctx context.Context, base string) string {
	id := base
	for i := 0; i < 20; i++ {
		var count int64
		_ = s.db.WithContext(ctx).Model(&model.HubPackage{}).Where("package_id = ?", id).Count(&count).Error
		if count == 0 {
			return id
		}
		id = fmt.Sprintf("%s-%d", base, i+2)
	}
	return base + "-" + randomHex()
}

func toPackage(row model.HubPackage) Package {
	publishedAt := timePtr(row.PublishedAt)
	takenDownAt := timePtr(row.TakenDownAt)
	provider := row.PublicProvider
	if provider == "" {
		provider = row.StagingProvider
	}
	return Package{
		ID:              row.PackageID,
		Title:           row.Title,
		Kind:            row.Kind,
		Category:        row.Category,
		Creator:         row.Creator,
		License:         row.License,
		Signal:          row.Signal,
		Summary:         row.Summary,
		Tags:            decodeTags(row.Tags),
		Downloads:       row.Downloads,
		Rating:          row.Rating,
		Version:         row.Version,
		FileSize:        formatSize(row.FileSizeBytes),
		FileSizeBytes:   row.FileSizeBytes,
		FileName:        row.FileName,
		ContentType:     row.ContentType,
		Compatibility:   row.Compatibility,
		UpdatedAt:       row.UpdatedAt.Format("2006-01-02"),
		InstallCommand:  "mov hub install " + row.PackageID,
		Repository:      row.Repository,
		Status:          row.Status,
		SubmittedBy:     row.SubmittedBy,
		ReviewedBy:      row.ReviewedBy,
		ReviewNote:      row.ReviewNote,
		StorageProvider: provider,
		CreatedAt:       row.CreatedAt,
		PublishedAt:     publishedAt,
		TakenDownAt:     takenDownAt,
	}
}

func encodeTags(tags []string) string {
	cleaned := make([]string, 0, len(tags))
	seen := map[string]bool{}
	for _, tag := range tags {
		tag = strings.TrimSpace(tag)
		if tag == "" || seen[tag] {
			continue
		}
		seen[tag] = true
		cleaned = append(cleaned, tag)
	}
	raw, _ := json.Marshal(cleaned)
	return string(raw)
}

func decodeTags(raw string) []string {
	var tags []string
	if err := json.Unmarshal([]byte(defaultString(raw, "[]")), &tags); err != nil {
		return []string{}
	}
	return tags
}

func splitTags(v string) []string {
	parts := strings.FieldsFunc(v, func(r rune) bool { return r == ',' || r == '，' || r == '\n' })
	return decodeTags(encodeTags(parts))
}

func slugify(v string) string {
	v = strings.TrimSpace(strings.ToLower(v))
	var b strings.Builder
	dash := false
	for _, r := range v {
		if r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r >= '一' && r <= '龥' {
			b.WriteRune(r)
			dash = false
			continue
		}
		if !dash {
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.Trim(b.String(), "-")
}

func randomHex() string {
	var b [4]byte
	if _, err := rand.Read(b[:]); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b[:])
}

func safeFilename(v, fallback string) string {
	v = path.Base(strings.TrimSpace(v))
	if v == "." || v == "/" || v == "" {
		return fallback
	}
	return strings.ReplaceAll(v, `"`, "")
}

func defaultString(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

func formatSize(bytes int64) string {
	if bytes >= 1024*1024 {
		return fmt.Sprintf("%.1f MB", float64(bytes)/1024/1024)
	}
	if bytes >= 1024 {
		return fmt.Sprintf("%.1f KB", float64(bytes)/1024)
	}
	if bytes <= 0 {
		return "待上传"
	}
	return fmt.Sprintf("%d B", bytes)
}

func unixPtr(t time.Time) *int64 {
	v := t.UTC().Unix()
	return &v
}

func timePtr(v *int64) *time.Time {
	if v == nil {
		return nil
	}
	t := time.Unix(*v, 0).UTC()
	return &t
}

func seedPackages() []Package {
	now := time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC)
	return []Package{
		{ID: "provider-orchestrator", Title: "多模型生成编排器", Kind: KindPlugin, Category: "Generation Pipeline", Creator: "Movscript Studio", License: "Free Community License", Signal: "官方精选", Summary: "把图像、视频、TTS 与 LLM 提供商编排成统一生成队列。", Tags: []string{"AI生成", "成本观察", "批量任务", "官方"}, Downloads: 21400, Rating: 4.9, Version: "1.8.0", FileSizeBytes: 4800000, FileName: "provider-orchestrator.movpkg", ContentType: "application/octet-stream", Compatibility: "Workbench >= 0.4", Repository: "https://github.com/movscript/provider-orchestrator", CreatedAt: now},
		{ID: "rights-validator", Title: "模板版权校验器", Kind: KindPlugin, Category: "Compliance", Creator: "Marketplace Trust", License: "Free Community License", Signal: "安全认证", Summary: "检查资产元数据、权利声明、依赖兼容和商业使用边界。", Tags: []string{"版权", "认证", "审核", "合规"}, Downloads: 6100, Rating: 4.7, Version: "0.9.4", FileSizeBytes: 1600000, FileName: "rights-validator.movpkg", ContentType: "application/octet-stream", Compatibility: "Workbench >= 0.3", CreatedAt: now},
		{ID: "editor-exporter", Title: "剪辑工程导出桥", Kind: KindPlugin, Category: "Export", Creator: "Partner Lab", License: "MIT", Signal: "社区验证", Summary: "把 MovScript 镜头、素材和生成结果导出为后期制作交换包。", Tags: []string{"导出", "后期", "协作", "XML"}, Downloads: 3900, Rating: 4.5, Version: "0.6.2", FileSizeBytes: 2100000, FileName: "editor-exporter.movpkg", ContentType: "application/octet-stream", Compatibility: "Workbench >= 0.2", CreatedAt: now},
		{ID: "batch-gen-workflow", Title: "批量分镜生成工作流", Kind: KindWorkflow, Category: "Generation", Creator: "Movscript Studio", License: "Free Community License", Signal: "官方精选", Summary: "从剧本自动拆分镜头、生成提示词、批量调用图像模型并输出分镜表。", Tags: []string{"批量", "分镜", "自动化", "官方"}, Downloads: 9300, Rating: 4.8, Version: "1.1.0", FileSizeBytes: 800000, FileName: "batch-gen-workflow.movpkg", ContentType: "application/octet-stream", Compatibility: "Workbench >= 0.4", Repository: "https://github.com/movscript/batch-gen-workflow", CreatedAt: now},
	}
}
