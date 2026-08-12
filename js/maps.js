/* ============================================================
   YouCanSmile — Yandex Maps helper (Tashkent)
   ============================================================ */
const YcsMaps = (() => {
  const TASHKENT = [41.2995, 69.2401];
  let loading = null;

  function loadApi(apiKey) {
    if (window.ymaps) return Promise.resolve(window.ymaps);
    if (loading) return loading;
    if (!apiKey) return Promise.reject(new Error('no-key'));
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(apiKey)}&lang=ru_RU`;
      s.async = true;
      s.onload = () => {
        window.ymaps.ready(() => resolve(window.ymaps));
      };
      s.onerror = () => reject(new Error('maps-load-failed'));
      document.head.appendChild(s);
    });
    return loading;
  }

  /**
   * @param {HTMLElement} el
   * @param {{ apiKey?: string, onPick?: (data:{coords:number[],address:string})=>void, initial?: {coords?:number[],address?:string} }} opts
   */
  async function mount(el, opts = {}) {
    if (!el) return null;
    const onPick = opts.onPick || (() => {});
    const initial = opts.initial || {};

    if (!opts.apiKey) {
      el.innerHTML = `<div class="map-fallback" data-i18n="map_no_key">${typeof I18n !== 'undefined' ? I18n.t('map_no_key') : 'Укажите ключ Яндекс.Карт в админке или введите адрес вручную.'}</div>`;
      return { destroy() {}, hasMap: false };
    }

    el.innerHTML = `<div class="map-loading">${typeof I18n !== 'undefined' ? I18n.t('map_loading') : 'Загрузка карты…'}</div>`;
    try {
      const ymaps = await loadApi(opts.apiKey);
      el.innerHTML = '';
      const mapNode = document.createElement('div');
      mapNode.className = 'ycs-map-canvas';
      el.appendChild(mapNode);

      const center = initial.coords && initial.coords.length === 2 ? initial.coords : TASHKENT;
      const map = new ymaps.Map(mapNode, {
        center,
        zoom: 12,
        controls: ['zoomControl', 'geolocationControl'],
      });
      let placemark = new ymaps.Placemark(center, {}, { draggable: true });
      map.geoObjects.add(placemark);

      async function emit(coords) {
        let address = '';
        try {
          const res = await ymaps.geocode(coords);
          const first = res.geoObjects.get(0);
          address = first ? first.getAddressLine() : '';
        } catch (e) {
          address = coords.map((n) => n.toFixed(5)).join(', ');
        }
        onPick({ coords, address });
      }

      if (initial.coords) emit(initial.coords);

      map.events.add('click', (e) => {
        const coords = e.get('coords');
        placemark.geometry.setCoordinates(coords);
        emit(coords);
      });
      placemark.events.add('dragend', () => {
        emit(placemark.geometry.getCoordinates());
      });

      return {
        hasMap: true,
        destroy() {
          try {
            map.destroy();
          } catch (e) {}
        },
        setCenter(coords) {
          map.setCenter(coords);
          placemark.geometry.setCoordinates(coords);
        },
      };
    } catch (e) {
      el.innerHTML = `<div class="map-fallback">${typeof I18n !== 'undefined' ? I18n.t('map_error') : 'Не удалось загрузить карту. Введите адрес вручную.'}</div>`;
      return { destroy() {}, hasMap: false };
    }
  }

  return { mount, TASHKENT };
})();
