package observability

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"
	"unicode"

	gormlogger "gorm.io/gorm/logger"
)

type GormLogger struct {
	level         gormlogger.LogLevel
	slowThreshold time.Duration
}

func NewGormLogger(slowThreshold time.Duration) GormLogger {
	if slowThreshold <= 0 {
		slowThreshold = 200 * time.Millisecond
	}
	return GormLogger{
		level:         gormlogger.Warn,
		slowThreshold: slowThreshold,
	}
}

func (l GormLogger) LogMode(level gormlogger.LogLevel) gormlogger.Interface {
	l.level = level
	return l
}

func (l GormLogger) Info(ctx context.Context, msg string, data ...interface{}) {
	if l.level >= gormlogger.Info {
		WithRequest(ctx).Info("gorm_info", slog.String("message", formatGormMessage(msg, data...)))
	}
}

func (l GormLogger) Warn(ctx context.Context, msg string, data ...interface{}) {
	if l.level >= gormlogger.Warn {
		WithRequest(ctx).Warn("gorm_warn", slog.String("message", formatGormMessage(msg, data...)))
	}
}

func (l GormLogger) Error(ctx context.Context, msg string, data ...interface{}) {
	if l.level >= gormlogger.Error {
		WithRequest(ctx).Error("gorm_error", slog.String("message", formatGormMessage(msg, data...)))
	}
}

func (l GormLogger) Trace(ctx context.Context, begin time.Time, fc func() (sql string, rowsAffected int64), err error) {
	if l.level <= gormlogger.Silent {
		return
	}
	elapsed := time.Since(begin)
	switch {
	case err != nil && l.level >= gormlogger.Error && !errors.Is(err, gormlogger.ErrRecordNotFound):
		sql, rows := fc()
		WithRequest(ctx).Error(
			"db_query_error",
			slog.String("error", err.Error()),
			slog.Float64("elapsed_ms", float64(elapsed.Microseconds())/1000.0),
			slog.Int64("rows", rows),
			slog.String("sql", sanitizeSQL(sql)),
		)
	case elapsed >= l.slowThreshold && l.slowThreshold > 0 && l.level >= gormlogger.Warn:
		sql, rows := fc()
		WithRequest(ctx).Warn(
			"db_slow_query",
			slog.Float64("threshold_ms", float64(l.slowThreshold.Microseconds())/1000.0),
			slog.Float64("elapsed_ms", float64(elapsed.Microseconds())/1000.0),
			slog.Int64("rows", rows),
			slog.String("sql", sanitizeSQL(sql)),
		)
	}
}

func formatGormMessage(msg string, data ...interface{}) string {
	if len(data) == 0 {
		return msg
	}
	values := make([]string, 0, len(data))
	for _, item := range data {
		values = append(values, strings.TrimSpace(fmt.Sprintf("%v", item)))
	}
	return msg + " " + strings.Join(values, " ")
}

func sanitizeSQL(sql string) string {
	sql = strings.TrimSpace(sql)
	if sql == "" {
		return ""
	}
	var b strings.Builder
	b.Grow(len(sql))
	inString := false
	wroteSpace := false
	for i := 0; i < len(sql); i++ {
		ch := rune(sql[i])
		if inString {
			if ch == '\'' {
				if i+1 < len(sql) && sql[i+1] == '\'' {
					i++
					continue
				}
				inString = false
			}
			continue
		}
		if ch == '\'' {
			b.WriteByte('?')
			wroteSpace = false
			inString = true
			continue
		}
		if isNumericStart(sql, i) {
			b.WriteByte('?')
			wroteSpace = false
			i = consumeNumber(sql, i) - 1
			continue
		}
		if unicode.IsSpace(ch) {
			if !wroteSpace && b.Len() > 0 {
				b.WriteByte(' ')
				wroteSpace = true
			}
			continue
		}
		b.WriteByte(sql[i])
		wroteSpace = false
	}
	return strings.TrimSpace(b.String())
}

func isNumericStart(sql string, i int) bool {
	ch := sql[i]
	if ch >= '0' && ch <= '9' {
		return true
	}
	if ch != '-' || i+1 >= len(sql) || sql[i+1] < '0' || sql[i+1] > '9' {
		return false
	}
	if i == 0 {
		return true
	}
	prev := rune(sql[i-1])
	return unicode.IsSpace(prev) || strings.ContainsRune("(=,<>,", prev)
}

func consumeNumber(sql string, i int) int {
	if sql[i] == '-' {
		i++
	}
	for i < len(sql) {
		ch := sql[i]
		if (ch >= '0' && ch <= '9') || ch == '.' {
			i++
			continue
		}
		break
	}
	return i
}
