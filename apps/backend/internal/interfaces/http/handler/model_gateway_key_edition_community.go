//go:build !enterprise

package handler

import modelgatewayapp "github.com/movscript/movscript/internal/app/modelgateway"

type gatewayAPIKeyCreateEditionRequest struct{}

type gatewayAPIKeyUpdateEditionRequest struct{}

func (r gatewayAPIKeyCreateEditionRequest) toAppInput() modelgatewayapp.APIKeyCreateEditionInput {
	return modelgatewayapp.APIKeyCreateEditionInput{}
}

func (r gatewayAPIKeyUpdateEditionRequest) toAppInput() modelgatewayapp.APIKeyUpdateEditionInput {
	return modelgatewayapp.APIKeyUpdateEditionInput{}
}
