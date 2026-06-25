package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/movscript/movscript/internal/bootstrap"
	"github.com/movscript/movscript/internal/infra/observability"
)

const serverShutdownTimeout = 15 * time.Second

func main() {
	if err := run(context.Background()); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context) error {
	if editionHandleCommand(os.Args) {
		return nil
	}

	app, err := bootstrap.New()
	if err != nil {
		return err
	}
	defer func() {
		if err := app.Close(); err != nil {
			observability.Logger().Warn("server_close_failed", slog.String("error", err.Error()))
		}
	}()

	// Start Job worker pool (4 concurrent workers).
	workerCtx, workerCancel := context.WithCancel(ctx)
	defer workerCancel()
	app.StartWorkers(workerCtx, 4)
	app.StartMediaStreamCleanup(workerCtx)

	server := &http.Server{
		Addr:    ":" + app.Config.ServerPort,
		Handler: app.Router,
	}
	serverErr := make(chan error, 1)
	observability.Logger().Info("server_listening", slog.String("port", app.Config.ServerPort))
	go func() {
		serverErr <- server.ListenAndServe()
	}()

	shutdownCtx, stopSignals := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	select {
	case err := <-serverErr:
		workerCancel()
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return fmt.Errorf("server error: %w", err)
	case <-shutdownCtx.Done():
	}
	stopSignals()

	observability.Logger().Info("server_shutdown_started", slog.Duration("timeout", serverShutdownTimeout))
	workerCancel()
	timeoutCtx, cancel := context.WithTimeout(context.Background(), serverShutdownTimeout)
	defer cancel()

	httpShutdownErr := make(chan error, 1)
	go func() {
		httpShutdownErr <- server.Shutdown(timeoutCtx)
	}()

	if err := app.WaitForBackground(timeoutCtx); err != nil {
		observability.Logger().Warn("server_background_shutdown_incomplete", slog.String("error", err.Error()))
	}

	if err := <-httpShutdownErr; err != nil {
		observability.Logger().Warn("server_http_shutdown_failed", slog.String("error", err.Error()))
		_ = server.Close()
	}

	if err := <-serverErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return fmt.Errorf("server error during shutdown: %w", err)
	}
	observability.Logger().Info("server_shutdown_completed")
	return nil
}
