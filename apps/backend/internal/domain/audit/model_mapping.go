package audit

import "github.com/movscript/movscript/internal/domain/model"

func LogFromModel(log model.AuditLog) Log {
	domainLog := Log{
		ID:         log.ID,
		RequestID:  log.RequestID,
		ActorID:    log.ActorID,
		Action:     log.Action,
		TargetType: log.TargetType,
		TargetID:   log.TargetID,
		OrgID:      log.OrgID,
		ProjectID:  log.ProjectID,
		IPAddress:  log.IPAddress,
		UserAgent:  log.UserAgent,
		Metadata:   log.Metadata,
		CreatedAt:  log.CreatedAt,
		UpdatedAt:  log.UpdatedAt,
	}
	if log.DeletedAt.Valid {
		deletedAt := log.DeletedAt.Time
		domainLog.DeletedAt = &deletedAt
	}
	return domainLog
}

func LogsFromModels(logs []model.AuditLog) []Log {
	out := make([]Log, 0, len(logs))
	for _, log := range logs {
		out = append(out, LogFromModel(log))
	}
	return out
}
