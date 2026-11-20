# Path-traced (Blender Cycles, CPU) renders of the exported GLBs + Workbench orthographic five-view sheets + .blend.
# usage: bpyenv/bin/python3 wip/render_cycles.py <export_dir> <out_dir> [samples] [scale]
import bpy, sys, math, os, mathutils
from mathutils import Vector

EXP, OUT = sys.argv[1], sys.argv[2]
SAMPLES = int(sys.argv[3]) if len(sys.argv) > 3 else 48
SCALE = int(sys.argv[4]) if len(sys.argv) > 4 else 100
ONLY = sys.argv[5].split(',') if len(sys.argv) > 5 else None
MASK = os.environ.get('MASK') == '1'  # framing check: transparent film, no floor
os.makedirs(OUT, exist_ok=True)

CARS = {
  # key: (glb, collection, prefix, paint (base, metallic, roughness), spec 3/4 side (+1 right / -1 left), az, el)
  'f150': ('f150.glb', 'pickup', 'PICKUP', ((0.88, 0.90, 0.92), 0.62, 0.22), 1, 42, 37),
  'camry': ('camry.glb', 'sedan', 'SEDAN', ((0.52, 0.57, 0.62), 0.78, 0.23), -1, 38, 25),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.unit_settings.system = 'METRIC'; sc.unit_settings.scale_length = 1.0
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
except Exception: pass
sc.cycles.max_bounces = 8; sc.cycles.glossy_bounces = 4; sc.cycles.transmission_bounces = 8; sc.cycles.caustics_reflective = False; sc.cycles.caustics_refractive = False
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1800, 1200, SCALE
sc.render.image_settings.file_format = 'PNG'
try: sc.view_settings.view_transform = 'AgX'
except Exception: sc.view_settings.view_transform = 'Filmic'
try: sc.view_settings.look = 'AgX - Medium High Contrast'
except Exception: pass

def coll(name):
    c = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if c.name not in sc.collection.children: sc.collection.children.link(c)
    return c

def principled(name, base, metal=0.0, rough=0.5, coat=0.0, coat_r=0.2, trans=0.0, alpha=1.0, emit=None, emit_s=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat; b.inputs['Coat Roughness'].default_value = coat_r
    b.inputs['Transmission Weight'].default_value = trans; b.inputs['Alpha'].default_value = alpha
    if emit: b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = emit_s
    return m

def tune_materials(mats_, paint):
    # The GLB already carries PBR materials (and the lamp/grille/tyre textures); these are the Cycles-specific upgrades.
    for m in mats_:
        if m.get('_tuned'): continue
        n = m.name.split(' | ')[-1].lower(); nt = m.node_tree if m.use_nodes else None
        b = nt.nodes.get('Principled BSDF') if nt else None
        if not b: continue
        if n.startswith('paint_body'):
            base, metal, rough = paint
            b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
            b.inputs['Coat Weight'].default_value = 0.45; b.inputs['Coat Roughness'].default_value = 0.22
        elif n.startswith('glass'):
            b.inputs['Base Color'].default_value = (0.05, 0.06, 0.07, 1); b.inputs['Transmission Weight'].default_value = 1.0
            b.inputs['Roughness'].default_value = 0.0; b.inputs['IOR'].default_value = 1.5; b.inputs['Alpha'].default_value = 1.0
            m.blend_method = 'OPAQUE' if hasattr(m, 'blend_method') else None
        elif n.startswith('black_satin') or n.startswith('black_trim'):
            b.inputs['Base Color'].default_value = (0.025, 0.026, 0.028, 1); b.inputs['Roughness'].default_value = 0.55; b.inputs['Metallic'].default_value = 0
        elif n.startswith('black_gloss'):
            b.inputs['Base Color'].default_value = (0.01, 0.01, 0.012, 1); b.inputs['Roughness'].default_value = 0.12; b.inputs['Coat Weight'].default_value = 0.6
        elif n.startswith('interior'):
            b.inputs['Base Color'].default_value = (0.035, 0.036, 0.04, 1); b.inputs['Roughness'].default_value = 0.7; b.inputs['Metallic'].default_value = 0
        elif n.startswith('brake_caliper'):
            b.inputs['Base Color'].default_value = (0.55, 0.03, 0.03, 1); b.inputs['Roughness'].default_value = 0.3; b.inputs['Coat Weight'].default_value = 0.5
        elif n.startswith('wheel_alloy_machined') or n.startswith('chrome'):
            b.inputs['Metallic'].default_value = 1; b.inputs['Roughness'].default_value = 0.16 if 'chrome' in n else 0.24
            try: b.inputs['Anisotropic'].default_value = 0.0 if 'chrome' in n else 0.5
            except Exception: pass
        elif n.startswith('tire'):
            b.inputs['Roughness'].default_value = 0.85; b.inputs['Base Color'].default_value = (0.018, 0.018, 0.019, 1)
        m['_tuned'] = 1

def import_car(key):
    glb, cname, prefix, paint, *_ = CARS[key]
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(EXP, glb))
    new = [o for o in bpy.data.objects if o not in before]
    c = coll(cname)
    for o in new:
        for uc in list(o.users_collection): uc.objects.unlink(o)
        c.objects.link(o)
        o.name = f'{prefix} | {o.name}'
        if o.type == 'MESH':
            for p in o.data.polygons: p.use_smooth = True
    mine = set()
    for o in new:
        if o.type != 'MESH': continue
        for sl in o.material_slots:
            if not sl.material: continue
            if sl.material.get('_owner') not in (None, prefix):
                sl.material = sl.material.copy()
            sl.material['_owner'] = prefix; mine.add(sl.material)
    for m in mine:
        base = m.name.split(' | ')[-1].split('.')[0]
        m.name = f'{prefix} | {base}'
    tune_materials(list(mine), paint)
    return c, [o for o in new if o.type == 'MESH']

def bbox(objs):
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3)
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    return mn, mx

