class_name RemotePlayer
extends Node3D
## Cápsula placeholder posicionada por snapshots del servidor.
## Interpola entre los dos snapshots que rodean al tiempo de render
## (render = ahora - delay). Sin extrapolación ni predicción (Fase 0).

var _buffer: Array[Dictionary] = []  # [{t: msec local al recibir, pos: Vector3}]
var _delay_ms := 200.0


func setup(color: Color, delay_ms: float, initial_pos: Vector3) -> void:
	_delay_ms = delay_ms
	position = initial_pos
	_buffer.append({"t": Time.get_ticks_msec(), "pos": initial_pos})

	var mesh := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.4
	capsule.height = 1.6
	mesh.mesh = capsule
	mesh.position.y = 0.8
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	mesh.material_override = material
	add_child(mesh)


func push_snapshot(pos: Vector3) -> void:
	_buffer.append({"t": Time.get_ticks_msec(), "pos": pos})
	while _buffer.size() > 30:
		_buffer.pop_front()


func _process(_delta: float) -> void:
	if _buffer.is_empty():
		return
	var render_t := Time.get_ticks_msec() - _delay_ms
	# Buscar el par de snapshots que rodea a render_t.
	var newest: Dictionary = _buffer[-1]
	if render_t >= float(newest.t):
		position = newest.pos  # sin extrapolar: se queda en el último dato
		return
	for i in range(_buffer.size() - 1, 0, -1):
		var b: Dictionary = _buffer[i]
		var a: Dictionary = _buffer[i - 1]
		if render_t >= float(a.t):
			var span := float(b.t) - float(a.t)
			var alpha: float = 0.0 if span <= 0.0 else (render_t - float(a.t)) / span
			position = (a.pos as Vector3).lerp(b.pos, clampf(alpha, 0.0, 1.0))
			return
	position = _buffer[0].pos
