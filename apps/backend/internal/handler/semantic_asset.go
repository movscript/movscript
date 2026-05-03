package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/model"
)

func (h *SemanticEntityHandler) ListAssetSlots(c *gin.Context) {
	items, err := h.semantic.ListAssetSlots(c.Request.Context(), semanticapp.AssetSlotFilter{
		ProjectID:       parseID(c.Param("id")),
		ProductionID:    parseID(c.Query("production_id")),
		Status:          c.Query("status"),
		OwnerType:       c.Query("owner_type"),
		IncludeInternal: c.Query("include_internal"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	populateAssetSlotResourceURLs(c, items)
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateAssetSlot(c *gin.Context) {
	var req semanticapp.AssetSlotInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateAssetSlot(c.Request.Context(), parseID(c.Param("id")), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchAssetSlot(c *gin.Context) {
	var req semanticapp.PatchAssetSlotInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchAssetSlot(c.Request.Context(), parseID(c.Param("id")), c.Param("slotId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListAssetSlotCandidates(c *gin.Context) {
	items, err := h.semantic.ListAssetSlotCandidates(c.Request.Context(), semanticapp.AssetSlotCandidateFilter{
		ProjectID:   parseID(c.Param("id")),
		AssetSlotID: parseID(c.Query("asset_slot_id")),
		Status:      c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	populateAssetSlotCandidateResourceURLs(c, items)
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateAssetSlotCandidate(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.AssetSlotCandidateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	userID := uint(0)
	if id := currentUserID(c); id != nil {
		userID = *id
	}
	item, err := h.semantic.CreateAssetSlotCandidate(c.Request.Context(), projectID, req, userID)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	single := []model.AssetSlotCandidate{item}
	populateAssetSlotCandidateResourceURLs(c, single)
	c.JSON(http.StatusCreated, single[0])
}

func (h *SemanticEntityHandler) PatchAssetSlotCandidate(c *gin.Context) {
	var req semanticapp.AssetSlotCandidateInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchAssetSlotCandidate(c.Request.Context(), parseID(c.Param("id")), c.Param("candidateId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListCandidateDecisions(c *gin.Context) {
	items, err := h.semantic.ListCandidateDecisions(c.Request.Context(), semanticapp.CandidateDecisionFilter{
		ProjectID:         parseID(c.Param("id")),
		CandidateType:     c.Query("candidate_type"),
		CandidateID:       parseID(c.Query("candidate_id")),
		CandidateClientID: c.Query("candidate_client_id"),
		Decision:          c.Query("decision"),
		Status:            c.Query("status"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateCandidateDecision(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.CandidateDecisionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateCandidateDecision(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchCandidateDecision(c *gin.Context) {
	var req semanticapp.CandidateDecisionInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchCandidateDecision(c.Request.Context(), parseID(c.Param("id")), c.Param("decisionId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func (h *SemanticEntityHandler) ListReviewEvents(c *gin.Context) {
	items, err := h.semantic.ListReviewEvents(c.Request.Context(), semanticapp.ReviewEventFilter{
		ProjectID:       parseID(c.Param("id")),
		SubjectType:     c.Query("subject_type"),
		SubjectID:       parseID(c.Query("subject_id")),
		SubjectClientID: c.Query("subject_client_id"),
		EventType:       c.Query("event_type"),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.JSON(http.StatusOK, items)
}

func (h *SemanticEntityHandler) CreateReviewEvent(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	var req semanticapp.ReviewEventInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.CreateReviewEvent(c.Request.Context(), projectID, req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusCreated, item)
}

func (h *SemanticEntityHandler) PatchReviewEvent(c *gin.Context) {
	var req semanticapp.ReviewEventInput
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	item, err := h.semantic.PatchReviewEvent(c.Request.Context(), parseID(c.Param("id")), c.Param("eventId"), req)
	if err != nil {
		h.writeSemanticAppError(c, err)
		return
	}
	c.JSON(http.StatusOK, item)
}

func populateAssetSlotResourceURLs(c *gin.Context, items []model.AssetSlot) {
	for i := range items {
		if items[i].Resource != nil {
			items[i].Resource.URL = resourceURL(c, items[i].Resource.ID)
		}
		if items[i].LockedAssetSlot != nil && items[i].LockedAssetSlot.Resource != nil {
			items[i].LockedAssetSlot.Resource.URL = resourceURL(c, items[i].LockedAssetSlot.Resource.ID)
		}
	}
}

func populateAssetSlotCandidateResourceURLs(c *gin.Context, items []model.AssetSlotCandidate) {
	for i := range items {
		if items[i].CandidateAssetSlot != nil && items[i].CandidateAssetSlot.Resource != nil {
			items[i].CandidateAssetSlot.Resource.URL = resourceURL(c, items[i].CandidateAssetSlot.Resource.ID)
		}
	}
}

func populateKeyframeResourceURLs(c *gin.Context, items []model.Keyframe) {
	for i := range items {
		if items[i].Resource != nil {
			items[i].Resource.URL = resourceURL(c, items[i].Resource.ID)
		}
	}
}
