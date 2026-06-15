//go:build !runtime_overlay

package router

import "github.com/gin-gonic/gin"

func registerEditionRootRoutes(_ *gin.Engine, _ handlers) {}

func registerEditionRegistryRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionProtectedRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionRuntimeProtectedRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionRuntimeAdminRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionAdminUserRoutes(_ *gin.RouterGroup, _ handlers) {}

func registerEditionAdminRoutes(_ *gin.RouterGroup, _ handlers) {}

func adminOrgListHandler(h handlers) gin.HandlerFunc {
	return h.orgAdmin.List
}

func adminUsageListHandler(h handlers) gin.HandlerFunc {
	return h.usageAdmin.List
}
