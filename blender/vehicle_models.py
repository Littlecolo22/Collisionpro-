# Professional procedural vehicle scene for Blender 3.6+ / 4.x
# Run: blender --background --python vehicle_models.py
# Or open Blender > Scripting > New, paste this file, and press Run Script.
#
# Creates two separate, editable procedural models:
# 1) White four-door crew-cab pickup truck
# 2) Silver four-door modern midsize sedan (Camry-inspired, not an exact OEM replica)
#
# Units are meters. Vehicle length runs along X, width along Y, height along Z.
# Both vehicles face +X. The pickup is placed at Y=+4.4; sedan at Y=-4.4.
#
# (Indentation rebuilt from the PDF copy, which lost its line breaks. No other changes.)

import bpy
import math
from mathutils import Vector
from math import sin, cos, pi

# --------------------------- SCENE / UTILITIES ---------------------------

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        # Keep datablocks that may still be linked; scene is otherwise clean.
        pass


def set_units():
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 48
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    scene.view_settings.view_transform = 'AgX'


def material(name, color, metallic=0.0, roughness=0.35, coat=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get("Principled BSDF")
    bs.inputs["Base Color"].default_value = (*color, 1)
    bs.inputs["Metallic"].default_value = metallic
    bs.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bs.inputs:
        bs.inputs["Coat Weight"].default_value = coat
        bs.inputs["Coat Roughness"].default_value = 0.22
    return m


PAINT_WHITE = material("Pickup | Pearl White Automotive Paint", (0.88, 0.90, 0.92), 0.62, 0.22, 0.45)
PAINT_SILVER = material("Sedan | Metallic Silver Paint", (0.52, 0.57, 0.62), 0.78, 0.23, 0.48)
GLASS = material("Deep Tinted Automotive Glass", (0.018, 0.032, 0.045), 0.32, 0.12, 0.35)
GLASS_LIGHT = material("Headlamp Clear Lens", (0.72, 0.84, 0.95), 0.25, 0.10)
BLACK = material("Satin Black Polymer", (0.012, 0.016, 0.021), 0.12, 0.30)
RUBBER = material("Tire Rubber", (0.012, 0.014, 0.016), 0.0, 0.82)
TREAD = material("Raised Tire Tread", (0.025, 0.028, 0.030), 0.0, 0.9)
CHROME = material("Brushed Aluminum", (0.58, 0.63, 0.68), 0.88, 0.22)
DARK_METAL = material("Dark Graphite Metal", (0.055, 0.065, 0.075), 0.78, 0.28)
RED = material("Tail Lamp Red", (0.55, 0.012, 0.018), 0.22, 0.18)
LED = material("LED White", (0.82, 0.92, 1.0), 0.15, 0.12)
CALIPER = material("Performance Red Brake Caliper", (0.52, 0.018, 0.012), 0.35, 0.25)
INTERIOR = material("Interior Charcoal", (0.035, 0.042, 0.05), 0.08, 0.55)
SEAT = material("Leather Seat Graphite", (0.065, 0.072, 0.08), 0.0, 0.65)
FLOOR = material("Studio Floor", (0.12, 0.13, 0.15), 0.15, 0.48)


def assign(obj, mat):
    if mat:
        obj.data.materials.append(mat)
    return obj


def smooth(obj):
    if obj.type == 'MESH':
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def bevel(obj, width=0.05, segments=3):
    mod = obj.modifiers.new("Precision edge radii", 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.profile = 0.5
    obj.modifiers.new("Weighted corner normals", 'WEIGHTED_NORMAL')
    return obj


def cube(name, loc, scale, mat, bevel_width=0.04, rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rot:
        o.rotation_euler = rot
    assign(o, mat)
    if bevel_width:
        bevel(o, bevel_width, 4)
    return o


def uv_sphere(name, loc, scale, mat, segments=32, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(o, mat)
    smooth(o)
    return o


def cylinder(name, loc, radius, depth, mat, rotation=(pi/2, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    o = bpy.context.object
    o.name = name
    assign(o, mat)
    bevel(o, 0.012, 2)
    smooth(o)
    return o


def mesh_obj(name, verts, faces, mat, bevel_width=0.0):
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.materials.append(mat)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if bevel_width:
        bevel(obj, bevel_width, 3)
    return obj


def panel_between(name, a, b, width, depth, mat):
    a, b = Vector(a), Vector(b)
    mid = (a + b) / 2
    vec = b - a
    o = cube(name, mid, (vec.length, width, depth), mat, min(width, depth) * 0.22)
    o.rotation_euler[1] = -math.atan2(vec.z, vec.x)
    return o


def add_text_label(body, loc, size=0.22, mat=CHROME):
    cu = bpy.data.curves.new("LabelCurve", 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = 0.001
    ob = bpy.data.objects.new(body, cu)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    ob.rotation_euler = (pi/2, 0, 0)
    cu.materials.append(mat)
    return ob

# --------------------------- WHEELS ---------------------------

def wheel(name, x, y, z, radius, width, sporty=True, red_caliper=False):
    # Tire cylinder axis is Y.
    tire = cylinder(name + " | tire", (x, y, z), radius, width, RUBBER)
    # Sidewall ring and rim face on both sides.
    for side in (-1, 1):
        yy = y + side * (width/2 + 0.008)
        cylinder(name + " | sidewall ring", (x, yy, z), radius * 0.79, 0.018, TREAD)
        cylinder(name + " | alloy rim", (x, yy + side * 0.012, z), radius * 0.66, 0.035, CHROME)
        cylinder(name + " | inner rim", (x, yy + side * 0.034, z), radius * 0.51, 0.018, DARK_METAL)
        cylinder(name + " | hub", (x, yy + side * 0.05, z), radius * 0.14, 0.035, CHROME)
        # Spokes as slim radial boxes in the wheel plane.
        spoke_count = 5 if sporty else 10
        for i in range(spoke_count):
            ang = 2 * pi * i / spoke_count
            rmid = radius * 0.39
            sx = x + cos(ang) * rmid
            sz = z + sin(ang) * rmid
            sp = cube(name + " | alloy spoke", (sx, yy + side * 0.045, sz), (radius * 0.52, 0.025, radius * 0.075), CHROME, 0.018)
            sp.rotation_euler[1] = -ang
        # Lug nuts.
        for i in range(5):
            ang = 2 * pi * i / 5
            uv_sphere(name + " | lug nut", (x + cos(ang) * radius * 0.205, yy + side * 0.075, z + sin(ang) * radius * 0.205), (0.025, 0.014, 0.025), DARK_METAL, 12, 8)
    # Brake rotor and red caliper on visible outer side.
    for side in (-1, 1):
        cylinder(name + " | brake rotor", (x, y + side * (width * 0.24), z), radius * 0.49, 0.025, DARK_METAL)
    if red_caliper:
        cube(name + " | red brake caliper", (x + radius * 0.42, y + width * 0.34, z), (radius * 0.23, 0.075, radius * 0.38), CALIPER, 0.035)
    # Chunky tread blocks around circumference, each on tire surface.
    tread_count = 32 if radius > 0.42 else 28
    for i in range(tread_count):
        ang = 2 * pi * i / tread_count
        for lane in (-0.28, 0.28):
            px = x + cos(ang) * (radius * 0.985)
            pz = z + sin(ang) * (radius * 0.985)
            block = cube(name + " | tread lug", (px, y + lane * width, pz), (radius * 0.16, width * 0.23, 0.045), TREAD, 0.012)
            block.rotation_euler[1] = -ang
    return tire

# --------------------------- GLASS / LIGHTS / DETAIL ---------------------------

def window_panel(name, verts, mat=GLASS):
    faces = [tuple(range(len(verts)))]
    ob = mesh_obj(name, verts, faces, mat, 0.018)
    return ob


def lamp_cluster(name, loc, scale, mat):
    o = cube(name, loc, scale, mat, 0.045)
    return o


def seat(name, x, y, z):
    cube(name + " | cushion", (x, y, z), (0.72, 0.72, 0.20), SEAT, 0.10)
    back = cube(name + " | backrest", (x - 0.24, y, z + 0.52), (0.22, 0.72, 0.86), SEAT, 0.12)
    back.rotation_euler[1] = -0.10
    cube(name + " | headrest", (x - 0.32, y, z + 1.08), (0.25, 0.38, 0.24), INTERIOR, 0.08)


def build_pickup(origin_y=4.4):
    tag = "PICKUP | "
    oy = origin_y
    # Main lower body, hood, rear bed floor.
    cube(tag + "ladder chassis", (0.0, oy, 0.62), (5.55, 1.78, 0.30), DARK_METAL, 0.12)
    cube(tag + "lower body", (0.0, oy, 0.91), (5.65, 1.98, 0.72), PAINT_WHITE, 0.20)
    cube(tag + "hood", (1.80, oy, 1.48), (2.05, 1.98, 0.48), PAINT_WHITE, 0.18)
    cube(tag + "front fascia", (2.88, oy, 1.27), (0.22, 1.94, 0.66), PAINT_WHITE, 0.10)
    # Cab roof and pillars.
    cube(tag + "cab roof", (-0.22, oy, 2.63), (2.55, 1.88, 0.20), PAINT_WHITE, 0.18)
    # A-pillar, B-pillar, rear cab pillars on both sides.
    for side in (-1, 1):
        y = oy + side * 0.89
        panel_between(tag + "A pillar", (0.95, y, 1.55), (0.52, y, 2.58), 0.13, 0.13, PAINT_WHITE)
        panel_between(tag + "B pillar", (-0.30, y, 1.55), (-0.28, y, 2.60), 0.15, 0.14, PAINT_WHITE)
        panel_between(tag + "rear cab pillar", (-1.30, y, 1.55), (-1.37, y, 2.55), 0.16, 0.14, PAINT_WHITE)
        # Window glazing as flat inset polygon.
        window_panel(tag + "front side window", [
            (0.48, y - side * 0.025, 2.47), (0.82, y - side * 0.025, 1.73),
            (-0.18, y - side * 0.025, 1.73), (-0.18, y - side * 0.025, 2.47)])
        window_panel(tag + "rear side window", [
            (-0.40, y - side * 0.025, 2.47), (-0.40, y - side * 0.025, 1.73),
            (-1.18, y - side * 0.025, 1.73), (-1.22, y - side * 0.025, 2.47)])
        # Door handles and mirrors.
        for dx in (0.40, -0.82):
            cube(tag + "door handle", (dx, y + side * 0.075, 1.55), (0.28, 0.075, 0.075), BLACK, 0.025)
        cube(tag + "side mirror housing", (0.91, oy + side * 1.08, 1.91), (0.34, 0.24, 0.24), BLACK, 0.09)
        cube(tag + "mirror glass", (0.91, oy + side * 1.205, 1.92), (0.22, 0.018, 0.15), CHROME, 0.035)
        # Fender flares.
        for wx in (1.85, -1.95):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.48, minor_radius=0.075, major_segments=48, minor_segments=10,
                                             location=(wx, oy + side * 0.99, 0.91), rotation=(pi/2, 0, 0))
            flare = bpy.context.object
            flare.name = tag + "wheel arch flare"
            assign(flare, PAINT_WHITE)
            smooth(flare)
    # Front windshield and rear cab glass.
    window_panel(tag + "windshield", [
        (0.92, oy - 0.80, 1.76), (0.92, oy + 0.80, 1.76),
        (0.55, oy + 0.80, 2.48), (0.55, oy - 0.80, 2.48)])
    window_panel(tag + "rear cab glass", [
        (-1.36, oy - 0.78, 1.76), (-1.36, oy + 0.78, 1.76),
        (-1.36, oy + 0.78, 2.45), (-1.36, oy - 0.78, 2.45)])
    # Sunroof.
    cube(tag + "panoramic sunroof", (-0.22, oy, 2.744), (1.55, 1.22, 0.025), GLASS, 0.12)
    # Cargo bed floor and walls.
    cube(tag + "bed floor", (-2.65, oy, 1.25), (2.25, 1.72, 0.12), DARK_METAL, 0.04)
    for side in (-1, 1):
        cube(tag + "bed side wall", (-2.65, oy + side * 0.89, 1.60), (2.35, 0.16, 0.72), PAINT_WHITE, 0.10)
        cube(tag + "bed rail cap", (-2.65, oy + side * 0.89, 1.98), (2.35, 0.18, 0.07), CHROME, 0.025)
        # Inner bed ribs.
        for i in range(9):
            cube(tag + "bed inner rib", (-3.62 + i * 0.24, oy + side * 0.795, 1.60), (0.035, 0.025, 0.52), CHROME, 0.008)
    cube(tag + "tailgate", (-3.83, oy, 1.56), (0.16, 1.90, 0.72), PAINT_WHITE, 0.08)
    # Front grille, bumper and lighting.
    cube(tag + "black grille surround", (3.02, oy, 1.48), (0.10, 1.40, 0.48), BLACK, 0.08)
    for z in (1.31, 1.43, 1.55, 1.67):
        cube(tag + "grille horizontal slat", (3.085, oy, z), (0.035, 1.32, 0.025), DARK_METAL, 0.008)
    uv_sphere(tag + "oval grille badge", (3.115, oy, 1.49), (0.025, 0.18, 0.095), CHROME)
    cube(tag + "front bumper", (3.02, oy, 0.91), (0.32, 2.05, 0.25), PAINT_WHITE, 0.08)
    cube(tag + "lower bumper insert", (3.19, oy, 0.80), (0.08, 1.10, 0.12), BLACK, 0.035)
    for side in (-1, 1):
        lamp_cluster(tag + "LED headlamp", (3.06, oy + side * 0.79, 1.69), (0.13, 0.40, 0.25), GLASS_LIGHT)
        cube(tag + "headlamp dark housing", (3.00, oy + side * 0.79, 1.69), (0.07, 0.43, 0.29), DARK_METAL, 0.04)
        cube(tag + "fog lamp", (3.20, oy + side * 0.72, 0.94), (0.05, 0.20, 0.10), GLASS_LIGHT, 0.025)
        lamp_cluster(tag + "rear tail lamp", (-3.86, oy + side * 0.91, 1.57), (0.12, 0.16, 0.52), RED)
    # Wheels.
    for wx in (1.88, -2.05):
        wheel(tag + "20 inch five spoke wheel", wx, oy + 1.02, 0.88, 0.53, 0.34, True, True)
        wheel(tag + "opposite wheel", wx, oy - 1.02, 0.88, 0.53, 0.34, True, True)
    # Interior visible through glass.
    for sy in (-0.48, 0.48):
        seat(tag + "front seat", 0.10, oy + sy, 1.57)
        seat(tag + "rear seat", -1.05, oy + sy, 1.57)
    cube(tag + "dashboard", (0.85, oy, 1.76), (0.35, 1.55, 0.28), INTERIOR, 0.10)
    cube(tag + "steering wheel", (0.72, oy - 0.48, 1.94), (0.06, 0.38, 0.38), BLACK, 0.12)
    cube(tag + "center console", (-0.05, oy, 1.68), (0.75, 0.34, 0.20), INTERIOR, 0.07)
    add_text_label("CREW CAB 4x4", (-0.65, oy - 1.015, 1.10), 0.13, DARK_METAL)


def build_sedan(origin_y=-4.4):
    tag = "SEDAN | "
    oy = origin_y
    # Main lower shell and sculpted front/rear body volumes.
    cube(tag + "unibody chassis", (0.0, oy, 0.52), (4.85, 1.78, 0.28), DARK_METAL, 0.12)
    cube(tag + "lower body shell", (0.0, oy, 0.86), (4.95, 1.88, 0.58), PAINT_SILVER, 0.22)
    cube(tag + "front hood", (1.57, oy, 1.32), (1.80, 1.88, 0.30), PAINT_SILVER, 0.18)
    cube(tag + "front nose", (2.48, oy, 1.10), (0.18, 1.82, 0.43), PAINT_SILVER, 0.09)
    cube(tag + "rear trunk", (-1.92, oy, 1.29), (1.05, 1.82, 0.27), PAINT_SILVER, 0.14)
    # Roof and cabin.
    cube(tag + "roof", (-0.12, oy, 2.27), (2.10, 1.62, 0.16), PAINT_SILVER, 0.20)
    for side in (-1, 1):
        y = oy + side * 0.79
        panel_between(tag + "front A pillar", (0.95, y, 1.38), (0.57, y, 2.20), 0.11, 0.11, PAINT_SILVER)
        panel_between(tag + "B pillar", (-0.18, y, 1.40), (-0.17, y, 2.28), 0.12, 0.12, PAINT_SILVER)
        panel_between(tag + "rear C pillar", (-1.25, y, 1.38), (-1.05, y, 2.20), 0.12, 0.12, PAINT_SILVER)
        # Side glazing split into front and rear windows.
        window_panel(tag + "front side glass", [
            (0.48, y - side * 0.02, 2.14), (0.83, y - side * 0.02, 1.53),
            (-0.08, y - side * 0.02, 1.53), (-0.08, y - side * 0.02, 2.14)])
        window_panel(tag + "rear side glass", [
            (-0.28, y - side * 0.02, 2.14), (-0.28, y - side * 0.02, 1.53),
            (-1.08, y - side * 0.02, 1.53), (-0.96, y - side * 0.02, 2.14)])
        # Handles and mirror assemblies.
        for dx in (0.36, -0.75):
            cube(tag + "door handle", (dx, y + side * 0.06, 1.43), (0.25, 0.06, 0.06), CHROME, 0.022)
        cube(tag + "side mirror", (0.91, oy + side * 0.96, 1.78), (0.28, 0.22, 0.19), DARK_METAL, 0.07)
        cube(tag + "mirror cap", (0.91, oy + side * 1.075, 1.80), (0.22, 0.035, 0.13), PAINT_SILVER, 0.04)
        # Character line running the flank.
        panel_between(tag + "side character crease", (1.85, y, 1.17), (-2.10, y, 1.12), 0.025, 0.025, CHROME)
    window_panel(tag + "front windshield", [
        (0.94, oy - 0.72, 1.45), (0.94, oy + 0.72, 1.45),
        (0.58, oy + 0.72, 2.16), (0.58, oy - 0.72, 2.16)])
    window_panel(tag + "rear windshield", [
        (-1.26, oy - 0.72, 1.45), (-1.26, oy + 0.72, 1.45),
        (-1.02, oy + 0.72, 2.16), (-1.02, oy - 0.72, 2.16)])
    # Front grille and lower intake.
    cube(tag + "upper grille", (2.61, oy, 1.39), (0.08, 1.25, 0.18), BLACK, 0.06)
    cube(tag + "wide lower grille", (2.62, oy, 1.04), (0.09, 1.48, 0.36), BLACK, 0.07)
    for z in (0.91, 1.00, 1.09, 1.18):
        cube(tag + "grille horizontal blade", (2.68, oy, z), (0.025, 1.39, 0.018), DARK_METAL, 0.006)
    uv_sphere(tag + "front brand emblem", (2.70, oy, 1.40), (0.025, 0.17, 0.105), CHROME)
    # Headlight assemblies and DRL bars.
    for side in (-1, 1):
        cube(tag + "headlight housing", (2.52, oy + side * 0.70, 1.48), (0.20, 0.48, 0.22), DARK_METAL, 0.07)
        cube(tag + "LED headlight lens", (2.64, oy + side * 0.70, 1.49), (0.035, 0.40, 0.13), GLASS_LIGHT, 0.04)
        cube(tag + "DRL strip", (2.67, oy + side * 0.70, 1.41), (0.025, 0.33, 0.025), LED, 0.01)
        cube(tag + "front fog light", (2.69, oy + side * 0.68, 0.91), (0.035, 0.18, 0.08), GLASS_LIGHT, 0.02)
        cube(tag + "rear tail light", (-2.48, oy + side * 0.73, 1.40), (0.12, 0.34, 0.16), RED, 0.05)
    cube(tag + "front bumper lip", (2.65, oy, 0.78), (0.20, 1.78, 0.13), BLACK, 0.05)
    cube(tag + "rear bumper", (-2.48, oy, 0.88), (0.22, 1.85, 0.20), PAINT_SILVER, 0.07)
    # Door seam lines as thin dark strips.
    for side in (-1, 1):
        for dx in (0.12, -1.00):
            cube(tag + "door shut line", (dx, oy + side * 0.948, 1.08), (0.012, 0.012, 0.58), DARK_METAL, 0.003)
    # Wheels.
    for wx in (1.58, -1.70):
        wheel(tag + "multi spoke alloy wheel", wx, oy + 0.98, 0.69, 0.43, 0.27, False, False)
        wheel(tag + "opposite multi spoke wheel", wx, oy - 0.98, 0.69, 0.43, 0.27, False, False)
    # Cabin interior.
    for sy in (-0.43, 0.43):
        seat(tag + "front seat", 0.02, oy + sy, 1.34)
        seat(tag + "rear seat", -1.18, oy + sy, 1.34)
    cube(tag + "dashboard", (0.78, oy, 1.55), (0.32, 1.42, 0.24), INTERIOR, 0.08)
    cube(tag + "center console", (-0.02, oy, 1.43), (0.65, 0.30, 0.16), INTERIOR, 0.06)
    cube(tag + "steering wheel", (0.69, oy - 0.42, 1.72), (0.05, 0.34, 0.34), BLACK, 0.10)
    add_text_label("SPORT SEDAN", (-0.50, oy - 0.965, 0.96), 0.12, DARK_METAL)

# --------------------------- STUDIO / CAMERA ---------------------------

def area_light(name, loc, power, size, color=(1, 1, 1), target=(0, 0, 0)):
    bpy.ops.object.light_add(type='AREA', location=loc)
    o = bpy.context.object
    o.name = name
    o.data.energy = power
    o.data.shape = 'DISK'
    o.data.size = size
    o.data.color = color
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()
    return o


def setup_studio():
    cube("Studio ground", (0, 0, 0.05), (200, 200, 0.10), FLOOR, 0.02)
    world = bpy.context.scene.world
    world.color = (0.20, 0.20, 0.20)
    if world.use_nodes:
        world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.22, 0.24, 0.28, 1)
        world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
    area_light("Key softbox", (3, 8, 11), 1800, 8, (1.0, 0.93, 0.85), (0, 0, 0))
    area_light("Front fill", (8, -7, 6), 1300, 7, (0.80, 0.88, 1.0), (0, 0, 0))
    area_light("Rear rim", (-7, 3, 8), 2200, 6, (1.0, 1.0, 1.0), (0, 0, 0))
    area_light("Top strip", (0, -1, 12), 1600, 5, (1.0, 1.0, 1.0), (0, 0, 0))
    bpy.ops.object.camera_add(location=(12, -17, 11))
    cam = bpy.context.object
    cam.name = "Studio Camera | Both Vehicles"
    target = Vector((0, 0, 1.25))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 52
    bpy.context.scene.camera = cam
    # Camera clipping and depth of field off for a crisp product render.
    cam.data.dof.use_dof = False


def organize_collections():
    # Group objects by their generated name prefixes for easy scene navigation.
    root = bpy.context.scene.collection
    groups = {}
    for obj in list(bpy.context.scene.objects):
        if obj.name.startswith("PICKUP"):
            key = "01 | WHITE CREW-CAB PICKUP"
        elif obj.name.startswith("SEDAN"):
            key = "02 | SILVER FOUR-DOOR SEDAN"
        elif obj.name.startswith("Studio") or obj.name.startswith("Key") or obj.name.startswith("Front fill") or obj.name.startswith("Rear rim") or obj.name.startswith("Top strip") or obj.name.startswith("Studio Camera"):
            key = "03 | STUDIO"
        else:
            key = "04 | DETAILS & LABELS"
        if key not in groups:
            col = bpy.data.collections.new(key)
            root.children.link(col)
            groups[key] = col
        for old in list(obj.users_collection):
            old.objects.unlink(obj)
        groups[key].objects.link(obj)


def main():
    clear_scene()
    set_units()
    build_pickup(4.4)
    build_sedan(-4.4)
    setup_studio()
    organize_collections()
    # Select camera-free neutral state; set a useful viewport mode.
    bpy.ops.object.select_all(action='DESELECT')
    for area in bpy.context.screen.areas if bpy.context.screen else []:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 18
    # Save a native .blend next to the script when run from Blender.
    # Uncomment the next line to save automatically:
    # bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath("//vehicle_models.blend"))
    print("Finished: professional procedural pickup and sedan models created.")


if __name__ == "__main__":
    main()
