"use strict";
(function($topLevelThis) {

Error.stackTraceLimit = Infinity;

var $global, $module;
if (typeof window !== "undefined") { /* web page */
  $global = window;
} else if (typeof self !== "undefined") { /* web worker */
  $global = self;
} else if (typeof global !== "undefined") { /* Node.js */
  $global = global;
  $global.require = require;
} else { /* others (e.g. Nashorn) */
  $global = $topLevelThis;
}

if ($global === undefined || $global.Array === undefined) {
  throw new Error("no global object found");
}
if (typeof module !== "undefined") {
  $module = module;
}

var $packages = {}, $idCounter = 0;
var $keys = function(m) { return m ? Object.keys(m) : []; };
var $min = Math.min;
var $mod = function(x, y) { return x % y; };
var $parseInt = parseInt;
var $parseFloat = function(f) {
  if (f !== undefined && f !== null && f.constructor === Number) {
    return f;
  }
  return parseFloat(f);
};
var $flushConsole = function() {};

var $mapArray = function(array, f) {
  var newArray = new array.constructor(array.length);
  for (var i = 0; i < array.length; i++) {
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
  var array = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    array[i] = str.charCodeAt(i);
  }
  return array;
};

var $bytesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i += 10000) {
    str += String.fromCharCode.apply(null, slice.$array.subarray(slice.$offset + i, slice.$offset + Math.min(slice.$length, i + 10000)));
  }
  return str;
};

var $stringToRunes = function(str) {
  var array = new Int32Array(str.length);
  var rune, j = 0;
  for (var i = 0; i < str.length; i += rune[1], j++) {
    rune = $decodeRune(str, i);
    array[j] = rune[0];
  }
  return array.subarray(0, j);
};

var $runesToString = function(slice) {
  if (slice.$length === 0) {
    return "";
  }
  var str = "";
  for (var i = 0; i < slice.$length; i++) {
    str += $encodeRune(slice.$array[slice.$offset + i]);
  }
  return str;
};

var $copyString = function(dst, src) {
  var n = Math.min(src.length, dst.$length);
  for (var i = 0; i < n; i++) {
    dst.$array[dst.$offset + i] = src.charCodeAt(i);
  }
  return n;
};

var $copySlice = function(dst, src) {
  var n = Math.min(src.$length, dst.$length);
  $internalCopy(dst.$array, src.$array, dst.$offset, src.$offset, n, dst.constructor.elem);
  return n;
};

var $copy = function(dst, src, type) {
  switch (type.kind) {
  case $kindArray:
    $internalCopy(dst, src, 0, 0, src.length, type.elem);
    break;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      switch (f.type.kind) {
      case $kindArray:
      case $kindStruct:
        $copy(dst[f.prop], src[f.prop], f.type);
        continue;
      default:
        dst[f.prop] = src[f.prop];
        continue;
      }
    }
    break;
  }
};

var $internalCopy = function(dst, src, dstOffset, srcOffset, n, elem) {
  if (n === 0 || (dst === src && dstOffset === srcOffset)) {
    return;
  }

  if (src.subarray) {
    dst.set(src.subarray(srcOffset, srcOffset + n), dstOffset);
    return;
  }

  switch (elem.kind) {
  case $kindArray:
  case $kindStruct:
    if (dst === src && dstOffset > srcOffset) {
      for (var i = n - 1; i >= 0; i--) {
        $copy(dst[dstOffset + i], src[srcOffset + i], elem);
      }
      return;
    }
    for (var i = 0; i < n; i++) {
      $copy(dst[dstOffset + i], src[srcOffset + i], elem);
    }
    return;
  }

  if (dst === src && dstOffset > srcOffset) {
    for (var i = n - 1; i >= 0; i--) {
      dst[dstOffset + i] = src[srcOffset + i];
    }
    return;
  }
  for (var i = 0; i < n; i++) {
    dst[dstOffset + i] = src[srcOffset + i];
  }
};

var $clone = function(src, type) {
  var clone = type.zero();
  $copy(clone, src, type);
  return clone;
};

var $pointerOfStructConversion = function(obj, type) {
  if(obj.$proxies === undefined) {
    obj.$proxies = {};
    obj.$proxies[obj.constructor.string] = obj;
  }
  var proxy = obj.$proxies[type.string];
  if (proxy === undefined) {
    var properties = {};
    for (var i = 0; i < type.elem.fields.length; i++) {
      (function(fieldProp) {
        properties[fieldProp] = {
          get: function() { return obj[fieldProp]; },
          set: function(value) { obj[fieldProp] = value; },
        };
      })(type.elem.fields[i].prop);
    }
    proxy = Object.create(type.prototype, properties);
    proxy.$val = proxy;
    obj.$proxies[type.string] = proxy;
    proxy.$proxies = obj.$proxies;
  }
  return proxy;
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
      var zero = slice.constructor.elem.zero;
      for (var i = slice.$length; i < newCapacity; i++) {
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
  switch (type.kind) {
  case $kindFloat32:
    return $float32IsEqual(a, b);
  case $kindComplex64:
    return $float32IsEqual(a.$real, b.$real) && $float32IsEqual(a.$imag, b.$imag);
  case $kindComplex128:
    return a.$real === b.$real && a.$imag === b.$imag;
  case $kindInt64:
  case $kindUint64:
    return a.$high === b.$high && a.$low === b.$low;
  case $kindPtr:
    if (a.constructor.elem) {
      return a === b;
    }
    return $pointerIsEqual(a, b);
  case $kindArray:
    if (a.length != b.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (!$equal(a[i], b[i], type.elem)) {
        return false;
      }
    }
    return true;
  case $kindStruct:
    for (var i = 0; i < type.fields.length; i++) {
      var f = type.fields[i];
      if (!$equal(a[f.prop], b[f.prop], f.type)) {
        return false;
      }
    }
    return true;
  case $kindInterface:
    if (type === $js.Object) {
      return a === b;
    }
    return $interfaceIsEqual(a, b);
  default:
    return a === b;
  }
};

var $interfaceIsEqual = function(a, b) {
  if (a === $ifaceNil || b === $ifaceNil) {
    return a === b;
  }
  if (a.constructor !== b.constructor) {
    return false;
  }
  if (!a.constructor.comparable) {
    $throwRuntimeError("comparing uncomparable type " + a.constructor.string);
  }
  return $equal(a.$val, b.$val, a.constructor);
};

var $float32IsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a === 1/0 || b === 1/0 || a === -1/0 || b === -1/0 || a !== a || b !== b) {
    return false;
  }
  var math = $packages["math"];
  return math !== undefined && math.Float32bits(a) === math.Float32bits(b);
};

var $pointerIsEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  if (a.$get === $throwNilPointerError || b.$get === $throwNilPointerError) {
    return a.$get === $throwNilPointerError && b.$get === $throwNilPointerError;
  }
  var va = a.$get();
  var vb = b.$get();
  if (va !== vb) {
    return false;
  }
  var dummy = va + 1;
  a.$set(dummy);
  var equal = b.$get() === dummy;
  a.$set(va);
  return equal;
};

var $kindBool = 1;
var $kindInt = 2;
var $kindInt8 = 3;
var $kindInt16 = 4;
var $kindInt32 = 5;
var $kindInt64 = 6;
var $kindUint = 7;
var $kindUint8 = 8;
var $kindUint16 = 9;
var $kindUint32 = 10;
var $kindUint64 = 11;
var $kindUintptr = 12;
var $kindFloat32 = 13;
var $kindFloat64 = 14;
var $kindComplex64 = 15;
var $kindComplex128 = 16;
var $kindArray = 17;
var $kindChan = 18;
var $kindFunc = 19;
var $kindInterface = 20;
var $kindMap = 21;
var $kindPtr = 22;
var $kindSlice = 23;
var $kindString = 24;
var $kindStruct = 25;
var $kindUnsafePointer = 26;

var $newType = function(size, kind, string, name, pkg, constructor) {
  var typ;
  switch(kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindString:
  case $kindUnsafePointer:
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + this.$val; };
    break;

  case $kindFloat32:
  case $kindFloat64:
    typ = function(v) { this.$val = v; };
    typ.prototype.$key = function() { return string + "$" + $floatKey(this.$val); };
    break;

  case $kindInt64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case $kindUint64:
    typ = function(high, low) {
      this.$high = (high + Math.floor(Math.ceil(low) / 4294967296)) >>> 0;
      this.$low = low >>> 0;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$high + "$" + this.$low; };
    break;

  case $kindComplex64:
  case $kindComplex128:
    typ = function(real, imag) {
      this.$real = real;
      this.$imag = imag;
      this.$val = this;
    };
    typ.prototype.$key = function() { return string + "$" + this.$real + "$" + this.$imag; };
    break;

  case $kindArray:
    typ = function(v) { this.$val = v; };
    typ.ptr = $newType(4, $kindPtr, "*" + string, "", "", function(array) {
      this.$get = function() { return array; };
      this.$set = function(v) { $copy(this, v, typ); };
      this.$val = array;
    });
    typ.init = function(elem, len) {
      typ.elem = elem;
      typ.len = len;
      typ.comparable = elem.comparable;
      typ.prototype.$key = function() {
        return string + "$" + Array.prototype.join.call($mapArray(this.$val, function(e) {
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }), "$");
      };
      typ.ptr.init(typ);
      Object.defineProperty(typ.ptr.nil, "nilCheck", { get: $throwNilPointerError });
    };
    break;

  case $kindChan:
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
      typ.nil.$sendQueue = typ.nil.$recvQueue = { length: 0, push: function() {}, shift: function() { return undefined; }, indexOf: function() { return -1; } };
    };
    break;

  case $kindFunc:
    typ = function(v) { this.$val = v; };
    typ.init = function(params, results, variadic) {
      typ.params = params;
      typ.results = results;
      typ.variadic = variadic;
      typ.comparable = false;
    };
    break;

  case $kindInterface:
    typ = { implementedBy: {}, missingMethodFor: {} };
    typ.init = function(methods) {
      typ.methods = methods;
    };
    break;

  case $kindMap:
    typ = function(v) { this.$val = v; };
    typ.init = function(key, elem) {
      typ.key = key;
      typ.elem = elem;
      typ.comparable = false;
    };
    break;

  case $kindPtr:
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
      typ.elem = elem;
      typ.nil = new typ($throwNilPointerError, $throwNilPointerError);
    };
    break;

  case $kindSlice:
    typ = function(array) {
      if (array.constructor !== typ.nativeArray) {
        array = new typ.nativeArray(array);
      }
      this.$array = array;
      this.$offset = 0;
      this.$length = array.length;
      this.$capacity = array.length;
      this.$val = this;
    };
    typ.init = function(elem) {
      typ.elem = elem;
      typ.comparable = false;
      typ.nativeArray = $nativeArray(elem.kind);
      typ.nil = new typ([]);
    };
    break;

  case $kindStruct:
    typ = function(v) { this.$val = v; };
    typ.ptr = $newType(4, $kindPtr, "*" + string, "", "", constructor);
    typ.ptr.elem = typ;
    typ.ptr.prototype.$get = function() { return this; };
    typ.ptr.prototype.$set = function(v) { $copy(this, v, typ); };
    typ.init = function(fields) {
      typ.fields = fields;
      fields.forEach(function(f) {
        if (!f.type.comparable) {
          typ.comparable = false;
        }
      });
      typ.prototype.$key = function() {
        var val = this.$val;
        return string + "$" + $mapArray(fields, function(f) {
          var e = val[f.prop];
          var key = e.$key ? e.$key() : String(e);
          return key.replace(/\\/g, "\\\\").replace(/\$/g, "\\$");
        }).join("$");
      };
      /* nil value */
      var properties = {};
      fields.forEach(function(f) {
        properties[f.prop] = { get: $throwNilPointerError, set: $throwNilPointerError };
      });
      typ.ptr.nil = Object.create(constructor.prototype, properties);
      typ.ptr.nil.$val = typ.ptr.nil;
      /* methods for embedded fields */
      var forwardMethod = function(target, m, f) {
        if (target.prototype[m.prop] !== undefined) { return; }
        target.prototype[m.prop] = function() {
          var v = this.$val[f.prop];
          if (f.type === $js.Object) {
            v = new $js.container.ptr(v);
          }
          if (v.$val === undefined) {
            v = new f.type(v);
          }
          return v[m.prop].apply(v, arguments);
        };
      };
      fields.forEach(function(f) {
        if (f.name === "") {
          f.type.methods.forEach(function(m) {
            forwardMethod(typ, m, f);
            forwardMethod(typ.ptr, m, f);
          });
          $ptrType(f.type).methods.forEach(function(m) {
            forwardMethod(typ.ptr, m, f);
          });
        }
      });
    };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  switch (kind) {
  case $kindBool:
  case $kindMap:
    typ.zero = function() { return false; };
    break;

  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8 :
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindUnsafePointer:
  case $kindFloat32:
  case $kindFloat64:
    typ.zero = function() { return 0; };
    break;

  case $kindString:
    typ.zero = function() { return ""; };
    break;

  case $kindInt64:
  case $kindUint64:
  case $kindComplex64:
  case $kindComplex128:
    var zero = new typ(0, 0);
    typ.zero = function() { return zero; };
    break;

  case $kindChan:
  case $kindPtr:
  case $kindSlice:
    typ.zero = function() { return typ.nil; };
    break;

  case $kindFunc:
    typ.zero = function() { return $throwNilPointerError; };
    break;

  case $kindInterface:
    typ.zero = function() { return $ifaceNil; };
    break;

  case $kindArray:
    typ.zero = function() {
      var arrayClass = $nativeArray(typ.elem.kind);
      if (arrayClass !== Array) {
        return new arrayClass(typ.len);
      }
      var array = new Array(typ.len);
      for (var i = 0; i < typ.len; i++) {
        array[i] = typ.elem.zero();
      }
      return array;
    };
    break;

  case $kindStruct:
    typ.zero = function() { return new typ.ptr(); };
    break;

  default:
    $panic(new $String("invalid kind: " + kind));
  }

  typ.size = size;
  typ.kind = kind;
  typ.string = string;
  typ.typeName = name;
  typ.pkg = pkg;
  typ.methods = [];
  typ.comparable = true;
  var rt = null;
  return typ;
};

var $Bool          = $newType( 1, $kindBool,          "bool",           "bool",       "", null);
var $Int           = $newType( 4, $kindInt,           "int",            "int",        "", null);
var $Int8          = $newType( 1, $kindInt8,          "int8",           "int8",       "", null);
var $Int16         = $newType( 2, $kindInt16,         "int16",          "int16",      "", null);
var $Int32         = $newType( 4, $kindInt32,         "int32",          "int32",      "", null);
var $Int64         = $newType( 8, $kindInt64,         "int64",          "int64",      "", null);
var $Uint          = $newType( 4, $kindUint,          "uint",           "uint",       "", null);
var $Uint8         = $newType( 1, $kindUint8,         "uint8",          "uint8",      "", null);
var $Uint16        = $newType( 2, $kindUint16,        "uint16",         "uint16",     "", null);
var $Uint32        = $newType( 4, $kindUint32,        "uint32",         "uint32",     "", null);
var $Uint64        = $newType( 8, $kindUint64,        "uint64",         "uint64",     "", null);
var $Uintptr       = $newType( 4, $kindUintptr,       "uintptr",        "uintptr",    "", null);
var $Float32       = $newType( 4, $kindFloat32,       "float32",        "float32",    "", null);
var $Float64       = $newType( 8, $kindFloat64,       "float64",        "float64",    "", null);
var $Complex64     = $newType( 8, $kindComplex64,     "complex64",      "complex64",  "", null);
var $Complex128    = $newType(16, $kindComplex128,    "complex128",     "complex128", "", null);
var $String        = $newType( 8, $kindString,        "string",         "string",     "", null);
var $UnsafePointer = $newType( 4, $kindUnsafePointer, "unsafe.Pointer", "Pointer",    "", null);

var $anonTypeInits = [];
var $addAnonTypeInit = function(f) {
  if ($anonTypeInits === null) {
    f();
    return;
  }
  $anonTypeInits.push(f);
};
var $initAnonTypes = function() {
  $anonTypeInits.forEach(function(f) { f(); });
  $anonTypeInits = null;
};

var $nativeArray = function(elemKind) {
  switch (elemKind) {
  case $kindInt:
    return Int32Array;
  case $kindInt8:
    return Int8Array;
  case $kindInt16:
    return Int16Array;
  case $kindInt32:
    return Int32Array;
  case $kindUint:
    return Uint32Array;
  case $kindUint8:
    return Uint8Array;
  case $kindUint16:
    return Uint16Array;
  case $kindUint32:
    return Uint32Array;
  case $kindUintptr:
    return Uint32Array;
  case $kindFloat32:
    return Float32Array;
  case $kindFloat64:
    return Float64Array;
  default:
    return Array;
  }
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
    typ = $newType(12, $kindArray, string, "", "", null);
    $arrayTypes[string] = typ;
    $addAnonTypeInit(function() { typ.init(elem, len); });
  }
  return typ;
};

var $chanType = function(elem, sendOnly, recvOnly) {
  var string = (recvOnly ? "<-" : "") + "chan" + (sendOnly ? "<- " : " ") + elem.string;
  var field = sendOnly ? "SendChan" : (recvOnly ? "RecvChan" : "Chan");
  var typ = elem[field];
  if (typ === undefined) {
    typ = $newType(4, $kindChan, string, "", "", null);
    elem[field] = typ;
    $addAnonTypeInit(function() { typ.init(elem, sendOnly, recvOnly); });
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
    typ = $newType(4, $kindFunc, string, "", "", null);
    $funcTypes[string] = typ;
    $addAnonTypeInit(function() { typ.init(params, results, variadic); });
  }
  return typ;
};

var $interfaceTypes = {};
var $interfaceType = function(methods) {
  var string = "interface {}";
  if (methods.length !== 0) {
    string = "interface { " + $mapArray(methods, function(m) {
      return (m.pkg !== "" ? m.pkg + "." : "") + m.name + m.type.string.substr(4);
    }).join("; ") + " }";
  }
  var typ = $interfaceTypes[string];
  if (typ === undefined) {
    typ = $newType(8, $kindInterface, string, "", "", null);
    $interfaceTypes[string] = typ;
    $addAnonTypeInit(function() { typ.init(methods); });
  }
  return typ;
};
var $emptyInterface = $interfaceType([]);
var $ifaceNil = { $key: function() { return "nil"; } };
var $error = $newType(8, $kindInterface, "error", "error", "", null);
$error.init([{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}]);

var $Map = function() {};
(function() {
  var names = Object.getOwnPropertyNames(Object.prototype);
  for (var i = 0; i < names.length; i++) {
    $Map.prototype[names[i]] = undefined;
  }
})();
var $mapTypes = {};
var $mapType = function(key, elem) {
  var string = "map[" + key.string + "]" + elem.string;
  var typ = $mapTypes[string];
  if (typ === undefined) {
    typ = $newType(4, $kindMap, string, "", "", null);
    $mapTypes[string] = typ;
    $addAnonTypeInit(function() { typ.init(key, elem); });
  }
  return typ;
};


var $throwNilPointerError = function() { $throwRuntimeError("invalid memory address or nil pointer dereference"); };
var $ptrType = function(elem) {
  var typ = elem.ptr;
  if (typ === undefined) {
    typ = $newType(4, $kindPtr, "*" + elem.string, "", "", null);
    elem.ptr = typ;
    $addAnonTypeInit(function() { typ.init(elem); });
  }
  return typ;
};

var $newDataPointer = function(data, constructor) {
  if (constructor.elem.kind === $kindStruct) {
    return data;
  }
  return new constructor(function() { return data; }, function(v) { data = v; });
};

var $sliceType = function(elem) {
  var typ = elem.Slice;
  if (typ === undefined) {
    typ = $newType(12, $kindSlice, "[]" + elem.string, "", "", null);
    elem.Slice = typ;
    $addAnonTypeInit(function() { typ.init(elem); });
  }
  return typ;
};
var $makeSlice = function(typ, length, capacity) {
  capacity = capacity || length;
  var array = new typ.nativeArray(capacity);
  if (typ.nativeArray === Array) {
    for (var i = 0; i < capacity; i++) {
      array[i] = typ.elem.zero();
    }
  }
  var slice = new typ(array);
  slice.$length = length;
  return slice;
};

var $structTypes = {};
var $structType = function(fields) {
  var string = "struct { " + $mapArray(fields, function(f) {
    return f.name + " " + f.type.string + (f.tag !== "" ? (" \"" + f.tag.replace(/\\/g, "\\\\").replace(/"/g, "\\\"") + "\"") : "");
  }).join("; ") + " }";
  if (fields.length === 0) {
    string = "struct {}";
  }
  var typ = $structTypes[string];
  if (typ === undefined) {
    typ = $newType(0, $kindStruct, string, "", "", function() {
      this.$val = this;
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        var arg = arguments[i];
        this[f.prop] = arg !== undefined ? arg : f.type.zero();
      }
    });
    $structTypes[string] = typ;
    $anonTypeInits.push(function() {
      /* collect methods for anonymous fields */
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.name === "") {
          f.type.methods.forEach(function(m) {
            typ.methods.push(m);
            typ.ptr.methods.push(m);
          });
          $ptrType(f.type).methods.forEach(function(m) {
            typ.ptr.methods.push(m);
          });
        }
      };
      typ.init(fields);
    });
  }
  return typ;
};

