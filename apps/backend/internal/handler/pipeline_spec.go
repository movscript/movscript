package handler

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type pipelineNodeSpec struct {
	Type            string `json:"type"`
	Category        string `json:"category"` // work|custom
	ContentType     string `json:"content_type"`
	EntityType      string `json:"entity_type,omitempty"`
	CanCreateEntity bool   `json:"can_create_entity"`
	CanLinkEntity   bool   `json:"can_link_entity"`
}

var pipelineNodeSpecs = map[string]pipelineNodeSpec{
	"script_writing":      {Type: "script_writing", Category: "work", ContentType: "script"},
	"episode_writing":     {Type: "episode_writing", Category: "work", ContentType: "script"},
	"scene_writing":       {Type: "scene_writing", Category: "work", ContentType: "script"},
	"storyboard_creation": {Type: "storyboard_creation", Category: "work", ContentType: "storyboard"},
	"asset_creation":      {Type: "asset_creation", Category: "work", ContentType: "asset"},
	"raw_script":          {Type: "raw_script", Category: "work", ContentType: "script"},
	"shot_production":     {Type: "shot_production", Category: "work", ContentType: "shot"},
	"episode_edit":        {Type: "episode_edit", Category: "work", ContentType: "final_video"},

	"custom": {Type: "custom", Category: "custom", ContentType: "custom"},
}

var pipelineToolNodeTypes = map[string]bool{
	"ref_image_gen":    true,
	"ref_video_gen":    true,
	"style_transfer":   true,
	"motion_imitation": true,
	"multi_angle":      true,
}

func pipelineSpecForNode(nodeType string) pipelineNodeSpec {
	if spec, ok := pipelineNodeSpecs[nodeType]; ok {
		return spec
	}
	return pipelineNodeSpecs["custom"]
}

func isPipelineWorkNode(nodeType string) bool {
	return pipelineSpecForNode(nodeType).Category == "work"
}

func isPipelineToolNode(nodeType string) bool {
	return pipelineToolNodeTypes[nodeType]
}

func pipelineContentTypeForNode(nodeType string) string {
	return pipelineSpecForNode(nodeType).ContentType
}

func pipelineContentTypeForBinding(nodeType, entityType string) string {
	switch entityType {
	case "script", "storyboard", "shot", "asset", "episode", "scene", "final_video":
		return entityType
	default:
		return pipelineContentTypeForNode(nodeType)
	}
}

func pipelineEntityTypeForNode(nodeType string) string {
	return pipelineSpecForNode(nodeType).EntityType
}

func pipelineScriptTypeForNode(nodeType string) string {
	switch nodeType {
	case "episode_writing":
		return "episode"
	case "scene_writing":
		return "scene"
	case "script_writing", "raw_script":
		return "main"
	default:
		return ""
	}
}

func (h *PipelineHandler) GetNodeSpecs(c *gin.Context) {
	specs := make([]pipelineNodeSpec, 0, len(pipelineNodeSpecs))
	order := []string{
		"script_writing", "episode_writing", "scene_writing", "storyboard_creation", "asset_creation", "raw_script", "shot_production", "episode_edit",
		"custom",
	}
	for _, key := range order {
		specs = append(specs, pipelineNodeSpecs[key])
	}
	c.JSON(http.StatusOK, specs)
}

func (h *PipelineHandler) syncPipelineEntityBinding(tx *gorm.DB, node model.PipelineNode) error {
	if node.EntityID == nil || node.EntityType == "" {
		return nil
	}
	entityType := node.EntityType
	if entityType == "" {
		entityType = pipelineEntityTypeForNode(node.Type)
	}
	if expectedEntityType := pipelineEntityTypeForNode(node.Type); expectedEntityType != "" && entityType != expectedEntityType {
		return fmt.Errorf("该节点只能关联%s实体", expectedEntityType)
	}
	updates := map[string]any{"pipeline_node_id": node.ID}
	var result *gorm.DB
	switch entityType {
	case "script":
		var script model.Script
		if err := tx.Where("id = ? AND project_id = ?", *node.EntityID, node.ProjectID).First(&script).Error; err != nil {
			return fmt.Errorf("关联内容不存在或不属于该项目")
		}
		if expectedType := pipelineScriptTypeForNode(node.Type); expectedType != "" && script.ScriptType != expectedType {
			return fmt.Errorf("该节点只能关联%s类型剧本", expectedType)
		}
		return tx.Model(&script).Updates(updates).Error
	case "storyboard":
		result = tx.Model(&model.Storyboard{}).Where("id = ? AND project_id = ?", *node.EntityID, node.ProjectID).Updates(updates)
	case "shot":
		result = tx.Model(&model.Shot{}).Where("id = ? AND project_id = ?", *node.EntityID, node.ProjectID).Updates(updates)
	case "asset":
		result = tx.Model(&model.Asset{}).Where("id = ? AND project_id = ?", *node.EntityID, node.ProjectID).Updates(updates)
	case "episode":
		result = tx.Model(&model.Episode{}).Where("id = ? AND project_id = ?", *node.EntityID, node.ProjectID).Updates(updates)
	case "scene":
		result = tx.Model(&model.Scene{}).Where("id = ? AND project_id = ?", *node.EntityID, node.ProjectID).Updates(updates)
	case "final_video":
		result = tx.Model(&model.FinalVideo{}).Where("id = ? AND project_id = ?", *node.EntityID, node.ProjectID).Updates(updates)
	default:
		return nil
	}
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("关联内容不存在或不属于该项目")
	}
	return nil
}

func (h *PipelineHandler) clearPipelineEntityBinding(tx *gorm.DB, node model.PipelineNode) error {
	if node.EntityID == nil || node.EntityType == "" {
		return nil
	}
	updates := map[string]any{"pipeline_node_id": nil}
	switch node.EntityType {
	case "script":
		return tx.Model(&model.Script{}).Where("id = ? AND pipeline_node_id = ?", *node.EntityID, node.ID).Updates(updates).Error
	case "storyboard":
		return tx.Model(&model.Storyboard{}).Where("id = ? AND pipeline_node_id = ?", *node.EntityID, node.ID).Updates(updates).Error
	case "shot":
		return tx.Model(&model.Shot{}).Where("id = ? AND pipeline_node_id = ?", *node.EntityID, node.ID).Updates(updates).Error
	case "asset":
		return tx.Model(&model.Asset{}).Where("id = ? AND pipeline_node_id = ?", *node.EntityID, node.ID).Updates(updates).Error
	case "episode":
		return tx.Model(&model.Episode{}).Where("id = ? AND pipeline_node_id = ?", *node.EntityID, node.ID).Updates(updates).Error
	case "scene":
		return tx.Model(&model.Scene{}).Where("id = ? AND pipeline_node_id = ?", *node.EntityID, node.ID).Updates(updates).Error
	case "final_video":
		return tx.Model(&model.FinalVideo{}).Where("id = ? AND pipeline_node_id = ?", *node.EntityID, node.ID).Updates(updates).Error
	default:
		return nil
	}
}
