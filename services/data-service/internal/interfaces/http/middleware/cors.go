package middleware

import (
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

const electronAdminOrigin = "movscript-admin://app"

func CORS(allowedOrigins []string) gin.HandlerFunc {
	origins := []string{
		"http://localhost:3001",
		"http://127.0.0.1:3001",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"http://localhost:5174",
		"http://127.0.0.1:5174",
		"http://localhost:8765",
		"http://127.0.0.1:8765",
		"http://localhost:8766",
		"http://127.0.0.1:8766",
		"file://",
		electronAdminOrigin,
	}
	if len(allowedOrigins) > 0 {
		origins = allowedOrigins
	}
	origins = appendMissingOrigin(origins, electronAdminOrigin)
	allowAnyOrigin := containsOriginWildcard(origins)
	if allowAnyOrigin {
		origins = removeOriginWildcard(origins)
	}

	config := cors.Config{
		AllowOrigins:        origins,
		AllowMethods:        []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:        []string{"Origin", "Content-Type", "Authorization", "X-Org-ID", "X-MovScript-Route-Tier", "Upgrade", "Connection", "Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Protocol"},
		ExposeHeaders:       []string{"X-Total-Count", "Set-Cookie"},
		AllowCredentials:    true,
		AllowPrivateNetwork: true,
		CustomSchemas:       []string{"movscript-admin://", "file://"},
	}
	if allowAnyOrigin {
		config.AllowOriginFunc = func(origin string) bool {
			return origin != ""
		}
	}
	return cors.New(config)
}

func appendMissingOrigin(origins []string, origin string) []string {
	for _, existing := range origins {
		if existing == origin {
			return origins
		}
	}
	return append(append([]string{}, origins...), origin)
}

func containsOriginWildcard(origins []string) bool {
	for _, origin := range origins {
		if origin == "*" {
			return true
		}
	}
	return false
}

func removeOriginWildcard(origins []string) []string {
	filtered := make([]string, 0, len(origins))
	for _, origin := range origins {
		if origin != "*" {
			filtered = append(filtered, origin)
		}
	}
	return filtered
}
