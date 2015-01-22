"use strict";
(function() {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else {
  console.log("warning: no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $reflect, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length), i;
  for (i = 0; i < array.length; i++) {
    newArray[i] = f(array[i]);
  }
  return newArray;
};

var $methodVal = function(recv, name) {
  var vals = recv.$methodVals || {};
  recv.$methodVals = vals; /* noop for primitives */
  var f = vals[name];
  if (f !== undefined) {
    return f;
  }
  var method = recv[name];
  f = function() {
    $stackDepthOffset--;
    try {
      return method.apply(recv, arguments);
    } finally {
      $stackDepthOffset++;
    }
  };
  vals[name] = f;
  return f;
};

var $methodExpr = function(method) {
  if (method.$expr === undefined) {
    method.$expr = function() {
      $stackDepthOffset--;
      try {
        return Function.call.apply(method, arguments);
      } finally {
        $stackDepthOffset++;
      }
    };
  }
  return method.$expr;
};

var $subslice = function(slice, low, high, max) {
  if (low < 0 || high < low || max < high || high > slice.$capacity || max > slice.$capacity) {
    $throwRuntimeError("slice bounds out of range");
  }
  var s = new slice.constructor(slice.$array);
  s.$offset = slice.$offset + low;
  s.$length = slice.$length - low;
  s.$capacity = slice.$capacity - low;
  if (high !== undefined) {
    s.$length = high - low;
  }
  if (max !== undefined) {
    s.$capacity = max - low;
  }
  return s;
};

var $sliceToArray = function(slice) {
  if (slice.$length === 0) {
    return [];
  }
  if (slice.$array.constructor !== Array) {
    return slice.$array.subarray(slice.$offset, slice.$offset + slice.$length);
  }
  return slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
};

var $decodeRune = function(str, pos) {
  var c0 = str.charCodeAt(pos);

  if (c0 < 0x80) {
    return [c0, 1];
  }

  if (c0 !== c0 || c0 < 0xC0) {
    return [0xFFFD, 1];
  }

  var c1 = str.charCodeAt(pos + 1);
  if (c1 !== c1 || c1 < 0x80 || 0xC0 <= c1) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xE0) {
    var r = (c0 & 0x1F) << 6 | (c1 & 0x3F);
    if (r <= 0x7F) {
      return [0xFFFD, 1];
    }
    return [r, 2];
  }

  var c2 = str.charCodeAt(pos + 2);
  if (c2 !== c2 || c2 < 0x80 || 0xC0 <= c2) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF0) {
    var r = (c0 & 0x0F) << 12 | (c1 & 0x3F) << 6 | (c2 & 0x3F);
    if (r <= 0x7FF) {
      return [0xFFFD, 1];
    }
    if (0xD800 <= r && r <= 0xDFFF) {
      return [0xFFFD, 1];
    }
    return [r, 3];
  }

  var c3 = str.charCodeAt(pos + 3);
  if (c3 !== c3 || c3 < 0x80 || 0xC0 <= c3) {
    return [0xFFFD, 1];
  }

  if (c0 < 0xF8) {
    var r = (c0 & 0x07) << 18 | (c1 & 0x3F) << 12 | (c2 & 0x3F) << 6 | (c3 & 0x3F);
    if (r <= 0xFFFF || 0x10FFFF < r) {
      return [0xFFFD, 1];
    }
    return [r, 4];
  }

  return [0xFFFD, 1];
};

var $encodeRune = function(r) {
  if (r < 0 || r > 0x10FFFF || (0xD800 <= r && r <= 0xDFFF)) {
    r = 0xFFFD;
  }
  if (r <= 0x7F) {
    return String.fromCharCode(r);
  }
  if (r <= 0x7FF) {
    return String.fromCharCode(0xC0 | r >> 6, 0x80 | (r & 0x3F));
  }
  if (r <= 0xFFFF) {
    return String.fromCharCode(0xE0 | r >> 12, 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
  }
  return String.fromCharCode(0xF0 | r >> 18, 0x80 | (r >> 12 & 0x3F), 0x80 | (r >> 6 & 0x3F), 0x80 | (r & 0x3F));
};

var $stringToBytes = function(str) {
  var array = new Uint8Array(str.length), i;
  for (i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "", i;
  for (i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(null, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, i, j = 0;
  for (i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "", i;
  for (i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length), i;
  for (i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length), i;
  $internalCopy(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copy = function(dst, src, type) {
  var i;
  switch (type.kind) {
  case "Array":
    $internalCopy(dst, src, 0, 0, src.length, type.elem);
    return true;
  case "Struct":
    for (i = 0; i < type.fields.length; i++) {
      var field = type.fields[i];
      var name = field[0];
      if (!$copy(dst[name], src[name], field[3])) {
        dst[name] = src[name];
      }
    }
    return true;
  default:
    return false;
  }
};

var $internalCopy = function(dst, src, dstOffset, srcOffset, n, elem) {
  var i;
  if (n === 0) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case "Array":
  case "Struct":
    for (i = 0; i < n; i++) {
      $copy(dst[dstOffset + i], src[srcOffset + i], elem);
    }
    return;
  }

  for (i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  $copy(clone, src, type);
  return clone;
};

var $append = function(slice) {
  return $internalAppend(slice, arguments, 1, arguments.length - 1);
};

var $appendSlice = function(slice, toAppend) {
  return $internalAppend(slice, toAppend.$array, toAppend.$offset, toAppend.$length);
};

var $internalAppend = function(slice, array, offset, length) {
  if (length === 0) {
    return slice;
  }

  var newArray = slice.$array;
  var newOffset = slice.$offset;
  var newLength = slice.$length + length;
  var newCapacity = slice.$capacity;

  if (newLength > newCapacity) {
    newOffset = 0;
    newCapacity = Math.max(newLength, slice.$capacity < 1024 ? slice.$capacity * 2 : Math.floor(slice.$capacity * 5 / 4));

    if (slice.$array.constructor === Array) {
      newArray = slice.$array.slice(slice.$offset, slice.$offset + slice.$length);
      newArray.length = newCapacity;
      var zero = slice.constructor.elem.zero, i;
      for (i = slice.$length; i < newCapacity; i++) {
        newArray[i] = zero();
      }
    } else {
      newArray = new slice.$array.constructor(newCapacity);
      newArray.set(slice.$array.subarray(slice.$offset, slice.$offset + slice.$length));
    }
  }

  $internalCopy(newArray, array, newOffset + slice.$length, offset, length, slice.constructor.elem);

  var newSlice = new slice.constructor(newArray);
  newSlice.$offset = newOffset;
  newSlice.$length = newLength;
  newSlice.$capacity = newCapacity;
  return newSlice;
};

var $equal = function(a, b, type) {
  if (a === b) {
    return true;
  }
  var i;
  switch (type.kind) {
  case "Float32":
    return $float32IsEqual(a, b);
  case "Complex64":
    return $float32IsEqual(a.$real, b.$real) && $float32IsEqual(a.$imag, b.$imag);
  case "Complex128":
    return a.$real === b.$real && a.$imag === b.$imag;
  case "Int64":
  case "Uint64":
    return a.$high === b.$high && a.$low === b.$low;
  case "Ptr":
    if (a.constructor.Struct) {
      return false;
    }
    return $pointerIsEqual(a, b);
  case "Array":
    if (a.length != b.length) {
      return false;
    }
    var i;
    for (i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case "Struct":
    for (i = 0; i < type.fields.length; i++) {
      var field = type.fields[i];
      var name = field[0];
      if (!$equal(a[name], b[name], field[3])) {
        return false;
      }
    }
    return true;
  default:
    return false;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === null || b === null || a === undefined || b === undefined || a.constructor !== b.constructor) {
    return a === b;
  }
  switch (a.constructor.kind) {
  case "Func":
  case "Map":
  case "Slice":
  case "Struct":
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  case undefined: /* js.Object */
    return a === b;
  default:
    return $equal(a.$val, b.$val, a.constructor);
  }
};

var $float32IsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a === 0 || b === 0 || a === 1/0 || b === 1/0 || a === -1/0 || b === -1/0 || a !== a || b !== b) {
    return false;
  }
  var math = $packages["math"];
  return math !== undefined && math.Float32bits(a) === math.Float32bits(b);
};

var $sliceIsEqual = function(a, ai, b, bi) {
  return a.$array === b.$array && a.$offset + ai === b.$offset + bi;
};

var $pointerIsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a.$get === $throwNilPointerError || b.$get === $throwNilPointerError) {
    return a.$get === $throwNilPointerError && b.$get === $throwNilPointerError;
  }
  var old = a.$get();
  var dummy = new Object();
  a.$set(dummy);
  var equal = b.$get() === dummy;
  a.$set(old);
  return equal;
};

var $newType = function(size, kind, string, name, pkgPath, constructor) {
  var typ;
  switch(kind) {
  case "Bool":
  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8" :
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "String":
  case "UnsafePointer":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + this.$val; };
    break;

  case "Float32":
  case "Float64":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + $floatKey(this.$val); };
    break;

  case "Int64":
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case "Uint64":
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case "Complex64":
  case "Complex128":
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$real + "$" + this.$imag; };
    break;

  case "Array":
    typ = function(v) { this.$val = v; };
    typ.Ptr = $newType(4, "Ptr", "*" + string, "", "", function(array) {
      this.$get = function() { return array; };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.prototype.$key = function() {
        return string + "$" + Array.prototype.join.call($mapArray(this.$val, function(e) {
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.extendReflectType = function(rt) {
        rt.arrayType = new $reflect.arrayType.Ptr(rt, elem.reflectType(), undefined, len);
      };
      typ.Ptr.init(typ);
      Object.defineProperty(typ.Ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case "Chan":
    typ = function(capacity) {
      this.$val = this;
      this.$capacity = capacity;
      this.$buffer = [];
      this.$sendQueue = [];
      this.$recvQueue = [];
      this.$closed = false;
    };
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem, sendOnly, recvOnly) {
      typ.elem = elem;
      typ.sendOnly = sendOnly;
      typ.recvOnly = recvOnly;
      typ.nil = new typ(0);
      typ.nil.$sendQueue = typ.nil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; } };
      typ.extendReflectType = function(rt) {
        rt.chanType = new $reflect.chanType.Ptr(rt, elem.reflectType(), sendOnly ? $reflect.SendDir : (recvOnly ? $reflect.RecvDir : $reflect.BothDir));
      };
    };
    break;

  case "Func":
    typ = function(v) { this.$val = v; };
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.extendReflectType = function(rt) {
        var typeSlice = ($sliceType($ptrType($reflect.rtype.Ptr)));
        rt.funcType = new $reflect.funcType.Ptr(rt, variadic, new typeSlice($mapArray(params, function(p) { return p.reflectType(); })), new typeSlice($mapArray(results, function(p) { return p.reflectType(); })));
      };
    };
    break;

  case "Interface":
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.init = function(methods) {
      typ.methods = methods;
      typ.extendReflectType = function(rt) {
        var imethods = $mapArray(methods, function(m) {
          return new $reflect.imethod.Ptr($newStringPtr(m[1]), $newStringPtr(m[2]), m[3].reflectType());
        });
        var methodSlice = ($sliceType($ptrType($reflect.imethod.Ptr)));
        rt.interfaceType = new $reflect.interfaceType.Ptr(rt, new methodSlice(imethods));
      };
    };
    break;

  case "Map":
    typ = function(v) { this.$val = v; };
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.extendReflectType = function(rt) {
        rt.mapType = new $reflect.mapType.Ptr(rt, key.reflectType(), elem.reflectType(), undefined, undefined);
      };
    };
    break;

  case "Ptr":
    typ = constructor || function(getter, setter, target) {
      this.$get = getter;
      this.$set = setter;
      this.$target = target;
      this.$val = this;
    };
    typ.prototype.$key = function() {
      if (this.$id === undefined) {
        $idCounter++;
        this.$id = $idCounter;
      }
      return String(this.$id);
    };
    typ.init = function(elem) {
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
      typ.extendReflectType = function(rt) {
        rt.ptrType = new $reflect.ptrType.Ptr(rt, elem.reflectType());
      };
    };
    break;

  case "Slice":
    var nativeArray;
    typ = function(array) {
      if (array.constructor !== nativeArray) {
        array = new nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.make = function(length, capacity) {
      capacity = capacity || length;
      var array = new nativeArray(capacity), i;
      if (nativeArray === Array) {
        for (i = 0; i < capacity; i++) {
          array[i] = typ.elem.zero();
        }
      }
      var slice = new typ(array);
      slice.$length = length;
      return slice;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
      typ.extendReflectType = function(rt) {
        rt.sliceType = new $reflect.sliceType.Ptr(rt, elem.reflectType());
      };
    };
    break;

  case "Struct":
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { $throwRuntimeError("hash of unhashable type " + string); };
    typ.Ptr = $newType(4, "Ptr", "*" + string, "", "", constructor);
    typ.Ptr.Struct = typ;
    typ.Ptr.prototype.$get = function() { return this; };
    typ.init = function(fields) {
      var i;
      typ.fields = fields;
      typ.Ptr.extendReflectType = function(rt) {
        rt.ptrType = new $reflect.ptrType.Ptr(rt, typ.reflectType());
      };
      /* nil value */
      typ.Ptr.nil = Object.create(constructor.prototype);
      typ.Ptr.nil.$val = typ.Ptr.nil;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        Object.defineProperty(typ.Ptr.nil, field[0], { get: $throwNilPointerError, set: $throwNilPointerError });
      }
      /* methods for embedded fields */
      for (i = 0; i < typ.methods.length; i++) {
        var m = typ.methods[i];
        if (m[4] != -1) {
          (function(field, methodName) {
            typ.prototype[methodName] = function() {
              var v = this.$val[field[0]];
              return v[methodName].apply(v, arguments);
            };
          })(fields[m[4]], m[0]);
        }
      }
      for (i = 0; i < typ.Ptr.methods.length; i++) {
        var m = typ.Ptr.methods[i];
        if (m[4] != -1) {
          (function(field, methodName) {
            typ.Ptr.prototype[methodName] = function() {
              var v = this[field[0]];
              if (v.$val === undefined) {
                v = new field[3](v);
              }
              return v[methodName].apply(v, arguments);
            };
          })(fields[m[4]], m[0]);
        }
      }
      /* reflect type */
      typ.extendReflectType = function(rt) {
        var reflectFields = new Array(fields.length), i;
        for (i = 0; i < fields.length; i++) {
          var field = fields[i];
          reflectFields[i] = new $reflect.structField.Ptr($newStringPtr(field[1]), $newStringPtr(field[2]), field[3].reflectType(), $newStringPtr(field[4]), i);
        }
        rt.structType = new $reflect.structType.Ptr(rt, new ($sliceType($reflect.structField.Ptr))(reflectFields));
      };
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch(kind) {
  case "Bool":
  case "Map":
    typ.zero = function() { return false; };
    break;

  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8" :
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "UnsafePointer":
  case "Float32":
  case "Float64":
    typ.zero = function() { return 0; };
    break;

  case "String":
    typ.zero = function() { return ""; };
    break;

  case "Int64":
  case "Uint64":
  case "Complex64":
  case "Complex128":
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case "Chan":
  case "Ptr":
  case "Slice":
    typ.zero = function() { return typ.nil; };
    break;

  case "Func":
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case "Interface":
    typ.zero = function() { return $ifaceNil; };
    break;

  case "Array":
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len), i;
      for (i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case "Struct":
    typ.zero = function() { return new typ.Ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.kind = kind;
  typ.string = string;
  typ.typeName = name;
  typ.pkgPath = pkgPath;
  typ.methods = [];
  var rt = null;
  typ.reflectType = function() {
    if (rt === null) {
      rt = new $reflect.rtype.Ptr(size, 0, 0, 0, 0, $reflect.kinds[kind], undefined, undefined, $newStringPtr(string), undefined, undefined);
      rt.jsType = typ;

      var methods = [];
      if (typ.methods !== undefined) {
        var i;
        for (i = 0; i < typ.methods.length; i++) {
          var m = typ.methods[i];
          var t = m[3];
          methods.push(new $reflect.method.Ptr($newStringPtr(m[1]), $newStringPtr(m[2]), t.reflectType(), $funcType([typ].concat(t.params), t.results, t.variadic).reflectType(), undefined, undefined));
        }
      }
      if (name !== "" || methods.length !== 0) {
        var methodSlice = ($sliceType($ptrType($reflect.method.Ptr)));
        rt.uncommonType = new $reflect.uncommonType.Ptr($newStringPtr(name), $newStringPtr(pkgPath), new methodSlice(methods));
        rt.uncommonType.jsType = typ;
      }

      if (typ.extendReflectType !== undefined) {
        typ.extendReflectType(rt);
      }
    }
    return rt;
  };
  return typ;
};

var $Bool          = $newType( 1, "Bool",          "bool",           "bool",       "", null);
var $Int           = $newType( 4, "Int",           "int",            "int",        "", null);
var $Int8          = $newType( 1, "Int8",          "int8",           "int8",       "", null);
var $Int16         = $newType( 2, "Int16",         "int16",          "int16",      "", null);
var $Int32         = $newType( 4, "Int32",         "int32",          "int32",      "", null);
var $Int64         = $newType( 8, "Int64",         "int64",          "int64",      "", null);
var $Uint          = $newType( 4, "Uint",          "uint",           "uint",       "", null);
var $Uint8         = $newType( 1, "Uint8",         "uint8",          "uint8",      "", null);
var $Uint16        = $newType( 2, "Uint16",        "uint16",         "uint16",     "", null);
var $Uint32        = $newType( 4, "Uint32",        "uint32",         "uint32",     "", null);
var $Uint64        = $newType( 8, "Uint64",        "uint64",         "uint64",     "", null);
var $Uintptr       = $newType( 4, "Uintptr",       "uintptr",        "uintptr",    "", null);
var $Float32       = $newType( 4, "Float32",       "float32",        "float32",    "", null);
var $Float64       = $newType( 8, "Float64",       "float64",        "float64",    "", null);
var $Complex64     = $newType( 8, "Complex64",     "complex64",      "complex64",  "", null);
var $Complex128    = $newType(16, "Complex128",    "complex128",     "complex128", "", null);
var $String        = $newType( 8, "String",        "string",         "string",     "", null);
var $UnsafePointer = $newType( 4, "UnsafePointer", "unsafe.Pointer", "Pointer",    "", null);

var $nativeArray = function(elemKind) {
  return ({ Int: Int32Array, Int8: Int8Array, Int16: Int16Array, Int32: Int32Array, Uint: Uint32Array, Uint8: Uint8Array, Uint16: Uint16Array, Uint32: Uint32Array, Uintptr: Uint32Array, Float32: Float32Array, Float64: Float64Array })[elemKind] || Array;
};
var $toNativeArray = function(elemKind, array) {
  var nativeArray = $nativeArray(elemKind);
  if (nativeArray === Array) {
    return array;
  }
  return new nativeArray(array);
};
var $arrayTypes = {};
var $arrayType = function(elem, len) {
  var string = "[" + len + "]" + elem.string;
  var typ = $arrayTypes[string];
  if (typ === undefined) {
    typ = $newType(12, "Array", string, "", "", null);
    typ.init(elem, len);
    $arrayTypes[string] = typ;
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, "Chan", string, "", "", null);
    typ.init(elem, sendOnly, recvOnly);
    elem[field] = typ;
  }
  return typ;
};

var $funcTypes = {};
var $funcType = function(params, results, variadic) {
  var paramTypes = $mapArray(params, function(p) { return p.string; });
  if (variadic) {
    paramTypes[paramTypes.length - 1] = "..." + paramTypes[paramTypes.length - 1].substr(2);
  }
  var string = "func(" + paramTypes.join(", ") + ")";
  if (results.length === 1) {
    string += " " + results[0].string;
  } else if (results.length > 1) {
    string += " (" + $mapArray(results, function(r) { return r.string; }).join(", ") + ")";
  }
  var typ = $funcTypes[string];
  if (typ === undefined) {
    typ = $newType(4, "Func", string, "", "", null);
    typ.init(params, results, variadic);
    $funcTypes[string] = typ;
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var string = "interface {}";
  if (methods.length !== 0) {
    string = "interface { " + $mapArray(methods, function(m) {
      return (m[2] !== "" ? m[2] + "." : "") + m[1] + m[3].string.substr(4);
    }).join("; ") + " }";
  }
  var typ = $interfaceTypes[string];
  if (typ === undefined) {
    typ = $newType(8, "Interface", string, "", "", null);
    typ.init(methods);
    $interfaceTypes[string] = typ;
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = { $key: function() { return "nil"; } };
var $error = $newType(8, "Interface", "error", "error", "", null);
$error.init([["Error", "Error", "", $funcType([], [$String], false)]]);

var $Map = function() {};
(function() {
  var names = Object.getOwnPropertyNames(Object.prototype), i;
  for (i = 0; i < names.length; i++) {
    $Map.prototype[names[i]] = undefined;
  }
})();
var $mapTypes = {};
var $mapType = function(key, elem) {
  var string = "map[" + key.string + "]" + elem.string;
  var typ = $mapTypes[string];
  if (typ === undefined) {
    typ = $newType(4, "Map", string, "", "", null);
    typ.init(key, elem);
    $mapTypes[string] = typ;
  }
  return typ;
};


var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $ptrType = function(elem) {
  var typ = elem.Ptr;
  if (typ === undefined) {
    typ = $newType(4, "Ptr", "*" + elem.string, "", "", null);
    typ.init(elem);
    elem.Ptr = typ;
  }
  return typ;
};

var $stringPtrMap = new $Map();
var $newStringPtr = function(str) {
  if (str === undefined || str === "") {
    return $ptrType($String).nil;
  }
  var ptr = $stringPtrMap[str];
  if (ptr === undefined) {
    ptr = new ($ptrType($String))(function() { return str; }, function(v) { str = v; });
    $stringPtrMap[str] = ptr;
  }
  return ptr;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.Struct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $sliceType = function(elem) {
  var typ = elem.Slice;
  if (typ === undefined) {
    typ = $newType(12, "Slice", "[]" + elem.string, "", "", null);
    typ.init(elem);
    elem.Slice = typ;
  }
  return typ;
};

var $structTypes = {};
var $structType = function(fields) {
  var string = "struct { " + $mapArray(fields, function(f) {
    return f[1] + " " + f[3].string + (f[4] !== "" ? (" \"" + f[4].replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
  }).join("; ") + " }";
  if (fields.length === 0) {
    string = "struct {}";
  }
  var typ = $structTypes[string];
  if (typ === undefined) {
    typ = $newType(0, "Struct", string, "", "", function() {
      this.$val = this;
      var i;
      for (i = 0; i < fields.length; i++) {
        var field = fields[i];
        var arg = arguments[i];
        this[field[0]] = arg !== undefined ? arg : field[3].zero();
      }
    });
    /* collect methods for anonymous fields */
    var i, j;
    for (i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field[1] === "") {
        var methods = field[3].methods;
        for (j = 0; j < methods.length; j++) {
          var m = methods[j].slice(0, 6).concat([i]);
          typ.methods.push(m);
          typ.Ptr.methods.push(m);
        }
        if (field[3].kind === "Struct") {
          var methods = field[3].Ptr.methods;
          for (j = 0; j < methods.length; j++) {
            typ.Ptr.methods.push(methods[j].slice(0, 6).concat([i]));
          }
        }
      }
    }
    typ.init(fields);
    $structTypes[string] = typ;
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === "Interface"), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
  } else if (type.string === "js.Object") {
    ok = true;
  } else {
    var valueTypeString = value.constructor.string;
    ok = type.implementedBy[valueTypeString];
    if (ok === undefined) {
      ok = true;
      var valueMethods = value.constructor.methods;
      var typeMethods = type.methods;
      for (var i = 0; i < typeMethods.length; i++) {
        var tm = typeMethods[i];
        var found = false;
        for (var j = 0; j < valueMethods.length; j++) {
          var vm = valueMethods[j];
          if (vm[1] === tm[1] && vm[2] === tm[2] && vm[3] === tm[3]) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm[1];
          break;
        }
      }
      type.implementedBy[valueTypeString] = ok;
    }
    if (!ok) {
      missingMethod = type.missingMethodFor[valueTypeString];
    }
  }

  if (!ok) {
    if (returnTuple) {
      return [type.zero(), false];
    }
    $panic(new $packages["runtime"].TypeAssertionError.Ptr("", (value === $ifaceNil ? "" : value.constructor.string), type.string, missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  return returnTuple ? [value, true] : value;
};

var $coerceFloat32 = function(f) {
  var math = $packages["math"];
  if (math === undefined) {
    return f;
  }
  return math.Float32frombits(math.Float32bits(f));
};

var $floatKey = function(f) {
  if (f !== f) {
    $idCounter++;
    return "NaN$" + $idCounter;
  }
  return String(f);
};

var $flatten64 = function(x) {
  return x.$high * 4294967296 + x.$low;
};

var $shiftLeft64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high << y | x.$low >>> (32 - y), (x.$low << y) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$low << (y - 32), 0);
  }
  return new x.constructor(0, 0);
};

var $shiftRightInt64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(x.$high >> 31, (x.$high >> (y - 32)) >>> 0);
  }
  if (x.$high < 0) {
    return new x.constructor(-1, 4294967295);
  }
  return new x.constructor(0, 0);
};

var $shiftRightUint64 = function(x, y) {
  if (y === 0) {
    return x;
  }
  if (y < 32) {
    return new x.constructor(x.$high >>> y, (x.$low >>> y | x.$high << (32 - y)) >>> 0);
  }
  if (y < 64) {
    return new x.constructor(0, x.$high >>> (y - 32));
  }
  return new x.constructor(0, 0);
};

var $mul64 = function(x, y) {
  var high = 0, low = 0, i;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (i = 0; i < 32; i++) {
    if ((y.$high & 1<<i) !== 0) {
      high += x.$low << i;
    }
  }
  return new x.constructor(high, low);
};

var $div64 = function(x, y, returnRemainder) {
  if (y.$high === 0 && y.$low === 0) {
    $throwRuntimeError("integer divide by zero");
  }

  var s = 1;
  var rs = 1;

  var xHigh = x.$high;
  var xLow = x.$low;
  if (xHigh < 0) {
    s = -1;
    rs = -1;
    xHigh = -xHigh;
    if (xLow !== 0) {
      xHigh--;
      xLow = 4294967296 - xLow;
    }
  }

  var yHigh = y.$high;
  var yLow = y.$low;
  if (y.$high < 0) {
    s *= -1;
    yHigh = -yHigh;
    if (yLow !== 0) {
      yHigh--;
      yLow = 4294967296 - yLow;
    }
  }

  var high = 0, low = 0, n = 0, i;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (i = 0; i <= n; i++) {
    high = high << 1 | low >>> 31;
    low = (low << 1) >>> 0;
    if ((xHigh > yHigh) || (xHigh === yHigh && xLow >= yLow)) {
      xHigh = xHigh - yHigh;
      xLow = xLow - yLow;
      if (xLow < 0) {
        xHigh--;
        xLow += 4294967296;
      }
      low++;
      if (low === 4294967296) {
        high++;
        low = 0;
      }
    }
    yLow = (yLow >>> 1 | yHigh << (32 - 1)) >>> 0;
    yHigh = yHigh >>> 1;
  }

  if (returnRemainder) {
    return new x.constructor(xHigh * rs, xLow * rs);
  }
  return new x.constructor(high * s, low * s);
};

var $divComplex = function(n, d) {
  var ninf = n.$real === 1/0 || n.$real === -1/0 || n.$imag === 1/0 || n.$imag === -1/0;
  var dinf = d.$real === 1/0 || d.$real === -1/0 || d.$imag === 1/0 || d.$imag === -1/0;
  var nnan = !ninf && (n.$real !== n.$real || n.$imag !== n.$imag);
  var dnan = !dinf && (d.$real !== d.$real || d.$imag !== d.$imag);
  if(nnan || dnan) {
    return new n.constructor(0/0, 0/0);
  }
  if (ninf && !dinf) {
    return new n.constructor(1/0, 1/0);
  }
  if (!ninf && dinf) {
    return new n.constructor(0, 0);
  }
  if (d.$real === 0 && d.$imag === 0) {
    if (n.$real === 0 && n.$imag === 0) {
      return new n.constructor(0/0, 0/0);
    }
    return new n.constructor(1/0, 1/0);
  }
  var a = Math.abs(d.$real);
  var b = Math.abs(d.$imag);
  if (a <= b) {
    var ratio = d.$real / d.$imag;
    var denom = d.$real * ratio + d.$imag;
    return new n.constructor((n.$real * ratio + n.$imag) / denom, (n.$imag * ratio - n.$real) / denom);
  }
  var ratio = d.$imag / d.$real;
  var denom = d.$imag * ratio + d.$real;
  return new n.constructor((n.$imag * ratio + n.$real) / denom, (n.$imag - n.$real * ratio) / denom);
};

var $stackDepthOffset = 0;
var $getStackDepth = function() {
  var err = new Error();
  if (err.stack === undefined) {
    return undefined;
  }
  return $stackDepthOffset + err.stack.split("\n").length;
};

var $deferFrames = [], $skippedDeferFrames = 0, $jumpToDefer = false, $panicStackDepth = null, $panicValue;
var $callDeferred = function(deferred, jsErr) {
  if ($skippedDeferFrames !== 0) {
    $skippedDeferFrames--;
    throw jsErr;
  }
  if ($jumpToDefer) {
    $jumpToDefer = false;
    throw jsErr;
  }
  if (jsErr) {
    var newErr = null;
    try {
      $deferFrames.push(deferred);
      $panic(new $packages["github.com/gopherjs/gopherjs/js"].Error.Ptr(jsErr));
    } catch (err) {
      newErr = err;
    }
    $deferFrames.pop();
    $callDeferred(deferred, newErr);
    return;
  }

  $stackDepthOffset--;
  var outerPanicStackDepth = $panicStackDepth;
  var outerPanicValue = $panicValue;

  var localPanicValue = $curGoroutine.panicStack.pop();
  if (localPanicValue !== undefined) {
    $panicStackDepth = $getStackDepth();
    $panicValue = localPanicValue;
  }

  var call;
  try {
    while (true) {
      if (deferred === null) {
        deferred = $deferFrames[$deferFrames.length - 1 - $skippedDeferFrames];
        if (deferred === undefined) {
          if (localPanicValue.constructor === $String) {
            throw new Error(localPanicValue.$val);
          } else if (localPanicValue.Error !== undefined) {
            throw new Error(localPanicValue.Error());
          } else if (localPanicValue.String !== undefined) {
            throw new Error(localPanicValue.String());
          } else {
            throw new Error(localPanicValue);
          }
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        if (localPanicValue !== undefined) {
          $skippedDeferFrames++;
          deferred = null;
          continue;
        }
        return;
      }
      var r = call[0].apply(undefined, call[1]);
      if (r && r.$blocking) {
        deferred.push([r, []]);
      }

      if (localPanicValue !== undefined && $panicStackDepth === null) {
        throw null; /* error was recovered */
      }
    }
  } finally {
    if ($curGoroutine.asleep) {
      deferred.push(call);
      $jumpToDefer = true;
    }
    if (localPanicValue !== undefined) {
      if ($panicStackDepth !== null) {
        $curGoroutine.panicStack.push(localPanicValue);
      }
      $panicStackDepth = outerPanicStackDepth;
      $panicValue = outerPanicValue;
    }
    $stackDepthOffset++;
  }
};

var $panic = function(value) {
  $curGoroutine.panicStack.push(value);
  $callDeferred(null, null);
};
var $recover = function() {
  if ($panicStackDepth === null || ($panicStackDepth !== undefined && $panicStackDepth !== $getStackDepth() - 2)) {
    return $ifaceNil;
  }
  $panicStackDepth = null;
  return $panicValue;
};
var $nonblockingCall = function() {
  $panic(new $packages["runtime"].NotSupportedError.Ptr("non-blocking call to blocking function (mark call with \"//gopherjs:blocking\" to fix)"));
};
var $throw = function(err) { throw err; };
var $throwRuntimeError; /* set by package "runtime" */

var $dummyGoroutine = { asleep: false, exit: false, panicStack: [] };
var $curGoroutine = $dummyGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  args.push(true);
  var goroutine = function() {
    try {
      $curGoroutine = goroutine;
      $skippedDeferFrames = 0;
      $jumpToDefer = false;
      var r = fun.apply(undefined, args);
      if (r && r.$blocking) {
        fun = r;
        args = [];
        $schedule(goroutine, direct);
        return;
      }
      goroutine.exit = true;
    } catch (err) {
      if (!$curGoroutine.asleep) {
        goroutine.exit = true;
        throw err;
      }
    } finally {
      $curGoroutine = $dummyGoroutine;
      if (goroutine.exit) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        goroutine.asleep = true;
      }
      if (goroutine.asleep) {
        $awakeGoroutines--;
        if ($awakeGoroutines === 0 && $totalGoroutines !== 0 && $checkForDeadlock) {
          $panic(new $String("fatal error: all goroutines are asleep - deadlock!"));
        }
      }
    }
  };
  goroutine.asleep = false;
  goroutine.exit = false;
  goroutine.panicStack = [];
  $schedule(goroutine, direct);
};

var $scheduled = [], $schedulerLoopActive = false;
var $schedule = function(goroutine, direct) {
  if (goroutine.asleep) {
    goroutine.asleep = false;
    $awakeGoroutines++;
  }

  if (direct) {
    goroutine();
    return;
  }

  $scheduled.push(goroutine);
  if (!$schedulerLoopActive) {
    $schedulerLoopActive = true;
    setTimeout(function() {
      while (true) {
        var r = $scheduled.shift();
        if (r === undefined) {
          $schedulerLoopActive = false;
          break;
        }
        r();
      };
    }, 0);
  }
};

var $send = function(chan, value) {
  if (chan.$closed) {
    $throwRuntimeError("send on closed channel");
  }
  var queuedRecv = chan.$recvQueue.shift();
  if (queuedRecv !== undefined) {
    queuedRecv([value, true]);
    return;
  }
  if (chan.$buffer.length < chan.$capacity) {
    chan.$buffer.push(value);
    return;
  }

  var thisGoroutine = $curGoroutine;
  chan.$sendQueue.push(function() {
    $schedule(thisGoroutine);
    return value;
  });
  var blocked = false;
  var f = function() {
    if (blocked) {
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      return;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};
var $recv = function(chan) {
  var queuedSend = chan.$sendQueue.shift();
  if (queuedSend !== undefined) {
    chan.$buffer.push(queuedSend());
  }
  var bufferedValue = chan.$buffer.shift();
  if (bufferedValue !== undefined) {
    return [bufferedValue, true];
  }
  if (chan.$closed) {
    return [chan.constructor.elem.zero(), false];
  }

  var thisGoroutine = $curGoroutine, value;
  var queueEntry = function(v) {
    value = v;
    $schedule(thisGoroutine);
  };
  chan.$recvQueue.push(queueEntry);
  var blocked = false;
  var f = function() {
    if (blocked) {
      return value;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};
var $close = function(chan) {
  if (chan.$closed) {
    $throwRuntimeError("close of closed channel");
  }
  chan.$closed = true;
  while (true) {
    var queuedSend = chan.$sendQueue.shift();
    if (queuedSend === undefined) {
      break;
    }
    queuedSend(); /* will panic because of closed channel */
  }
  while (true) {
    var queuedRecv = chan.$recvQueue.shift();
    if (queuedRecv === undefined) {
      break;
    }
    queuedRecv([chan.constructor.elem.zero(), false]);
  }
};
var $select = function(comms) {
  var ready = [], i;
  var selection = -1;
  for (i = 0; i < comms.length; i++) {
    var comm = comms[i];
    var chan = comm[0];
    switch (comm.length) {
    case 0: /* default */
      selection = i;
      break;
    case 1: /* recv */
      if (chan.$sendQueue.length !== 0 || chan.$buffer.length !== 0 || chan.$closed) {
        ready.push(i);
      }
      break;
    case 2: /* send */
      if (chan.$closed) {
        $throwRuntimeError("send on closed channel");
      }
      if (chan.$recvQueue.length !== 0 || chan.$buffer.length < chan.$capacity) {
        ready.push(i);
      }
      break;
    }
  }

  if (ready.length !== 0) {
    selection = ready[Math.floor(Math.random() * ready.length)];
  }
  if (selection !== -1) {
    var comm = comms[selection];
    switch (comm.length) {
    case 0: /* default */
      return [selection];
    case 1: /* recv */
      return [selection, $recv(comm[0])];
    case 2: /* send */
      $send(comm[0], comm[1]);
      return [selection];
    }
  }

  var entries = [];
  var thisGoroutine = $curGoroutine;
  var removeFromQueues = function() {
    for (i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (i = 0; i < comms.length; i++) {
    (function(i) {
      var comm = comms[i];
      switch (comm.length) {
      case 1: /* recv */
        var queueEntry = function(value) {
          selection = [i, value];
          removeFromQueues();
          $schedule(thisGoroutine);
        };
        entries.push([comm[0].$recvQueue, queueEntry]);
        comm[0].$recvQueue.push(queueEntry);
        break;
      case 2: /* send */
        var queueEntry = function() {
          if (comm[0].$closed) {
            $throwRuntimeError("send on closed channel");
          }
          selection = [i];
          removeFromQueues();
          $schedule(thisGoroutine);
          return comm[1];
        };
        entries.push([comm[0].$sendQueue, queueEntry]);
        comm[0].$sendQueue.push(queueEntry);
        break;
      }
    })(i);
  }
  var blocked = false;
  var f = function() {
    if (blocked) {
      return selection;
    };
    blocked = true;
    $curGoroutine.asleep = true;
    throw null;
  };
  f.$blocking = true;
  return f;
};

var $needsExternalization = function(t) {
  switch (t.kind) {
    case "Bool":
    case "Int":
    case "Int8":
    case "Int16":
    case "Int32":
    case "Uint":
    case "Uint8":
    case "Uint16":
    case "Uint32":
    case "Uintptr":
    case "Float32":
    case "Float64":
      return false;
    case "Interface":
      return t !== $packages["github.com/gopherjs/gopherjs/js"].Object;
    default:
      return true;
  }
};

var $externalize = function(v, t) {
  switch (t.kind) {
  case "Bool":
  case "Int":
  case "Int8":
  case "Int16":
  case "Int32":
  case "Uint":
  case "Uint8":
  case "Uint16":
  case "Uint32":
  case "Uintptr":
  case "Float32":
  case "Float64":
    return v;
  case "Int64":
  case "Uint64":
    return $flatten64(v);
  case "Array":
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case "Func":
    if (v === $throwNilPointerError) {
      return null;
    }
    if (v.$externalizeWrapper === undefined) {
      $checkForDeadlock = false;
      var convert = false;
      var i;
      for (i = 0; i < t.params.length; i++) {
        convert = convert || (t.params[i] !== $packages["github.com/gopherjs/gopherjs/js"].Object);
      }
      for (i = 0; i < t.results.length; i++) {
        convert = convert || $needsExternalization(t.results[i]);
      }
      if (!convert) {
        return v;
      }
      v.$externalizeWrapper = function() {
        var args = [], i;
        for (i = 0; i < t.params.length; i++) {
          if (t.variadic && i === t.params.length - 1) {
            var vt = t.params[i].elem, varargs = [], j;
            for (j = i; j < arguments.length; j++) {
              varargs.push($internalize(arguments[j], vt));
            }
            args.push(new (t.params[i])(varargs));
            break;
          }
          args.push($internalize(arguments[i], t.params[i]));
        }
        var result = v.apply(this, args);
        switch (t.results.length) {
        case 0:
          return;
        case 1:
          return $externalize(result, t.results[0]);
        default:
          for (i = 0; i < t.results.length; i++) {
            result[i] = $externalize(result[i], t.results[i]);
          }
          return result;
        }
      };
    }
    return v.$externalizeWrapper;
  case "Interface":
    if (v === $ifaceNil) {
      return null;
    }
    if (t === $packages["github.com/gopherjs/gopherjs/js"].Object || v.constructor.kind === undefined) {
      return v;
    }
    return $externalize(v.$val, v.constructor);
  case "Map":
    var m = {};
    var keys = $keys(v), i;
    for (i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case "Ptr":
    var o = {}, i;
    for (i = 0; i < t.methods.length; i++) {
      var m = t.methods[i];
      if (m[2] !== "") { /* not exported */
        continue;
      }
      (function(m) {
        o[m[1]] = $externalize(function() {
          return v[m[0]].apply(v, arguments);
        }, m[3]);
      })(m);
    }
    return o;
  case "Slice":
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case "String":
    var s = "", r, i, j = 0;
    for (i = 0; i < v.length; i += r[1], j++) {
      r = $decodeRune(v, i);
      s += String.fromCharCode(r[0]);
    }
    return s;
  case "Struct":
    var timePkg = $packages["time"];
    if (timePkg && v.constructor === timePkg.Time.Ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }
    var o = {}, i;
    for (i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (f[2] !== "") { /* not exported */
        continue;
      }
      o[f[1]] = $externalize(v[f[0]], f[3]);
    }
    return o;
  }
  $panic(new $String("cannot externalize " + t.string));
};

var $internalize = function(v, t, recv) {
  switch (t.kind) {
  case "Bool":
    return !!v;
  case "Int":
    return parseInt(v);
  case "Int8":
    return parseInt(v) << 24 >> 24;
  case "Int16":
    return parseInt(v) << 16 >> 16;
  case "Int32":
    return parseInt(v) >> 0;
  case "Uint":
    return parseInt(v);
  case "Uint8":
    return parseInt(v) << 24 >>> 24;
  case "Uint16":
    return parseInt(v) << 16 >>> 16;
  case "Uint32":
  case "Uintptr":
    return parseInt(v) >>> 0;
  case "Int64":
  case "Uint64":
    return new t(0, v);
  case "Float32":
  case "Float64":
    return parseFloat(v);
  case "Array":
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case "Func":
    return function() {
      var args = [], i;
      for (i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i], j;
          for (j = 0; j < varargs.$length; j++) {
            args.push($externalize(varargs.$array[varargs.$offset + j], vt));
          }
          break;
        }
        args.push($externalize(arguments[i], t.params[i]));
      }
      var result = v.apply(recv, args);
      switch (t.results.length) {
      case 0:
        return;
      case 1:
        return $internalize(result, t.results[0]);
      default:
        for (i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case "Interface":
    if (t === $packages["github.com/gopherjs/gopherjs/js"].Object) {
      return v;
    }
    if (v === null) {
      return $ifaceNil;
    }
    switch (v.constructor) {
    case Int8Array:
      return new ($sliceType($Int8))(v);
    case Int16Array:
      return new ($sliceType($Int16))(v);
    case Int32Array:
      return new ($sliceType($Int))(v);
    case Uint8Array:
      return new ($sliceType($Uint8))(v);
    case Uint16Array:
      return new ($sliceType($Uint16))(v);
    case Uint32Array:
      return new ($sliceType($Uint))(v);
    case Float32Array:
      return new ($sliceType($Float32))(v);
    case Float64Array:
      return new ($sliceType($Float64))(v);
    case Array:
      return $internalize(v, $sliceType($emptyInterface));
    case Boolean:
      return new $Bool(!!v);
    case Date:
      var timePkg = $packages["time"];
      if (timePkg) {
        return new timePkg.Time(timePkg.Unix(new $Int64(0, 0), new $Int64(0, v.getTime() * 1000000)));
      }
    case Function:
      var funcType = $funcType([$sliceType($emptyInterface)], [$packages["github.com/gopherjs/gopherjs/js"].Object], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return v;
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case "Map":
    var m = new $Map();
    var keys = $keys(v), i;
    for (i = 0; i < keys.length; i++) {
      var key = $internalize(keys[i], t.key);
      m[key.$key ? key.$key() : key] = { k: key, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case "Slice":
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case "String":
    v = String(v);
    var s = "", i;
    for (i = 0; i < v.length; i++) {
      s += $encodeRune(v.charCodeAt(i));
    }
    return s;
  default:
    $panic(new $String("cannot internalize " + t.string));
  }
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, Object, Error, init;
	Object = $pkg.Object = $newType(8, "Interface", "js.Object", "Object", "github.com/gopherjs/gopherjs/js", null);
	Error = $pkg.Error = $newType(0, "Struct", "js.Error", "Error", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : $ifaceNil;
	});
	Error.Ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		e = new Error.Ptr($ifaceNil);
	};
	$pkg.$init = function() {
		Object.init([["Bool", "Bool", "", $funcType([], [$Bool], false)], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [Object], true)], ["Delete", "Delete", "", $funcType([$String], [], false)], ["Float", "Float", "", $funcType([], [$Float64], false)], ["Get", "Get", "", $funcType([$String], [Object], false)], ["Index", "Index", "", $funcType([$Int], [Object], false)], ["Int", "Int", "", $funcType([], [$Int], false)], ["Int64", "Int64", "", $funcType([], [$Int64], false)], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false)], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [Object], true)], ["IsNull", "IsNull", "", $funcType([], [$Bool], false)], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false)], ["Length", "Length", "", $funcType([], [$Int], false)], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [Object], true)], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false)], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false)], ["Str", "Str", "", $funcType([], [$String], false)], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false)], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false)]]);
		Error.methods = [["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [Object], false), 0], ["Index", "Index", "", $funcType([$Int], [Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		($ptrType(Error)).methods = [["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Error", "Error", "", $funcType([], [$String], false), -1], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [Object], false), 0], ["Index", "Index", "", $funcType([$Int], [Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [Object], true), 0], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		Error.init([["Object", "", "", Object, ""]]);
		init();
	};
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], NotSupportedError, TypeAssertionError, errorString, MemStats, sizeof_C_MStats, init, init$1;
	NotSupportedError = $pkg.NotSupportedError = $newType(0, "Struct", "runtime.NotSupportedError", "NotSupportedError", "runtime", function(Feature_) {
		this.$val = this;
		this.Feature = Feature_ !== undefined ? Feature_ : "";
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, "Struct", "runtime.TypeAssertionError", "TypeAssertionError", "runtime", function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		this.interfaceString = interfaceString_ !== undefined ? interfaceString_ : "";
		this.concreteString = concreteString_ !== undefined ? concreteString_ : "";
		this.assertedString = assertedString_ !== undefined ? assertedString_ : "";
		this.missingMethod = missingMethod_ !== undefined ? missingMethod_ : "";
	});
	errorString = $pkg.errorString = $newType(8, "String", "runtime.errorString", "errorString", "runtime", null);
	MemStats = $pkg.MemStats = $newType(0, "Struct", "runtime.MemStats", "MemStats", "runtime", function(Alloc_, TotalAlloc_, Sys_, Lookups_, Mallocs_, Frees_, HeapAlloc_, HeapSys_, HeapIdle_, HeapInuse_, HeapReleased_, HeapObjects_, StackInuse_, StackSys_, MSpanInuse_, MSpanSys_, MCacheInuse_, MCacheSys_, BuckHashSys_, GCSys_, OtherSys_, NextGC_, LastGC_, PauseTotalNs_, PauseNs_, NumGC_, EnableGC_, DebugGC_, BySize_) {
		this.$val = this;
		this.Alloc = Alloc_ !== undefined ? Alloc_ : new $Uint64(0, 0);
		this.TotalAlloc = TotalAlloc_ !== undefined ? TotalAlloc_ : new $Uint64(0, 0);
		this.Sys = Sys_ !== undefined ? Sys_ : new $Uint64(0, 0);
		this.Lookups = Lookups_ !== undefined ? Lookups_ : new $Uint64(0, 0);
		this.Mallocs = Mallocs_ !== undefined ? Mallocs_ : new $Uint64(0, 0);
		this.Frees = Frees_ !== undefined ? Frees_ : new $Uint64(0, 0);
		this.HeapAlloc = HeapAlloc_ !== undefined ? HeapAlloc_ : new $Uint64(0, 0);
		this.HeapSys = HeapSys_ !== undefined ? HeapSys_ : new $Uint64(0, 0);
		this.HeapIdle = HeapIdle_ !== undefined ? HeapIdle_ : new $Uint64(0, 0);
		this.HeapInuse = HeapInuse_ !== undefined ? HeapInuse_ : new $Uint64(0, 0);
		this.HeapReleased = HeapReleased_ !== undefined ? HeapReleased_ : new $Uint64(0, 0);
		this.HeapObjects = HeapObjects_ !== undefined ? HeapObjects_ : new $Uint64(0, 0);
		this.StackInuse = StackInuse_ !== undefined ? StackInuse_ : new $Uint64(0, 0);
		this.StackSys = StackSys_ !== undefined ? StackSys_ : new $Uint64(0, 0);
		this.MSpanInuse = MSpanInuse_ !== undefined ? MSpanInuse_ : new $Uint64(0, 0);
		this.MSpanSys = MSpanSys_ !== undefined ? MSpanSys_ : new $Uint64(0, 0);
		this.MCacheInuse = MCacheInuse_ !== undefined ? MCacheInuse_ : new $Uint64(0, 0);
		this.MCacheSys = MCacheSys_ !== undefined ? MCacheSys_ : new $Uint64(0, 0);
		this.BuckHashSys = BuckHashSys_ !== undefined ? BuckHashSys_ : new $Uint64(0, 0);
		this.GCSys = GCSys_ !== undefined ? GCSys_ : new $Uint64(0, 0);
		this.OtherSys = OtherSys_ !== undefined ? OtherSys_ : new $Uint64(0, 0);
		this.NextGC = NextGC_ !== undefined ? NextGC_ : new $Uint64(0, 0);
		this.LastGC = LastGC_ !== undefined ? LastGC_ : new $Uint64(0, 0);
		this.PauseTotalNs = PauseTotalNs_ !== undefined ? PauseTotalNs_ : new $Uint64(0, 0);
		this.PauseNs = PauseNs_ !== undefined ? PauseNs_ : ($arrayType($Uint64, 256)).zero();
		this.NumGC = NumGC_ !== undefined ? NumGC_ : 0;
		this.EnableGC = EnableGC_ !== undefined ? EnableGC_ : false;
		this.DebugGC = DebugGC_ !== undefined ? DebugGC_ : false;
		this.BySize = BySize_ !== undefined ? BySize_ : ($arrayType(($structType([["Size", "Size", "", $Uint32, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""]])), 61)).zero();
	});
	NotSupportedError.Ptr.prototype.Error = function() {
		var err;
		err = this;
		return "not supported by GopherJS: " + err.Feature;
	};
	NotSupportedError.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		$throwRuntimeError = $externalize((function(msg) {
			$panic(new errorString(msg));
		}), ($funcType([$String], [], false)));
		e = $ifaceNil;
		e = new TypeAssertionError.Ptr("", "", "", "");
		e = new NotSupportedError.Ptr("");
	};
	TypeAssertionError.Ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.Ptr.prototype.Error = function() {
		var e, inter;
		e = this;
		inter = e.interfaceString;
		if (inter === "") {
			inter = "interface";
		}
		if (e.concreteString === "") {
			return "interface conversion: " + inter + " is nil, not " + e.assertedString;
		}
		if (e.missingMethod === "") {
			return "interface conversion: " + inter + " is " + e.concreteString + ", not " + e.assertedString;
		}
		return "interface conversion: " + e.concreteString + " is not " + e.assertedString + ": missing method " + e.missingMethod;
	};
	TypeAssertionError.prototype.Error = function() { return this.$val.Error(); };
	errorString.prototype.RuntimeError = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val !== undefined ? this.$val : this;
		return "runtime error: " + e;
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	init$1 = function() {
		var memStats;
		memStats = new MemStats.Ptr(); $copy(memStats, new MemStats.Ptr(), MemStats);
		if (!((sizeof_C_MStats === 3712))) {
			console.log(sizeof_C_MStats, 3712);
			$panic(new $String("MStats vs MemStatsType size mismatch"));
		}
	};
	$pkg.$init = function() {
		($ptrType(NotSupportedError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		NotSupportedError.init([["Feature", "Feature", "", $String, ""]]);
		($ptrType(TypeAssertionError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["RuntimeError", "RuntimeError", "", $funcType([], [], false), -1]];
		TypeAssertionError.init([["interfaceString", "interfaceString", "runtime", $String, ""], ["concreteString", "concreteString", "runtime", $String, ""], ["assertedString", "assertedString", "runtime", $String, ""], ["missingMethod", "missingMethod", "runtime", $String, ""]]);
		errorString.methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["RuntimeError", "RuntimeError", "", $funcType([], [], false), -1]];
		($ptrType(errorString)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1], ["RuntimeError", "RuntimeError", "", $funcType([], [], false), -1]];
		MemStats.init([["Alloc", "Alloc", "", $Uint64, ""], ["TotalAlloc", "TotalAlloc", "", $Uint64, ""], ["Sys", "Sys", "", $Uint64, ""], ["Lookups", "Lookups", "", $Uint64, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""], ["HeapAlloc", "HeapAlloc", "", $Uint64, ""], ["HeapSys", "HeapSys", "", $Uint64, ""], ["HeapIdle", "HeapIdle", "", $Uint64, ""], ["HeapInuse", "HeapInuse", "", $Uint64, ""], ["HeapReleased", "HeapReleased", "", $Uint64, ""], ["HeapObjects", "HeapObjects", "", $Uint64, ""], ["StackInuse", "StackInuse", "", $Uint64, ""], ["StackSys", "StackSys", "", $Uint64, ""], ["MSpanInuse", "MSpanInuse", "", $Uint64, ""], ["MSpanSys", "MSpanSys", "", $Uint64, ""], ["MCacheInuse", "MCacheInuse", "", $Uint64, ""], ["MCacheSys", "MCacheSys", "", $Uint64, ""], ["BuckHashSys", "BuckHashSys", "", $Uint64, ""], ["GCSys", "GCSys", "", $Uint64, ""], ["OtherSys", "OtherSys", "", $Uint64, ""], ["NextGC", "NextGC", "", $Uint64, ""], ["LastGC", "LastGC", "", $Uint64, ""], ["PauseTotalNs", "PauseTotalNs", "", $Uint64, ""], ["PauseNs", "PauseNs", "", ($arrayType($Uint64, 256)), ""], ["NumGC", "NumGC", "", $Uint32, ""], ["EnableGC", "EnableGC", "", $Bool, ""], ["DebugGC", "DebugGC", "", $Bool, ""], ["BySize", "BySize", "", ($arrayType(($structType([["Size", "Size", "", $Uint32, ""], ["Mallocs", "Mallocs", "", $Uint64, ""], ["Frees", "Frees", "", $Uint64, ""]])), 61)), ""]]);
		sizeof_C_MStats = 3712;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["github.com/gopherjs/jquery"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], JQuery, Event, JQueryCoordinates, NewJQuery;
	JQuery = $pkg.JQuery = $newType(0, "Struct", "jquery.JQuery", "JQuery", "github.com/gopherjs/jquery", function(o_, Jquery_, Selector_, Length_, Context_) {
		this.$val = this;
		this.o = o_ !== undefined ? o_ : $ifaceNil;
		this.Jquery = Jquery_ !== undefined ? Jquery_ : "";
		this.Selector = Selector_ !== undefined ? Selector_ : "";
		this.Length = Length_ !== undefined ? Length_ : 0;
		this.Context = Context_ !== undefined ? Context_ : "";
	});
	Event = $pkg.Event = $newType(0, "Struct", "jquery.Event", "Event", "github.com/gopherjs/jquery", function(Object_, KeyCode_, Target_, CurrentTarget_, DelegateTarget_, RelatedTarget_, Data_, Result_, Which_, Namespace_, MetaKey_, PageX_, PageY_, Type_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : $ifaceNil;
		this.KeyCode = KeyCode_ !== undefined ? KeyCode_ : 0;
		this.Target = Target_ !== undefined ? Target_ : $ifaceNil;
		this.CurrentTarget = CurrentTarget_ !== undefined ? CurrentTarget_ : $ifaceNil;
		this.DelegateTarget = DelegateTarget_ !== undefined ? DelegateTarget_ : $ifaceNil;
		this.RelatedTarget = RelatedTarget_ !== undefined ? RelatedTarget_ : $ifaceNil;
		this.Data = Data_ !== undefined ? Data_ : $ifaceNil;
		this.Result = Result_ !== undefined ? Result_ : $ifaceNil;
		this.Which = Which_ !== undefined ? Which_ : 0;
		this.Namespace = Namespace_ !== undefined ? Namespace_ : "";
		this.MetaKey = MetaKey_ !== undefined ? MetaKey_ : false;
		this.PageX = PageX_ !== undefined ? PageX_ : 0;
		this.PageY = PageY_ !== undefined ? PageY_ : 0;
		this.Type = Type_ !== undefined ? Type_ : "";
	});
	JQueryCoordinates = $pkg.JQueryCoordinates = $newType(0, "Struct", "jquery.JQueryCoordinates", "JQueryCoordinates", "github.com/gopherjs/jquery", function(Left_, Top_) {
		this.$val = this;
		this.Left = Left_ !== undefined ? Left_ : 0;
		this.Top = Top_ !== undefined ? Top_ : 0;
	});
	Event.Ptr.prototype.PreventDefault = function() {
		var event;
		event = this;
		event.Object.preventDefault();
	};
	Event.prototype.PreventDefault = function() { return this.$val.PreventDefault(); };
	Event.Ptr.prototype.IsDefaultPrevented = function() {
		var event;
		event = this;
		return !!(event.Object.isDefaultPrevented());
	};
	Event.prototype.IsDefaultPrevented = function() { return this.$val.IsDefaultPrevented(); };
	Event.Ptr.prototype.IsImmediatePropogationStopped = function() {
		var event;
		event = this;
		return !!(event.Object.isImmediatePropogationStopped());
	};
	Event.prototype.IsImmediatePropogationStopped = function() { return this.$val.IsImmediatePropogationStopped(); };
	Event.Ptr.prototype.IsPropagationStopped = function() {
		var event;
		event = this;
		return !!(event.Object.isPropagationStopped());
	};
	Event.prototype.IsPropagationStopped = function() { return this.$val.IsPropagationStopped(); };
	Event.Ptr.prototype.StopImmediatePropagation = function() {
		var event;
		event = this;
		event.Object.stopImmediatePropagation();
	};
	Event.prototype.StopImmediatePropagation = function() { return this.$val.StopImmediatePropagation(); };
	Event.Ptr.prototype.StopPropagation = function() {
		var event;
		event = this;
		event.Object.stopPropagation();
	};
	Event.prototype.StopPropagation = function() { return this.$val.StopPropagation(); };
	NewJQuery = $pkg.NewJQuery = function(args) {
		return new JQuery.Ptr(new ($global.Function.prototype.bind.apply($global.jQuery, [undefined].concat($externalize(args, ($sliceType($emptyInterface)))))), "", "", 0, "");
	};
	JQuery.Ptr.prototype.Each = function(fn) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.each($externalize((function(idx, elem) {
			fn(idx, $clone(NewJQuery(new ($sliceType($emptyInterface))([elem])), JQuery));
		}), ($funcType([$Int, js.Object], [], false))));
		return j;
	};
	JQuery.prototype.Each = function(fn) { return this.$val.Each(fn); };
	JQuery.Ptr.prototype.Underlying = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.o;
	};
	JQuery.prototype.Underlying = function() { return this.$val.Underlying(); };
	JQuery.Ptr.prototype.Get = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return (obj = j.o, obj.get.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
	};
	JQuery.prototype.Get = function(i) { return this.$val.Get(i); };
	JQuery.Ptr.prototype.Append = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom2args("append", i);
	};
	JQuery.prototype.Append = function(i) { return this.$val.Append(i); };
	JQuery.Ptr.prototype.Empty = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.empty();
		return j;
	};
	JQuery.prototype.Empty = function() { return this.$val.Empty(); };
	JQuery.Ptr.prototype.Detach = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.detach.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Detach = function(i) { return this.$val.Detach(i); };
	JQuery.Ptr.prototype.Eq = function(idx) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.eq(idx);
		return j;
	};
	JQuery.prototype.Eq = function(idx) { return this.$val.Eq(idx); };
	JQuery.Ptr.prototype.FadeIn = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.fadeIn.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.FadeIn = function(i) { return this.$val.FadeIn(i); };
	JQuery.Ptr.prototype.Delay = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.delay.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Delay = function(i) { return this.$val.Delay(i); };
	JQuery.Ptr.prototype.ToArray = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $assertType($internalize(j.o.toArray(), $emptyInterface), ($sliceType($emptyInterface)));
	};
	JQuery.prototype.ToArray = function() { return this.$val.ToArray(); };
	JQuery.Ptr.prototype.Remove = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.remove.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Remove = function(i) { return this.$val.Remove(i); };
	JQuery.Ptr.prototype.Stop = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.stop.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Stop = function(i) { return this.$val.Stop(i); };
	JQuery.Ptr.prototype.AddBack = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.addBack.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.AddBack = function(i) { return this.$val.AddBack(i); };
	JQuery.Ptr.prototype.Css = function(name) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $internalize(j.o.css($externalize(name, $String)), $String);
	};
	JQuery.prototype.Css = function(name) { return this.$val.Css(name); };
	JQuery.Ptr.prototype.CssArray = function(arr) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $assertType($internalize(j.o.css($externalize(arr, ($sliceType($String)))), $emptyInterface), ($mapType($String, $emptyInterface)));
	};
	JQuery.prototype.CssArray = function(arr) { return this.$val.CssArray(arr); };
	JQuery.Ptr.prototype.SetCss = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.css.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.SetCss = function(i) { return this.$val.SetCss(i); };
	JQuery.Ptr.prototype.Text = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $internalize(j.o.text(), $String);
	};
	JQuery.prototype.Text = function() { return this.$val.Text(); };
	JQuery.Ptr.prototype.SetText = function(i) {
		var j, _ref;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		_ref = i;
		if ($assertType(_ref, ($funcType([$Int, $String], [$String], false)), true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetText Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.text($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetText = function(i) { return this.$val.SetText(i); };
	JQuery.Ptr.prototype.Val = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $internalize(j.o.val(), $String);
	};
	JQuery.prototype.Val = function() { return this.$val.Val(); };
	JQuery.Ptr.prototype.SetVal = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o.val($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetVal = function(i) { return this.$val.SetVal(i); };
	JQuery.Ptr.prototype.Prop = function(property) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $internalize(j.o.prop($externalize(property, $String)), $emptyInterface);
	};
	JQuery.prototype.Prop = function(property) { return this.$val.Prop(property); };
	JQuery.Ptr.prototype.SetProp = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.prop.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.SetProp = function(i) { return this.$val.SetProp(i); };
	JQuery.Ptr.prototype.RemoveProp = function(property) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.removeProp($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveProp = function(property) { return this.$val.RemoveProp(property); };
	JQuery.Ptr.prototype.Attr = function(property) {
		var j, attr;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		attr = j.o.attr($externalize(property, $String));
		if (attr === undefined) {
			return "";
		}
		return $internalize(attr, $String);
	};
	JQuery.prototype.Attr = function(property) { return this.$val.Attr(property); };
	JQuery.Ptr.prototype.SetAttr = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.attr.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.SetAttr = function(i) { return this.$val.SetAttr(i); };
	JQuery.Ptr.prototype.RemoveAttr = function(property) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.removeAttr($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveAttr = function(property) { return this.$val.RemoveAttr(property); };
	JQuery.Ptr.prototype.HasClass = function(class$1) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return !!(j.o.hasClass($externalize(class$1, $String)));
	};
	JQuery.prototype.HasClass = function(class$1) { return this.$val.HasClass(class$1); };
	JQuery.Ptr.prototype.AddClass = function(i) {
		var j, _ref;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		_ref = i;
		if ($assertType(_ref, ($funcType([$Int, $String], [$String], false)), true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("addClass Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.addClass($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.AddClass = function(i) { return this.$val.AddClass(i); };
	JQuery.Ptr.prototype.RemoveClass = function(property) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.removeClass($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveClass = function(property) { return this.$val.RemoveClass(property); };
	JQuery.Ptr.prototype.ToggleClass = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.toggleClass.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.ToggleClass = function(i) { return this.$val.ToggleClass(i); };
	JQuery.Ptr.prototype.Focus = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.focus();
		return j;
	};
	JQuery.prototype.Focus = function() { return this.$val.Focus(); };
	JQuery.Ptr.prototype.Blur = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.blur();
		return j;
	};
	JQuery.prototype.Blur = function() { return this.$val.Blur(); };
	JQuery.Ptr.prototype.ReplaceAll = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom1arg("replaceAll", i);
	};
	JQuery.prototype.ReplaceAll = function(i) { return this.$val.ReplaceAll(i); };
	JQuery.Ptr.prototype.ReplaceWith = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom1arg("replaceWith", i);
	};
	JQuery.prototype.ReplaceWith = function(i) { return this.$val.ReplaceWith(i); };
	JQuery.Ptr.prototype.After = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom2args("after", i);
	};
	JQuery.prototype.After = function(i) { return this.$val.After(i); };
	JQuery.Ptr.prototype.Before = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom2args("before", i);
	};
	JQuery.prototype.Before = function(i) { return this.$val.Before(i); };
	JQuery.Ptr.prototype.Prepend = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom2args("prepend", i);
	};
	JQuery.prototype.Prepend = function(i) { return this.$val.Prepend(i); };
	JQuery.Ptr.prototype.PrependTo = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom1arg("prependTo", i);
	};
	JQuery.prototype.PrependTo = function(i) { return this.$val.PrependTo(i); };
	JQuery.Ptr.prototype.AppendTo = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom1arg("appendTo", i);
	};
	JQuery.prototype.AppendTo = function(i) { return this.$val.AppendTo(i); };
	JQuery.Ptr.prototype.InsertAfter = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom1arg("insertAfter", i);
	};
	JQuery.prototype.InsertAfter = function(i) { return this.$val.InsertAfter(i); };
	JQuery.Ptr.prototype.InsertBefore = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom1arg("insertBefore", i);
	};
	JQuery.prototype.InsertBefore = function(i) { return this.$val.InsertBefore(i); };
	JQuery.Ptr.prototype.Show = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.show();
		return j;
	};
	JQuery.prototype.Show = function() { return this.$val.Show(); };
	JQuery.Ptr.prototype.Hide = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o.hide();
		return j;
	};
	JQuery.prototype.Hide = function() { return this.$val.Hide(); };
	JQuery.Ptr.prototype.Toggle = function(showOrHide) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.toggle($externalize(showOrHide, $Bool));
		return j;
	};
	JQuery.prototype.Toggle = function(showOrHide) { return this.$val.Toggle(showOrHide); };
	JQuery.Ptr.prototype.Contents = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.contents();
		return j;
	};
	JQuery.prototype.Contents = function() { return this.$val.Contents(); };
	JQuery.Ptr.prototype.Html = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $internalize(j.o.html(), $String);
	};
	JQuery.prototype.Html = function() { return this.$val.Html(); };
	JQuery.Ptr.prototype.SetHtml = function(i) {
		var j, _ref;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		_ref = i;
		if ($assertType(_ref, ($funcType([$Int, $String], [$String], false)), true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetHtml Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.html($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetHtml = function(i) { return this.$val.SetHtml(i); };
	JQuery.Ptr.prototype.Closest = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom2args("closest", i);
	};
	JQuery.prototype.Closest = function(i) { return this.$val.Closest(i); };
	JQuery.Ptr.prototype.End = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.end();
		return j;
	};
	JQuery.prototype.End = function() { return this.$val.End(); };
	JQuery.Ptr.prototype.Add = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom2args("add", i);
	};
	JQuery.prototype.Add = function(i) { return this.$val.Add(i); };
	JQuery.Ptr.prototype.Clone = function(b) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.clone.apply(obj, $externalize(b, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Clone = function(b) { return this.$val.Clone(b); };
	JQuery.Ptr.prototype.Height = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $parseInt(j.o.height()) >> 0;
	};
	JQuery.prototype.Height = function() { return this.$val.Height(); };
	JQuery.Ptr.prototype.SetHeight = function(value) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.height($externalize(value, $String));
		return j;
	};
	JQuery.prototype.SetHeight = function(value) { return this.$val.SetHeight(value); };
	JQuery.Ptr.prototype.Width = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $parseInt(j.o.width()) >> 0;
	};
	JQuery.prototype.Width = function() { return this.$val.Width(); };
	JQuery.Ptr.prototype.SetWidth = function(i) {
		var j, _ref;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		_ref = i;
		if ($assertType(_ref, ($funcType([$Int, $String], [$String], false)), true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetWidth Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.width($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetWidth = function(i) { return this.$val.SetWidth(i); };
	JQuery.Ptr.prototype.InnerHeight = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $parseInt(j.o.innerHeight()) >> 0;
	};
	JQuery.prototype.InnerHeight = function() { return this.$val.InnerHeight(); };
	JQuery.Ptr.prototype.InnerWidth = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $parseInt(j.o.innerWidth()) >> 0;
	};
	JQuery.prototype.InnerWidth = function() { return this.$val.InnerWidth(); };
	JQuery.Ptr.prototype.Offset = function() {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		obj = j.o.offset();
		return new JQueryCoordinates.Ptr($parseInt(obj.left) >> 0, $parseInt(obj.top) >> 0);
	};
	JQuery.prototype.Offset = function() { return this.$val.Offset(); };
	JQuery.Ptr.prototype.SetOffset = function(jc) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.offset($externalize(jc, JQueryCoordinates));
		return j;
	};
	JQuery.prototype.SetOffset = function(jc) { return this.$val.SetOffset(jc); };
	JQuery.Ptr.prototype.OuterHeight = function(includeMargin) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		if (includeMargin.$length === 0) {
			return $parseInt(j.o.outerHeight()) >> 0;
		}
		return $parseInt(j.o.outerHeight($externalize(((0 < 0 || 0 >= includeMargin.$length) ? $throwRuntimeError("index out of range") : includeMargin.$array[includeMargin.$offset + 0]), $Bool))) >> 0;
	};
	JQuery.prototype.OuterHeight = function(includeMargin) { return this.$val.OuterHeight(includeMargin); };
	JQuery.Ptr.prototype.OuterWidth = function(includeMargin) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		if (includeMargin.$length === 0) {
			return $parseInt(j.o.outerWidth()) >> 0;
		}
		return $parseInt(j.o.outerWidth($externalize(((0 < 0 || 0 >= includeMargin.$length) ? $throwRuntimeError("index out of range") : includeMargin.$array[includeMargin.$offset + 0]), $Bool))) >> 0;
	};
	JQuery.prototype.OuterWidth = function(includeMargin) { return this.$val.OuterWidth(includeMargin); };
	JQuery.Ptr.prototype.Position = function() {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		obj = j.o.position();
		return new JQueryCoordinates.Ptr($parseInt(obj.left) >> 0, $parseInt(obj.top) >> 0);
	};
	JQuery.prototype.Position = function() { return this.$val.Position(); };
	JQuery.Ptr.prototype.ScrollLeft = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $parseInt(j.o.scrollLeft()) >> 0;
	};
	JQuery.prototype.ScrollLeft = function() { return this.$val.ScrollLeft(); };
	JQuery.Ptr.prototype.SetScrollLeft = function(value) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.scrollLeft(value);
		return j;
	};
	JQuery.prototype.SetScrollLeft = function(value) { return this.$val.SetScrollLeft(value); };
	JQuery.Ptr.prototype.ScrollTop = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $parseInt(j.o.scrollTop()) >> 0;
	};
	JQuery.prototype.ScrollTop = function() { return this.$val.ScrollTop(); };
	JQuery.Ptr.prototype.SetScrollTop = function(value) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.scrollTop(value);
		return j;
	};
	JQuery.prototype.SetScrollTop = function(value) { return this.$val.SetScrollTop(value); };
	JQuery.Ptr.prototype.ClearQueue = function(queueName) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.clearQueue($externalize(queueName, $String));
		return j;
	};
	JQuery.prototype.ClearQueue = function(queueName) { return this.$val.ClearQueue(queueName); };
	JQuery.Ptr.prototype.SetData = function(key, value) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.data($externalize(key, $String), $externalize(value, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetData = function(key, value) { return this.$val.SetData(key, value); };
	JQuery.Ptr.prototype.Data = function(key) {
		var j, result;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		result = j.o.data($externalize(key, $String));
		if (result === undefined) {
			return $ifaceNil;
		}
		return $internalize(result, $emptyInterface);
	};
	JQuery.prototype.Data = function(key) { return this.$val.Data(key); };
	JQuery.Ptr.prototype.Dequeue = function(queueName) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.dequeue($externalize(queueName, $String));
		return j;
	};
	JQuery.prototype.Dequeue = function(queueName) { return this.$val.Dequeue(queueName); };
	JQuery.Ptr.prototype.RemoveData = function(name) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.removeData($externalize(name, $String));
		return j;
	};
	JQuery.prototype.RemoveData = function(name) { return this.$val.RemoveData(name); };
	JQuery.Ptr.prototype.OffsetParent = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.offsetParent();
		return j;
	};
	JQuery.prototype.OffsetParent = function() { return this.$val.OffsetParent(); };
	JQuery.Ptr.prototype.Parent = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.parent.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Parent = function(i) { return this.$val.Parent(i); };
	JQuery.Ptr.prototype.Parents = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.parents.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Parents = function(i) { return this.$val.Parents(i); };
	JQuery.Ptr.prototype.ParentsUntil = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.parentsUntil.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.ParentsUntil = function(i) { return this.$val.ParentsUntil(i); };
	JQuery.Ptr.prototype.Prev = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.prev.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Prev = function(i) { return this.$val.Prev(i); };
	JQuery.Ptr.prototype.PrevAll = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.prevAll.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.PrevAll = function(i) { return this.$val.PrevAll(i); };
	JQuery.Ptr.prototype.PrevUntil = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.prevUntil.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.PrevUntil = function(i) { return this.$val.PrevUntil(i); };
	JQuery.Ptr.prototype.Siblings = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.siblings.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Siblings = function(i) { return this.$val.Siblings(i); };
	JQuery.Ptr.prototype.Slice = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.slice.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Slice = function(i) { return this.$val.Slice(i); };
	JQuery.Ptr.prototype.Children = function(selector) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.children($externalize(selector, $emptyInterface));
		return j;
	};
	JQuery.prototype.Children = function(selector) { return this.$val.Children(selector); };
	JQuery.Ptr.prototype.Unwrap = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.unwrap();
		return j;
	};
	JQuery.prototype.Unwrap = function() { return this.$val.Unwrap(); };
	JQuery.Ptr.prototype.Wrap = function(obj) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.wrap($externalize(obj, $emptyInterface));
		return j;
	};
	JQuery.prototype.Wrap = function(obj) { return this.$val.Wrap(obj); };
	JQuery.Ptr.prototype.WrapAll = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom1arg("wrapAll", i);
	};
	JQuery.prototype.WrapAll = function(i) { return this.$val.WrapAll(i); };
	JQuery.Ptr.prototype.WrapInner = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.dom1arg("wrapInner", i);
	};
	JQuery.prototype.WrapInner = function(i) { return this.$val.WrapInner(i); };
	JQuery.Ptr.prototype.Next = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.next.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Next = function(i) { return this.$val.Next(i); };
	JQuery.Ptr.prototype.NextAll = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.nextAll.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.NextAll = function(i) { return this.$val.NextAll(i); };
	JQuery.Ptr.prototype.NextUntil = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.nextUntil.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.NextUntil = function(i) { return this.$val.NextUntil(i); };
	JQuery.Ptr.prototype.Not = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.not.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Not = function(i) { return this.$val.Not(i); };
	JQuery.Ptr.prototype.Filter = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.filter.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Filter = function(i) { return this.$val.Filter(i); };
	JQuery.Ptr.prototype.Find = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.find.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Find = function(i) { return this.$val.Find(i); };
	JQuery.Ptr.prototype.First = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.first();
		return j;
	};
	JQuery.prototype.First = function() { return this.$val.First(); };
	JQuery.Ptr.prototype.Has = function(selector) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.has($externalize(selector, $String));
		return j;
	};
	JQuery.prototype.Has = function(selector) { return this.$val.Has(selector); };
	JQuery.Ptr.prototype.Is = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return !!((obj = j.o, obj.is.apply(obj, $externalize(i, ($sliceType($emptyInterface))))));
	};
	JQuery.prototype.Is = function(i) { return this.$val.Is(i); };
	JQuery.Ptr.prototype.Last = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.last();
		return j;
	};
	JQuery.prototype.Last = function() { return this.$val.Last(); };
	JQuery.Ptr.prototype.Ready = function(handler) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = j.o.ready($externalize(handler, ($funcType([], [], false))));
		return j;
	};
	JQuery.prototype.Ready = function(handler) { return this.$val.Ready(handler); };
	JQuery.Ptr.prototype.Resize = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.resize.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Resize = function(i) { return this.$val.Resize(i); };
	JQuery.Ptr.prototype.Scroll = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.handleEvent("scroll", i);
	};
	JQuery.prototype.Scroll = function(i) { return this.$val.Scroll(i); };
	JQuery.Ptr.prototype.FadeOut = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.fadeOut.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.FadeOut = function(i) { return this.$val.FadeOut(i); };
	JQuery.Ptr.prototype.Select = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.handleEvent("select", i);
	};
	JQuery.prototype.Select = function(i) { return this.$val.Select(i); };
	JQuery.Ptr.prototype.Submit = function(i) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.handleEvent("submit", i);
	};
	JQuery.prototype.Submit = function(i) { return this.$val.Submit(i); };
	JQuery.Ptr.prototype.handleEvent = function(evt, i) {
		var j, _ref;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		_ref = i.$length;
		if (_ref === 0) {
			j.o = j.o[$externalize(evt, $String)]();
		} else if (_ref === 1) {
			j.o = j.o[$externalize(evt, $String)]($externalize((function(e) {
				$assertType(((0 < 0 || 0 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 0]), ($funcType([Event], [], false)))(new Event.Ptr(e, 0, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, 0, "", false, 0, 0, ""));
			}), ($funcType([js.Object], [], false))));
		} else if (_ref === 2) {
			j.o = j.o[$externalize(evt, $String)]($externalize($assertType(((0 < 0 || 0 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 0]), ($mapType($String, $emptyInterface))), ($mapType($String, $emptyInterface))), $externalize((function(e) {
				$assertType(((1 < 0 || 1 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 1]), ($funcType([Event], [], false)))(new Event.Ptr(e, 0, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, 0, "", false, 0, 0, ""));
			}), ($funcType([js.Object], [], false))));
		} else {
			console.log(evt + " event expects 0 to 2 arguments");
		}
		return j;
	};
	JQuery.prototype.handleEvent = function(evt, i) { return this.$val.handleEvent(evt, i); };
	JQuery.Ptr.prototype.Trigger = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.trigger.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Trigger = function(i) { return this.$val.Trigger(i); };
	JQuery.Ptr.prototype.On = function(p) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.events("on", p);
	};
	JQuery.prototype.On = function(p) { return this.$val.On(p); };
	JQuery.Ptr.prototype.One = function(p) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.events("one", p);
	};
	JQuery.prototype.One = function(p) { return this.$val.One(p); };
	JQuery.Ptr.prototype.Off = function(p) {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.events("off", p);
	};
	JQuery.prototype.Off = function(p) { return this.$val.Off(p); };
	JQuery.Ptr.prototype.events = function(evt, p) {
		var j, count, isEventFunc, _ref, x, _ref$1, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		count = p.$length;
		isEventFunc = false;
		_ref = (x = p.$length - 1 >> 0, ((x < 0 || x >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + x]));
		if ($assertType(_ref, ($funcType([Event], [], false)), true)[1]) {
			isEventFunc = true;
		} else {
			isEventFunc = false;
		}
		_ref$1 = count;
		if (_ref$1 === 0) {
			j.o = j.o[$externalize(evt, $String)]();
			return j;
		} else if (_ref$1 === 1) {
			j.o = j.o[$externalize(evt, $String)]($externalize(((0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0]), $emptyInterface));
			return j;
		} else if (_ref$1 === 2) {
			if (isEventFunc) {
				j.o = j.o[$externalize(evt, $String)]($externalize(((0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0]), $emptyInterface), $externalize((function(e) {
					$assertType(((1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1]), ($funcType([Event], [], false)))(new Event.Ptr(e, 0, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, 0, "", false, 0, 0, ""));
				}), ($funcType([js.Object], [], false))));
				return j;
			} else {
				j.o = j.o[$externalize(evt, $String)]($externalize(((0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0]), $emptyInterface), $externalize(((1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1]), $emptyInterface));
				return j;
			}
		} else if (_ref$1 === 3) {
			if (isEventFunc) {
				j.o = j.o[$externalize(evt, $String)]($externalize(((0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0]), $emptyInterface), $externalize(((1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1]), $emptyInterface), $externalize((function(e) {
					$assertType(((2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2]), ($funcType([Event], [], false)))(new Event.Ptr(e, 0, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, 0, "", false, 0, 0, ""));
				}), ($funcType([js.Object], [], false))));
				return j;
			} else {
				j.o = j.o[$externalize(evt, $String)]($externalize(((0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0]), $emptyInterface), $externalize(((1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1]), $emptyInterface), $externalize(((2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2]), $emptyInterface));
				return j;
			}
		} else if (_ref$1 === 4) {
			if (isEventFunc) {
				j.o = j.o[$externalize(evt, $String)]($externalize(((0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0]), $emptyInterface), $externalize(((1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1]), $emptyInterface), $externalize(((2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2]), $emptyInterface), $externalize((function(e) {
					$assertType(((3 < 0 || 3 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 3]), ($funcType([Event], [], false)))(new Event.Ptr(e, 0, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, $ifaceNil, 0, "", false, 0, 0, ""));
				}), ($funcType([js.Object], [], false))));
				return j;
			} else {
				j.o = j.o[$externalize(evt, $String)]($externalize(((0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0]), $emptyInterface), $externalize(((1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1]), $emptyInterface), $externalize(((2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2]), $emptyInterface), $externalize(((3 < 0 || 3 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 3]), $emptyInterface));
				return j;
			}
		} else {
			console.log(evt + " event should no have more than 4 arguments");
			j.o = (obj = j.o, obj[$externalize(evt, $String)].apply(obj, $externalize(p, ($sliceType($emptyInterface)))));
			return j;
		}
	};
	JQuery.prototype.events = function(evt, p) { return this.$val.events(evt, p); };
	JQuery.Ptr.prototype.dom2args = function(method, i) {
		var j, _ref, _tuple, selector, selOk, _tuple$1, context, ctxOk, _tuple$2, selector$1, selOk$1;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		_ref = i.$length;
		if (_ref === 2) {
			_tuple = $assertType(((0 < 0 || 0 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 0]), JQuery, true); selector = new JQuery.Ptr(); $copy(selector, _tuple[0], JQuery); selOk = _tuple[1];
			_tuple$1 = $assertType(((1 < 0 || 1 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 1]), JQuery, true); context = new JQuery.Ptr(); $copy(context, _tuple$1[0], JQuery); ctxOk = _tuple$1[1];
			if (!selOk && !ctxOk) {
				j.o = j.o[$externalize(method, $String)]($externalize(((0 < 0 || 0 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 0]), $emptyInterface), $externalize(((1 < 0 || 1 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 1]), $emptyInterface));
				return j;
			} else if (selOk && !ctxOk) {
				j.o = j.o[$externalize(method, $String)](selector.o, $externalize(((1 < 0 || 1 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 1]), $emptyInterface));
				return j;
			} else if (!selOk && ctxOk) {
				j.o = j.o[$externalize(method, $String)]($externalize(((0 < 0 || 0 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 0]), $emptyInterface), context.o);
				return j;
			}
			j.o = j.o[$externalize(method, $String)](selector.o, context.o);
			return j;
		} else if (_ref === 1) {
			_tuple$2 = $assertType(((0 < 0 || 0 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 0]), JQuery, true); selector$1 = new JQuery.Ptr(); $copy(selector$1, _tuple$2[0], JQuery); selOk$1 = _tuple$2[1];
			if (!selOk$1) {
				j.o = j.o[$externalize(method, $String)]($externalize(((0 < 0 || 0 >= i.$length) ? $throwRuntimeError("index out of range") : i.$array[i.$offset + 0]), $emptyInterface));
				return j;
			}
			j.o = j.o[$externalize(method, $String)](selector$1.o);
			return j;
		} else {
			console.log(" only 1 or 2 parameters allowed for method ", method);
			return j;
		}
	};
	JQuery.prototype.dom2args = function(method, i) { return this.$val.dom2args(method, i); };
	JQuery.Ptr.prototype.dom1arg = function(method, i) {
		var j, _tuple, selector, selOk;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		_tuple = $assertType(i, JQuery, true); selector = new JQuery.Ptr(); $copy(selector, _tuple[0], JQuery); selOk = _tuple[1];
		if (!selOk) {
			j.o = j.o[$externalize(method, $String)]($externalize(i, $emptyInterface));
			return j;
		}
		j.o = j.o[$externalize(method, $String)](selector.o);
		return j;
	};
	JQuery.prototype.dom1arg = function(method, i) { return this.$val.dom1arg(method, i); };
	JQuery.Ptr.prototype.Load = function(i) {
		var j, obj;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		j.o = (obj = j.o, obj.load.apply(obj, $externalize(i, ($sliceType($emptyInterface)))));
		return j;
	};
	JQuery.prototype.Load = function(i) { return this.$val.Load(i); };
	JQuery.Ptr.prototype.Serialize = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return $internalize(j.o.serialize(), $String);
	};
	JQuery.prototype.Serialize = function() { return this.$val.Serialize(); };
	JQuery.Ptr.prototype.SerializeArray = function() {
		var j;
		j = new JQuery.Ptr(); $copy(j, this, JQuery);
		return j.o.serializeArray();
	};
	JQuery.prototype.SerializeArray = function() { return this.$val.SerializeArray(); };
	$pkg.$init = function() {
		JQuery.methods = [["Add", "Add", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["AddBack", "AddBack", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["AddClass", "AddClass", "", $funcType([$emptyInterface], [JQuery], false), -1], ["After", "After", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Append", "Append", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["AppendTo", "AppendTo", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Attr", "Attr", "", $funcType([$String], [$String], false), -1], ["Before", "Before", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Blur", "Blur", "", $funcType([], [JQuery], false), -1], ["Children", "Children", "", $funcType([$emptyInterface], [JQuery], false), -1], ["ClearQueue", "ClearQueue", "", $funcType([$String], [JQuery], false), -1], ["Clone", "Clone", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Closest", "Closest", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Contents", "Contents", "", $funcType([], [JQuery], false), -1], ["Css", "Css", "", $funcType([$String], [$String], false), -1], ["CssArray", "CssArray", "", $funcType([($sliceType($String))], [($mapType($String, $emptyInterface))], true), -1], ["Data", "Data", "", $funcType([$String], [$emptyInterface], false), -1], ["Delay", "Delay", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Dequeue", "Dequeue", "", $funcType([$String], [JQuery], false), -1], ["Detach", "Detach", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Each", "Each", "", $funcType([($funcType([$Int, JQuery], [], false))], [JQuery], false), -1], ["Empty", "Empty", "", $funcType([], [JQuery], false), -1], ["End", "End", "", $funcType([], [JQuery], false), -1], ["Eq", "Eq", "", $funcType([$Int], [JQuery], false), -1], ["FadeIn", "FadeIn", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["FadeOut", "FadeOut", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Filter", "Filter", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Find", "Find", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["First", "First", "", $funcType([], [JQuery], false), -1], ["Focus", "Focus", "", $funcType([], [JQuery], false), -1], ["Get", "Get", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), -1], ["Has", "Has", "", $funcType([$String], [JQuery], false), -1], ["HasClass", "HasClass", "", $funcType([$String], [$Bool], false), -1], ["Height", "Height", "", $funcType([], [$Int], false), -1], ["Hide", "Hide", "", $funcType([], [JQuery], false), -1], ["Html", "Html", "", $funcType([], [$String], false), -1], ["InnerHeight", "InnerHeight", "", $funcType([], [$Int], false), -1], ["InnerWidth", "InnerWidth", "", $funcType([], [$Int], false), -1], ["InsertAfter", "InsertAfter", "", $funcType([$emptyInterface], [JQuery], false), -1], ["InsertBefore", "InsertBefore", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Is", "Is", "", $funcType([($sliceType($emptyInterface))], [$Bool], true), -1], ["Last", "Last", "", $funcType([], [JQuery], false), -1], ["Load", "Load", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Next", "Next", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["NextAll", "NextAll", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["NextUntil", "NextUntil", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Not", "Not", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Off", "Off", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Offset", "Offset", "", $funcType([], [JQueryCoordinates], false), -1], ["OffsetParent", "OffsetParent", "", $funcType([], [JQuery], false), -1], ["On", "On", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["One", "One", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["OuterHeight", "OuterHeight", "", $funcType([($sliceType($Bool))], [$Int], true), -1], ["OuterWidth", "OuterWidth", "", $funcType([($sliceType($Bool))], [$Int], true), -1], ["Parent", "Parent", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Parents", "Parents", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["ParentsUntil", "ParentsUntil", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Position", "Position", "", $funcType([], [JQueryCoordinates], false), -1], ["Prepend", "Prepend", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["PrependTo", "PrependTo", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Prev", "Prev", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["PrevAll", "PrevAll", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["PrevUntil", "PrevUntil", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Prop", "Prop", "", $funcType([$String], [$emptyInterface], false), -1], ["Ready", "Ready", "", $funcType([($funcType([], [], false))], [JQuery], false), -1], ["Remove", "Remove", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["RemoveAttr", "RemoveAttr", "", $funcType([$String], [JQuery], false), -1], ["RemoveClass", "RemoveClass", "", $funcType([$String], [JQuery], false), -1], ["RemoveData", "RemoveData", "", $funcType([$String], [JQuery], false), -1], ["RemoveProp", "RemoveProp", "", $funcType([$String], [JQuery], false), -1], ["ReplaceAll", "ReplaceAll", "", $funcType([$emptyInterface], [JQuery], false), -1], ["ReplaceWith", "ReplaceWith", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Resize", "Resize", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Scroll", "Scroll", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["ScrollLeft", "ScrollLeft", "", $funcType([], [$Int], false), -1], ["ScrollTop", "ScrollTop", "", $funcType([], [$Int], false), -1], ["Select", "Select", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Serialize", "Serialize", "", $funcType([], [$String], false), -1], ["SerializeArray", "SerializeArray", "", $funcType([], [js.Object], false), -1], ["SetAttr", "SetAttr", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["SetCss", "SetCss", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["SetData", "SetData", "", $funcType([$String, $emptyInterface], [JQuery], false), -1], ["SetHeight", "SetHeight", "", $funcType([$String], [JQuery], false), -1], ["SetHtml", "SetHtml", "", $funcType([$emptyInterface], [JQuery], false), -1], ["SetOffset", "SetOffset", "", $funcType([JQueryCoordinates], [JQuery], false), -1], ["SetProp", "SetProp", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["SetScrollLeft", "SetScrollLeft", "", $funcType([$Int], [JQuery], false), -1], ["SetScrollTop", "SetScrollTop", "", $funcType([$Int], [JQuery], false), -1], ["SetText", "SetText", "", $funcType([$emptyInterface], [JQuery], false), -1], ["SetVal", "SetVal", "", $funcType([$emptyInterface], [JQuery], false), -1], ["SetWidth", "SetWidth", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Show", "Show", "", $funcType([], [JQuery], false), -1], ["Siblings", "Siblings", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Slice", "Slice", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Stop", "Stop", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Submit", "Submit", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Text", "Text", "", $funcType([], [$String], false), -1], ["ToArray", "ToArray", "", $funcType([], [($sliceType($emptyInterface))], false), -1], ["Toggle", "Toggle", "", $funcType([$Bool], [JQuery], false), -1], ["ToggleClass", "ToggleClass", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Trigger", "Trigger", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Underlying", "Underlying", "", $funcType([], [js.Object], false), -1], ["Unwrap", "Unwrap", "", $funcType([], [JQuery], false), -1], ["Val", "Val", "", $funcType([], [$String], false), -1], ["Width", "Width", "", $funcType([], [$Int], false), -1], ["Wrap", "Wrap", "", $funcType([$emptyInterface], [JQuery], false), -1], ["WrapAll", "WrapAll", "", $funcType([$emptyInterface], [JQuery], false), -1], ["WrapInner", "WrapInner", "", $funcType([$emptyInterface], [JQuery], false), -1], ["dom1arg", "dom1arg", "github.com/gopherjs/jquery", $funcType([$String, $emptyInterface], [JQuery], false), -1], ["dom2args", "dom2args", "github.com/gopherjs/jquery", $funcType([$String, ($sliceType($emptyInterface))], [JQuery], true), -1], ["events", "events", "github.com/gopherjs/jquery", $funcType([$String, ($sliceType($emptyInterface))], [JQuery], true), -1], ["handleEvent", "handleEvent", "github.com/gopherjs/jquery", $funcType([$String, ($sliceType($emptyInterface))], [JQuery], true), -1]];
		($ptrType(JQuery)).methods = [["Add", "Add", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["AddBack", "AddBack", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["AddClass", "AddClass", "", $funcType([$emptyInterface], [JQuery], false), -1], ["After", "After", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Append", "Append", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["AppendTo", "AppendTo", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Attr", "Attr", "", $funcType([$String], [$String], false), -1], ["Before", "Before", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Blur", "Blur", "", $funcType([], [JQuery], false), -1], ["Children", "Children", "", $funcType([$emptyInterface], [JQuery], false), -1], ["ClearQueue", "ClearQueue", "", $funcType([$String], [JQuery], false), -1], ["Clone", "Clone", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Closest", "Closest", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Contents", "Contents", "", $funcType([], [JQuery], false), -1], ["Css", "Css", "", $funcType([$String], [$String], false), -1], ["CssArray", "CssArray", "", $funcType([($sliceType($String))], [($mapType($String, $emptyInterface))], true), -1], ["Data", "Data", "", $funcType([$String], [$emptyInterface], false), -1], ["Delay", "Delay", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Dequeue", "Dequeue", "", $funcType([$String], [JQuery], false), -1], ["Detach", "Detach", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Each", "Each", "", $funcType([($funcType([$Int, JQuery], [], false))], [JQuery], false), -1], ["Empty", "Empty", "", $funcType([], [JQuery], false), -1], ["End", "End", "", $funcType([], [JQuery], false), -1], ["Eq", "Eq", "", $funcType([$Int], [JQuery], false), -1], ["FadeIn", "FadeIn", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["FadeOut", "FadeOut", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Filter", "Filter", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Find", "Find", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["First", "First", "", $funcType([], [JQuery], false), -1], ["Focus", "Focus", "", $funcType([], [JQuery], false), -1], ["Get", "Get", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), -1], ["Has", "Has", "", $funcType([$String], [JQuery], false), -1], ["HasClass", "HasClass", "", $funcType([$String], [$Bool], false), -1], ["Height", "Height", "", $funcType([], [$Int], false), -1], ["Hide", "Hide", "", $funcType([], [JQuery], false), -1], ["Html", "Html", "", $funcType([], [$String], false), -1], ["InnerHeight", "InnerHeight", "", $funcType([], [$Int], false), -1], ["InnerWidth", "InnerWidth", "", $funcType([], [$Int], false), -1], ["InsertAfter", "InsertAfter", "", $funcType([$emptyInterface], [JQuery], false), -1], ["InsertBefore", "InsertBefore", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Is", "Is", "", $funcType([($sliceType($emptyInterface))], [$Bool], true), -1], ["Last", "Last", "", $funcType([], [JQuery], false), -1], ["Load", "Load", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Next", "Next", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["NextAll", "NextAll", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["NextUntil", "NextUntil", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Not", "Not", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Off", "Off", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Offset", "Offset", "", $funcType([], [JQueryCoordinates], false), -1], ["OffsetParent", "OffsetParent", "", $funcType([], [JQuery], false), -1], ["On", "On", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["One", "One", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["OuterHeight", "OuterHeight", "", $funcType([($sliceType($Bool))], [$Int], true), -1], ["OuterWidth", "OuterWidth", "", $funcType([($sliceType($Bool))], [$Int], true), -1], ["Parent", "Parent", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Parents", "Parents", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["ParentsUntil", "ParentsUntil", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Position", "Position", "", $funcType([], [JQueryCoordinates], false), -1], ["Prepend", "Prepend", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["PrependTo", "PrependTo", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Prev", "Prev", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["PrevAll", "PrevAll", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["PrevUntil", "PrevUntil", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Prop", "Prop", "", $funcType([$String], [$emptyInterface], false), -1], ["Ready", "Ready", "", $funcType([($funcType([], [], false))], [JQuery], false), -1], ["Remove", "Remove", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["RemoveAttr", "RemoveAttr", "", $funcType([$String], [JQuery], false), -1], ["RemoveClass", "RemoveClass", "", $funcType([$String], [JQuery], false), -1], ["RemoveData", "RemoveData", "", $funcType([$String], [JQuery], false), -1], ["RemoveProp", "RemoveProp", "", $funcType([$String], [JQuery], false), -1], ["ReplaceAll", "ReplaceAll", "", $funcType([$emptyInterface], [JQuery], false), -1], ["ReplaceWith", "ReplaceWith", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Resize", "Resize", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Scroll", "Scroll", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["ScrollLeft", "ScrollLeft", "", $funcType([], [$Int], false), -1], ["ScrollTop", "ScrollTop", "", $funcType([], [$Int], false), -1], ["Select", "Select", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Serialize", "Serialize", "", $funcType([], [$String], false), -1], ["SerializeArray", "SerializeArray", "", $funcType([], [js.Object], false), -1], ["SetAttr", "SetAttr", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["SetCss", "SetCss", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["SetData", "SetData", "", $funcType([$String, $emptyInterface], [JQuery], false), -1], ["SetHeight", "SetHeight", "", $funcType([$String], [JQuery], false), -1], ["SetHtml", "SetHtml", "", $funcType([$emptyInterface], [JQuery], false), -1], ["SetOffset", "SetOffset", "", $funcType([JQueryCoordinates], [JQuery], false), -1], ["SetProp", "SetProp", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["SetScrollLeft", "SetScrollLeft", "", $funcType([$Int], [JQuery], false), -1], ["SetScrollTop", "SetScrollTop", "", $funcType([$Int], [JQuery], false), -1], ["SetText", "SetText", "", $funcType([$emptyInterface], [JQuery], false), -1], ["SetVal", "SetVal", "", $funcType([$emptyInterface], [JQuery], false), -1], ["SetWidth", "SetWidth", "", $funcType([$emptyInterface], [JQuery], false), -1], ["Show", "Show", "", $funcType([], [JQuery], false), -1], ["Siblings", "Siblings", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Slice", "Slice", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Stop", "Stop", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Submit", "Submit", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Text", "Text", "", $funcType([], [$String], false), -1], ["ToArray", "ToArray", "", $funcType([], [($sliceType($emptyInterface))], false), -1], ["Toggle", "Toggle", "", $funcType([$Bool], [JQuery], false), -1], ["ToggleClass", "ToggleClass", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Trigger", "Trigger", "", $funcType([($sliceType($emptyInterface))], [JQuery], true), -1], ["Underlying", "Underlying", "", $funcType([], [js.Object], false), -1], ["Unwrap", "Unwrap", "", $funcType([], [JQuery], false), -1], ["Val", "Val", "", $funcType([], [$String], false), -1], ["Width", "Width", "", $funcType([], [$Int], false), -1], ["Wrap", "Wrap", "", $funcType([$emptyInterface], [JQuery], false), -1], ["WrapAll", "WrapAll", "", $funcType([$emptyInterface], [JQuery], false), -1], ["WrapInner", "WrapInner", "", $funcType([$emptyInterface], [JQuery], false), -1], ["dom1arg", "dom1arg", "github.com/gopherjs/jquery", $funcType([$String, $emptyInterface], [JQuery], false), -1], ["dom2args", "dom2args", "github.com/gopherjs/jquery", $funcType([$String, ($sliceType($emptyInterface))], [JQuery], true), -1], ["events", "events", "github.com/gopherjs/jquery", $funcType([$String, ($sliceType($emptyInterface))], [JQuery], true), -1], ["handleEvent", "handleEvent", "github.com/gopherjs/jquery", $funcType([$String, ($sliceType($emptyInterface))], [JQuery], true), -1]];
		JQuery.init([["o", "o", "github.com/gopherjs/jquery", js.Object, ""], ["Jquery", "Jquery", "", $String, "js:\"jquery\""], ["Selector", "Selector", "", $String, "js:\"selector\""], ["Length", "Length", "", $Int, "js:\"length\""], ["Context", "Context", "", $String, "js:\"context\""]]);
		Event.methods = [["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [js.Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [js.Object], false), 0], ["Index", "Index", "", $funcType([$Int], [js.Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		($ptrType(Event)).methods = [["Bool", "Bool", "", $funcType([], [$Bool], false), 0], ["Call", "Call", "", $funcType([$String, ($sliceType($emptyInterface))], [js.Object], true), 0], ["Delete", "Delete", "", $funcType([$String], [], false), 0], ["Float", "Float", "", $funcType([], [$Float64], false), 0], ["Get", "Get", "", $funcType([$String], [js.Object], false), 0], ["Index", "Index", "", $funcType([$Int], [js.Object], false), 0], ["Int", "Int", "", $funcType([], [$Int], false), 0], ["Int64", "Int64", "", $funcType([], [$Int64], false), 0], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), 0], ["Invoke", "Invoke", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["IsDefaultPrevented", "IsDefaultPrevented", "", $funcType([], [$Bool], false), -1], ["IsImmediatePropogationStopped", "IsImmediatePropogationStopped", "", $funcType([], [$Bool], false), -1], ["IsNull", "IsNull", "", $funcType([], [$Bool], false), 0], ["IsPropagationStopped", "IsPropagationStopped", "", $funcType([], [$Bool], false), -1], ["IsUndefined", "IsUndefined", "", $funcType([], [$Bool], false), 0], ["Length", "Length", "", $funcType([], [$Int], false), 0], ["New", "New", "", $funcType([($sliceType($emptyInterface))], [js.Object], true), 0], ["PreventDefault", "PreventDefault", "", $funcType([], [], false), -1], ["Set", "Set", "", $funcType([$String, $emptyInterface], [], false), 0], ["SetIndex", "SetIndex", "", $funcType([$Int, $emptyInterface], [], false), 0], ["StopImmediatePropagation", "StopImmediatePropagation", "", $funcType([], [], false), -1], ["StopPropagation", "StopPropagation", "", $funcType([], [], false), -1], ["Str", "Str", "", $funcType([], [$String], false), 0], ["Uint64", "Uint64", "", $funcType([], [$Uint64], false), 0], ["Unsafe", "Unsafe", "", $funcType([], [$Uintptr], false), 0]];
		Event.init([["Object", "", "", js.Object, ""], ["KeyCode", "KeyCode", "", $Int, "js:\"keyCode\""], ["Target", "Target", "", js.Object, "js:\"target\""], ["CurrentTarget", "CurrentTarget", "", js.Object, "js:\"currentTarget\""], ["DelegateTarget", "DelegateTarget", "", js.Object, "js:\"delegateTarget\""], ["RelatedTarget", "RelatedTarget", "", js.Object, "js:\"relatedTarget\""], ["Data", "Data", "", js.Object, "js:\"data\""], ["Result", "Result", "", js.Object, "js:\"result\""], ["Which", "Which", "", $Int, "js:\"which\""], ["Namespace", "Namespace", "", $String, "js:\"namespace\""], ["MetaKey", "MetaKey", "", $Bool, "js:\"metaKey\""], ["PageX", "PageX", "", $Int, "js:\"pageX\""], ["PageY", "PageY", "", $Int, "js:\"pageY\""], ["Type", "Type", "", $String, "js:\"type\""]]);
		JQueryCoordinates.init([["Left", "Left", "", $Int, ""], ["Top", "Top", "", $Int, ""]]);
	};
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], math, zero, negInf, nan, pow10tab, init, Ldexp, Float32bits, Float32frombits, init$1;
	init = function() {
		Float32bits(0);
		Float32frombits(0);
	};
	Ldexp = $pkg.Ldexp = function(frac, exp$1) {
		if (frac === 0) {
			return frac;
		}
		if (exp$1 >= 1024) {
			return frac * $parseFloat(math.pow(2, 1023)) * $parseFloat(math.pow(2, exp$1 - 1023 >> 0));
		}
		if (exp$1 <= -1024) {
			return frac * $parseFloat(math.pow(2, -1023)) * $parseFloat(math.pow(2, exp$1 + 1023 >> 0));
		}
		return frac * $parseFloat(math.pow(2, exp$1));
	};
	Float32bits = $pkg.Float32bits = function(f) {
		var s, e, r;
		if ($float32IsEqual(f, 0)) {
			if ($float32IsEqual(1 / f, negInf)) {
				return 2147483648;
			}
			return 0;
		}
		if (!(($float32IsEqual(f, f)))) {
			return 2143289344;
		}
		s = 0;
		if (f < 0) {
			s = 2147483648;
			f = -f;
		}
		e = 150;
		while (f >= 1.6777216e+07) {
			f = f / (2);
			if (e === 255) {
				break;
			}
			e = e + (1) >>> 0;
		}
		while (f < 8.388608e+06) {
			e = e - (1) >>> 0;
			if (e === 0) {
				break;
			}
			f = f * (2);
		}
		r = $parseFloat($mod(f, 2));
		if ((r > 0.5 && r < 1) || r >= 1.5) {
			f = f + (1);
		}
		return (((s | (e << 23 >>> 0)) >>> 0) | (((f >> 0) & ~8388608))) >>> 0;
	};
	Float32frombits = $pkg.Float32frombits = function(b) {
		var s, e, m;
		s = 1;
		if (!((((b & 2147483648) >>> 0) === 0))) {
			s = -1;
		}
		e = (((b >>> 23 >>> 0)) & 255) >>> 0;
		m = (b & 8388607) >>> 0;
		if (e === 255) {
			if (m === 0) {
				return s / 0;
			}
			return nan;
		}
		if (!((e === 0))) {
			m = m + (8388608) >>> 0;
		}
		if (e === 0) {
			e = 1;
		}
		return Ldexp(m, ((e >> 0) - 127 >> 0) - 23 >> 0) * s;
	};
	init$1 = function() {
		var i, _q, m, x;
		pow10tab[0] = 1;
		pow10tab[1] = 10;
		i = 2;
		while (i < 70) {
			m = (_q = i / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero"));
			(i < 0 || i >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[i] = ((m < 0 || m >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[m]) * (x = i - m >> 0, ((x < 0 || x >= pow10tab.length) ? $throwRuntimeError("index out of range") : pow10tab[x]));
			i = i + (1) >> 0;
		}
	};
	$pkg.$init = function() {
		pow10tab = ($arrayType($Float64, 70)).zero();
		math = $global.Math;
		zero = 0;
		negInf = -1 / zero;
		nan = 0 / zero;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, errorString, New;
	errorString = $pkg.errorString = $newType(0, "Struct", "errors.errorString", "errorString", "errors", function(s_) {
		this.$val = this;
		this.s = s_ !== undefined ? s_ : "";
	});
	New = $pkg.New = function(text) {
		return new errorString.Ptr(text);
	};
	errorString.Ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	$pkg.$init = function() {
		($ptrType(errorString)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		errorString.init([["s", "s", "errors", $String, ""]]);
	};
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, decodeRuneInStringInternal, DecodeRuneInString, EncodeRune;
	decodeRuneInStringInternal = function(s) {
		var r = 0, size = 0, short$1 = false, n, _tmp, _tmp$1, _tmp$2, c0, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, c1, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$20, _tmp$21, _tmp$22, _tmp$23, c2, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, c3, _tmp$39, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$50;
		n = s.length;
		if (n < 1) {
			_tmp = 65533; _tmp$1 = 0; _tmp$2 = true; r = _tmp; size = _tmp$1; short$1 = _tmp$2;
			return [r, size, short$1];
		}
		c0 = s.charCodeAt(0);
		if (c0 < 128) {
			_tmp$3 = (c0 >> 0); _tmp$4 = 1; _tmp$5 = false; r = _tmp$3; size = _tmp$4; short$1 = _tmp$5;
			return [r, size, short$1];
		}
		if (c0 < 192) {
			_tmp$6 = 65533; _tmp$7 = 1; _tmp$8 = false; r = _tmp$6; size = _tmp$7; short$1 = _tmp$8;
			return [r, size, short$1];
		}
		if (n < 2) {
			_tmp$9 = 65533; _tmp$10 = 1; _tmp$11 = true; r = _tmp$9; size = _tmp$10; short$1 = _tmp$11;
			return [r, size, short$1];
		}
		c1 = s.charCodeAt(1);
		if (c1 < 128 || 192 <= c1) {
			_tmp$12 = 65533; _tmp$13 = 1; _tmp$14 = false; r = _tmp$12; size = _tmp$13; short$1 = _tmp$14;
			return [r, size, short$1];
		}
		if (c0 < 224) {
			r = ((((c0 & 31) >>> 0) >> 0) << 6 >> 0) | (((c1 & 63) >>> 0) >> 0);
			if (r <= 127) {
				_tmp$15 = 65533; _tmp$16 = 1; _tmp$17 = false; r = _tmp$15; size = _tmp$16; short$1 = _tmp$17;
				return [r, size, short$1];
			}
			_tmp$18 = r; _tmp$19 = 2; _tmp$20 = false; r = _tmp$18; size = _tmp$19; short$1 = _tmp$20;
			return [r, size, short$1];
		}
		if (n < 3) {
			_tmp$21 = 65533; _tmp$22 = 1; _tmp$23 = true; r = _tmp$21; size = _tmp$22; short$1 = _tmp$23;
			return [r, size, short$1];
		}
		c2 = s.charCodeAt(2);
		if (c2 < 128 || 192 <= c2) {
			_tmp$24 = 65533; _tmp$25 = 1; _tmp$26 = false; r = _tmp$24; size = _tmp$25; short$1 = _tmp$26;
			return [r, size, short$1];
		}
		if (c0 < 240) {
			r = (((((c0 & 15) >>> 0) >> 0) << 12 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c2 & 63) >>> 0) >> 0);
			if (r <= 2047) {
				_tmp$27 = 65533; _tmp$28 = 1; _tmp$29 = false; r = _tmp$27; size = _tmp$28; short$1 = _tmp$29;
				return [r, size, short$1];
			}
			if (55296 <= r && r <= 57343) {
				_tmp$30 = 65533; _tmp$31 = 1; _tmp$32 = false; r = _tmp$30; size = _tmp$31; short$1 = _tmp$32;
				return [r, size, short$1];
			}
			_tmp$33 = r; _tmp$34 = 3; _tmp$35 = false; r = _tmp$33; size = _tmp$34; short$1 = _tmp$35;
			return [r, size, short$1];
		}
		if (n < 4) {
			_tmp$36 = 65533; _tmp$37 = 1; _tmp$38 = true; r = _tmp$36; size = _tmp$37; short$1 = _tmp$38;
			return [r, size, short$1];
		}
		c3 = s.charCodeAt(3);
		if (c3 < 128 || 192 <= c3) {
			_tmp$39 = 65533; _tmp$40 = 1; _tmp$41 = false; r = _tmp$39; size = _tmp$40; short$1 = _tmp$41;
			return [r, size, short$1];
		}
		if (c0 < 248) {
			r = ((((((c0 & 7) >>> 0) >> 0) << 18 >> 0) | ((((c1 & 63) >>> 0) >> 0) << 12 >> 0)) | ((((c2 & 63) >>> 0) >> 0) << 6 >> 0)) | (((c3 & 63) >>> 0) >> 0);
			if (r <= 65535 || 1114111 < r) {
				_tmp$42 = 65533; _tmp$43 = 1; _tmp$44 = false; r = _tmp$42; size = _tmp$43; short$1 = _tmp$44;
				return [r, size, short$1];
			}
			_tmp$45 = r; _tmp$46 = 4; _tmp$47 = false; r = _tmp$45; size = _tmp$46; short$1 = _tmp$47;
			return [r, size, short$1];
		}
		_tmp$48 = 65533; _tmp$49 = 1; _tmp$50 = false; r = _tmp$48; size = _tmp$49; short$1 = _tmp$50;
		return [r, size, short$1];
	};
	DecodeRuneInString = $pkg.DecodeRuneInString = function(s) {
		var r = 0, size = 0, _tuple;
		_tuple = decodeRuneInStringInternal(s); r = _tuple[0]; size = _tuple[1];
		return [r, size];
	};
	EncodeRune = $pkg.EncodeRune = function(p, r) {
		var i;
		i = (r >>> 0);
		if (i <= 127) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (r << 24 >>> 24);
			return 1;
		} else if (i <= 2047) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (192 | ((r >> 6 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 2;
		} else if (i > 1114111 || 55296 <= i && i <= 57343) {
			r = 65533;
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (224 | ((r >> 12 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 3;
		} else if (i <= 65535) {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (224 | ((r >> 12 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 3;
		} else {
			(0 < 0 || 0 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 0] = (240 | ((r >> 18 >> 0) << 24 >>> 24)) >>> 0;
			(1 < 0 || 1 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 1] = (128 | ((((r >> 12 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(2 < 0 || 2 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 2] = (128 | ((((r >> 6 >> 0) << 24 >>> 24) & 63) >>> 0)) >>> 0;
			(3 < 0 || 3 >= p.$length) ? $throwRuntimeError("index out of range") : p.$array[p.$offset + 3] = (128 | (((r << 24 >>> 24) & 63) >>> 0)) >>> 0;
			return 4;
		}
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, math = $packages["math"], errors = $packages["errors"], utf8 = $packages["unicode/utf8"], shifts, FormatInt, Itoa, formatBits, unhex, UnquoteChar, Unquote, contains;
	FormatInt = $pkg.FormatInt = function(i, base) {
		var _tuple, s;
		_tuple = formatBits(($sliceType($Uint8)).nil, new $Uint64(i.$high, i.$low), base, (i.$high < 0 || (i.$high === 0 && i.$low < 0)), false); s = _tuple[1];
		return s;
	};
	Itoa = $pkg.Itoa = function(i) {
		return FormatInt(new $Int64(0, i), 10);
	};
	formatBits = function(dst, u, base, neg, append_) {
		var d = ($sliceType($Uint8)).nil, s = "", a, i, q, x, j, x$1, x$2, q$1, x$3, s$1, b, m, b$1;
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = ($arrayType($Uint8, 65)).zero(); $copy(a, ($arrayType($Uint8, 65)).zero(), ($arrayType($Uint8, 65)));
		i = 65;
		if (neg) {
			u = new $Uint64(-u.$high, -u.$low);
		}
		if (base === 10) {
			while ((u.$high > 0 || (u.$high === 0 && u.$low >= 100))) {
				i = i - (2) >> 0;
				q = $div64(u, new $Uint64(0, 100), false);
				j = ((x = $mul64(q, new $Uint64(0, 100)), new $Uint64(u.$high - x.$high, u.$low - x.$low)).$low >>> 0);
				(x$1 = i + 1 >> 0, (x$1 < 0 || x$1 >= a.length) ? $throwRuntimeError("index out of range") : a[x$1] = "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789".charCodeAt(j));
				(x$2 = i + 0 >> 0, (x$2 < 0 || x$2 >= a.length) ? $throwRuntimeError("index out of range") : a[x$2] = "0000000000111111111122222222223333333333444444444455555555556666666666777777777788888888889999999999".charCodeAt(j));
				u = q;
			}
			if ((u.$high > 0 || (u.$high === 0 && u.$low >= 10))) {
				i = i - (1) >> 0;
				q$1 = $div64(u, new $Uint64(0, 10), false);
				(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(((x$3 = $mul64(q$1, new $Uint64(0, 10)), new $Uint64(u.$high - x$3.$high, u.$low - x$3.$low)).$low >>> 0));
				u = q$1;
			}
		} else {
			s$1 = ((base < 0 || base >= shifts.length) ? $throwRuntimeError("index out of range") : shifts[base]);
			if (s$1 > 0) {
				b = new $Uint64(0, base);
				m = (b.$low >>> 0) - 1 >>> 0;
				while ((u.$high > b.$high || (u.$high === b.$high && u.$low >= b.$low))) {
					i = i - (1) >> 0;
					(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((((u.$low >>> 0) & m) >>> 0));
					u = $shiftRightUint64(u, (s$1));
				}
			} else {
				b$1 = new $Uint64(0, base);
				while ((u.$high > b$1.$high || (u.$high === b$1.$high && u.$low >= b$1.$low))) {
					i = i - (1) >> 0;
					(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt(($div64(u, b$1, true).$low >>> 0));
					u = $div64(u, (b$1), false);
				}
			}
		}
		i = i - (1) >> 0;
		(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = "0123456789abcdefghijklmnopqrstuvwxyz".charCodeAt((u.$low >>> 0));
		if (neg) {
			i = i - (1) >> 0;
			(i < 0 || i >= a.length) ? $throwRuntimeError("index out of range") : a[i] = 45;
		}
		if (append_) {
			d = $appendSlice(dst, $subslice(new ($sliceType($Uint8))(a), i));
			return [d, s];
		}
		s = $bytesToString($subslice(new ($sliceType($Uint8))(a), i));
		return [d, s];
	};
	unhex = function(b) {
		var v = 0, ok = false, c, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5;
		c = (b >> 0);
		if (48 <= c && c <= 57) {
			_tmp = c - 48 >> 0; _tmp$1 = true; v = _tmp; ok = _tmp$1;
			return [v, ok];
		} else if (97 <= c && c <= 102) {
			_tmp$2 = (c - 97 >> 0) + 10 >> 0; _tmp$3 = true; v = _tmp$2; ok = _tmp$3;
			return [v, ok];
		} else if (65 <= c && c <= 70) {
			_tmp$4 = (c - 65 >> 0) + 10 >> 0; _tmp$5 = true; v = _tmp$4; ok = _tmp$5;
			return [v, ok];
		}
		return [v, ok];
	};
	UnquoteChar = $pkg.UnquoteChar = function(s, quote) {
		var value = 0, multibyte = false, tail = "", err = $ifaceNil, c, _tuple, r, size, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, c$1, _ref, n, _ref$1, v, j, _tuple$1, x, ok, v$1, j$1, x$1;
		c = s.charCodeAt(0);
		if ((c === quote) && ((quote === 39) || (quote === 34))) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		} else if (c >= 128) {
			_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; size = _tuple[1];
			_tmp = r; _tmp$1 = true; _tmp$2 = s.substring(size); _tmp$3 = $ifaceNil; value = _tmp; multibyte = _tmp$1; tail = _tmp$2; err = _tmp$3;
			return [value, multibyte, tail, err];
		} else if (!((c === 92))) {
			_tmp$4 = (s.charCodeAt(0) >> 0); _tmp$5 = false; _tmp$6 = s.substring(1); _tmp$7 = $ifaceNil; value = _tmp$4; multibyte = _tmp$5; tail = _tmp$6; err = _tmp$7;
			return [value, multibyte, tail, err];
		}
		if (s.length <= 1) {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		}
		c$1 = s.charCodeAt(1);
		s = s.substring(2);
		_ref = c$1;
		switch (0) { default: if (_ref === 97) {
			value = 7;
		} else if (_ref === 98) {
			value = 8;
		} else if (_ref === 102) {
			value = 12;
		} else if (_ref === 110) {
			value = 10;
		} else if (_ref === 114) {
			value = 13;
		} else if (_ref === 116) {
			value = 9;
		} else if (_ref === 118) {
			value = 11;
		} else if (_ref === 120 || _ref === 117 || _ref === 85) {
			n = 0;
			_ref$1 = c$1;
			if (_ref$1 === 120) {
				n = 2;
			} else if (_ref$1 === 117) {
				n = 4;
			} else if (_ref$1 === 85) {
				n = 8;
			}
			v = 0;
			if (s.length < n) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			j = 0;
			while (j < n) {
				_tuple$1 = unhex(s.charCodeAt(j)); x = _tuple$1[0]; ok = _tuple$1[1];
				if (!ok) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				v = (v << 4 >> 0) | x;
				j = j + (1) >> 0;
			}
			s = s.substring(n);
			if (c$1 === 120) {
				value = v;
				break;
			}
			if (v > 1114111) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			value = v;
			multibyte = true;
		} else if (_ref === 48 || _ref === 49 || _ref === 50 || _ref === 51 || _ref === 52 || _ref === 53 || _ref === 54 || _ref === 55) {
			v$1 = (c$1 >> 0) - 48 >> 0;
			if (s.length < 2) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			j$1 = 0;
			while (j$1 < 2) {
				x$1 = (s.charCodeAt(j$1) >> 0) - 48 >> 0;
				if (x$1 < 0 || x$1 > 7) {
					err = $pkg.ErrSyntax;
					return [value, multibyte, tail, err];
				}
				v$1 = ((v$1 << 3 >> 0)) | x$1;
				j$1 = j$1 + (1) >> 0;
			}
			s = s.substring(2);
			if (v$1 > 255) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			value = v$1;
		} else if (_ref === 92) {
			value = 92;
		} else if (_ref === 39 || _ref === 34) {
			if (!((c$1 === quote))) {
				err = $pkg.ErrSyntax;
				return [value, multibyte, tail, err];
			}
			value = (c$1 >> 0);
		} else {
			err = $pkg.ErrSyntax;
			return [value, multibyte, tail, err];
		} }
		tail = s;
		return [value, multibyte, tail, err];
	};
	Unquote = $pkg.Unquote = function(s) {
		var t = "", err = $ifaceNil, n, _tmp, _tmp$1, quote, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tmp$10, _tmp$11, _ref, _tmp$12, _tmp$13, _tuple, r, size, _tmp$14, _tmp$15, runeTmp, _q, x, buf, _tuple$1, c, multibyte, ss, err$1, _tmp$16, _tmp$17, n$1, _tmp$18, _tmp$19, _tmp$20, _tmp$21;
		n = s.length;
		if (n < 2) {
			_tmp = ""; _tmp$1 = $pkg.ErrSyntax; t = _tmp; err = _tmp$1;
			return [t, err];
		}
		quote = s.charCodeAt(0);
		if (!((quote === s.charCodeAt((n - 1 >> 0))))) {
			_tmp$2 = ""; _tmp$3 = $pkg.ErrSyntax; t = _tmp$2; err = _tmp$3;
			return [t, err];
		}
		s = s.substring(1, (n - 1 >> 0));
		if (quote === 96) {
			if (contains(s, 96)) {
				_tmp$4 = ""; _tmp$5 = $pkg.ErrSyntax; t = _tmp$4; err = _tmp$5;
				return [t, err];
			}
			_tmp$6 = s; _tmp$7 = $ifaceNil; t = _tmp$6; err = _tmp$7;
			return [t, err];
		}
		if (!((quote === 34)) && !((quote === 39))) {
			_tmp$8 = ""; _tmp$9 = $pkg.ErrSyntax; t = _tmp$8; err = _tmp$9;
			return [t, err];
		}
		if (contains(s, 10)) {
			_tmp$10 = ""; _tmp$11 = $pkg.ErrSyntax; t = _tmp$10; err = _tmp$11;
			return [t, err];
		}
		if (!contains(s, 92) && !contains(s, quote)) {
			_ref = quote;
			if (_ref === 34) {
				_tmp$12 = s; _tmp$13 = $ifaceNil; t = _tmp$12; err = _tmp$13;
				return [t, err];
			} else if (_ref === 39) {
				_tuple = utf8.DecodeRuneInString(s); r = _tuple[0]; size = _tuple[1];
				if ((size === s.length) && (!((r === 65533)) || !((size === 1)))) {
					_tmp$14 = s; _tmp$15 = $ifaceNil; t = _tmp$14; err = _tmp$15;
					return [t, err];
				}
			}
		}
		runeTmp = ($arrayType($Uint8, 4)).zero(); $copy(runeTmp, ($arrayType($Uint8, 4)).zero(), ($arrayType($Uint8, 4)));
		buf = ($sliceType($Uint8)).make(0, (_q = (x = s.length, (((3 >>> 16 << 16) * x >> 0) + (3 << 16 >>> 16) * x) >> 0) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
		while (s.length > 0) {
			_tuple$1 = UnquoteChar(s, quote); c = _tuple$1[0]; multibyte = _tuple$1[1]; ss = _tuple$1[2]; err$1 = _tuple$1[3];
			if (!($interfaceIsEqual(err$1, $ifaceNil))) {
				_tmp$16 = ""; _tmp$17 = err$1; t = _tmp$16; err = _tmp$17;
				return [t, err];
			}
			s = ss;
			if (c < 128 || !multibyte) {
				buf = $append(buf, (c << 24 >>> 24));
			} else {
				n$1 = utf8.EncodeRune(new ($sliceType($Uint8))(runeTmp), c);
				buf = $appendSlice(buf, $subslice(new ($sliceType($Uint8))(runeTmp), 0, n$1));
			}
			if ((quote === 39) && !((s.length === 0))) {
				_tmp$18 = ""; _tmp$19 = $pkg.ErrSyntax; t = _tmp$18; err = _tmp$19;
				return [t, err];
			}
		}
		_tmp$20 = $bytesToString(buf); _tmp$21 = $ifaceNil; t = _tmp$20; err = _tmp$21;
		return [t, err];
	};
	contains = function(s, c) {
		var i;
		i = 0;
		while (i < s.length) {
			if (s.charCodeAt(i) === c) {
				return true;
			}
			i = i + (1) >> 0;
		}
		return false;
	};
	$pkg.$init = function() {
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		shifts = $toNativeArray("Uint", [0, 0, 1, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0]);
	};
	return $pkg;
})();
$packages["sync/atomic"] = (function() {
	var $pkg = {}, CompareAndSwapInt32, AddInt32;
	CompareAndSwapInt32 = $pkg.CompareAndSwapInt32 = function(addr, old, new$1) {
		if (addr.$get() === old) {
			addr.$set(new$1);
			return true;
		}
		return false;
	};
	AddInt32 = $pkg.AddInt32 = function(addr, delta) {
		var new$1;
		new$1 = addr.$get() + delta >> 0;
		addr.$set(new$1);
		return new$1;
	};
	$pkg.$init = function() {
	};
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, atomic = $packages["sync/atomic"], runtime = $packages["runtime"], Pool, Mutex, poolLocal, syncSema, allPools, runtime_registerPoolCleanup, runtime_Syncsemcheck, poolCleanup, init, indexLocal, runtime_Semacquire, runtime_Semrelease, init$1;
	Pool = $pkg.Pool = $newType(0, "Struct", "sync.Pool", "Pool", "sync", function(local_, localSize_, store_, New_) {
		this.$val = this;
		this.local = local_ !== undefined ? local_ : 0;
		this.localSize = localSize_ !== undefined ? localSize_ : 0;
		this.store = store_ !== undefined ? store_ : ($sliceType($emptyInterface)).nil;
		this.New = New_ !== undefined ? New_ : $throwNilPointerError;
	});
	Mutex = $pkg.Mutex = $newType(0, "Struct", "sync.Mutex", "Mutex", "sync", function(state_, sema_) {
		this.$val = this;
		this.state = state_ !== undefined ? state_ : 0;
		this.sema = sema_ !== undefined ? sema_ : 0;
	});
	poolLocal = $pkg.poolLocal = $newType(0, "Struct", "sync.poolLocal", "poolLocal", "sync", function(private$0_, shared_, Mutex_, pad_) {
		this.$val = this;
		this.private$0 = private$0_ !== undefined ? private$0_ : $ifaceNil;
		this.shared = shared_ !== undefined ? shared_ : ($sliceType($emptyInterface)).nil;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new Mutex.Ptr();
		this.pad = pad_ !== undefined ? pad_ : ($arrayType($Uint8, 128)).zero();
	});
	syncSema = $pkg.syncSema = $newType(12, "Array", "sync.syncSema", "syncSema", "sync", null);
	Pool.Ptr.prototype.Get = function() {
		var p, x, x$1, x$2;
		p = this;
		if (p.store.$length === 0) {
			if (!(p.New === $throwNilPointerError)) {
				return p.New();
			}
			return $ifaceNil;
		}
		x$2 = (x = p.store, x$1 = p.store.$length - 1 >> 0, ((x$1 < 0 || x$1 >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + x$1]));
		p.store = $subslice(p.store, 0, (p.store.$length - 1 >> 0));
		return x$2;
	};
	Pool.prototype.Get = function() { return this.$val.Get(); };
	Pool.Ptr.prototype.Put = function(x) {
		var p;
		p = this;
		if ($interfaceIsEqual(x, $ifaceNil)) {
			return;
		}
		p.store = $append(p.store, x);
	};
	Pool.prototype.Put = function(x) { return this.$val.Put(x); };
	runtime_registerPoolCleanup = function(cleanup) {
	};
	runtime_Syncsemcheck = function(size) {
	};
	Mutex.Ptr.prototype.Lock = function() {
		var m, awoke, old, new$1;
		m = this;
		if (atomic.CompareAndSwapInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), 0, 1)) {
			return;
		}
		awoke = false;
		while (true) {
			old = m.state;
			new$1 = old | 1;
			if (!(((old & 1) === 0))) {
				new$1 = old + 4 >> 0;
			}
			if (awoke) {
				new$1 = new$1 & ~(2);
			}
			if (atomic.CompareAndSwapInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				if ((old & 1) === 0) {
					break;
				}
				runtime_Semacquire(new ($ptrType($Uint32))(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				awoke = true;
			}
		}
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.Ptr.prototype.Unlock = function() {
		var m, new$1, old;
		m = this;
		new$1 = atomic.AddInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), -1);
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			$panic(new $String("sync: unlock of unlocked mutex"));
		}
		old = new$1;
		while (true) {
			if (((old >> 2 >> 0) === 0) || !(((old & 3) === 0))) {
				return;
			}
			new$1 = ((old - 4 >> 0)) | 2;
			if (atomic.CompareAndSwapInt32(new ($ptrType($Int32))(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				runtime_Semrelease(new ($ptrType($Uint32))(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				return;
			}
			old = m.state;
		}
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	poolCleanup = function() {
		var _ref, _i, i, p, i$1, l, _ref$1, _i$1, j, x;
		_ref = allPools;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			(i < 0 || i >= allPools.$length) ? $throwRuntimeError("index out of range") : allPools.$array[allPools.$offset + i] = ($ptrType(Pool)).nil;
			i$1 = 0;
			while (i$1 < (p.localSize >> 0)) {
				l = indexLocal(p.local, i$1);
				l.private$0 = $ifaceNil;
				_ref$1 = l.shared;
				_i$1 = 0;
				while (_i$1 < _ref$1.$length) {
					j = _i$1;
					(x = l.shared, (j < 0 || j >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + j] = $ifaceNil);
					_i$1++;
				}
				l.shared = ($sliceType($emptyInterface)).nil;
				i$1 = i$1 + (1) >> 0;
			}
			_i++;
		}
		allPools = new ($sliceType(($ptrType(Pool))))([]);
	};
	init = function() {
		runtime_registerPoolCleanup(poolCleanup);
	};
	indexLocal = function(l, i) {
		var x;
		return (x = l, (x.nilCheck, ((i < 0 || i >= x.length) ? $throwRuntimeError("index out of range") : x[i])));
	};
	runtime_Semacquire = function() {
		$panic("Native function not implemented: sync.runtime_Semacquire");
	};
	runtime_Semrelease = function() {
		$panic("Native function not implemented: sync.runtime_Semrelease");
	};
	init$1 = function() {
		var s;
		s = syncSema.zero(); $copy(s, syncSema.zero(), syncSema);
		runtime_Syncsemcheck(12);
	};
	$pkg.$init = function() {
		($ptrType(Pool)).methods = [["Get", "Get", "", $funcType([], [$emptyInterface], false), -1], ["Put", "Put", "", $funcType([$emptyInterface], [], false), -1], ["getSlow", "getSlow", "sync", $funcType([], [$emptyInterface], false), -1], ["pin", "pin", "sync", $funcType([], [($ptrType(poolLocal))], false), -1], ["pinSlow", "pinSlow", "sync", $funcType([], [($ptrType(poolLocal))], false), -1]];
		Pool.init([["local", "local", "sync", $UnsafePointer, ""], ["localSize", "localSize", "sync", $Uintptr, ""], ["store", "store", "sync", ($sliceType($emptyInterface)), ""], ["New", "New", "", ($funcType([], [$emptyInterface], false)), ""]]);
		($ptrType(Mutex)).methods = [["Lock", "Lock", "", $funcType([], [], false), -1], ["Unlock", "Unlock", "", $funcType([], [], false), -1]];
		Mutex.init([["state", "state", "sync", $Int32, ""], ["sema", "sema", "sync", $Uint32, ""]]);
		($ptrType(poolLocal)).methods = [["Lock", "Lock", "", $funcType([], [], false), 2], ["Unlock", "Unlock", "", $funcType([], [], false), 2]];
		poolLocal.init([["private$0", "private", "sync", $emptyInterface, ""], ["shared", "shared", "sync", ($sliceType($emptyInterface)), ""], ["Mutex", "", "", Mutex, ""], ["pad", "pad", "sync", ($arrayType($Uint8, 128)), ""]]);
		syncSema.init($Uintptr, 3);
		allPools = ($sliceType(($ptrType(Pool)))).nil;
		init();
		init$1();
	};
	return $pkg;
})();
$packages["reflect"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], runtime = $packages["runtime"], strconv = $packages["strconv"], sync = $packages["sync"], math = $packages["math"], mapIter, Type, Kind, rtype, method, uncommonType, ChanDir, arrayType, chanType, funcType, imethod, interfaceType, mapType, ptrType, sliceType, structField, structType, Method, StructField, StructTag, fieldScan, Value, flag, ValueError, iword, nonEmptyInterface, initialized, kindNames, uint8Type, init, jsType, reflectType, isWrapped, copyStruct, makeValue, MakeSlice, jsObject, TypeOf, ValueOf, SliceOf, Zero, unsafe_New, makeInt, memmove, loadScalar, mapaccess, mapassign, mapdelete, mapiterinit, mapiterkey, mapiternext, maplen, cvtDirect, methodReceiver, valueInterface, ifaceE2I, methodName, makeMethodValue, PtrTo, implements$1, directlyAssignable, haveIdenticalUnderlyingType, toType, overflowFloat32, New, convertOp, makeFloat, makeComplex, makeString, makeBytes, makeRunes, cvtInt, cvtUint, cvtFloatInt, cvtFloatUint, cvtIntFloat, cvtUintFloat, cvtFloat, cvtComplex, cvtIntString, cvtUintString, cvtBytesString, cvtStringBytes, cvtRunesString, cvtStringRunes, cvtT2I, cvtI2I, call;
	mapIter = $pkg.mapIter = $newType(0, "Struct", "reflect.mapIter", "mapIter", "reflect", function(t_, m_, keys_, i_) {
		this.$val = this;
		this.t = t_ !== undefined ? t_ : $ifaceNil;
		this.m = m_ !== undefined ? m_ : $ifaceNil;
		this.keys = keys_ !== undefined ? keys_ : $ifaceNil;
		this.i = i_ !== undefined ? i_ : 0;
	});
	Type = $pkg.Type = $newType(8, "Interface", "reflect.Type", "Type", "reflect", null);
	Kind = $pkg.Kind = $newType(4, "Uint", "reflect.Kind", "Kind", "reflect", null);
	rtype = $pkg.rtype = $newType(0, "Struct", "reflect.rtype", "rtype", "reflect", function(size_, hash_, _$2_, align_, fieldAlign_, kind_, alg_, gc_, string_, uncommonType_, ptrToThis_, zero_) {
		this.$val = this;
		this.size = size_ !== undefined ? size_ : 0;
		this.hash = hash_ !== undefined ? hash_ : 0;
		this._$2 = _$2_ !== undefined ? _$2_ : 0;
		this.align = align_ !== undefined ? align_ : 0;
		this.fieldAlign = fieldAlign_ !== undefined ? fieldAlign_ : 0;
		this.kind = kind_ !== undefined ? kind_ : 0;
		this.alg = alg_ !== undefined ? alg_ : ($ptrType($Uintptr)).nil;
		this.gc = gc_ !== undefined ? gc_ : 0;
		this.string = string_ !== undefined ? string_ : ($ptrType($String)).nil;
		this.uncommonType = uncommonType_ !== undefined ? uncommonType_ : ($ptrType(uncommonType)).nil;
		this.ptrToThis = ptrToThis_ !== undefined ? ptrToThis_ : ($ptrType(rtype)).nil;
		this.zero = zero_ !== undefined ? zero_ : 0;
	});
	method = $pkg.method = $newType(0, "Struct", "reflect.method", "method", "reflect", function(name_, pkgPath_, mtyp_, typ_, ifn_, tfn_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.mtyp = mtyp_ !== undefined ? mtyp_ : ($ptrType(rtype)).nil;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
		this.ifn = ifn_ !== undefined ? ifn_ : 0;
		this.tfn = tfn_ !== undefined ? tfn_ : 0;
	});
	uncommonType = $pkg.uncommonType = $newType(0, "Struct", "reflect.uncommonType", "uncommonType", "reflect", function(name_, pkgPath_, methods_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.methods = methods_ !== undefined ? methods_ : ($sliceType(method)).nil;
	});
	ChanDir = $pkg.ChanDir = $newType(4, "Int", "reflect.ChanDir", "ChanDir", "reflect", null);
	arrayType = $pkg.arrayType = $newType(0, "Struct", "reflect.arrayType", "arrayType", "reflect", function(rtype_, elem_, slice_, len_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
		this.slice = slice_ !== undefined ? slice_ : ($ptrType(rtype)).nil;
		this.len = len_ !== undefined ? len_ : 0;
	});
	chanType = $pkg.chanType = $newType(0, "Struct", "reflect.chanType", "chanType", "reflect", function(rtype_, elem_, dir_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
		this.dir = dir_ !== undefined ? dir_ : 0;
	});
	funcType = $pkg.funcType = $newType(0, "Struct", "reflect.funcType", "funcType", "reflect", function(rtype_, dotdotdot_, in$2_, out_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.dotdotdot = dotdotdot_ !== undefined ? dotdotdot_ : false;
		this.in$2 = in$2_ !== undefined ? in$2_ : ($sliceType(($ptrType(rtype)))).nil;
		this.out = out_ !== undefined ? out_ : ($sliceType(($ptrType(rtype)))).nil;
	});
	imethod = $pkg.imethod = $newType(0, "Struct", "reflect.imethod", "imethod", "reflect", function(name_, pkgPath_, typ_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
	});
	interfaceType = $pkg.interfaceType = $newType(0, "Struct", "reflect.interfaceType", "interfaceType", "reflect", function(rtype_, methods_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.methods = methods_ !== undefined ? methods_ : ($sliceType(imethod)).nil;
	});
	mapType = $pkg.mapType = $newType(0, "Struct", "reflect.mapType", "mapType", "reflect", function(rtype_, key_, elem_, bucket_, hmap_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.key = key_ !== undefined ? key_ : ($ptrType(rtype)).nil;
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
		this.bucket = bucket_ !== undefined ? bucket_ : ($ptrType(rtype)).nil;
		this.hmap = hmap_ !== undefined ? hmap_ : ($ptrType(rtype)).nil;
	});
	ptrType = $pkg.ptrType = $newType(0, "Struct", "reflect.ptrType", "ptrType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
	});
	sliceType = $pkg.sliceType = $newType(0, "Struct", "reflect.sliceType", "sliceType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.elem = elem_ !== undefined ? elem_ : ($ptrType(rtype)).nil;
	});
	structField = $pkg.structField = $newType(0, "Struct", "reflect.structField", "structField", "reflect", function(name_, pkgPath_, typ_, tag_, offset_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ($ptrType($String)).nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ($ptrType($String)).nil;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
		this.tag = tag_ !== undefined ? tag_ : ($ptrType($String)).nil;
		this.offset = offset_ !== undefined ? offset_ : 0;
	});
	structType = $pkg.structType = $newType(0, "Struct", "reflect.structType", "structType", "reflect", function(rtype_, fields_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.Ptr();
		this.fields = fields_ !== undefined ? fields_ : ($sliceType(structField)).nil;
	});
	Method = $pkg.Method = $newType(0, "Struct", "reflect.Method", "Method", "reflect", function(Name_, PkgPath_, Type_, Func_, Index_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : $ifaceNil;
		this.Func = Func_ !== undefined ? Func_ : new Value.Ptr();
		this.Index = Index_ !== undefined ? Index_ : 0;
	});
	StructField = $pkg.StructField = $newType(0, "Struct", "reflect.StructField", "StructField", "reflect", function(Name_, PkgPath_, Type_, Tag_, Offset_, Index_, Anonymous_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : $ifaceNil;
		this.Tag = Tag_ !== undefined ? Tag_ : "";
		this.Offset = Offset_ !== undefined ? Offset_ : 0;
		this.Index = Index_ !== undefined ? Index_ : ($sliceType($Int)).nil;
		this.Anonymous = Anonymous_ !== undefined ? Anonymous_ : false;
	});
	StructTag = $pkg.StructTag = $newType(8, "String", "reflect.StructTag", "StructTag", "reflect", null);
	fieldScan = $pkg.fieldScan = $newType(0, "Struct", "reflect.fieldScan", "fieldScan", "reflect", function(typ_, index_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(structType)).nil;
		this.index = index_ !== undefined ? index_ : ($sliceType($Int)).nil;
	});
	Value = $pkg.Value = $newType(0, "Struct", "reflect.Value", "Value", "reflect", function(typ_, ptr_, scalar_, flag_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ($ptrType(rtype)).nil;
		this.ptr = ptr_ !== undefined ? ptr_ : 0;
		this.scalar = scalar_ !== undefined ? scalar_ : 0;
		this.flag = flag_ !== undefined ? flag_ : 0;
	});
	flag = $pkg.flag = $newType(4, "Uintptr", "reflect.flag", "flag", "reflect", null);
	ValueError = $pkg.ValueError = $newType(0, "Struct", "reflect.ValueError", "ValueError", "reflect", function(Method_, Kind_) {
		this.$val = this;
		this.Method = Method_ !== undefined ? Method_ : "";
		this.Kind = Kind_ !== undefined ? Kind_ : 0;
	});
	iword = $pkg.iword = $newType(4, "UnsafePointer", "reflect.iword", "iword", "reflect", null);
	nonEmptyInterface = $pkg.nonEmptyInterface = $newType(0, "Struct", "reflect.nonEmptyInterface", "nonEmptyInterface", "reflect", function(itab_, word_) {
		this.$val = this;
		this.itab = itab_ !== undefined ? itab_ : ($ptrType(($structType([["ityp", "ityp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["link", "link", "reflect", $UnsafePointer, ""], ["bad", "bad", "reflect", $Int32, ""], ["unused", "unused", "reflect", $Int32, ""], ["fun", "fun", "reflect", ($arrayType($UnsafePointer, 100000)), ""]])))).nil;
		this.word = word_ !== undefined ? word_ : 0;
	});
	init = function() {
		var used, x, x$1, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9, x$10, x$11, x$12, pkg, _map, _key;
		used = (function(i) {
		});
		used((x = new rtype.Ptr(0, 0, 0, 0, 0, 0, ($ptrType($Uintptr)).nil, 0, ($ptrType($String)).nil, ($ptrType(uncommonType)).nil, ($ptrType(rtype)).nil, 0), new x.constructor.Struct(x)));
		used((x$1 = new uncommonType.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($sliceType(method)).nil), new x$1.constructor.Struct(x$1)));
		used((x$2 = new method.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, 0, 0), new x$2.constructor.Struct(x$2)));
		used((x$3 = new arrayType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, 0), new x$3.constructor.Struct(x$3)));
		used((x$4 = new chanType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil, 0), new x$4.constructor.Struct(x$4)));
		used((x$5 = new funcType.Ptr(new rtype.Ptr(), false, ($sliceType(($ptrType(rtype)))).nil, ($sliceType(($ptrType(rtype)))).nil), new x$5.constructor.Struct(x$5)));
		used((x$6 = new interfaceType.Ptr(new rtype.Ptr(), ($sliceType(imethod)).nil), new x$6.constructor.Struct(x$6)));
		used((x$7 = new mapType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, ($ptrType(rtype)).nil, ($ptrType(rtype)).nil), new x$7.constructor.Struct(x$7)));
		used((x$8 = new ptrType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil), new x$8.constructor.Struct(x$8)));
		used((x$9 = new sliceType.Ptr(new rtype.Ptr(), ($ptrType(rtype)).nil), new x$9.constructor.Struct(x$9)));
		used((x$10 = new structType.Ptr(new rtype.Ptr(), ($sliceType(structField)).nil), new x$10.constructor.Struct(x$10)));
		used((x$11 = new imethod.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($ptrType(rtype)).nil), new x$11.constructor.Struct(x$11)));
		used((x$12 = new structField.Ptr(($ptrType($String)).nil, ($ptrType($String)).nil, ($ptrType(rtype)).nil, ($ptrType($String)).nil, 0), new x$12.constructor.Struct(x$12)));
		pkg = $pkg;
		pkg.kinds = $externalize((_map = new $Map(), _key = "Bool", _map[_key] = { k: _key, v: 1 }, _key = "Int", _map[_key] = { k: _key, v: 2 }, _key = "Int8", _map[_key] = { k: _key, v: 3 }, _key = "Int16", _map[_key] = { k: _key, v: 4 }, _key = "Int32", _map[_key] = { k: _key, v: 5 }, _key = "Int64", _map[_key] = { k: _key, v: 6 }, _key = "Uint", _map[_key] = { k: _key, v: 7 }, _key = "Uint8", _map[_key] = { k: _key, v: 8 }, _key = "Uint16", _map[_key] = { k: _key, v: 9 }, _key = "Uint32", _map[_key] = { k: _key, v: 10 }, _key = "Uint64", _map[_key] = { k: _key, v: 11 }, _key = "Uintptr", _map[_key] = { k: _key, v: 12 }, _key = "Float32", _map[_key] = { k: _key, v: 13 }, _key = "Float64", _map[_key] = { k: _key, v: 14 }, _key = "Complex64", _map[_key] = { k: _key, v: 15 }, _key = "Complex128", _map[_key] = { k: _key, v: 16 }, _key = "Array", _map[_key] = { k: _key, v: 17 }, _key = "Chan", _map[_key] = { k: _key, v: 18 }, _key = "Func", _map[_key] = { k: _key, v: 19 }, _key = "Interface", _map[_key] = { k: _key, v: 20 }, _key = "Map", _map[_key] = { k: _key, v: 21 }, _key = "Ptr", _map[_key] = { k: _key, v: 22 }, _key = "Slice", _map[_key] = { k: _key, v: 23 }, _key = "String", _map[_key] = { k: _key, v: 24 }, _key = "Struct", _map[_key] = { k: _key, v: 25 }, _key = "UnsafePointer", _map[_key] = { k: _key, v: 26 }, _map), ($mapType($String, Kind)));
		pkg.RecvDir = 1;
		pkg.SendDir = 2;
		pkg.BothDir = 3;
		$reflect = pkg;
		initialized = true;
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ($ptrType(rtype)));
	};
	jsType = function(typ) {
		return typ.jsType;
	};
	reflectType = function(typ) {
		return typ.reflectType();
	};
	isWrapped = function(typ) {
		var _ref;
		_ref = typ.Kind();
		if (_ref === 1 || _ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 12 || _ref === 13 || _ref === 14 || _ref === 17 || _ref === 21 || _ref === 19 || _ref === 24 || _ref === 25) {
			return true;
		} else if (_ref === 22) {
			return typ.Elem().Kind() === 17;
		}
		return false;
	};
	copyStruct = function(dst, src, typ) {
		var fields, i, name;
		fields = jsType(typ).fields;
		i = 0;
		while (i < $parseInt(fields.length)) {
			name = $internalize(fields[i][0], $String);
			dst[$externalize(name, $String)] = src[$externalize(name, $String)];
			i = i + (1) >> 0;
		}
	};
	makeValue = function(t, v, fl) {
		var rt;
		rt = t.common();
		if ((t.Kind() === 17) || (t.Kind() === 25) || rt.pointers()) {
			return new Value.Ptr(rt, v, 0, (fl | ((t.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		if (t.Size() > 4 || (t.Kind() === 24)) {
			return new Value.Ptr(rt, $newDataPointer(v, jsType(rt.ptrTo())), 0, (((fl | ((t.Kind() >>> 0) << 4 >>> 0)) >>> 0) | 2) >>> 0);
		}
		return new Value.Ptr(rt, 0, v, (fl | ((t.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	MakeSlice = $pkg.MakeSlice = function(typ, len, cap) {
		if (!((typ.Kind() === 23))) {
			$panic(new $String("reflect.MakeSlice of non-slice type"));
		}
		if (len < 0) {
			$panic(new $String("reflect.MakeSlice: negative len"));
		}
		if (cap < 0) {
			$panic(new $String("reflect.MakeSlice: negative cap"));
		}
		if (len > cap) {
			$panic(new $String("reflect.MakeSlice: len > cap"));
		}
		return makeValue(typ, jsType(typ).make(len, cap, $externalize((function() {
			return jsType(typ.Elem()).zero();
		}), ($funcType([], [js.Object], false)))), 0);
	};
	jsObject = function() {
		return reflectType($packages[$externalize("github.com/gopherjs/gopherjs/js", $String)].Object);
	};
	TypeOf = $pkg.TypeOf = function(i) {
		var c;
		if (!initialized) {
			return new rtype.Ptr(0, 0, 0, 0, 0, 0, ($ptrType($Uintptr)).nil, 0, ($ptrType($String)).nil, ($ptrType(uncommonType)).nil, ($ptrType(rtype)).nil, 0);
		}
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return $ifaceNil;
		}
		c = i.constructor;
		if (c.kind === undefined) {
			return jsObject();
		}
		return reflectType(c);
	};
	ValueOf = $pkg.ValueOf = function(i) {
		var c;
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		c = i.constructor;
		if (c.kind === undefined) {
			return new Value.Ptr(jsObject(), 0, i, 320);
		}
		return makeValue(reflectType(c), i.$val, 0);
	};
	rtype.Ptr.prototype.ptrTo = function() {
		var t;
		t = this;
		return reflectType($ptrType(jsType(t)));
	};
	rtype.prototype.ptrTo = function() { return this.$val.ptrTo(); };
	SliceOf = $pkg.SliceOf = function(t) {
		return reflectType($sliceType(jsType(t)));
	};
	Zero = $pkg.Zero = function(typ) {
		return makeValue(typ, jsType(typ).zero(), 0);
	};
	unsafe_New = function(typ) {
		var _ref;
		_ref = typ.Kind();
		if (_ref === 25) {
			return new (jsType(typ).Ptr)();
		} else if (_ref === 17) {
			return jsType(typ).zero();
		} else {
			return $newDataPointer(jsType(typ).zero(), jsType(typ.ptrTo()));
		}
	};
	makeInt = function(f, bits, t) {
		var typ, ptr, s, _ref;
		typ = t.common();
		if (typ.size > 4) {
			ptr = unsafe_New(typ);
			ptr.$set(bits);
			return new Value.Ptr(typ, ptr, 0, (((f | 2) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		s = 0;
		_ref = typ.Kind();
		if (_ref === 3) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 24 >> 24));
		} else if (_ref === 4) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 16 >> 16));
		} else if (_ref === 2 || _ref === 5) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low >> 0));
		} else if (_ref === 8) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 24 >>> 24));
		} else if (_ref === 9) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low << 16 >>> 16));
		} else if (_ref === 7 || _ref === 10 || _ref === 12) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set((bits.$low >>> 0));
		}
		return new Value.Ptr(typ, 0, s, (f | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	memmove = function(adst, asrc, n) {
		adst.$set(asrc.$get());
	};
	loadScalar = function(p, n) {
		return p.$get();
	};
	mapaccess = function(t, m, key) {
		var k, entry;
		k = key.$get();
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		entry = m[$externalize($internalize(k, $String), $String)];
		if (entry === undefined) {
			return 0;
		}
		return $newDataPointer(entry.v, jsType(PtrTo(t.Elem())));
	};
	mapassign = function(t, m, key, val) {
		var kv, k, jsVal, et, newVal, entry;
		kv = key.$get();
		k = kv;
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		jsVal = val.$get();
		et = t.Elem();
		if (et.Kind() === 25) {
			newVal = jsType(et).zero();
			copyStruct(newVal, jsVal, et);
			jsVal = newVal;
		}
		entry = new ($global.Object)();
		entry.k = kv;
		entry.v = jsVal;
		m[$externalize($internalize(k, $String), $String)] = entry;
	};
	mapdelete = function(t, m, key) {
		var k;
		k = key.$get();
		if (!(k.$key === undefined)) {
			k = k.$key();
		}
		delete m[$externalize($internalize(k, $String), $String)];
	};
	mapiterinit = function(t, m) {
		return new mapIter.Ptr(t, m, $keys(m), 0);
	};
	mapiterkey = function(it) {
		var iter, k;
		iter = it;
		k = iter.keys[iter.i];
		return $newDataPointer(iter.m[$externalize($internalize(k, $String), $String)].k, jsType(PtrTo(iter.t.Key())));
	};
	mapiternext = function(it) {
		var iter;
		iter = it;
		iter.i = iter.i + (1) >> 0;
	};
	maplen = function(m) {
		return $parseInt($keys(m).length);
	};
	cvtDirect = function(v, typ) {
		var srcVal, val, k, _ref, slice;
		srcVal = v.iword();
		if (srcVal === jsType(v.typ).nil) {
			return makeValue(typ, jsType(typ).nil, v.flag);
		}
		val = $ifaceNil;
		k = typ.Kind();
		_ref = k;
		switch (0) { default: if (_ref === 18) {
			val = new (jsType(typ))();
		} else if (_ref === 23) {
			slice = new (jsType(typ))(srcVal.$array);
			slice.$offset = srcVal.$offset;
			slice.$length = srcVal.$length;
			slice.$capacity = srcVal.$capacity;
			val = $newDataPointer(slice, jsType(PtrTo(typ)));
		} else if (_ref === 22) {
			if (typ.Elem().Kind() === 25) {
				if ($interfaceIsEqual(typ.Elem(), v.typ.Elem())) {
					val = srcVal;
					break;
				}
				val = new (jsType(typ))();
				copyStruct(val, srcVal, typ.Elem());
				break;
			}
			val = new (jsType(typ))(srcVal.$get, srcVal.$set);
		} else if (_ref === 25) {
			val = new (jsType(typ).Ptr)();
			copyStruct(val, srcVal, typ);
		} else if (_ref === 17 || _ref === 19 || _ref === 20 || _ref === 21 || _ref === 24) {
			val = v.ptr;
		} else {
			$panic(new ValueError.Ptr("reflect.Convert", k));
		} }
		return new Value.Ptr(typ.common(), val, 0, (((v.flag & 3) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	methodReceiver = function(op, v, i) {
		var rcvrtype = ($ptrType(rtype)).nil, t = ($ptrType(rtype)).nil, fn = 0, name, tt, x, m, iface, ut, x$1, m$1, rcvr;
		name = "";
		if (v.typ.Kind() === 20) {
			tt = v.typ.interfaceType;
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (!($pointerIsEqual(m.pkgPath, ($ptrType($String)).nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			iface = $clone(v.ptr, nonEmptyInterface);
			if (iface.itab === ($ptrType(($structType([["ityp", "ityp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["link", "link", "reflect", $UnsafePointer, ""], ["bad", "bad", "reflect", $Int32, ""], ["unused", "unused", "reflect", $Int32, ""], ["fun", "fun", "reflect", ($arrayType($UnsafePointer, 100000)), ""]])))).nil) {
				$panic(new $String("reflect: " + op + " of method on nil interface value"));
			}
			t = m.typ;
			name = m.name.$get();
		} else {
			ut = v.typ.uncommonType.uncommon();
			if (ut === ($ptrType(uncommonType)).nil || i < 0 || i >= ut.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m$1 = (x$1 = ut.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
			if (!($pointerIsEqual(m$1.pkgPath, ($ptrType($String)).nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			t = m$1.mtyp;
			name = $internalize(jsType(v.typ).methods[i][0], $String);
		}
		rcvr = v.iword();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fn = rcvr[$externalize(name, $String)];
		return [rcvrtype, t, fn];
	};
	valueInterface = function(v, safe) {
		if (v.flag === 0) {
			$panic(new ValueError.Ptr("reflect.Value.Interface", 0));
		}
		if (safe && !((((v.flag & 1) >>> 0) === 0))) {
			$panic(new $String("reflect.Value.Interface: cannot return value obtained from unexported field or method"));
		}
		if (!((((v.flag & 8) >>> 0) === 0))) {
			$copy(v, makeMethodValue("Interface", $clone(v, Value)), Value);
		}
		if (isWrapped(v.typ)) {
			return new (jsType(v.typ))(v.iword());
		}
		return v.iword();
	};
	ifaceE2I = function(t, src, dst) {
		dst.$set(src);
	};
	methodName = function() {
		return "?FIXME?";
	};
	makeMethodValue = function(op, v) {
		var _tuple, fn, rcvr, fv;
		if (((v.flag & 8) >>> 0) === 0) {
			$panic(new $String("reflect: internal error: invalid use of makePartialFunc"));
		}
		_tuple = methodReceiver(op, $clone(v, Value), (v.flag >> 0) >> 9 >> 0); fn = _tuple[2];
		rcvr = v.iword();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fv = (function() {
			return fn.apply(rcvr, $externalize(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), ($sliceType(js.Object))));
		});
		return new Value.Ptr(v.Type().common(), fv, 0, (((v.flag & 1) >>> 0) | 304) >>> 0);
	};
	rtype.Ptr.prototype.pointers = function() {
		var t, _ref;
		t = this;
		_ref = t.Kind();
		if (_ref === 22 || _ref === 21 || _ref === 18 || _ref === 19 || _ref === 25 || _ref === 17) {
			return true;
		} else {
			return false;
		}
	};
	rtype.prototype.pointers = function() { return this.$val.pointers(); };
	uncommonType.Ptr.prototype.Method = function(i) {
		var m = new Method.Ptr(), t, x, p, fl, mt, name, fn;
		t = this;
		if (t === ($ptrType(uncommonType)).nil || i < 0 || i >= t.methods.$length) {
			$panic(new $String("reflect: Method index out of range"));
		}
		p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		if (!($pointerIsEqual(p.name, ($ptrType($String)).nil))) {
			m.Name = p.name.$get();
		}
		fl = 304;
		if (!($pointerIsEqual(p.pkgPath, ($ptrType($String)).nil))) {
			m.PkgPath = p.pkgPath.$get();
			fl = (fl | (1)) >>> 0;
		}
		mt = p.typ;
		m.Type = mt;
		name = $internalize(t.jsType.methods[i][0], $String);
		fn = (function(rcvr) {
			return rcvr[$externalize(name, $String)].apply(rcvr, $externalize($subslice(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), 1), ($sliceType(js.Object))));
		});
		$copy(m.Func, new Value.Ptr(mt, fn, 0, fl), Value);
		m.Index = i;
		return m;
	};
	uncommonType.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.Ptr.prototype.iword = function() {
		var v, val, _ref, newVal;
		v = new Value.Ptr(); $copy(v, this, Value);
		if ((v.typ.Kind() === 17) || (v.typ.Kind() === 25)) {
			return v.ptr;
		}
		if (!((((v.flag & 2) >>> 0) === 0))) {
			val = v.ptr.$get();
			if (!(val === $ifaceNil) && !(val.constructor === jsType(v.typ))) {
				_ref = v.typ.Kind();
				switch (0) { default: if (_ref === 11 || _ref === 6) {
					val = new (jsType(v.typ))(val.$high, val.$low);
				} else if (_ref === 15 || _ref === 16) {
					val = new (jsType(v.typ))(val.$real, val.$imag);
				} else if (_ref === 23) {
					if (val === val.constructor.nil) {
						val = jsType(v.typ).nil;
						break;
					}
					newVal = new (jsType(v.typ))(val.$array);
					newVal.$offset = val.$offset;
					newVal.$length = val.$length;
					newVal.$capacity = val.$capacity;
					val = newVal;
				} }
			}
			return val;
		}
		if (v.typ.pointers()) {
			return v.ptr;
		}
		return v.scalar;
	};
	Value.prototype.iword = function() { return this.$val.iword(); };
	Value.Ptr.prototype.call = function(op, in$1) {
		var v, t, fn, rcvr, _tuple, isSlice, n, _ref, _i, x, i, _tmp, _tmp$1, xt, targ, m, slice, elem, i$1, x$1, x$2, xt$1, origIn, nin, nout, argsArray, _ref$1, _i$1, i$2, arg, results, _ref$2, ret, _ref$3, _i$2, i$3;
		v = new Value.Ptr(); $copy(v, this, Value);
		t = v.typ;
		fn = 0;
		rcvr = $ifaceNil;
		if (!((((v.flag & 8) >>> 0) === 0))) {
			_tuple = methodReceiver(op, $clone(v, Value), (v.flag >> 0) >> 9 >> 0); t = _tuple[1]; fn = _tuple[2];
			rcvr = v.iword();
			if (isWrapped(v.typ)) {
				rcvr = new (jsType(v.typ))(rcvr);
			}
		} else {
			fn = v.iword();
		}
		if (fn === 0) {
			$panic(new $String("reflect.Value.Call: call of nil function"));
		}
		isSlice = op === "CallSlice";
		n = t.NumIn();
		if (isSlice) {
			if (!t.IsVariadic()) {
				$panic(new $String("reflect: CallSlice of non-variadic function"));
			}
			if (in$1.$length < n) {
				$panic(new $String("reflect: CallSlice with too few input arguments"));
			}
			if (in$1.$length > n) {
				$panic(new $String("reflect: CallSlice with too many input arguments"));
			}
		} else {
			if (t.IsVariadic()) {
				n = n - (1) >> 0;
			}
			if (in$1.$length < n) {
				$panic(new $String("reflect: Call with too few input arguments"));
			}
			if (!t.IsVariadic() && in$1.$length > n) {
				$panic(new $String("reflect: Call with too many input arguments"));
			}
		}
		_ref = in$1;
		_i = 0;
		while (_i < _ref.$length) {
			x = new Value.Ptr(); $copy(x, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), Value);
			if (x.Kind() === 0) {
				$panic(new $String("reflect: " + op + " using zero Value argument"));
			}
			_i++;
		}
		i = 0;
		while (i < n) {
			_tmp = ((i < 0 || i >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + i]).Type(); _tmp$1 = t.In(i); xt = _tmp; targ = _tmp$1;
			if (!xt.AssignableTo(targ)) {
				$panic(new $String("reflect: " + op + " using " + xt.String() + " as type " + targ.String()));
			}
			i = i + (1) >> 0;
		}
		if (!isSlice && t.IsVariadic()) {
			m = in$1.$length - n >> 0;
			slice = new Value.Ptr(); $copy(slice, MakeSlice(t.In(n), m, m), Value);
			elem = t.In(n).Elem();
			i$1 = 0;
			while (i$1 < m) {
				x$2 = new Value.Ptr(); $copy(x$2, (x$1 = n + i$1 >> 0, ((x$1 < 0 || x$1 >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + x$1])), Value);
				xt$1 = x$2.Type();
				if (!xt$1.AssignableTo(elem)) {
					$panic(new $String("reflect: cannot use " + xt$1.String() + " as type " + elem.String() + " in " + op));
				}
				slice.Index(i$1).Set($clone(x$2, Value));
				i$1 = i$1 + (1) >> 0;
			}
			origIn = in$1;
			in$1 = ($sliceType(Value)).make((n + 1 >> 0));
			$copySlice($subslice(in$1, 0, n), origIn);
			$copy(((n < 0 || n >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + n]), slice, Value);
		}
		nin = in$1.$length;
		if (!((nin === t.NumIn()))) {
			$panic(new $String("reflect.Value.Call: wrong argument count"));
		}
		nout = t.NumOut();
		argsArray = new ($global.Array)(t.NumIn());
		_ref$1 = in$1;
		_i$1 = 0;
		while (_i$1 < _ref$1.$length) {
			i$2 = _i$1;
			arg = new Value.Ptr(); $copy(arg, ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i$1]), Value);
			argsArray[i$2] = arg.assignTo("reflect.Value.Call", t.In(i$2).common(), ($ptrType($emptyInterface)).nil).iword();
			_i$1++;
		}
		results = fn.apply(rcvr, argsArray);
		_ref$2 = nout;
		if (_ref$2 === 0) {
			return ($sliceType(Value)).nil;
		} else if (_ref$2 === 1) {
			return new ($sliceType(Value))([$clone(makeValue(t.Out(0), results, 0), Value)]);
		} else {
			ret = ($sliceType(Value)).make(nout);
			_ref$3 = ret;
			_i$2 = 0;
			while (_i$2 < _ref$3.$length) {
				i$3 = _i$2;
				$copy(((i$3 < 0 || i$3 >= ret.$length) ? $throwRuntimeError("index out of range") : ret.$array[ret.$offset + i$3]), makeValue(t.Out(i$3), results[i$3], 0), Value);
				_i$2++;
			}
			return ret;
		}
	};
	Value.prototype.call = function(op, in$1) { return this.$val.call(op, in$1); };
	Value.Ptr.prototype.Cap = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 17) {
			return v.typ.Len();
		} else if (_ref === 18 || _ref === 23) {
			return $parseInt(v.iword().$capacity) >> 0;
		}
		$panic(new ValueError.Ptr("reflect.Value.Cap", k));
	};
	Value.prototype.Cap = function() { return this.$val.Cap(); };
	Value.Ptr.prototype.Elem = function() {
		var v, k, _ref, val, typ, val$1, tt, fl;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 20) {
			val = v.iword();
			if (val === $ifaceNil) {
				return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
			}
			typ = reflectType(val.constructor);
			return makeValue(typ, val.$val, (v.flag & 1) >>> 0);
		} else if (_ref === 22) {
			if (v.IsNil()) {
				return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
			}
			val$1 = v.iword();
			tt = v.typ.ptrType;
			fl = (((((v.flag & 1) >>> 0) | 2) >>> 0) | 4) >>> 0;
			fl = (fl | (((tt.elem.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			return new Value.Ptr(tt.elem, val$1, 0, fl);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Elem", k));
		}
	};
	Value.prototype.Elem = function() { return this.$val.Elem(); };
	Value.Ptr.prototype.Field = function(i) {
		var v, tt, x, field, name, typ, fl, s;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		tt = v.typ.structType;
		if (i < 0 || i >= tt.fields.$length) {
			$panic(new $String("reflect: Field index out of range"));
		}
		field = (x = tt.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		name = $internalize(jsType(v.typ).fields[i][0], $String);
		typ = field.typ;
		fl = (v.flag & 7) >>> 0;
		if (!($pointerIsEqual(field.pkgPath, ($ptrType($String)).nil))) {
			fl = (fl | (1)) >>> 0;
		}
		fl = (fl | (((typ.Kind() >>> 0) << 4 >>> 0))) >>> 0;
		s = v.ptr;
		if (!((((fl & 2) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
			return new Value.Ptr(typ, new (jsType(PtrTo(typ)))($externalize((function() {
				return s[$externalize(name, $String)];
			}), ($funcType([], [js.Object], false))), $externalize((function(v$1) {
				s[$externalize(name, $String)] = v$1;
			}), ($funcType([js.Object], [], false)))), 0, fl);
		}
		return makeValue(typ, s[$externalize(name, $String)], fl);
	};
	Value.prototype.Field = function(i) { return this.$val.Field(i); };
	Value.Ptr.prototype.Index = function(i) {
		var v, k, _ref, tt, typ, fl, a, s, tt$1, typ$1, fl$1, a$1, str, fl$2;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 17) {
			tt = v.typ.arrayType;
			if (i < 0 || i > (tt.len >> 0)) {
				$panic(new $String("reflect: array index out of range"));
			}
			typ = tt.elem;
			fl = (v.flag & 7) >>> 0;
			fl = (fl | (((typ.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			a = v.ptr;
			if (!((((fl & 2) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
				return new Value.Ptr(typ, new (jsType(PtrTo(typ)))($externalize((function() {
					return a[i];
				}), ($funcType([], [js.Object], false))), $externalize((function(v$1) {
					a[i] = v$1;
				}), ($funcType([js.Object], [], false)))), 0, fl);
			}
			return makeValue(typ, a[i], fl);
		} else if (_ref === 23) {
			s = v.iword();
			if (i < 0 || i >= ($parseInt(s.$length) >> 0)) {
				$panic(new $String("reflect: slice index out of range"));
			}
			tt$1 = v.typ.sliceType;
			typ$1 = tt$1.elem;
			fl$1 = (6 | ((v.flag & 1) >>> 0)) >>> 0;
			fl$1 = (fl$1 | (((typ$1.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			i = i + (($parseInt(s.$offset) >> 0)) >> 0;
			a$1 = s.$array;
			if (!((((fl$1 & 2) >>> 0) === 0)) && !((typ$1.Kind() === 17)) && !((typ$1.Kind() === 25))) {
				return new Value.Ptr(typ$1, new (jsType(PtrTo(typ$1)))($externalize((function() {
					return a$1[i];
				}), ($funcType([], [js.Object], false))), $externalize((function(v$1) {
					a$1[i] = v$1;
				}), ($funcType([js.Object], [], false)))), 0, fl$1);
			}
			return makeValue(typ$1, a$1[i], fl$1);
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || i >= str.length) {
				$panic(new $String("reflect: string index out of range"));
			}
			fl$2 = (((v.flag & 1) >>> 0) | 128) >>> 0;
			return new Value.Ptr(uint8Type, 0, (str.charCodeAt(i) >>> 0), fl$2);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Index", k));
		}
	};
	Value.prototype.Index = function(i) { return this.$val.Index(i); };
	Value.Ptr.prototype.IsNil = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 18 || _ref === 22 || _ref === 23) {
			return v.iword() === jsType(v.typ).nil;
		} else if (_ref === 19) {
			return v.iword() === $throwNilPointerError;
		} else if (_ref === 21) {
			return v.iword() === false;
		} else if (_ref === 20) {
			return v.iword() === $ifaceNil;
		} else {
			$panic(new ValueError.Ptr("reflect.Value.IsNil", k));
		}
	};
	Value.prototype.IsNil = function() { return this.$val.IsNil(); };
	Value.Ptr.prototype.Len = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 17 || _ref === 24) {
			return $parseInt(v.iword().length);
		} else if (_ref === 23) {
			return $parseInt(v.iword().$length) >> 0;
		} else if (_ref === 18) {
			return $parseInt(v.iword().$buffer.length) >> 0;
		} else if (_ref === 21) {
			return $parseInt($keys(v.iword()).length);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Len", k));
		}
	};
	Value.prototype.Len = function() { return this.$val.Len(); };
	Value.Ptr.prototype.Pointer = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 18 || _ref === 21 || _ref === 22 || _ref === 23 || _ref === 26) {
			if (v.IsNil()) {
				return 0;
			}
			return v.iword();
		} else if (_ref === 19) {
			if (v.IsNil()) {
				return 0;
			}
			return 1;
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Pointer", k));
		}
	};
	Value.prototype.Pointer = function() { return this.$val.Pointer(); };
	Value.Ptr.prototype.Set = function(x) {
		var v, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(x.flag)).mustBeExported();
		$copy(x, x.assignTo("reflect.Set", v.typ, ($ptrType($emptyInterface)).nil), Value);
		if (!((((v.flag & 2) >>> 0) === 0))) {
			_ref = v.typ.Kind();
			if (_ref === 17) {
				$copy(v.ptr, x.ptr, jsType(v.typ));
			} else if (_ref === 20) {
				v.ptr.$set(valueInterface($clone(x, Value), false));
			} else if (_ref === 25) {
				copyStruct(v.ptr, x.ptr, v.typ);
			} else {
				v.ptr.$set(x.iword());
			}
			return;
		}
		v.ptr = x.ptr;
	};
	Value.prototype.Set = function(x) { return this.$val.Set(x); };
	Value.Ptr.prototype.SetCap = function(n) {
		var v, s, newSlice;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		s = v.ptr.$get();
		if (n < ($parseInt(s.$length) >> 0) || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice capacity out of range in SetCap"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = s.$length;
		newSlice.$capacity = n;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetCap = function(n) { return this.$val.SetCap(n); };
	Value.Ptr.prototype.SetLen = function(n) {
		var v, s, newSlice;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		s = v.ptr.$get();
		if (n < 0 || n > ($parseInt(s.$capacity) >> 0)) {
			$panic(new $String("reflect: slice length out of range in SetLen"));
		}
		newSlice = new (jsType(v.typ))(s.$array);
		newSlice.$offset = s.$offset;
		newSlice.$length = n;
		newSlice.$capacity = s.$capacity;
		v.ptr.$set(newSlice);
	};
	Value.prototype.SetLen = function(n) { return this.$val.SetLen(n); };
	Value.Ptr.prototype.Slice = function(i, j) {
		var v, cap, typ, s, kind, _ref, tt, str;
		v = new Value.Ptr(); $copy(v, this, Value);
		cap = 0;
		typ = $ifaceNil;
		s = $ifaceNil;
		kind = (new flag(v.flag)).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 4) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.arrayType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.iword());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.iword();
			cap = $parseInt(s.$capacity) >> 0;
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || j < i || j > str.length) {
				$panic(new $String("reflect.Value.Slice: string slice index out of bounds"));
			}
			return ValueOf(new $String(str.substring(i, j)));
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Slice", kind));
		}
		if (i < 0 || j < i || j > cap) {
			$panic(new $String("reflect.Value.Slice: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j), (v.flag & 1) >>> 0);
	};
	Value.prototype.Slice = function(i, j) { return this.$val.Slice(i, j); };
	Value.Ptr.prototype.Slice3 = function(i, j, k) {
		var v, cap, typ, s, kind, _ref, tt;
		v = new Value.Ptr(); $copy(v, this, Value);
		cap = 0;
		typ = $ifaceNil;
		s = $ifaceNil;
		kind = (new flag(v.flag)).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 4) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.arrayType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.iword());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.iword();
			cap = $parseInt(s.$capacity) >> 0;
		} else {
			$panic(new ValueError.Ptr("reflect.Value.Slice3", kind));
		}
		if (i < 0 || j < i || k < j || k > cap) {
			$panic(new $String("reflect.Value.Slice3: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j, k), (v.flag & 1) >>> 0);
	};
	Value.prototype.Slice3 = function(i, j, k) { return this.$val.Slice3(i, j, k); };
	Value.Ptr.prototype.Close = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		$close(v.iword());
	};
	Value.prototype.Close = function() { return this.$val.Close(); };
	Value.Ptr.prototype.TrySend = function(x) {
		var v, tt, c;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		tt = v.typ.chanType;
		if (((tt.dir >> 0) & 2) === 0) {
			$panic(new $String("reflect: send on recv-only channel"));
		}
		(new flag(x.flag)).mustBeExported();
		c = v.iword();
		if (!!!(c.$closed) && ($parseInt(c.$recvQueue.length) === 0) && ($parseInt(c.$buffer.length) === ($parseInt(c.$capacity) >> 0))) {
			return false;
		}
		$copy(x, x.assignTo("reflect.Value.Send", tt.elem, ($ptrType($emptyInterface)).nil), Value);
		$send(c, x.iword());
		return true;
	};
	Value.prototype.TrySend = function(x) { return this.$val.TrySend(x); };
	Value.Ptr.prototype.Send = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		$panic(new runtime.NotSupportedError.Ptr("reflect.Value.Send, use reflect.Value.TrySend is possible"));
	};
	Value.prototype.Send = function(x) { return this.$val.Send(x); };
	Value.Ptr.prototype.TryRecv = function() {
		var x = new Value.Ptr(), ok = false, v, tt, res, _tmp, _tmp$1, _tmp$2, _tmp$3;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(18);
		(new flag(v.flag)).mustBeExported();
		tt = v.typ.chanType;
		if (((tt.dir >> 0) & 1) === 0) {
			$panic(new $String("reflect: recv on send-only channel"));
		}
		res = $recv(v.iword());
		if (res.constructor === $global.Function) {
			_tmp = new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0); _tmp$1 = false; $copy(x, _tmp, Value); ok = _tmp$1;
			return [x, ok];
		}
		_tmp$2 = new Value.Ptr(); $copy(_tmp$2, makeValue(tt.elem, res[0], 0), Value); _tmp$3 = !!(res[1]); $copy(x, _tmp$2, Value); ok = _tmp$3;
		return [x, ok];
	};
	Value.prototype.TryRecv = function() { return this.$val.TryRecv(); };
	Value.Ptr.prototype.Recv = function() {
		var x = new Value.Ptr(), ok = false, v;
		v = new Value.Ptr(); $copy(v, this, Value);
		$panic(new runtime.NotSupportedError.Ptr("reflect.Value.Recv, use reflect.Value.TryRecv is possible"));
	};
	Value.prototype.Recv = function() { return this.$val.Recv(); };
	Kind.prototype.String = function() {
		var k;
		k = this.$val !== undefined ? this.$val : this;
		if ((k >> 0) < kindNames.$length) {
			return ((k < 0 || k >= kindNames.$length) ? $throwRuntimeError("index out of range") : kindNames.$array[kindNames.$offset + k]);
		}
		return "kind" + strconv.Itoa((k >> 0));
	};
	$ptrType(Kind).prototype.String = function() { return new Kind(this.$get()).String(); };
	uncommonType.Ptr.prototype.uncommon = function() {
		var t;
		t = this;
		return t;
	};
	uncommonType.prototype.uncommon = function() { return this.$val.uncommon(); };
	uncommonType.Ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		if (t === ($ptrType(uncommonType)).nil || $pointerIsEqual(t.pkgPath, ($ptrType($String)).nil)) {
			return "";
		}
		return t.pkgPath.$get();
	};
	uncommonType.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	uncommonType.Ptr.prototype.Name = function() {
		var t;
		t = this;
		if (t === ($ptrType(uncommonType)).nil || $pointerIsEqual(t.name, ($ptrType($String)).nil)) {
			return "";
		}
		return t.name.$get();
	};
	uncommonType.prototype.Name = function() { return this.$val.Name(); };
	rtype.Ptr.prototype.String = function() {
		var t;
		t = this;
		return t.string.$get();
	};
	rtype.prototype.String = function() { return this.$val.String(); };
	rtype.Ptr.prototype.Size = function() {
		var t;
		t = this;
		return t.size;
	};
	rtype.prototype.Size = function() { return this.$val.Size(); };
	rtype.Ptr.prototype.Bits = function() {
		var t, k, x;
		t = this;
		if (t === ($ptrType(rtype)).nil) {
			$panic(new $String("reflect: Bits of nil Type"));
		}
		k = t.Kind();
		if (k < 2 || k > 16) {
			$panic(new $String("reflect: Bits of non-arithmetic Type " + t.String()));
		}
		return (x = (t.size >> 0), (((x >>> 16 << 16) * 8 >> 0) + (x << 16 >>> 16) * 8) >> 0);
	};
	rtype.prototype.Bits = function() { return this.$val.Bits(); };
	rtype.Ptr.prototype.Align = function() {
		var t;
		t = this;
		return (t.align >> 0);
	};
	rtype.prototype.Align = function() { return this.$val.Align(); };
	rtype.Ptr.prototype.FieldAlign = function() {
		var t;
		t = this;
		return (t.fieldAlign >> 0);
	};
	rtype.prototype.FieldAlign = function() { return this.$val.FieldAlign(); };
	rtype.Ptr.prototype.Kind = function() {
		var t;
		t = this;
		return (((t.kind & 127) >>> 0) >>> 0);
	};
	rtype.prototype.Kind = function() { return this.$val.Kind(); };
	rtype.Ptr.prototype.common = function() {
		var t;
		t = this;
		return t;
	};
	rtype.prototype.common = function() { return this.$val.common(); };
	uncommonType.Ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		if (t === ($ptrType(uncommonType)).nil) {
			return 0;
		}
		return t.methods.$length;
	};
	uncommonType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	uncommonType.Ptr.prototype.MethodByName = function(name) {
		var m = new Method.Ptr(), ok = false, t, p, _ref, _i, i, x, _tmp, _tmp$1;
		t = this;
		if (t === ($ptrType(uncommonType)).nil) {
			return [m, ok];
		}
		p = ($ptrType(method)).nil;
		_ref = t.methods;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (!($pointerIsEqual(p.name, ($ptrType($String)).nil)) && p.name.$get() === name) {
				_tmp = new Method.Ptr(); $copy(_tmp, t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	uncommonType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.Ptr.prototype.NumMethod = function() {
		var t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.interfaceType;
			return tt.NumMethod();
		}
		return t.uncommonType.NumMethod();
	};
	rtype.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	rtype.Ptr.prototype.Method = function(i) {
		var m = new Method.Ptr(), t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.interfaceType;
			$copy(m, tt.Method(i), Method);
			return m;
		}
		$copy(m, t.uncommonType.Method(i), Method);
		return m;
	};
	rtype.prototype.Method = function(i) { return this.$val.Method(i); };
	rtype.Ptr.prototype.MethodByName = function(name) {
		var m = new Method.Ptr(), ok = false, t, tt, _tuple, _tuple$1;
		t = this;
		if (t.Kind() === 20) {
			tt = t.interfaceType;
			_tuple = tt.MethodByName(name); $copy(m, _tuple[0], Method); ok = _tuple[1];
			return [m, ok];
		}
		_tuple$1 = t.uncommonType.MethodByName(name); $copy(m, _tuple$1[0], Method); ok = _tuple$1[1];
		return [m, ok];
	};
	rtype.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.Ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		return t.uncommonType.PkgPath();
	};
	rtype.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	rtype.Ptr.prototype.Name = function() {
		var t;
		t = this;
		return t.uncommonType.Name();
	};
	rtype.prototype.Name = function() { return this.$val.Name(); };
	rtype.Ptr.prototype.ChanDir = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 18))) {
			$panic(new $String("reflect: ChanDir of non-chan type"));
		}
		tt = t.chanType;
		return (tt.dir >> 0);
	};
	rtype.prototype.ChanDir = function() { return this.$val.ChanDir(); };
	rtype.Ptr.prototype.IsVariadic = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: IsVariadic of non-func type"));
		}
		tt = t.funcType;
		return tt.dotdotdot;
	};
	rtype.prototype.IsVariadic = function() { return this.$val.IsVariadic(); };
	rtype.Ptr.prototype.Elem = function() {
		var t, _ref, tt, tt$1, tt$2, tt$3, tt$4;
		t = this;
		_ref = t.Kind();
		if (_ref === 17) {
			tt = t.arrayType;
			return toType(tt.elem);
		} else if (_ref === 18) {
			tt$1 = t.chanType;
			return toType(tt$1.elem);
		} else if (_ref === 21) {
			tt$2 = t.mapType;
			return toType(tt$2.elem);
		} else if (_ref === 22) {
			tt$3 = t.ptrType;
			return toType(tt$3.elem);
		} else if (_ref === 23) {
			tt$4 = t.sliceType;
			return toType(tt$4.elem);
		}
		$panic(new $String("reflect: Elem of invalid type"));
	};
	rtype.prototype.Elem = function() { return this.$val.Elem(); };
	rtype.Ptr.prototype.Field = function(i) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: Field of non-struct type"));
		}
		tt = t.structType;
		return tt.Field(i);
	};
	rtype.prototype.Field = function(i) { return this.$val.Field(i); };
	rtype.Ptr.prototype.FieldByIndex = function(index) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByIndex of non-struct type"));
		}
		tt = t.structType;
		return tt.FieldByIndex(index);
	};
	rtype.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	rtype.Ptr.prototype.FieldByName = function(name) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByName of non-struct type"));
		}
		tt = t.structType;
		return tt.FieldByName(name);
	};
	rtype.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	rtype.Ptr.prototype.FieldByNameFunc = function(match) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByNameFunc of non-struct type"));
		}
		tt = t.structType;
		return tt.FieldByNameFunc(match);
	};
	rtype.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	rtype.Ptr.prototype.In = function(i) {
		var t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: In of non-func type"));
		}
		tt = t.funcType;
		return toType((x = tt.in$2, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
	};
	rtype.prototype.In = function(i) { return this.$val.In(i); };
	rtype.Ptr.prototype.Key = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 21))) {
			$panic(new $String("reflect: Key of non-map type"));
		}
		tt = t.mapType;
		return toType(tt.key);
	};
	rtype.prototype.Key = function() { return this.$val.Key(); };
	rtype.Ptr.prototype.Len = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 17))) {
			$panic(new $String("reflect: Len of non-array type"));
		}
		tt = t.arrayType;
		return (tt.len >> 0);
	};
	rtype.prototype.Len = function() { return this.$val.Len(); };
	rtype.Ptr.prototype.NumField = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: NumField of non-struct type"));
		}
		tt = t.structType;
		return tt.fields.$length;
	};
	rtype.prototype.NumField = function() { return this.$val.NumField(); };
	rtype.Ptr.prototype.NumIn = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumIn of non-func type"));
		}
		tt = t.funcType;
		return tt.in$2.$length;
	};
	rtype.prototype.NumIn = function() { return this.$val.NumIn(); };
	rtype.Ptr.prototype.NumOut = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumOut of non-func type"));
		}
		tt = t.funcType;
		return tt.out.$length;
	};
	rtype.prototype.NumOut = function() { return this.$val.NumOut(); };
	rtype.Ptr.prototype.Out = function(i) {
		var t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: Out of non-func type"));
		}
		tt = t.funcType;
		return toType((x = tt.out, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
	};
	rtype.prototype.Out = function(i) { return this.$val.Out(i); };
	ChanDir.prototype.String = function() {
		var d, _ref;
		d = this.$val !== undefined ? this.$val : this;
		_ref = d;
		if (_ref === 2) {
			return "chan<-";
		} else if (_ref === 1) {
			return "<-chan";
		} else if (_ref === 3) {
			return "chan";
		}
		return "ChanDir" + strconv.Itoa((d >> 0));
	};
	$ptrType(ChanDir).prototype.String = function() { return new ChanDir(this.$get()).String(); };
	interfaceType.Ptr.prototype.Method = function(i) {
		var m = new Method.Ptr(), t, x, p;
		t = this;
		if (i < 0 || i >= t.methods.$length) {
			return m;
		}
		p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		m.Name = p.name.$get();
		if (!($pointerIsEqual(p.pkgPath, ($ptrType($String)).nil))) {
			m.PkgPath = p.pkgPath.$get();
		}
		m.Type = toType(p.typ);
		m.Index = i;
		return m;
	};
	interfaceType.prototype.Method = function(i) { return this.$val.Method(i); };
	interfaceType.Ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		return t.methods.$length;
	};
	interfaceType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	interfaceType.Ptr.prototype.MethodByName = function(name) {
		var m = new Method.Ptr(), ok = false, t, p, _ref, _i, i, x, _tmp, _tmp$1;
		t = this;
		if (t === ($ptrType(interfaceType)).nil) {
			return [m, ok];
		}
		p = ($ptrType(imethod)).nil;
		_ref = t.methods;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (p.name.$get() === name) {
				_tmp = new Method.Ptr(); $copy(_tmp, t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	interfaceType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	StructTag.prototype.Get = function(key) {
		var tag, i, name, qvalue, _tuple, value;
		tag = this.$val !== undefined ? this.$val : this;
		while (!(tag === "")) {
			i = 0;
			while (i < tag.length && (tag.charCodeAt(i) === 32)) {
				i = i + (1) >> 0;
			}
			tag = tag.substring(i);
			if (tag === "") {
				break;
			}
			i = 0;
			while (i < tag.length && !((tag.charCodeAt(i) === 32)) && !((tag.charCodeAt(i) === 58)) && !((tag.charCodeAt(i) === 34))) {
				i = i + (1) >> 0;
			}
			if ((i + 1 >> 0) >= tag.length || !((tag.charCodeAt(i) === 58)) || !((tag.charCodeAt((i + 1 >> 0)) === 34))) {
				break;
			}
			name = tag.substring(0, i);
			tag = tag.substring((i + 1 >> 0));
			i = 1;
			while (i < tag.length && !((tag.charCodeAt(i) === 34))) {
				if (tag.charCodeAt(i) === 92) {
					i = i + (1) >> 0;
				}
				i = i + (1) >> 0;
			}
			if (i >= tag.length) {
				break;
			}
			qvalue = tag.substring(0, (i + 1 >> 0));
			tag = tag.substring((i + 1 >> 0));
			if (key === name) {
				_tuple = strconv.Unquote(qvalue); value = _tuple[0];
				return value;
			}
		}
		return "";
	};
	$ptrType(StructTag).prototype.Get = function(key) { return new StructTag(this.$get()).Get(key); };
	structType.Ptr.prototype.Field = function(i) {
		var f = new StructField.Ptr(), t, x, p, t$1;
		t = this;
		if (i < 0 || i >= t.fields.$length) {
			return f;
		}
		p = (x = t.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		f.Type = toType(p.typ);
		if (!($pointerIsEqual(p.name, ($ptrType($String)).nil))) {
			f.Name = p.name.$get();
		} else {
			t$1 = f.Type;
			if (t$1.Kind() === 22) {
				t$1 = t$1.Elem();
			}
			f.Name = t$1.Name();
			f.Anonymous = true;
		}
		if (!($pointerIsEqual(p.pkgPath, ($ptrType($String)).nil))) {
			f.PkgPath = p.pkgPath.$get();
		}
		if (!($pointerIsEqual(p.tag, ($ptrType($String)).nil))) {
			f.Tag = p.tag.$get();
		}
		f.Offset = p.offset;
		f.Index = new ($sliceType($Int))([i]);
		return f;
	};
	structType.prototype.Field = function(i) { return this.$val.Field(i); };
	structType.Ptr.prototype.FieldByIndex = function(index) {
		var f = new StructField.Ptr(), t, _ref, _i, i, x, ft;
		t = this;
		f.Type = toType(t.rtype);
		_ref = index;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			x = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (i > 0) {
				ft = f.Type;
				if ((ft.Kind() === 22) && (ft.Elem().Kind() === 25)) {
					ft = ft.Elem();
				}
				f.Type = ft;
			}
			$copy(f, f.Type.Field(x), StructField);
			_i++;
		}
		return f;
	};
	structType.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	structType.Ptr.prototype.FieldByNameFunc = function(match) {
		var result = new StructField.Ptr(), ok = false, t, current, next, nextCount, visited, _map, _key, _tmp, _tmp$1, count, _ref, _i, scan, t$1, _entry, _key$1, _ref$1, _i$1, i, x, f, fname, ntyp, _entry$1, _tmp$2, _tmp$3, styp, _entry$2, _key$2, _map$1, _key$3, _key$4, _entry$3, _key$5, index;
		t = this;
		current = new ($sliceType(fieldScan))([]);
		next = new ($sliceType(fieldScan))([new fieldScan.Ptr(t, ($sliceType($Int)).nil)]);
		nextCount = false;
		visited = (_map = new $Map(), _map);
		while (next.$length > 0) {
			_tmp = next; _tmp$1 = $subslice(current, 0, 0); current = _tmp; next = _tmp$1;
			count = nextCount;
			nextCount = false;
			_ref = current;
			_i = 0;
			while (_i < _ref.$length) {
				scan = new fieldScan.Ptr(); $copy(scan, ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), fieldScan);
				t$1 = scan.typ;
				if ((_entry = visited[t$1.$key()], _entry !== undefined ? _entry.v : false)) {
					_i++;
					continue;
				}
				_key$1 = t$1; (visited || $throwRuntimeError("assignment to entry in nil map"))[_key$1.$key()] = { k: _key$1, v: true };
				_ref$1 = t$1.fields;
				_i$1 = 0;
				while (_i$1 < _ref$1.$length) {
					i = _i$1;
					f = (x = t$1.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
					fname = "";
					ntyp = ($ptrType(rtype)).nil;
					if (!($pointerIsEqual(f.name, ($ptrType($String)).nil))) {
						fname = f.name.$get();
					} else {
						ntyp = f.typ;
						if (ntyp.Kind() === 22) {
							ntyp = ntyp.Elem().common();
						}
						fname = ntyp.Name();
					}
					if (match(fname)) {
						if ((_entry$1 = count[t$1.$key()], _entry$1 !== undefined ? _entry$1.v : 0) > 1 || ok) {
							_tmp$2 = new StructField.Ptr("", "", $ifaceNil, "", 0, ($sliceType($Int)).nil, false); _tmp$3 = false; $copy(result, _tmp$2, StructField); ok = _tmp$3;
							return [result, ok];
						}
						$copy(result, t$1.Field(i), StructField);
						result.Index = ($sliceType($Int)).nil;
						result.Index = $appendSlice(result.Index, scan.index);
						result.Index = $append(result.Index, i);
						ok = true;
						_i$1++;
						continue;
					}
					if (ok || ntyp === ($ptrType(rtype)).nil || !((ntyp.Kind() === 25))) {
						_i$1++;
						continue;
					}
					styp = ntyp.structType;
					if ((_entry$2 = nextCount[styp.$key()], _entry$2 !== undefined ? _entry$2.v : 0) > 0) {
						_key$2 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[_key$2.$key()] = { k: _key$2, v: 2 };
						_i$1++;
						continue;
					}
					if (nextCount === false) {
						nextCount = (_map$1 = new $Map(), _map$1);
					}
					_key$4 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[_key$4.$key()] = { k: _key$4, v: 1 };
					if ((_entry$3 = count[t$1.$key()], _entry$3 !== undefined ? _entry$3.v : 0) > 1) {
						_key$5 = styp; (nextCount || $throwRuntimeError("assignment to entry in nil map"))[_key$5.$key()] = { k: _key$5, v: 2 };
					}
					index = ($sliceType($Int)).nil;
					index = $appendSlice(index, scan.index);
					index = $append(index, i);
					next = $append(next, new fieldScan.Ptr(styp, index));
					_i$1++;
				}
				_i++;
			}
			if (ok) {
				break;
			}
		}
		return [result, ok];
	};
	structType.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	structType.Ptr.prototype.FieldByName = function(name) {
		var f = new StructField.Ptr(), present = false, t, hasAnon, _ref, _i, i, x, tf, _tmp, _tmp$1, _tuple;
		t = this;
		hasAnon = false;
		if (!(name === "")) {
			_ref = t.fields;
			_i = 0;
			while (_i < _ref.$length) {
				i = _i;
				tf = (x = t.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
				if ($pointerIsEqual(tf.name, ($ptrType($String)).nil)) {
					hasAnon = true;
					_i++;
					continue;
				}
				if (tf.name.$get() === name) {
					_tmp = new StructField.Ptr(); $copy(_tmp, t.Field(i), StructField); _tmp$1 = true; $copy(f, _tmp, StructField); present = _tmp$1;
					return [f, present];
				}
				_i++;
			}
		}
		if (!hasAnon) {
			return [f, present];
		}
		_tuple = t.FieldByNameFunc((function(s) {
			return s === name;
		})); $copy(f, _tuple[0], StructField); present = _tuple[1];
		return [f, present];
	};
	structType.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	PtrTo = $pkg.PtrTo = function(t) {
		return $assertType(t, ($ptrType(rtype))).ptrTo();
	};
	rtype.Ptr.prototype.Implements = function(u) {
		var t;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.Implements"));
		}
		if (!((u.Kind() === 20))) {
			$panic(new $String("reflect: non-interface type passed to Type.Implements"));
		}
		return implements$1($assertType(u, ($ptrType(rtype))), t);
	};
	rtype.prototype.Implements = function(u) { return this.$val.Implements(u); };
	rtype.Ptr.prototype.AssignableTo = function(u) {
		var t, uu;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.AssignableTo"));
		}
		uu = $assertType(u, ($ptrType(rtype)));
		return directlyAssignable(uu, t) || implements$1(uu, t);
	};
	rtype.prototype.AssignableTo = function(u) { return this.$val.AssignableTo(u); };
	rtype.Ptr.prototype.ConvertibleTo = function(u) {
		var t, uu;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.ConvertibleTo"));
		}
		uu = $assertType(u, ($ptrType(rtype)));
		return !(convertOp(uu, t) === $throwNilPointerError);
	};
	rtype.prototype.ConvertibleTo = function(u) { return this.$val.ConvertibleTo(u); };
	implements$1 = function(T, V) {
		var t, v, i, j, x, tm, x$1, vm, v$1, i$1, j$1, x$2, tm$1, x$3, vm$1;
		if (!((T.Kind() === 20))) {
			return false;
		}
		t = T.interfaceType;
		if (t.methods.$length === 0) {
			return true;
		}
		if (V.Kind() === 20) {
			v = V.interfaceType;
			i = 0;
			j = 0;
			while (j < v.methods.$length) {
				tm = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
				vm = (x$1 = v.methods, ((j < 0 || j >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + j]));
				if ($pointerIsEqual(vm.name, tm.name) && $pointerIsEqual(vm.pkgPath, tm.pkgPath) && vm.typ === tm.typ) {
					i = i + (1) >> 0;
					if (i >= t.methods.$length) {
						return true;
					}
				}
				j = j + (1) >> 0;
			}
			return false;
		}
		v$1 = V.uncommonType.uncommon();
		if (v$1 === ($ptrType(uncommonType)).nil) {
			return false;
		}
		i$1 = 0;
		j$1 = 0;
		while (j$1 < v$1.methods.$length) {
			tm$1 = (x$2 = t.methods, ((i$1 < 0 || i$1 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$1]));
			vm$1 = (x$3 = v$1.methods, ((j$1 < 0 || j$1 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + j$1]));
			if ($pointerIsEqual(vm$1.name, tm$1.name) && $pointerIsEqual(vm$1.pkgPath, tm$1.pkgPath) && vm$1.mtyp === tm$1.typ) {
				i$1 = i$1 + (1) >> 0;
				if (i$1 >= t.methods.$length) {
					return true;
				}
			}
			j$1 = j$1 + (1) >> 0;
		}
		return false;
	};
	directlyAssignable = function(T, V) {
		if (T === V) {
			return true;
		}
		if (!(T.Name() === "") && !(V.Name() === "") || !((T.Kind() === V.Kind()))) {
			return false;
		}
		return haveIdenticalUnderlyingType(T, V);
	};
	haveIdenticalUnderlyingType = function(T, V) {
		var kind, _ref, t, v, _ref$1, _i, i, typ, x, _ref$2, _i$1, i$1, typ$1, x$1, t$1, v$1, t$2, v$2, _ref$3, _i$2, i$2, x$2, tf, x$3, vf;
		if (T === V) {
			return true;
		}
		kind = T.Kind();
		if (!((kind === V.Kind()))) {
			return false;
		}
		if (1 <= kind && kind <= 16 || (kind === 24) || (kind === 26)) {
			return true;
		}
		_ref = kind;
		if (_ref === 17) {
			return $interfaceIsEqual(T.Elem(), V.Elem()) && (T.Len() === V.Len());
		} else if (_ref === 18) {
			if ((V.ChanDir() === 3) && $interfaceIsEqual(T.Elem(), V.Elem())) {
				return true;
			}
			return (V.ChanDir() === T.ChanDir()) && $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 19) {
			t = T.funcType;
			v = V.funcType;
			if (!(t.dotdotdot === v.dotdotdot) || !((t.in$2.$length === v.in$2.$length)) || !((t.out.$length === v.out.$length))) {
				return false;
			}
			_ref$1 = t.in$2;
			_i = 0;
			while (_i < _ref$1.$length) {
				i = _i;
				typ = ((_i < 0 || _i >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i]);
				if (!(typ === (x = v.in$2, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])))) {
					return false;
				}
				_i++;
			}
			_ref$2 = t.out;
			_i$1 = 0;
			while (_i$1 < _ref$2.$length) {
				i$1 = _i$1;
				typ$1 = ((_i$1 < 0 || _i$1 >= _ref$2.$length) ? $throwRuntimeError("index out of range") : _ref$2.$array[_ref$2.$offset + _i$1]);
				if (!(typ$1 === (x$1 = v.out, ((i$1 < 0 || i$1 >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i$1])))) {
					return false;
				}
				_i$1++;
			}
			return true;
		} else if (_ref === 20) {
			t$1 = T.interfaceType;
			v$1 = V.interfaceType;
			if ((t$1.methods.$length === 0) && (v$1.methods.$length === 0)) {
				return true;
			}
			return false;
		} else if (_ref === 21) {
			return $interfaceIsEqual(T.Key(), V.Key()) && $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 22 || _ref === 23) {
			return $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 25) {
			t$2 = T.structType;
			v$2 = V.structType;
			if (!((t$2.fields.$length === v$2.fields.$length))) {
				return false;
			}
			_ref$3 = t$2.fields;
			_i$2 = 0;
			while (_i$2 < _ref$3.$length) {
				i$2 = _i$2;
				tf = (x$2 = t$2.fields, ((i$2 < 0 || i$2 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$2]));
				vf = (x$3 = v$2.fields, ((i$2 < 0 || i$2 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + i$2]));
				if (!($pointerIsEqual(tf.name, vf.name)) && ($pointerIsEqual(tf.name, ($ptrType($String)).nil) || $pointerIsEqual(vf.name, ($ptrType($String)).nil) || !(tf.name.$get() === vf.name.$get()))) {
					return false;
				}
				if (!($pointerIsEqual(tf.pkgPath, vf.pkgPath)) && ($pointerIsEqual(tf.pkgPath, ($ptrType($String)).nil) || $pointerIsEqual(vf.pkgPath, ($ptrType($String)).nil) || !(tf.pkgPath.$get() === vf.pkgPath.$get()))) {
					return false;
				}
				if (!(tf.typ === vf.typ)) {
					return false;
				}
				if (!($pointerIsEqual(tf.tag, vf.tag)) && ($pointerIsEqual(tf.tag, ($ptrType($String)).nil) || $pointerIsEqual(vf.tag, ($ptrType($String)).nil) || !(tf.tag.$get() === vf.tag.$get()))) {
					return false;
				}
				if (!((tf.offset === vf.offset))) {
					return false;
				}
				_i$2++;
			}
			return true;
		}
		return false;
	};
	toType = function(t) {
		if (t === ($ptrType(rtype)).nil) {
			return $ifaceNil;
		}
		return t;
	};
	flag.prototype.kind = function() {
		var f;
		f = this.$val !== undefined ? this.$val : this;
		return (((((f >>> 4 >>> 0)) & 31) >>> 0) >>> 0);
	};
	$ptrType(flag).prototype.kind = function() { return new flag(this.$get()).kind(); };
	Value.Ptr.prototype.pointer = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (!((v.typ.size === 4)) || !v.typ.pointers()) {
			$panic(new $String("can't call pointer on a non-pointer Value"));
		}
		if (!((((v.flag & 2) >>> 0) === 0))) {
			return v.ptr.$get();
		}
		return v.ptr;
	};
	Value.prototype.pointer = function() { return this.$val.pointer(); };
	ValueError.Ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Kind === 0) {
			return "reflect: call of " + e.Method + " on zero Value";
		}
		return "reflect: call of " + e.Method + " on " + (new Kind(e.Kind)).String() + " Value";
	};
	ValueError.prototype.Error = function() { return this.$val.Error(); };
	flag.prototype.mustBe = function(expected) {
		var f, k;
		f = this.$val !== undefined ? this.$val : this;
		k = (new flag(f)).kind();
		if (!((k === expected))) {
			$panic(new ValueError.Ptr(methodName(), k));
		}
	};
	$ptrType(flag).prototype.mustBe = function(expected) { return new flag(this.$get()).mustBe(expected); };
	flag.prototype.mustBeExported = function() {
		var f;
		f = this.$val !== undefined ? this.$val : this;
		if (f === 0) {
			$panic(new ValueError.Ptr(methodName(), 0));
		}
		if (!((((f & 1) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
	};
	$ptrType(flag).prototype.mustBeExported = function() { return new flag(this.$get()).mustBeExported(); };
	flag.prototype.mustBeAssignable = function() {
		var f;
		f = this.$val !== undefined ? this.$val : this;
		if (f === 0) {
			$panic(new ValueError.Ptr(methodName(), 0));
		}
		if (!((((f & 1) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
		if (((f & 4) >>> 0) === 0) {
			$panic(new $String("reflect: " + methodName() + " using unaddressable value"));
		}
	};
	$ptrType(flag).prototype.mustBeAssignable = function() { return new flag(this.$get()).mustBeAssignable(); };
	Value.Ptr.prototype.Addr = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (((v.flag & 4) >>> 0) === 0) {
			$panic(new $String("reflect.Value.Addr of unaddressable value"));
		}
		return new Value.Ptr(v.typ.ptrTo(), v.ptr, 0, ((((v.flag & 1) >>> 0)) | 352) >>> 0);
	};
	Value.prototype.Addr = function() { return this.$val.Addr(); };
	Value.Ptr.prototype.Bool = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(1);
		if (!((((v.flag & 2) >>> 0) === 0))) {
			return v.ptr.$get();
		}
		return v.scalar;
	};
	Value.prototype.Bool = function() { return this.$val.Bool(); };
	Value.Ptr.prototype.Bytes = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.Bytes of non-byte slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.Bytes = function() { return this.$val.Bytes(); };
	Value.Ptr.prototype.runes = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.Bytes of non-rune slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.runes = function() { return this.$val.runes(); };
	Value.Ptr.prototype.CanAddr = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return !((((v.flag & 4) >>> 0) === 0));
	};
	Value.prototype.CanAddr = function() { return this.$val.CanAddr(); };
	Value.Ptr.prototype.CanSet = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return ((v.flag & 5) >>> 0) === 4;
	};
	Value.prototype.CanSet = function() { return this.$val.CanSet(); };
	Value.Ptr.prototype.Call = function(in$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(19);
		(new flag(v.flag)).mustBeExported();
		return v.call("Call", in$1);
	};
	Value.prototype.Call = function(in$1) { return this.$val.Call(in$1); };
	Value.Ptr.prototype.CallSlice = function(in$1) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(19);
		(new flag(v.flag)).mustBeExported();
		return v.call("CallSlice", in$1);
	};
	Value.prototype.CallSlice = function(in$1) { return this.$val.CallSlice(in$1); };
	Value.Ptr.prototype.Complex = function() {
		var v, k, _ref, x, x$1;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 15) {
			if (!((((v.flag & 2) >>> 0) === 0))) {
				return (x = v.ptr.$get(), new $Complex128(x.$real, x.$imag));
			}
			return (x$1 = v.scalar, new $Complex128(x$1.$real, x$1.$imag));
		} else if (_ref === 16) {
			return v.ptr.$get();
		}
		$panic(new ValueError.Ptr("reflect.Value.Complex", k));
	};
	Value.prototype.Complex = function() { return this.$val.Complex(); };
	Value.Ptr.prototype.FieldByIndex = function(index) {
		var v, _ref, _i, i, x;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		_ref = index;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			x = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			if (i > 0) {
				if ((v.Kind() === 22) && (v.typ.Elem().Kind() === 25)) {
					if (v.IsNil()) {
						$panic(new $String("reflect: indirection through nil pointer to embedded struct"));
					}
					$copy(v, v.Elem(), Value);
				}
			}
			$copy(v, v.Field(x), Value);
			_i++;
		}
		return v;
	};
	Value.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	Value.Ptr.prototype.FieldByName = function(name) {
		var v, _tuple, f, ok;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		_tuple = v.typ.FieldByName(name); f = new StructField.Ptr(); $copy(f, _tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
	};
	Value.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	Value.Ptr.prototype.FieldByNameFunc = function(match) {
		var v, _tuple, f, ok;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		_tuple = v.typ.FieldByNameFunc(match); f = new StructField.Ptr(); $copy(f, _tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
	};
	Value.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	Value.Ptr.prototype.Float = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 13) {
			if (!((((v.flag & 2) >>> 0) === 0))) {
				return $coerceFloat32(v.ptr.$get());
			}
			return $coerceFloat32(v.scalar);
		} else if (_ref === 14) {
			if (!((((v.flag & 2) >>> 0) === 0))) {
				return v.ptr.$get();
			}
			return v.scalar;
		}
		$panic(new ValueError.Ptr("reflect.Value.Float", k));
	};
	Value.prototype.Float = function() { return this.$val.Float(); };
	Value.Ptr.prototype.Int = function() {
		var v, k, p, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		p = 0;
		if (!((((v.flag & 2) >>> 0) === 0))) {
			p = v.ptr;
		} else {
			p = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, v);
		}
		_ref = k;
		if (_ref === 2) {
			return new $Int64(0, p.$get());
		} else if (_ref === 3) {
			return new $Int64(0, p.$get());
		} else if (_ref === 4) {
			return new $Int64(0, p.$get());
		} else if (_ref === 5) {
			return new $Int64(0, p.$get());
		} else if (_ref === 6) {
			return p.$get();
		}
		$panic(new ValueError.Ptr("reflect.Value.Int", k));
	};
	Value.prototype.Int = function() { return this.$val.Int(); };
	Value.Ptr.prototype.CanInterface = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.flag === 0) {
			$panic(new ValueError.Ptr("reflect.Value.CanInterface", 0));
		}
		return ((v.flag & 1) >>> 0) === 0;
	};
	Value.prototype.CanInterface = function() { return this.$val.CanInterface(); };
	Value.Ptr.prototype.Interface = function() {
		var i = $ifaceNil, v;
		v = new Value.Ptr(); $copy(v, this, Value);
		i = valueInterface($clone(v, Value), true);
		return i;
	};
	Value.prototype.Interface = function() { return this.$val.Interface(); };
	Value.Ptr.prototype.InterfaceData = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(20);
		return v.ptr;
	};
	Value.prototype.InterfaceData = function() { return this.$val.InterfaceData(); };
	Value.Ptr.prototype.IsValid = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return !((v.flag === 0));
	};
	Value.prototype.IsValid = function() { return this.$val.IsValid(); };
	Value.Ptr.prototype.Kind = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		return (new flag(v.flag)).kind();
	};
	Value.prototype.Kind = function() { return this.$val.Kind(); };
	Value.Ptr.prototype.MapIndex = function(key) {
		var v, tt, k, e, typ, fl, c;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(21);
		tt = v.typ.mapType;
		$copy(key, key.assignTo("reflect.Value.MapIndex", tt.key, ($ptrType($emptyInterface)).nil), Value);
		k = 0;
		if (!((((key.flag & 2) >>> 0) === 0))) {
			k = key.ptr;
		} else if (key.typ.pointers()) {
			k = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		} else {
			k = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, key);
		}
		e = mapaccess(v.typ, v.pointer(), k);
		if (e === 0) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		typ = tt.elem;
		fl = ((((v.flag | key.flag) >>> 0)) & 1) >>> 0;
		fl = (fl | (((typ.Kind() >>> 0) << 4 >>> 0))) >>> 0;
		if (typ.size > 4) {
			c = unsafe_New(typ);
			memmove(c, e, typ.size);
			return new Value.Ptr(typ, c, 0, (fl | 2) >>> 0);
		} else if (typ.pointers()) {
			return new Value.Ptr(typ, e.$get(), 0, fl);
		} else {
			return new Value.Ptr(typ, 0, loadScalar(e, typ.size), fl);
		}
	};
	Value.prototype.MapIndex = function(key) { return this.$val.MapIndex(key); };
	Value.Ptr.prototype.MapKeys = function() {
		var v, tt, keyType, fl, m, mlen, it, a, i, key, c;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(21);
		tt = v.typ.mapType;
		keyType = tt.key;
		fl = (((v.flag & 1) >>> 0) | ((keyType.Kind() >>> 0) << 4 >>> 0)) >>> 0;
		m = v.pointer();
		mlen = 0;
		if (!(m === 0)) {
			mlen = maplen(m);
		}
		it = mapiterinit(v.typ, m);
		a = ($sliceType(Value)).make(mlen);
		i = 0;
		i = 0;
		while (i < a.$length) {
			key = mapiterkey(it);
			if (key === 0) {
				break;
			}
			if (keyType.size > 4) {
				c = unsafe_New(keyType);
				memmove(c, key, keyType.size);
				$copy(((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]), new Value.Ptr(keyType, c, 0, (fl | 2) >>> 0), Value);
			} else if (keyType.pointers()) {
				$copy(((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]), new Value.Ptr(keyType, key.$get(), 0, fl), Value);
			} else {
				$copy(((i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i]), new Value.Ptr(keyType, 0, loadScalar(key, keyType.size), fl), Value);
			}
			mapiternext(it);
			i = i + (1) >> 0;
		}
		return $subslice(a, 0, i);
	};
	Value.prototype.MapKeys = function() { return this.$val.MapKeys(); };
	Value.Ptr.prototype.Method = function(i) {
		var v, fl;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.Method", 0));
		}
		if (!((((v.flag & 8) >>> 0) === 0)) || i < 0 || i >= v.typ.NumMethod()) {
			$panic(new $String("reflect: Method index out of range"));
		}
		if ((v.typ.Kind() === 20) && v.IsNil()) {
			$panic(new $String("reflect: Method on nil interface value"));
		}
		fl = (v.flag & 3) >>> 0;
		fl = (fl | (304)) >>> 0;
		fl = (fl | (((((i >>> 0) << 9 >>> 0) | 8) >>> 0))) >>> 0;
		return new Value.Ptr(v.typ, v.ptr, v.scalar, fl);
	};
	Value.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.Ptr.prototype.NumMethod = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.NumMethod", 0));
		}
		if (!((((v.flag & 8) >>> 0) === 0))) {
			return 0;
		}
		return v.typ.NumMethod();
	};
	Value.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	Value.Ptr.prototype.MethodByName = function(name) {
		var v, _tuple, m, ok;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.MethodByName", 0));
		}
		if (!((((v.flag & 8) >>> 0) === 0))) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		_tuple = v.typ.MethodByName(name); m = new Method.Ptr(); $copy(m, _tuple[0], Method); ok = _tuple[1];
		if (!ok) {
			return new Value.Ptr(($ptrType(rtype)).nil, 0, 0, 0);
		}
		return v.Method(m.Index);
	};
	Value.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	Value.Ptr.prototype.NumField = function() {
		var v, tt;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(25);
		tt = v.typ.structType;
		return tt.fields.$length;
	};
	Value.prototype.NumField = function() { return this.$val.NumField(); };
	Value.Ptr.prototype.OverflowComplex = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 15) {
			return overflowFloat32(x.$real) || overflowFloat32(x.$imag);
		} else if (_ref === 16) {
			return false;
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowComplex", k));
	};
	Value.prototype.OverflowComplex = function(x) { return this.$val.OverflowComplex(x); };
	Value.Ptr.prototype.OverflowFloat = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 13) {
			return overflowFloat32(x);
		} else if (_ref === 14) {
			return false;
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowFloat", k));
	};
	Value.prototype.OverflowFloat = function(x) { return this.$val.OverflowFloat(x); };
	overflowFloat32 = function(x) {
		if (x < 0) {
			x = -x;
		}
		return 3.4028234663852886e+38 < x && x <= 1.7976931348623157e+308;
	};
	Value.Ptr.prototype.OverflowInt = function(x) {
		var v, k, _ref, x$1, bitSize, trunc;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			bitSize = (x$1 = v.typ.size, (((x$1 >>> 16 << 16) * 8 >>> 0) + (x$1 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightInt64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowInt", k));
	};
	Value.prototype.OverflowInt = function(x) { return this.$val.OverflowInt(x); };
	Value.Ptr.prototype.OverflowUint = function(x) {
		var v, k, _ref, x$1, bitSize, trunc;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 7 || _ref === 12 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11) {
			bitSize = (x$1 = v.typ.size, (((x$1 >>> 16 << 16) * 8 >>> 0) + (x$1 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightUint64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.Ptr("reflect.Value.OverflowUint", k));
	};
	Value.prototype.OverflowUint = function(x) { return this.$val.OverflowUint(x); };
	Value.Ptr.prototype.SetBool = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(1);
		v.ptr.$set(x);
	};
	Value.prototype.SetBool = function(x) { return this.$val.SetBool(x); };
	Value.Ptr.prototype.SetBytes = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.SetBytes of non-byte slice"));
		}
		v.ptr.$set(x);
	};
	Value.prototype.SetBytes = function(x) { return this.$val.SetBytes(x); };
	Value.Ptr.prototype.setRunes = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.setRunes of non-rune slice"));
		}
		v.ptr.$set(x);
	};
	Value.prototype.setRunes = function(x) { return this.$val.setRunes(x); };
	Value.Ptr.prototype.SetComplex = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 15) {
			v.ptr.$set(new $Complex64(x.$real, x.$imag));
		} else if (_ref === 16) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetComplex", k));
		}
	};
	Value.prototype.SetComplex = function(x) { return this.$val.SetComplex(x); };
	Value.Ptr.prototype.SetFloat = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 13) {
			v.ptr.$set(x);
		} else if (_ref === 14) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetFloat", k));
		}
	};
	Value.prototype.SetFloat = function(x) { return this.$val.SetFloat(x); };
	Value.Ptr.prototype.SetInt = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 2) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
		} else if (_ref === 3) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) << 24 >> 24));
		} else if (_ref === 4) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) << 16 >> 16));
		} else if (_ref === 5) {
			v.ptr.$set(((x.$low + ((x.$high >> 31) * 4294967296)) >> 0));
		} else if (_ref === 6) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetInt", k));
		}
	};
	Value.prototype.SetInt = function(x) { return this.$val.SetInt(x); };
	Value.Ptr.prototype.SetMapIndex = function(key, val) {
		var v, tt, k, e;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBe(21);
		(new flag(v.flag)).mustBeExported();
		(new flag(key.flag)).mustBeExported();
		tt = v.typ.mapType;
		$copy(key, key.assignTo("reflect.Value.SetMapIndex", tt.key, ($ptrType($emptyInterface)).nil), Value);
		k = 0;
		if (!((((key.flag & 2) >>> 0) === 0))) {
			k = key.ptr;
		} else if (key.typ.pointers()) {
			k = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		} else {
			k = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, key);
		}
		if (val.typ === ($ptrType(rtype)).nil) {
			mapdelete(v.typ, v.pointer(), k);
			return;
		}
		(new flag(val.flag)).mustBeExported();
		$copy(val, val.assignTo("reflect.Value.SetMapIndex", tt.elem, ($ptrType($emptyInterface)).nil), Value);
		e = 0;
		if (!((((val.flag & 2) >>> 0) === 0))) {
			e = val.ptr;
		} else if (val.typ.pointers()) {
			e = new ($ptrType($UnsafePointer))(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, val);
		} else {
			e = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, val);
		}
		mapassign(v.typ, v.pointer(), k, e);
	};
	Value.prototype.SetMapIndex = function(key, val) { return this.$val.SetMapIndex(key, val); };
	Value.Ptr.prototype.SetUint = function(x) {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 7) {
			v.ptr.$set((x.$low >>> 0));
		} else if (_ref === 8) {
			v.ptr.$set((x.$low << 24 >>> 24));
		} else if (_ref === 9) {
			v.ptr.$set((x.$low << 16 >>> 16));
		} else if (_ref === 10) {
			v.ptr.$set((x.$low >>> 0));
		} else if (_ref === 11) {
			v.ptr.$set(x);
		} else if (_ref === 12) {
			v.ptr.$set((x.$low >>> 0));
		} else {
			$panic(new ValueError.Ptr("reflect.Value.SetUint", k));
		}
	};
	Value.prototype.SetUint = function(x) { return this.$val.SetUint(x); };
	Value.Ptr.prototype.SetPointer = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(26);
		v.ptr.$set(x);
	};
	Value.prototype.SetPointer = function(x) { return this.$val.SetPointer(x); };
	Value.Ptr.prototype.SetString = function(x) {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		(new flag(v.flag)).mustBeAssignable();
		(new flag(v.flag)).mustBe(24);
		v.ptr.$set(x);
	};
	Value.prototype.SetString = function(x) { return this.$val.SetString(x); };
	Value.Ptr.prototype.String = function() {
		var v, k, _ref;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		_ref = k;
		if (_ref === 0) {
			return "<invalid Value>";
		} else if (_ref === 24) {
			return v.ptr.$get();
		}
		return "<" + v.typ.String() + " Value>";
	};
	Value.prototype.String = function() { return this.$val.String(); };
	Value.Ptr.prototype.Type = function() {
		var v, f, i, tt, x, m, ut, x$1, m$1;
		v = new Value.Ptr(); $copy(v, this, Value);
		f = v.flag;
		if (f === 0) {
			$panic(new ValueError.Ptr("reflect.Value.Type", 0));
		}
		if (((f & 8) >>> 0) === 0) {
			return v.typ;
		}
		i = (v.flag >> 0) >> 9 >> 0;
		if (v.typ.Kind() === 20) {
			tt = v.typ.interfaceType;
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			return m.typ;
		}
		ut = v.typ.uncommonType.uncommon();
		if (ut === ($ptrType(uncommonType)).nil || i < 0 || i >= ut.methods.$length) {
			$panic(new $String("reflect: internal error: invalid method index"));
		}
		m$1 = (x$1 = ut.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
		return m$1.mtyp;
	};
	Value.prototype.Type = function() { return this.$val.Type(); };
	Value.Ptr.prototype.Uint = function() {
		var v, k, p, _ref, x;
		v = new Value.Ptr(); $copy(v, this, Value);
		k = (new flag(v.flag)).kind();
		p = 0;
		if (!((((v.flag & 2) >>> 0) === 0))) {
			p = v.ptr;
		} else {
			p = new ($ptrType($Uintptr))(function() { return this.$target.scalar; }, function($v) { this.$target.scalar = $v; }, v);
		}
		_ref = k;
		if (_ref === 7) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 8) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 9) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 10) {
			return new $Uint64(0, p.$get());
		} else if (_ref === 11) {
			return p.$get();
		} else if (_ref === 12) {
			return (x = p.$get(), new $Uint64(0, x.constructor === Number ? x : 1));
		}
		$panic(new ValueError.Ptr("reflect.Value.Uint", k));
	};
	Value.prototype.Uint = function() { return this.$val.Uint(); };
	Value.Ptr.prototype.UnsafeAddr = function() {
		var v;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (v.typ === ($ptrType(rtype)).nil) {
			$panic(new ValueError.Ptr("reflect.Value.UnsafeAddr", 0));
		}
		if (((v.flag & 4) >>> 0) === 0) {
			$panic(new $String("reflect.Value.UnsafeAddr of unaddressable value"));
		}
		return v.ptr;
	};
	Value.prototype.UnsafeAddr = function() { return this.$val.UnsafeAddr(); };
	New = $pkg.New = function(typ) {
		var ptr, fl;
		if ($interfaceIsEqual(typ, $ifaceNil)) {
			$panic(new $String("reflect: New(nil)"));
		}
		ptr = unsafe_New($assertType(typ, ($ptrType(rtype))));
		fl = 352;
		return new Value.Ptr(typ.common().ptrTo(), ptr, 0, fl);
	};
	Value.Ptr.prototype.assignTo = function(context, dst, target) {
		var v, fl, x;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (!((((v.flag & 8) >>> 0) === 0))) {
			$copy(v, makeMethodValue(context, $clone(v, Value)), Value);
		}
		if (directlyAssignable(dst, v.typ)) {
			v.typ = dst;
			fl = (v.flag & 7) >>> 0;
			fl = (fl | (((dst.Kind() >>> 0) << 4 >>> 0))) >>> 0;
			return new Value.Ptr(dst, v.ptr, v.scalar, fl);
		} else if (implements$1(dst, v.typ)) {
			if (target === ($ptrType($emptyInterface)).nil) {
				target = $newDataPointer($ifaceNil, ($ptrType($emptyInterface)));
			}
			x = valueInterface($clone(v, Value), false);
			if (dst.NumMethod() === 0) {
				target.$set(x);
			} else {
				ifaceE2I(dst, x, target);
			}
			return new Value.Ptr(dst, target, 0, 322);
		}
		$panic(new $String(context + ": value of type " + v.typ.String() + " is not assignable to type " + dst.String()));
	};
	Value.prototype.assignTo = function(context, dst, target) { return this.$val.assignTo(context, dst, target); };
	Value.Ptr.prototype.Convert = function(t) {
		var v, op;
		v = new Value.Ptr(); $copy(v, this, Value);
		if (!((((v.flag & 8) >>> 0) === 0))) {
			$copy(v, makeMethodValue("Convert", $clone(v, Value)), Value);
		}
		op = convertOp(t.common(), v.typ);
		if (op === $throwNilPointerError) {
			$panic(new $String("reflect.Value.Convert: value of type " + v.typ.String() + " cannot be converted to type " + t.String()));
		}
		return op($clone(v, Value), t);
	};
	Value.prototype.Convert = function(t) { return this.$val.Convert(t); };
	convertOp = function(dst, src) {
		var _ref, _ref$1, _ref$2, _ref$3, _ref$4, _ref$5, _ref$6;
		_ref = src.Kind();
		if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			_ref$1 = dst.Kind();
			if (_ref$1 === 2 || _ref$1 === 3 || _ref$1 === 4 || _ref$1 === 5 || _ref$1 === 6 || _ref$1 === 7 || _ref$1 === 8 || _ref$1 === 9 || _ref$1 === 10 || _ref$1 === 11 || _ref$1 === 12) {
				return cvtInt;
			} else if (_ref$1 === 13 || _ref$1 === 14) {
				return cvtIntFloat;
			} else if (_ref$1 === 24) {
				return cvtIntString;
			}
		} else if (_ref === 7 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11 || _ref === 12) {
			_ref$2 = dst.Kind();
			if (_ref$2 === 2 || _ref$2 === 3 || _ref$2 === 4 || _ref$2 === 5 || _ref$2 === 6 || _ref$2 === 7 || _ref$2 === 8 || _ref$2 === 9 || _ref$2 === 10 || _ref$2 === 11 || _ref$2 === 12) {
				return cvtUint;
			} else if (_ref$2 === 13 || _ref$2 === 14) {
				return cvtUintFloat;
			} else if (_ref$2 === 24) {
				return cvtUintString;
			}
		} else if (_ref === 13 || _ref === 14) {
			_ref$3 = dst.Kind();
			if (_ref$3 === 2 || _ref$3 === 3 || _ref$3 === 4 || _ref$3 === 5 || _ref$3 === 6) {
				return cvtFloatInt;
			} else if (_ref$3 === 7 || _ref$3 === 8 || _ref$3 === 9 || _ref$3 === 10 || _ref$3 === 11 || _ref$3 === 12) {
				return cvtFloatUint;
			} else if (_ref$3 === 13 || _ref$3 === 14) {
				return cvtFloat;
			}
		} else if (_ref === 15 || _ref === 16) {
			_ref$4 = dst.Kind();
			if (_ref$4 === 15 || _ref$4 === 16) {
				return cvtComplex;
			}
		} else if (_ref === 24) {
			if ((dst.Kind() === 23) && dst.Elem().PkgPath() === "") {
				_ref$5 = dst.Elem().Kind();
				if (_ref$5 === 8) {
					return cvtStringBytes;
				} else if (_ref$5 === 5) {
					return cvtStringRunes;
				}
			}
		} else if (_ref === 23) {
			if ((dst.Kind() === 24) && src.Elem().PkgPath() === "") {
				_ref$6 = src.Elem().Kind();
				if (_ref$6 === 8) {
					return cvtBytesString;
				} else if (_ref$6 === 5) {
					return cvtRunesString;
				}
			}
		}
		if (haveIdenticalUnderlyingType(dst, src)) {
			return cvtDirect;
		}
		if ((dst.Kind() === 22) && dst.Name() === "" && (src.Kind() === 22) && src.Name() === "" && haveIdenticalUnderlyingType(dst.Elem().common(), src.Elem().common())) {
			return cvtDirect;
		}
		if (implements$1(dst, src)) {
			if (src.Kind() === 20) {
				return cvtI2I;
			}
			return cvtT2I;
		}
		return $throwNilPointerError;
	};
	makeFloat = function(f, v, t) {
		var typ, ptr, s, _ref;
		typ = t.common();
		if (typ.size > 4) {
			ptr = unsafe_New(typ);
			ptr.$set(v);
			return new Value.Ptr(typ, ptr, 0, (((f | 2) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		s = 0;
		_ref = typ.size;
		if (_ref === 4) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set(v);
		} else if (_ref === 8) {
			new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set(v);
		}
		return new Value.Ptr(typ, 0, s, (f | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	makeComplex = function(f, v, t) {
		var typ, ptr, _ref, s;
		typ = t.common();
		if (typ.size > 4) {
			ptr = unsafe_New(typ);
			_ref = typ.size;
			if (_ref === 8) {
				ptr.$set(new $Complex64(v.$real, v.$imag));
			} else if (_ref === 16) {
				ptr.$set(v);
			}
			return new Value.Ptr(typ, ptr, 0, (((f | 2) >>> 0) | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
		}
		s = 0;
		new ($ptrType($Uintptr))(function() { return s; }, function($v) { s = $v; }).$set(new $Complex64(v.$real, v.$imag));
		return new Value.Ptr(typ, 0, s, (f | ((typ.Kind() >>> 0) << 4 >>> 0)) >>> 0);
	};
	makeString = function(f, v, t) {
		var ret;
		ret = new Value.Ptr(); $copy(ret, New(t).Elem(), Value);
		ret.SetString(v);
		ret.flag = ((ret.flag & ~4) | f) >>> 0;
		return ret;
	};
	makeBytes = function(f, v, t) {
		var ret;
		ret = new Value.Ptr(); $copy(ret, New(t).Elem(), Value);
		ret.SetBytes(v);
		ret.flag = ((ret.flag & ~4) | f) >>> 0;
		return ret;
	};
	makeRunes = function(f, v, t) {
		var ret;
		ret = new Value.Ptr(); $copy(ret, New(t).Elem(), Value);
		ret.setRunes(v);
		ret.flag = ((ret.flag & ~4) | f) >>> 0;
		return ret;
	};
	cvtInt = function(v, t) {
		var x;
		return makeInt((v.flag & 1) >>> 0, (x = v.Int(), new $Uint64(x.$high, x.$low)), t);
	};
	cvtUint = function(v, t) {
		return makeInt((v.flag & 1) >>> 0, v.Uint(), t);
	};
	cvtFloatInt = function(v, t) {
		var x;
		return makeInt((v.flag & 1) >>> 0, (x = new $Int64(0, v.Float()), new $Uint64(x.$high, x.$low)), t);
	};
	cvtFloatUint = function(v, t) {
		return makeInt((v.flag & 1) >>> 0, new $Uint64(0, v.Float()), t);
	};
	cvtIntFloat = function(v, t) {
		return makeFloat((v.flag & 1) >>> 0, $flatten64(v.Int()), t);
	};
	cvtUintFloat = function(v, t) {
		return makeFloat((v.flag & 1) >>> 0, $flatten64(v.Uint()), t);
	};
	cvtFloat = function(v, t) {
		return makeFloat((v.flag & 1) >>> 0, v.Float(), t);
	};
	cvtComplex = function(v, t) {
		return makeComplex((v.flag & 1) >>> 0, v.Complex(), t);
	};
	cvtIntString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $encodeRune(v.Int().$low), t);
	};
	cvtUintString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $encodeRune(v.Uint().$low), t);
	};
	cvtBytesString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $bytesToString(v.Bytes()), t);
	};
	cvtStringBytes = function(v, t) {
		return makeBytes((v.flag & 1) >>> 0, new ($sliceType($Uint8))($stringToBytes(v.String())), t);
	};
	cvtRunesString = function(v, t) {
		return makeString((v.flag & 1) >>> 0, $runesToString(v.runes()), t);
	};
	cvtStringRunes = function(v, t) {
		return makeRunes((v.flag & 1) >>> 0, new ($sliceType($Int32))($stringToRunes(v.String())), t);
	};
	cvtT2I = function(v, typ) {
		var target, x;
		target = $newDataPointer($ifaceNil, ($ptrType($emptyInterface)));
		x = valueInterface($clone(v, Value), false);
		if (typ.NumMethod() === 0) {
			target.$set(x);
		} else {
			ifaceE2I($assertType(typ, ($ptrType(rtype))), x, target);
		}
		return new Value.Ptr(typ.common(), target, 0, (((((v.flag & 1) >>> 0) | 2) >>> 0) | 320) >>> 0);
	};
	cvtI2I = function(v, typ) {
		var ret;
		if (v.IsNil()) {
			ret = new Value.Ptr(); $copy(ret, Zero(typ), Value);
			ret.flag = (ret.flag | (((v.flag & 1) >>> 0))) >>> 0;
			return ret;
		}
		return cvtT2I($clone(v.Elem(), Value), typ);
	};
	call = function() {
		$panic("Native function not implemented: reflect.call");
	};
	$pkg.$init = function() {
		mapIter.init([["t", "t", "reflect", Type, ""], ["m", "m", "reflect", js.Object, ""], ["keys", "keys", "reflect", js.Object, ""], ["i", "i", "reflect", $Int, ""]]);
		Type.init([["Align", "Align", "", $funcType([], [$Int], false)], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false)], ["Bits", "Bits", "", $funcType([], [$Int], false)], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false)], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false)], ["Elem", "Elem", "", $funcType([], [Type], false)], ["Field", "Field", "", $funcType([$Int], [StructField], false)], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false)], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false)], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false)], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false)], ["Implements", "Implements", "", $funcType([Type], [$Bool], false)], ["In", "In", "", $funcType([$Int], [Type], false)], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false)], ["Key", "Key", "", $funcType([], [Type], false)], ["Kind", "Kind", "", $funcType([], [Kind], false)], ["Len", "Len", "", $funcType([], [$Int], false)], ["Method", "Method", "", $funcType([$Int], [Method], false)], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false)], ["Name", "Name", "", $funcType([], [$String], false)], ["NumField", "NumField", "", $funcType([], [$Int], false)], ["NumIn", "NumIn", "", $funcType([], [$Int], false)], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false)], ["NumOut", "NumOut", "", $funcType([], [$Int], false)], ["Out", "Out", "", $funcType([$Int], [Type], false)], ["PkgPath", "PkgPath", "", $funcType([], [$String], false)], ["Size", "Size", "", $funcType([], [$Uintptr], false)], ["String", "String", "", $funcType([], [$String], false)], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false)], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false)]]);
		Kind.methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(Kind)).methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		rtype.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 9]];
		($ptrType(rtype)).methods = [["Align", "Align", "", $funcType([], [$Int], false), -1], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), -1], ["Bits", "Bits", "", $funcType([], [$Int], false), -1], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), -1], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), -1], ["Elem", "Elem", "", $funcType([], [Type], false), -1], ["Field", "Field", "", $funcType([$Int], [StructField], false), -1], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), -1], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), -1], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), -1], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), -1], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), -1], ["In", "In", "", $funcType([$Int], [Type], false), -1], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), -1], ["Key", "Key", "", $funcType([], [Type], false), -1], ["Kind", "Kind", "", $funcType([], [Kind], false), -1], ["Len", "Len", "", $funcType([], [$Int], false), -1], ["Method", "Method", "", $funcType([$Int], [Method], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), -1], ["Name", "Name", "", $funcType([], [$String], false), -1], ["NumField", "NumField", "", $funcType([], [$Int], false), -1], ["NumIn", "NumIn", "", $funcType([], [$Int], false), -1], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["NumOut", "NumOut", "", $funcType([], [$Int], false), -1], ["Out", "Out", "", $funcType([$Int], [Type], false), -1], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), -1], ["Size", "Size", "", $funcType([], [$Uintptr], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), -1], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), -1], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), -1], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 9]];
		rtype.init([["size", "size", "reflect", $Uintptr, ""], ["hash", "hash", "reflect", $Uint32, ""], ["_$2", "_", "reflect", $Uint8, ""], ["align", "align", "reflect", $Uint8, ""], ["fieldAlign", "fieldAlign", "reflect", $Uint8, ""], ["kind", "kind", "reflect", $Uint8, ""], ["alg", "alg", "reflect", ($ptrType($Uintptr)), ""], ["gc", "gc", "reflect", $UnsafePointer, ""], ["string", "string", "reflect", ($ptrType($String)), ""], ["uncommonType", "", "reflect", ($ptrType(uncommonType)), ""], ["ptrToThis", "ptrToThis", "reflect", ($ptrType(rtype)), ""], ["zero", "zero", "reflect", $UnsafePointer, ""]]);
		method.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["mtyp", "mtyp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["ifn", "ifn", "reflect", $UnsafePointer, ""], ["tfn", "tfn", "reflect", $UnsafePointer, ""]]);
		($ptrType(uncommonType)).methods = [["Method", "Method", "", $funcType([$Int], [Method], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), -1], ["Name", "Name", "", $funcType([], [$String], false), -1], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), -1], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), -1]];
		uncommonType.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["methods", "methods", "reflect", ($sliceType(method)), ""]]);
		ChanDir.methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		($ptrType(ChanDir)).methods = [["String", "String", "", $funcType([], [$String], false), -1]];
		arrayType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(arrayType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		arrayType.init([["rtype", "", "reflect", rtype, "reflect:\"array\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""], ["slice", "slice", "reflect", ($ptrType(rtype)), ""], ["len", "len", "reflect", $Uintptr, ""]]);
		chanType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(chanType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		chanType.init([["rtype", "", "reflect", rtype, "reflect:\"chan\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""], ["dir", "dir", "reflect", $Uintptr, ""]]);
		funcType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(funcType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		funcType.init([["rtype", "", "reflect", rtype, "reflect:\"func\""], ["dotdotdot", "dotdotdot", "reflect", $Bool, ""], ["in$2", "in", "reflect", ($sliceType(($ptrType(rtype)))), ""], ["out", "out", "reflect", ($sliceType(($ptrType(rtype)))), ""]]);
		imethod.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""]]);
		interfaceType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(interfaceType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), -1], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		interfaceType.init([["rtype", "", "reflect", rtype, "reflect:\"interface\""], ["methods", "methods", "reflect", ($sliceType(imethod)), ""]]);
		mapType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(mapType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		mapType.init([["rtype", "", "reflect", rtype, "reflect:\"map\""], ["key", "key", "reflect", ($ptrType(rtype)), ""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""], ["bucket", "bucket", "reflect", ($ptrType(rtype)), ""], ["hmap", "hmap", "reflect", ($ptrType(rtype)), ""]]);
		ptrType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(ptrType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		ptrType.init([["rtype", "", "reflect", rtype, "reflect:\"ptr\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""]]);
		sliceType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(sliceType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), 0], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), 0], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), 0], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), 0], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		sliceType.init([["rtype", "", "reflect", rtype, "reflect:\"slice\""], ["elem", "elem", "reflect", ($ptrType(rtype)), ""]]);
		structField.init([["name", "name", "reflect", ($ptrType($String)), ""], ["pkgPath", "pkgPath", "reflect", ($ptrType($String)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["tag", "tag", "reflect", ($ptrType($String)), ""], ["offset", "offset", "reflect", $Uintptr, ""]]);
		structType.methods = [["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		($ptrType(structType)).methods = [["Align", "Align", "", $funcType([], [$Int], false), 0], ["AssignableTo", "AssignableTo", "", $funcType([Type], [$Bool], false), 0], ["Bits", "Bits", "", $funcType([], [$Int], false), 0], ["ChanDir", "ChanDir", "", $funcType([], [ChanDir], false), 0], ["ConvertibleTo", "ConvertibleTo", "", $funcType([Type], [$Bool], false), 0], ["Elem", "Elem", "", $funcType([], [Type], false), 0], ["Field", "Field", "", $funcType([$Int], [StructField], false), -1], ["FieldAlign", "FieldAlign", "", $funcType([], [$Int], false), 0], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [StructField], false), -1], ["FieldByName", "FieldByName", "", $funcType([$String], [StructField, $Bool], false), -1], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [StructField, $Bool], false), -1], ["Implements", "Implements", "", $funcType([Type], [$Bool], false), 0], ["In", "In", "", $funcType([$Int], [Type], false), 0], ["IsVariadic", "IsVariadic", "", $funcType([], [$Bool], false), 0], ["Key", "Key", "", $funcType([], [Type], false), 0], ["Kind", "Kind", "", $funcType([], [Kind], false), 0], ["Len", "Len", "", $funcType([], [$Int], false), 0], ["Method", "Method", "", $funcType([$Int], [Method], false), 0], ["MethodByName", "MethodByName", "", $funcType([$String], [Method, $Bool], false), 0], ["Name", "Name", "", $funcType([], [$String], false), 0], ["NumField", "NumField", "", $funcType([], [$Int], false), 0], ["NumIn", "NumIn", "", $funcType([], [$Int], false), 0], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), 0], ["NumOut", "NumOut", "", $funcType([], [$Int], false), 0], ["Out", "Out", "", $funcType([$Int], [Type], false), 0], ["PkgPath", "PkgPath", "", $funcType([], [$String], false), 0], ["Size", "Size", "", $funcType([], [$Uintptr], false), 0], ["String", "String", "", $funcType([], [$String], false), 0], ["common", "common", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["pointers", "pointers", "reflect", $funcType([], [$Bool], false), 0], ["ptrTo", "ptrTo", "reflect", $funcType([], [($ptrType(rtype))], false), 0], ["uncommon", "uncommon", "reflect", $funcType([], [($ptrType(uncommonType))], false), 0]];
		structType.init([["rtype", "", "reflect", rtype, "reflect:\"struct\""], ["fields", "fields", "reflect", ($sliceType(structField)), ""]]);
		Method.init([["Name", "Name", "", $String, ""], ["PkgPath", "PkgPath", "", $String, ""], ["Type", "Type", "", Type, ""], ["Func", "Func", "", Value, ""], ["Index", "Index", "", $Int, ""]]);
		StructField.init([["Name", "Name", "", $String, ""], ["PkgPath", "PkgPath", "", $String, ""], ["Type", "Type", "", Type, ""], ["Tag", "Tag", "", StructTag, ""], ["Offset", "Offset", "", $Uintptr, ""], ["Index", "Index", "", ($sliceType($Int)), ""], ["Anonymous", "Anonymous", "", $Bool, ""]]);
		StructTag.methods = [["Get", "Get", "", $funcType([$String], [$String], false), -1]];
		($ptrType(StructTag)).methods = [["Get", "Get", "", $funcType([$String], [$String], false), -1]];
		fieldScan.init([["typ", "typ", "reflect", ($ptrType(structType)), ""], ["index", "index", "reflect", ($sliceType($Int)), ""]]);
		Value.methods = [["Addr", "Addr", "", $funcType([], [Value], false), -1], ["Bool", "Bool", "", $funcType([], [$Bool], false), -1], ["Bytes", "Bytes", "", $funcType([], [($sliceType($Uint8))], false), -1], ["Call", "Call", "", $funcType([($sliceType(Value))], [($sliceType(Value))], false), -1], ["CallSlice", "CallSlice", "", $funcType([($sliceType(Value))], [($sliceType(Value))], false), -1], ["CanAddr", "CanAddr", "", $funcType([], [$Bool], false), -1], ["CanInterface", "CanInterface", "", $funcType([], [$Bool], false), -1], ["CanSet", "CanSet", "", $funcType([], [$Bool], false), -1], ["Cap", "Cap", "", $funcType([], [$Int], false), -1], ["Close", "Close", "", $funcType([], [], false), -1], ["Complex", "Complex", "", $funcType([], [$Complex128], false), -1], ["Convert", "Convert", "", $funcType([Type], [Value], false), -1], ["Elem", "Elem", "", $funcType([], [Value], false), -1], ["Field", "Field", "", $funcType([$Int], [Value], false), -1], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [Value], false), -1], ["FieldByName", "FieldByName", "", $funcType([$String], [Value], false), -1], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [Value], false), -1], ["Float", "Float", "", $funcType([], [$Float64], false), -1], ["Index", "Index", "", $funcType([$Int], [Value], false), -1], ["Int", "Int", "", $funcType([], [$Int64], false), -1], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), -1], ["InterfaceData", "InterfaceData", "", $funcType([], [($arrayType($Uintptr, 2))], false), -1], ["IsNil", "IsNil", "", $funcType([], [$Bool], false), -1], ["IsValid", "IsValid", "", $funcType([], [$Bool], false), -1], ["Kind", "Kind", "", $funcType([], [Kind], false), -1], ["Len", "Len", "", $funcType([], [$Int], false), -1], ["MapIndex", "MapIndex", "", $funcType([Value], [Value], false), -1], ["MapKeys", "MapKeys", "", $funcType([], [($sliceType(Value))], false), -1], ["Method", "Method", "", $funcType([$Int], [Value], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Value], false), -1], ["NumField", "NumField", "", $funcType([], [$Int], false), -1], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["OverflowComplex", "OverflowComplex", "", $funcType([$Complex128], [$Bool], false), -1], ["OverflowFloat", "OverflowFloat", "", $funcType([$Float64], [$Bool], false), -1], ["OverflowInt", "OverflowInt", "", $funcType([$Int64], [$Bool], false), -1], ["OverflowUint", "OverflowUint", "", $funcType([$Uint64], [$Bool], false), -1], ["Pointer", "Pointer", "", $funcType([], [$Uintptr], false), -1], ["Recv", "Recv", "", $funcType([], [Value, $Bool], false), -1], ["Send", "Send", "", $funcType([Value], [], false), -1], ["Set", "Set", "", $funcType([Value], [], false), -1], ["SetBool", "SetBool", "", $funcType([$Bool], [], false), -1], ["SetBytes", "SetBytes", "", $funcType([($sliceType($Uint8))], [], false), -1], ["SetCap", "SetCap", "", $funcType([$Int], [], false), -1], ["SetComplex", "SetComplex", "", $funcType([$Complex128], [], false), -1], ["SetFloat", "SetFloat", "", $funcType([$Float64], [], false), -1], ["SetInt", "SetInt", "", $funcType([$Int64], [], false), -1], ["SetLen", "SetLen", "", $funcType([$Int], [], false), -1], ["SetMapIndex", "SetMapIndex", "", $funcType([Value, Value], [], false), -1], ["SetPointer", "SetPointer", "", $funcType([$UnsafePointer], [], false), -1], ["SetString", "SetString", "", $funcType([$String], [], false), -1], ["SetUint", "SetUint", "", $funcType([$Uint64], [], false), -1], ["Slice", "Slice", "", $funcType([$Int, $Int], [Value], false), -1], ["Slice3", "Slice3", "", $funcType([$Int, $Int, $Int], [Value], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["TryRecv", "TryRecv", "", $funcType([], [Value, $Bool], false), -1], ["TrySend", "TrySend", "", $funcType([Value], [$Bool], false), -1], ["Type", "Type", "", $funcType([], [Type], false), -1], ["Uint", "Uint", "", $funcType([], [$Uint64], false), -1], ["UnsafeAddr", "UnsafeAddr", "", $funcType([], [$Uintptr], false), -1], ["assignTo", "assignTo", "reflect", $funcType([$String, ($ptrType(rtype)), ($ptrType($emptyInterface))], [Value], false), -1], ["call", "call", "reflect", $funcType([$String, ($sliceType(Value))], [($sliceType(Value))], false), -1], ["iword", "iword", "reflect", $funcType([], [iword], false), -1], ["kind", "kind", "reflect", $funcType([], [Kind], false), 3], ["mustBe", "mustBe", "reflect", $funcType([Kind], [], false), 3], ["mustBeAssignable", "mustBeAssignable", "reflect", $funcType([], [], false), 3], ["mustBeExported", "mustBeExported", "reflect", $funcType([], [], false), 3], ["pointer", "pointer", "reflect", $funcType([], [$UnsafePointer], false), -1], ["recv", "recv", "reflect", $funcType([$Bool], [Value, $Bool], false), -1], ["runes", "runes", "reflect", $funcType([], [($sliceType($Int32))], false), -1], ["send", "send", "reflect", $funcType([Value, $Bool], [$Bool], false), -1], ["setRunes", "setRunes", "reflect", $funcType([($sliceType($Int32))], [], false), -1]];
		($ptrType(Value)).methods = [["Addr", "Addr", "", $funcType([], [Value], false), -1], ["Bool", "Bool", "", $funcType([], [$Bool], false), -1], ["Bytes", "Bytes", "", $funcType([], [($sliceType($Uint8))], false), -1], ["Call", "Call", "", $funcType([($sliceType(Value))], [($sliceType(Value))], false), -1], ["CallSlice", "CallSlice", "", $funcType([($sliceType(Value))], [($sliceType(Value))], false), -1], ["CanAddr", "CanAddr", "", $funcType([], [$Bool], false), -1], ["CanInterface", "CanInterface", "", $funcType([], [$Bool], false), -1], ["CanSet", "CanSet", "", $funcType([], [$Bool], false), -1], ["Cap", "Cap", "", $funcType([], [$Int], false), -1], ["Close", "Close", "", $funcType([], [], false), -1], ["Complex", "Complex", "", $funcType([], [$Complex128], false), -1], ["Convert", "Convert", "", $funcType([Type], [Value], false), -1], ["Elem", "Elem", "", $funcType([], [Value], false), -1], ["Field", "Field", "", $funcType([$Int], [Value], false), -1], ["FieldByIndex", "FieldByIndex", "", $funcType([($sliceType($Int))], [Value], false), -1], ["FieldByName", "FieldByName", "", $funcType([$String], [Value], false), -1], ["FieldByNameFunc", "FieldByNameFunc", "", $funcType([($funcType([$String], [$Bool], false))], [Value], false), -1], ["Float", "Float", "", $funcType([], [$Float64], false), -1], ["Index", "Index", "", $funcType([$Int], [Value], false), -1], ["Int", "Int", "", $funcType([], [$Int64], false), -1], ["Interface", "Interface", "", $funcType([], [$emptyInterface], false), -1], ["InterfaceData", "InterfaceData", "", $funcType([], [($arrayType($Uintptr, 2))], false), -1], ["IsNil", "IsNil", "", $funcType([], [$Bool], false), -1], ["IsValid", "IsValid", "", $funcType([], [$Bool], false), -1], ["Kind", "Kind", "", $funcType([], [Kind], false), -1], ["Len", "Len", "", $funcType([], [$Int], false), -1], ["MapIndex", "MapIndex", "", $funcType([Value], [Value], false), -1], ["MapKeys", "MapKeys", "", $funcType([], [($sliceType(Value))], false), -1], ["Method", "Method", "", $funcType([$Int], [Value], false), -1], ["MethodByName", "MethodByName", "", $funcType([$String], [Value], false), -1], ["NumField", "NumField", "", $funcType([], [$Int], false), -1], ["NumMethod", "NumMethod", "", $funcType([], [$Int], false), -1], ["OverflowComplex", "OverflowComplex", "", $funcType([$Complex128], [$Bool], false), -1], ["OverflowFloat", "OverflowFloat", "", $funcType([$Float64], [$Bool], false), -1], ["OverflowInt", "OverflowInt", "", $funcType([$Int64], [$Bool], false), -1], ["OverflowUint", "OverflowUint", "", $funcType([$Uint64], [$Bool], false), -1], ["Pointer", "Pointer", "", $funcType([], [$Uintptr], false), -1], ["Recv", "Recv", "", $funcType([], [Value, $Bool], false), -1], ["Send", "Send", "", $funcType([Value], [], false), -1], ["Set", "Set", "", $funcType([Value], [], false), -1], ["SetBool", "SetBool", "", $funcType([$Bool], [], false), -1], ["SetBytes", "SetBytes", "", $funcType([($sliceType($Uint8))], [], false), -1], ["SetCap", "SetCap", "", $funcType([$Int], [], false), -1], ["SetComplex", "SetComplex", "", $funcType([$Complex128], [], false), -1], ["SetFloat", "SetFloat", "", $funcType([$Float64], [], false), -1], ["SetInt", "SetInt", "", $funcType([$Int64], [], false), -1], ["SetLen", "SetLen", "", $funcType([$Int], [], false), -1], ["SetMapIndex", "SetMapIndex", "", $funcType([Value, Value], [], false), -1], ["SetPointer", "SetPointer", "", $funcType([$UnsafePointer], [], false), -1], ["SetString", "SetString", "", $funcType([$String], [], false), -1], ["SetUint", "SetUint", "", $funcType([$Uint64], [], false), -1], ["Slice", "Slice", "", $funcType([$Int, $Int], [Value], false), -1], ["Slice3", "Slice3", "", $funcType([$Int, $Int, $Int], [Value], false), -1], ["String", "String", "", $funcType([], [$String], false), -1], ["TryRecv", "TryRecv", "", $funcType([], [Value, $Bool], false), -1], ["TrySend", "TrySend", "", $funcType([Value], [$Bool], false), -1], ["Type", "Type", "", $funcType([], [Type], false), -1], ["Uint", "Uint", "", $funcType([], [$Uint64], false), -1], ["UnsafeAddr", "UnsafeAddr", "", $funcType([], [$Uintptr], false), -1], ["assignTo", "assignTo", "reflect", $funcType([$String, ($ptrType(rtype)), ($ptrType($emptyInterface))], [Value], false), -1], ["call", "call", "reflect", $funcType([$String, ($sliceType(Value))], [($sliceType(Value))], false), -1], ["iword", "iword", "reflect", $funcType([], [iword], false), -1], ["kind", "kind", "reflect", $funcType([], [Kind], false), 3], ["mustBe", "mustBe", "reflect", $funcType([Kind], [], false), 3], ["mustBeAssignable", "mustBeAssignable", "reflect", $funcType([], [], false), 3], ["mustBeExported", "mustBeExported", "reflect", $funcType([], [], false), 3], ["pointer", "pointer", "reflect", $funcType([], [$UnsafePointer], false), -1], ["recv", "recv", "reflect", $funcType([$Bool], [Value, $Bool], false), -1], ["runes", "runes", "reflect", $funcType([], [($sliceType($Int32))], false), -1], ["send", "send", "reflect", $funcType([Value, $Bool], [$Bool], false), -1], ["setRunes", "setRunes", "reflect", $funcType([($sliceType($Int32))], [], false), -1]];
		Value.init([["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["ptr", "ptr", "reflect", $UnsafePointer, ""], ["scalar", "scalar", "reflect", $Uintptr, ""], ["flag", "", "reflect", flag, ""]]);
		flag.methods = [["kind", "kind", "reflect", $funcType([], [Kind], false), -1], ["mustBe", "mustBe", "reflect", $funcType([Kind], [], false), -1], ["mustBeAssignable", "mustBeAssignable", "reflect", $funcType([], [], false), -1], ["mustBeExported", "mustBeExported", "reflect", $funcType([], [], false), -1]];
		($ptrType(flag)).methods = [["kind", "kind", "reflect", $funcType([], [Kind], false), -1], ["mustBe", "mustBe", "reflect", $funcType([Kind], [], false), -1], ["mustBeAssignable", "mustBeAssignable", "reflect", $funcType([], [], false), -1], ["mustBeExported", "mustBeExported", "reflect", $funcType([], [], false), -1]];
		($ptrType(ValueError)).methods = [["Error", "Error", "", $funcType([], [$String], false), -1]];
		ValueError.init([["Method", "Method", "", $String, ""], ["Kind", "Kind", "", Kind, ""]]);
		nonEmptyInterface.init([["itab", "itab", "reflect", ($ptrType(($structType([["ityp", "ityp", "reflect", ($ptrType(rtype)), ""], ["typ", "typ", "reflect", ($ptrType(rtype)), ""], ["link", "link", "reflect", $UnsafePointer, ""], ["bad", "bad", "reflect", $Int32, ""], ["unused", "unused", "reflect", $Int32, ""], ["fun", "fun", "reflect", ($arrayType($UnsafePointer, 100000)), ""]])))), ""], ["word", "word", "reflect", iword, ""]]);
		initialized = false;
		kindNames = new ($sliceType($String))(["invalid", "bool", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "float32", "float64", "complex64", "complex128", "array", "chan", "func", "interface", "map", "ptr", "slice", "string", "struct", "unsafe.Pointer"]);
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ($ptrType(rtype)));
		init();
	};
	return $pkg;
})();
$packages["main"] = (function() {
	var $pkg = {}, js = $packages["github.com/gopherjs/gopherjs/js"], jquery = $packages["github.com/gopherjs/jquery"], reflect = $packages["reflect"], Person, jq, main, startListeners;
	Person = $pkg.Person = $newType(0, "Struct", "main.Person", "Person", "main", function(Name_, Age_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.Age = Age_ !== undefined ? Age_ : 0;
	});
	main = function() {
		var p;
		console.log("starting...");
		p = new Person.Ptr("", 0);
		startListeners(p);
	};
	startListeners = function(model) {
		var objVal;
		objVal = new reflect.Value.Ptr(); $copy(objVal, reflect.ValueOf(model).Elem(), reflect.Value);
		jq(new ($sliceType($emptyInterface))([new $String("[data-bind-value]")])).On(new ($sliceType($emptyInterface))([new $String("input"), new ($funcType([jquery.Event], [], false))((function(e) {
			var prop, newVal;
			prop = jq(new ($sliceType($emptyInterface))([e.Object.currentTarget])).Attr("data-bind-value");
			newVal = jq(new ($sliceType($emptyInterface))([e.Object.currentTarget])).Val();
			objVal.FieldByName(prop).Set($clone(reflect.ValueOf(new $String(newVal)), reflect.Value));
		}))]));
		$global.watch(model, $externalize((function(prop, action, newValue, oldValue) {
			jq(new ($sliceType($emptyInterface))([new $String("[data-bind-html='" + prop + "']")])).SetHtml(new $String(newValue));
		}), ($funcType([$String, $String, $String, $String], [], false))));
	};
	$pkg.$run = function($b) {
		$packages["github.com/gopherjs/gopherjs/js"].$init();
		$packages["runtime"].$init();
		$packages["github.com/gopherjs/jquery"].$init();
		$packages["math"].$init();
		$packages["errors"].$init();
		$packages["unicode/utf8"].$init();
		$packages["strconv"].$init();
		$packages["sync/atomic"].$init();
		$packages["sync"].$init();
		$packages["reflect"].$init();
		$pkg.$init();
		main();
	};
	$pkg.$init = function() {
		Person.init([["Name", "Name", "", $String, ""], ["Age", "Age", "", $Int, ""]]);
		jq = jquery.NewJQuery;
	};
	return $pkg;
})();
$go($packages["main"].$run, [], true);

})();
//# sourceMappingURL=main.js.map
