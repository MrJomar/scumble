# Interfaz Studio — fase 1

Dos temas CSS propios, Studio Light y Studio Dark, para Scumble. No contienen código ejecutable, fuentes externas ni imágenes de terceros. No cambian las herramientas ni el motor de edición.

## Probar sin recompilar

1. Descarga los directorios `plugins/skin_studio_light` y `plugins/skin_studio_dark` de esta rama.
2. En Scumble instalado, abre Settings > Appearance > Open folder.
3. Copia ambos directorios completos en esa carpeta (cada uno contiene plugin.json y skin.css).
4. Pulsa Reload skins y selecciona Studio Light o Studio Dark.
5. Para revertir, selecciona View > Skin > Default.

## Alcance

Esta fase modifica colores, bordes, estados activos, tipografía del sistema, pestañas y presentación de controles. No reorganiza los paneles, no traduce la interfaz y no cambia los flujos de IA ni de exportación. El actualizador sigue siendo el original.

## Validación pendiente en Windows

Abrir ambos temas; revisar texto, capas, ajustes de color, granulado, quitar fondo, exportación, diálogos, menús y cambio al tema original. Ejecutar `node tools/skins_test.js` y `python tools/skins_test.py` en un entorno con las dependencias del proyecto. No distribuir una compilación hasta completar estas pruebas.
