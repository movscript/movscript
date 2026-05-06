package canvasruntime

import (
	"fmt"
	"strings"

	"github.com/movscript/movscript/internal/domain/model"
)

func CanvasRunTaskFailureSummary(tasks []model.CanvasTask) string {
	failures := make([]string, 0)
	for _, task := range tasks {
		if task.Status != "failed" {
			continue
		}
		label := strings.TrimSpace(task.NodeLabel)
		if label == "" {
			label = strings.TrimSpace(task.NodeID)
		}
		if label == "" {
			label = fmt.Sprintf("task #%d", task.ID)
		}
		errMsg := strings.TrimSpace(task.Error)
		if errMsg == "" {
			errMsg = "unknown error"
		}
		if len(errMsg) > 240 {
			errMsg = errMsg[:240] + "..."
		}
		failures = append(failures, fmt.Sprintf("%s: %s", label, errMsg))
	}
	if len(failures) == 0 {
		return "one or more workflow tasks failed"
	}
	if len(failures) == 1 {
		return "workflow task failed: " + failures[0]
	}
	if len(failures) > 3 {
		remaining := len(failures) - 3
		failures = append(failures[:3], fmt.Sprintf("%d more failed", remaining))
	}
	return "workflow tasks failed: " + strings.Join(failures, "; ")
}
