package main

import (
	"github.com/gopherjs/gopherjs/js"
	"github.com/gopherjs/jquery"
	"reflect"
)

var jq = jquery.NewJQuery

func main() {
	print("starting...")
	p := &Person{
		Name: "",
	}
	startListeners(p)
}

type Person struct {
	Name string
	Age  int
}

func startListeners(model interface{}) {
	objVal := reflect.ValueOf(model).Elem()
	jq("[data-bind-value]").On("input", func(e jquery.Event) {
		prop := jq(e.CurrentTarget).Attr("data-bind-value")
		newVal := jq(e.CurrentTarget).Val()
		objVal.FieldByName(prop).Set(reflect.ValueOf(newVal))
	})
	js.Global.Call("watch", js.InternalObject(model), func(prop string, action string, newValue string, oldValue string) {
		jq("[data-bind-html='" + prop + "']").SetHtml(newValue)
	})
}
