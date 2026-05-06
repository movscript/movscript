//go:build !enterprise

package handler

import modelgatewayapp "github.com/movscript/movscript/internal/app/modelgateway"

type gatewayAPIKeyCreateCommercialRequest struct{}

type gatewayAPIKeyUpdateCommercialRequest struct{}

func (r gatewayAPIKeyCreateCommercialRequest) toAppInput() modelgatewayapp.CommercialAPIKeyCreateInput {
	return modelgatewayapp.CommercialAPIKeyCreateInput{}
}

func (r gatewayAPIKeyUpdateCommercialRequest) toAppInput() modelgatewayapp.CommercialAPIKeyUpdateInput {
	return modelgatewayapp.CommercialAPIKeyUpdateInput{}
}
