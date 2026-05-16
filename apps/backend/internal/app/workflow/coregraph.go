package workflow

import (
	"context"

	"github.com/movscript/movscript/internal/app/coregraph"
)

func (r *gormRepository) writeCoreGraph(ctx context.Context, item any) error {
	return coregraph.NewWriter(r.db.WithContext(ctx)).Write(ctx, item)
}
