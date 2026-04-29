package main

import (
	"fmt"
	"log"
	"os"

	"github.com/movscript/movscript/internal/config"
	"github.com/movscript/movscript/internal/db"
)

func main() {
	command := "up"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}

	cfg := config.Load()
	database, err := db.Connect(cfg)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}

	switch command {
	case "up":
		if err := db.RunMigrations(database); err != nil {
			log.Fatalf("migration failed: %v", err)
		}
		fmt.Println("database migrations are up to date")
	case "status":
		pending, err := db.PendingMigrations(database)
		if err != nil {
			log.Fatalf("migration status failed: %v", err)
		}
		if len(pending) == 0 {
			fmt.Println("database migrations are up to date")
			return
		}
		fmt.Println("pending migrations:")
		for _, migration := range pending {
			fmt.Printf("- %s_%s\n", migration.Version, migration.Name)
		}
	default:
		log.Fatalf("unknown command %q; expected up or status", command)
	}
}
