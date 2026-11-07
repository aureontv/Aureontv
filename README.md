# Control Hub

Centro de control multidispositivo. Este repositorio comienza con una interfaz web responsive y un registro local de equipos; todavía no envía órdenes a dispositivos físicos.

## Estado actual
- Panel adaptable a celular, tablet y computadora.
- Registro local de equipos y habitaciones.
- Estados marcados explícitamente como pendientes (no se inventa conectividad).
- Base visual preparada para integrar proveedores y un servicio remoto.

## Arquitectura prevista
1. Web app: interfaz y autenticación Supabase.
2. Supabase: usuarios, dispositivos vinculados, permisos, comandos y auditoría.
3. API remota: valida la sesión y permisos antes de aceptar una orden.
4. Conector por fabricante: APIs oficiales o protocolos documentados para cada modelo.
5. Puente doméstico opcional: agente/hub dentro de la red local para equipos que no admiten control remoto seguro desde la nube.

## Límites importantes
No existe un protocolo universal que permita controlar cualquier aparato. La compatibilidad depende de marca, modelo, firmware, red y permisos. Algunos dispositivos requieren una app oficial, un hub compatible o un puente local que permanezca encendido. Los equipos no compatibles no se podrán controlar solo por estar conectados a Internet.

## Desarrollo local
Abre index.html en un navegador o sirve la carpeta con un servidor estático. Los equipos añadidos en esta versión se guardan únicamente en el navegador mediante almacenamiento local.

## Próximas etapas
- Conectar Supabase Auth y sincronizar el inventario por usuario.
- Aplicar RLS y auditoría de comandos.
- Implementar conectores concretos (empezando por el modelo exacto de TV LG).
- Crear un puente doméstico con emparejamiento explícito, TLS y lista de dispositivos permitidos.
- Incorporar estado real, telemetría mínima y comandos con confirmación.

Nunca poner claves secretas de servidor o service role en el navegador. Usar variables de entorno del servidor y políticas de mínimo privilegio.