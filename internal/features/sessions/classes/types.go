package classes

type listResponse struct {
	Classes []string `json:"classes"`
	Total   int      `json:"total"`
}

type invokeRequest struct {
	ClassName  string   `json:"className"`
	MethodName string   `json:"methodName"`
	Args       []string `json:"args"`
}

type readFieldRequest struct {
	ClassName string `json:"className"`
	FieldName string `json:"fieldName"`
}
