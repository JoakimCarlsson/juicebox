package response

import "github.com/joakimcarlsson/go-router/router/v2"

type errorBody struct {
	Error string `json:"error"`
}

func Error(c *router.Context, status int, msg string) {
	c.JSON(status, errorBody{Error: msg})
}
