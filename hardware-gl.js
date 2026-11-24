let softwareRenderer = false;

export function getHardwareContext(canvas, type, options) {
  if (softwareRenderer) return null;
  const gl = canvas.getContext(type, { ...options, failIfMajorPerformanceCaveat: true });
  const info = gl?.getExtension("WEBGL_debug_renderer_info");
  if (info) {
    softwareRenderer = /swiftshader|llvmpipe|software/i.test(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  }
  return softwareRenderer ? null : gl;
}
