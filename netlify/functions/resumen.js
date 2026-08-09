// netlify/functions/resumen.js
// -----------------------------------------------------
// Devuelve el resumen de referidos de un negocio específico
// (?codigo=XXX) o de todos los negocios (sin parámetro).
// Úsalo para armar un dashboard o consultarlo desde tu app.

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  try {
    const resumen = getStore({ name: 'resumen-negocios', consistency: 'strong' });
    const url = new URL(req.url);
    const codigo = url.searchParams.get('codigo');

    const headersRespuesta = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    };

    if (codigo) {
      // Resumen de un solo negocio
      const datos = await resumen.get(codigo, { type: 'json' });
      if (!datos) {
        return new Response(JSON.stringify({ codigo_negocio: codigo, total_activos: 0, meta: 10, linea_gratis_ganada: false }), {
          status: 200,
          headers: headersRespuesta
        });
      }
      return new Response(JSON.stringify(datos), {
        status: 200,
        headers: headersRespuesta
      });
    }

    // Resumen de todos los negocios
    const { blobs } = await resumen.list();
    const resultados = await Promise.all(
      blobs.map(async (b) => await resumen.get(b.key, { type: 'json' }))
    );

    return new Response(JSON.stringify(resultados), {
      status: 200,
      headers: headersRespuesta
    });

  } catch (error) {
    console.error('Error en resumen:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