var $assertType = function(value, type, returnTuple) {
  var isInterface = (type.kind === $kindInterface), ok, missingMethod = "";
  if (value === $ifaceNil) {
    ok = false;
  } else if (!isInterface) {
    ok = value.constructor === type;
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
          if (vm.name === tm.name && vm.pkg === tm.pkg && vm.type === tm.type) {
            found = true;
            break;
          }
        }
        if (!found) {
          ok = false;
          type.missingMethodFor[valueTypeString] = tm.name;
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
    $panic(new $packages["runtime"].TypeAssertionError.ptr("", (value === $ifaceNil ? "" : value.constructor.string), type.string, missingMethod));
  }

  if (!isInterface) {
    value = value.$val;
  }
  if (type === $js.Object) {
    value = value.Object;
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
  var high = 0, low = 0;
  if ((y.$low & 1) !== 0) {
    high = x.$high;
    low = x.$low;
  }
  for (var i = 1; i < 32; i++) {
    if ((y.$low & 1<<i) !== 0) {
      high += x.$high << i | x.$low >>> (32 - i);
      low += (x.$low << i) >>> 0;
    }
  }
  for (var i = 0; i < 32; i++) {
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

  var high = 0, low = 0, n = 0;
  while (yHigh < 2147483648 && ((xHigh > yHigh) || (xHigh === yHigh && xLow > yLow))) {
    yHigh = (yHigh << 1 | yLow >>> 31) >>> 0;
    yLow = (yLow << 1) >>> 0;
    n++;
  }
  for (var i = 0; i <= n; i++) {
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
      $panic(new $js.Error.ptr(jsErr));
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

  var call, localSkippedDeferFrames = 0;
  try {
    while (true) {
      if (deferred === null) {
        deferred = $deferFrames[$deferFrames.length - 1 - localSkippedDeferFrames];
        if (deferred === undefined) {
          var msg;
          if (localPanicValue.constructor === $String) {
            msg = localPanicValue.$val;
          } else if (localPanicValue.Error !== undefined) {
            msg = localPanicValue.Error();
          } else if (localPanicValue.String !== undefined) {
            msg = localPanicValue.String();
          } else {
            msg = localPanicValue;
          }
          var e = new Error(msg);
          if (localPanicValue.Stack !== undefined) {
            e.stack = localPanicValue.Stack();
            e.stack = msg + e.stack.substr(e.stack.indexOf("\n"));
          }
          throw e;
        }
      }
      var call = deferred.pop();
      if (call === undefined) {
        if (localPanicValue !== undefined) {
          localSkippedDeferFrames++;
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
    $skippedDeferFrames += localSkippedDeferFrames;
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
var $throw = function(err) { throw err; };
var $throwRuntimeError; /* set by package "runtime" */

var $BLOCKING = new Object();
var $nonblockingCall = function() {
  $panic(new $packages["runtime"].NotSupportedError.ptr("non-blocking call to blocking function, see https://github.com/gopherjs/gopherjs#goroutines"));
};

var $dummyGoroutine = { asleep: false, exit: false, panicStack: [] };
var $curGoroutine = $dummyGoroutine, $totalGoroutines = 0, $awakeGoroutines = 0, $checkForDeadlock = true;
var $go = function(fun, args, direct) {
  $totalGoroutines++;
  $awakeGoroutines++;
  args.push($BLOCKING);
  var goroutine = function() {
    var rescheduled = false;
    try {
      $curGoroutine = goroutine;
      $skippedDeferFrames = 0;
      $jumpToDefer = false;
      var r = fun.apply(undefined, args);
      if (r && r.$blocking) {
        fun = r;
        args = [];
        $schedule(goroutine, direct);
        rescheduled = true;
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
      if (goroutine.exit && !rescheduled) { /* also set by runtime.Goexit() */
        $totalGoroutines--;
        goroutine.asleep = true;
      }
      if (goroutine.asleep && !rescheduled) {
        $awakeGoroutines--;
        if ($awakeGoroutines === 0 && $totalGoroutines !== 0 && $checkForDeadlock) {
          console.error("fatal error: all goroutines are asleep - deadlock!");
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
  var ready = [];
  var selection = -1;
  for (var i = 0; i < comms.length; i++) {
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
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var queue = entry[0];
      var index = queue.indexOf(entry[1]);
      if (index !== -1) {
        queue.splice(index, 1);
      }
    }
  };
  for (var i = 0; i < comms.length; i++) {
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

var $js;

var $needsExternalization = function(t) {
  switch (t.kind) {
    case $kindBool:
    case $kindInt:
    case $kindInt8:
    case $kindInt16:
    case $kindInt32:
    case $kindUint:
    case $kindUint8:
    case $kindUint16:
    case $kindUint32:
    case $kindUintptr:
    case $kindFloat32:
    case $kindFloat64:
      return false;
    case $kindInterface:
      return t !== $js.Object;
    default:
      return true;
  }
};

var $externalize = function(v, t) {
  switch (t.kind) {
  case $kindBool:
  case $kindInt:
  case $kindInt8:
  case $kindInt16:
  case $kindInt32:
  case $kindUint:
  case $kindUint8:
  case $kindUint16:
  case $kindUint32:
  case $kindUintptr:
  case $kindFloat32:
  case $kindFloat64:
    return v;
  case $kindInt64:
  case $kindUint64:
    return $flatten64(v);
  case $kindArray:
    if ($needsExternalization(t.elem)) {
      return $mapArray(v, function(e) { return $externalize(e, t.elem); });
    }
    return v;
  case $kindFunc:
    if (v === $throwNilPointerError) {
      return null;
    }
    if (v.$externalizeWrapper === undefined) {
      $checkForDeadlock = false;
      var convert = false;
      for (var i = 0; i < t.params.length; i++) {
        convert = convert || (t.params[i] !== $js.Object);
      }
      for (var i = 0; i < t.results.length; i++) {
        convert = convert || $needsExternalization(t.results[i]);
      }
      v.$externalizeWrapper = v;
      if (convert) {
        v.$externalizeWrapper = function() {
          var args = [];
          for (var i = 0; i < t.params.length; i++) {
            if (t.variadic && i === t.params.length - 1) {
              var vt = t.params[i].elem, varargs = [];
              for (var j = i; j < arguments.length; j++) {
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
            for (var i = 0; i < t.results.length; i++) {
              result[i] = $externalize(result[i], t.results[i]);
            }
            return result;
          }
        };
      }
    }
    return v.$externalizeWrapper;
  case $kindInterface:
    if (t === $js.Object) {
      return v;
    }
    if (v === $ifaceNil) {
      return null;
    }
    return $externalize(v.$val, v.constructor);
  case $kindMap:
    var m = {};
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var entry = v[keys[i]];
      m[$externalize(entry.k, t.key)] = $externalize(entry.v, t.elem);
    }
    return m;
  case $kindPtr:
    return $externalize(v.$get(), t.elem);
  case $kindSlice:
    if ($needsExternalization(t.elem)) {
      return $mapArray($sliceToArray(v), function(e) { return $externalize(e, t.elem); });
    }
    return $sliceToArray(v);
  case $kindString:
    if (v.search(/^[\x00-\x7F]*$/) !== -1) {
      return v;
    }
    var s = "", r;
    for (var i = 0; i < v.length; i += r[1]) {
      r = $decodeRune(v, i);
      s += String.fromCharCode(r[0]);
    }
    return s;
  case $kindStruct:
    var timePkg = $packages["time"];
    if (timePkg && v.constructor === timePkg.Time.ptr) {
      var milli = $div64(v.UnixNano(), new $Int64(0, 1000000));
      return new Date($flatten64(milli));
    }

    var searchJsObject = function(v, t) {
      if (t === $js.Object) {
        return v;
      }
      if (t.kind === $kindPtr) {
        var o = searchJsObject(v.$get(), t.elem);
        if (o !== undefined) {
          return o;
        }
      }
      if (t.kind === $kindStruct) {
        for (var i = 0; i < t.fields.length; i++) {
          var f = t.fields[i];
          var o = searchJsObject(v[f.prop], f.type);
          if (o !== undefined) {
            return o;
          }
        }
      }
      return undefined;
    };
    var o = searchJsObject(v, t);
    if (o !== undefined) {
      return o;
    }

    o = {};
    for (var i = 0; i < t.fields.length; i++) {
      var f = t.fields[i];
      if (f.pkg !== "") { /* not exported */
        continue;
      }
      o[f.name] = $externalize(v[f.prop], f.type);
    }
    return o;
  }
  $panic(new $String("cannot externalize " + t.string));
};

var $internalize = function(v, t, recv) {
  switch (t.kind) {
  case $kindBool:
    return !!v;
  case $kindInt:
    return parseInt(v);
  case $kindInt8:
    return parseInt(v) << 24 >> 24;
  case $kindInt16:
    return parseInt(v) << 16 >> 16;
  case $kindInt32:
    return parseInt(v) >> 0;
  case $kindUint:
    return parseInt(v);
  case $kindUint8:
    return parseInt(v) << 24 >>> 24;
  case $kindUint16:
    return parseInt(v) << 16 >>> 16;
  case $kindUint32:
  case $kindUintptr:
    return parseInt(v) >>> 0;
  case $kindInt64:
  case $kindUint64:
    return new t(0, v);
  case $kindFloat32:
  case $kindFloat64:
    return parseFloat(v);
  case $kindArray:
    if (v.length !== t.len) {
      $throwRuntimeError("got array with wrong size from JavaScript native");
    }
    return $mapArray(v, function(e) { return $internalize(e, t.elem); });
  case $kindFunc:
    return function() {
      var args = [];
      for (var i = 0; i < t.params.length; i++) {
        if (t.variadic && i === t.params.length - 1) {
          var vt = t.params[i].elem, varargs = arguments[i];
          for (var j = 0; j < varargs.$length; j++) {
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
        for (var i = 0; i < t.results.length; i++) {
          result[i] = $internalize(result[i], t.results[i]);
        }
        return result;
      }
    };
  case $kindInterface:
    if (t === $js.Object) {
      return v;
    }
    if (t.methods.length !== 0) {
      $panic(new $String("cannot internalize " + t.string));
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
      var funcType = $funcType([$sliceType($emptyInterface)], [$js.Object], true);
      return new funcType($internalize(v, funcType));
    case Number:
      return new $Float64(parseFloat(v));
    case String:
      return new $String($internalize(v, $String));
    default:
      if ($global.Node && v instanceof $global.Node) {
        return new $js.container.ptr(v);
      }
      var mapType = $mapType($String, $emptyInterface);
      return new mapType($internalize(v, mapType));
    }
  case $kindMap:
    var m = new $Map();
    var keys = $keys(v);
    for (var i = 0; i < keys.length; i++) {
      var key = $internalize(keys[i], t.key);
      m[key.$key ? key.$key() : key] = { k: key, v: $internalize(v[keys[i]], t.elem) };
    }
    return m;
  case $kindPtr:
    if (t.elem.kind === $kindStruct) {
      return $internalize(v, t.elem);
    }
  case $kindSlice:
    return new t($mapArray(v, function(e) { return $internalize(e, t.elem); }));
  case $kindString:
    v = String(v);
    if (v.search(/^[\x00-\x7F]*$/) !== -1) {
      return v;
    }
    var s = "";
    for (var i = 0; i < v.length; i++) {
      s += $encodeRune(v.charCodeAt(i));
    }
    return s;
  case $kindStruct:
    var searchJsObject = function(v, t) {
      if (t === $js.Object) {
        return v;
      }
      if (t.kind === $kindPtr && t.elem.kind === $kindStruct) {
        var o = searchJsObject(v, t.elem);
        if (o !== undefined) {
          return o;
        }
      }
      if (t.kind === $kindStruct) {
        for (var i = 0; i < t.fields.length; i++) {
          var f = t.fields[i];
          var o = searchJsObject(v, f.type);
          if (o !== undefined) {
            var n = new t.ptr();
            n[f.prop] = o;
            return n;
          }
        }
      }
      return undefined;
    };
    var o = searchJsObject(v, t);
    if (o !== undefined) {
      return o;
    }
  }
  $panic(new $String("cannot internalize " + t.string));
};

$packages["github.com/gopherjs/gopherjs/js"] = (function() {
	var $pkg = {}, Object, container, Error, sliceType$1, ptrType, ptrType$1, init;
	Object = $pkg.Object = $newType(8, $kindInterface, "js.Object", "Object", "github.com/gopherjs/gopherjs/js", null);
	container = $pkg.container = $newType(0, $kindStruct, "js.container", "container", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : null;
	});
	Error = $pkg.Error = $newType(0, $kindStruct, "js.Error", "Error", "github.com/gopherjs/gopherjs/js", function(Object_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : null;
	});
	sliceType$1 = $sliceType($emptyInterface);
	ptrType = $ptrType(container);
	ptrType$1 = $ptrType(Error);
	container.ptr.prototype.Get = function(key) {
		var c;
		c = this;
		return c.Object[$externalize(key, $String)];
	};
	container.prototype.Get = function(key) { return this.$val.Get(key); };
	container.ptr.prototype.Set = function(key, value) {
		var c;
		c = this;
		c.Object[$externalize(key, $String)] = $externalize(value, $emptyInterface);
	};
	container.prototype.Set = function(key, value) { return this.$val.Set(key, value); };
	container.ptr.prototype.Delete = function(key) {
		var c;
		c = this;
		delete c.Object[$externalize(key, $String)];
	};
	container.prototype.Delete = function(key) { return this.$val.Delete(key); };
	container.ptr.prototype.Length = function() {
		var c;
		c = this;
		return $parseInt(c.Object.length);
	};
	container.prototype.Length = function() { return this.$val.Length(); };
	container.ptr.prototype.Index = function(i) {
		var c;
		c = this;
		return c.Object[i];
	};
	container.prototype.Index = function(i) { return this.$val.Index(i); };
	container.ptr.prototype.SetIndex = function(i, value) {
		var c;
		c = this;
		c.Object[i] = $externalize(value, $emptyInterface);
	};
	container.prototype.SetIndex = function(i, value) { return this.$val.SetIndex(i, value); };
	container.ptr.prototype.Call = function(name, args) {
		var c, obj;
		c = this;
		return (obj = c.Object, obj[$externalize(name, $String)].apply(obj, $externalize(args, sliceType$1)));
	};
	container.prototype.Call = function(name, args) { return this.$val.Call(name, args); };
	container.ptr.prototype.Invoke = function(args) {
		var c;
		c = this;
		return c.Object.apply(undefined, $externalize(args, sliceType$1));
	};
	container.prototype.Invoke = function(args) { return this.$val.Invoke(args); };
	container.ptr.prototype.New = function(args) {
		var c;
		c = this;
		return new ($global.Function.prototype.bind.apply(c.Object, [undefined].concat($externalize(args, sliceType$1))));
	};
	container.prototype.New = function(args) { return this.$val.New(args); };
	container.ptr.prototype.Bool = function() {
		var c;
		c = this;
		return !!(c.Object);
	};
	container.prototype.Bool = function() { return this.$val.Bool(); };
	container.ptr.prototype.String = function() {
		var c;
		c = this;
		return $internalize(c.Object, $String);
	};
	container.prototype.String = function() { return this.$val.String(); };
	container.ptr.prototype.Int = function() {
		var c;
		c = this;
		return $parseInt(c.Object) >> 0;
	};
	container.prototype.Int = function() { return this.$val.Int(); };
	container.ptr.prototype.Int64 = function() {
		var c;
		c = this;
		return $internalize(c.Object, $Int64);
	};
	container.prototype.Int64 = function() { return this.$val.Int64(); };
	container.ptr.prototype.Uint64 = function() {
		var c;
		c = this;
		return $internalize(c.Object, $Uint64);
	};
	container.prototype.Uint64 = function() { return this.$val.Uint64(); };
	container.ptr.prototype.Float = function() {
		var c;
		c = this;
		return $parseFloat(c.Object);
	};
	container.prototype.Float = function() { return this.$val.Float(); };
	container.ptr.prototype.Interface = function() {
		var c;
		c = this;
		return $internalize(c.Object, $emptyInterface);
	};
	container.prototype.Interface = function() { return this.$val.Interface(); };
	container.ptr.prototype.Unsafe = function() {
		var c;
		c = this;
		return c.Object;
	};
	container.prototype.Unsafe = function() { return this.$val.Unsafe(); };
	Error.ptr.prototype.Error = function() {
		var err;
		err = this;
		return "JavaScript error: " + $internalize(err.Object.message, $String);
	};
	Error.prototype.Error = function() { return this.$val.Error(); };
	Error.ptr.prototype.Stack = function() {
		var err;
		err = this;
		return $internalize(err.Object.stack, $String);
	};
	Error.prototype.Stack = function() { return this.$val.Stack(); };
	init = function() {
		var _tmp, _tmp$1, c, e;
		c = new container.ptr(null);
		e = new Error.ptr(null);
		
	};
	ptrType.methods = [{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}];
	Error.methods = [{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "Stack", name: "Stack", pkg: "", type: $funcType([], [$String], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}];
	Object.init([{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType$1], [Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType$1], [Object], true)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}]);
	container.init([{prop: "Object", name: "", pkg: "", type: Object, tag: ""}]);
	Error.init([{prop: "Object", name: "", pkg: "", type: Object, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_js = function() { while (true) { switch ($s) { case 0:
		init();
		/* */ } return; } }; $init_js.$blocking = true; return $init_js;
	};
	return $pkg;
})();
$packages["runtime"] = (function() {
	var $pkg = {}, js, NotSupportedError, TypeAssertionError, errorString, ptrType$5, ptrType$6, ptrType$7, init;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	NotSupportedError = $pkg.NotSupportedError = $newType(0, $kindStruct, "runtime.NotSupportedError", "NotSupportedError", "runtime", function(Feature_) {
		this.$val = this;
		this.Feature = Feature_ !== undefined ? Feature_ : "";
	});
	TypeAssertionError = $pkg.TypeAssertionError = $newType(0, $kindStruct, "runtime.TypeAssertionError", "TypeAssertionError", "runtime", function(interfaceString_, concreteString_, assertedString_, missingMethod_) {
		this.$val = this;
		this.interfaceString = interfaceString_ !== undefined ? interfaceString_ : "";
		this.concreteString = concreteString_ !== undefined ? concreteString_ : "";
		this.assertedString = assertedString_ !== undefined ? assertedString_ : "";
		this.missingMethod = missingMethod_ !== undefined ? missingMethod_ : "";
	});
	errorString = $pkg.errorString = $newType(8, $kindString, "runtime.errorString", "errorString", "runtime", null);
	ptrType$5 = $ptrType(NotSupportedError);
	ptrType$6 = $ptrType(TypeAssertionError);
	ptrType$7 = $ptrType(errorString);
	NotSupportedError.ptr.prototype.Error = function() {
		var err;
		err = this;
		return "not supported by GopherJS: " + err.Feature;
	};
	NotSupportedError.prototype.Error = function() { return this.$val.Error(); };
	init = function() {
		var e;
		$js = $packages[$externalize("github.com/gopherjs/gopherjs/js", $String)];
		$throwRuntimeError = (function(msg) {
			$panic(new errorString(msg));
		});
		e = $ifaceNil;
		e = new TypeAssertionError.ptr("", "", "", "");
		e = new NotSupportedError.ptr("");
	};
	TypeAssertionError.ptr.prototype.RuntimeError = function() {
	};
	TypeAssertionError.prototype.RuntimeError = function() { return this.$val.RuntimeError(); };
	TypeAssertionError.ptr.prototype.Error = function() {
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
		e = this.$val;
	};
	$ptrType(errorString).prototype.RuntimeError = function() { return new errorString(this.$get()).RuntimeError(); };
	errorString.prototype.Error = function() {
		var e;
		e = this.$val;
		return "runtime error: " + e;
	};
	$ptrType(errorString).prototype.Error = function() { return new errorString(this.$get()).Error(); };
	ptrType$5.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}];
	ptrType$6.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "RuntimeError", name: "RuntimeError", pkg: "", type: $funcType([], [], false)}];
	errorString.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "RuntimeError", name: "RuntimeError", pkg: "", type: $funcType([], [], false)}];
	ptrType$7.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}, {prop: "RuntimeError", name: "RuntimeError", pkg: "", type: $funcType([], [], false)}];
	NotSupportedError.init([{prop: "Feature", name: "Feature", pkg: "", type: $String, tag: ""}]);
	TypeAssertionError.init([{prop: "interfaceString", name: "interfaceString", pkg: "runtime", type: $String, tag: ""}, {prop: "concreteString", name: "concreteString", pkg: "runtime", type: $String, tag: ""}, {prop: "assertedString", name: "assertedString", pkg: "runtime", type: $String, tag: ""}, {prop: "missingMethod", name: "missingMethod", pkg: "runtime", type: $String, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_runtime = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		init();
		/* */ } return; } }; $init_runtime.$blocking = true; return $init_runtime;
	};
	return $pkg;
})();
$packages["github.com/gopherjs/jquery"] = (function() {
	var $pkg = {}, js, JQuery, Event, JQueryCoordinates, sliceType, funcType$1, mapType, sliceType$1, funcType$2, funcType$3, sliceType$2, ptrType, ptrType$1, NewJQuery;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	JQuery = $pkg.JQuery = $newType(0, $kindStruct, "jquery.JQuery", "JQuery", "github.com/gopherjs/jquery", function(o_, Jquery_, Selector_, Length_, Context_) {
		this.$val = this;
		this.o = o_ !== undefined ? o_ : null;
		this.Jquery = Jquery_ !== undefined ? Jquery_ : "";
		this.Selector = Selector_ !== undefined ? Selector_ : "";
		this.Length = Length_ !== undefined ? Length_ : 0;
		this.Context = Context_ !== undefined ? Context_ : "";
	});
	Event = $pkg.Event = $newType(0, $kindStruct, "jquery.Event", "Event", "github.com/gopherjs/jquery", function(Object_, KeyCode_, Target_, CurrentTarget_, DelegateTarget_, RelatedTarget_, Data_, Result_, Which_, Namespace_, MetaKey_, PageX_, PageY_, Type_) {
		this.$val = this;
		this.Object = Object_ !== undefined ? Object_ : null;
		this.KeyCode = KeyCode_ !== undefined ? KeyCode_ : 0;
		this.Target = Target_ !== undefined ? Target_ : null;
		this.CurrentTarget = CurrentTarget_ !== undefined ? CurrentTarget_ : null;
		this.DelegateTarget = DelegateTarget_ !== undefined ? DelegateTarget_ : null;
		this.RelatedTarget = RelatedTarget_ !== undefined ? RelatedTarget_ : null;
		this.Data = Data_ !== undefined ? Data_ : null;
		this.Result = Result_ !== undefined ? Result_ : null;
		this.Which = Which_ !== undefined ? Which_ : 0;
		this.Namespace = Namespace_ !== undefined ? Namespace_ : "";
		this.MetaKey = MetaKey_ !== undefined ? MetaKey_ : false;
		this.PageX = PageX_ !== undefined ? PageX_ : 0;
		this.PageY = PageY_ !== undefined ? PageY_ : 0;
		this.Type = Type_ !== undefined ? Type_ : "";
	});
	JQueryCoordinates = $pkg.JQueryCoordinates = $newType(0, $kindStruct, "jquery.JQueryCoordinates", "JQueryCoordinates", "github.com/gopherjs/jquery", function(Left_, Top_) {
		this.$val = this;
		this.Left = Left_ !== undefined ? Left_ : 0;
		this.Top = Top_ !== undefined ? Top_ : 0;
	});
	sliceType = $sliceType($emptyInterface);
	funcType$1 = $funcType([$Int, $emptyInterface], [], false);
	mapType = $mapType($String, $emptyInterface);
	sliceType$1 = $sliceType($String);
	funcType$2 = $funcType([$Int, $String], [$String], false);
	funcType$3 = $funcType([], [], false);
	sliceType$2 = $sliceType($Bool);
	ptrType = $ptrType(JQuery);
	ptrType$1 = $ptrType(Event);
	Event.ptr.prototype.PreventDefault = function() {
		var event;
		event = this;
		event.Object.preventDefault();
	};
	Event.prototype.PreventDefault = function() { return this.$val.PreventDefault(); };
	Event.ptr.prototype.IsDefaultPrevented = function() {
		var event;
		event = this;
		return !!(event.Object.isDefaultPrevented());
	};
	Event.prototype.IsDefaultPrevented = function() { return this.$val.IsDefaultPrevented(); };
	Event.ptr.prototype.IsImmediatePropogationStopped = function() {
		var event;
		event = this;
		return !!(event.Object.isImmediatePropogationStopped());
	};
	Event.prototype.IsImmediatePropogationStopped = function() { return this.$val.IsImmediatePropogationStopped(); };
	Event.ptr.prototype.IsPropagationStopped = function() {
		var event;
		event = this;
		return !!(event.Object.isPropagationStopped());
	};
	Event.prototype.IsPropagationStopped = function() { return this.$val.IsPropagationStopped(); };
	Event.ptr.prototype.StopImmediatePropagation = function() {
		var event;
		event = this;
		event.Object.stopImmediatePropagation();
	};
	Event.prototype.StopImmediatePropagation = function() { return this.$val.StopImmediatePropagation(); };
	Event.ptr.prototype.StopPropagation = function() {
		var event;
		event = this;
		event.Object.stopPropagation();
	};
	Event.prototype.StopPropagation = function() { return this.$val.StopPropagation(); };
	NewJQuery = $pkg.NewJQuery = function(args) {
		return new JQuery.ptr(new ($global.Function.prototype.bind.apply($global.jQuery, [undefined].concat($externalize(args, sliceType)))), "", "", 0, "");
	};
	JQuery.ptr.prototype.Each = function(fn) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.each($externalize(fn, funcType$1));
		return j;
	};
	JQuery.prototype.Each = function(fn) { return this.$val.Each(fn); };
	JQuery.ptr.prototype.Underlying = function() {
		var j;
		j = $clone(this, JQuery);
		return j.o;
	};
	JQuery.prototype.Underlying = function() { return this.$val.Underlying(); };
	JQuery.ptr.prototype.Get = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		return (obj = j.o, obj.get.apply(obj, $externalize(i, sliceType)));
	};
	JQuery.prototype.Get = function(i) { return this.$val.Get(i); };
	JQuery.ptr.prototype.Append = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.append.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Append = function(i) { return this.$val.Append(i); };
	JQuery.ptr.prototype.Empty = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.empty();
		return j;
	};
	JQuery.prototype.Empty = function() { return this.$val.Empty(); };
	JQuery.ptr.prototype.Detach = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.detach.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Detach = function(i) { return this.$val.Detach(i); };
	JQuery.ptr.prototype.Eq = function(idx) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.eq(idx);
		return j;
	};
	JQuery.prototype.Eq = function(idx) { return this.$val.Eq(idx); };
	JQuery.ptr.prototype.FadeIn = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.fadeIn.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.FadeIn = function(i) { return this.$val.FadeIn(i); };
	JQuery.ptr.prototype.Delay = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.delay.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Delay = function(i) { return this.$val.Delay(i); };
	JQuery.ptr.prototype.ToArray = function() {
		var j;
		j = $clone(this, JQuery);
		return $assertType($internalize(j.o.toArray(), $emptyInterface), sliceType);
	};
	JQuery.prototype.ToArray = function() { return this.$val.ToArray(); };
	JQuery.ptr.prototype.Remove = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.remove.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Remove = function(i) { return this.$val.Remove(i); };
	JQuery.ptr.prototype.Stop = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.stop.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Stop = function(i) { return this.$val.Stop(i); };
	JQuery.ptr.prototype.AddBack = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.addBack.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.AddBack = function(i) { return this.$val.AddBack(i); };
	JQuery.ptr.prototype.Css = function(name) {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.css($externalize(name, $String)), $String);
	};
	JQuery.prototype.Css = function(name) { return this.$val.Css(name); };
	JQuery.ptr.prototype.CssArray = function(arr) {
		var j;
		j = $clone(this, JQuery);
		return $assertType($internalize(j.o.css($externalize(arr, sliceType$1)), $emptyInterface), mapType);
	};
	JQuery.prototype.CssArray = function(arr) { return this.$val.CssArray(arr); };
	JQuery.ptr.prototype.SetCss = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.css.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SetCss = function(i) { return this.$val.SetCss(i); };
	JQuery.ptr.prototype.Text = function() {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.text(), $String);
	};
	JQuery.prototype.Text = function() { return this.$val.Text(); };
	JQuery.ptr.prototype.SetText = function(i) {
		var _ref, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetText Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.text($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetText = function(i) { return this.$val.SetText(i); };
	JQuery.ptr.prototype.Val = function() {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.val(), $String);
	};
	JQuery.prototype.Val = function() { return this.$val.Val(); };
	JQuery.ptr.prototype.SetVal = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o.val($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetVal = function(i) { return this.$val.SetVal(i); };
	JQuery.ptr.prototype.Prop = function(property) {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.prop($externalize(property, $String)), $emptyInterface);
	};
	JQuery.prototype.Prop = function(property) { return this.$val.Prop(property); };
	JQuery.ptr.prototype.SetProp = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prop.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SetProp = function(i) { return this.$val.SetProp(i); };
	JQuery.ptr.prototype.RemoveProp = function(property) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.removeProp($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveProp = function(property) { return this.$val.RemoveProp(property); };
	JQuery.ptr.prototype.Attr = function(property) {
		var attr, j;
		j = $clone(this, JQuery);
		attr = j.o.attr($externalize(property, $String));
		if (attr === undefined) {
			return "";
		}
		return $internalize(attr, $String);
	};
	JQuery.prototype.Attr = function(property) { return this.$val.Attr(property); };
	JQuery.ptr.prototype.SetAttr = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.attr.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.SetAttr = function(i) { return this.$val.SetAttr(i); };
	JQuery.ptr.prototype.RemoveAttr = function(property) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.removeAttr($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveAttr = function(property) { return this.$val.RemoveAttr(property); };
	JQuery.ptr.prototype.HasClass = function(class$1) {
		var j;
		j = $clone(this, JQuery);
		return !!(j.o.hasClass($externalize(class$1, $String)));
	};
	JQuery.prototype.HasClass = function(class$1) { return this.$val.HasClass(class$1); };
	JQuery.ptr.prototype.AddClass = function(i) {
		var _ref, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("addClass Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.addClass($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.AddClass = function(i) { return this.$val.AddClass(i); };
	JQuery.ptr.prototype.RemoveClass = function(property) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.removeClass($externalize(property, $String));
		return j;
	};
	JQuery.prototype.RemoveClass = function(property) { return this.$val.RemoveClass(property); };
	JQuery.ptr.prototype.ToggleClass = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.toggleClass.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.ToggleClass = function(i) { return this.$val.ToggleClass(i); };
	JQuery.ptr.prototype.Focus = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.focus();
		return j;
	};
	JQuery.prototype.Focus = function() { return this.$val.Focus(); };
	JQuery.ptr.prototype.Blur = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.blur();
		return j;
	};
	JQuery.prototype.Blur = function() { return this.$val.Blur(); };
	JQuery.ptr.prototype.ReplaceAll = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.replaceAll($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.ReplaceAll = function(i) { return this.$val.ReplaceAll(i); };
	JQuery.ptr.prototype.ReplaceWith = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.replaceWith($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.ReplaceWith = function(i) { return this.$val.ReplaceWith(i); };
	JQuery.ptr.prototype.After = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.after($externalize(i, sliceType));
		return j;
	};
	JQuery.prototype.After = function(i) { return this.$val.After(i); };
	JQuery.ptr.prototype.Before = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.before.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Before = function(i) { return this.$val.Before(i); };
	JQuery.ptr.prototype.Prepend = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prepend.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Prepend = function(i) { return this.$val.Prepend(i); };
	JQuery.ptr.prototype.PrependTo = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.prependTo($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.PrependTo = function(i) { return this.$val.PrependTo(i); };
	JQuery.ptr.prototype.AppendTo = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.appendTo($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.AppendTo = function(i) { return this.$val.AppendTo(i); };
	JQuery.ptr.prototype.InsertAfter = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.insertAfter($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.InsertAfter = function(i) { return this.$val.InsertAfter(i); };
	JQuery.ptr.prototype.InsertBefore = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.insertBefore($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.InsertBefore = function(i) { return this.$val.InsertBefore(i); };
	JQuery.ptr.prototype.Show = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.show();
		return j;
	};
	JQuery.prototype.Show = function() { return this.$val.Show(); };
	JQuery.ptr.prototype.Hide = function() {
		var j;
		j = $clone(this, JQuery);
		j.o.hide();
		return j;
	};
	JQuery.prototype.Hide = function() { return this.$val.Hide(); };
	JQuery.ptr.prototype.Toggle = function(showOrHide) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.toggle($externalize(showOrHide, $Bool));
		return j;
	};
	JQuery.prototype.Toggle = function(showOrHide) { return this.$val.Toggle(showOrHide); };
	JQuery.ptr.prototype.Contents = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.contents();
		return j;
	};
	JQuery.prototype.Contents = function() { return this.$val.Contents(); };
	JQuery.ptr.prototype.Html = function() {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.html(), $String);
	};
	JQuery.prototype.Html = function() { return this.$val.Html(); };
	JQuery.ptr.prototype.SetHtml = function(i) {
		var _ref, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetHtml Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.html($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetHtml = function(i) { return this.$val.SetHtml(i); };
	JQuery.ptr.prototype.Closest = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.closest.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Closest = function(i) { return this.$val.Closest(i); };
	JQuery.ptr.prototype.End = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.end();
		return j;
	};
	JQuery.prototype.End = function() { return this.$val.End(); };
	JQuery.ptr.prototype.Add = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.add.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Add = function(i) { return this.$val.Add(i); };
	JQuery.ptr.prototype.Clone = function(b) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.clone.apply(obj, $externalize(b, sliceType)));
		return j;
	};
	JQuery.prototype.Clone = function(b) { return this.$val.Clone(b); };
	JQuery.ptr.prototype.Height = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.height()) >> 0;
	};
	JQuery.prototype.Height = function() { return this.$val.Height(); };
	JQuery.ptr.prototype.SetHeight = function(value) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.height($externalize(value, $String));
		return j;
	};
	JQuery.prototype.SetHeight = function(value) { return this.$val.SetHeight(value); };
	JQuery.ptr.prototype.Width = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.width()) >> 0;
	};
	JQuery.prototype.Width = function() { return this.$val.Width(); };
	JQuery.ptr.prototype.SetWidth = function(i) {
		var _ref, j;
		j = $clone(this, JQuery);
		_ref = i;
		if ($assertType(_ref, funcType$2, true)[1] || $assertType(_ref, $String, true)[1]) {
		} else {
			console.log("SetWidth Argument should be 'string' or 'func(int, string) string'");
		}
		j.o = j.o.width($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetWidth = function(i) { return this.$val.SetWidth(i); };
	JQuery.ptr.prototype.InnerHeight = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.innerHeight()) >> 0;
	};
	JQuery.prototype.InnerHeight = function() { return this.$val.InnerHeight(); };
	JQuery.ptr.prototype.InnerWidth = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.innerWidth()) >> 0;
	};
	JQuery.prototype.InnerWidth = function() { return this.$val.InnerWidth(); };
	JQuery.ptr.prototype.Offset = function() {
		var j, obj;
		j = $clone(this, JQuery);
		obj = j.o.offset();
		return new JQueryCoordinates.ptr($parseInt(obj.left) >> 0, $parseInt(obj.top) >> 0);
	};
	JQuery.prototype.Offset = function() { return this.$val.Offset(); };
	JQuery.ptr.prototype.SetOffset = function(jc) {
		var j;
		j = $clone(this, JQuery);
		jc = $clone(jc, JQueryCoordinates);
		j.o = j.o.offset($externalize(jc, JQueryCoordinates));
		return j;
	};
	JQuery.prototype.SetOffset = function(jc) { return this.$val.SetOffset(jc); };
	JQuery.ptr.prototype.OuterHeight = function(includeMargin) {
		var j;
		j = $clone(this, JQuery);
		if (includeMargin.$length === 0) {
			return $parseInt(j.o.outerHeight()) >> 0;
		}
		return $parseInt(j.o.outerHeight($externalize(((0 < 0 || 0 >= includeMargin.$length) ? $throwRuntimeError("index out of range") : includeMargin.$array[includeMargin.$offset + 0]), $Bool))) >> 0;
	};
	JQuery.prototype.OuterHeight = function(includeMargin) { return this.$val.OuterHeight(includeMargin); };
	JQuery.ptr.prototype.OuterWidth = function(includeMargin) {
		var j;
		j = $clone(this, JQuery);
		if (includeMargin.$length === 0) {
			return $parseInt(j.o.outerWidth()) >> 0;
		}
		return $parseInt(j.o.outerWidth($externalize(((0 < 0 || 0 >= includeMargin.$length) ? $throwRuntimeError("index out of range") : includeMargin.$array[includeMargin.$offset + 0]), $Bool))) >> 0;
	};
	JQuery.prototype.OuterWidth = function(includeMargin) { return this.$val.OuterWidth(includeMargin); };
	JQuery.ptr.prototype.Position = function() {
		var j, obj;
		j = $clone(this, JQuery);
		obj = j.o.position();
		return new JQueryCoordinates.ptr($parseInt(obj.left) >> 0, $parseInt(obj.top) >> 0);
	};
	JQuery.prototype.Position = function() { return this.$val.Position(); };
	JQuery.ptr.prototype.ScrollLeft = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.scrollLeft()) >> 0;
	};
	JQuery.prototype.ScrollLeft = function() { return this.$val.ScrollLeft(); };
	JQuery.ptr.prototype.SetScrollLeft = function(value) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.scrollLeft(value);
		return j;
	};
	JQuery.prototype.SetScrollLeft = function(value) { return this.$val.SetScrollLeft(value); };
	JQuery.ptr.prototype.ScrollTop = function() {
		var j;
		j = $clone(this, JQuery);
		return $parseInt(j.o.scrollTop()) >> 0;
	};
	JQuery.prototype.ScrollTop = function() { return this.$val.ScrollTop(); };
	JQuery.ptr.prototype.SetScrollTop = function(value) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.scrollTop(value);
		return j;
	};
	JQuery.prototype.SetScrollTop = function(value) { return this.$val.SetScrollTop(value); };
	JQuery.ptr.prototype.ClearQueue = function(queueName) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.clearQueue($externalize(queueName, $String));
		return j;
	};
	JQuery.prototype.ClearQueue = function(queueName) { return this.$val.ClearQueue(queueName); };
	JQuery.ptr.prototype.SetData = function(key, value) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.data($externalize(key, $String), $externalize(value, $emptyInterface));
		return j;
	};
	JQuery.prototype.SetData = function(key, value) { return this.$val.SetData(key, value); };
	JQuery.ptr.prototype.Data = function(key) {
		var j, result;
		j = $clone(this, JQuery);
		result = j.o.data($externalize(key, $String));
		if (result === undefined) {
			return $ifaceNil;
		}
		return $internalize(result, $emptyInterface);
	};
	JQuery.prototype.Data = function(key) { return this.$val.Data(key); };
	JQuery.ptr.prototype.Dequeue = function(queueName) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.dequeue($externalize(queueName, $String));
		return j;
	};
	JQuery.prototype.Dequeue = function(queueName) { return this.$val.Dequeue(queueName); };
	JQuery.ptr.prototype.RemoveData = function(name) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.removeData($externalize(name, $String));
		return j;
	};
	JQuery.prototype.RemoveData = function(name) { return this.$val.RemoveData(name); };
	JQuery.ptr.prototype.OffsetParent = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.offsetParent();
		return j;
	};
	JQuery.prototype.OffsetParent = function() { return this.$val.OffsetParent(); };
	JQuery.ptr.prototype.Parent = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.parent.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Parent = function(i) { return this.$val.Parent(i); };
	JQuery.ptr.prototype.Parents = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.parents.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Parents = function(i) { return this.$val.Parents(i); };
	JQuery.ptr.prototype.ParentsUntil = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.parentsUntil.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.ParentsUntil = function(i) { return this.$val.ParentsUntil(i); };
	JQuery.ptr.prototype.Prev = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prev.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Prev = function(i) { return this.$val.Prev(i); };
	JQuery.ptr.prototype.PrevAll = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prevAll.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.PrevAll = function(i) { return this.$val.PrevAll(i); };
	JQuery.ptr.prototype.PrevUntil = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.prevUntil.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.PrevUntil = function(i) { return this.$val.PrevUntil(i); };
	JQuery.ptr.prototype.Siblings = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.siblings.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Siblings = function(i) { return this.$val.Siblings(i); };
	JQuery.ptr.prototype.Slice = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.slice.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Slice = function(i) { return this.$val.Slice(i); };
	JQuery.ptr.prototype.Children = function(selector) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.children($externalize(selector, $emptyInterface));
		return j;
	};
	JQuery.prototype.Children = function(selector) { return this.$val.Children(selector); };
	JQuery.ptr.prototype.Unwrap = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.unwrap();
		return j;
	};
	JQuery.prototype.Unwrap = function() { return this.$val.Unwrap(); };
	JQuery.ptr.prototype.Wrap = function(obj) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.wrap($externalize(obj, $emptyInterface));
		return j;
	};
	JQuery.prototype.Wrap = function(obj) { return this.$val.Wrap(obj); };
	JQuery.ptr.prototype.WrapAll = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.wrapAll($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.WrapAll = function(i) { return this.$val.WrapAll(i); };
	JQuery.ptr.prototype.WrapInner = function(i) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.wrapInner($externalize(i, $emptyInterface));
		return j;
	};
	JQuery.prototype.WrapInner = function(i) { return this.$val.WrapInner(i); };
	JQuery.ptr.prototype.Next = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.next.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Next = function(i) { return this.$val.Next(i); };
	JQuery.ptr.prototype.NextAll = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.nextAll.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.NextAll = function(i) { return this.$val.NextAll(i); };
	JQuery.ptr.prototype.NextUntil = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.nextUntil.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.NextUntil = function(i) { return this.$val.NextUntil(i); };
	JQuery.ptr.prototype.Not = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.not.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Not = function(i) { return this.$val.Not(i); };
	JQuery.ptr.prototype.Filter = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.filter.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Filter = function(i) { return this.$val.Filter(i); };
	JQuery.ptr.prototype.Find = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.find.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Find = function(i) { return this.$val.Find(i); };
	JQuery.ptr.prototype.First = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.first();
		return j;
	};
	JQuery.prototype.First = function() { return this.$val.First(); };
	JQuery.ptr.prototype.Has = function(selector) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.has($externalize(selector, $String));
		return j;
	};
	JQuery.prototype.Has = function(selector) { return this.$val.Has(selector); };
	JQuery.ptr.prototype.Is = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		return !!((obj = j.o, obj.is.apply(obj, $externalize(i, sliceType))));
	};
	JQuery.prototype.Is = function(i) { return this.$val.Is(i); };
	JQuery.ptr.prototype.Last = function() {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.last();
		return j;
	};
	JQuery.prototype.Last = function() { return this.$val.Last(); };
	JQuery.ptr.prototype.Ready = function(handler) {
		var j;
		j = $clone(this, JQuery);
		j.o = j.o.ready($externalize(handler, funcType$3));
		return j;
	};
	JQuery.prototype.Ready = function(handler) { return this.$val.Ready(handler); };
	JQuery.ptr.prototype.Resize = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.resize.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Resize = function(i) { return this.$val.Resize(i); };
	JQuery.ptr.prototype.Scroll = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.scroll.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Scroll = function(i) { return this.$val.Scroll(i); };
	JQuery.ptr.prototype.FadeOut = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.fadeOut.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.FadeOut = function(i) { return this.$val.FadeOut(i); };
	JQuery.ptr.prototype.Select = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.select.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Select = function(i) { return this.$val.Select(i); };
	JQuery.ptr.prototype.Submit = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.submit.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Submit = function(i) { return this.$val.Submit(i); };
	JQuery.ptr.prototype.Trigger = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.trigger.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Trigger = function(i) { return this.$val.Trigger(i); };
	JQuery.ptr.prototype.On = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.on.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.On = function(i) { return this.$val.On(i); };
	JQuery.ptr.prototype.One = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.one.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.One = function(i) { return this.$val.One(i); };
	JQuery.ptr.prototype.Off = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.off.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Off = function(i) { return this.$val.Off(i); };
	JQuery.ptr.prototype.Load = function(i) {
		var j, obj;
		j = $clone(this, JQuery);
		j.o = (obj = j.o, obj.load.apply(obj, $externalize(i, sliceType)));
		return j;
	};
	JQuery.prototype.Load = function(i) { return this.$val.Load(i); };
	JQuery.ptr.prototype.Serialize = function() {
		var j;
		j = $clone(this, JQuery);
		return $internalize(j.o.serialize(), $String);
	};
	JQuery.prototype.Serialize = function() { return this.$val.Serialize(); };
	JQuery.ptr.prototype.SerializeArray = function() {
		var j;
		j = $clone(this, JQuery);
		return j.o.serializeArray();
	};
	JQuery.prototype.SerializeArray = function() { return this.$val.SerializeArray(); };
	JQuery.methods = [{prop: "Add", name: "Add", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AddBack", name: "AddBack", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AddClass", name: "AddClass", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "After", name: "After", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Append", name: "Append", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AppendTo", name: "AppendTo", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Attr", name: "Attr", pkg: "", type: $funcType([$String], [$String], false)}, {prop: "Before", name: "Before", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Blur", name: "Blur", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Children", name: "Children", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "ClearQueue", name: "ClearQueue", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "Clone", name: "Clone", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Closest", name: "Closest", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Contents", name: "Contents", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Css", name: "Css", pkg: "", type: $funcType([$String], [$String], false)}, {prop: "CssArray", name: "CssArray", pkg: "", type: $funcType([sliceType$1], [mapType], true)}, {prop: "Data", name: "Data", pkg: "", type: $funcType([$String], [$emptyInterface], false)}, {prop: "Delay", name: "Delay", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Dequeue", name: "Dequeue", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "Detach", name: "Detach", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Each", name: "Each", pkg: "", type: $funcType([funcType$1], [JQuery], false)}, {prop: "Empty", name: "Empty", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "End", name: "End", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Eq", name: "Eq", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "FadeIn", name: "FadeIn", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "FadeOut", name: "FadeOut", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Filter", name: "Filter", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Find", name: "Find", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "First", name: "First", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Focus", name: "Focus", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([sliceType], [js.Object], true)}, {prop: "Has", name: "Has", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "HasClass", name: "HasClass", pkg: "", type: $funcType([$String], [$Bool], false)}, {prop: "Height", name: "Height", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Hide", name: "Hide", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Html", name: "Html", pkg: "", type: $funcType([], [$String], false)}, {prop: "InnerHeight", name: "InnerHeight", pkg: "", type: $funcType([], [$Int], false)}, {prop: "InnerWidth", name: "InnerWidth", pkg: "", type: $funcType([], [$Int], false)}, {prop: "InsertAfter", name: "InsertAfter", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "InsertBefore", name: "InsertBefore", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Is", name: "Is", pkg: "", type: $funcType([sliceType], [$Bool], true)}, {prop: "Last", name: "Last", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Load", name: "Load", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Next", name: "Next", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "NextAll", name: "NextAll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "NextUntil", name: "NextUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Not", name: "Not", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Off", name: "Off", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Offset", name: "Offset", pkg: "", type: $funcType([], [JQueryCoordinates], false)}, {prop: "OffsetParent", name: "OffsetParent", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "On", name: "On", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "One", name: "One", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "OuterHeight", name: "OuterHeight", pkg: "", type: $funcType([sliceType$2], [$Int], true)}, {prop: "OuterWidth", name: "OuterWidth", pkg: "", type: $funcType([sliceType$2], [$Int], true)}, {prop: "Parent", name: "Parent", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Parents", name: "Parents", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "ParentsUntil", name: "ParentsUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Position", name: "Position", pkg: "", type: $funcType([], [JQueryCoordinates], false)}, {prop: "Prepend", name: "Prepend", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrependTo", name: "PrependTo", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Prev", name: "Prev", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrevAll", name: "PrevAll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrevUntil", name: "PrevUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Prop", name: "Prop", pkg: "", type: $funcType([$String], [$emptyInterface], false)}, {prop: "Ready", name: "Ready", pkg: "", type: $funcType([funcType$3], [JQuery], false)}, {prop: "Remove", name: "Remove", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "RemoveAttr", name: "RemoveAttr", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveClass", name: "RemoveClass", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveData", name: "RemoveData", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveProp", name: "RemoveProp", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "ReplaceAll", name: "ReplaceAll", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "ReplaceWith", name: "ReplaceWith", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Resize", name: "Resize", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Scroll", name: "Scroll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "ScrollLeft", name: "ScrollLeft", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ScrollTop", name: "ScrollTop", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Select", name: "Select", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Serialize", name: "Serialize", pkg: "", type: $funcType([], [$String], false)}, {prop: "SerializeArray", name: "SerializeArray", pkg: "", type: $funcType([], [js.Object], false)}, {prop: "SetAttr", name: "SetAttr", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetCss", name: "SetCss", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetData", name: "SetData", pkg: "", type: $funcType([$String, $emptyInterface], [JQuery], false)}, {prop: "SetHeight", name: "SetHeight", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "SetHtml", name: "SetHtml", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetOffset", name: "SetOffset", pkg: "", type: $funcType([JQueryCoordinates], [JQuery], false)}, {prop: "SetProp", name: "SetProp", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetScrollLeft", name: "SetScrollLeft", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "SetScrollTop", name: "SetScrollTop", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "SetText", name: "SetText", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetVal", name: "SetVal", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetWidth", name: "SetWidth", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Show", name: "Show", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Siblings", name: "Siblings", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Slice", name: "Slice", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Stop", name: "Stop", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Submit", name: "Submit", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Text", name: "Text", pkg: "", type: $funcType([], [$String], false)}, {prop: "ToArray", name: "ToArray", pkg: "", type: $funcType([], [sliceType], false)}, {prop: "Toggle", name: "Toggle", pkg: "", type: $funcType([$Bool], [JQuery], false)}, {prop: "ToggleClass", name: "ToggleClass", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Trigger", name: "Trigger", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Underlying", name: "Underlying", pkg: "", type: $funcType([], [js.Object], false)}, {prop: "Unwrap", name: "Unwrap", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Val", name: "Val", pkg: "", type: $funcType([], [$String], false)}, {prop: "Width", name: "Width", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Wrap", name: "Wrap", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapAll", name: "WrapAll", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapInner", name: "WrapInner", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}];
	ptrType.methods = [{prop: "Add", name: "Add", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AddBack", name: "AddBack", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AddClass", name: "AddClass", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "After", name: "After", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Append", name: "Append", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "AppendTo", name: "AppendTo", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Attr", name: "Attr", pkg: "", type: $funcType([$String], [$String], false)}, {prop: "Before", name: "Before", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Blur", name: "Blur", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Children", name: "Children", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "ClearQueue", name: "ClearQueue", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "Clone", name: "Clone", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Closest", name: "Closest", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Contents", name: "Contents", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Css", name: "Css", pkg: "", type: $funcType([$String], [$String], false)}, {prop: "CssArray", name: "CssArray", pkg: "", type: $funcType([sliceType$1], [mapType], true)}, {prop: "Data", name: "Data", pkg: "", type: $funcType([$String], [$emptyInterface], false)}, {prop: "Delay", name: "Delay", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Dequeue", name: "Dequeue", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "Detach", name: "Detach", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Each", name: "Each", pkg: "", type: $funcType([funcType$1], [JQuery], false)}, {prop: "Empty", name: "Empty", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "End", name: "End", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Eq", name: "Eq", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "FadeIn", name: "FadeIn", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "FadeOut", name: "FadeOut", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Filter", name: "Filter", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Find", name: "Find", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "First", name: "First", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Focus", name: "Focus", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([sliceType], [js.Object], true)}, {prop: "Has", name: "Has", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "HasClass", name: "HasClass", pkg: "", type: $funcType([$String], [$Bool], false)}, {prop: "Height", name: "Height", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Hide", name: "Hide", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Html", name: "Html", pkg: "", type: $funcType([], [$String], false)}, {prop: "InnerHeight", name: "InnerHeight", pkg: "", type: $funcType([], [$Int], false)}, {prop: "InnerWidth", name: "InnerWidth", pkg: "", type: $funcType([], [$Int], false)}, {prop: "InsertAfter", name: "InsertAfter", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "InsertBefore", name: "InsertBefore", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Is", name: "Is", pkg: "", type: $funcType([sliceType], [$Bool], true)}, {prop: "Last", name: "Last", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Load", name: "Load", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Next", name: "Next", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "NextAll", name: "NextAll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "NextUntil", name: "NextUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Not", name: "Not", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Off", name: "Off", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Offset", name: "Offset", pkg: "", type: $funcType([], [JQueryCoordinates], false)}, {prop: "OffsetParent", name: "OffsetParent", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "On", name: "On", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "One", name: "One", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "OuterHeight", name: "OuterHeight", pkg: "", type: $funcType([sliceType$2], [$Int], true)}, {prop: "OuterWidth", name: "OuterWidth", pkg: "", type: $funcType([sliceType$2], [$Int], true)}, {prop: "Parent", name: "Parent", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Parents", name: "Parents", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "ParentsUntil", name: "ParentsUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Position", name: "Position", pkg: "", type: $funcType([], [JQueryCoordinates], false)}, {prop: "Prepend", name: "Prepend", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrependTo", name: "PrependTo", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Prev", name: "Prev", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrevAll", name: "PrevAll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "PrevUntil", name: "PrevUntil", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Prop", name: "Prop", pkg: "", type: $funcType([$String], [$emptyInterface], false)}, {prop: "Ready", name: "Ready", pkg: "", type: $funcType([funcType$3], [JQuery], false)}, {prop: "Remove", name: "Remove", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "RemoveAttr", name: "RemoveAttr", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveClass", name: "RemoveClass", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveData", name: "RemoveData", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "RemoveProp", name: "RemoveProp", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "ReplaceAll", name: "ReplaceAll", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "ReplaceWith", name: "ReplaceWith", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Resize", name: "Resize", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Scroll", name: "Scroll", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "ScrollLeft", name: "ScrollLeft", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ScrollTop", name: "ScrollTop", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Select", name: "Select", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Serialize", name: "Serialize", pkg: "", type: $funcType([], [$String], false)}, {prop: "SerializeArray", name: "SerializeArray", pkg: "", type: $funcType([], [js.Object], false)}, {prop: "SetAttr", name: "SetAttr", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetCss", name: "SetCss", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetData", name: "SetData", pkg: "", type: $funcType([$String, $emptyInterface], [JQuery], false)}, {prop: "SetHeight", name: "SetHeight", pkg: "", type: $funcType([$String], [JQuery], false)}, {prop: "SetHtml", name: "SetHtml", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetOffset", name: "SetOffset", pkg: "", type: $funcType([JQueryCoordinates], [JQuery], false)}, {prop: "SetProp", name: "SetProp", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "SetScrollLeft", name: "SetScrollLeft", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "SetScrollTop", name: "SetScrollTop", pkg: "", type: $funcType([$Int], [JQuery], false)}, {prop: "SetText", name: "SetText", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetVal", name: "SetVal", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "SetWidth", name: "SetWidth", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "Show", name: "Show", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Siblings", name: "Siblings", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Slice", name: "Slice", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Stop", name: "Stop", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Submit", name: "Submit", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Text", name: "Text", pkg: "", type: $funcType([], [$String], false)}, {prop: "ToArray", name: "ToArray", pkg: "", type: $funcType([], [sliceType], false)}, {prop: "Toggle", name: "Toggle", pkg: "", type: $funcType([$Bool], [JQuery], false)}, {prop: "ToggleClass", name: "ToggleClass", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Trigger", name: "Trigger", pkg: "", type: $funcType([sliceType], [JQuery], true)}, {prop: "Underlying", name: "Underlying", pkg: "", type: $funcType([], [js.Object], false)}, {prop: "Unwrap", name: "Unwrap", pkg: "", type: $funcType([], [JQuery], false)}, {prop: "Val", name: "Val", pkg: "", type: $funcType([], [$String], false)}, {prop: "Width", name: "Width", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Wrap", name: "Wrap", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapAll", name: "WrapAll", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}, {prop: "WrapInner", name: "WrapInner", pkg: "", type: $funcType([$emptyInterface], [JQuery], false)}];
	Event.methods = [{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType], [js.Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [js.Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [js.Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType], [js.Object], true)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType], [js.Object], true)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}];
	ptrType$1.methods = [{prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([$String, sliceType], [js.Object], true)}, {prop: "Delete", name: "Delete", pkg: "", type: $funcType([$String], [], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [js.Object], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [js.Object], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Int64", name: "Int64", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Invoke", name: "Invoke", pkg: "", type: $funcType([sliceType], [js.Object], true)}, {prop: "IsDefaultPrevented", name: "IsDefaultPrevented", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "IsImmediatePropogationStopped", name: "IsImmediatePropogationStopped", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "IsPropagationStopped", name: "IsPropagationStopped", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Length", name: "Length", pkg: "", type: $funcType([], [$Int], false)}, {prop: "New", name: "New", pkg: "", type: $funcType([sliceType], [js.Object], true)}, {prop: "PreventDefault", name: "PreventDefault", pkg: "", type: $funcType([], [], false)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([$String, $emptyInterface], [], false)}, {prop: "SetIndex", name: "SetIndex", pkg: "", type: $funcType([$Int, $emptyInterface], [], false)}, {prop: "StopImmediatePropagation", name: "StopImmediatePropagation", pkg: "", type: $funcType([], [], false)}, {prop: "StopPropagation", name: "StopPropagation", pkg: "", type: $funcType([], [], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "Uint64", name: "Uint64", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "Unsafe", name: "Unsafe", pkg: "", type: $funcType([], [$Uintptr], false)}];
	JQuery.init([{prop: "o", name: "o", pkg: "github.com/gopherjs/jquery", type: js.Object, tag: ""}, {prop: "Jquery", name: "Jquery", pkg: "", type: $String, tag: "js:\"jquery\""}, {prop: "Selector", name: "Selector", pkg: "", type: $String, tag: "js:\"selector\""}, {prop: "Length", name: "Length", pkg: "", type: $Int, tag: "js:\"length\""}, {prop: "Context", name: "Context", pkg: "", type: $String, tag: "js:\"context\""}]);
	Event.init([{prop: "Object", name: "", pkg: "", type: js.Object, tag: ""}, {prop: "KeyCode", name: "KeyCode", pkg: "", type: $Int, tag: "js:\"keyCode\""}, {prop: "Target", name: "Target", pkg: "", type: js.Object, tag: "js:\"target\""}, {prop: "CurrentTarget", name: "CurrentTarget", pkg: "", type: js.Object, tag: "js:\"currentTarget\""}, {prop: "DelegateTarget", name: "DelegateTarget", pkg: "", type: js.Object, tag: "js:\"delegateTarget\""}, {prop: "RelatedTarget", name: "RelatedTarget", pkg: "", type: js.Object, tag: "js:\"relatedTarget\""}, {prop: "Data", name: "Data", pkg: "", type: js.Object, tag: "js:\"data\""}, {prop: "Result", name: "Result", pkg: "", type: js.Object, tag: "js:\"result\""}, {prop: "Which", name: "Which", pkg: "", type: $Int, tag: "js:\"which\""}, {prop: "Namespace", name: "Namespace", pkg: "", type: $String, tag: "js:\"namespace\""}, {prop: "MetaKey", name: "MetaKey", pkg: "", type: $Bool, tag: "js:\"metaKey\""}, {prop: "PageX", name: "PageX", pkg: "", type: $Int, tag: "js:\"pageX\""}, {prop: "PageY", name: "PageY", pkg: "", type: $Int, tag: "js:\"pageY\""}, {prop: "Type", name: "Type", pkg: "", type: $String, tag: "js:\"type\""}]);
	JQueryCoordinates.init([{prop: "Left", name: "Left", pkg: "", type: $Int, tag: ""}, {prop: "Top", name: "Top", pkg: "", type: $Int, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_jquery = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		/* */ } return; } }; $init_jquery.$blocking = true; return $init_jquery;
	};
	return $pkg;
})();
$packages["math"] = (function() {
	var $pkg = {}, js, arrayType, math, zero, posInf, negInf, nan, pow10tab, init, Ldexp, Float32bits, Float32frombits, init$1;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	arrayType = $arrayType($Float64, 70);
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
		var e, r, s;
		if (f === 0) {
			if (1 / f === negInf) {
				return 2147483648;
			}
			return 0;
		}
		if (!(f === f)) {
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
			e = e + (1) >>> 0;
			if (e === 255) {
				if (f >= 8.388608e+06) {
					f = posInf;
				}
				break;
			}
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
		var e, m, s;
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
		var _q, i, m, x;
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
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_math = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		pow10tab = arrayType.zero();
		math = $global.Math;
		zero = 0;
		posInf = 1 / zero;
		negInf = -1 / zero;
		nan = 0 / zero;
		init();
		init$1();
		/* */ } return; } }; $init_math.$blocking = true; return $init_math;
	};
	return $pkg;
})();
$packages["errors"] = (function() {
	var $pkg = {}, errorString, ptrType, New;
	errorString = $pkg.errorString = $newType(0, $kindStruct, "errors.errorString", "errorString", "errors", function(s_) {
		this.$val = this;
		this.s = s_ !== undefined ? s_ : "";
	});
	ptrType = $ptrType(errorString);
	New = $pkg.New = function(text) {
		return new errorString.ptr(text);
	};
	errorString.ptr.prototype.Error = function() {
		var e;
		e = this;
		return e.s;
	};
	errorString.prototype.Error = function() { return this.$val.Error(); };
	ptrType.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}];
	errorString.init([{prop: "s", name: "s", pkg: "errors", type: $String, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_errors = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_errors.$blocking = true; return $init_errors;
	};
	return $pkg;
})();
$packages["unicode/utf8"] = (function() {
	var $pkg = {}, decodeRuneInStringInternal, DecodeRuneInString, EncodeRune;
	decodeRuneInStringInternal = function(s) {
		var _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$22, _tmp$23, _tmp$24, _tmp$25, _tmp$26, _tmp$27, _tmp$28, _tmp$29, _tmp$3, _tmp$30, _tmp$31, _tmp$32, _tmp$33, _tmp$34, _tmp$35, _tmp$36, _tmp$37, _tmp$38, _tmp$39, _tmp$4, _tmp$40, _tmp$41, _tmp$42, _tmp$43, _tmp$44, _tmp$45, _tmp$46, _tmp$47, _tmp$48, _tmp$49, _tmp$5, _tmp$50, _tmp$6, _tmp$7, _tmp$8, _tmp$9, c0, c1, c2, c3, n, r = 0, short$1 = false, size = 0;
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
		var _tuple, r = 0, size = 0;
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
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_utf8 = function() { while (true) { switch ($s) { case 0:
		/* */ } return; } }; $init_utf8.$blocking = true; return $init_utf8;
	};
	return $pkg;
})();
$packages["strconv"] = (function() {
	var $pkg = {}, errors, math, utf8, sliceType$6, arrayType$4, arrayType$5, shifts, FormatInt, Itoa, formatBits, unhex, UnquoteChar, Unquote, contains;
	errors = $packages["errors"];
	math = $packages["math"];
	utf8 = $packages["unicode/utf8"];
	sliceType$6 = $sliceType($Uint8);
	arrayType$4 = $arrayType($Uint8, 65);
	arrayType$5 = $arrayType($Uint8, 4);
	FormatInt = $pkg.FormatInt = function(i, base) {
		var _tuple, s;
		_tuple = formatBits(sliceType$6.nil, new $Uint64(i.$high, i.$low), base, (i.$high < 0 || (i.$high === 0 && i.$low < 0)), false); s = _tuple[1];
		return s;
	};
	Itoa = $pkg.Itoa = function(i) {
		return FormatInt(new $Int64(0, i), 10);
	};
	formatBits = function(dst, u, base, neg, append_) {
		var a, b, b$1, d = sliceType$6.nil, i, j, m, q, q$1, s = "", s$1, x, x$1, x$2, x$3;
		if (base < 2 || base > 36) {
			$panic(new $String("strconv: illegal AppendInt/FormatInt base"));
		}
		a = $clone(arrayType$4.zero(), arrayType$4);
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
			d = $appendSlice(dst, $subslice(new sliceType$6(a), i));
			return [d, s];
		}
		s = $bytesToString($subslice(new sliceType$6(a), i));
		return [d, s];
	};
	unhex = function(b) {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, c, ok = false, v = 0;
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
		var _ref, _ref$1, _tmp, _tmp$1, _tmp$2, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tuple, _tuple$1, c, c$1, err = $ifaceNil, j, j$1, multibyte = false, n, ok, r, size, tail = "", v, v$1, value = 0, x, x$1;
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
		var _q, _ref, _tmp, _tmp$1, _tmp$10, _tmp$11, _tmp$12, _tmp$13, _tmp$14, _tmp$15, _tmp$16, _tmp$17, _tmp$18, _tmp$19, _tmp$2, _tmp$20, _tmp$21, _tmp$3, _tmp$4, _tmp$5, _tmp$6, _tmp$7, _tmp$8, _tmp$9, _tuple, _tuple$1, buf, c, err = $ifaceNil, err$1, multibyte, n, n$1, quote, r, runeTmp, size, ss, t = "";
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
		runeTmp = $clone(arrayType$5.zero(), arrayType$5);
		buf = $makeSlice(sliceType$6, 0, (_q = (3 * s.length >> 0) / 2, (_q === _q && _q !== 1/0 && _q !== -1/0) ? _q >> 0 : $throwRuntimeError("integer divide by zero")));
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
				n$1 = utf8.EncodeRune(new sliceType$6(runeTmp), c);
				buf = $appendSlice(buf, $subslice(new sliceType$6(runeTmp), 0, n$1));
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
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_strconv = function() { while (true) { switch ($s) { case 0:
		$r = errors.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = math.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = utf8.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$pkg.ErrRange = errors.New("value out of range");
		$pkg.ErrSyntax = errors.New("invalid syntax");
		shifts = $toNativeArray($kindUint, [0, 0, 1, 0, 2, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0, 0]);
		/* */ } return; } }; $init_strconv.$blocking = true; return $init_strconv;
	};
	return $pkg;
})();
$packages["sync/atomic"] = (function() {
	var $pkg = {}, js, CompareAndSwapInt32, AddInt32;
	js = $packages["github.com/gopherjs/gopherjs/js"];
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
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_atomic = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		/* */ } return; } }; $init_atomic.$blocking = true; return $init_atomic;
	};
	return $pkg;
})();
$packages["sync"] = (function() {
	var $pkg = {}, runtime, atomic, Pool, Mutex, poolLocal, syncSema, ptrType, sliceType, ptrType$2, ptrType$3, ptrType$5, sliceType$2, funcType, ptrType$10, arrayType, allPools, runtime_registerPoolCleanup, runtime_Syncsemcheck, poolCleanup, init, indexLocal, runtime_Semacquire, runtime_Semrelease, init$1;
	runtime = $packages["runtime"];
	atomic = $packages["sync/atomic"];
	Pool = $pkg.Pool = $newType(0, $kindStruct, "sync.Pool", "Pool", "sync", function(local_, localSize_, store_, New_) {
		this.$val = this;
		this.local = local_ !== undefined ? local_ : 0;
		this.localSize = localSize_ !== undefined ? localSize_ : 0;
		this.store = store_ !== undefined ? store_ : sliceType$2.nil;
		this.New = New_ !== undefined ? New_ : $throwNilPointerError;
	});
	Mutex = $pkg.Mutex = $newType(0, $kindStruct, "sync.Mutex", "Mutex", "sync", function(state_, sema_) {
		this.$val = this;
		this.state = state_ !== undefined ? state_ : 0;
		this.sema = sema_ !== undefined ? sema_ : 0;
	});
	poolLocal = $pkg.poolLocal = $newType(0, $kindStruct, "sync.poolLocal", "poolLocal", "sync", function(private$0_, shared_, Mutex_, pad_) {
		this.$val = this;
		this.private$0 = private$0_ !== undefined ? private$0_ : $ifaceNil;
		this.shared = shared_ !== undefined ? shared_ : sliceType$2.nil;
		this.Mutex = Mutex_ !== undefined ? Mutex_ : new Mutex.ptr();
		this.pad = pad_ !== undefined ? pad_ : arrayType.zero();
	});
	syncSema = $pkg.syncSema = $newType(0, $kindStruct, "sync.syncSema", "syncSema", "sync", function(lock_, head_, tail_) {
		this.$val = this;
		this.lock = lock_ !== undefined ? lock_ : 0;
		this.head = head_ !== undefined ? head_ : 0;
		this.tail = tail_ !== undefined ? tail_ : 0;
	});
	ptrType = $ptrType(Pool);
	sliceType = $sliceType(ptrType);
	ptrType$2 = $ptrType($Uint32);
	ptrType$3 = $ptrType($Int32);
	ptrType$5 = $ptrType(poolLocal);
	sliceType$2 = $sliceType($emptyInterface);
	funcType = $funcType([], [$emptyInterface], false);
	ptrType$10 = $ptrType(Mutex);
	arrayType = $arrayType($Uint8, 128);
	Pool.ptr.prototype.Get = function() {
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
	Pool.ptr.prototype.Put = function(x) {
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
	Mutex.ptr.prototype.Lock = function() {
		var awoke, m, new$1, old;
		m = this;
		if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), 0, 1)) {
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
			if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				if ((old & 1) === 0) {
					break;
				}
				runtime_Semacquire(new ptrType$2(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				awoke = true;
			}
		}
	};
	Mutex.prototype.Lock = function() { return this.$val.Lock(); };
	Mutex.ptr.prototype.Unlock = function() {
		var m, new$1, old;
		m = this;
		new$1 = atomic.AddInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), -1);
		if ((((new$1 + 1 >> 0)) & 1) === 0) {
			$panic(new $String("sync: unlock of unlocked mutex"));
		}
		old = new$1;
		while (true) {
			if (((old >> 2 >> 0) === 0) || !(((old & 3) === 0))) {
				return;
			}
			new$1 = ((old - 4 >> 0)) | 2;
			if (atomic.CompareAndSwapInt32(new ptrType$3(function() { return this.$target.state; }, function($v) { this.$target.state = $v; }, m), old, new$1)) {
				runtime_Semrelease(new ptrType$2(function() { return this.$target.sema; }, function($v) { this.$target.sema = $v; }, m));
				return;
			}
			old = m.state;
		}
	};
	Mutex.prototype.Unlock = function() { return this.$val.Unlock(); };
	poolCleanup = function() {
		var _i, _i$1, _ref, _ref$1, i, i$1, j, l, p, x;
		_ref = allPools;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
			(i < 0 || i >= allPools.$length) ? $throwRuntimeError("index out of range") : allPools.$array[allPools.$offset + i] = ptrType.nil;
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
				l.shared = sliceType$2.nil;
				i$1 = i$1 + (1) >> 0;
			}
			p.local = 0;
			p.localSize = 0;
			_i++;
		}
		allPools = new sliceType([]);
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
		s = $clone(new syncSema.ptr(), syncSema);
		runtime_Syncsemcheck(12);
	};
	ptrType.methods = [{prop: "Get", name: "Get", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "Put", name: "Put", pkg: "", type: $funcType([$emptyInterface], [], false)}, {prop: "getSlow", name: "getSlow", pkg: "sync", type: $funcType([], [$emptyInterface], false)}, {prop: "pin", name: "pin", pkg: "sync", type: $funcType([], [ptrType$5], false)}, {prop: "pinSlow", name: "pinSlow", pkg: "sync", type: $funcType([], [ptrType$5], false)}];
	ptrType$10.methods = [{prop: "Lock", name: "Lock", pkg: "", type: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", type: $funcType([], [], false)}];
	ptrType$5.methods = [{prop: "Lock", name: "Lock", pkg: "", type: $funcType([], [], false)}, {prop: "Unlock", name: "Unlock", pkg: "", type: $funcType([], [], false)}];
	Pool.init([{prop: "local", name: "local", pkg: "sync", type: $UnsafePointer, tag: ""}, {prop: "localSize", name: "localSize", pkg: "sync", type: $Uintptr, tag: ""}, {prop: "store", name: "store", pkg: "sync", type: sliceType$2, tag: ""}, {prop: "New", name: "New", pkg: "", type: funcType, tag: ""}]);
	Mutex.init([{prop: "state", name: "state", pkg: "sync", type: $Int32, tag: ""}, {prop: "sema", name: "sema", pkg: "sync", type: $Uint32, tag: ""}]);
	poolLocal.init([{prop: "private$0", name: "private", pkg: "sync", type: $emptyInterface, tag: ""}, {prop: "shared", name: "shared", pkg: "sync", type: sliceType$2, tag: ""}, {prop: "Mutex", name: "", pkg: "", type: Mutex, tag: ""}, {prop: "pad", name: "pad", pkg: "sync", type: arrayType, tag: ""}]);
	syncSema.init([{prop: "lock", name: "lock", pkg: "sync", type: $Uintptr, tag: ""}, {prop: "head", name: "head", pkg: "sync", type: $UnsafePointer, tag: ""}, {prop: "tail", name: "tail", pkg: "sync", type: $UnsafePointer, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_sync = function() { while (true) { switch ($s) { case 0:
		$r = runtime.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = atomic.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		allPools = sliceType.nil;
		init();
		init$1();
		/* */ } return; } }; $init_sync.$blocking = true; return $init_sync;
	};
	return $pkg;
})();
$packages["reflect"] = (function() {
	var $pkg = {}, js, math, runtime, strconv, sync, mapIter, Type, Kind, rtype, typeAlg, method, uncommonType, ChanDir, arrayType, chanType, funcType, imethod, interfaceType, mapType, ptrType, sliceType, structField, structType, Method, StructField, StructTag, fieldScan, Value, flag, ValueError, nonEmptyInterface, ptrType$1, ptrType$2, sliceType$1, ptrType$3, arrayType$1, ptrType$4, ptrType$5, sliceType$2, sliceType$3, sliceType$4, sliceType$5, structType$5, sliceType$6, ptrType$6, arrayType$2, structType$6, ptrType$7, sliceType$7, ptrType$8, ptrType$9, ptrType$10, ptrType$11, sliceType$9, sliceType$10, ptrType$12, ptrType$17, sliceType$12, sliceType$13, ptrType$18, funcType$2, ptrType$19, funcType$3, funcType$4, ptrType$20, ptrType$21, ptrType$22, ptrType$23, ptrType$24, ptrType$25, arrayType$3, ptrType$27, ptrType$28, ptrType$29, initialized, stringPtrMap, jsObject, jsContainer, kindNames, uint8Type, init, jsType, reflectType, newStringPtr, isWrapped, copyStruct, makeValue, MakeSlice, TypeOf, ValueOf, SliceOf, Zero, unsafe_New, makeInt, memmove, mapaccess, mapassign, mapdelete, mapiterinit, mapiterkey, mapiternext, maplen, cvtDirect, methodReceiver, valueInterface, ifaceE2I, methodName, makeMethodValue, wrapJsObject, unwrapJsObject, PtrTo, implements$1, directlyAssignable, haveIdenticalUnderlyingType, toType, ifaceIndir, overflowFloat32, New, convertOp, makeFloat, makeComplex, makeString, makeBytes, makeRunes, cvtInt, cvtUint, cvtFloatInt, cvtFloatUint, cvtIntFloat, cvtUintFloat, cvtFloat, cvtComplex, cvtIntString, cvtUintString, cvtBytesString, cvtStringBytes, cvtRunesString, cvtStringRunes, cvtT2I, cvtI2I;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	math = $packages["math"];
	runtime = $packages["runtime"];
	strconv = $packages["strconv"];
	sync = $packages["sync"];
	mapIter = $pkg.mapIter = $newType(0, $kindStruct, "reflect.mapIter", "mapIter", "reflect", function(t_, m_, keys_, i_) {
		this.$val = this;
		this.t = t_ !== undefined ? t_ : $ifaceNil;
		this.m = m_ !== undefined ? m_ : null;
		this.keys = keys_ !== undefined ? keys_ : null;
		this.i = i_ !== undefined ? i_ : 0;
	});
	Type = $pkg.Type = $newType(8, $kindInterface, "reflect.Type", "Type", "reflect", null);
	Kind = $pkg.Kind = $newType(4, $kindUint, "reflect.Kind", "Kind", "reflect", null);
	rtype = $pkg.rtype = $newType(0, $kindStruct, "reflect.rtype", "rtype", "reflect", function(size_, hash_, _$2_, align_, fieldAlign_, kind_, alg_, gc_, string_, uncommonType_, ptrToThis_, zero_) {
		this.$val = this;
		this.size = size_ !== undefined ? size_ : 0;
		this.hash = hash_ !== undefined ? hash_ : 0;
		this._$2 = _$2_ !== undefined ? _$2_ : 0;
		this.align = align_ !== undefined ? align_ : 0;
		this.fieldAlign = fieldAlign_ !== undefined ? fieldAlign_ : 0;
		this.kind = kind_ !== undefined ? kind_ : 0;
		this.alg = alg_ !== undefined ? alg_ : ptrType$3.nil;
		this.gc = gc_ !== undefined ? gc_ : arrayType$1.zero();
		this.string = string_ !== undefined ? string_ : ptrType$4.nil;
		this.uncommonType = uncommonType_ !== undefined ? uncommonType_ : ptrType$5.nil;
		this.ptrToThis = ptrToThis_ !== undefined ? ptrToThis_ : ptrType$1.nil;
		this.zero = zero_ !== undefined ? zero_ : 0;
	});
	typeAlg = $pkg.typeAlg = $newType(0, $kindStruct, "reflect.typeAlg", "typeAlg", "reflect", function(hash_, equal_) {
		this.$val = this;
		this.hash = hash_ !== undefined ? hash_ : $throwNilPointerError;
		this.equal = equal_ !== undefined ? equal_ : $throwNilPointerError;
	});
	method = $pkg.method = $newType(0, $kindStruct, "reflect.method", "method", "reflect", function(name_, pkgPath_, mtyp_, typ_, ifn_, tfn_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ptrType$4.nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ptrType$4.nil;
		this.mtyp = mtyp_ !== undefined ? mtyp_ : ptrType$1.nil;
		this.typ = typ_ !== undefined ? typ_ : ptrType$1.nil;
		this.ifn = ifn_ !== undefined ? ifn_ : 0;
		this.tfn = tfn_ !== undefined ? tfn_ : 0;
	});
	uncommonType = $pkg.uncommonType = $newType(0, $kindStruct, "reflect.uncommonType", "uncommonType", "reflect", function(name_, pkgPath_, methods_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ptrType$4.nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ptrType$4.nil;
		this.methods = methods_ !== undefined ? methods_ : sliceType$2.nil;
	});
	ChanDir = $pkg.ChanDir = $newType(4, $kindInt, "reflect.ChanDir", "ChanDir", "reflect", null);
	arrayType = $pkg.arrayType = $newType(0, $kindStruct, "reflect.arrayType", "arrayType", "reflect", function(rtype_, elem_, slice_, len_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
		this.slice = slice_ !== undefined ? slice_ : ptrType$1.nil;
		this.len = len_ !== undefined ? len_ : 0;
	});
	chanType = $pkg.chanType = $newType(0, $kindStruct, "reflect.chanType", "chanType", "reflect", function(rtype_, elem_, dir_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
		this.dir = dir_ !== undefined ? dir_ : 0;
	});
	funcType = $pkg.funcType = $newType(0, $kindStruct, "reflect.funcType", "funcType", "reflect", function(rtype_, dotdotdot_, in$2_, out_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.dotdotdot = dotdotdot_ !== undefined ? dotdotdot_ : false;
		this.in$2 = in$2_ !== undefined ? in$2_ : sliceType$3.nil;
		this.out = out_ !== undefined ? out_ : sliceType$3.nil;
	});
	imethod = $pkg.imethod = $newType(0, $kindStruct, "reflect.imethod", "imethod", "reflect", function(name_, pkgPath_, typ_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ptrType$4.nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ptrType$4.nil;
		this.typ = typ_ !== undefined ? typ_ : ptrType$1.nil;
	});
	interfaceType = $pkg.interfaceType = $newType(0, $kindStruct, "reflect.interfaceType", "interfaceType", "reflect", function(rtype_, methods_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.methods = methods_ !== undefined ? methods_ : sliceType$4.nil;
	});
	mapType = $pkg.mapType = $newType(0, $kindStruct, "reflect.mapType", "mapType", "reflect", function(rtype_, key_, elem_, bucket_, hmap_, keysize_, indirectkey_, valuesize_, indirectvalue_, bucketsize_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.key = key_ !== undefined ? key_ : ptrType$1.nil;
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
		this.bucket = bucket_ !== undefined ? bucket_ : ptrType$1.nil;
		this.hmap = hmap_ !== undefined ? hmap_ : ptrType$1.nil;
		this.keysize = keysize_ !== undefined ? keysize_ : 0;
		this.indirectkey = indirectkey_ !== undefined ? indirectkey_ : 0;
		this.valuesize = valuesize_ !== undefined ? valuesize_ : 0;
		this.indirectvalue = indirectvalue_ !== undefined ? indirectvalue_ : 0;
		this.bucketsize = bucketsize_ !== undefined ? bucketsize_ : 0;
	});
	ptrType = $pkg.ptrType = $newType(0, $kindStruct, "reflect.ptrType", "ptrType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
	});
	sliceType = $pkg.sliceType = $newType(0, $kindStruct, "reflect.sliceType", "sliceType", "reflect", function(rtype_, elem_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.elem = elem_ !== undefined ? elem_ : ptrType$1.nil;
	});
	structField = $pkg.structField = $newType(0, $kindStruct, "reflect.structField", "structField", "reflect", function(name_, pkgPath_, typ_, tag_, offset_) {
		this.$val = this;
		this.name = name_ !== undefined ? name_ : ptrType$4.nil;
		this.pkgPath = pkgPath_ !== undefined ? pkgPath_ : ptrType$4.nil;
		this.typ = typ_ !== undefined ? typ_ : ptrType$1.nil;
		this.tag = tag_ !== undefined ? tag_ : ptrType$4.nil;
		this.offset = offset_ !== undefined ? offset_ : 0;
	});
	structType = $pkg.structType = $newType(0, $kindStruct, "reflect.structType", "structType", "reflect", function(rtype_, fields_) {
		this.$val = this;
		this.rtype = rtype_ !== undefined ? rtype_ : new rtype.ptr();
		this.fields = fields_ !== undefined ? fields_ : sliceType$5.nil;
	});
	Method = $pkg.Method = $newType(0, $kindStruct, "reflect.Method", "Method", "reflect", function(Name_, PkgPath_, Type_, Func_, Index_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : $ifaceNil;
		this.Func = Func_ !== undefined ? Func_ : new Value.ptr();
		this.Index = Index_ !== undefined ? Index_ : 0;
	});
	StructField = $pkg.StructField = $newType(0, $kindStruct, "reflect.StructField", "StructField", "reflect", function(Name_, PkgPath_, Type_, Tag_, Offset_, Index_, Anonymous_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.PkgPath = PkgPath_ !== undefined ? PkgPath_ : "";
		this.Type = Type_ !== undefined ? Type_ : $ifaceNil;
		this.Tag = Tag_ !== undefined ? Tag_ : "";
		this.Offset = Offset_ !== undefined ? Offset_ : 0;
		this.Index = Index_ !== undefined ? Index_ : sliceType$9.nil;
		this.Anonymous = Anonymous_ !== undefined ? Anonymous_ : false;
	});
	StructTag = $pkg.StructTag = $newType(8, $kindString, "reflect.StructTag", "StructTag", "reflect", null);
	fieldScan = $pkg.fieldScan = $newType(0, $kindStruct, "reflect.fieldScan", "fieldScan", "reflect", function(typ_, index_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ptrType$12.nil;
		this.index = index_ !== undefined ? index_ : sliceType$9.nil;
	});
	Value = $pkg.Value = $newType(0, $kindStruct, "reflect.Value", "Value", "reflect", function(typ_, ptr_, flag_) {
		this.$val = this;
		this.typ = typ_ !== undefined ? typ_ : ptrType$1.nil;
		this.ptr = ptr_ !== undefined ? ptr_ : 0;
		this.flag = flag_ !== undefined ? flag_ : 0;
	});
	flag = $pkg.flag = $newType(4, $kindUintptr, "reflect.flag", "flag", "reflect", null);
	ValueError = $pkg.ValueError = $newType(0, $kindStruct, "reflect.ValueError", "ValueError", "reflect", function(Method_, Kind_) {
		this.$val = this;
		this.Method = Method_ !== undefined ? Method_ : "";
		this.Kind = Kind_ !== undefined ? Kind_ : 0;
	});
	nonEmptyInterface = $pkg.nonEmptyInterface = $newType(0, $kindStruct, "reflect.nonEmptyInterface", "nonEmptyInterface", "reflect", function(itab_, word_) {
		this.$val = this;
		this.itab = itab_ !== undefined ? itab_ : ptrType$7.nil;
		this.word = word_ !== undefined ? word_ : 0;
	});
	ptrType$1 = $ptrType(rtype);
	ptrType$2 = $ptrType(ptrType);
	sliceType$1 = $sliceType($String);
	ptrType$3 = $ptrType(typeAlg);
	arrayType$1 = $arrayType($UnsafePointer, 2);
	ptrType$4 = $ptrType($String);
	ptrType$5 = $ptrType(uncommonType);
	sliceType$2 = $sliceType(method);
	sliceType$3 = $sliceType(ptrType$1);
	sliceType$4 = $sliceType(imethod);
	sliceType$5 = $sliceType(structField);
	structType$5 = $structType([{prop: "str", name: "str", pkg: "reflect", type: $String, tag: ""}]);
	sliceType$6 = $sliceType(Value);
	ptrType$6 = $ptrType(nonEmptyInterface);
	arrayType$2 = $arrayType($UnsafePointer, 100000);
	structType$6 = $structType([{prop: "ityp", name: "ityp", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "typ", name: "typ", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "link", name: "link", pkg: "reflect", type: $UnsafePointer, tag: ""}, {prop: "bad", name: "bad", pkg: "reflect", type: $Int32, tag: ""}, {prop: "unused", name: "unused", pkg: "reflect", type: $Int32, tag: ""}, {prop: "fun", name: "fun", pkg: "reflect", type: arrayType$2, tag: ""}]);
	ptrType$7 = $ptrType(structType$6);
	sliceType$7 = $sliceType(js.Object);
	ptrType$8 = $ptrType($Uint8);
	ptrType$9 = $ptrType(method);
	ptrType$10 = $ptrType(interfaceType);
	ptrType$11 = $ptrType(imethod);
	sliceType$9 = $sliceType($Int);
	sliceType$10 = $sliceType(fieldScan);
	ptrType$12 = $ptrType(structType);
	ptrType$17 = $ptrType($UnsafePointer);
	sliceType$12 = $sliceType($Uint8);
	sliceType$13 = $sliceType($Int32);
	ptrType$18 = $ptrType(funcType);
	funcType$2 = $funcType([$String], [$Bool], false);
	ptrType$19 = $ptrType(Kind);
	funcType$3 = $funcType([$UnsafePointer, $Uintptr, $Uintptr], [$Uintptr], false);
	funcType$4 = $funcType([$UnsafePointer, $UnsafePointer, $Uintptr], [$Bool], false);
	ptrType$20 = $ptrType(ChanDir);
	ptrType$21 = $ptrType(arrayType);
	ptrType$22 = $ptrType(chanType);
	ptrType$23 = $ptrType(mapType);
	ptrType$24 = $ptrType(sliceType);
	ptrType$25 = $ptrType(StructTag);
	arrayType$3 = $arrayType($Uintptr, 2);
	ptrType$27 = $ptrType(Value);
	ptrType$28 = $ptrType(flag);
	ptrType$29 = $ptrType(ValueError);
	init = function() {
		var used, x, x$1, x$10, x$11, x$12, x$2, x$3, x$4, x$5, x$6, x$7, x$8, x$9;
		used = (function(i) {
		});
		used((x = new rtype.ptr(0, 0, 0, 0, 0, 0, ptrType$3.nil, arrayType$1.zero(), ptrType$4.nil, ptrType$5.nil, ptrType$1.nil, 0), new x.constructor.elem(x)));
		used((x$1 = new uncommonType.ptr(ptrType$4.nil, ptrType$4.nil, sliceType$2.nil), new x$1.constructor.elem(x$1)));
		used((x$2 = new method.ptr(ptrType$4.nil, ptrType$4.nil, ptrType$1.nil, ptrType$1.nil, 0, 0), new x$2.constructor.elem(x$2)));
		used((x$3 = new arrayType.ptr(new rtype.ptr(), ptrType$1.nil, ptrType$1.nil, 0), new x$3.constructor.elem(x$3)));
		used((x$4 = new chanType.ptr(new rtype.ptr(), ptrType$1.nil, 0), new x$4.constructor.elem(x$4)));
		used((x$5 = new funcType.ptr(new rtype.ptr(), false, sliceType$3.nil, sliceType$3.nil), new x$5.constructor.elem(x$5)));
		used((x$6 = new interfaceType.ptr(new rtype.ptr(), sliceType$4.nil), new x$6.constructor.elem(x$6)));
		used((x$7 = new mapType.ptr(new rtype.ptr(), ptrType$1.nil, ptrType$1.nil, ptrType$1.nil, ptrType$1.nil, 0, 0, 0, 0, 0), new x$7.constructor.elem(x$7)));
		used((x$8 = new ptrType.ptr(new rtype.ptr(), ptrType$1.nil), new x$8.constructor.elem(x$8)));
		used((x$9 = new sliceType.ptr(new rtype.ptr(), ptrType$1.nil), new x$9.constructor.elem(x$9)));
		used((x$10 = new structType.ptr(new rtype.ptr(), sliceType$5.nil), new x$10.constructor.elem(x$10)));
		used((x$11 = new imethod.ptr(ptrType$4.nil, ptrType$4.nil, ptrType$1.nil), new x$11.constructor.elem(x$11)));
		used((x$12 = new structField.ptr(ptrType$4.nil, ptrType$4.nil, ptrType$1.nil, ptrType$4.nil, 0), new x$12.constructor.elem(x$12)));
		initialized = true;
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ptrType$1);
	};
	jsType = function(typ) {
		return typ.jsType;
	};
	reflectType = function(typ) {
		var _i, _i$1, _i$2, _i$3, _i$4, _ref, _ref$1, _ref$2, _ref$3, _ref$4, _ref$5, dir, f, fields, i, i$1, i$2, i$3, i$4, imethods, in$1, m, m$1, methods, methods$1, out, params, reflectFields, reflectMethods, results, rt, setKindType, t;
		if (typ.reflectType === undefined) {
			rt = new rtype.ptr((($parseInt(typ.size) >> 0) >>> 0), 0, 0, 0, 0, (($parseInt(typ.kind) >> 0) << 24 >>> 24), ptrType$3.nil, arrayType$1.zero(), newStringPtr(typ.string), ptrType$5.nil, ptrType$1.nil, 0);
			rt.jsType = typ;
			typ.reflectType = rt;
			methods = typ.methods;
			if (!($internalize(typ.typeName, $String) === "") || !(($parseInt(methods.length) === 0))) {
				reflectMethods = $makeSlice(sliceType$2, $parseInt(methods.length));
				_ref = reflectMethods;
				_i = 0;
				while (_i < _ref.$length) {
					i = _i;
					m = methods[i];
					t = m.type;
					$copy(((i < 0 || i >= reflectMethods.$length) ? $throwRuntimeError("index out of range") : reflectMethods.$array[reflectMethods.$offset + i]), new method.ptr(newStringPtr(m.name), newStringPtr(m.pkg), reflectType(t), reflectType($funcType(new ($global.Array)(typ).concat(t.params), t.results, t.variadic)), 0, 0), method);
					_i++;
				}
				rt.uncommonType = new uncommonType.ptr(newStringPtr(typ.typeName), newStringPtr(typ.pkg), reflectMethods);
				rt.uncommonType.jsType = typ;
			}
			setKindType = (function(kindType) {
				kindType.rtype = rt;
				rt.kindType = kindType;
			});
			_ref$1 = rt.Kind();
			if (_ref$1 === 17) {
				setKindType(new arrayType.ptr(new rtype.ptr(), reflectType(typ.elem), ptrType$1.nil, (($parseInt(typ.len) >> 0) >>> 0)));
			} else if (_ref$1 === 18) {
				dir = 3;
				if (!!(typ.sendOnly)) {
					dir = 2;
				}
				if (!!(typ.recvOnly)) {
					dir = 1;
				}
				setKindType(new chanType.ptr(new rtype.ptr(), reflectType(typ.elem), (dir >>> 0)));
			} else if (_ref$1 === 19) {
				params = typ.params;
				in$1 = $makeSlice(sliceType$3, $parseInt(params.length));
				_ref$2 = in$1;
				_i$1 = 0;
				while (_i$1 < _ref$2.$length) {
					i$1 = _i$1;
					(i$1 < 0 || i$1 >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + i$1] = reflectType(params[i$1]);
					_i$1++;
				}
				results = typ.results;
				out = $makeSlice(sliceType$3, $parseInt(results.length));
				_ref$3 = out;
				_i$2 = 0;
				while (_i$2 < _ref$3.$length) {
					i$2 = _i$2;
					(i$2 < 0 || i$2 >= out.$length) ? $throwRuntimeError("index out of range") : out.$array[out.$offset + i$2] = reflectType(results[i$2]);
					_i$2++;
				}
				setKindType(new funcType.ptr($clone(rt, rtype), !!(typ.variadic), in$1, out));
			} else if (_ref$1 === 20) {
				methods$1 = typ.methods;
				imethods = $makeSlice(sliceType$4, $parseInt(methods$1.length));
				_ref$4 = imethods;
				_i$3 = 0;
				while (_i$3 < _ref$4.$length) {
					i$3 = _i$3;
					m$1 = methods$1[i$3];
					$copy(((i$3 < 0 || i$3 >= imethods.$length) ? $throwRuntimeError("index out of range") : imethods.$array[imethods.$offset + i$3]), new imethod.ptr(newStringPtr(m$1.name), newStringPtr(m$1.pkg), reflectType(m$1.type)), imethod);
					_i$3++;
				}
				setKindType(new interfaceType.ptr($clone(rt, rtype), imethods));
			} else if (_ref$1 === 21) {
				setKindType(new mapType.ptr(new rtype.ptr(), reflectType(typ.key), reflectType(typ.elem), ptrType$1.nil, ptrType$1.nil, 0, 0, 0, 0, 0));
			} else if (_ref$1 === 22) {
				setKindType(new ptrType.ptr(new rtype.ptr(), reflectType(typ.elem)));
			} else if (_ref$1 === 23) {
				setKindType(new sliceType.ptr(new rtype.ptr(), reflectType(typ.elem)));
			} else if (_ref$1 === 25) {
				fields = typ.fields;
				reflectFields = $makeSlice(sliceType$5, $parseInt(fields.length));
				_ref$5 = reflectFields;
				_i$4 = 0;
				while (_i$4 < _ref$5.$length) {
					i$4 = _i$4;
					f = fields[i$4];
					$copy(((i$4 < 0 || i$4 >= reflectFields.$length) ? $throwRuntimeError("index out of range") : reflectFields.$array[reflectFields.$offset + i$4]), new structField.ptr(newStringPtr(f.name), newStringPtr(f.pkg), reflectType(f.type), newStringPtr(f.tag), (i$4 >>> 0)), structField);
					_i$4++;
				}
				setKindType(new structType.ptr($clone(rt, rtype), reflectFields));
			}
		}
		return typ.reflectType;
	};
	newStringPtr = function(strObj) {
		var _entry, _key, _tuple, c, ok, ptr, str;
		c = $clone(new structType$5.ptr(), structType$5);
		c.str = strObj;
		str = c.str;
		if (str === "") {
			return ptrType$4.nil;
		}
		_tuple = (_entry = stringPtrMap[str], _entry !== undefined ? [_entry.v, true] : [ptrType$4.nil, false]); ptr = _tuple[0]; ok = _tuple[1];
		if (!ok) {
			ptr = new ptrType$4(function() { return str; }, function($v) { str = $v; });
			_key = str; (stringPtrMap || $throwRuntimeError("assignment to entry in nil map"))[_key] = { k: _key, v: ptr };
		}
		return ptr;
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
		var fields, i, prop;
		fields = jsType(typ).fields;
		i = 0;
		while (i < $parseInt(fields.length)) {
			prop = $internalize(fields[i].prop, $String);
			dst[$externalize(prop, $String)] = src[$externalize(prop, $String)];
			i = i + (1) >> 0;
		}
	};
	makeValue = function(t, v, fl) {
		var rt;
		rt = t.common();
		if ((t.Kind() === 17) || (t.Kind() === 25) || (t.Kind() === 22)) {
			return new Value.ptr(rt, v, (fl | (t.Kind() >>> 0)) >>> 0);
		}
		return new Value.ptr(rt, $newDataPointer(v, jsType(rt.ptrTo())), (((fl | (t.Kind() >>> 0)) >>> 0) | 64) >>> 0);
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
		return makeValue(typ, $makeSlice(jsType(typ), len, cap, (function() {
			return jsType(typ.Elem()).zero();
		})), 0);
	};
	TypeOf = $pkg.TypeOf = function(i) {
		if (!initialized) {
			return new rtype.ptr(0, 0, 0, 0, 0, 0, ptrType$3.nil, arrayType$1.zero(), ptrType$4.nil, ptrType$5.nil, ptrType$1.nil, 0);
		}
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return $ifaceNil;
		}
		return reflectType(i.constructor);
	};
	ValueOf = $pkg.ValueOf = function(i) {
		if ($interfaceIsEqual(i, $ifaceNil)) {
			return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		return makeValue(reflectType(i.constructor), i.$val, 0);
	};
	rtype.ptr.prototype.ptrTo = function() {
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
			return new (jsType(typ).ptr)();
		} else if (_ref === 17) {
			return jsType(typ).zero();
		} else {
			return $newDataPointer(jsType(typ).zero(), jsType(typ.ptrTo()));
		}
	};
	makeInt = function(f, bits, t) {
		var _ref, ptr, typ;
		typ = t.common();
		ptr = unsafe_New(typ);
		_ref = typ.Kind();
		if (_ref === 3) {
			ptr.$set((bits.$low << 24 >> 24));
		} else if (_ref === 4) {
			ptr.$set((bits.$low << 16 >> 16));
		} else if (_ref === 2 || _ref === 5) {
			ptr.$set((bits.$low >> 0));
		} else if (_ref === 6) {
			ptr.$set(new $Int64(bits.$high, bits.$low));
		} else if (_ref === 8) {
			ptr.$set((bits.$low << 24 >>> 24));
		} else if (_ref === 9) {
			ptr.$set((bits.$low << 16 >>> 16));
		} else if (_ref === 7 || _ref === 10 || _ref === 12) {
			ptr.$set((bits.$low >>> 0));
		} else if (_ref === 11) {
			ptr.$set(bits);
		}
		return new Value.ptr(typ, ptr, (((f | 64) >>> 0) | (typ.Kind() >>> 0)) >>> 0);
	};
	memmove = function(adst, asrc, n) {
		adst.$set(asrc.$get());
	};
	mapaccess = function(t, m, key) {
		var entry, k;
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
		var entry, et, jsVal, k, kv, newVal;
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
		return new mapIter.ptr(t, m, $keys(m), 0);
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
		var _ref, k, slice, srcVal, val;
		v = v;
		srcVal = v.object();
		if (srcVal === jsType(v.typ).nil) {
			return makeValue(typ, jsType(typ).nil, v.flag);
		}
		val = null;
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
			val = new (jsType(typ).ptr)();
			copyStruct(val, srcVal, typ);
		} else if (_ref === 17 || _ref === 19 || _ref === 20 || _ref === 21 || _ref === 24) {
			val = v.ptr;
		} else {
			$panic(new ValueError.ptr("reflect.Convert", k));
		} }
		return new Value.ptr(typ.common(), val, (((v.flag & 96) >>> 0) | (typ.Kind() >>> 0)) >>> 0);
	};
	methodReceiver = function(op, v, i) {
		var fn = 0, iface, m, m$1, prop, rcvr, rcvrtype = ptrType$1.nil, t = ptrType$1.nil, tt, ut, x, x$1;
		v = v;
		prop = "";
		if (v.typ.Kind() === 20) {
			tt = v.typ.kindType;
			if (i < 0 || i >= tt.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (!($pointerIsEqual(m.pkgPath, ptrType$4.nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			iface = $pointerOfStructConversion(v.ptr, ptrType$6);
			if (iface.itab === ptrType$7.nil) {
				$panic(new $String("reflect: " + op + " of method on nil interface value"));
			}
			t = m.typ;
			prop = m.name.$get();
		} else {
			ut = v.typ.uncommonType.uncommon();
			if (ut === ptrType$5.nil || i < 0 || i >= ut.methods.$length) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m$1 = (x$1 = ut.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
			if (!($pointerIsEqual(m$1.pkgPath, ptrType$4.nil))) {
				$panic(new $String("reflect: " + op + " of unexported method"));
			}
			t = m$1.mtyp;
			prop = $internalize(jsType(v.typ).methods[i].prop, $String);
		}
		rcvr = v.object();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fn = rcvr[$externalize(prop, $String)];
		return [rcvrtype, t, fn];
	};
	valueInterface = function(v, safe) {
		v = v;
		if (v.flag === 0) {
			$panic(new ValueError.ptr("reflect.Value.Interface", 0));
		}
		if (safe && !((((v.flag & 32) >>> 0) === 0))) {
			$panic(new $String("reflect.Value.Interface: cannot return value obtained from unexported field or method"));
		}
		if (!((((v.flag & 256) >>> 0) === 0))) {
			v = makeMethodValue("Interface", v);
		}
		if (isWrapped(v.typ)) {
			return new (jsType(v.typ))(v.object());
		}
		return v.object();
	};
	ifaceE2I = function(t, src, dst) {
		dst.$set(src);
	};
	methodName = function() {
		return "?FIXME?";
	};
	makeMethodValue = function(op, v) {
		var _tuple, fn, fv, rcvr;
		v = v;
		if (((v.flag & 256) >>> 0) === 0) {
			$panic(new $String("reflect: internal error: invalid use of makePartialFunc"));
		}
		_tuple = methodReceiver(op, v, (v.flag >> 0) >> 9 >> 0); fn = _tuple[2];
		rcvr = v.object();
		if (isWrapped(v.typ)) {
			rcvr = new (jsType(v.typ))(rcvr);
		}
		fv = (function() {
			return fn.apply(rcvr, $externalize(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), sliceType$7));
		});
		return new Value.ptr(v.Type().common(), fv, (((v.flag & 32) >>> 0) | 19) >>> 0);
	};
	rtype.ptr.prototype.pointers = function() {
		var _ref, t;
		t = this;
		_ref = t.Kind();
		if (_ref === 22 || _ref === 21 || _ref === 18 || _ref === 19 || _ref === 25 || _ref === 17) {
			return true;
		} else {
			return false;
		}
	};
	rtype.prototype.pointers = function() { return this.$val.pointers(); };
	rtype.ptr.prototype.Comparable = function() {
		var _ref, i, t;
		t = this;
		_ref = t.Kind();
		if (_ref === 19 || _ref === 23 || _ref === 21) {
			return false;
		} else if (_ref === 17) {
			return t.Elem().Comparable();
		} else if (_ref === 25) {
			i = 0;
			while (i < t.NumField()) {
				if (!t.Field(i).Type.Comparable()) {
					return false;
				}
				i = i + (1) >> 0;
			}
		}
		return true;
	};
	rtype.prototype.Comparable = function() { return this.$val.Comparable(); };
	uncommonType.ptr.prototype.Method = function(i) {
		var fl, fn, m = new Method.ptr(), mt, p, prop, t, x;
		t = this;
		if (t === ptrType$5.nil || i < 0 || i >= t.methods.$length) {
			$panic(new $String("reflect: Method index out of range"));
		}
		p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		if (!($pointerIsEqual(p.name, ptrType$4.nil))) {
			m.Name = p.name.$get();
		}
		fl = 19;
		if (!($pointerIsEqual(p.pkgPath, ptrType$4.nil))) {
			m.PkgPath = p.pkgPath.$get();
			fl = (fl | (32)) >>> 0;
		}
		mt = p.typ;
		m.Type = mt;
		prop = $internalize(t.jsType.methods[i].prop, $String);
		fn = (function(rcvr) {
			return rcvr[$externalize(prop, $String)].apply(rcvr, $externalize($subslice(new ($sliceType(js.Object))($global.Array.prototype.slice.call(arguments, [])), 1), sliceType$7));
		});
		m.Func = new Value.ptr(mt, fn, fl);
		m.Index = i;
		return m;
	};
	uncommonType.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.ptr.prototype.object = function() {
		var _ref, newVal, v, val;
		v = this;
		if ((v.typ.Kind() === 17) || (v.typ.Kind() === 25)) {
			return v.ptr;
		}
		if (!((((v.flag & 64) >>> 0) === 0))) {
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
		return v.ptr;
	};
	Value.prototype.object = function() { return this.$val.object(); };
	Value.ptr.prototype.call = function(op, in$1) {
		var _i, _i$1, _i$2, _ref, _ref$1, _ref$2, _ref$3, _tmp, _tmp$1, _tuple, arg, argsArray, elem, fn, i, i$1, i$2, i$3, isSlice, m, n, nin, nout, origIn, rcvr, results, ret, slice, t, targ, v, x, x$1, x$2, xt, xt$1;
		v = this;
		t = v.typ;
		fn = 0;
		rcvr = null;
		if (!((((v.flag & 256) >>> 0) === 0))) {
			_tuple = methodReceiver(op, v, (v.flag >> 0) >> 9 >> 0); t = _tuple[1]; fn = _tuple[2];
			rcvr = v.object();
			if (isWrapped(v.typ)) {
				rcvr = new (jsType(v.typ))(rcvr);
			}
		} else {
			fn = v.object();
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
			x = ((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]);
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
			slice = MakeSlice(t.In(n), m, m);
			elem = t.In(n).Elem();
			i$1 = 0;
			while (i$1 < m) {
				x$2 = (x$1 = n + i$1 >> 0, ((x$1 < 0 || x$1 >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + x$1]));
				xt$1 = x$2.Type();
				if (!xt$1.AssignableTo(elem)) {
					$panic(new $String("reflect: cannot use " + xt$1.String() + " as type " + elem.String() + " in " + op));
				}
				slice.Index(i$1).Set(x$2);
				i$1 = i$1 + (1) >> 0;
			}
			origIn = in$1;
			in$1 = $makeSlice(sliceType$6, (n + 1 >> 0));
			$copySlice($subslice(in$1, 0, n), origIn);
			(n < 0 || n >= in$1.$length) ? $throwRuntimeError("index out of range") : in$1.$array[in$1.$offset + n] = slice;
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
			arg = ((_i$1 < 0 || _i$1 >= _ref$1.$length) ? $throwRuntimeError("index out of range") : _ref$1.$array[_ref$1.$offset + _i$1]);
			argsArray[i$2] = unwrapJsObject(t.In(i$2), arg.assignTo("reflect.Value.Call", t.In(i$2).common(), 0).object());
			_i$1++;
		}
		results = fn.apply(rcvr, argsArray);
		_ref$2 = nout;
		if (_ref$2 === 0) {
			return sliceType$6.nil;
		} else if (_ref$2 === 1) {
			return new sliceType$6([$clone(makeValue(t.Out(0), wrapJsObject(t.Out(0), results), 0), Value)]);
		} else {
			ret = $makeSlice(sliceType$6, nout);
			_ref$3 = ret;
			_i$2 = 0;
			while (_i$2 < _ref$3.$length) {
				i$3 = _i$2;
				(i$3 < 0 || i$3 >= ret.$length) ? $throwRuntimeError("index out of range") : ret.$array[ret.$offset + i$3] = makeValue(t.Out(i$3), wrapJsObject(t.Out(i$3), results[i$3]), 0);
				_i$2++;
			}
			return ret;
		}
	};
	Value.prototype.call = function(op, in$1) { return this.$val.call(op, in$1); };
	Value.ptr.prototype.Cap = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 17) {
			return v.typ.Len();
		} else if (_ref === 18 || _ref === 23) {
			return $parseInt(v.object().$capacity) >> 0;
		}
		$panic(new ValueError.ptr("reflect.Value.Cap", k));
	};
	Value.prototype.Cap = function() { return this.$val.Cap(); };
	wrapJsObject = function(typ, val) {
		if ($interfaceIsEqual(typ, reflectType(jsObject))) {
			return new (jsContainer)(val);
		}
		return val;
	};
	unwrapJsObject = function(typ, val) {
		if ($interfaceIsEqual(typ, reflectType(jsObject))) {
			return val.Object;
		}
		return val;
	};
	Value.ptr.prototype.Elem = function() {
		var _ref, fl, k, tt, typ, v, val, val$1;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 20) {
			val = v.object();
			if (val === $ifaceNil) {
				return new Value.ptr(ptrType$1.nil, 0, 0);
			}
			typ = reflectType(val.constructor);
			return makeValue(typ, val.$val, (v.flag & 32) >>> 0);
		} else if (_ref === 22) {
			if (v.IsNil()) {
				return new Value.ptr(ptrType$1.nil, 0, 0);
			}
			val$1 = v.object();
			tt = v.typ.kindType;
			fl = (((((v.flag & 32) >>> 0) | 64) >>> 0) | 128) >>> 0;
			fl = (fl | ((tt.elem.Kind() >>> 0))) >>> 0;
			return new Value.ptr(tt.elem, wrapJsObject(tt.elem, val$1), fl);
		} else {
			$panic(new ValueError.ptr("reflect.Value.Elem", k));
		}
	};
	Value.prototype.Elem = function() { return this.$val.Elem(); };
	Value.ptr.prototype.Field = function(i) {
		var field, fl, prop, s, tt, typ, v, x;
		v = this;
		new flag(v.flag).mustBe(25);
		tt = v.typ.kindType;
		if (i < 0 || i >= tt.fields.$length) {
			$panic(new $String("reflect: Field index out of range"));
		}
		field = (x = tt.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		prop = $internalize(jsType(v.typ).fields[i].prop, $String);
		typ = field.typ;
		fl = (v.flag & 224) >>> 0;
		if (!($pointerIsEqual(field.pkgPath, ptrType$4.nil))) {
			fl = (fl | (32)) >>> 0;
		}
		fl = (fl | ((typ.Kind() >>> 0))) >>> 0;
		s = v.ptr;
		if (!((((fl & 64) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
			return new Value.ptr(typ, new (jsType(PtrTo(typ)))((function() {
				return wrapJsObject(typ, s[$externalize(prop, $String)]);
			}), (function(v$1) {
				s[$externalize(prop, $String)] = unwrapJsObject(typ, v$1);
			})), fl);
		}
		return makeValue(typ, wrapJsObject(typ, s[$externalize(prop, $String)]), fl);
	};
	Value.prototype.Field = function(i) { return this.$val.Field(i); };
	Value.ptr.prototype.Index = function(i) {
		var _ref, a, a$1, c, fl, fl$1, fl$2, k, s, str, tt, tt$1, typ, typ$1, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 17) {
			tt = v.typ.kindType;
			if (i < 0 || i > (tt.len >> 0)) {
				$panic(new $String("reflect: array index out of range"));
			}
			typ = tt.elem;
			fl = (v.flag & 224) >>> 0;
			fl = (fl | ((typ.Kind() >>> 0))) >>> 0;
			a = v.ptr;
			if (!((((fl & 64) >>> 0) === 0)) && !((typ.Kind() === 17)) && !((typ.Kind() === 25))) {
				return new Value.ptr(typ, new (jsType(PtrTo(typ)))((function() {
					return wrapJsObject(typ, a[i]);
				}), (function(v$1) {
					a[i] = unwrapJsObject(typ, v$1);
				})), fl);
			}
			return makeValue(typ, wrapJsObject(typ, a[i]), fl);
		} else if (_ref === 23) {
			s = v.object();
			if (i < 0 || i >= ($parseInt(s.$length) >> 0)) {
				$panic(new $String("reflect: slice index out of range"));
			}
			tt$1 = v.typ.kindType;
			typ$1 = tt$1.elem;
			fl$1 = (192 | ((v.flag & 32) >>> 0)) >>> 0;
			fl$1 = (fl$1 | ((typ$1.Kind() >>> 0))) >>> 0;
			i = i + (($parseInt(s.$offset) >> 0)) >> 0;
			a$1 = s.$array;
			if (!((((fl$1 & 64) >>> 0) === 0)) && !((typ$1.Kind() === 17)) && !((typ$1.Kind() === 25))) {
				return new Value.ptr(typ$1, new (jsType(PtrTo(typ$1)))((function() {
					return wrapJsObject(typ$1, a$1[i]);
				}), (function(v$1) {
					a$1[i] = unwrapJsObject(typ$1, v$1);
				})), fl$1);
			}
			return makeValue(typ$1, wrapJsObject(typ$1, a$1[i]), fl$1);
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || i >= str.length) {
				$panic(new $String("reflect: string index out of range"));
			}
			fl$2 = (((v.flag & 32) >>> 0) | 8) >>> 0;
			c = str.charCodeAt(i);
			return new Value.ptr(uint8Type, new ptrType$8(function() { return c; }, function($v) { c = $v; }), (fl$2 | 64) >>> 0);
		} else {
			$panic(new ValueError.ptr("reflect.Value.Index", k));
		}
	};
	Value.prototype.Index = function(i) { return this.$val.Index(i); };
	Value.ptr.prototype.IsNil = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 18 || _ref === 22 || _ref === 23) {
			return v.object() === jsType(v.typ).nil;
		} else if (_ref === 19) {
			return v.object() === $throwNilPointerError;
		} else if (_ref === 21) {
			return v.object() === false;
		} else if (_ref === 20) {
			return v.object() === $ifaceNil;
		} else {
			$panic(new ValueError.ptr("reflect.Value.IsNil", k));
		}
	};
	Value.prototype.IsNil = function() { return this.$val.IsNil(); };
	Value.ptr.prototype.Len = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 17 || _ref === 24) {
			return $parseInt(v.object().length);
		} else if (_ref === 23) {
			return $parseInt(v.object().$length) >> 0;
		} else if (_ref === 18) {
			return $parseInt(v.object().$buffer.length) >> 0;
		} else if (_ref === 21) {
			return $parseInt($keys(v.object()).length);
		} else {
			$panic(new ValueError.ptr("reflect.Value.Len", k));
		}
	};
	Value.prototype.Len = function() { return this.$val.Len(); };
	Value.ptr.prototype.Pointer = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 18 || _ref === 21 || _ref === 22 || _ref === 26) {
			if (v.IsNil()) {
				return 0;
			}
			return v.object();
		} else if (_ref === 19) {
			if (v.IsNil()) {
				return 0;
			}
			return 1;
		} else if (_ref === 23) {
			if (v.IsNil()) {
				return 0;
			}
			return v.object().$array;
		} else {
			$panic(new ValueError.ptr("reflect.Value.Pointer", k));
		}
	};
	Value.prototype.Pointer = function() { return this.$val.Pointer(); };
	Value.ptr.prototype.Set = function(x) {
		var _ref, v;
		v = this;
		x = x;
		new flag(v.flag).mustBeAssignable();
		new flag(x.flag).mustBeExported();
		x = x.assignTo("reflect.Set", v.typ, 0);
		if (!((((v.flag & 64) >>> 0) === 0))) {
			_ref = v.typ.Kind();
			if (_ref === 17) {
				$copy(v.ptr, x.ptr, jsType(v.typ));
			} else if (_ref === 20) {
				v.ptr.$set(valueInterface(x, false));
			} else if (_ref === 25) {
				copyStruct(v.ptr, x.ptr, v.typ);
			} else {
				v.ptr.$set(x.object());
			}
			return;
		}
		v.ptr = x.ptr;
	};
	Value.prototype.Set = function(x) { return this.$val.Set(x); };
	Value.ptr.prototype.SetCap = function(n) {
		var newSlice, s, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
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
	Value.ptr.prototype.SetLen = function(n) {
		var newSlice, s, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
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
	Value.ptr.prototype.Slice = function(i, j) {
		var _ref, cap, kind, s, str, tt, typ, v;
		v = this;
		cap = 0;
		typ = $ifaceNil;
		s = null;
		kind = new flag(v.flag).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 128) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.kindType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.object());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.object();
			cap = $parseInt(s.$capacity) >> 0;
		} else if (_ref === 24) {
			str = v.ptr.$get();
			if (i < 0 || j < i || j > str.length) {
				$panic(new $String("reflect.Value.Slice: string slice index out of bounds"));
			}
			return ValueOf(new $String(str.substring(i, j)));
		} else {
			$panic(new ValueError.ptr("reflect.Value.Slice", kind));
		}
		if (i < 0 || j < i || j > cap) {
			$panic(new $String("reflect.Value.Slice: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j), (v.flag & 32) >>> 0);
	};
	Value.prototype.Slice = function(i, j) { return this.$val.Slice(i, j); };
	Value.ptr.prototype.Slice3 = function(i, j, k) {
		var _ref, cap, kind, s, tt, typ, v;
		v = this;
		cap = 0;
		typ = $ifaceNil;
		s = null;
		kind = new flag(v.flag).kind();
		_ref = kind;
		if (_ref === 17) {
			if (((v.flag & 128) >>> 0) === 0) {
				$panic(new $String("reflect.Value.Slice: slice of unaddressable array"));
			}
			tt = v.typ.kindType;
			cap = (tt.len >> 0);
			typ = SliceOf(tt.elem);
			s = new (jsType(typ))(v.object());
		} else if (_ref === 23) {
			typ = v.typ;
			s = v.object();
			cap = $parseInt(s.$capacity) >> 0;
		} else {
			$panic(new ValueError.ptr("reflect.Value.Slice3", kind));
		}
		if (i < 0 || j < i || k < j || k > cap) {
			$panic(new $String("reflect.Value.Slice3: slice index out of bounds"));
		}
		return makeValue(typ, $subslice(s, i, j, k), (v.flag & 32) >>> 0);
	};
	Value.prototype.Slice3 = function(i, j, k) { return this.$val.Slice3(i, j, k); };
	Value.ptr.prototype.Close = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		$close(v.object());
	};
	Value.prototype.Close = function() { return this.$val.Close(); };
	Value.ptr.prototype.TrySend = function(x) {
		var c, tt, v;
		v = this;
		x = x;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		tt = v.typ.kindType;
		if (((tt.dir >> 0) & 2) === 0) {
			$panic(new $String("reflect: send on recv-only channel"));
		}
		new flag(x.flag).mustBeExported();
		c = v.object();
		if (!!!(c.$closed) && ($parseInt(c.$recvQueue.length) === 0) && ($parseInt(c.$buffer.length) === ($parseInt(c.$capacity) >> 0))) {
			return false;
		}
		x = x.assignTo("reflect.Value.Send", tt.elem, 0);
		$send(c, x.object());
		return true;
	};
	Value.prototype.TrySend = function(x) { return this.$val.TrySend(x); };
	Value.ptr.prototype.Send = function(x) {
		var v;
		v = this;
		x = x;
		$panic(new runtime.NotSupportedError.ptr("reflect.Value.Send, use reflect.Value.TrySend if possible"));
	};
	Value.prototype.Send = function(x) { return this.$val.Send(x); };
	Value.ptr.prototype.TryRecv = function() {
		var _tmp, _tmp$1, _tmp$2, _tmp$3, ok = false, res, tt, v, x = new Value.ptr();
		v = this;
		new flag(v.flag).mustBe(18);
		new flag(v.flag).mustBeExported();
		tt = v.typ.kindType;
		if (((tt.dir >> 0) & 1) === 0) {
			$panic(new $String("reflect: recv on send-only channel"));
		}
		res = $recv(v.object());
		if (res.constructor === $global.Function) {
			_tmp = new Value.ptr(ptrType$1.nil, 0, 0); _tmp$1 = false; x = _tmp; ok = _tmp$1;
			return [x, ok];
		}
		_tmp$2 = makeValue(tt.elem, res[0], 0); _tmp$3 = !!(res[1]); x = _tmp$2; ok = _tmp$3;
		return [x, ok];
	};
	Value.prototype.TryRecv = function() { return this.$val.TryRecv(); };
	Value.ptr.prototype.Recv = function() {
		var ok = false, v, x = new Value.ptr();
		v = this;
		$panic(new runtime.NotSupportedError.ptr("reflect.Value.Recv, use reflect.Value.TryRecv if possible"));
	};
	Value.prototype.Recv = function() { return this.$val.Recv(); };
	Kind.prototype.String = function() {
		var k;
		k = this.$val;
		if ((k >> 0) < kindNames.$length) {
			return ((k < 0 || k >= kindNames.$length) ? $throwRuntimeError("index out of range") : kindNames.$array[kindNames.$offset + k]);
		}
		return "kind" + strconv.Itoa((k >> 0));
	};
	$ptrType(Kind).prototype.String = function() { return new Kind(this.$get()).String(); };
	uncommonType.ptr.prototype.uncommon = function() {
		var t;
		t = this;
		return t;
	};
	uncommonType.prototype.uncommon = function() { return this.$val.uncommon(); };
	uncommonType.ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		if (t === ptrType$5.nil || $pointerIsEqual(t.pkgPath, ptrType$4.nil)) {
			return "";
		}
		return t.pkgPath.$get();
	};
	uncommonType.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	uncommonType.ptr.prototype.Name = function() {
		var t;
		t = this;
		if (t === ptrType$5.nil || $pointerIsEqual(t.name, ptrType$4.nil)) {
			return "";
		}
		return t.name.$get();
	};
	uncommonType.prototype.Name = function() { return this.$val.Name(); };
	rtype.ptr.prototype.String = function() {
		var t;
		t = this;
		return t.string.$get();
	};
	rtype.prototype.String = function() { return this.$val.String(); };
	rtype.ptr.prototype.Size = function() {
		var t;
		t = this;
		return t.size;
	};
	rtype.prototype.Size = function() { return this.$val.Size(); };
	rtype.ptr.prototype.Bits = function() {
		var k, t;
		t = this;
		if (t === ptrType$1.nil) {
			$panic(new $String("reflect: Bits of nil Type"));
		}
		k = t.Kind();
		if (k < 2 || k > 16) {
			$panic(new $String("reflect: Bits of non-arithmetic Type " + t.String()));
		}
		return (t.size >> 0) * 8 >> 0;
	};
	rtype.prototype.Bits = function() { return this.$val.Bits(); };
	rtype.ptr.prototype.Align = function() {
		var t;
		t = this;
		return (t.align >> 0);
	};
	rtype.prototype.Align = function() { return this.$val.Align(); };
	rtype.ptr.prototype.FieldAlign = function() {
		var t;
		t = this;
		return (t.fieldAlign >> 0);
	};
	rtype.prototype.FieldAlign = function() { return this.$val.FieldAlign(); };
	rtype.ptr.prototype.Kind = function() {
		var t;
		t = this;
		return (((t.kind & 31) >>> 0) >>> 0);
	};
	rtype.prototype.Kind = function() { return this.$val.Kind(); };
	rtype.ptr.prototype.common = function() {
		var t;
		t = this;
		return t;
	};
	rtype.prototype.common = function() { return this.$val.common(); };
	uncommonType.ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		if (t === ptrType$5.nil) {
			return 0;
		}
		return t.methods.$length;
	};
	uncommonType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	uncommonType.ptr.prototype.MethodByName = function(name) {
		var _i, _ref, _tmp, _tmp$1, i, m = new Method.ptr(), ok = false, p, t, x;
		t = this;
		if (t === ptrType$5.nil) {
			return [m, ok];
		}
		p = ptrType$9.nil;
		_ref = t.methods;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (!($pointerIsEqual(p.name, ptrType$4.nil)) && p.name.$get() === name) {
				_tmp = $clone(t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	uncommonType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.ptr.prototype.NumMethod = function() {
		var t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.kindType;
			return tt.NumMethod();
		}
		return t.uncommonType.NumMethod();
	};
	rtype.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	rtype.ptr.prototype.Method = function(i) {
		var m = new Method.ptr(), t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.kindType;
			$copy(m, tt.Method(i), Method);
			return m;
		}
		$copy(m, t.uncommonType.Method(i), Method);
		return m;
	};
	rtype.prototype.Method = function(i) { return this.$val.Method(i); };
	rtype.ptr.prototype.MethodByName = function(name) {
		var _tuple, _tuple$1, m = new Method.ptr(), ok = false, t, tt;
		t = this;
		if (t.Kind() === 20) {
			tt = t.kindType;
			_tuple = tt.MethodByName(name); $copy(m, _tuple[0], Method); ok = _tuple[1];
			return [m, ok];
		}
		_tuple$1 = t.uncommonType.MethodByName(name); $copy(m, _tuple$1[0], Method); ok = _tuple$1[1];
		return [m, ok];
	};
	rtype.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	rtype.ptr.prototype.PkgPath = function() {
		var t;
		t = this;
		return t.uncommonType.PkgPath();
	};
	rtype.prototype.PkgPath = function() { return this.$val.PkgPath(); };
	rtype.ptr.prototype.Name = function() {
		var t;
		t = this;
		return t.uncommonType.Name();
	};
	rtype.prototype.Name = function() { return this.$val.Name(); };
	rtype.ptr.prototype.ChanDir = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 18))) {
			$panic(new $String("reflect: ChanDir of non-chan type"));
		}
		tt = t.kindType;
		return (tt.dir >> 0);
	};
	rtype.prototype.ChanDir = function() { return this.$val.ChanDir(); };
	rtype.ptr.prototype.IsVariadic = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: IsVariadic of non-func type"));
		}
		tt = t.kindType;
		return tt.dotdotdot;
	};
	rtype.prototype.IsVariadic = function() { return this.$val.IsVariadic(); };
	rtype.ptr.prototype.Elem = function() {
		var _ref, t, tt, tt$1, tt$2, tt$3, tt$4;
		t = this;
		_ref = t.Kind();
		if (_ref === 17) {
			tt = t.kindType;
			return toType(tt.elem);
		} else if (_ref === 18) {
			tt$1 = t.kindType;
			return toType(tt$1.elem);
		} else if (_ref === 21) {
			tt$2 = t.kindType;
			return toType(tt$2.elem);
		} else if (_ref === 22) {
			tt$3 = t.kindType;
			return toType(tt$3.elem);
		} else if (_ref === 23) {
			tt$4 = t.kindType;
			return toType(tt$4.elem);
		}
		$panic(new $String("reflect: Elem of invalid type"));
	};
	rtype.prototype.Elem = function() { return this.$val.Elem(); };
	rtype.ptr.prototype.Field = function(i) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: Field of non-struct type"));
		}
		tt = t.kindType;
		return tt.Field(i);
	};
	rtype.prototype.Field = function(i) { return this.$val.Field(i); };
	rtype.ptr.prototype.FieldByIndex = function(index) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByIndex of non-struct type"));
		}
		tt = t.kindType;
		return tt.FieldByIndex(index);
	};
	rtype.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	rtype.ptr.prototype.FieldByName = function(name) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByName of non-struct type"));
		}
		tt = t.kindType;
		return tt.FieldByName(name);
	};
	rtype.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	rtype.ptr.prototype.FieldByNameFunc = function(match) {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: FieldByNameFunc of non-struct type"));
		}
		tt = t.kindType;
		return tt.FieldByNameFunc(match);
	};
	rtype.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	rtype.ptr.prototype.In = function(i) {
		var t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: In of non-func type"));
		}
		tt = t.kindType;
		return toType((x = tt.in$2, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
	};
	rtype.prototype.In = function(i) { return this.$val.In(i); };
	rtype.ptr.prototype.Key = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 21))) {
			$panic(new $String("reflect: Key of non-map type"));
		}
		tt = t.kindType;
		return toType(tt.key);
	};
	rtype.prototype.Key = function() { return this.$val.Key(); };
	rtype.ptr.prototype.Len = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 17))) {
			$panic(new $String("reflect: Len of non-array type"));
		}
		tt = t.kindType;
		return (tt.len >> 0);
	};
	rtype.prototype.Len = function() { return this.$val.Len(); };
	rtype.ptr.prototype.NumField = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 25))) {
			$panic(new $String("reflect: NumField of non-struct type"));
		}
		tt = t.kindType;
		return tt.fields.$length;
	};
	rtype.prototype.NumField = function() { return this.$val.NumField(); };
	rtype.ptr.prototype.NumIn = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumIn of non-func type"));
		}
		tt = t.kindType;
		return tt.in$2.$length;
	};
	rtype.prototype.NumIn = function() { return this.$val.NumIn(); };
	rtype.ptr.prototype.NumOut = function() {
		var t, tt;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: NumOut of non-func type"));
		}
		tt = t.kindType;
		return tt.out.$length;
	};
	rtype.prototype.NumOut = function() { return this.$val.NumOut(); };
	rtype.ptr.prototype.Out = function(i) {
		var t, tt, x;
		t = this;
		if (!((t.Kind() === 19))) {
			$panic(new $String("reflect: Out of non-func type"));
		}
		tt = t.kindType;
		return toType((x = tt.out, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i])));
	};
	rtype.prototype.Out = function(i) { return this.$val.Out(i); };
	ChanDir.prototype.String = function() {
		var _ref, d;
		d = this.$val;
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
	interfaceType.ptr.prototype.Method = function(i) {
		var m = new Method.ptr(), p, t, x;
		t = this;
		if (i < 0 || i >= t.methods.$length) {
			return m;
		}
		p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		m.Name = p.name.$get();
		if (!($pointerIsEqual(p.pkgPath, ptrType$4.nil))) {
			m.PkgPath = p.pkgPath.$get();
		}
		m.Type = toType(p.typ);
		m.Index = i;
		return m;
	};
	interfaceType.prototype.Method = function(i) { return this.$val.Method(i); };
	interfaceType.ptr.prototype.NumMethod = function() {
		var t;
		t = this;
		return t.methods.$length;
	};
	interfaceType.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	interfaceType.ptr.prototype.MethodByName = function(name) {
		var _i, _ref, _tmp, _tmp$1, i, m = new Method.ptr(), ok = false, p, t, x;
		t = this;
		if (t === ptrType$10.nil) {
			return [m, ok];
		}
		p = ptrType$11.nil;
		_ref = t.methods;
		_i = 0;
		while (_i < _ref.$length) {
			i = _i;
			p = (x = t.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			if (p.name.$get() === name) {
				_tmp = $clone(t.Method(i), Method); _tmp$1 = true; $copy(m, _tmp, Method); ok = _tmp$1;
				return [m, ok];
			}
			_i++;
		}
		return [m, ok];
	};
	interfaceType.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	StructTag.prototype.Get = function(key) {
		var _tuple, i, name, qvalue, tag, value;
		tag = this.$val;
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
	structType.ptr.prototype.Field = function(i) {
		var f = new StructField.ptr(), p, t, t$1, x;
		t = this;
		if (i < 0 || i >= t.fields.$length) {
			return f;
		}
		p = (x = t.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
		f.Type = toType(p.typ);
		if (!($pointerIsEqual(p.name, ptrType$4.nil))) {
			f.Name = p.name.$get();
		} else {
			t$1 = f.Type;
			if (t$1.Kind() === 22) {
				t$1 = t$1.Elem();
			}
			f.Name = t$1.Name();
			f.Anonymous = true;
		}
		if (!($pointerIsEqual(p.pkgPath, ptrType$4.nil))) {
			f.PkgPath = p.pkgPath.$get();
		}
		if (!($pointerIsEqual(p.tag, ptrType$4.nil))) {
			f.Tag = p.tag.$get();
		}
		f.Offset = p.offset;
		f.Index = new sliceType$9([i]);
		return f;
	};
	structType.prototype.Field = function(i) { return this.$val.Field(i); };
	structType.ptr.prototype.FieldByIndex = function(index) {
		var _i, _ref, f = new StructField.ptr(), ft, i, t, x;
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
	structType.ptr.prototype.FieldByNameFunc = function(match) {
		var _entry, _entry$1, _entry$2, _entry$3, _i, _i$1, _key, _key$1, _key$2, _key$3, _key$4, _key$5, _map, _map$1, _ref, _ref$1, _tmp, _tmp$1, _tmp$2, _tmp$3, count, current, f, fname, i, index, next, nextCount, ntyp, ok = false, result = new StructField.ptr(), scan, styp, t, t$1, visited, x;
		t = this;
		current = new sliceType$10([]);
		next = new sliceType$10([new fieldScan.ptr(t, sliceType$9.nil)]);
		nextCount = false;
		visited = (_map = new $Map(), _map);
		while (next.$length > 0) {
			_tmp = next; _tmp$1 = $subslice(current, 0, 0); current = _tmp; next = _tmp$1;
			count = nextCount;
			nextCount = false;
			_ref = current;
			_i = 0;
			while (_i < _ref.$length) {
				scan = $clone(((_i < 0 || _i >= _ref.$length) ? $throwRuntimeError("index out of range") : _ref.$array[_ref.$offset + _i]), fieldScan);
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
					ntyp = ptrType$1.nil;
					if (!($pointerIsEqual(f.name, ptrType$4.nil))) {
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
							_tmp$2 = new StructField.ptr("", "", $ifaceNil, "", 0, sliceType$9.nil, false); _tmp$3 = false; $copy(result, _tmp$2, StructField); ok = _tmp$3;
							return [result, ok];
						}
						$copy(result, t$1.Field(i), StructField);
						result.Index = sliceType$9.nil;
						result.Index = $appendSlice(result.Index, scan.index);
						result.Index = $append(result.Index, i);
						ok = true;
						_i$1++;
						continue;
					}
					if (ok || ntyp === ptrType$1.nil || !((ntyp.Kind() === 25))) {
						_i$1++;
						continue;
					}
					styp = ntyp.kindType;
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
					index = sliceType$9.nil;
					index = $appendSlice(index, scan.index);
					index = $append(index, i);
					next = $append(next, new fieldScan.ptr(styp, index));
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
	structType.ptr.prototype.FieldByName = function(name) {
		var _i, _ref, _tmp, _tmp$1, _tuple, f = new StructField.ptr(), hasAnon, i, present = false, t, tf, x;
		t = this;
		hasAnon = false;
		if (!(name === "")) {
			_ref = t.fields;
			_i = 0;
			while (_i < _ref.$length) {
				i = _i;
				tf = (x = t.fields, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
				if ($pointerIsEqual(tf.name, ptrType$4.nil)) {
					hasAnon = true;
					_i++;
					continue;
				}
				if (tf.name.$get() === name) {
					_tmp = $clone(t.Field(i), StructField); _tmp$1 = true; $copy(f, _tmp, StructField); present = _tmp$1;
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
		return $assertType(t, ptrType$1).ptrTo();
	};
	rtype.ptr.prototype.Implements = function(u) {
		var t;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.Implements"));
		}
		if (!((u.Kind() === 20))) {
			$panic(new $String("reflect: non-interface type passed to Type.Implements"));
		}
		return implements$1($assertType(u, ptrType$1), t);
	};
	rtype.prototype.Implements = function(u) { return this.$val.Implements(u); };
	rtype.ptr.prototype.AssignableTo = function(u) {
		var t, uu;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.AssignableTo"));
		}
		uu = $assertType(u, ptrType$1);
		return directlyAssignable(uu, t) || implements$1(uu, t);
	};
	rtype.prototype.AssignableTo = function(u) { return this.$val.AssignableTo(u); };
	rtype.ptr.prototype.ConvertibleTo = function(u) {
		var t, uu;
		t = this;
		if ($interfaceIsEqual(u, $ifaceNil)) {
			$panic(new $String("reflect: nil type passed to Type.ConvertibleTo"));
		}
		uu = $assertType(u, ptrType$1);
		return !(convertOp(uu, t) === $throwNilPointerError);
	};
	rtype.prototype.ConvertibleTo = function(u) { return this.$val.ConvertibleTo(u); };
	implements$1 = function(T, V) {
		var i, i$1, j, j$1, t, tm, tm$1, v, v$1, vm, vm$1, x, x$1, x$2, x$3;
		if (!((T.Kind() === 20))) {
			return false;
		}
		t = T.kindType;
		if (t.methods.$length === 0) {
			return true;
		}
		if (V.Kind() === 20) {
			v = V.kindType;
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
		if (v$1 === ptrType$5.nil) {
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
		var _i, _i$1, _i$2, _ref, _ref$1, _ref$2, _ref$3, i, i$1, i$2, kind, t, t$1, t$2, tf, typ, typ$1, v, v$1, v$2, vf, x, x$1, x$2, x$3;
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
			t = T.kindType;
			v = V.kindType;
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
			t$1 = T.kindType;
			v$1 = V.kindType;
			if ((t$1.methods.$length === 0) && (v$1.methods.$length === 0)) {
				return true;
			}
			return false;
		} else if (_ref === 21) {
			return $interfaceIsEqual(T.Key(), V.Key()) && $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 22 || _ref === 23) {
			return $interfaceIsEqual(T.Elem(), V.Elem());
		} else if (_ref === 25) {
			t$2 = T.kindType;
			v$2 = V.kindType;
			if (!((t$2.fields.$length === v$2.fields.$length))) {
				return false;
			}
			_ref$3 = t$2.fields;
			_i$2 = 0;
			while (_i$2 < _ref$3.$length) {
				i$2 = _i$2;
				tf = (x$2 = t$2.fields, ((i$2 < 0 || i$2 >= x$2.$length) ? $throwRuntimeError("index out of range") : x$2.$array[x$2.$offset + i$2]));
				vf = (x$3 = v$2.fields, ((i$2 < 0 || i$2 >= x$3.$length) ? $throwRuntimeError("index out of range") : x$3.$array[x$3.$offset + i$2]));
				if (!($pointerIsEqual(tf.name, vf.name)) && ($pointerIsEqual(tf.name, ptrType$4.nil) || $pointerIsEqual(vf.name, ptrType$4.nil) || !(tf.name.$get() === vf.name.$get()))) {
					return false;
				}
				if (!($pointerIsEqual(tf.pkgPath, vf.pkgPath)) && ($pointerIsEqual(tf.pkgPath, ptrType$4.nil) || $pointerIsEqual(vf.pkgPath, ptrType$4.nil) || !(tf.pkgPath.$get() === vf.pkgPath.$get()))) {
					return false;
				}
				if (!(tf.typ === vf.typ)) {
					return false;
				}
				if (!($pointerIsEqual(tf.tag, vf.tag)) && ($pointerIsEqual(tf.tag, ptrType$4.nil) || $pointerIsEqual(vf.tag, ptrType$4.nil) || !(tf.tag.$get() === vf.tag.$get()))) {
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
		if (t === ptrType$1.nil) {
			return $ifaceNil;
		}
		return t;
	};
	ifaceIndir = function(t) {
		return ((t.kind & 32) >>> 0) === 0;
	};
	flag.prototype.kind = function() {
		var f;
		f = this.$val;
		return (((f & 31) >>> 0) >>> 0);
	};
	$ptrType(flag).prototype.kind = function() { return new flag(this.$get()).kind(); };
	Value.ptr.prototype.pointer = function() {
		var v;
		v = this;
		if (!((v.typ.size === 4)) || !v.typ.pointers()) {
			$panic(new $String("can't call pointer on a non-pointer Value"));
		}
		if (!((((v.flag & 64) >>> 0) === 0))) {
			return v.ptr.$get();
		}
		return v.ptr;
	};
	Value.prototype.pointer = function() { return this.$val.pointer(); };
	ValueError.ptr.prototype.Error = function() {
		var e;
		e = this;
		if (e.Kind === 0) {
			return "reflect: call of " + e.Method + " on zero Value";
		}
		return "reflect: call of " + e.Method + " on " + new Kind(e.Kind).String() + " Value";
	};
	ValueError.prototype.Error = function() { return this.$val.Error(); };
	flag.prototype.mustBe = function(expected) {
		var f;
		f = this.$val;
		if (!((new flag(f).kind() === expected))) {
			$panic(new ValueError.ptr(methodName(), new flag(f).kind()));
		}
	};
	$ptrType(flag).prototype.mustBe = function(expected) { return new flag(this.$get()).mustBe(expected); };
	flag.prototype.mustBeExported = function() {
		var f;
		f = this.$val;
		if (f === 0) {
			$panic(new ValueError.ptr(methodName(), 0));
		}
		if (!((((f & 32) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
	};
	$ptrType(flag).prototype.mustBeExported = function() { return new flag(this.$get()).mustBeExported(); };
	flag.prototype.mustBeAssignable = function() {
		var f;
		f = this.$val;
		if (f === 0) {
			$panic(new ValueError.ptr(methodName(), 0));
		}
		if (!((((f & 32) >>> 0) === 0))) {
			$panic(new $String("reflect: " + methodName() + " using value obtained using unexported field"));
		}
		if (((f & 128) >>> 0) === 0) {
			$panic(new $String("reflect: " + methodName() + " using unaddressable value"));
		}
	};
	$ptrType(flag).prototype.mustBeAssignable = function() { return new flag(this.$get()).mustBeAssignable(); };
	Value.ptr.prototype.Addr = function() {
		var v;
		v = this;
		if (((v.flag & 128) >>> 0) === 0) {
			$panic(new $String("reflect.Value.Addr of unaddressable value"));
		}
		return new Value.ptr(v.typ.ptrTo(), v.ptr, ((((v.flag & 32) >>> 0)) | 22) >>> 0);
	};
	Value.prototype.Addr = function() { return this.$val.Addr(); };
	Value.ptr.prototype.Bool = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(1);
		return v.ptr.$get();
	};
	Value.prototype.Bool = function() { return this.$val.Bool(); };
	Value.ptr.prototype.Bytes = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.Bytes of non-byte slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.Bytes = function() { return this.$val.Bytes(); };
	Value.ptr.prototype.runes = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.Bytes of non-rune slice"));
		}
		return v.ptr.$get();
	};
	Value.prototype.runes = function() { return this.$val.runes(); };
	Value.ptr.prototype.CanAddr = function() {
		var v;
		v = this;
		return !((((v.flag & 128) >>> 0) === 0));
	};
	Value.prototype.CanAddr = function() { return this.$val.CanAddr(); };
	Value.ptr.prototype.CanSet = function() {
		var v;
		v = this;
		return ((v.flag & 160) >>> 0) === 128;
	};
	Value.prototype.CanSet = function() { return this.$val.CanSet(); };
	Value.ptr.prototype.Call = function(in$1) {
		var v;
		v = this;
		new flag(v.flag).mustBe(19);
		new flag(v.flag).mustBeExported();
		return v.call("Call", in$1);
	};
	Value.prototype.Call = function(in$1) { return this.$val.Call(in$1); };
	Value.ptr.prototype.CallSlice = function(in$1) {
		var v;
		v = this;
		new flag(v.flag).mustBe(19);
		new flag(v.flag).mustBeExported();
		return v.call("CallSlice", in$1);
	};
	Value.prototype.CallSlice = function(in$1) { return this.$val.CallSlice(in$1); };
	Value.ptr.prototype.Complex = function() {
		var _ref, k, v, x;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 15) {
			return (x = v.ptr.$get(), new $Complex128(x.$real, x.$imag));
		} else if (_ref === 16) {
			return v.ptr.$get();
		}
		$panic(new ValueError.ptr("reflect.Value.Complex", new flag(v.flag).kind()));
	};
	Value.prototype.Complex = function() { return this.$val.Complex(); };
	Value.ptr.prototype.FieldByIndex = function(index) {
		var _i, _ref, i, v, x;
		v = this;
		if (index.$length === 1) {
			return v.Field(((0 < 0 || 0 >= index.$length) ? $throwRuntimeError("index out of range") : index.$array[index.$offset + 0]));
		}
		new flag(v.flag).mustBe(25);
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
					v = v.Elem();
				}
			}
			v = v.Field(x);
			_i++;
		}
		return v;
	};
	Value.prototype.FieldByIndex = function(index) { return this.$val.FieldByIndex(index); };
	Value.ptr.prototype.FieldByName = function(name) {
		var _tuple, f, ok, v;
		v = this;
		new flag(v.flag).mustBe(25);
		_tuple = v.typ.FieldByName(name); f = $clone(_tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.ptr(ptrType$1.nil, 0, 0);
	};
	Value.prototype.FieldByName = function(name) { return this.$val.FieldByName(name); };
	Value.ptr.prototype.FieldByNameFunc = function(match) {
		var _tuple, f, ok, v;
		v = this;
		_tuple = v.typ.FieldByNameFunc(match); f = $clone(_tuple[0], StructField); ok = _tuple[1];
		if (ok) {
			return v.FieldByIndex(f.Index);
		}
		return new Value.ptr(ptrType$1.nil, 0, 0);
	};
	Value.prototype.FieldByNameFunc = function(match) { return this.$val.FieldByNameFunc(match); };
	Value.ptr.prototype.Float = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 13) {
			return $coerceFloat32(v.ptr.$get());
		} else if (_ref === 14) {
			return v.ptr.$get();
		}
		$panic(new ValueError.ptr("reflect.Value.Float", new flag(v.flag).kind()));
	};
	Value.prototype.Float = function() { return this.$val.Float(); };
	Value.ptr.prototype.Int = function() {
		var _ref, k, p, v;
		v = this;
		k = new flag(v.flag).kind();
		p = v.ptr;
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
		$panic(new ValueError.ptr("reflect.Value.Int", new flag(v.flag).kind()));
	};
	Value.prototype.Int = function() { return this.$val.Int(); };
	Value.ptr.prototype.CanInterface = function() {
		var v;
		v = this;
		if (v.flag === 0) {
			$panic(new ValueError.ptr("reflect.Value.CanInterface", 0));
		}
		return ((v.flag & 32) >>> 0) === 0;
	};
	Value.prototype.CanInterface = function() { return this.$val.CanInterface(); };
	Value.ptr.prototype.Interface = function() {
		var i = $ifaceNil, v;
		v = this;
		i = valueInterface(v, true);
		return i;
	};
	Value.prototype.Interface = function() { return this.$val.Interface(); };
	Value.ptr.prototype.InterfaceData = function() {
		var v;
		v = this;
		new flag(v.flag).mustBe(20);
		return v.ptr;
	};
	Value.prototype.InterfaceData = function() { return this.$val.InterfaceData(); };
	Value.ptr.prototype.IsValid = function() {
		var v;
		v = this;
		return !((v.flag === 0));
	};
	Value.prototype.IsValid = function() { return this.$val.IsValid(); };
	Value.ptr.prototype.Kind = function() {
		var v;
		v = this;
		return new flag(v.flag).kind();
	};
	Value.prototype.Kind = function() { return this.$val.Kind(); };
	Value.ptr.prototype.MapIndex = function(key) {
		var c, e, fl, k, tt, typ, v;
		v = this;
		key = key;
		new flag(v.flag).mustBe(21);
		tt = v.typ.kindType;
		key = key.assignTo("reflect.Value.MapIndex", tt.key, 0);
		k = 0;
		if (!((((key.flag & 64) >>> 0) === 0))) {
			k = key.ptr;
		} else {
			k = new ptrType$17(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		}
		e = mapaccess(v.typ, v.pointer(), k);
		if (e === 0) {
			return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		typ = tt.elem;
		fl = ((((v.flag | key.flag) >>> 0)) & 32) >>> 0;
		fl = (fl | ((typ.Kind() >>> 0))) >>> 0;
		if (ifaceIndir(typ)) {
			c = unsafe_New(typ);
			memmove(c, e, typ.size);
			return new Value.ptr(typ, c, (fl | 64) >>> 0);
		} else {
			return new Value.ptr(typ, e.$get(), fl);
		}
	};
	Value.prototype.MapIndex = function(key) { return this.$val.MapIndex(key); };
	Value.ptr.prototype.MapKeys = function() {
		var a, c, fl, i, it, key, keyType, m, mlen, tt, v;
		v = this;
		new flag(v.flag).mustBe(21);
		tt = v.typ.kindType;
		keyType = tt.key;
		fl = (((v.flag & 32) >>> 0) | (keyType.Kind() >>> 0)) >>> 0;
		m = v.pointer();
		mlen = 0;
		if (!(m === 0)) {
			mlen = maplen(m);
		}
		it = mapiterinit(v.typ, m);
		a = $makeSlice(sliceType$6, mlen);
		i = 0;
		i = 0;
		while (i < a.$length) {
			key = mapiterkey(it);
			if (key === 0) {
				break;
			}
			if (ifaceIndir(keyType)) {
				c = unsafe_New(keyType);
				memmove(c, key, keyType.size);
				(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = new Value.ptr(keyType, c, (fl | 64) >>> 0);
			} else {
				(i < 0 || i >= a.$length) ? $throwRuntimeError("index out of range") : a.$array[a.$offset + i] = new Value.ptr(keyType, key.$get(), fl);
			}
			mapiternext(it);
			i = i + (1) >> 0;
		}
		return $subslice(a, 0, i);
	};
	Value.prototype.MapKeys = function() { return this.$val.MapKeys(); };
	Value.ptr.prototype.Method = function(i) {
		var fl, v;
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.Method", 0));
		}
		if (!((((v.flag & 256) >>> 0) === 0)) || (i >>> 0) >= (v.typ.NumMethod() >>> 0)) {
			$panic(new $String("reflect: Method index out of range"));
		}
		if ((v.typ.Kind() === 20) && v.IsNil()) {
			$panic(new $String("reflect: Method on nil interface value"));
		}
		fl = (v.flag & 96) >>> 0;
		fl = (fl | (19)) >>> 0;
		fl = (fl | (((((i >>> 0) << 9 >>> 0) | 256) >>> 0))) >>> 0;
		return new Value.ptr(v.typ, v.ptr, fl);
	};
	Value.prototype.Method = function(i) { return this.$val.Method(i); };
	Value.ptr.prototype.NumMethod = function() {
		var v;
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.NumMethod", 0));
		}
		if (!((((v.flag & 256) >>> 0) === 0))) {
			return 0;
		}
		return v.typ.NumMethod();
	};
	Value.prototype.NumMethod = function() { return this.$val.NumMethod(); };
	Value.ptr.prototype.MethodByName = function(name) {
		var _tuple, m, ok, v;
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.MethodByName", 0));
		}
		if (!((((v.flag & 256) >>> 0) === 0))) {
			return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		_tuple = v.typ.MethodByName(name); m = $clone(_tuple[0], Method); ok = _tuple[1];
		if (!ok) {
			return new Value.ptr(ptrType$1.nil, 0, 0);
		}
		return v.Method(m.Index);
	};
	Value.prototype.MethodByName = function(name) { return this.$val.MethodByName(name); };
	Value.ptr.prototype.NumField = function() {
		var tt, v;
		v = this;
		new flag(v.flag).mustBe(25);
		tt = v.typ.kindType;
		return tt.fields.$length;
	};
	Value.prototype.NumField = function() { return this.$val.NumField(); };
	Value.ptr.prototype.OverflowComplex = function(x) {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 15) {
			return overflowFloat32(x.$real) || overflowFloat32(x.$imag);
		} else if (_ref === 16) {
			return false;
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowComplex", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowComplex = function(x) { return this.$val.OverflowComplex(x); };
	Value.ptr.prototype.OverflowFloat = function(x) {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 13) {
			return overflowFloat32(x);
		} else if (_ref === 14) {
			return false;
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowFloat", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowFloat = function(x) { return this.$val.OverflowFloat(x); };
	overflowFloat32 = function(x) {
		if (x < 0) {
			x = -x;
		}
		return 3.4028234663852886e+38 < x && x <= 1.7976931348623157e+308;
	};
	Value.ptr.prototype.OverflowInt = function(x) {
		var _ref, bitSize, k, trunc, v, x$1;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 2 || _ref === 3 || _ref === 4 || _ref === 5 || _ref === 6) {
			bitSize = (x$1 = v.typ.size, (((x$1 >>> 16 << 16) * 8 >>> 0) + (x$1 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightInt64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowInt", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowInt = function(x) { return this.$val.OverflowInt(x); };
	Value.ptr.prototype.OverflowUint = function(x) {
		var _ref, bitSize, k, trunc, v, x$1;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 7 || _ref === 12 || _ref === 8 || _ref === 9 || _ref === 10 || _ref === 11) {
			bitSize = (x$1 = v.typ.size, (((x$1 >>> 16 << 16) * 8 >>> 0) + (x$1 << 16 >>> 16) * 8) >>> 0);
			trunc = $shiftRightUint64(($shiftLeft64(x, ((64 - bitSize >>> 0)))), ((64 - bitSize >>> 0)));
			return !((x.$high === trunc.$high && x.$low === trunc.$low));
		}
		$panic(new ValueError.ptr("reflect.Value.OverflowUint", new flag(v.flag).kind()));
	};
	Value.prototype.OverflowUint = function(x) { return this.$val.OverflowUint(x); };
	Value.ptr.prototype.SetBool = function(x) {
		var v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(1);
		v.ptr.$set(x);
	};
	Value.prototype.SetBool = function(x) { return this.$val.SetBool(x); };
	Value.ptr.prototype.SetBytes = function(x) {
		var v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		if (!((v.typ.Elem().Kind() === 8))) {
			$panic(new $String("reflect.Value.SetBytes of non-byte slice"));
		}
		v.ptr.$set(x);
	};
	Value.prototype.SetBytes = function(x) { return this.$val.SetBytes(x); };
	Value.ptr.prototype.setRunes = function(x) {
		var v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(23);
		if (!((v.typ.Elem().Kind() === 5))) {
			$panic(new $String("reflect.Value.setRunes of non-rune slice"));
		}
		v.ptr.$set(x);
	};
	Value.prototype.setRunes = function(x) { return this.$val.setRunes(x); };
	Value.ptr.prototype.SetComplex = function(x) {
		var _ref, k, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 15) {
			v.ptr.$set(new $Complex64(x.$real, x.$imag));
		} else if (_ref === 16) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetComplex", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetComplex = function(x) { return this.$val.SetComplex(x); };
	Value.ptr.prototype.SetFloat = function(x) {
		var _ref, k, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 13) {
			v.ptr.$set(x);
		} else if (_ref === 14) {
			v.ptr.$set(x);
		} else {
			$panic(new ValueError.ptr("reflect.Value.SetFloat", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetFloat = function(x) { return this.$val.SetFloat(x); };
	Value.ptr.prototype.SetInt = function(x) {
		var _ref, k, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
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
			$panic(new ValueError.ptr("reflect.Value.SetInt", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetInt = function(x) { return this.$val.SetInt(x); };
	Value.ptr.prototype.SetMapIndex = function(key, val) {
		var e, k, tt, v;
		v = this;
		val = val;
		key = key;
		new flag(v.flag).mustBe(21);
		new flag(v.flag).mustBeExported();
		new flag(key.flag).mustBeExported();
		tt = v.typ.kindType;
		key = key.assignTo("reflect.Value.SetMapIndex", tt.key, 0);
		k = 0;
		if (!((((key.flag & 64) >>> 0) === 0))) {
			k = key.ptr;
		} else {
			k = new ptrType$17(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, key);
		}
		if (val.typ === ptrType$1.nil) {
			mapdelete(v.typ, v.pointer(), k);
			return;
		}
		new flag(val.flag).mustBeExported();
		val = val.assignTo("reflect.Value.SetMapIndex", tt.elem, 0);
		e = 0;
		if (!((((val.flag & 64) >>> 0) === 0))) {
			e = val.ptr;
		} else {
			e = new ptrType$17(function() { return this.$target.ptr; }, function($v) { this.$target.ptr = $v; }, val);
		}
		mapassign(v.typ, v.pointer(), k, e);
	};
	Value.prototype.SetMapIndex = function(key, val) { return this.$val.SetMapIndex(key, val); };
	Value.ptr.prototype.SetUint = function(x) {
		var _ref, k, v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		k = new flag(v.flag).kind();
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
			$panic(new ValueError.ptr("reflect.Value.SetUint", new flag(v.flag).kind()));
		}
	};
	Value.prototype.SetUint = function(x) { return this.$val.SetUint(x); };
	Value.ptr.prototype.SetPointer = function(x) {
		var v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(26);
		v.ptr.$set(x);
	};
	Value.prototype.SetPointer = function(x) { return this.$val.SetPointer(x); };
	Value.ptr.prototype.SetString = function(x) {
		var v;
		v = this;
		new flag(v.flag).mustBeAssignable();
		new flag(v.flag).mustBe(24);
		v.ptr.$set(x);
	};
	Value.prototype.SetString = function(x) { return this.$val.SetString(x); };
	Value.ptr.prototype.String = function() {
		var _ref, k, v;
		v = this;
		k = new flag(v.flag).kind();
		_ref = k;
		if (_ref === 0) {
			return "<invalid Value>";
		} else if (_ref === 24) {
			return v.ptr.$get();
		}
		return "<" + v.Type().String() + " Value>";
	};
	Value.prototype.String = function() { return this.$val.String(); };
	Value.ptr.prototype.Type = function() {
		var f, i, m, m$1, tt, ut, v, x, x$1;
		v = this;
		f = v.flag;
		if (f === 0) {
			$panic(new ValueError.ptr("reflect.Value.Type", 0));
		}
		if (((f & 256) >>> 0) === 0) {
			return v.typ;
		}
		i = (v.flag >> 0) >> 9 >> 0;
		if (v.typ.Kind() === 20) {
			tt = v.typ.kindType;
			if ((i >>> 0) >= (tt.methods.$length >>> 0)) {
				$panic(new $String("reflect: internal error: invalid method index"));
			}
			m = (x = tt.methods, ((i < 0 || i >= x.$length) ? $throwRuntimeError("index out of range") : x.$array[x.$offset + i]));
			return m.typ;
		}
		ut = v.typ.uncommonType.uncommon();
		if (ut === ptrType$5.nil || (i >>> 0) >= (ut.methods.$length >>> 0)) {
			$panic(new $String("reflect: internal error: invalid method index"));
		}
		m$1 = (x$1 = ut.methods, ((i < 0 || i >= x$1.$length) ? $throwRuntimeError("index out of range") : x$1.$array[x$1.$offset + i]));
		return m$1.mtyp;
	};
	Value.prototype.Type = function() { return this.$val.Type(); };
	Value.ptr.prototype.Uint = function() {
		var _ref, k, p, v, x;
		v = this;
		k = new flag(v.flag).kind();
		p = v.ptr;
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
		$panic(new ValueError.ptr("reflect.Value.Uint", new flag(v.flag).kind()));
	};
	Value.prototype.Uint = function() { return this.$val.Uint(); };
	Value.ptr.prototype.UnsafeAddr = function() {
		var v;
		v = this;
		if (v.typ === ptrType$1.nil) {
			$panic(new ValueError.ptr("reflect.Value.UnsafeAddr", 0));
		}
		if (((v.flag & 128) >>> 0) === 0) {
			$panic(new $String("reflect.Value.UnsafeAddr of unaddressable value"));
		}
		return v.ptr;
	};
	Value.prototype.UnsafeAddr = function() { return this.$val.UnsafeAddr(); };
	New = $pkg.New = function(typ) {
		var fl, ptr;
		if ($interfaceIsEqual(typ, $ifaceNil)) {
			$panic(new $String("reflect: New(nil)"));
		}
		ptr = unsafe_New($assertType(typ, ptrType$1));
		fl = 22;
		return new Value.ptr(typ.common().ptrTo(), ptr, fl);
	};
	Value.ptr.prototype.assignTo = function(context, dst, target) {
		var fl, v, x;
		v = this;
		if (!((((v.flag & 256) >>> 0) === 0))) {
			v = makeMethodValue(context, v);
		}
		if (directlyAssignable(dst, v.typ)) {
			v.typ = dst;
			fl = (v.flag & 224) >>> 0;
			fl = (fl | ((dst.Kind() >>> 0))) >>> 0;
			return new Value.ptr(dst, v.ptr, fl);
		} else if (implements$1(dst, v.typ)) {
			if (target === 0) {
				target = unsafe_New(dst);
			}
			x = valueInterface(v, false);
			if (dst.NumMethod() === 0) {
				target.$set(x);
			} else {
				ifaceE2I(dst, x, target);
			}
			return new Value.ptr(dst, target, 84);
		}
		$panic(new $String(context + ": value of type " + v.typ.String() + " is not assignable to type " + dst.String()));
	};
	Value.prototype.assignTo = function(context, dst, target) { return this.$val.assignTo(context, dst, target); };
	Value.ptr.prototype.Convert = function(t) {
		var op, v;
		v = this;
		if (!((((v.flag & 256) >>> 0) === 0))) {
			v = makeMethodValue("Convert", v);
		}
		op = convertOp(t.common(), v.typ);
		if (op === $throwNilPointerError) {
			$panic(new $String("reflect.Value.Convert: value of type " + v.typ.String() + " cannot be converted to type " + t.String()));
		}
		return op(v, t);
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
		var _ref, ptr, typ;
		typ = t.common();
		ptr = unsafe_New(typ);
		_ref = typ.size;
		if (_ref === 4) {
			ptr.$set(v);
		} else if (_ref === 8) {
			ptr.$set(v);
		}
		return new Value.ptr(typ, ptr, (((f | 64) >>> 0) | (typ.Kind() >>> 0)) >>> 0);
	};
	makeComplex = function(f, v, t) {
		var _ref, ptr, typ;
		typ = t.common();
		ptr = unsafe_New(typ);
		_ref = typ.size;
		if (_ref === 8) {
			ptr.$set(new $Complex64(v.$real, v.$imag));
		} else if (_ref === 16) {
			ptr.$set(v);
		}
		return new Value.ptr(typ, ptr, (((f | 64) >>> 0) | (typ.Kind() >>> 0)) >>> 0);
	};
	makeString = function(f, v, t) {
		var ret;
		ret = New(t).Elem();
		ret.SetString(v);
		ret.flag = ((ret.flag & ~128) | f) >>> 0;
		return ret;
	};
	makeBytes = function(f, v, t) {
		var ret;
		ret = New(t).Elem();
		ret.SetBytes(v);
		ret.flag = ((ret.flag & ~128) | f) >>> 0;
		return ret;
	};
	makeRunes = function(f, v, t) {
		var ret;
		ret = New(t).Elem();
		ret.setRunes(v);
		ret.flag = ((ret.flag & ~128) | f) >>> 0;
		return ret;
	};
	cvtInt = function(v, t) {
		var x;
		v = v;
		return makeInt((v.flag & 32) >>> 0, (x = v.Int(), new $Uint64(x.$high, x.$low)), t);
	};
	cvtUint = function(v, t) {
		v = v;
		return makeInt((v.flag & 32) >>> 0, v.Uint(), t);
	};
	cvtFloatInt = function(v, t) {
		var x;
		v = v;
		return makeInt((v.flag & 32) >>> 0, (x = new $Int64(0, v.Float()), new $Uint64(x.$high, x.$low)), t);
	};
	cvtFloatUint = function(v, t) {
		v = v;
		return makeInt((v.flag & 32) >>> 0, new $Uint64(0, v.Float()), t);
	};
	cvtIntFloat = function(v, t) {
		v = v;
		return makeFloat((v.flag & 32) >>> 0, $flatten64(v.Int()), t);
	};
	cvtUintFloat = function(v, t) {
		v = v;
		return makeFloat((v.flag & 32) >>> 0, $flatten64(v.Uint()), t);
	};
	cvtFloat = function(v, t) {
		v = v;
		return makeFloat((v.flag & 32) >>> 0, v.Float(), t);
	};
	cvtComplex = function(v, t) {
		v = v;
		return makeComplex((v.flag & 32) >>> 0, v.Complex(), t);
	};
	cvtIntString = function(v, t) {
		v = v;
		return makeString((v.flag & 32) >>> 0, $encodeRune(v.Int().$low), t);
	};
	cvtUintString = function(v, t) {
		v = v;
		return makeString((v.flag & 32) >>> 0, $encodeRune(v.Uint().$low), t);
	};
	cvtBytesString = function(v, t) {
		v = v;
		return makeString((v.flag & 32) >>> 0, $bytesToString(v.Bytes()), t);
	};
	cvtStringBytes = function(v, t) {
		v = v;
		return makeBytes((v.flag & 32) >>> 0, new sliceType$12($stringToBytes(v.String())), t);
	};
	cvtRunesString = function(v, t) {
		v = v;
		return makeString((v.flag & 32) >>> 0, $runesToString(v.runes()), t);
	};
	cvtStringRunes = function(v, t) {
		v = v;
		return makeRunes((v.flag & 32) >>> 0, new sliceType$13($stringToRunes(v.String())), t);
	};
	cvtT2I = function(v, typ) {
		var target, x;
		v = v;
		target = unsafe_New(typ.common());
		x = valueInterface(v, false);
		if (typ.NumMethod() === 0) {
			target.$set(x);
		} else {
			ifaceE2I($assertType(typ, ptrType$1), x, target);
		}
		return new Value.ptr(typ.common(), target, (((((v.flag & 32) >>> 0) | 64) >>> 0) | 20) >>> 0);
	};
	cvtI2I = function(v, typ) {
		var ret;
		v = v;
		if (v.IsNil()) {
			ret = Zero(typ);
			ret.flag = (ret.flag | (((v.flag & 32) >>> 0))) >>> 0;
			return ret;
		}
		return cvtT2I(v.Elem(), typ);
	};
	Kind.methods = [{prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}];
	ptrType$19.methods = [{prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}];
	rtype.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$1.methods = [{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", type: $funcType([], [$Bool], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$5.methods = [{prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ChanDir.methods = [{prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}];
	ptrType$20.methods = [{prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}];
	arrayType.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$21.methods = [{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", type: $funcType([], [$Bool], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	chanType.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$22.methods = [{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", type: $funcType([], [$Bool], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	funcType.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$18.methods = [{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", type: $funcType([], [$Bool], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	interfaceType.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$10.methods = [{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", type: $funcType([], [$Bool], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	mapType.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$23.methods = [{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", type: $funcType([], [$Bool], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$2.methods = [{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", type: $funcType([], [$Bool], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	sliceType.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$24.methods = [{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", type: $funcType([], [$Bool], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	structType.methods = [{prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	ptrType$12.methods = [{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "pointers", name: "pointers", pkg: "reflect", type: $funcType([], [$Bool], false)}, {prop: "ptrTo", name: "ptrTo", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}];
	StructTag.methods = [{prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [$String], false)}];
	ptrType$25.methods = [{prop: "Get", name: "Get", pkg: "", type: $funcType([$String], [$String], false)}];
	Value.methods = [{prop: "Addr", name: "Addr", pkg: "", type: $funcType([], [Value], false)}, {prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Bytes", name: "Bytes", pkg: "", type: $funcType([], [sliceType$12], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([sliceType$6], [sliceType$6], false)}, {prop: "CallSlice", name: "CallSlice", pkg: "", type: $funcType([sliceType$6], [sliceType$6], false)}, {prop: "CanAddr", name: "CanAddr", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "CanInterface", name: "CanInterface", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "CanSet", name: "CanSet", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Cap", name: "Cap", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Close", name: "Close", pkg: "", type: $funcType([], [], false)}, {prop: "Complex", name: "Complex", pkg: "", type: $funcType([], [$Complex128], false)}, {prop: "Convert", name: "Convert", pkg: "", type: $funcType([Type], [Value], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Value], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [Value], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [Value], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [Value], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [Value], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Value], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "InterfaceData", name: "InterfaceData", pkg: "", type: $funcType([], [arrayType$3], false)}, {prop: "IsNil", name: "IsNil", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "IsValid", name: "IsValid", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "MapIndex", name: "MapIndex", pkg: "", type: $funcType([Value], [Value], false)}, {prop: "MapKeys", name: "MapKeys", pkg: "", type: $funcType([], [sliceType$6], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Value], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Value], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "OverflowComplex", name: "OverflowComplex", pkg: "", type: $funcType([$Complex128], [$Bool], false)}, {prop: "OverflowFloat", name: "OverflowFloat", pkg: "", type: $funcType([$Float64], [$Bool], false)}, {prop: "OverflowInt", name: "OverflowInt", pkg: "", type: $funcType([$Int64], [$Bool], false)}, {prop: "OverflowUint", name: "OverflowUint", pkg: "", type: $funcType([$Uint64], [$Bool], false)}, {prop: "Pointer", name: "Pointer", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "Recv", name: "Recv", pkg: "", type: $funcType([], [Value, $Bool], false)}, {prop: "Send", name: "Send", pkg: "", type: $funcType([Value], [], false)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([Value], [], false)}, {prop: "SetBool", name: "SetBool", pkg: "", type: $funcType([$Bool], [], false)}, {prop: "SetBytes", name: "SetBytes", pkg: "", type: $funcType([sliceType$12], [], false)}, {prop: "SetCap", name: "SetCap", pkg: "", type: $funcType([$Int], [], false)}, {prop: "SetComplex", name: "SetComplex", pkg: "", type: $funcType([$Complex128], [], false)}, {prop: "SetFloat", name: "SetFloat", pkg: "", type: $funcType([$Float64], [], false)}, {prop: "SetInt", name: "SetInt", pkg: "", type: $funcType([$Int64], [], false)}, {prop: "SetLen", name: "SetLen", pkg: "", type: $funcType([$Int], [], false)}, {prop: "SetMapIndex", name: "SetMapIndex", pkg: "", type: $funcType([Value, Value], [], false)}, {prop: "SetPointer", name: "SetPointer", pkg: "", type: $funcType([$UnsafePointer], [], false)}, {prop: "SetString", name: "SetString", pkg: "", type: $funcType([$String], [], false)}, {prop: "SetUint", name: "SetUint", pkg: "", type: $funcType([$Uint64], [], false)}, {prop: "Slice", name: "Slice", pkg: "", type: $funcType([$Int, $Int], [Value], false)}, {prop: "Slice3", name: "Slice3", pkg: "", type: $funcType([$Int, $Int, $Int], [Value], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "TryRecv", name: "TryRecv", pkg: "", type: $funcType([], [Value, $Bool], false)}, {prop: "TrySend", name: "TrySend", pkg: "", type: $funcType([Value], [$Bool], false)}, {prop: "Type", name: "Type", pkg: "", type: $funcType([], [Type], false)}, {prop: "Uint", name: "Uint", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "UnsafeAddr", name: "UnsafeAddr", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "assignTo", name: "assignTo", pkg: "reflect", type: $funcType([$String, ptrType$1, $UnsafePointer], [Value], false)}, {prop: "call", name: "call", pkg: "reflect", type: $funcType([$String, sliceType$6], [sliceType$6], false)}, {prop: "kind", name: "kind", pkg: "reflect", type: $funcType([], [Kind], false)}, {prop: "mustBe", name: "mustBe", pkg: "reflect", type: $funcType([Kind], [], false)}, {prop: "mustBeAssignable", name: "mustBeAssignable", pkg: "reflect", type: $funcType([], [], false)}, {prop: "mustBeExported", name: "mustBeExported", pkg: "reflect", type: $funcType([], [], false)}, {prop: "object", name: "object", pkg: "reflect", type: $funcType([], [js.Object], false)}, {prop: "pointer", name: "pointer", pkg: "reflect", type: $funcType([], [$UnsafePointer], false)}, {prop: "recv", name: "recv", pkg: "reflect", type: $funcType([$Bool], [Value, $Bool], false)}, {prop: "runes", name: "runes", pkg: "reflect", type: $funcType([], [sliceType$13], false)}, {prop: "send", name: "send", pkg: "reflect", type: $funcType([Value, $Bool], [$Bool], false)}, {prop: "setRunes", name: "setRunes", pkg: "reflect", type: $funcType([sliceType$13], [], false)}];
	ptrType$27.methods = [{prop: "Addr", name: "Addr", pkg: "", type: $funcType([], [Value], false)}, {prop: "Bool", name: "Bool", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Bytes", name: "Bytes", pkg: "", type: $funcType([], [sliceType$12], false)}, {prop: "Call", name: "Call", pkg: "", type: $funcType([sliceType$6], [sliceType$6], false)}, {prop: "CallSlice", name: "CallSlice", pkg: "", type: $funcType([sliceType$6], [sliceType$6], false)}, {prop: "CanAddr", name: "CanAddr", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "CanInterface", name: "CanInterface", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "CanSet", name: "CanSet", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Cap", name: "Cap", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Close", name: "Close", pkg: "", type: $funcType([], [], false)}, {prop: "Complex", name: "Complex", pkg: "", type: $funcType([], [$Complex128], false)}, {prop: "Convert", name: "Convert", pkg: "", type: $funcType([Type], [Value], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Value], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [Value], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [Value], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [Value], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [Value], false)}, {prop: "Float", name: "Float", pkg: "", type: $funcType([], [$Float64], false)}, {prop: "Index", name: "Index", pkg: "", type: $funcType([$Int], [Value], false)}, {prop: "Int", name: "Int", pkg: "", type: $funcType([], [$Int64], false)}, {prop: "Interface", name: "Interface", pkg: "", type: $funcType([], [$emptyInterface], false)}, {prop: "InterfaceData", name: "InterfaceData", pkg: "", type: $funcType([], [arrayType$3], false)}, {prop: "IsNil", name: "IsNil", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "IsValid", name: "IsValid", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "MapIndex", name: "MapIndex", pkg: "", type: $funcType([Value], [Value], false)}, {prop: "MapKeys", name: "MapKeys", pkg: "", type: $funcType([], [sliceType$6], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Value], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Value], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "OverflowComplex", name: "OverflowComplex", pkg: "", type: $funcType([$Complex128], [$Bool], false)}, {prop: "OverflowFloat", name: "OverflowFloat", pkg: "", type: $funcType([$Float64], [$Bool], false)}, {prop: "OverflowInt", name: "OverflowInt", pkg: "", type: $funcType([$Int64], [$Bool], false)}, {prop: "OverflowUint", name: "OverflowUint", pkg: "", type: $funcType([$Uint64], [$Bool], false)}, {prop: "Pointer", name: "Pointer", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "Recv", name: "Recv", pkg: "", type: $funcType([], [Value, $Bool], false)}, {prop: "Send", name: "Send", pkg: "", type: $funcType([Value], [], false)}, {prop: "Set", name: "Set", pkg: "", type: $funcType([Value], [], false)}, {prop: "SetBool", name: "SetBool", pkg: "", type: $funcType([$Bool], [], false)}, {prop: "SetBytes", name: "SetBytes", pkg: "", type: $funcType([sliceType$12], [], false)}, {prop: "SetCap", name: "SetCap", pkg: "", type: $funcType([$Int], [], false)}, {prop: "SetComplex", name: "SetComplex", pkg: "", type: $funcType([$Complex128], [], false)}, {prop: "SetFloat", name: "SetFloat", pkg: "", type: $funcType([$Float64], [], false)}, {prop: "SetInt", name: "SetInt", pkg: "", type: $funcType([$Int64], [], false)}, {prop: "SetLen", name: "SetLen", pkg: "", type: $funcType([$Int], [], false)}, {prop: "SetMapIndex", name: "SetMapIndex", pkg: "", type: $funcType([Value, Value], [], false)}, {prop: "SetPointer", name: "SetPointer", pkg: "", type: $funcType([$UnsafePointer], [], false)}, {prop: "SetString", name: "SetString", pkg: "", type: $funcType([$String], [], false)}, {prop: "SetUint", name: "SetUint", pkg: "", type: $funcType([$Uint64], [], false)}, {prop: "Slice", name: "Slice", pkg: "", type: $funcType([$Int, $Int], [Value], false)}, {prop: "Slice3", name: "Slice3", pkg: "", type: $funcType([$Int, $Int, $Int], [Value], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "TryRecv", name: "TryRecv", pkg: "", type: $funcType([], [Value, $Bool], false)}, {prop: "TrySend", name: "TrySend", pkg: "", type: $funcType([Value], [$Bool], false)}, {prop: "Type", name: "Type", pkg: "", type: $funcType([], [Type], false)}, {prop: "Uint", name: "Uint", pkg: "", type: $funcType([], [$Uint64], false)}, {prop: "UnsafeAddr", name: "UnsafeAddr", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "assignTo", name: "assignTo", pkg: "reflect", type: $funcType([$String, ptrType$1, $UnsafePointer], [Value], false)}, {prop: "call", name: "call", pkg: "reflect", type: $funcType([$String, sliceType$6], [sliceType$6], false)}, {prop: "kind", name: "kind", pkg: "reflect", type: $funcType([], [Kind], false)}, {prop: "mustBe", name: "mustBe", pkg: "reflect", type: $funcType([Kind], [], false)}, {prop: "mustBeAssignable", name: "mustBeAssignable", pkg: "reflect", type: $funcType([], [], false)}, {prop: "mustBeExported", name: "mustBeExported", pkg: "reflect", type: $funcType([], [], false)}, {prop: "object", name: "object", pkg: "reflect", type: $funcType([], [js.Object], false)}, {prop: "pointer", name: "pointer", pkg: "reflect", type: $funcType([], [$UnsafePointer], false)}, {prop: "recv", name: "recv", pkg: "reflect", type: $funcType([$Bool], [Value, $Bool], false)}, {prop: "runes", name: "runes", pkg: "reflect", type: $funcType([], [sliceType$13], false)}, {prop: "send", name: "send", pkg: "reflect", type: $funcType([Value, $Bool], [$Bool], false)}, {prop: "setRunes", name: "setRunes", pkg: "reflect", type: $funcType([sliceType$13], [], false)}];
	flag.methods = [{prop: "kind", name: "kind", pkg: "reflect", type: $funcType([], [Kind], false)}, {prop: "mustBe", name: "mustBe", pkg: "reflect", type: $funcType([Kind], [], false)}, {prop: "mustBeAssignable", name: "mustBeAssignable", pkg: "reflect", type: $funcType([], [], false)}, {prop: "mustBeExported", name: "mustBeExported", pkg: "reflect", type: $funcType([], [], false)}];
	ptrType$28.methods = [{prop: "kind", name: "kind", pkg: "reflect", type: $funcType([], [Kind], false)}, {prop: "mustBe", name: "mustBe", pkg: "reflect", type: $funcType([Kind], [], false)}, {prop: "mustBeAssignable", name: "mustBeAssignable", pkg: "reflect", type: $funcType([], [], false)}, {prop: "mustBeExported", name: "mustBeExported", pkg: "reflect", type: $funcType([], [], false)}];
	ptrType$29.methods = [{prop: "Error", name: "Error", pkg: "", type: $funcType([], [$String], false)}];
	mapIter.init([{prop: "t", name: "t", pkg: "reflect", type: Type, tag: ""}, {prop: "m", name: "m", pkg: "reflect", type: js.Object, tag: ""}, {prop: "keys", name: "keys", pkg: "reflect", type: js.Object, tag: ""}, {prop: "i", name: "i", pkg: "reflect", type: $Int, tag: ""}]);
	Type.init([{prop: "Align", name: "Align", pkg: "", type: $funcType([], [$Int], false)}, {prop: "AssignableTo", name: "AssignableTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Bits", name: "Bits", pkg: "", type: $funcType([], [$Int], false)}, {prop: "ChanDir", name: "ChanDir", pkg: "", type: $funcType([], [ChanDir], false)}, {prop: "Comparable", name: "Comparable", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "ConvertibleTo", name: "ConvertibleTo", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "Elem", name: "Elem", pkg: "", type: $funcType([], [Type], false)}, {prop: "Field", name: "Field", pkg: "", type: $funcType([$Int], [StructField], false)}, {prop: "FieldAlign", name: "FieldAlign", pkg: "", type: $funcType([], [$Int], false)}, {prop: "FieldByIndex", name: "FieldByIndex", pkg: "", type: $funcType([sliceType$9], [StructField], false)}, {prop: "FieldByName", name: "FieldByName", pkg: "", type: $funcType([$String], [StructField, $Bool], false)}, {prop: "FieldByNameFunc", name: "FieldByNameFunc", pkg: "", type: $funcType([funcType$2], [StructField, $Bool], false)}, {prop: "Implements", name: "Implements", pkg: "", type: $funcType([Type], [$Bool], false)}, {prop: "In", name: "In", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "IsVariadic", name: "IsVariadic", pkg: "", type: $funcType([], [$Bool], false)}, {prop: "Key", name: "Key", pkg: "", type: $funcType([], [Type], false)}, {prop: "Kind", name: "Kind", pkg: "", type: $funcType([], [Kind], false)}, {prop: "Len", name: "Len", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Method", name: "Method", pkg: "", type: $funcType([$Int], [Method], false)}, {prop: "MethodByName", name: "MethodByName", pkg: "", type: $funcType([$String], [Method, $Bool], false)}, {prop: "Name", name: "Name", pkg: "", type: $funcType([], [$String], false)}, {prop: "NumField", name: "NumField", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumIn", name: "NumIn", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumMethod", name: "NumMethod", pkg: "", type: $funcType([], [$Int], false)}, {prop: "NumOut", name: "NumOut", pkg: "", type: $funcType([], [$Int], false)}, {prop: "Out", name: "Out", pkg: "", type: $funcType([$Int], [Type], false)}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $funcType([], [$String], false)}, {prop: "Size", name: "Size", pkg: "", type: $funcType([], [$Uintptr], false)}, {prop: "String", name: "String", pkg: "", type: $funcType([], [$String], false)}, {prop: "common", name: "common", pkg: "reflect", type: $funcType([], [ptrType$1], false)}, {prop: "uncommon", name: "uncommon", pkg: "reflect", type: $funcType([], [ptrType$5], false)}]);
	rtype.init([{prop: "size", name: "size", pkg: "reflect", type: $Uintptr, tag: ""}, {prop: "hash", name: "hash", pkg: "reflect", type: $Uint32, tag: ""}, {prop: "_$2", name: "_", pkg: "reflect", type: $Uint8, tag: ""}, {prop: "align", name: "align", pkg: "reflect", type: $Uint8, tag: ""}, {prop: "fieldAlign", name: "fieldAlign", pkg: "reflect", type: $Uint8, tag: ""}, {prop: "kind", name: "kind", pkg: "reflect", type: $Uint8, tag: ""}, {prop: "alg", name: "alg", pkg: "reflect", type: ptrType$3, tag: ""}, {prop: "gc", name: "gc", pkg: "reflect", type: arrayType$1, tag: ""}, {prop: "string", name: "string", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "uncommonType", name: "", pkg: "reflect", type: ptrType$5, tag: ""}, {prop: "ptrToThis", name: "ptrToThis", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "zero", name: "zero", pkg: "reflect", type: $UnsafePointer, tag: ""}]);
	typeAlg.init([{prop: "hash", name: "hash", pkg: "reflect", type: funcType$3, tag: ""}, {prop: "equal", name: "equal", pkg: "reflect", type: funcType$4, tag: ""}]);
	method.init([{prop: "name", name: "name", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "pkgPath", name: "pkgPath", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "mtyp", name: "mtyp", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "typ", name: "typ", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "ifn", name: "ifn", pkg: "reflect", type: $UnsafePointer, tag: ""}, {prop: "tfn", name: "tfn", pkg: "reflect", type: $UnsafePointer, tag: ""}]);
	uncommonType.init([{prop: "name", name: "name", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "pkgPath", name: "pkgPath", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "methods", name: "methods", pkg: "reflect", type: sliceType$2, tag: ""}]);
	arrayType.init([{prop: "rtype", name: "", pkg: "reflect", type: rtype, tag: "reflect:\"array\""}, {prop: "elem", name: "elem", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "slice", name: "slice", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "len", name: "len", pkg: "reflect", type: $Uintptr, tag: ""}]);
	chanType.init([{prop: "rtype", name: "", pkg: "reflect", type: rtype, tag: "reflect:\"chan\""}, {prop: "elem", name: "elem", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "dir", name: "dir", pkg: "reflect", type: $Uintptr, tag: ""}]);
	funcType.init([{prop: "rtype", name: "", pkg: "reflect", type: rtype, tag: "reflect:\"func\""}, {prop: "dotdotdot", name: "dotdotdot", pkg: "reflect", type: $Bool, tag: ""}, {prop: "in$2", name: "in", pkg: "reflect", type: sliceType$3, tag: ""}, {prop: "out", name: "out", pkg: "reflect", type: sliceType$3, tag: ""}]);
	imethod.init([{prop: "name", name: "name", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "pkgPath", name: "pkgPath", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "typ", name: "typ", pkg: "reflect", type: ptrType$1, tag: ""}]);
	interfaceType.init([{prop: "rtype", name: "", pkg: "reflect", type: rtype, tag: "reflect:\"interface\""}, {prop: "methods", name: "methods", pkg: "reflect", type: sliceType$4, tag: ""}]);
	mapType.init([{prop: "rtype", name: "", pkg: "reflect", type: rtype, tag: "reflect:\"map\""}, {prop: "key", name: "key", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "elem", name: "elem", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "bucket", name: "bucket", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "hmap", name: "hmap", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "keysize", name: "keysize", pkg: "reflect", type: $Uint8, tag: ""}, {prop: "indirectkey", name: "indirectkey", pkg: "reflect", type: $Uint8, tag: ""}, {prop: "valuesize", name: "valuesize", pkg: "reflect", type: $Uint8, tag: ""}, {prop: "indirectvalue", name: "indirectvalue", pkg: "reflect", type: $Uint8, tag: ""}, {prop: "bucketsize", name: "bucketsize", pkg: "reflect", type: $Uint16, tag: ""}]);
	ptrType.init([{prop: "rtype", name: "", pkg: "reflect", type: rtype, tag: "reflect:\"ptr\""}, {prop: "elem", name: "elem", pkg: "reflect", type: ptrType$1, tag: ""}]);
	sliceType.init([{prop: "rtype", name: "", pkg: "reflect", type: rtype, tag: "reflect:\"slice\""}, {prop: "elem", name: "elem", pkg: "reflect", type: ptrType$1, tag: ""}]);
	structField.init([{prop: "name", name: "name", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "pkgPath", name: "pkgPath", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "typ", name: "typ", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "tag", name: "tag", pkg: "reflect", type: ptrType$4, tag: ""}, {prop: "offset", name: "offset", pkg: "reflect", type: $Uintptr, tag: ""}]);
	structType.init([{prop: "rtype", name: "", pkg: "reflect", type: rtype, tag: "reflect:\"struct\""}, {prop: "fields", name: "fields", pkg: "reflect", type: sliceType$5, tag: ""}]);
	Method.init([{prop: "Name", name: "Name", pkg: "", type: $String, tag: ""}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $String, tag: ""}, {prop: "Type", name: "Type", pkg: "", type: Type, tag: ""}, {prop: "Func", name: "Func", pkg: "", type: Value, tag: ""}, {prop: "Index", name: "Index", pkg: "", type: $Int, tag: ""}]);
	StructField.init([{prop: "Name", name: "Name", pkg: "", type: $String, tag: ""}, {prop: "PkgPath", name: "PkgPath", pkg: "", type: $String, tag: ""}, {prop: "Type", name: "Type", pkg: "", type: Type, tag: ""}, {prop: "Tag", name: "Tag", pkg: "", type: StructTag, tag: ""}, {prop: "Offset", name: "Offset", pkg: "", type: $Uintptr, tag: ""}, {prop: "Index", name: "Index", pkg: "", type: sliceType$9, tag: ""}, {prop: "Anonymous", name: "Anonymous", pkg: "", type: $Bool, tag: ""}]);
	fieldScan.init([{prop: "typ", name: "typ", pkg: "reflect", type: ptrType$12, tag: ""}, {prop: "index", name: "index", pkg: "reflect", type: sliceType$9, tag: ""}]);
	Value.init([{prop: "typ", name: "typ", pkg: "reflect", type: ptrType$1, tag: ""}, {prop: "ptr", name: "ptr", pkg: "reflect", type: $UnsafePointer, tag: ""}, {prop: "flag", name: "", pkg: "reflect", type: flag, tag: ""}]);
	ValueError.init([{prop: "Method", name: "Method", pkg: "", type: $String, tag: ""}, {prop: "Kind", name: "Kind", pkg: "", type: Kind, tag: ""}]);
	nonEmptyInterface.init([{prop: "itab", name: "itab", pkg: "reflect", type: ptrType$7, tag: ""}, {prop: "word", name: "word", pkg: "reflect", type: $UnsafePointer, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_reflect = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = math.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = runtime.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		$r = strconv.$init($BLOCKING); /* */ $s = 4; case 4: if ($r && $r.$blocking) { $r = $r(); }
		$r = sync.$init($BLOCKING); /* */ $s = 5; case 5: if ($r && $r.$blocking) { $r = $r(); }
		initialized = false;
		stringPtrMap = new $Map();
		jsObject = $js.Object;
		jsContainer = $js.container.ptr;
		kindNames = new sliceType$1(["invalid", "bool", "int", "int8", "int16", "int32", "int64", "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "float32", "float64", "complex64", "complex128", "array", "chan", "func", "interface", "map", "ptr", "slice", "string", "struct", "unsafe.Pointer"]);
		uint8Type = $assertType(TypeOf(new $Uint8(0)), ptrType$1);
		init();
		/* */ } return; } }; $init_reflect.$blocking = true; return $init_reflect;
	};
	return $pkg;
})();
$packages["/Users/alex/programming/go/src/github.com/albrow/gopherjs-watch"] = (function() {
	var $pkg = {}, js, jquery, reflect, Person, ptrType, sliceType, funcType, funcType$1, jq, main, BindField, OnChange;
	js = $packages["github.com/gopherjs/gopherjs/js"];
	jquery = $packages["github.com/gopherjs/jquery"];
	reflect = $packages["reflect"];
	Person = $pkg.Person = $newType(0, $kindStruct, "main.Person", "Person", "/Users/alex/programming/go/src/github.com/albrow/gopherjs-watch", function(Name_, Age_) {
		this.$val = this;
		this.Name = Name_ !== undefined ? Name_ : "";
		this.Age = Age_ !== undefined ? Age_ : 0;
	});
	ptrType = $ptrType($String);
	sliceType = $sliceType($emptyInterface);
	funcType = $funcType([jquery.Event], [], false);
	funcType$1 = $funcType([$String, $String, $String, $String], [], false);
	main = function() {
		var p;
		console.log("starting...");
		p = new Person.ptr("", 0);
		BindField("input#name", new ptrType(function() { return this.$target.Name; }, function($v) { this.$target.Name = $v; }, p));
		OnChange(p, (function() {
			if (!(p.Name === "")) {
				jq(new sliceType([new $String("#greeting")])).SetHtml(new $String("Hello, " + p.Name));
			} else {
				jq(new sliceType([new $String("#greeting")])).SetHtml(new $String(""));
			}
		}));
	};
	BindField = $pkg.BindField = function(selector, val) {
		jq(new sliceType([new $String(selector)])).On(new sliceType([new $String("input"), new funcType((function(e) {
			var newVal;
			newVal = jq(new sliceType([new $String(selector)])).Val();
			reflect.ValueOf(val).Elem().Set(reflect.ValueOf(new $String(newVal)));
		}))]));
	};
	OnChange = $pkg.OnChange = function(model, f) {
		$global.watch(model, $externalize((function(prop, action, newValue, oldValue) {
			$go(f, []);
		}), funcType$1));
	};
	Person.init([{prop: "Name", name: "Name", pkg: "", type: $String, tag: ""}, {prop: "Age", name: "Age", pkg: "", type: $Int, tag: ""}]);
	$pkg.$init = function() {
		$pkg.$init = function() {};
		/* */ var $r, $s = 0; var $init_main = function() { while (true) { switch ($s) { case 0:
		$r = js.$init($BLOCKING); /* */ $s = 1; case 1: if ($r && $r.$blocking) { $r = $r(); }
		$r = jquery.$init($BLOCKING); /* */ $s = 2; case 2: if ($r && $r.$blocking) { $r = $r(); }
		$r = reflect.$init($BLOCKING); /* */ $s = 3; case 3: if ($r && $r.$blocking) { $r = $r(); }
		jq = jquery.NewJQuery;
		main();
		/* */ } return; } }; $init_main.$blocking = true; return $init_main;
	};
	return $pkg;
})();
$initAnonTypes();
$packages["runtime"].$init()();
$go($packages["/Users/alex/programming/go/src/github.com/albrow/gopherjs-watch"].$init, [], true);
$flushConsole();

})(this);
//# sourceMappingURL=main.js.map
