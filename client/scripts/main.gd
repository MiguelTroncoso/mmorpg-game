extends Control
## Escena de arranque de Fase 0: conecta al servidor y muestra el estado.
## Criterio de salida sesión 2: mostrar "connected" (y el ping) o el error.

## Host del servidor. En Android físico apuntar a la IP de la máquina de desarrollo.
@export var server_host := "127.0.0.1:2567"

@onready var _label: Label = %StatusLabel
@onready var _net: NetClient = $NetClient


func _ready() -> void:
	_net.status_changed.connect(_on_status_changed)
	_net.message_received.connect(_on_message)
	_net.connect_to_server(server_host)


func _on_status_changed(status: NetClient.Status, params: Dictionary) -> void:
	match status:
		NetClient.Status.MATCHMAKING:
			_label.text = tr("net.status.matchmaking")
		NetClient.Status.CONNECTING:
			_label.text = tr("net.status.connecting")
		NetClient.Status.CONNECTED:
			_label.text = tr("net.status.connected")
		NetClient.Status.ERROR_HTTP:
			_label.text = tr("net.error.http").format(params)
		NetClient.Status.ERROR_WS:
			_label.text = tr("net.error.ws")
		NetClient.Status.ERROR_CLOSED:
			_label.text = tr("net.error.closed").format(params)
		NetClient.Status.ERROR_VERSION:
			_label.text = tr("net.error.version")


func _on_message(msg_type: String, payload: Variant) -> void:
	match msg_type:
		"ping":
			if typeof(payload) != TYPE_DICTIONARY or int(payload.get("v", -1)) != NetClient.PROTOCOL_VERSION:
				_label.text = tr("net.error.version")
				return
			# Devolver t intacto: el RTT real lo mide el servidor al recibir el pong.
			_net.send_message("pong", {"t": int(payload.t)})
			_label.text = "%s — %s" % [tr("net.status.connected"), tr("net.status.ping")]
