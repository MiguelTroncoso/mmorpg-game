extends Node3D
## Fase 0: plano + cápsulas. Tap/click envía INTENCIÓN de movimiento; toda
## posición viene del servidor (autoritativo). Placeholders, sin arte, sin UI.

## Host del servidor. En Android físico apuntar a la IP LAN de la máquina de desarrollo.
@export var server_host := "127.0.0.1:2567"

const PROTOCOL_VERSION := NetClient.PROTOCOL_VERSION
const REMOTE_PLAYER := preload("res://scripts/remote_player.gd")

@onready var _label: Label = %StatusLabel
@onready var _net: NetClient = $NetClient
@onready var _players_root: Node3D = $Players

var _camera: Camera3D
var _my_id := ""
var _players: Dictionary = {}  # sessionId -> RemotePlayer
var _interp_delay_ms := 200.0


func _ready() -> void:
	_build_world()
	_net.status_changed.connect(_on_status_changed)
	_net.message_received.connect(_on_message)
	_net.connect_to_server(server_host)


func _build_world() -> void:
	# Placeholders generados en código: nada de assets hasta Fase 4.
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(40, 40)
	ground.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.18, 0.22, 0.18)
	ground.material_override = mat
	add_child(ground)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55, -35, 0)
	add_child(light)

	_camera = Camera3D.new()
	_camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	_camera.size = 22.0
	_camera.position = Vector3(12, 14, 12)
	add_child(_camera)
	_camera.look_at(Vector3.ZERO)


func _unhandled_input(event: InputEvent) -> void:
	# El mouse emula touch en desktop y el touch emula mouse en Android
	# (defaults de Godot), así que con esto cubrimos ambos.
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var target := _screen_to_ground(event.position)
		if target != Vector3.INF and _my_id != "":
			# Solo la intención. El servidor valida, encierra en bounds y mueve.
			_net.send_message("move", {"x": target.x, "z": target.z})


func _screen_to_ground(screen_pos: Vector2) -> Vector3:
	var origin := _camera.project_ray_origin(screen_pos)
	var dir := _camera.project_ray_normal(screen_pos)
	if absf(dir.y) < 0.0001:
		return Vector3.INF
	var t := -origin.y / dir.y
	if t < 0.0:
		return Vector3.INF
	return origin + dir * t


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
	if typeof(payload) != TYPE_DICTIONARY:
		return
	match msg_type:
		"welcome":
			_on_welcome(payload)
		"ping":
			if int(payload.get("v", -1)) != PROTOCOL_VERSION:
				_label.text = tr("net.error.version")
				return
			_net.send_message("pong", {"t": int(payload.t)})
		"enter":
			var p: Array = payload.p
			_spawn_player(p[0], Vector3(p[1], 0, p[2]))
		"exit":
			var id: String = payload.id
			if _players.has(id):
				_players[id].queue_free()
				_players.erase(id)
		"state":
			for tuple in payload.p:
				var id: String = tuple[0]
				if _players.has(id):
					_players[id].push_snapshot(Vector3(tuple[1], 0, tuple[2]))


func _on_welcome(payload: Dictionary) -> void:
	if int(payload.get("v", -1)) != PROTOCOL_VERSION:
		_label.text = tr("net.error.version")
		return
	_my_id = payload.id
	var snapshot_hz := float(payload.get("snapshotHz", 10))
	_interp_delay_ms = 2.0 * 1000.0 / snapshot_hz
	for tuple in payload.players:
		_spawn_player(tuple[0], Vector3(tuple[1], 0, tuple[2]))
	_label.text = "%s — %s" % [tr("net.status.connected"), tr("ui.tap_to_move")]


func _spawn_player(id: String, pos: Vector3) -> void:
	if _players.has(id):
		return
	var player: RemotePlayer = REMOTE_PLAYER.new()
	var color := Color(0.3, 0.6, 1.0) if id == _my_id else Color(0.7, 0.7, 0.7)
	player.setup(color, _interp_delay_ms, pos)
	_players_root.add_child(player)
	_players[id] = player
