package genjob

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestCallProviderWithTimeout(t *testing.T) {
	start := time.Now()
	_, err := callProviderWithTimeout(context.Background(), 20*time.Millisecond, func(ctx context.Context) (string, error) {
		<-ctx.Done()
		return "", ctx.Err()
	})
	if err == nil {
		t.Fatal("expected timeout error")
	}
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected DeadlineExceeded, got %v", err)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("timeout took too long: %s", elapsed)
	}
}

func TestRetryDelayCaps(t *testing.T) {
	if retryDelay(1) != 10*time.Second {
		t.Fatalf("attempt 1 delay = %s", retryDelay(1))
	}
	if retryDelay(99) != 5*time.Minute {
		t.Fatalf("attempt 99 delay = %s", retryDelay(99))
	}
}
