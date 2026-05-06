package handler

import (
	"github.com/gin-gonic/gin"
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/domain/model"
)

func (h *JobHandler) buildJobResponses(c *gin.Context, jobs []model.Job) []jobapp.Response {
	return h.service.BuildResponses(c.Request.Context(), jobs, func(id uint) string {
		return resourceURL(c, id)
	})
}
