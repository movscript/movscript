//go:build !runtime_overlay

package router

import "github.com/gin-gonic/gin"

func registerRuntimeProtectedRoutes(protected *gin.RouterGroup, h handlers) {}

func registerRuntimeAdminRoutes(admin *gin.RouterGroup, h handlers) {}
