package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	appcontentcandidate "github.com/movscript/movscript/internal/app/contentcandidate"
	appdecision "github.com/movscript/movscript/internal/app/decision"
	"gorm.io/gorm"
)

type DecisionHandler struct {
	db      *gorm.DB
	service *appdecision.Service
}

func NewDecisionHandler(db *gorm.DB) *DecisionHandler {
	return &DecisionHandler{db: db, service: appdecision.NewService(db)}
}

func (h *DecisionHandler) Get(c *gin.Context) {
	projectID := parseID(c.Param("id"))
	targetKind := c.Query("target_kind")
	targetRef := c.Query("target_ref")
	h.reconcileContentUnitCandidates(c, projectID, targetKind, []string{targetRef})
	result, err := h.service.Get(c.Request.Context(), appdecision.TargetInput{
		ProjectID:  projectID,
		TargetKind: targetKind,
		TargetRef:  targetRef,
	})
	if err != nil {
		h.writeDecisionError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *DecisionHandler) Query(c *gin.Context) {
	var body struct {
		TargetKind string   `json:"target_kind" binding:"required"`
		TargetRefs []string `json:"target_refs" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	projectID := parseID(c.Param("id"))
	h.reconcileContentUnitCandidates(c, projectID, body.TargetKind, body.TargetRefs)
	result, err := h.service.Query(c.Request.Context(), appdecision.QueryTargetsInput{
		ProjectID:  projectID,
		TargetKind: body.TargetKind,
		TargetRefs: body.TargetRefs,
	})
	if err != nil {
		h.writeDecisionError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *DecisionHandler) ReplaceCandidates(c *gin.Context) {
	var body struct {
		TargetKind string            `json:"target_kind" binding:"required"`
		TargetRef  string            `json:"target_ref" binding:"required"`
		Candidates []json.RawMessage `json:"candidates" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	actorID := currentUserID(c)
	result, err := h.service.ReplaceCandidates(c.Request.Context(), appdecision.ReplaceCandidatesInput{
		TargetInput: appdecision.TargetInput{
			ProjectID:  parseID(c.Param("id")),
			TargetKind: body.TargetKind,
			TargetRef:  body.TargetRef,
		},
		Candidates: body.Candidates,
		ActorID:    actorID,
	})
	if err != nil {
		h.writeDecisionError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *DecisionHandler) UpsertCandidate(c *gin.Context) {
	var body struct {
		TargetKind string          `json:"target_kind" binding:"required"`
		TargetRef  string          `json:"target_ref" binding:"required"`
		Candidate  json.RawMessage `json:"candidate" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	actorID := currentUserID(c)
	result, err := h.service.UpsertCandidate(c.Request.Context(), appdecision.UpsertCandidateInput{
		TargetInput: appdecision.TargetInput{
			ProjectID:  parseID(c.Param("id")),
			TargetKind: body.TargetKind,
			TargetRef:  body.TargetRef,
		},
		Candidate: body.Candidate,
		ActorID:   actorID,
	})
	if err != nil {
		h.writeDecisionError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *DecisionHandler) Select(c *gin.Context) {
	var body struct {
		TargetKind        string          `json:"target_kind" binding:"required"`
		TargetRef         string          `json:"target_ref" binding:"required"`
		CandidateID       string          `json:"candidate_id"`
		ResourceID        *uint           `json:"resource_id"`
		AcceptedInputHash string          `json:"accepted_input_hash"`
		StalePolicy       string          `json:"stale_policy"`
		Reason            string          `json:"reason"`
		SelectedAt        string          `json:"selected_at"`
		Metadata          json.RawMessage `json:"metadata"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	actorID := currentUserID(c)
	result, err := h.service.Select(c.Request.Context(), appdecision.SelectInput{
		TargetInput: appdecision.TargetInput{
			ProjectID:  parseID(c.Param("id")),
			TargetKind: body.TargetKind,
			TargetRef:  body.TargetRef,
		},
		CandidateID:       body.CandidateID,
		ResourceID:        body.ResourceID,
		AcceptedInputHash: body.AcceptedInputHash,
		StalePolicy:       body.StalePolicy,
		Reason:            body.Reason,
		SelectedAt:        body.SelectedAt,
		SelectedBy:        actorID,
		Metadata:          body.Metadata,
		ActorID:           actorID,
	})
	if err != nil {
		h.writeDecisionError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *DecisionHandler) ClearSelection(c *gin.Context) {
	actorID := currentUserID(c)
	result, err := h.service.ClearSelection(c.Request.Context(), appdecision.TargetInput{
		ProjectID:  parseID(c.Param("id")),
		TargetKind: c.Query("target_kind"),
		TargetRef:  c.Query("target_ref"),
	}, actorID)
	if err != nil {
		h.writeDecisionError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *DecisionHandler) reconcileContentUnitCandidates(c *gin.Context, projectID uint, targetKind string, targetRefs []string) {
	if targetKind != appcontentcandidate.TargetKindContentUnit {
		return
	}
	_ = appcontentcandidate.ReconcileDecisionCandidates(c.Request.Context(), h.db, projectID, targetRefs)
}

func (h *DecisionHandler) writeDecisionError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, appdecision.ErrInvalidTarget),
		errors.Is(err, appdecision.ErrInvalidCandidate),
		errors.Is(err, appdecision.ErrInvalidSelection):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, appdecision.ErrDecisionNotFound),
		errors.Is(err, appdecision.ErrCandidateNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "decision operation failed"})
	}
}

func currentUserID(c *gin.Context) *uint {
	user := currentUser(c)
	if user == nil || user.ID == 0 {
		return nil
	}
	return &user.ID
}
