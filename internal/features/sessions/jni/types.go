package jni

type JNIEventResponse struct {
	ID          string   `json:"id"`
	ClassName   string   `json:"className"`
	MethodName  string   `json:"methodName"`
	Signature   string   `json:"signature"`
	Arguments   []string `json:"arguments"`
	ReturnValue *string  `json:"returnValue"`
	Backtrace   []string `json:"backtrace"`
	Library     *string  `json:"library"`
	Timestamp   int64    `json:"timestamp"`
}

type JNIEventsResponse struct {
	Events []JNIEventResponse `json:"events"`
	Total  int                `json:"total"`
}
