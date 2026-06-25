package handler

import (
	"github.com/movscript/auth-service/pkg/authidentity"
	jobapp "github.com/movscript/movscript/internal/app/job"
	"github.com/movscript/movscript/internal/app/systemstream"
	"github.com/movscript/movscript/internal/infra/ai"
	"gorm.io/gorm"
)

type JobHandler struct {
	db             *gorm.DB
	service        *jobapp.Service
	systemMessages *systemstream.Hub
}

func NewJobHandler(db *gorm.DB, aiService *ai.AIService, systemMessages ...*systemstream.Hub) *JobHandler {
	return NewJobHandlerWithIdentity(db, aiService, nil, systemMessages...)
}

func NewJobHandlerWithIdentity(db *gorm.DB, aiService *ai.AIService, identity authidentity.OrgDirectory, systemMessages ...*systemstream.Hub) *JobHandler {
	var hub *systemstream.Hub
	if len(systemMessages) > 0 {
		hub = systemMessages[0]
	}
	return &JobHandler{db: db, service: jobapp.NewServiceWithIdentity(db, identity, aiService), systemMessages: hub}
}
