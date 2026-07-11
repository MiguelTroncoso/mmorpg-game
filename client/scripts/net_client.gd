class_name NetClient
extends Node
## Cliente de red de Fase 0: matchmaking HTTP + WebSocket crudo contra Colyseus.
## Wire format documentado y verificado en shared/protocol/PROTOCOL.md.
## Este nodo solo transporta mensajes; no contiene ninguna lógica de juego.

signal status_changed(status: Status, params: Dictionary)
signal message_received(msg_type: String, payload: Variant)

enum Status { CONNECTING, MATCHMAKING, CONNECTED, PING_OK, ERROR_HTTP, ERROR_WS, ERROR_CLOSED, ERROR_VERSION }

## Debe coincidir con PROTOCOL_VERSION de shared/protocol/messages.ts.
const PROTOCOL_VERSION := 1

const _JOIN_ROOM := 10
const _ERROR := 11
const _LEAVE_ROOM := 12
const _ROOM_DATA := 13

var _host := "127.0.0.1:2567"
var _socket := WebSocketPeer.new()
var _ws_active := false
var _joined := false


func connect_to_server(host: String, room_name: String = "game") -> void:
	_host = host
	status_changed.emit(Status.MATCHMAKING, {})
	var http := HTTPRequest.new()
	add_child(http)
	http.request_completed.connect(_on_matchmake_response.bind(http))
	var err := http.request(
		"http://%s/matchmake/joinOrCreate/%s" % [_host, room_name],
		["Content-Type: application/json"],
		HTTPClient.METHOD_POST,
		"{}"
	)
	if err != OK:
		status_changed.emit(Status.ERROR_HTTP, {"code": err})


func send_message(msg_type: String, payload: Variant) -> void:
	if not _joined:
		push_error("NetClient: send_message antes de join")
		return
	var frame := PackedByteArray([_ROOM_DATA])
	frame.append_array(Msgpack.encode(msg_type))
	frame.append_array(Msgpack.encode(payload))
	_socket.put_packet(frame)


func _on_matchmake_response(
	result: int, code: int, _headers: PackedStringArray, body: PackedByteArray, http: HTTPRequest
) -> void:
	http.queue_free()
	if result != HTTPRequest.RESULT_SUCCESS or code != 200:
		status_changed.emit(Status.ERROR_HTTP, {"code": code if code > 0 else result})
		return
	var seat: Variant = JSON.parse_string(body.get_string_from_utf8())
	if typeof(seat) != TYPE_DICTIONARY or not seat.has_all(["processId", "roomId", "sessionId"]):
		status_changed.emit(Status.ERROR_HTTP, {"code": -1})
		return
	status_changed.emit(Status.CONNECTING, {})
	var url := "ws://%s/%s/%s?sessionId=%s" % [_host, seat.processId, seat.roomId, seat.sessionId]
	if _socket.connect_to_url(url) != OK:
		status_changed.emit(Status.ERROR_WS, {})
		return
	_ws_active = true


func _process(_delta: float) -> void:
	if not _ws_active:
		return
	_socket.poll()
	match _socket.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			while _socket.get_available_packet_count() > 0:
				_handle_frame(_socket.get_packet())
		WebSocketPeer.STATE_CLOSED:
			_ws_active = false
			_joined = false
			status_changed.emit(Status.ERROR_CLOSED, {"code": _socket.get_close_code()})


func _handle_frame(frame: PackedByteArray) -> void:
	if frame.is_empty():
		return
	match frame[0]:
		_JOIN_ROOM:
			# Confirmación del join: responder [10]. Ver PROTOCOL.md §2.
			_socket.put_packet(PackedByteArray([_JOIN_ROOM]))
			_joined = true
			status_changed.emit(Status.CONNECTED, {})
		_ROOM_DATA:
			var type_result := Msgpack.decode(frame, 1)
			if type_result.has("error") or typeof(type_result.value) != TYPE_STRING:
				push_error("NetClient: tipo de mensaje inválido")
				return
			var payload_result := Msgpack.decode(frame, 1 + type_result.bytes_read)
			if payload_result.has("error"):
				push_error("NetClient: payload inválido para '%s'" % type_result.value)
				return
			message_received.emit(type_result.value, payload_result.value)
		_ERROR, _LEAVE_ROOM:
			_socket.close()
