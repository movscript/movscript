package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	projectapp "github.com/movscript/movscript/internal/app/project"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/interfaces/http/api"
)

func (h *SemanticEntityHandler) DeleteSemanticItemByKind(c *gin.Context, kind string, id string) {
	projectID := parseID(c.Param("id"))
	if err := h.semantic.DeleteItemByKind(c.Request.Context(), projectID, kind, id); err != nil {
		if errors.Is(err, semanticapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, api.NotFound("对象不存在"))
			return
		}
		h.writeSemanticAppError(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *SemanticEntityHandler) writeSemanticAppError(c *gin.Context, err error) {
	var invalidInput semanticapp.ErrInvalidInput
	var forbidden semanticapp.ErrForbidden
	var generationContextErr semanticapp.GenerationContextError
	var productionProposalApplyLinkErr *semanticapp.ProductionProposalApplyLinkError
	var projectLayerProposalAssetSlotLinkErr *semanticapp.ProjectLayerProposalAssetSlotLinkError
	var projectLayerProposalApplyLinkErr *semanticapp.ProjectLayerProposalApplyLinkError
	switch {
	case errors.As(err, &productionProposalApplyLinkErr):
		if errors.Is(err, semanticapp.ErrOwnerWrongProject) {
			c.JSON(http.StatusBadRequest, api.InvalidInputDebug(productionProposalApplyLinkErr.Message, productionProposalApplyLinkErr))
			return
		}
		c.JSON(http.StatusNotFound, api.NotFoundDebug(productionProposalApplyLinkErr.Message, productionProposalApplyLinkErr))
	case errors.As(err, &projectLayerProposalAssetSlotLinkErr):
		if errors.Is(err, semanticapp.ErrOwnerWrongProject) {
			c.JSON(http.StatusBadRequest, api.InvalidInputDebug(projectLayerProposalAssetSlotLinkErr.Message, projectLayerProposalAssetSlotLinkErr))
			return
		}
		c.JSON(http.StatusNotFound, api.NotFoundDebug(projectLayerProposalAssetSlotLinkErr.Message, projectLayerProposalAssetSlotLinkErr))
	case errors.As(err, &projectLayerProposalApplyLinkErr):
		if errors.Is(err, semanticapp.ErrOwnerWrongProject) {
			c.JSON(http.StatusBadRequest, api.InvalidInputDebug(projectLayerProposalApplyLinkErr.Message, projectLayerProposalApplyLinkErr))
			return
		}
		c.JSON(http.StatusNotFound, api.NotFoundDebug(projectLayerProposalApplyLinkErr.Message, projectLayerProposalApplyLinkErr))
	case errors.As(err, &generationContextErr):
		if generationContextErr.Code == "GENERATION_CONTEXT_UNSUPPORTED_TARGET" || generationContextErr.Code == "GENERATION_CONTEXT_TARGET_REQUIRED" {
			c.JSON(http.StatusBadRequest, api.InvalidInputDebug(generationContextErr.Message, generationContextErr))
			return
		}
		if generationContextErr.Code == "GENERATION_CONTEXT_ENTITY_NOT_FOUND" {
			c.JSON(http.StatusNotFound, api.NotFoundDebug(generationContextErr.Message, generationContextErr))
			return
		}
		c.JSON(http.StatusInternalServerError, api.Response{
			Code:    api.CodeInternalError,
			Message: generationContextErr.Message,
			Action:  api.ActionRetry,
			Debug:   generationContextErr,
		})
	case errors.As(err, &invalidInput):
		c.JSON(http.StatusBadRequest, api.InvalidInput(invalidInput.Error()))
	case errors.As(err, &forbidden):
		c.JSON(http.StatusForbidden, api.InvalidInput(forbidden.Error()))
	case errors.Is(err, semanticapp.ErrNotFound):
		c.JSON(http.StatusNotFound, api.NotFound("对象不存在"))
	case errors.Is(err, semanticapp.ErrOwnerNotFound), errors.Is(err, semanticapp.ErrTextBlockNotFound):
		message := "关联对象不存在"
		if err.Error() != semanticapp.ErrOwnerNotFound.Error() && err.Error() != semanticapp.ErrTextBlockNotFound.Error() {
			message = err.Error()
		}
		c.JSON(http.StatusNotFound, api.NotFound(message))
	case errors.Is(err, semanticapp.ErrOwnerWrongProject):
		c.JSON(http.StatusBadRequest, api.InvalidInput("关联对象不属于当前项目"))
	case errors.Is(err, semanticapp.ErrOwnerInvalidType):
		c.JSON(http.StatusBadRequest, api.InvalidInput("关联对象类型不支持"))
	case errors.Is(err, semanticapp.ErrSegmentProductionMismatch):
		c.JSON(http.StatusBadRequest, api.InvalidInput("片段绑定的制作和文本块所属制作不一致"))
	default:
		c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
	}
}

func (h *SemanticEntityHandler) projectRole(c *gin.Context, projectID uint) (string, uint, bool) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, api.InvalidInput("未登录"))
		return "", 0, false
	}
	role, _, ok := h.resolveProjectRole(c, projectID, user.ID, user.SystemRole)
	if !ok {
		return "", 0, false
	}
	return role, user.ID, true
}

func currentUserID(c *gin.Context) *uint {
	if user := currentUser(c); user != nil {
		id := user.ID
		return &id
	}
	return nil
}

func (h *SemanticEntityHandler) resolveProjectRole(c *gin.Context, projectID uint, userID uint, systemRole string) (string, uint, bool) {
	role, err := h.projects.ResolveRole(c.Request.Context(), projectID, userID, systemRole)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, api.NotFound("项目不存在"))
		case errors.Is(err, projectapp.ErrProjectMemberNotFound):
			c.JSON(http.StatusForbidden, api.InvalidInput("不是项目成员"))
		default:
			c.JSON(http.StatusInternalServerError, api.Internal(err.Error()))
		}
		return "", 0, false
	}
	return role.Role, role.UserID, true
}
