package adminoverview

import (
	"context"
	"database/sql"
	"time"

	domainjob "github.com/movscript/movscript/internal/domain/job"
	persistencemodel "github.com/movscript/movscript/internal/infra/persistence/model"
	"gorm.io/gorm"
)

type repository interface {
	Summary(ctx context.Context, now time.Time) (Summary, error)
}

type gormRepository struct {
	db *gorm.DB
}

func (r *gormRepository) Summary(ctx context.Context, now time.Time) (Summary, error) {
	db := r.db.WithContext(ctx)
	var summary Summary
	var err error

	if summary.Users.Total, err = countRows(db, &persistencemodel.User{}, ""); err != nil {
		return Summary{}, err
	}
	if summary.Users.Active, err = countRows(db, &persistencemodel.User{}, "status = ?", "active"); err != nil {
		return Summary{}, err
	}
	if summary.Users.Disabled, err = countRows(db, &persistencemodel.User{}, "status <> ?", "active"); err != nil {
		return Summary{}, err
	}

	if summary.Orgs.Total, err = countRows(db, &persistencemodel.Organization{}, ""); err != nil {
		return Summary{}, err
	}
	if summary.Orgs.Suspended, err = countRows(db, &persistencemodel.Organization{}, "status = ?", "suspended"); err != nil {
		return Summary{}, err
	}

	if summary.Projects.Total, err = countRows(db, &persistencemodel.Project{}, ""); err != nil {
		return Summary{}, err
	}

	if summary.Models.Credentials, err = countRows(db, &persistencemodel.AICredential{}, ""); err != nil {
		return Summary{}, err
	}
	if summary.Models.EnabledCredentials, err = countRows(db, &persistencemodel.AICredential{}, "is_enabled = ?", true); err != nil {
		return Summary{}, err
	}
	if summary.Models.Configs, err = countRows(db, &persistencemodel.AIModelConfig{}, ""); err != nil {
		return Summary{}, err
	}
	if summary.Models.EnabledConfigs, err = countRows(db, &persistencemodel.AIModelConfig{}, "is_enabled = ?", true); err != nil {
		return Summary{}, err
	}

	if summary.Jobs.Total, err = countRows(db, &persistencemodel.Job{}, ""); err != nil {
		return Summary{}, err
	}
	if summary.Jobs.Pending, err = countRows(db, &persistencemodel.Job{}, "status = ?", domainjob.StatusPending); err != nil {
		return Summary{}, err
	}
	if summary.Jobs.Running, err = countRows(db, &persistencemodel.Job{}, "status = ?", domainjob.StatusRunning); err != nil {
		return Summary{}, err
	}
	if summary.Jobs.Succeeded, err = countRows(db, &persistencemodel.Job{}, "status = ?", domainjob.StatusSucceeded); err != nil {
		return Summary{}, err
	}
	if summary.Jobs.Failed, err = countRows(db, &persistencemodel.Job{}, "status = ?", domainjob.StatusFailed); err != nil {
		return Summary{}, err
	}
	if summary.Jobs.Cancelled, err = countRows(db, &persistencemodel.Job{}, "status = ?", domainjob.StatusCancelled); err != nil {
		return Summary{}, err
	}

	if summary.Usage.Records, err = countRows(db, &persistencemodel.UsageLog{}, ""); err != nil {
		return Summary{}, err
	}
	if summary.Usage.Cost7D, err = sumCostSince(db, now.AddDate(0, 0, -7)); err != nil {
		return Summary{}, err
	}
	if summary.Usage.Cost30D, err = sumCostSince(db, now.AddDate(0, 0, -30)); err != nil {
		return Summary{}, err
	}

	if summary.Resources.Total, err = countRows(db, &persistencemodel.RawResource{}, ""); err != nil {
		return Summary{}, err
	}
	if summary.Resources.Bytes, err = sumResourceBytes(db); err != nil {
		return Summary{}, err
	}

	if summary.Audits.Total, err = countRows(db, &persistencemodel.AuditLog{}, ""); err != nil {
		return Summary{}, err
	}

	return summary, nil
}

func countRows(db *gorm.DB, model any, condition string, args ...any) (int64, error) {
	var count int64
	query := db.Model(model)
	if condition != "" {
		query = query.Where(condition, args...)
	}
	return count, query.Count(&count).Error
}

func sumCostSince(db *gorm.DB, since time.Time) (float64, error) {
	var sum sql.NullFloat64
	err := db.Model(&persistencemodel.UsageLog{}).
		Select("COALESCE(SUM(cost), 0)").
		Where("created_at >= ?", since).
		Scan(&sum).Error
	if !sum.Valid {
		return 0, err
	}
	return sum.Float64, err
}

func sumResourceBytes(db *gorm.DB) (int64, error) {
	var sum sql.NullInt64
	err := db.Model(&persistencemodel.RawResource{}).
		Select("COALESCE(SUM(size), 0)").
		Scan(&sum).Error
	if !sum.Valid {
		return 0, err
	}
	return sum.Int64, err
}
