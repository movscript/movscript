package hub

import (
	"encoding/json"
	"fmt"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
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

type Package struct {
	ID                  string              `json:"id"`
	Title               string              `json:"title"`
	Kind                string              `json:"kind"`
	Category            string              `json:"category"`
	Creator             string              `json:"creator"`
	CreatorVerified     bool                `json:"creatorVerified,omitempty"`
	CreatorStatus       string              `json:"creatorStatus,omitempty"`
	License             string              `json:"license"`
	Signal              string              `json:"signal"`
	Summary             string              `json:"summary"`
	Tags                []string            `json:"tags"`
	Downloads           int64               `json:"downloads"`
	Rating              float64             `json:"rating"`
	Version             string              `json:"version"`
	FileSize            string              `json:"fileSize"`
	FileSizeBytes       int64               `json:"fileSizeBytes"`
	FileName            string              `json:"fileName"`
	ContentType         string              `json:"contentType"`
	SHA256              string              `json:"sha256,omitempty"`
	RequiredProductID   string              `json:"requiredProductId,omitempty"`
	Compatibility       string              `json:"compatibility"`
	MinWorkbenchVersion string              `json:"minWorkbenchVersion,omitempty"`
	MaxWorkbenchVersion string              `json:"maxWorkbenchVersion,omitempty"`
	Dependencies        []PackageDependency `json:"dependencies,omitempty"`
	UpdatedAt           string              `json:"updatedAt"`
	InstallCommand      string              `json:"installCommand"`
	Repository          string              `json:"repository,omitempty"`
	Status              string              `json:"status"`
	SubmittedBy         string              `json:"submittedBy,omitempty"`
	ReviewedBy          string              `json:"reviewedBy,omitempty"`
	ReviewNote          string              `json:"reviewNote,omitempty"`
	StorageProvider     string              `json:"storageProvider,omitempty"`
	ScanStatus          string              `json:"scanStatus,omitempty"`
	ScanSeverity        string              `json:"scanSeverity,omitempty"`
	ScanSummary         string              `json:"scanSummary,omitempty"`
	CreatedAt           time.Time           `json:"createdAt"`
	PublishedAt         *time.Time          `json:"publishedAt,omitempty"`
	TakenDownAt         *time.Time          `json:"takenDownAt,omitempty"`
}

type HubPackage struct {
	ID                  uint
	PackageID           string
	Title               string
	Kind                string
	Category            string
	Creator             string
	CreatorVerified     bool
	CreatorStatus       string
	License             string
	Signal              string
	Summary             string
	Tags                string
	Downloads           int64
	Rating              float64
	Version             string
	FileSizeBytes       int64
	FileName            string
	ContentType         string
	SHA256              string
	RequiredProductID   string
	Compatibility       string
	MinWorkbenchVersion string
	MaxWorkbenchVersion string
	Dependencies        string
	ManifestJSON        string
	Repository          string
	Status              string
	SubmittedBy         string
	ReviewedBy          string
	ReviewNote          string
	StagingProvider     string
	StagingKey          string
	PublicProvider      string
	PublicKey           string
	ScanStatus          string
	ScanSeverity        string
	ScanSummary         string
	PublishedAt         *int64
	TakenDownAt         *int64
	CreatedAt           time.Time
	UpdatedAt           time.Time
}

type CreateDraftInput struct {
	Title               string
	Kind                string
	Category            string
	Creator             string
	License             string
	Summary             string
	Tags                []string
	Version             string
	FileSizeBytes       int64
	FileName            string
	ContentType         string
	SHA256              string
	RequiredProductID   string
	Compatibility       string
	MinWorkbenchVersion string
	MaxWorkbenchVersion string
	Dependencies        []PackageDependency
	ManifestJSON        string
	Repository          string
	SubmittedBy         string
	StagingProvider     string
	StagingKey          string
}

type CreateWorkspaceInput = CreateDraftInput

type PatchInput struct {
	Title               *string
	Category            *string
	Signal              *string
	Summary             *string
	Tags                []string
	Rating              *float64
	Compatibility       *string
	MinWorkbenchVersion *string
	MaxWorkbenchVersion *string
	Dependencies        []PackageDependency
	Repository          *string
	RequiredProductID   *string
	Status              *string
	ReviewNote          *string
}

type PackageDependency struct {
	ID       string `json:"id"`
	Version  string `json:"version,omitempty"`
	Optional bool   `json:"optional,omitempty"`
}

type Manifest struct {
	Schema              string              `json:"schema,omitempty"`
	ID                  string              `json:"id,omitempty"`
	Name                string              `json:"name,omitempty"`
	Version             string              `json:"version,omitempty"`
	Description         string              `json:"description,omitempty"`
	Author              string              `json:"author,omitempty"`
	Homepage            string              `json:"homepage,omitempty"`
	Kind                string              `json:"kind,omitempty"`
	Category            string              `json:"category,omitempty"`
	License             string              `json:"license,omitempty"`
	Tags                []string            `json:"tags,omitempty"`
	Compatibility       string              `json:"compatibility,omitempty"`
	MinWorkbenchVersion string              `json:"minWorkbenchVersion,omitempty"`
	MaxWorkbenchVersion string              `json:"maxWorkbenchVersion,omitempty"`
	RequiredProductID   string              `json:"requiredProductId,omitempty"`
	Dependencies        []PackageDependency `json:"dependencies,omitempty"`
}

func ToPackage(row HubPackage) Package {
	publishedAt := TimePtr(row.PublishedAt)
	takenDownAt := TimePtr(row.TakenDownAt)
	provider := row.PublicProvider
	if provider == "" {
		provider = row.StagingProvider
	}
	return Package{
		ID:                  row.PackageID,
		Title:               row.Title,
		Kind:                row.Kind,
		Category:            row.Category,
		Creator:             row.Creator,
		CreatorVerified:     row.CreatorVerified,
		CreatorStatus:       row.CreatorStatus,
		License:             row.License,
		Signal:              row.Signal,
		Summary:             row.Summary,
		Tags:                DecodeTags(row.Tags),
		Downloads:           row.Downloads,
		Rating:              row.Rating,
		Version:             row.Version,
		FileSize:            FormatSize(row.FileSizeBytes),
		FileSizeBytes:       row.FileSizeBytes,
		FileName:            row.FileName,
		ContentType:         row.ContentType,
		SHA256:              row.SHA256,
		RequiredProductID:   row.RequiredProductID,
		Compatibility:       row.Compatibility,
		MinWorkbenchVersion: row.MinWorkbenchVersion,
		MaxWorkbenchVersion: row.MaxWorkbenchVersion,
		Dependencies:        DecodeDependencies(row.Dependencies),
		UpdatedAt:           row.UpdatedAt.Format("2006-01-02"),
		InstallCommand:      "mov hub install " + row.PackageID,
		Repository:          row.Repository,
		Status:              row.Status,
		SubmittedBy:         row.SubmittedBy,
		ReviewedBy:          row.ReviewedBy,
		ReviewNote:          row.ReviewNote,
		StorageProvider:     provider,
		ScanStatus:          row.ScanStatus,
		ScanSeverity:        row.ScanSeverity,
		ScanSummary:         row.ScanSummary,
		CreatedAt:           row.CreatedAt,
		PublishedAt:         publishedAt,
		TakenDownAt:         takenDownAt,
	}
}

func NewDraftPackage(id string, in CreateDraftInput) HubPackage {
	contentType := DefaultString(in.ContentType, "application/octet-stream")
	return HubPackage{
		PackageID:           id,
		Title:               strings.TrimSpace(in.Title),
		Kind:                DefaultString(strings.TrimSpace(in.Kind), KindPlugin),
		Category:            strings.TrimSpace(in.Category),
		Creator:             strings.TrimSpace(in.Creator),
		License:             DefaultString(strings.TrimSpace(in.License), "Free Community License"),
		Signal:              "待审核",
		Summary:             strings.TrimSpace(in.Summary),
		Tags:                EncodeTags(in.Tags),
		Rating:              4.0,
		Version:             DefaultString(strings.TrimSpace(in.Version), "0.1.0"),
		FileSizeBytes:       in.FileSizeBytes,
		FileName:            SafeFilename(in.FileName, id+".movpkg"),
		ContentType:         contentType,
		SHA256:              normalizeSHA256(in.SHA256),
		RequiredProductID:   strings.TrimSpace(in.RequiredProductID),
		Compatibility:       DefaultString(strings.TrimSpace(in.Compatibility), "Workbench >= 0.4"),
		MinWorkbenchVersion: strings.TrimSpace(in.MinWorkbenchVersion),
		MaxWorkbenchVersion: strings.TrimSpace(in.MaxWorkbenchVersion),
		Dependencies:        EncodeDependencies(in.Dependencies),
		ManifestJSON:        strings.TrimSpace(in.ManifestJSON),
		Repository:          strings.TrimSpace(in.Repository),
		Status:              StatusPending,
		SubmittedBy:         strings.TrimSpace(in.SubmittedBy),
		StagingProvider:     in.StagingProvider,
		StagingKey:          in.StagingKey,
	}
}

func NewWorkspacePackage(id string, in CreateWorkspaceInput) HubPackage {
	return NewDraftPackage(id, in)
}

func ApplyPatch(row *HubPackage, reviewer string, in PatchInput, now time.Time) {
	row.ReviewedBy = reviewer
	if in.Title != nil {
		row.Title = strings.TrimSpace(*in.Title)
	}
	if in.Category != nil {
		row.Category = strings.TrimSpace(*in.Category)
	}
	if in.Signal != nil {
		row.Signal = strings.TrimSpace(*in.Signal)
	}
	if in.Summary != nil {
		row.Summary = strings.TrimSpace(*in.Summary)
	}
	if in.Tags != nil {
		row.Tags = EncodeTags(in.Tags)
	}
	if in.Rating != nil {
		row.Rating = *in.Rating
	}
	if in.Compatibility != nil {
		row.Compatibility = strings.TrimSpace(*in.Compatibility)
	}
	if in.MinWorkbenchVersion != nil {
		row.MinWorkbenchVersion = strings.TrimSpace(*in.MinWorkbenchVersion)
	}
	if in.MaxWorkbenchVersion != nil {
		row.MaxWorkbenchVersion = strings.TrimSpace(*in.MaxWorkbenchVersion)
	}
	if in.Dependencies != nil {
		row.Dependencies = EncodeDependencies(in.Dependencies)
	}
	if in.Repository != nil {
		row.Repository = strings.TrimSpace(*in.Repository)
	}
	if in.RequiredProductID != nil {
		row.RequiredProductID = strings.TrimSpace(*in.RequiredProductID)
	}
	if in.Status != nil {
		row.Status = strings.TrimSpace(*in.Status)
		if row.Status == StatusTakenDown && row.TakenDownAt == nil {
			row.TakenDownAt = UnixPtr(now)
		}
	}
	if in.ReviewNote != nil {
		row.ReviewNote = strings.TrimSpace(*in.ReviewNote)
	}
}

func ApplyPublish(row *HubPackage, reviewer, note, provider, publicKey string, now time.Time) {
	signal := row.Signal
	if signal == "" || signal == "待审核" {
		signal = "社区验证"
	}
	row.Status = StatusPublished
	row.Signal = signal
	row.ReviewedBy = reviewer
	row.ReviewNote = strings.TrimSpace(note)
	row.PublicProvider = provider
	row.PublicKey = publicKey
	row.PublishedAt = UnixPtr(now)
	row.TakenDownAt = nil
}

func SeedPackages() []Package {
	now := time.Date(2026, 4, 20, 0, 0, 0, 0, time.UTC)
	return []Package{
		{ID: "provider-orchestrator", Title: "多模型生成编排器", Kind: KindPlugin, Category: "Generation Pipeline", Creator: "Movscript Studio", License: "Free Community License", Signal: "官方精选", Summary: "把图像、视频、TTS 与 LLM 提供商编排成统一生成队列。", Tags: []string{"AI生成", "成本观察", "批量任务", "官方"}, Downloads: 21400, Rating: 4.9, Version: "1.8.0", FileSizeBytes: 4800000, FileName: "provider-orchestrator.movpkg", ContentType: "application/octet-stream", Compatibility: "Workbench >= 0.4", Repository: "https://github.com/movscript/provider-orchestrator", CreatedAt: now},
		{ID: "rights-validator", Title: "模板版权校验器", Kind: KindPlugin, Category: "Compliance", Creator: "Marketplace Trust", License: "Free Community License", Signal: "安全认证", Summary: "检查资产元数据、权利声明、依赖兼容和商业使用边界。", Tags: []string{"版权", "认证", "审核", "合规"}, Downloads: 6100, Rating: 4.7, Version: "0.9.4", FileSizeBytes: 1600000, FileName: "rights-validator.movpkg", ContentType: "application/octet-stream", Compatibility: "Workbench >= 0.3", CreatedAt: now},
		{ID: "editor-exporter", Title: "剪辑工程导出桥", Kind: KindPlugin, Category: "Export", Creator: "Partner Lab", License: "MIT", Signal: "社区验证", Summary: "把 MovScript 镜头、素材和生成结果导出为后期制作交换包。", Tags: []string{"导出", "后期", "协作", "XML"}, Downloads: 3900, Rating: 4.5, Version: "0.6.2", FileSizeBytes: 2100000, FileName: "editor-exporter.movpkg", ContentType: "application/octet-stream", Compatibility: "Workbench >= 0.2", CreatedAt: now},
		{ID: "batch-gen-workflow", Title: "批量分镜生成工作流", Kind: KindWorkflow, Category: "Generation", Creator: "Movscript Studio", License: "Free Community License", Signal: "官方精选", Summary: "从剧本自动拆分镜头、生成提示词、批量调用图像模型并输出分镜表。", Tags: []string{"批量", "分镜", "自动化", "官方"}, Downloads: 9300, Rating: 4.8, Version: "1.1.0", FileSizeBytes: 800000, FileName: "batch-gen-workflow.movpkg", ContentType: "application/octet-stream", Compatibility: "Workbench >= 0.4", Repository: "https://github.com/movscript/batch-gen-workflow", CreatedAt: now},
	}
}

func NewSeedPackageRow(item Package) HubPackage {
	row := HubPackage{
		PackageID:           item.ID,
		Title:               item.Title,
		Kind:                item.Kind,
		Category:            item.Category,
		Creator:             item.Creator,
		License:             item.License,
		Signal:              item.Signal,
		Summary:             item.Summary,
		Tags:                EncodeTags(item.Tags),
		Downloads:           item.Downloads,
		Rating:              item.Rating,
		Version:             item.Version,
		FileSizeBytes:       item.FileSizeBytes,
		FileName:            item.FileName,
		ContentType:         item.ContentType,
		SHA256:              normalizeSHA256(item.SHA256),
		RequiredProductID:   strings.TrimSpace(item.RequiredProductID),
		Compatibility:       item.Compatibility,
		MinWorkbenchVersion: strings.TrimSpace(item.MinWorkbenchVersion),
		MaxWorkbenchVersion: strings.TrimSpace(item.MaxWorkbenchVersion),
		Dependencies:        EncodeDependencies(item.Dependencies),
		Repository:          item.Repository,
		Status:              StatusPublished,
		PublicProvider:      "seed",
		PublicKey:           "seed/" + item.ID + ".movhub.json",
		PublishedAt:         UnixPtr(item.CreatedAt),
	}
	row.CreatedAt = item.CreatedAt
	row.UpdatedAt = item.CreatedAt
	return row
}

func EncodeDependencies(deps []PackageDependency) string {
	cleaned := CleanDependencies(deps)
	if len(cleaned) == 0 {
		return "[]"
	}
	raw, _ := json.Marshal(cleaned)
	return string(raw)
}

func DecodeDependencies(raw string) []PackageDependency {
	var deps []PackageDependency
	if err := json.Unmarshal([]byte(DefaultString(raw, "[]")), &deps); err != nil {
		return []PackageDependency{}
	}
	return CleanDependencies(deps)
}

func CleanDependencies(deps []PackageDependency) []PackageDependency {
	cleaned := make([]PackageDependency, 0, len(deps))
	seen := map[string]bool{}
	for _, dep := range deps {
		id := strings.TrimSpace(dep.ID)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		cleaned = append(cleaned, PackageDependency{
			ID:       id,
			Version:  strings.TrimSpace(dep.Version),
			Optional: dep.Optional,
		})
	}
	return cleaned
}

func CompatibilityFromWorkbenchRange(minVersion, maxVersion string) string {
	minVersion = strings.TrimSpace(minVersion)
	maxVersion = strings.TrimSpace(maxVersion)
	switch {
	case minVersion != "" && maxVersion != "":
		return "Workbench >= " + minVersion + " < " + maxVersion
	case minVersion != "":
		return "Workbench >= " + minVersion
	case maxVersion != "":
		return "Workbench < " + maxVersion
	default:
		return ""
	}
}

func ExtractMinWorkbenchVersion(compatibility string) string {
	matches := regexp.MustCompile(`(?i)(?:workbench\s*)?>=\s*([0-9]+(?:\.[0-9]+){0,2})`).FindStringSubmatch(compatibility)
	if len(matches) == 2 {
		return matches[1]
	}
	return ""
}

func IsValidSemverish(version string) bool {
	return regexp.MustCompile(`^[0-9]+(?:\.[0-9]+){0,2}$`).MatchString(strings.TrimSpace(version))
}

func VersionLess(left, right string) bool {
	l := parseVersionParts(left)
	r := parseVersionParts(right)
	for i := 0; i < len(l); i++ {
		if l[i] < r[i] {
			return true
		}
		if l[i] > r[i] {
			return false
		}
	}
	return false
}

func parseVersionParts(version string) [3]int {
	var out [3]int
	parts := strings.Split(strings.TrimSpace(version), ".")
	for i := 0; i < len(parts) && i < len(out); i++ {
		n, _ := strconv.Atoi(parts[i])
		out[i] = n
	}
	return out
}

func EncodeTags(tags []string) string {
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

func DecodeTags(raw string) []string {
	var tags []string
	if err := json.Unmarshal([]byte(DefaultString(raw, "[]")), &tags); err != nil {
		return []string{}
	}
	return tags
}

func SplitTags(v string) []string {
	parts := strings.FieldsFunc(v, func(r rune) bool { return r == ',' || r == '，' || r == '\n' })
	return DecodeTags(EncodeTags(parts))
}

func normalizeSHA256(v string) string {
	v = strings.ToLower(strings.TrimSpace(v))
	if len(v) != 64 {
		return ""
	}
	for _, r := range v {
		if !(r >= 'a' && r <= 'f' || r >= '0' && r <= '9') {
			return ""
		}
	}
	return v
}

func Slugify(v string) string {
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

func SafeFilename(v, fallback string) string {
	v = path.Base(strings.TrimSpace(v))
	if v == "." || v == "/" || v == "" {
		return fallback
	}
	return strings.ReplaceAll(v, `"`, "")
}

func DefaultString(v, fallback string) string {
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	return v
}

func FormatSize(bytes int64) string {
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

func UnixPtr(t time.Time) *int64 {
	v := t.UTC().Unix()
	return &v
}

func TimePtr(v *int64) *time.Time {
	if v == nil {
		return nil
	}
	t := time.Unix(*v, 0).UTC()
	return &t
}
