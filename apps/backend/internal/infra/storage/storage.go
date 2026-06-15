package storage

import (
	providercontract "github.com/movscript/movscript/internal/providers/contract"
)

// Storage aliases the provider contract while preserving the existing infra API.
type Storage = providercontract.BlobStorage
