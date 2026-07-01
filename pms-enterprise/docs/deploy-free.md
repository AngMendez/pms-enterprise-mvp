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

### Limitaciones de la version gratuita

- El servicio puede dormir cuando no recibe trafico y tardar en despertar.
- El almacenamiento actual es en memoria, por lo que los datos se reinician cuando el proceso reinicia.
- Para datos persistentes reales se debe migrar a PostgreSQL. Render ofrece PostgreSQL gratuito con limite temporal; para algo estable conviene una base gratuita externa con plan permanente o pasar a un plan pago.

## Alternativas gratuitas

- **Vercel Hobby:** excelente para frontend y funciones serverless, pero este MVP esta hecho como servidor Node persistente. Requiere adaptar la API.
- **GitHub Pages:** sirve para publicar solo frontend estatico. No sirve para este MVP completo porque no ejecuta backend.
- **Koyeb Free:** tambien puede servir para servicios web, pero Render tiene una configuracion mas directa para este caso.

## Checklist antes de hacerlo publico

- No usar datos reales de huespedes.
- No ingresar tarjetas reales.
- Mantenerlo como demo tecnica hasta agregar auth, PostgreSQL, secretos y logs estructurados.
- Recordar que este MVP no cumple PCI-DSS ni normativa fiscal todavia.
