class_name Msgpack
## Subset de MessagePack para el protocolo del juego (shared/protocol/PROTOCOL.md).
##
## Decisión ADR 001: implementación propia y auditable en vez de dependencia.
## Cubre lo que el protocolo usa: nil, bool, enteros, float32/64, str, array y map
## (fixmap y map16 — msgpackr, el encoder del servidor, emite map16 por defecto).
##
## Reglas de encoding (verificadas contra el servidor en server/tests/connection.test.ts):
## - Enteros fuera de rango int32 se codifican como float64 (0xCB). El servidor
##   decodifica uint64/int64 como BigInt y la validación los rechaza.

const _ERR := {"__msgpack_error": true}


static func encode(value: Variant) -> PackedByteArray:
	var out := StreamPeerBuffer.new()
	out.big_endian = true
	_encode_value(out, value)
	return out.data_array


static func decode(bytes: PackedByteArray, offset: int = 0) -> Dictionary:
	## Devuelve {value, bytes_read} o {error: true} si el buffer es inválido.
	var buf := StreamPeerBuffer.new()
	buf.big_endian = true
	buf.data_array = bytes
	buf.seek(offset)
	var value: Variant = _decode_value(buf)
	if typeof(value) == TYPE_DICTIONARY and value.get("__msgpack_error", false):
		return {"error": true}
	return {"value": value, "bytes_read": buf.get_position() - offset}


static func _encode_value(out: StreamPeerBuffer, value: Variant) -> void:
	match typeof(value):
		TYPE_NIL:
			out.put_u8(0xC0)
		TYPE_BOOL:
			out.put_u8(0xC3 if value else 0xC2)
		TYPE_INT:
			_encode_int(out, value)
		TYPE_FLOAT:
			out.put_u8(0xCB)
			out.put_double(value)
		TYPE_STRING, TYPE_STRING_NAME:
			_encode_string(out, String(value))
		TYPE_ARRAY:
			_encode_array(out, value)
		TYPE_DICTIONARY:
			_encode_map(out, value)
		_:
			push_error("Msgpack: tipo no soportado: %s" % typeof(value))
			out.put_u8(0xC0)


static func _encode_int(out: StreamPeerBuffer, v: int) -> void:
	if v >= 0 and v <= 0x7F:
		out.put_u8(v)  # positive fixint
	elif v < 0 and v >= -32:
		out.put_u8(0x100 + v)  # negative fixint
	elif v >= -0x80 and v <= 0x7F:
		out.put_u8(0xD0)
		out.put_8(v)
	elif v >= -0x8000 and v <= 0x7FFF:
		out.put_u8(0xD1)
		out.put_16(v)
	elif v >= -0x80000000 and v <= 0x7FFFFFFF:
		out.put_u8(0xD2)
		out.put_32(v)
	else:
		# Regla del protocolo: fuera de int32 → float64 (exacto hasta 2^53).
		out.put_u8(0xCB)
		out.put_double(float(v))


static func _encode_string(out: StreamPeerBuffer, s: String) -> void:
	var utf8 := s.to_utf8_buffer()
	var n := utf8.size()
	if n <= 31:
		out.put_u8(0xA0 | n)
	elif n <= 0xFF:
		out.put_u8(0xD9)
		out.put_u8(n)
	else:
		out.put_u8(0xDA)
		out.put_u16(n)
	out.put_data(utf8)


static func _encode_array(out: StreamPeerBuffer, arr: Array) -> void:
	var n := arr.size()
	if n <= 15:
		out.put_u8(0x90 | n)
	else:
		out.put_u8(0xDC)
		out.put_u16(n)
	for item in arr:
		_encode_value(out, item)


static func _encode_map(out: StreamPeerBuffer, dict: Dictionary) -> void:
	var n := dict.size()
	if n <= 15:
		out.put_u8(0x80 | n)
	else:
		out.put_u8(0xDE)
		out.put_u16(n)
	for key in dict:
		_encode_value(out, key)
		_encode_value(out, dict[key])


static func _decode_value(buf: StreamPeerBuffer) -> Variant:
	if buf.get_position() >= buf.get_size():
		return _ERR
	var b := buf.get_u8()
	if b <= 0x7F:
		return b  # positive fixint
	if b >= 0xE0:
		return b - 0x100  # negative fixint
	if b >= 0xA0 and b <= 0xBF:
		return _decode_string(buf, b & 0x1F)
	if b >= 0x80 and b <= 0x8F:
		return _decode_map(buf, b & 0x0F)
	if b >= 0x90 and b <= 0x9F:
		return _decode_array(buf, b & 0x0F)
	match b:
		0xC0:
			return null
		0xC2:
			return false
		0xC3:
			return true
		0xCA:
			return buf.get_float()
		0xCB:
			return buf.get_double()
		0xCC:
			return buf.get_u8()
		0xCD:
			return buf.get_u16()
		0xCE:
			return buf.get_u32()
		0xCF:
			return buf.get_u64()  # puede desbordar int64 con signo; el protocolo no lo usa
		0xD0:
			return buf.get_8()
		0xD1:
			return buf.get_16()
		0xD2:
			return buf.get_32()
		0xD3:
			return buf.get_64()
		0xD9:
			return _decode_string(buf, buf.get_u8())
		0xDA:
			return _decode_string(buf, buf.get_u16())
		0xDC:
			return _decode_array(buf, buf.get_u16())
		0xDE:
			return _decode_map(buf, buf.get_u16())
		_:
			push_error("Msgpack: byte no soportado: 0x%02X" % b)
			return _ERR


static func _decode_string(buf: StreamPeerBuffer, length: int) -> Variant:
	if buf.get_position() + length > buf.get_size():
		return _ERR
	var data := buf.get_data(length)
	if data[0] != OK:
		return _ERR
	return (data[1] as PackedByteArray).get_string_from_utf8()


static func _decode_array(buf: StreamPeerBuffer, count: int) -> Variant:
	var arr: Array = []
	for _i in count:
		var v: Variant = _decode_value(buf)
		if typeof(v) == TYPE_DICTIONARY and v.get("__msgpack_error", false):
			return _ERR
		arr.append(v)
	return arr


static func _decode_map(buf: StreamPeerBuffer, count: int) -> Variant:
	var dict := {}
	for _i in count:
		var k: Variant = _decode_value(buf)
		var v: Variant = _decode_value(buf)
		if typeof(k) == TYPE_DICTIONARY and k.get("__msgpack_error", false):
			return _ERR
		if typeof(v) == TYPE_DICTIONARY and v.get("__msgpack_error", false):
			return _ERR
		dict[k] = v
	return dict
