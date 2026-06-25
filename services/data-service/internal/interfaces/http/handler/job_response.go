package handler

import (
	"github.com/gin-gonic/gin"
	jobapp "github.com/movscript/movscript/internal/app/job"
	domainjob "github.com/movscript/movscript/internal/domain/job"
)

func (h *JobHandler) buildJobResponses(c *gin.Context, jobs []domainjob.Job) []jobapp.Response {
	return h.service.BuildResponses(c.Request.Context(), jobs, func(id uint) string {
		return resourceURL(c, id)
	})
}
