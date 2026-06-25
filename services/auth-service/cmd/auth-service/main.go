package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	identityapp "github.com/movscript/auth-service/internal/app/identity"
	"github.com/movscript/auth-service/internal/app/introspection"
	"github.com/movscript/auth-service/internal/infra/db"
	"github.com/movscript/auth-service/internal/infra/dbidentity"
	"github.com/movscript/auth-service/internal/infra/staticidentity"
	"github.com/movscript/auth-service/internal/infra/statickeys"
	httpapi "github.com/movscript/auth-service/internal/interfaces/http"
)

const shutdownTimeout = 15 * time.Second

func main() {
	if err := run(context.Background(), os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context, args []string) error {
	command := "serve"
	if len(args) > 0 {
		command = strings.TrimSpace(args[0])
	}
	if command != "" && command != "serve" {
		return fmt.Errorf("unsupported command %q", command)
	}

	keys, err := statickeys.FromJSON(os.Getenv("MOVSCRIPT_AUTH_STATIC_KEYS_JSON"))
	if err != nil {
		return fmt.Errorf("load static auth keys: %w", err)
	}
	identityService, closeIdentity, err := buildIdentityService()
	if err != nil {
		return err
	}
	defer closeIdentity()

	port := strings.TrimSpace(os.Getenv("MOVSCRIPT_AUTH_SERVICE_PORT"))
	if port == "" {
		port = strings.TrimSpace(os.Getenv("PORT"))
	}
	if port == "" {
		port = "8781"
	}

	server := &http.Server{
		Addr: ":" + port,
		Handler: httpapi.NewHandlerWithOptions(introspection.NewService(keys), httpapi.HandlerOptions{
			ManagementToken: os.Getenv("MOVSCRIPT_AUTH_MANAGEMENT_TOKEN"),
			IdentityService: identityService,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}
	serverErr := make(chan error, 1)
	log.Printf("movscript.auth.service listening on :%s", port)
	go func() {
		serverErr <- server.ListenAndServe()
	}()

	shutdownCtx, stopSignals := signal.NotifyContext(ctx, os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	select {
	case err := <-serverErr:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-shutdownCtx.Done():
	}
	stopSignals()

	timeoutCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := server.Shutdown(timeoutCtx); err != nil {
		_ = server.Close()
		return err
	}
	if err := <-serverErr; err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

func buildIdentityService() (*identityapp.Service, func(), error) {
	staticIdentitiesJSON := os.Getenv("MOVSCRIPT_AUTH_STATIC_IDENTITIES_JSON")
	if strings.TrimSpace(staticIdentitiesJSON) != "" {
		identities, err := staticidentity.FromJSON(staticIdentitiesJSON)
		if err != nil {
			return nil, func() {}, fmt.Errorf("load static auth identities: %w", err)
		}
		return identityapp.NewService(identities), func() {}, nil
	}

	database, err := db.Connect(db.LoadConfigFromEnv())
	if err != nil {
		return nil, func() {}, fmt.Errorf("connect auth database: %w", err)
	}
	closeDatabase := func() {
		sqlDB, err := database.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	}
	if err := db.RunMigrations(database); err != nil {
		closeDatabase()
		return nil, func() {}, fmt.Errorf("run auth database migrations: %w", err)
	}
	return identityapp.NewService(dbidentity.New(database)), closeDatabase, nil
}
