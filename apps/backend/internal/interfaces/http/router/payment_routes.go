//go:build enterprise

package router

import "github.com/gin-gonic/gin"

func registerPaymentAdminRoutes(admin *gin.RouterGroup, h handlers) {
	admin.GET("/payment-configs", h.paymentConfig.List)
	admin.POST("/payment-configs", h.paymentConfig.Create)
	admin.PUT("/payment-configs/:id", h.paymentConfig.Update)
	admin.DELETE("/payment-configs/:id", h.paymentConfig.Delete)
}
