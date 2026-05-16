package handler

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	resourcebinding "github.com/movscript/movscript/internal/app/resource/binding"
	domainbinding "github.com/movscript/movscript/internal/domain/resource/binding"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type ResourceBindingHandler struct {
	service *resourcebinding.Service
}

func NewResourceBindingHandler(db *gorm.DB) *ResourceBindingHandler {
	return &ResourceBindingHandler{service: resourcebinding.NewService(db)}
}

type resourceBindingInput struct {
	ResourceID   uint   `json:"resource_id" binding:"required"`
	OwnerType    string `json:"owner_type" binding:"required"`
	OwnerID      uint   `json:"owner_id" binding:"required"`
	Role         string `json:"role"`
	Slot         string `json:"slot"`
	SortOrder    *int   `json:"sort_order"`
	Version      int    `json:"version"`
	IsPrimary    bool   `json:"is_primary"`
	Status       string `json:"status"`
	SourceType   string `json:"source_type"`
	SourceID     *uint  `json:"source_id"`
	MetadataJSON string `json:"metadata_json"`
}

// ListByProject returns resource bindings for a project, optionally filtered by
// owner_type, owner_id, role, status, or resource_id.
func (h *ResourceBindingHandler) ListByProject(c *gin.Context) {
	bindings, err := h.service.List(c.Request.Context(), resourceBindingFilterFromRequest(c, parseID(c.Param("id"))))
	if err != nil {
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		return
	}
	populateBindingResourceURLs(c, bindings)
	c.JSON(http.StatusOK, bindings)
}

// ListByEntity returns resources bound to one creative entity within a project.
func (h *ResourceBindingHandler) ListByEntity(c *gin.Context) {
	filter := resourceBindingFilterFromRequest(c, parseID(c.Param("id")))
	filter.OwnerType = c.Param("ownerType")
	filter.OwnerID = parseID(c.Param("ownerId"))

	bindings, err := h.service.ListByEntity(c.Request.Context(), filter)
	if err != nil {
		h.writeResourceBindingError(c, err)
		return
	}
	populateBindingResourceURLs(c, bindings)
	c.JSON(http.StatusOK, bindings)
}

func (h *ResourceBindingHandler) CreateByProject(c *gin.Context) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return
	}

	var input resourceBindingInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	createdByID := user.ID
	binding, created, err := h.service.Create(c.Request.Context(), resourcebinding.CreateInput{
		ProjectID:    parseID(c.Param("id")),
		ResourceID:   input.ResourceID,
		OwnerType:    input.OwnerType,
		OwnerID:      input.OwnerID,
		Role:         input.Role,
		Slot:         input.Slot,
		SortOrder:    input.SortOrder,
		Version:      input.Version,
		IsPrimary:    input.IsPrimary,
		Status:       input.Status,
		SourceType:   input.SourceType,
		SourceID:     input.SourceID,
		MetadataJSON: input.MetadataJSON,
		CreatedByID:  &createdByID,
	}, user.ID)
	if err != nil {
		h.writeResourceBindingError(c, err)
		return
	}
	populateBindingResourceURLs(c, []domainbinding.Binding{binding})
	if created {
		c.JSON(http.StatusCreated, binding)
		return
	}
	c.JSON(http.StatusOK, binding)
}

func (h *ResourceBindingHandler) Patch(c *gin.Context) {
	var body struct {
		Role         *string `json:"role"`
		Slot         *string `json:"slot"`
		SortOrder    *int    `json:"sort_order"`
		Version      *int    `json:"version"`
		IsPrimary    *bool   `json:"is_primary"`
		Status       *string `json:"status"`
		SourceType   *string `json:"source_type"`
		SourceID     *uint   `json:"source_id"`
		MetadataJSON *string `json:"metadata_json"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	id := parseID(c.Param("id"))
	binding, err := h.service.Update(c.Request.Context(), id, resourcebinding.UpdateInput{
		Role:         body.Role,
		Slot:         body.Slot,
		SortOrder:    body.SortOrder,
		Version:      body.Version,
		IsPrimary:    body.IsPrimary,
		Status:       body.Status,
		SourceType:   body.SourceType,
		SourceID:     body.SourceID,
		MetadataJSON: body.MetadataJSON,
	})
	if err != nil {
		h.writeResourceBindingError(c, err)
		return
	}
	populateBindingResourceURLs(c, []domainbinding.Binding{binding})
	c.JSON(http.StatusOK, binding)
}

func (h *ResourceBindingHandler) Delete(c *gin.Context) {
	if err := h.service.Delete(c.Request.Context(), parseID(c.Param("id"))); err != nil {
		h.writeResourceBindingError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func resourceBindingFilterFromRequest(c *gin.Context, projectID uint) resourcebinding.Filter {
	return resourcebinding.Filter{
		ProjectID:  projectID,
		OwnerType:  c.Query("owner_type"),
		OwnerID:    parseOptionalUint(c.Query("owner_id")),
		Role:       c.Query("role"),
		Status:     c.Query("status"),
		ResourceID: parseOptionalUint(c.Query("resource_id")),
	}
}

func parseOptionalUint(value string) uint {
	if value == "" {
		return 0
	}
	parsed, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return 0
	}
	return uint(parsed)
}

func populateBindingResourceURLs(c *gin.Context, bindings []domainbinding.Binding) {
	for i := range bindings {
		if bindings[i].Resource != nil {
			bindings[i].Resource.URL = resourceURL(c, bindings[i].Resource.ID)
		}
	}
}

func (h *ResourceBindingHandler) writeResourceBindingError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, resourcebinding.ErrResourceNotFound):
		c.JSON(http.StatusNotFound, api.NotFound("资源不存在"))
	case errors.Is(err, resourcebinding.ErrResourceForbidden):
		c.JSON(http.StatusForbidden, api.Forbidden("无权绑定该资源"))
	case errors.Is(err, resourcebinding.ErrOwnerNotFound):
		c.JSON(http.StatusNotFound, api.NotFound("资源归属实体不存在"))
	case errors.Is(err, resourcebinding.ErrBindingNotFound):
		c.JSON(http.StatusNotFound, api.NotFound("资源绑定不存在"))
	case errors.Is(err, resourcebinding.ErrOwnerWrongProject):
		c.JSON(http.StatusBadRequest, api.InvalidInput("资源归属实体不属于当前项目"))
	case errors.Is(err, resourcebinding.ErrOwnerInvalidType):
		c.JSON(http.StatusBadRequest, api.InvalidInput("资源归属类型不合法"))
	case errors.Is(err, resourcebinding.ErrInvalidInput):
		c.JSON(http.StatusBadRequest, api.InvalidInput("资源绑定参数不合法"))
	default:
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
	}
}
