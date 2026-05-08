package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
)

func (h *SemanticEntityHandler) ApplyProductionProposal(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ApplyProductionProposalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if req.Proposal == nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("proposal is required"))
		return
	}

	resp, err := h.semantic.ApplyProductionProposal(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, resp)
}

func (h *SemanticEntityHandler) ApplyProjectProposal(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ApplyProjectProposalRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	if req.Proposal == nil && len(req.Operations) == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("proposal is required"))
		return
	}

	resp, err := h.semantic.ApplyProjectProposal(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, resp)
}
