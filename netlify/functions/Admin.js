// netlify/functions/admin.js
// -----------------------------------------------------
// Permite listar todas las activaciones y dar de baja una
// en específico. Al dar de baja, resta del conteo del
// negocio correspondiente en resumen-negocios.
//
// Protegido con una clave simple (ADMIN_KEY) que se manda
// en el header "x-admin-key". Configúrala como variable de
// entorno en Netlify (Site settings > Environment variables).

import { getStore } from '@netlify/blobs';

function noAutorizado() {
  return new Response(JSON.stringify({ error: 'No autorizado' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

export default async (req, context) => {
  const claveEsperada = Netlify.env.get('ADMIN_KEY') || 'panda2026!';
  const claveRecibida = req.headers.get('x-admin-key');

  if (claveRecibida !== claveEsperada) {
    return noAutorizado();
  }

  const activaciones = getStore({ name: 'activaciones', consistency: 'strong' });
  const resumen = getStore({ name: 'resumen-negocios', consistency: 'strong' });

  if (req.method === 'GET') {
    // Listar todas las activaciones, más recientes primero
    const { blobs } = await activaciones.list();
    const registros = await Promise.all(
      blobs.map(async (b) => await activaciones.get(b.key, { type: 'json' }))
    );
    registros.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return new Response(JSON.stringify(registros), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  }

  if (req.method === 'POST') {
    // Dar de baja una activación: { id: "act_..." }
    const { id } = await req.json();
    if (!id) {
      return new Response(JSON.stringify({ error: 'Falta el id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const registro = await activaciones.get(id, { type: 'json' });
    if (!registro) {
      return new Response(JSON.stringify({ error: 'Activación no encontrada' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (registro.estatus === 'Baja') {
      return new Response(JSON.stringify({ resultado: 'ok', mensaje: 'Ya estaba dado de baja' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Marcar como baja
    registro.estatus = 'Baja';
    registro.fecha_baja = new Date().toISOString();
    await activaciones.setJSON(id, registro);

    // Restar del conteo del negocio (si tenía código de referido)
    const codigoRef = registro.referido_de;
    if (codigoRef && codigoRef !== 'directo') {
      const datosNegocio = await resumen.get(codigoRef, { type: 'json' });
      if (datosNegocio) {
        const nuevoTotal = Math.max(0, datosNegocio.total_activos - 1);
        // Si cae por debajo de la meta de nivel 2, se resetea la fecha en que la alcanzó
        // (debe sostenerse sin interrupción para calificar al celular gratis)
        const fechaNivel2 = nuevoTotal >= (datosNegocio.meta_nivel2 || 20)
          ? datosNegocio.fecha_alcanzo_nivel2
          : null;

        await resumen.setJSON(codigoRef, {
          ...datosNegocio,
          total_activos: nuevoTotal,
          linea_gratis_ganada: nuevoTotal >= (datosNegocio.meta || 10),
          fecha_alcanzo_nivel2: fechaNivel2
        });
      }
    }

    return new Response(JSON.stringify({ resultado: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ error: 'Método no permitido' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' }
  });
};