# ---------- studio ----------
st = coll('studio')
def link(o):
    for uc in list(o.users_collection): uc.objects.unlink(o)
    st.objects.link(o)
world = bpy.data.worlds.new('studio_world'); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.42, 0.42, 0.42, 1); bg.inputs[1].default_value = 0.45
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0)); floor = bpy.context.object; floor.name = 'STUDIO | floor'; link(floor)
floor_m = principled('STUDIO | floor_gray', (0.30, 0.30, 0.30), 0, 0.45)
floor.data.materials.append(floor_m)
# curved cyclorama behind (simple big vertical plane far away, same gray)
bpy.ops.mesh.primitive_plane_add(size=60, location=(-16, 0, 15), rotation=(0, math.radians(90), 0)); cyc = bpy.context.object; cyc.name = 'STUDIO | backdrop'; link(cyc); cyc.data.materials.append(floor_m); cyc.hide_render = True

def area(name, loc, energy, size, color, shape='DISK', size_y=None):
    L = bpy.data.lights.new(name, 'AREA'); L.energy = energy; L.color = color; L.shape = shape; L.size = size
    if size_y: L.size_y = size_y
    o = bpy.data.objects.new(name, L); o.location = loc; st.objects.link(o)
    d = Vector((0, 0, 0.6)) - Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o
