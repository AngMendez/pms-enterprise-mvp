# Despliegue gratuito

## Opcion recomendada: Render Free Web Service

Render es la opcion mas simple para este MVP porque el proyecto necesita un backend Node.js. GitHub Pages solo sirve contenido estatico y no ejecutaria la API `/api`.

### Pasos

1. Subir este repositorio a GitHub.
2. Entrar a Render y crear un **New Web Service**.
3. Conectar el repositorio.
4. Configurar:
   - Root Directory: `pms-enterprise`
   - Runtime: `Node`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: `Free`
5. Deploy.

La app quedara disponible en una URL similar a:

```text
https://pms-enterprise-mvp.onrender.com
```

## Conectar PostgreSQL

La app usa PostgreSQL automaticamente cuando existe la variable de entorno `DATABASE_URL`.

### Opcion gratuita recomendada para la base

Para un demo gratuito, crea una base PostgreSQL administrada en un proveedor con free tier y copia su connection string. Algunas opciones comunes son Neon, Supabase o Render Postgres si tu cuenta tiene plan disponible.

### Pasos en Render

1. Entra al servicio `pms-enterprise-mvp`.
2. Abre **Environment**.
3. Agrega:
   - Key: `DATABASE_URL`
   - Value: connection string de PostgreSQL.
4. Si tu proveedor exige SSL, no agregues nada mas; la app activa SSL automaticamente para URLs no locales.
5. Redeploy.

Puedes verificar la conexion abriendo:

```text
https://pms-enterprise-mvp.onrender.com/api/health
```

Debe responder:

```json
{
  "status": "ok",
  "storage": "postgres"
}
```

### Persistencia implementada en el MVP

Esta version guarda el estado completo del MVP en la tabla `pms_app_state` como `jsonb`. Es una decision transicional para conservar reservas, folios e inventario entre reinicios sin reescribir todos los bounded contexts todavia.

El modelo relacional enterprise sigue definido en `docs/schema.sql` y debe convertirse en migraciones reales en la siguiente fase.

### Limitaciones de la version gratuita

- El servicio puede dormir cuando no recibe trafico y tardar en despertar.
- Si no configuras `DATABASE_URL`, el almacenamiento vuelve a memoria y los datos se reinician cuando el proceso reinicia.
- La persistencia JSONB es suficiente para demo, pero no reemplaza el modelo relacional final para operacion real.

## Alternativas gratuitas

- **Vercel Hobby:** excelente para frontend y funciones serverless, pero este MVP esta hecho como servidor Node persistente. Requiere adaptar la API.
- **GitHub Pages:** sirve para publicar solo frontend estatico. No sirve para este MVP completo porque no ejecuta backend.
- **Koyeb Free:** tambien puede servir para servicios web, pero Render tiene una configuracion mas directa para este caso.

## Checklist antes de hacerlo publico

- No usar datos reales de huespedes.
- No ingresar tarjetas reales.
- Mantenerlo como demo tecnica hasta agregar auth, PostgreSQL, secretos y logs estructurados.
- Recordar que este MVP no cumple PCI-DSS ni normativa fiscal todavia.
