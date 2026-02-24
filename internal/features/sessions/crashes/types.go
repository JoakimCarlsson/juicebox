package crashes

type CrashResponse struct {
	ID               string  `json:"id"`
	CrashType        string  `json:"crashType"`
	Signal           *string `json:"signal"`
	Address          *string `json:"address"`
	Registers        any     `json:"registers"`
	Backtrace        any     `json:"backtrace"`
	JavaStackTrace   *string `json:"javaStackTrace"`
	ExceptionClass   *string `json:"exceptionClass"`
	ExceptionMessage *string `json:"exceptionMessage"`
	Timestamp        int64   `json:"timestamp"`
}

type CrashesResponse struct {
	Crashes []CrashResponse `json:"crashes"`
	Total   int             `json:"total"`
}
