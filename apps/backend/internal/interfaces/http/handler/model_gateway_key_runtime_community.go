//go:build !runtime_overlay

package handler

import modelgatewayapp "github.com/movscript/movscript/internal/app/gateway"

type gatewayAPIKeyCreateRuntimeRequest struct{}

type gatewayAPIKeyUpdateRuntimeRequest struct{}

func (r gatewayAPIKeyCreateRuntimeRequest) toAppInput() modelgatewayapp.APIKeyCreateRuntimeInput {
	return modelgatewayapp.APIKeyCreateRuntimeInput{}
}

func (r gatewayAPIKeyUpdateRuntimeRequest) toAppInput() modelgatewayapp.APIKeyUpdateRuntimeInput {
	return modelgatewayapp.APIKeyUpdateRuntimeInput{}
}
