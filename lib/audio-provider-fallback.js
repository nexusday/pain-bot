export async function probarProveedoresAudio(proveedores, onError = () => {}) {
  for (const proveedor of proveedores) {
    try {
      const audio = await proveedor.obtener()
      if (audio?.urlAudio) return audio
    } catch (error) {
      onError(proveedor.nombre, error)
    }
  }
  return null
}
