package handler

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/apierr"
	semanticapp "github.com/movscript/movscript/internal/app/semantic"
	"github.com/movscript/movscript/internal/middleware"
	"github.com/movscript/movscript/internal/model"
	"gorm.io/gorm"
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
	if projectID == 0 {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput("project id is required"))
		return "", 0, false
	}
	if user.SystemRole == "super_admin" {
		var project model.Project
		if err := h.db.Select("id").First(&project, projectID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
				return "", 0, false
			}
			c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
			return "", 0, false
		}
		return "super_admin", user.ID, true
	}

	var project model.Project
	if err := h.db.Select("id, owner_id").First(&project, projectID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, apierr.NotFound("项目不存在"))
			return "", 0, false
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return "", 0, false
	}
	if project.OwnerID == user.ID {
		return "owner", user.ID, true
	}
	var member model.ProjectMember
	if err := h.db.Where("project_id = ? AND user_id = ?", projectID, user.ID).First(&member).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusForbidden, apierr.InvalidInput("不是项目成员"))
			return "", 0, false
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal(err.Error()))
		return "", 0, false
	}
	return member.Role, user.ID, true
}

func currentUserID(c *gin.Context) *uint {
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		id := u.(*model.User).ID
		return &id
	}
	return nil
}
