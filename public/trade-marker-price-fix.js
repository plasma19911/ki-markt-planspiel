/* Historical trade marker fix
   Some old KAUF/VERKAUF history rows have no execution_price/price in the
   position-chart API. The chart already knows the event timestamp and its bars,
   so attach the nearest real bar close instead of letting null become numeric 0.
*/
(() => {
  if (window.__tradeMarkerPriceFix) return;
  window.__tradeMarkerPriceFix = true;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const input = args[0];
    const url = typeof input === 'string' ? input : String(input?.url || '');
    const response = await nativeFetch(...args);

    if (!url.includes('/api/position-chart') || !response.ok) return response;

    try {
      const data = await response.clone().json();
      if (!Array.isArray(data?.bars) || !Array.isArray(data?.events) || !data.bars.length) return response;

      for (const event of data.events) {
        const direct = Number(event?.price);
        if (Number.isFinite(direct) && direct > 0) continue;

        const eventTs = Date.parse(String(event?.ts || ''));
        if (!Number.isFinite(eventTs)) continue;

        let nearest = null;
        let nearestDistance = Infinity;
        for (const bar of data.bars) {
          const barTs = Number(bar?.ts);
          const close = Number(bar?.close);
          if (!Number.isFinite(barTs) || !(close > 0)) continue;
          const distance = Math.abs(barTs - eventTs);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            nearest = bar;
          }
        }

        if (nearest && Number(nearest.close) > 0) {
          event.price = Number(nearest.close);
          event.price_source = 'nearest_chart_bar';
        }
      }

      const headers = new Headers(response.headers);
      headers.delete('content-length');
      headers.delete('content-encoding');
      headers.set('content-type', 'application/json; charset=utf-8');

      return new Response(JSON.stringify(data), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch {
      return response;
    }
  };
})();
