export async function probarProveedoresAudio(proveedores, onError = () => {}) {
  for (const proveedor of proveedores) {
    if (proveedor.disponible) {
      try {
        if (!(await proveedor.disponible())) continue
      } catch (error) {
        onError(proveedor.nombre, error)
        continue
      }
    }
    try {
      const audio = await proveedor.obtener()
      if (audio?.urlAudio) return audio
    } catch (error) {
      onError(proveedor.nombre, error)
    }
  }
  return null
}
