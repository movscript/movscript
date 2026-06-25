package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	appdecision "github.com/movscript/movscript/internal/app/decision"
	"github.com/movscript/movscript/internal/interfaces/http/api"
	"gorm.io/gorm"
)

type ProjectDataHandler struct {
	service *appdecision.ProjectDataService
}

func NewProjectDataHandler(db *gorm.DB) *ProjectDataHandler {
	return &ProjectDataHandler{service: appdecision.NewProjectDataService(db)}
}

func (h *ProjectDataHandler) ListSpaces(c *gin.Context) {
	scope, ok := h.scopeFromRequest(c, c.Query("scope_kind"), c.Query("scope_id"))
	if !ok {
		return
	}
	result, err := h.service.ListSpaces(c.Request.Context(), scope)
	if err != nil {
		h.writeProjectDataError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": result})
}

func (h *ProjectDataHandler) EnsureSpace(c *gin.Context) {
	var body struct {
		ScopeKind  string `json:"scope_kind"`
		ScopeID    string `json:"scope_id"`
		ProjectUID string `json:"project_uid" binding:"required"`
		Title      string `json:"title"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	scope, ok := h.scopeFromRequest(c, body.ScopeKind, body.ScopeID)
	if !ok {
		return
	}
	result, err := h.service.EnsureSpace(c.Request.Context(), appdecision.ProjectDataSpaceInput{
		ProjectDataScopeInput: scope,
		ProjectUID:            body.ProjectUID,
		Title:                 body.Title,
		ActorID:               currentUserID(c),
	})
	if err != nil {
		h.writeProjectDataError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *ProjectDataHandler) GetDecision(c *gin.Context) {
	input, ok := h.targetFromQuery(c)
	if !ok {
		return
	}
	result, err := h.service.Get(c.Request.Context(), input)
	if err != nil {
		h.writeProjectDataError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *ProjectDataHandler) QueryDecisions(c *gin.Context) {
	var body struct {
		ScopeKind  string   `json:"scope_kind"`
		ScopeID    string   `json:"scope_id"`
		ProjectUID string   `json:"project_uid" binding:"required"`
		Title      string   `json:"title"`
		TargetKind string   `json:"target_kind" binding:"required"`
		TargetRefs []string `json:"target_refs" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	scope, ok := h.scopeFromRequest(c, body.ScopeKind, body.ScopeID)
	if !ok {
		return
	}
	result, err := h.service.Query(c.Request.Context(), appdecision.ProjectDataQueryTargetsInput{
		ProjectDataSpaceInput: appdecision.ProjectDataSpaceInput{
			ProjectDataScopeInput: scope,
			ProjectUID:            body.ProjectUID,
			Title:                 body.Title,
			ActorID:               currentUserID(c),
		},
		TargetKind: body.TargetKind,
		TargetRefs: body.TargetRefs,
	})
	if err != nil {
		h.writeProjectDataError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *ProjectDataHandler) ReplaceCandidates(c *gin.Context) {
	var body struct {
		ScopeKind  string            `json:"scope_kind"`
		ScopeID    string            `json:"scope_id"`
		ProjectUID string            `json:"project_uid" binding:"required"`
		Title      string            `json:"title"`
		TargetKind string            `json:"target_kind" binding:"required"`
		TargetRef  string            `json:"target_ref" binding:"required"`
		Candidates []json.RawMessage `json:"candidates" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	scope, ok := h.scopeFromRequest(c, body.ScopeKind, body.ScopeID)
	if !ok {
		return
	}
	result, err := h.service.ReplaceCandidates(c.Request.Context(), appdecision.ProjectDataReplaceCandidatesInput{
		ProjectDataTargetInput: h.targetInput(scope, body.ProjectUID, body.Title, body.TargetKind, body.TargetRef, currentUserID(c)),
		Candidates:             body.Candidates,
	})
	if err != nil {
		h.writeProjectDataError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *ProjectDataHandler) UpsertCandidate(c *gin.Context) {
	var body struct {
		ScopeKind  string          `json:"scope_kind"`
		ScopeID    string          `json:"scope_id"`
		ProjectUID string          `json:"project_uid" binding:"required"`
		Title      string          `json:"title"`
		TargetKind string          `json:"target_kind" binding:"required"`
		TargetRef  string          `json:"target_ref" binding:"required"`
		Candidate  json.RawMessage `json:"candidate" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	scope, ok := h.scopeFromRequest(c, body.ScopeKind, body.ScopeID)
	if !ok {
		return
	}
	result, err := h.service.UpsertCandidate(c.Request.Context(), appdecision.ProjectDataUpsertCandidateInput{
		ProjectDataTargetInput: h.targetInput(scope, body.ProjectUID, body.Title, body.TargetKind, body.TargetRef, currentUserID(c)),
		Candidate:              body.Candidate,
	})
	if err != nil {
		h.writeProjectDataError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *ProjectDataHandler) Select(c *gin.Context) {
	var body struct {
		ScopeKind         string          `json:"scope_kind"`
		ScopeID           string          `json:"scope_id"`
		ProjectUID        string          `json:"project_uid" binding:"required"`
		Title             string          `json:"title"`
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
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
		return
	}
	scope, ok := h.scopeFromRequest(c, body.ScopeKind, body.ScopeID)
	if !ok {
		return
	}
	actorID := currentUserID(c)
	result, err := h.service.Select(c.Request.Context(), appdecision.ProjectDataSelectInput{
		ProjectDataTargetInput: h.targetInput(scope, body.ProjectUID, body.Title, body.TargetKind, body.TargetRef, actorID),
		CandidateID:            body.CandidateID,
		ResourceID:             body.ResourceID,
		AcceptedInputHash:      body.AcceptedInputHash,
		StalePolicy:            body.StalePolicy,
		Reason:                 body.Reason,
		SelectedAt:             body.SelectedAt,
		SelectedBy:             actorID,
		Metadata:               body.Metadata,
	})
	if err != nil {
		h.writeProjectDataError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *ProjectDataHandler) ClearSelection(c *gin.Context) {
	input, ok := h.targetFromQuery(c)
	if !ok {
		return
	}
	result, err := h.service.ClearSelection(c.Request.Context(), input, currentUserID(c))
	if err != nil {
		h.writeProjectDataError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func (h *ProjectDataHandler) targetFromQuery(c *gin.Context) (appdecision.ProjectDataTargetInput, bool) {
	scope, ok := h.scopeFromRequest(c, c.Query("scope_kind"), c.Query("scope_id"))
	if !ok {
		return appdecision.ProjectDataTargetInput{}, false
	}
	return h.targetInput(scope, c.Query("project_uid"), c.Query("title"), c.Query("target_kind"), c.Query("target_ref"), currentUserID(c)), true
}

func (h *ProjectDataHandler) targetInput(scope appdecision.ProjectDataScopeInput, projectUID string, title string, targetKind string, targetRef string, actorID *uint) appdecision.ProjectDataTargetInput {
	return appdecision.ProjectDataTargetInput{
		ProjectDataSpaceInput: appdecision.ProjectDataSpaceInput{
			ProjectDataScopeInput: scope,
			ProjectUID:            projectUID,
			Title:                 title,
			ActorID:               actorID,
		},
		TargetKind: targetKind,
		TargetRef:  targetRef,
	}
}

func (h *ProjectDataHandler) scopeFromRequest(c *gin.Context, rawKind string, rawID string) (appdecision.ProjectDataScopeInput, bool) {
	kind := strings.ToLower(strings.TrimSpace(rawKind))
	if kind == "" {
		kind = appdecision.ProjectDataScopeUser
	}
	user := currentUser(c)
	if user == nil || user.ID == 0 {
		c.JSON(http.StatusUnauthorized, api.AuthRequired())
		return appdecision.ProjectDataScopeInput{}, false
	}
	switch kind {
	case appdecision.ProjectDataScopeUser:
		currentUserIDText := strconv.FormatUint(uint64(user.ID), 10)
		scopeID := strings.TrimSpace(rawID)
		if scopeID == "" {
			scopeID = currentUserIDText
		}
		if scopeID != currentUserIDText {
			c.JSON(http.StatusForbidden, api.Forbidden("不能访问其他用户的数据空间"))
			return appdecision.ProjectDataScopeInput{}, false
		}
		return appdecision.ProjectDataScopeInput{ScopeKind: kind, ScopeID: scopeID}, true
	case appdecision.ProjectDataScopeOrg:
		orgID := currentOrgID(c)
		if orgID == nil || *orgID == 0 {
			c.JSON(http.StatusForbidden, api.Forbidden("无工作区信息"))
			return appdecision.ProjectDataScopeInput{}, false
		}
		currentOrgIDText := strconv.FormatUint(uint64(*orgID), 10)
		scopeID := strings.TrimSpace(rawID)
		if scopeID == "" {
			scopeID = currentOrgIDText
		}
		if scopeID != currentOrgIDText {
			c.JSON(http.StatusForbidden, api.Forbidden("不能访问其他组织的数据空间"))
			return appdecision.ProjectDataScopeInput{}, false
		}
		return appdecision.ProjectDataScopeInput{ScopeKind: kind, ScopeID: scopeID}, true
	default:
		c.JSON(http.StatusBadRequest, api.InvalidInput("无效的数据空间 scope"))
		return appdecision.ProjectDataScopeInput{}, false
	}
}

func (h *ProjectDataHandler) writeProjectDataError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, appdecision.ErrInvalidTarget),
		errors.Is(err, appdecision.ErrInvalidCandidate),
		errors.Is(err, appdecision.ErrInvalidSelection):
		c.JSON(http.StatusBadRequest, api.InvalidInput(err.Error()))
	case errors.Is(err, appdecision.ErrDecisionNotFound),
		errors.Is(err, appdecision.ErrCandidateNotFound):
		c.JSON(http.StatusNotFound, api.NotFound(err.Error()))
	default:
		c.JSON(http.StatusInternalServerError, api.Internal("project data operation failed"))
	}
}
