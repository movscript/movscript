package auditlog

import (
	"encoding/json"
	"log/slog"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/movscript/movscript/internal/domain/model"
	"github.com/movscript/movscript/internal/infra/observability"
	"github.com/movscript/movscript/internal/interfaces/http/middleware"
	"gorm.io/gorm"
)

type Event struct {
	Action     string
	TargetType string
	TargetID   string
	ProjectID  *uint
	ActorID    *uint
	Metadata   map[string]any
}

func Record(c *gin.Context, db *gorm.DB, event Event) {
	if db == nil || event.Action == "" {
		return
	}
	if event.ActorID == nil {
		event.ActorID = actorID(c)
	}
	var metadata string
	if len(event.Metadata) > 0 {
		if b, err := json.Marshal(redactMetadata(event.Metadata)); err == nil {
			metadata = string(b)
		}
	}
	log := model.AuditLog{
		RequestID:  requestID(c),
		ActorID:    event.ActorID,
		Action:     event.Action,
		TargetType: event.TargetType,
		TargetID:   event.TargetID,
		ProjectID:  event.ProjectID,
		IPAddress:  c.ClientIP(),
		UserAgent:  c.Request.UserAgent(),
		Metadata:   metadata,
	}
	if err := db.Create(&log).Error; err != nil {
		observability.WithRequest(c.Request.Context()).Warn("audit_log_write_failed", slog.String("action", event.Action), slog.String("error", err.Error()))
	}
}

func TargetID(id uint) string {
	if id == 0 {
		return ""
	}
	return strconv.FormatUint(uint64(id), 10)
}

func actorID(c *gin.Context) *uint {
	if c == nil {
		return nil
	}
	if u, ok := c.Get(middleware.ContextUserKey); ok {
		if user, ok := u.(*model.User); ok {
			id := user.ID
			return &id
		}
	}
	return nil
}

func requestID(c *gin.Context) string {
	if c == nil {
		return ""
	}
	if v, ok := c.Get(observability.ContextKey); ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return ""
}

func redactMetadata(input map[string]any) map[string]any {
	out := make(map[string]any, len(input))
	for key, value := range input {
		if observability.IsSensitiveName(key) {
			out[key] = "[redacted]"
			continue
		}
		out[key] = value
	}
	return out
}
