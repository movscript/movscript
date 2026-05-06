//go:build enterprise

package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	billingapp "github.com/movscript/movscript/internal/app/billing"
	"github.com/movscript/movscript/internal/interfaces/http/apierr"
	"gorm.io/gorm"
)

type orgCommercialDeps struct {
	billing *billingapp.Service
}

func newOrgCommercialDeps(db *gorm.DB) orgCommercialDeps {
	return orgCommercialDeps{billing: billingapp.NewService(db)}
}

func (h *OrgHandler) AdminGetQuota(c *gin.Context) {
	quota, err := h.commercial.billing.GetQuota(c.Request.Context(), parseID(c.Param("id")))
	if err != nil {
		if err == billingapp.ErrNotFound {
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("查询组织额度失败"))
		return
	}
	c.JSON(http.StatusOK, quota)
}

func (h *OrgHandler) AdminSetQuota(c *gin.Context) {
	var req struct {
		MonthlyBudget float64 `json:"monthly_budget"`
		Plan          *string `json:"plan"`
		Status        *string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, apierr.InvalidInput(err.Error()))
		return
	}
	quota, err := h.commercial.billing.SetQuota(c.Request.Context(), parseID(c.Param("id")), billingapp.QuotaInput{MonthlyBudget: req.MonthlyBudget, Plan: req.Plan, Status: req.Status})
	if err != nil {
		if err == billingapp.ErrNotFound {
			c.JSON(http.StatusNotFound, apierr.NotFound("组织不存在"))
			return
		}
		c.JSON(http.StatusInternalServerError, apierr.Internal("设置组织额度失败"))
		return
	}
	c.JSON(http.StatusOK, quota)
}
