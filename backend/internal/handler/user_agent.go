package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
)

type UserAgentHandler struct {
	db *gorm.DB
}

func NewUserAgentHandler(db *gorm.DB) *UserAgentHandler {
	return &UserAgentHandler{db: db}
}

type userAgentResponse struct {
	ID                    uint               `json:"id"`
	Name                  string             `json:"name"`
	SourceTemplateID      *uint              `json:"source_template_id"`
	AcceptPlatformUpdates bool               `json:"accept_platform_updates"`
	PlatformModelID       *uint              `json:"platform_model_id"`
	CustomModel           *CustomModelConfig `json:"custom_model"`
	Soul                  string             `json:"soul"`
	Skills                []AgentSkill       `json:"skills"`
	CreatedAt             int64              `json:"created_at"`
	UpdatedAt             int64              `json:"updated_at"`
}

func toUserAgentResponse(a model.UserAgent) userAgentResponse {
	resp := userAgentResponse{
		ID:                    a.ID,
		Name:                  a.Name,
		SourceTemplateID:      a.SourceTemplateID,
		AcceptPlatformUpdates: a.AcceptPlatformUpdates,
		PlatformModelID:       a.PlatformModelID,
		Soul:                  a.Soul,
		Skills:                []AgentSkill{},
		CreatedAt:             a.CreatedAt.Unix(),
		UpdatedAt:             a.UpdatedAt.Unix(),
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

func (h *UserAgentHandler) getUser(c *gin.Context) *model.User {
	u, ok := c.Get(middleware.ContextUserKey)
	if !ok {
		return nil
	}
	return u.(*model.User)
}

func (h *UserAgentHandler) List(c *gin.Context) {
	user := h.getUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	var agents []model.UserAgent
	if err := h.db.Where("user_id = ?", user.ID).Order("id asc").Find(&agents).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	resp := make([]userAgentResponse, len(agents))
	for i, a := range agents {
		resp[i] = toUserAgentResponse(a)
	}
	c.JSON(http.StatusOK, resp)
}

func (h *UserAgentHandler) Create(c *gin.Context) {
	user := h.getUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	var req struct {
		Name                  string             `json:"name" binding:"required"`
		SourceTemplateID      *uint              `json:"source_template_id"`
		AcceptPlatformUpdates *bool              `json:"accept_platform_updates"`
		PlatformModelID       *uint              `json:"platform_model_id"`
		CustomModel           *CustomModelConfig `json:"custom_model"`
		Soul                  string             `json:"soul"`
		Skills                []AgentSkill       `json:"skills"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	accept := true
	if req.AcceptPlatformUpdates != nil {
		accept = *req.AcceptPlatformUpdates
	}

	agent := model.UserAgent{
		UserID:                user.ID,
		Name:                  req.Name,
		SourceTemplateID:      req.SourceTemplateID,
		AcceptPlatformUpdates: accept,
		PlatformModelID:       req.PlatformModelID,
		Soul:                  req.Soul,
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
	c.JSON(http.StatusCreated, toUserAgentResponse(agent))
}

func (h *UserAgentHandler) Update(c *gin.Context) {
	user := h.getUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}

	var agent model.UserAgent
	if err := h.db.Where("id = ? AND user_id = ?", id, user.ID).First(&agent).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "agent not found"})
		return
	}

	var req struct {
		Name                  string             `json:"name"`
		AcceptPlatformUpdates *bool              `json:"accept_platform_updates"`
		PlatformModelID       *uint              `json:"platform_model_id"`
		CustomModel           *CustomModelConfig `json:"custom_model"`
		Soul                  string             `json:"soul"`
		Skills                []AgentSkill       `json:"skills"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		agent.Name = req.Name
	}
	if req.AcceptPlatformUpdates != nil {
		agent.AcceptPlatformUpdates = *req.AcceptPlatformUpdates
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
	c.JSON(http.StatusOK, toUserAgentResponse(agent))
}

func (h *UserAgentHandler) Delete(c *gin.Context) {
	user := h.getUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "未登录"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid id"})
		return
	}
	if err := h.db.Where("id = ? AND user_id = ?", id, user.ID).Delete(&model.UserAgent{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusNoContent, nil)
}
