//go:build !enterprise

package router

import "github.com/gin-gonic/gin"

func registerEditionProtectedRoutes(protected *gin.RouterGroup, h handlers) {}

func registerEditionAdminRoutes(admin *gin.RouterGroup, h handlers) {}
