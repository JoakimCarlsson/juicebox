package messages

type HttpMessageResponse struct {
	ID                   string            `json:"id"`
	Method               string            `json:"method"`
	URL                  string            `json:"url"`
	RequestHeaders       map[string]string `json:"requestHeaders"`
	RequestBody          *string           `json:"requestBody,omitempty"`
	RequestBodyEncoding  string            `json:"requestBodyEncoding,omitempty"`
	RequestBodySize      int               `json:"requestBodySize"`
	StatusCode           int               `json:"statusCode"`
	ResponseHeaders      map[string]string `json:"responseHeaders"`
	ResponseBody         *string           `json:"responseBody,omitempty"`
	ResponseBodyEncoding string            `json:"responseBodyEncoding,omitempty"`
	ResponseBodySize     int               `json:"responseBodySize"`
	Duration             int64             `json:"duration"`
	Timestamp            int64             `json:"timestamp"`
}

type MessagesResponse struct {
	Messages []HttpMessageResponse `json:"messages"`
	Total    int                   `json:"total"`
}
