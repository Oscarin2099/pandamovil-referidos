// netlify/functions/activar.js
// -----------------------------------------------------
// Recibe el POST desde activar.html, guarda la activación
// individual y actualiza el conteo de referidos por negocio.
// Usa Netlify Blobs (almacenamiento incluido en Netlify, sin
// necesidad de base de datos externa).

import { getStore } from '@netlify/blobs';

const META_REFERIDOS = 10; // referidos activos necesarios para línea gratis (nivel 1)
const META_NIVEL2 = 20; // referidos activos necesarios para celular gratis (nivel 2)
const MESES_SOSTENIDOS_NIVEL2 = 6; // debe sostenerse este tiempo para calificar

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método no permitido' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const datos = await req.json();

    if (!datos.nombre || !datos.telefono || !datos.plan) {
      return new Response(JSON.stringify({ error: 'Faltan datos requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const activaciones = getStore({ name: 'activaciones', consistency: 'strong' });
    const resumen = getStore({ name: 'resumen-negocios', consistency: 'strong' });

    const idActivacion = `act_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const codigoRef = datos.referido_de || 'directo';

    const registro = {
      id: idActivacion,
      nombre: datos.nombre,
      telefono: datos.telefono,
      plan: datos.plan,
      referido_de: codigoRef,
      fecha: datos.fecha || new Date().toISOString(),
      estatus: 'Activo'
    };

    // 1. Guardar la activación individual
    await activaciones.setJSON(idActivacion, registro);

    // 2. Actualizar el resumen del negocio (si viene de un referido)
    let lineaGanada = false;
    if (codigoRef && codigoRef !== 'directo') {
      const actual = await resumen.get(codigoRef, { type: 'json' }).catch(() => null);
      const totalPrevio = actual ? actual.total_activos : 0;
      const nuevoTotal = totalPrevio + 1;
      lineaGanada = nuevoTotal >= META_REFERIDOS;

      // La fecha en que alcanzó 20 solo se marca la primera vez que llega ahí
      let fechaAlcanzoNivel2 = actual ? actual.fecha_alcanzo_nivel2 : null;
      if (nuevoTotal >= META_NIVEL2 && !fechaAlcanzoNivel2) {
        fechaAlcanzoNivel2 = registro.fecha;
      }

      await resumen.setJSON(codigoRef, {
        codigo_negocio: codigoRef,
        total_activos: nuevoTotal,
        meta: META_REFERIDOS,
        linea_gratis_ganada: lineaGanada,
        meta_nivel2: META_NIVEL2,
        fecha_alcanzo_nivel2: fechaAlcanzoNivel2,
        meses_sostenidos_requeridos: MESES_SOSTENIDOS_NIVEL2,
        ultima_activacion: registro.fecha
      });
    }

    return new Response(JSON.stringify({
      resultado: 'ok',
      id: idActivacion,
      linea_gratis_ganada: lineaGanada
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error en activar:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
