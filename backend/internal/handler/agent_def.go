package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type AgentTemplateHandler struct {
	db *gorm.DB
}

func NewAgentDefHandler(db *gorm.DB) *AgentTemplateHandler {
	return &AgentTemplateHandler{db: db}
}

type AgentSkill struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type CustomModelConfig struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	BaseURL string `json:"base_url"`
	APIKey  string `json:"api_key"`
	ModelID string `json:"model_id"`
}

type agentTemplateResponse struct {
	ID              uint               `json:"id"`
	Name            string             `json:"name"`
	PlatformModelID *uint              `json:"platform_model_id"`
	CustomModel     *CustomModelConfig `json:"custom_model"`
	Soul            string             `json:"soul"`
	Skills          []AgentSkill       `json:"skills"`
	CreatedAt       int64              `json:"created_at"`
	UpdatedAt       int64              `json:"updated_at"`
}

func toAgentResponse(a model.AgentTemplate) agentTemplateResponse {
	resp := agentTemplateResponse{
		ID:              a.ID,
		Name:            a.Name,
		PlatformModelID: a.PlatformModelID,
		Soul:            a.Soul,
		Skills:          []AgentSkill{},
		CreatedAt:       a.CreatedAt.Unix(),
		UpdatedAt:       a.UpdatedAt.Unix(),
	}
	if a.SkillsJSON != "" {
		_ = json.Unmarshal([]byte(a.SkillsJSON), &resp.Skills)
	}
	if a.CustomModelJSON != "" {
		var cm CustomModelConfig
		if err := json.Unmarshal([]byte(a.CustomModelJSON), &cm); err == nil {
			resp.CustomModel = &cm
		}
	}
	return resp
}

func (h *AgentTemplateHandler) List(c *gin.Context) {
	var agents []model.AgentTemplate
	if err := h.db.Order("id asc").Find(&agents).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	resp := make([]agentTemplateResponse, len(agents))
	for i, a := range agents {
		resp[i] = toAgentResponse(a)
	}
	c.JSON(http.StatusOK, resp)
}

func (h *AgentTemplateHandler) Create(c *gin.Context) {
	var req struct {
		Name            string             `json:"name" binding:"required"`
		PlatformModelID *uint              `json:"platform_model_id"`
		CustomModel     *CustomModelConfig `json:"custom_model"`
		Soul            string             `json:"soul"`
		Skills          []AgentSkill       `json:"skills"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	agent := model.AgentTemplate{
		Name:            req.Name,
		PlatformModelID: req.PlatformModelID,
		Soul:            req.Soul,
	}
	if len(req.Skills) > 0 {
		b, _ := json.Marshal(req.Skills)
		agent.SkillsJSON = string(b)
	}
	if req.CustomModel != nil {
		b, _ := json.Marshal(req.CustomModel)
		agent.CustomModelJSON = string(b)
	}

	if err := h.db.Create(&agent).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, toAgentResponse(agent))
}

func (h *AgentTemplateHandler) Update(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var agent model.AgentTemplate
	if err := h.db.First(&agent, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent template not found"})
		return
	}

	var req struct {
		Name            string             `json:"name"`
		PlatformModelID *uint              `json:"platform_model_id"`
		CustomModel     *CustomModelConfig `json:"custom_model"`
		Soul            string             `json:"soul"`
		Skills          []AgentSkill       `json:"skills"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		agent.Name = req.Name
	}
	agent.PlatformModelID = req.PlatformModelID
	agent.Soul = req.Soul

	if req.Skills != nil {
		b, _ := json.Marshal(req.Skills)
		agent.SkillsJSON = string(b)
	}
	if req.CustomModel != nil {
		b, _ := json.Marshal(req.CustomModel)
		agent.CustomModelJSON = string(b)
	} else {
		agent.CustomModelJSON = ""
	}

	if err := h.db.Save(&agent).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, toAgentResponse(agent))
}

func (h *AgentTemplateHandler) Delete(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.db.Delete(&model.AgentTemplate{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
