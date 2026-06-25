package introspection

import "errors"

var ErrKeyManagementUnavailable = errors.New("auth key management is unavailable")
var ErrInvalidKeyRequest = errors.New("invalid auth key request")
