package job

import (
	"fmt"
	"strings"
)

func testOperationSupportedParamsProfile(operations ...string) string {
	var b strings.Builder
	b.WriteString(`{"version":2,"by_operation":{`)
	wrote := 0
	for _, operation := range operations {
		operation = strings.TrimSpace(operation)
		if operation == "" {
			continue
		}
		if wrote > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, `%q:{"add":[{"key":"test_param","label":"Test Param","type":"string"}]}`, operation)
		wrote++
	}
	b.WriteString(`}}`)
	if wrote == 0 {
		return ""
	}
	return b.String()
}