STUDIO_LIGHTS = [
  area('STUDIO | key_softbox_warm', (3.5, -5.5, 5.5), 1500, 3.2, (1.0, 0.95, 0.88)),
  area('STUDIO | fill_front_cool', (7.0, 2.5, 2.2), 500, 3.0, (0.86, 0.92, 1.0)),
  area('STUDIO | rim_rear', (-7.0, 3.0, 3.5), 1300, 2.6, (1.0, 1.0, 1.0)),
  area('STUDIO | strip_overhead', (0, 0, 6.5), 800, 7.0, (1, 1, 1), 'RECTANGLE', 0.6),
]
# showroom set (hidden by default): polished dark floor, rows of overhead strip lights, darker world
SHOW = []
show_floor_m = principled('STUDIO | showroom_floor_polished', (0.05, 0.05, 0.055), 0, 0.06, coat=0.6, coat_r=0.03)
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0.0005)); sf = bpy.context.object; sf.name = 'STUDIO | showroom_floor'; link(sf); sf.data.materials.append(show_floor_m); SHOW.append(sf)
for i, x in enumerate([-4.5, -1.5, 1.5, 4.5]):
    for j, y in enumerate([-2.2, 2.2]):
        o = area(f'STUDIO | showroom_strip_{i}{j}', (x, y, 5.2), 900, 0.25, (1, 1, 1), 'RECTANGLE', 3.5)
        o.rotation_euler = (0, 0, math.radians(90)); SHOW.append(o)
        bpy.ops.mesh.primitive_plane_add(size=1, location=(x, y, 5.21)); e = bpy.context.object; e.scale = (0.12, 1.75, 1); e.name = f'STUDIO | showroom_strip_panel_{i}{j}'; link(e)
        em = bpy.data.materials.get('STUDIO | strip_emit') or principled('STUDIO | strip_emit', (1, 1, 1), emit=(1, 1, 1), emit_s=12)
        e.data.materials.append(em); e.visible_camera = True; SHOW.append(e)
for o in SHOW: o.hide_render = True; o.hide_viewport = True

def set_showroom(on):
    for o in SHOW: o.hide_render = not on
    floor.hide_render = on; cyc.hide_render = True
    floor_m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.30, 0.30, 0.30, 1)
    bg.inputs[1].default_value = 0.12 if on else 0.45
    for L in STUDIO_LIGHTS: L.data.energy = L.data['e0'] * (0.35 if on else 1) if 'e0' in L.data else L.data.energy
for L in STUDIO_LIGHTS: L.data['e0'] = L.data.energy

# ---------- cameras ----------
cam_data = bpy.data.cameras.new('render_cam'); cam_data.lens = 52; cam_data.sensor_width = 36
cam = bpy.data.objects.new('STUDIO | camera', cam_data); st.objects.link(cam); sc.camera = cam

def frame(objs, az_deg, el_deg, side, margin=0.86, ortho=False, aspect=1.5):
    mn, mx = bbox(objs); ctr = (mn + mx) / 2
    az, el = math.radians(az_deg), math.radians(el_deg)
    # Blender: front = +X, car's right side = -Y (glTF +Z), up = +Z
    d = Vector((math.cos(el) * math.cos(az), -side * math.cos(el) * math.sin(az), math.sin(el))).normalized()
    fwd = -d; right = fwd.cross(Vector((0, 0, 1)))
    if right.length < 1e-3: right = Vector((0, -1, 0))  # top view: nose points up the sheet... set below
    if el_deg >= 89.9: right = Vector((1, 0, 0))
    right.normalize(); up = right.cross(fwd).normalized()
    corners = [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]
    if ortho:
        cam_data.type = 'ORTHO'
        w = max(abs((c - ctr).dot(right)) for c in corners) * 2; h = max(abs((c - ctr).dot(up)) for c in corners) * 2
        cam_data.ortho_scale = max(w, h * aspect) / margin; dist = 20
    else:
        cam_data.type = 'PERSP'
        tanW = (cam_data.sensor_width / 2) / cam_data.lens * margin; tanH = tanW / aspect
        dist = max(max((c - ctr).dot(d) + abs((c - ctr).dot(right)) / tanW, (c - ctr).dot(d) + abs((c - ctr).dot(up)) / tanH) for c in corners)
    cam.location = ctr + d * dist
    cam.rotation_euler = (mathutils.Matrix((right, up, -fwd)).transposed()).to_euler()

