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
		electronAdminOrigin,
	}
	if len(allowedOrigins) > 0 {
		origins = allowedOrigins
	}
	origins = appendMissingOrigin(origins, electronAdminOrigin)

	return cors.New(cors.Config{
		AllowOrigins:     origins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Org-ID", "Upgrade", "Connection", "Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Protocol"},
		ExposeHeaders:    []string{"X-Total-Count", "Set-Cookie"},
		AllowCredentials: true,
		CustomSchemas:    []string{"movscript-admin://"},
	})
}

func appendMissingOrigin(origins []string, origin string) []string {
	for _, existing := range origins {
		if existing == origin {
			return origins
		}
	}
	return append(append([]string{}, origins...), origin)
}
