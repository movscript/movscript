package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	appaudio "github.com/movscript/movscript/internal/app/audio"
	appresource "github.com/movscript/movscript/internal/app/resource"
	"github.com/movscript/movscript/internal/infra/ai"
	"github.com/movscript/movscript/internal/infra/storage"
	providercontract "github.com/movscript/movscript/internal/providers/contract"
	"gorm.io/gorm"
)

type AudioHandler struct {
	service      *appaudio.Service
	aiService    *ai.AIService
	modelCatalog providercontract.AIGatewayModelCatalog
}

func NewAudioHandler(db *gorm.DB, aiService *ai.AIService, store storage.Storage) *AudioHandler {
	handler := &AudioHandler{
		service:   appaudio.NewService(db, aiService, store),
		aiService: aiService,
	}
	if aiService != nil {
		handler.modelCatalog = aiService
	}
	return handler
}

func (h *AudioHandler) ListModels(c *gin.Context) {
	if h.modelCatalog == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ai model catalog is not configured"})
		return
	}
	ttsModels, err := h.listAudioModels(c, ai.CapabilityAudioTTS)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	sttModels, err := h.listAudioModels(c, ai.CapabilityAudioSTT)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	alignModels, err := h.listAudioModelsForCapabilities(c, ai.CapabilitySubAlign, ai.CapabilityAudioSTT)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"tts":        ttsModels,
		"transcribe": sttModels,
		"align":      alignModels,
	})
}

func (h *AudioHandler) listAudioModels(c *gin.Context, capability string) ([]ai.PublicModel, error) {
	descriptors, err := h.modelCatalog.ListModels(c.Request.Context(), providercontract.AIModelListFilter{Capability: capability})
	if err != nil {
		return nil, err
	}
	models := make([]ai.PublicModel, 0, len(descriptors))
	for _, descriptor := range descriptors {
		models = append(models, audioPublicModelFromDescriptor(descriptor))
	}
	return models, nil
}

func (h *AudioHandler) listAudioModelsForCapabilities(c *gin.Context, capabilities ...string) ([]ai.PublicModel, error) {
	seen := map[uint]bool{}
	models := []ai.PublicModel{}
	for _, capability := range capabilities {
		next, err := h.listAudioModels(c, capability)
		if err != nil {
			return nil, err
		}
		for _, model := range next {
			if seen[model.ID] {
				continue
			}
			seen[model.ID] = true
			models = append(models, model)
		}
	}
	return models, nil
}

func audioPublicModelFromDescriptor(descriptor providercontract.AIModelDescriptor) ai.PublicModel {
	return ai.PublicModel{
		ID:                descriptor.ModelConfigID,
		CredentialID:      descriptor.CredentialID,
		ModelID:           descriptor.ModelID,
		DisplayName:       descriptor.DisplayName,
		ShortName:         descriptor.ShortName,
		ProviderName:      descriptor.ProviderName,
		AdapterType:       descriptor.AdapterType,
		Capabilities:      append([]string(nil), descriptor.Capabilities...),
		PricingMode:       ai.PricingMode(descriptor.PricingMode),
		AcceptsImageInput: descriptor.AcceptsImageInput,
		IsDefault:         descriptor.IsDefault,
		LogicalModelID:    descriptor.LogicalModelID,
		ProviderVariants:  descriptor.ProviderVariants,
		ModelDefID:        descriptor.ModelDefID,
		ModelIDOverride:   descriptor.ModelIDOverride,
		Priority:          descriptor.Priority,
		CapacityWeight:    descriptor.CapacityWeight,
		MaxConcurrency:    descriptor.MaxConcurrency,
		InputRequirements: ai.ModelInputs{
			Image: ai.ModelInputRequirement{Min: descriptor.InputRequirements.Image.Min, Max: descriptor.InputRequirements.Image.Max},
			Video: ai.ModelInputRequirement{Min: descriptor.InputRequirements.Video.Min, Max: descriptor.InputRequirements.Video.Max},
		},
		ParamsSchema: descriptor.ParamsSchema,
	}
}

func (h *AudioHandler) Synthesize(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		ModelConfigID uint            `json:"model_config_id"`
		Text          string          `json:"text"`
		Voice         string          `json:"voice"`
		Language      string          `json:"language"`
		Model         string          `json:"model"`
		AudioFormat   string          `json:"audio_format"`
		Filename      string          `json:"filename"`
		Params        json.RawMessage `json:"params"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	result, err := h.service.Synthesize(c.Request.Context(), appaudio.TTSInput{
		UserID:        user.ID,
		OrgID:         currentOrgID(c),
		ModelConfigID: req.ModelConfigID,
		Text:          req.Text,
		Voice:         req.Voice,
		Language:      req.Language,
		Model:         req.Model,
		AudioFormat:   req.AudioFormat,
		Filename:      req.Filename,
		Params:        req.Params,
	})
	if err != nil {
		writeAudioError(c, err)
		return
	}
	result.Resource.URL = resourceURL(c, result.Resource.ID)
	c.JSON(http.StatusCreated, result)
}

func (h *AudioHandler) Transcribe(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		ModelConfigID   uint            `json:"model_config_id"`
		AudioResourceID uint            `json:"audio_resource_id"`
		Language        string          `json:"language"`
		Model           string          `json:"model"`
		Params          json.RawMessage `json:"params"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	result, err := h.service.Transcribe(c.Request.Context(), appaudio.TranscribeInput{
		UserID:          user.ID,
		OrgID:           currentOrgID(c),
		ModelConfigID:   req.ModelConfigID,
		AudioResourceID: req.AudioResourceID,
		Language:        req.Language,
		Model:           req.Model,
		Params:          req.Params,
	})
	if err != nil {
		writeAudioError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *AudioHandler) Align(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}
	var req struct {
		ModelConfigID   uint            `json:"model_config_id"`
		AudioResourceID uint            `json:"audio_resource_id"`
		Script          string          `json:"script"`
		Language        string          `json:"language"`
		Model           string          `json:"model"`
		Params          json.RawMessage `json:"params"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	result, err := h.service.Align(c.Request.Context(), appaudio.AlignInput{
		UserID:          user.ID,
		OrgID:           currentOrgID(c),
		ModelConfigID:   req.ModelConfigID,
		AudioResourceID: req.AudioResourceID,
		Script:          req.Script,
		Language:        req.Language,
		Model:           req.Model,
		Params:          req.Params,
	})
	if err != nil {
		writeAudioError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func writeAudioError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, appaudio.ErrInvalidRequest):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, appresource.ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "resource not found"})
	case errors.Is(err, appresource.ErrForbidden):
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden"})
	case errors.Is(err, appresource.ErrDuplicateName):
		c.JSON(http.StatusConflict, gin.H{"code": "RESOURCE_NAME_CONFLICT", "error": "resource filename already exists"})
	case errors.Is(err, appaudio.ErrProvider):
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
	}
}
