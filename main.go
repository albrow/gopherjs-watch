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
	BindField("input#name", &(p.Name))
	OnChange(p, func() {
		if p.Name != "" {
			jq("#greeting").SetHtml("Hello, " + p.Name)
		} else {
			jq("#greeting").SetHtml("")
		}
	})
}

type Person struct {
	Name string
	Age  int
}

func BindField(selector string, val interface{}) {
	jq(selector).On("input", func(e jquery.Event) {
		newVal := jq(selector).Val()
		reflect.ValueOf(val).Elem().Set(reflect.ValueOf(newVal))
	})
}

func OnChange(model interface{}, f func()) {
	js.Global.Call("watch", js.InternalObject(model), func(prop string, action string, newValue string, oldValue string) {
		go f()
	})
}
