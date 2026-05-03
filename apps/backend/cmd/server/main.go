package main

import (
	"context"
	"log"
	"log/slog"

	"github.com/movscript/movscript/internal/bootstrap"
	"github.com/movscript/movscript/internal/observability"
)

func main() {
	app, err := bootstrap.New()
	if err != nil {
		log.Fatal(err)
	}

	// Start Job worker pool (4 concurrent workers).
	workerCtx, workerCancel := context.WithCancel(context.Background())
	defer workerCancel()
	app.StartWorkers(workerCtx, 4)

	observability.Logger().Info("server_listening", slog.String("port", app.Config.ServerPort))
	if err := app.Router.Run(":" + app.Config.ServerPort); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
