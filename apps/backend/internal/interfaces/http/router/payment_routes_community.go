//go:build !enterprise

package router

import "github.com/gin-gonic/gin"

func registerPaymentAdminRoutes(admin *gin.RouterGroup, h handlers) {}