def show_only(c):
    for k in CARS:
        cc = bpy.data.collections.get(CARS[k][1])
        if cc: cc.hide_render = (cc != c)

imported = {}
for key in CARS:
    imported[key] = import_car(key)

VIEWS = lambda key: [
    ('front_three_quarter', CARS[key][5], CARS[key][6], CARS[key][4]),
    ('rear_three_quarter', 180 - CARS[key][5], 22, -CARS[key][4]),
    ('front', 0, 6, 1), ('rear', 180, 6, 1), ('left_side', 90, 4, -1), ('right_side', 90, 4, 1),
]
import time
for key in CARS:
    if ONLY and key not in ONLY: continue
    c, objs = imported[key]; show_only(c)
    vis = [o for o in objs]
    sc.render.engine = 'CYCLES'; set_showroom(False)
    if MASK: floor.hide_render = True; sc.render.film_transparent = True
    for name, az, el, side in VIEWS(key):
        frame(vis, az, el, side, margin=0.98 if 'side' in name else 1.1)
        sc.render.filepath = os.path.join(OUT, f'{key}_{name}.png'); t = time.time(); bpy.ops.render.render(write_still=True); print('rendered', key, name, round(time.time() - t, 1), 's', flush=True)
    if MASK: continue
    # showroom variant (front 3/4)
    set_showroom(True)
    frame(vis, CARS[key][5], 18, CARS[key][4], margin=1.15)
    sc.render.filepath = os.path.join(OUT, f'{key}_showroom.png'); bpy.ops.render.render(write_still=True); print('rendered', key, 'showroom', flush=True)
    set_showroom(False)
    if os.path.exists(os.path.join(OUT, f'{key}_ortho_scales.txt')): os.remove(os.path.join(OUT, f'{key}_ortho_scales.txt'))
    # orthographic five-view sheet panels: Cycles (Workbench needs a GPU), even light, no floor, Freestyle outlines
    floor.hide_render = True; cyc.hide_render = True
    bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 1.0
    for L in STUDIO_LIGHTS: L.data.energy = L.data['e0'] * 0.25
    sc.render.use_freestyle = True
    try:
        ls = sc.view_layers[0].freestyle_settings.linesets[0].linestyle; ls.thickness = 1.2; ls.color = (0.05, 0.08, 0.15)
    except Exception as e: print('freestyle', e)
    sc.cycles.samples = max(16, SAMPLES // 3)
    for name, az, el, side in [('ortho_front', 0, 0, 1), ('ortho_rear', 180, 0, 1), ('ortho_left', 90, 0, -1), ('ortho_right', 90, 0, 1), ('ortho_top', 0, 90, 1)]:
        frame(vis, az, el, side, margin=0.92, ortho=True)
        sc.render.filepath = os.path.join(OUT, f'{key}_{name}.png'); bpy.ops.render.render(write_still=True); print('rendered', key, name, flush=True)
        open(os.path.join(OUT, f'{key}_ortho_scales.txt'), 'a').write(f"{name.split('_')[1]} {cam_data.ortho_scale}\n")
    sc.render.use_freestyle = False; sc.cycles.samples = SAMPLES
    bg.inputs[0].default_value = (0.42, 0.42, 0.42, 1); bg.inputs[1].default_value = 0.45
    for L in STUDIO_LIGHTS: L.data.energy = L.data['e0']
    floor.hide_render = False; cam_data.type = 'PERSP'

if MASK: sys.exit(0)
# .blend with both vehicles side by side, collections pickup / sedan / studio
if not ONLY:
    for k in CARS: bpy.data.collections[CARS[k][1]].hide_render = False
    for o in imported['camry'][1]:
        if o.parent is None: o.location.y += 3.2
    for o in bpy.data.collections['sedan'].objects:
        if o.parent is None: o.location.y += 3.2 if o.type != 'MESH' else 0
    sc.render.engine = 'CYCLES'
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'rr_auto_vehicles.blend'), compress=True)
    print('saved blend')
