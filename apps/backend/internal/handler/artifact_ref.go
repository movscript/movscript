package handler

import (
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type ArtifactRefHandler struct{ db *gorm.DB }

func NewArtifactRefHandler(db *gorm.DB) *ArtifactRefHandler { return &ArtifactRefHandler{db: db} }

type ArtifactEntityContext struct {
	EpisodeID    *uint `json:"episode_id,omitempty"`
	SceneID      *uint `json:"scene_id,omitempty"`
	StoryboardID *uint `json:"storyboard_id,omitempty"`
	SettingID    *uint `json:"setting_id,omitempty"`
}

type ArtifactRef struct {
	Kind           string                `json:"kind"`
	ID             uint                  `json:"id"`
	Title          string                `json:"title"`
	Subtitle       string                `json:"subtitle,omitempty"`
	Status         string                `json:"status,omitempty"`
	PipelineNodeID *uint                 `json:"pipeline_node_id,omitempty"`
	EntityContext  ArtifactEntityContext `json:"entity_context"`
	Resource       *model.RawResource    `json:"resource,omitempty"`
	CreatedAt      string                `json:"created_at"`
	UpdatedAt      string                `json:"updated_at"`
}

func (h *ArtifactRefHandler) ListByProject(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	kindFilter := strings.TrimSpace(c.Query("kind"))
	refs := make([]ArtifactRef, 0)

	if kindFilter == "" || kindFilter == "script" {
		refs = append(refs, h.scriptRefs(projectID)...)
	}
	if kindFilter == "" || kindFilter == "asset" {
		refs = append(refs, h.assetRefs(c, projectID)...)
	}
	if kindFilter == "" || kindFilter == "storyboard" {
		refs = append(refs, h.storyboardRefs(projectID)...)
	}
	if kindFilter == "" || kindFilter == "shot" {
		refs = append(refs, h.shotRefs(projectID)...)
	}
	if kindFilter == "" || kindFilter == "final_video" {
		refs = append(refs, h.finalVideoRefs(c, projectID)...)
	}

	sort.SliceStable(refs, func(i, j int) bool {
		return refs[i].UpdatedAt > refs[j].UpdatedAt
	})
	c.JSON(http.StatusOK, refs)
}

func (h *ArtifactRefHandler) scriptRefs(projectID uint) []ArtifactRef {
	var scripts []model.Script
	h.db.Where("project_id = ?", projectID).Order("updated_at desc").Find(&scripts)
	refs := make([]ArtifactRef, 0, len(scripts))
	for _, script := range scripts {
		subtitle := scriptTypeLabel(script.ScriptType)
		if script.EpisodeID != nil {
			var episode model.Episode
			if err := h.db.Select("id, number, title").First(&episode, *script.EpisodeID).Error; err == nil {
				subtitle = subtitle + " · EP" + padEpisodeNumber(episode.Number) + " " + episode.Title
			}
		}
		refs = append(refs, ArtifactRef{
			Kind:           "script",
			ID:             script.ID,
			Title:          fallbackTitle(script.Title, "未命名剧本"),
			Subtitle:       subtitle,
			Status:         script.Status,
			PipelineNodeID: script.PipelineNodeID,
			EntityContext:  ArtifactEntityContext{EpisodeID: script.EpisodeID},
			CreatedAt:      script.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:      script.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

func (h *ArtifactRefHandler) assetRefs(c *gin.Context, projectID uint) []ArtifactRef {
	var assets []model.Asset
	h.db.Preload("Views.Resource").Where("project_id = ?", projectID).Order("updated_at desc").Find(&assets)
	refs := make([]ArtifactRef, 0, len(assets))
	for _, asset := range assets {
		var resource *model.RawResource
		for _, view := range asset.Views {
			if view.Resource != nil {
				resource = view.Resource
				resource.URL = resourceURL(c, resource.ID)
				break
			}
		}
		refs = append(refs, ArtifactRef{
			Kind:           "asset",
			ID:             asset.ID,
			Title:          fallbackTitle(asset.Name, "未命名素材"),
			Subtitle:       asset.Type,
			Status:         asset.ReviewStatus,
			PipelineNodeID: asset.PipelineNodeID,
			EntityContext:  ArtifactEntityContext{SettingID: asset.SettingID},
			Resource:       resource,
			CreatedAt:      asset.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:      asset.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

func (h *ArtifactRefHandler) storyboardRefs(projectID uint) []ArtifactRef {
	var storyboards []model.Storyboard
	h.db.Where("project_id = ?", projectID).Order("updated_at desc").Find(&storyboards)
	refs := make([]ArtifactRef, 0, len(storyboards))
	for _, storyboard := range storyboards {
		refs = append(refs, ArtifactRef{
			Kind:           "storyboard",
			ID:             storyboard.ID,
			Title:          fallbackTitle(storyboard.Title, "分镜 #"+intToString(storyboard.Order)),
			Subtitle:       storyboard.Description,
			Status:         storyboard.Status,
			PipelineNodeID: storyboard.PipelineNodeID,
			EntityContext:  ArtifactEntityContext{EpisodeID: storyboard.EpisodeID, SceneID: storyboard.SceneID},
			CreatedAt:      storyboard.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:      storyboard.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

func (h *ArtifactRefHandler) shotRefs(projectID uint) []ArtifactRef {
	var shots []model.Shot
	h.db.Where("project_id = ?", projectID).Order("updated_at desc").Find(&shots)
	refs := make([]ArtifactRef, 0, len(shots))
	for _, shot := range shots {
		ctx := ArtifactEntityContext{StoryboardID: shot.StoryboardID}
		if shot.StoryboardID != nil {
			var storyboard model.Storyboard
			if err := h.db.Select("id, episode_id, scene_id").First(&storyboard, *shot.StoryboardID).Error; err == nil {
				ctx.EpisodeID = storyboard.EpisodeID
				ctx.SceneID = storyboard.SceneID
			}
		}
		refs = append(refs, ArtifactRef{
			Kind:           "shot",
			ID:             shot.ID,
			Title:          "镜头 #" + intToString(shot.Order),
			Subtitle:       fallbackTitle(shot.FinalDescription, shot.Description),
			Status:         shot.Status,
			PipelineNodeID: shot.PipelineNodeID,
			EntityContext:  ctx,
			CreatedAt:      shot.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt:      shot.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

func (h *ArtifactRefHandler) finalVideoRefs(c *gin.Context, projectID uint) []ArtifactRef {
	var videos []model.FinalVideo
	h.db.Preload("Resource").Where("project_id = ?", projectID).Order("updated_at desc").Find(&videos)
	refs := make([]ArtifactRef, 0, len(videos))
	for _, video := range videos {
		if video.Resource != nil {
			video.Resource.URL = resourceURL(c, video.Resource.ID)
		}
		refs = append(refs, ArtifactRef{
			Kind:           "final_video",
			ID:             video.ID,
			Title:          fallbackTitle(video.Title, "成片"),
			Subtitle:       video.Description,
			Status:         video.Status,
			PipelineNodeID: video.PipelineNodeID,
			EntityContext: ArtifactEntityContext{
				EpisodeID:    video.EpisodeID,
				SceneID:      video.SceneID,
				StoryboardID: video.StoryboardID,
			},
			Resource:  video.Resource,
			CreatedAt: video.CreatedAt.Format(timeFormatRFC3339),
			UpdatedAt: video.UpdatedAt.Format(timeFormatRFC3339),
		})
	}
	return refs
}

const timeFormatRFC3339 = "2006-01-02T15:04:05Z07:00"

func scriptTypeLabel(scriptType string) string {
	switch scriptType {
	case "main":
		return "主剧本"
	case "episode":
		return "分集剧本"
	case "scene":
		return "分场剧本"
	default:
		return scriptType
	}
}

func fallbackTitle(value string, fallback string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return fallback
}

func intToString(value int) string {
	if value == 0 {
		return "0"
	}
	digits := make([]byte, 0, 10)
	n := value
	if n < 0 {
		n = -n
	}
	for n > 0 {
		digits = append(digits, byte('0'+n%10))
		n /= 10
	}
	if value < 0 {
		digits = append(digits, '-')
	}
	for i, j := 0, len(digits)-1; i < j; i, j = i+1, j-1 {
		digits[i], digits[j] = digits[j], digits[i]
	}
	return string(digits)
}

func padEpisodeNumber(value int) string {
	if value >= 0 && value < 10 {
		return "0" + intToString(value)
	}
	return intToString(value)
}
