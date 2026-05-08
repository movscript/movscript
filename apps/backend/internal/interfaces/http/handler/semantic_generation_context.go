package handler

import (
	"errors"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
)

func (h *SemanticEntityHandler) BuildGenerationContext(c *gin.Context) {
	var req semanticapp.GenerationContextRequest
	if err := c.ShouldBindJSON(&req); err != nil && !errors.Is(err, io.EOF) {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if req.TargetType == "" {
		req.TargetType = "content_unit"
	}
	if req.TargetID == 0 {
		req.TargetID = parseID(c.Param("contentUnitId"))
	}
	if req.Intent == "" {
		req.Intent = c.Query("intent")
	}
	item, err := h.semantic.BuildGenerationContext(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	populateAssetSlotResourceURLs(c, item.AssetSlots)
	populateDomainKeyframeResourceURLs(c, item.Keyframes)
	c.JSON(http.StatusOK, item)
}
