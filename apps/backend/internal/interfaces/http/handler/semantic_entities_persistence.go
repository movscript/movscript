package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	projectapp "github.com/movscript/movscript/internal/app/project"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
)

func (h *SemanticEntityHandler) DeleteSemanticItem(c *gin.Context, item any, id string) {
	if !h.loadProjectItem(c, item, id) {
		return
	}
	if err := h.semantic.DeleteItem(c.Request.Context(), item); err != nil {
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *SemanticEntityHandler) writeSemanticAppError(c *gin.Context, err error) {
	var invalidInput semanticapp.ErrInvalidInput
	var forbidden semanticapp.ErrForbidden
	switch {
	case errors.As(err, &invalidInput):
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(invalidInput.Error()))
	case errors.As(err, &forbidden):
		c.JSON(http.StatusForbidden, apierr.InvalidInput(forbidden.Error()))
	case errors.Is(err, semanticapp.ErrNotFound):
		c.JSON(http.StatusNotFound, apierr.NotFound("对象不存在"))
	case errors.Is(err, semanticapp.ErrOwnerNotFound), errors.Is(err, semanticapp.ErrTextBlockNotFound):
		c.JSON(http.StatusNotFound, apierr.NotFound("关联对象不存在"))
	case errors.Is(err, semanticapp.ErrOwnerWrongProject):
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("关联对象不属于当前项目"))
	case errors.Is(err, semanticapp.ErrOwnerInvalidType):
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("关联对象类型不支持"))
	case errors.Is(err, semanticapp.ErrSegmentProductionMismatch):
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("片段绑定的制作和文本块所属制作不一致"))
	default:
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
	}
}

func (h *SemanticEntityHandler) loadProjectItem(c *gin.Context, item any, id string) bool {
	projectID := parseID(c.Param("id"))
	if err := h.semantic.LoadProjectItem(c.Request.Context(), projectID, item, id); err != nil {
		if errors.Is(err, semanticapp.ErrNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("对象不存在"))
			return false
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return false
	}
	return true
}

func (h *SemanticEntityHandler) projectRole(c *gin.Context, projectID uint) (string, uint, bool) {
	user := currentUser(c)
	if user == nil {
		c.JSON(http.StatusUnauthorized, apierr.InvalidInput("未登录"))
		return "", 0, false
	}
	role, _, ok := h.resolveProjectRole(c, projectID, user.ID, user.SystemRole)
	if !ok {
		return "", 0, false
	}
	return role, user.ID, true
}

func currentUserID(c *gin.Context) *uint {
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		id := u.(*model.User).ID
		return &id
	}
	return nil
}

func (h *SemanticEntityHandler) resolveProjectRole(c *gin.Context, projectID uint, userID uint, systemRole string) (string, uint, bool) {
	role, err := h.projects.ResolveRole(c.Request.Context(), projectID, userID, systemRole)
	if err != nil {
		switch {
		case errors.Is(err, projectapp.ErrProjectNotFound):
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
		case errors.Is(err, projectapp.ErrProjectMemberNotFound):
			c.JSON(http.StatusForbidden, apierr.InvalidInput("不是项目成员"))
		default:
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		}
		return "", 0, false
	}
	return role.Role, role.UserID, true
}
