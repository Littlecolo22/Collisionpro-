# Runs vehicle_models.py unchanged, saves vehicle_models.blend, renders one Cycles image from its studio camera.
import bpy, os, runpy, sys, time
HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = int(sys.argv[1]) if len(sys.argv) > 1 else 48
t = time.time()
runpy.run_path(os.path.join(HERE, 'vehicle_models.py'), run_name='__main__')
print('script ran in', round(time.time() - t, 1), 's; objects:', len(bpy.data.objects), flush=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'vehicle_models.blend'), compress=True)
sc = bpy.context.scene
sc.cycles.device = 'CPU'; sc.cycles.samples = SAMPLES; sc.cycles.use_denoising = True
sc.render.filepath = os.path.join(HERE, 'vehicle_models_render.png')
t = time.time(); bpy.ops.render.render(write_still=True); print('rendered in', round(time.time() - t, 1), 's', flush=True)
