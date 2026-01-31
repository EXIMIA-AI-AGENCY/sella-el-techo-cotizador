# Guía de Despliegue - Sella El Techo Wizard

Esta aplicación está diseñada para funcionar en **Google Apps Script**.

## Pasos para desplegar:

1. **Crear Proyecto GAS**:
   - Ve a [script.google.com](https://script.google.com/).
   - Haz clic en **+ Nuevo proyecto**.
   - Renombra el proyecto a "Cotizador Sella El Techo".

2. **Copiar Archivos**:
   - **Code.gs**:
     - Abre el archivo `Code.gs` generado en tu carpeta local.
     - Copia todo el contenido.
     - Pégalo en el archivo `Code.gs` del editor de Google, reemplazando lo que haya.
   - **Index.html**:
     - En el editor de Google, haz clic en el **+** (Añadir archivo) > **HTML**.
     - Nómbralo `Index` (sin .html, Google lo añade solo).
     - Copia todo el contenido de tu archivo local `Index.html`.
     - Pégalo en el nuevo archivo del editor.

3. **Probar**:
   - Haz clic en **Implementar** (Deploy) > **Prueba de implementaciones** (Test deployments).
   - Selecciona el tipo **Aplicación web**.
   - Haz clic en la URL proporcionada bajo "Aplicación web" (termina en `/dev`).
   - Verifica que el wizard funcione correctamente.

4. **Publicar**:
   - Haz clic en **Implementar** > **Nueva implementación**.
   - Tipo: **Aplicación web**.
   - Descripción: "Versión 1.0".
   - Ejecutar como: **Yo** (Me).
   - Quién tiene acceso: **Cualquier persona** (Anyone) (importante para que los clientes lo vean sin loguearse).
   - Haz clic en **Implementar**.
   - Copia la URL final (termina en `/exec`). ¡Ese es el enlace para tus clientes!

## Pruebas Locales
Actualmente puedes ver el diseño visual en tu servidor local (`http://localhost:8080`), pero ten en cuenta que:
- La lógica de navegación y cálculo funcionará (es JavaScript del lado del cliente).
- Si añadimos funciones de backend en `Code.gs` (como enviar emails), esas **NO** funcionarán en `localhost`. Solo funcionarán cuando esté desplegado en Google.

# Integración de IA (Deep Learning)

Actualmente, el sistema utiliza **Google Solar API** para la detección de techos "en vivo". Esto funciona inmediatamente sin necesidad de entrenamiento.

Hemos añadido una arquitectura para un **Modelo Propio (DeepLabv3+)** en la carpeta `roof_segmentation/`.

### Diferencias Clave:
| Característica | Google Solar API (Actual) | Modelo Propio (DeepLabv3+) |
| :--- | :--- | :--- |
| **Disponibilidad** | Inmediata (funciona ya) | Requiere Entrenamiento (futuro) |
| **Costo** | Pago por uso a Google | Gratis (una vez entrenado) |
| **Personalización** | Genérico | Específico para techos de PR |
| **Infraestructura** | Nube de Google | Requiere Servidor GPU propio |

### Pasos para activar el Modelo Propio:
1. **Recolección de Datos**: Llenar `data/raw` con miles de imágenes aéreas y `data/processed` con sus máscaras.
2. **Entrenamiento**: Ejecutar `train.py` hasta obtener un IoU > 79%.
3. **Despliegue**: Subir el modelo entrenado a un servidor GPU (AWS/GCP) usando `api.py`.
4. **Conexión**: Cambiar en `map_logic.js` la llamada de Google Solar a tu nueva API.

**Recomendación:** Mantener Google Solar API para la versión "en vivo" actual mientras se recolectan datos para entrenar el modelo propio en segundo plano.
