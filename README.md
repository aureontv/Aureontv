# Control Hub

Plataforma de control multidispositivo diseñada para incorporar distintas marcas, modelos y protocolos mediante adaptadores. No promete compatibilidad automática con todo aparato: cada integración debe verificar el modelo y sus capacidades.

## Ya implementado
- Panel web responsive y registro local inicial.
- Esquema Supabase para dispositivos, habitaciones y cola de comandos; RLS habilitada.
- Catálogo inicial de protocolos y fabricantes objetivo en `integrations/catalog.json`.
- Contrato común para adaptadores en `integrations/adapter-contract.ts`.
- Diseño del puente doméstico seguro en `bridge/README.md`.
- Edge Function `device-command` desplegada con JWT obligatorio. Verifica el usuario, aplica RLS y valida comandos permitidos antes de encolarlos.

## Arquitectura
1. Aplicación web y autenticación Supabase.
2. Registro por usuario y políticas RLS.
3. API autenticada que encola comandos tipados.
4. Adaptadores de fabricante/protocolo para ejecutar órdenes reales.
5. Puente doméstico opcional, con conexión saliente TLS, para equipos accesibles solo en la red local.
6. Confirmación de entrega y estado real reportados por el adaptador.

## Importante: estado de ejecución
La función actual **encola** comandos; todavía no los envía a un televisor, aire acondicionado u otro equipo. Falta construir y emparejar el puente doméstico y desarrollar/probar adaptadores reales. El catálogo indica objetivos de integración, no soporte verificado de todos los modelos.

## Seguridad
- Nunca colocar secretos de fabricante, claves secretas de Supabase o credenciales de puente en el navegador.
- Cada operación requiere JWT y respeta RLS.
- Solo se aceptan tipos de comando explícitos y valores acotados.
- Emparejamiento de dispositivos debe ser explícito y revocable.
- No exponer puertos de entrada del router; el puente debe iniciar conexiones TLS salientes.

## Próximas etapas
1. Conectar la interfaz al inventario Supabase con Auth.
2. Construir el puente doméstico y su emparejamiento.
3. Implementar adaptadores iniciales para estándares con ecosistema abierto (Matter y Home Assistant) y validar equipos concretos.
4. Añadir integraciones oficiales de fabricantes según disponibilidad de API.
5. Mostrar capacidades reales y estado verificado de cada equipo.
