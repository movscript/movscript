package jobrunner

import (
	"context"
	"fmt"
	"time"

	"github.com/movscript/movscript/internal/domain/model"
)

func effectiveMaxAttempts(job *model.Job) int {
	if job.MaxAttempts > 0 {
		return job.MaxAttempts
	}
	return DefaultMaxAttempts
}

func retryDelay(attempt int) time.Duration {
	if attempt <= 1 {
		return 10 * time.Second
	}
	delay := time.Duration(1<<min(attempt-1, 5)) * 10 * time.Second
	if delay > 5*time.Minute {
		return 5 * time.Minute
	}
	return delay
}

func callProviderWithTimeout[T any](ctx context.Context, timeout time.Duration, call func(context.Context) (T, error)) (T, error) {
	callCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	type result struct {
		value T
		err   error
	}
	done := make(chan result, 1)
	go func() {
		value, err := call(callCtx)
		done <- result{value: value, err: err}
	}()

	select {
	case res := <-done:
		return res.value, res.err
	case <-callCtx.Done():
		var zero T
		if callCtx.Err() == context.DeadlineExceeded {
			return zero, fmt.Errorf("provider call timed out after %s: %w", timeout, callCtx.Err())
		}
		return zero, callCtx.Err()
	}
}
