import { findClosestFix, LatLon, LatLonAlt, pixelCoordinates, RuntimeTrack } from '@flyxc/common';
import { Loader } from '@googlemaps/js-api-loader';
import { html, LitElement, PropertyValues, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { UnsubscribeHandle } from 'micro-typed-events';
import { connect } from 'pwa-helpers';
import simplify from 'simplify-path';
import { getApiKey } from '../../apikey';
import * as msg from '../../logic/messages';
import { setApiLoading, setTimeSec } from '../../redux/app-slice';
import { setCurrentLocation, setCurrentZoom } from '../../redux/location-slice';
import { setIsFreeDrawing, setRoute } from '../../redux/planner-slice';
import * as sel from '../../redux/selectors';
import { RootState, store } from '../../redux/store';
import { setCurrentTrackId } from '../../redux/track-slice';
import { ControlsElement } from './controls-element';
import { LineElement } from './line-element';
import { MarkerElement } from './marker-element';
import { PlannerElement } from './planner-element';
import { SegmentsElement } from './segments-element';
import { TopoEu, TopoFrance, TopoOtm, TopoSpain } from './topo-elements';
import { TrackingElement } from './tracking-element';

// Prevent tree-shaking components by exporting them
export {
  ControlsElement,
  LineElement,
  MarkerElement as GmMarkerElement,
  PlannerElement,
  SegmentsElement,
  TopoEu,
  TopoSpain,
  TopoFrance,
  TopoOtm,
  TrackingElement,
};

let gMapsApiLoading: Promise<void> | undefined;

// Load the google maps API
function loadGMaps(): Promise<void> {
  if (!gMapsApiLoading) {
    const load = (resolve: () => void) => {
      new Loader({
        apiKey: getApiKey('gmaps', store.getState().track.domain),
        version: 'weekly',
        libraries: ['geometry'],
      })
        .load()
        .then(resolve);
    };
    let resolve: () => void = () => null;
    gMapsApiLoading = new Promise((r) => (resolve = r));
    // Wait for the track to be loaded before loading the Google Maps API.
    // That way we know which API key to use (from the domain).
    if (store.getState().track.loaded) {
      load(resolve);
    } else {
      const unsubscribeState = store.subscribe(() => {
        if (store.getState().track.loaded) {
          unsubscribeState();
          load(resolve);
        }
      });
    }
  }
  return gMapsApiLoading;
}

@customElement('map-element')
export class MapElement extends connect(store)(LitElement) {
  @property({ attribute: false })
  map: google.maps.Map | undefined;

  @state()
  private tracks: RuntimeTrack[] = [];
  @state()
  private timeSec = 0;
  @state()
  private fullscreen = false;
  @state()
  protected currentTrackId?: string;
  @state()
  private isFreeDrawing = false;
  @state()
  private freeDrawPath = '';

  private pointerEventId?: number;
  private lockOnPilot = false;
  private lockPanBefore = 0;
  private subscriptions: UnsubscribeHandle[] = [];
  private readonly adRatio = store.getState().browser.isSmallScreen ? 0.7 : 1;

  stateChanged(state: RootState): void {
    this.tracks = sel.tracks(state);
    this.timeSec = state.app.timeSec;
    // In full screen mode the gesture handling must be greedy.
    // Using ctrl (+ scroll) is unnecessary as thr page can not scroll anyway.
    this.fullscreen = state.browser.isFullscreen;
    this.lockOnPilot = state.track.lockOnPilot;
    this.currentTrackId = state.track.currentTrackId;
    this.isFreeDrawing = state.planner.isFreeDrawing;
  }

  shouldUpdate(changedProps: PropertyValues): boolean {
    const now = Date.now();
    if (this.map) {
      if (changedProps.has('currentTrackId')) {
        const latLon = sel.getTrackLatLonAlt(store.getState())(this.timeSec);
        if (latLon) {
          const { lat, lon } = latLon;
          this.center(lat, lon);
        }
      }
      if (this.tracks.length && this.lockOnPilot && changedProps.has('timeSec') && now > this.lockPanBefore) {
        this.lockPanBefore = now + 50;
        const zoom = this.map.getZoom() as number;
        const currentPosition = sel.getTrackLatLonAlt(store.getState())(this.timeSec) as LatLonAlt;
        const { x, y } = pixelCoordinates(currentPosition, zoom).world;
        const bounds = this.map.getBounds() as google.maps.LatLngBounds;
        const sw = bounds.getSouthWest();
        const { x: minX, y: maxY } = pixelCoordinates({ lat: sw.lat(), lon: sw.lng() }, zoom).world;
        const ne = bounds.getNorthEast();
        const { x: maxX, y: minY } = pixelCoordinates({ lat: ne.lat(), lon: ne.lng() }, zoom).world;

        if (x - minX < 100 || y - minY < 100 || maxX - x < 100 || maxY - y < 100) {
          this.map.panTo({ lat: currentPosition.lat, lng: currentPosition.lon });
        }
      }
      if (changedProps.has('fullscreen')) {
        this.map.setOptions({ gestureHandling: this.fullscreen ? 'greedy' : 'auto' });
        changedProps.delete('fullscreen');
      }
    }
    return super.shouldUpdate(changedProps);
  }

  connectedCallback(): void {
    super.connectedCallback();
    store.dispatch(setApiLoading(true));
    loadGMaps().then((): void => {
      const options: google.maps.MapOptions = {
        zoom: 11,
        minZoom: 3,
        // Google maps terrain is only available up to zoom level 17.
        maxZoom: 17,
        mapTypeId: google.maps.MapTypeId.TERRAIN,
        scaleControl: true,
        fullscreenControl: false,
        streetViewControl: false,
        clickableIcons: false,
        mapTypeControlOptions: {
          mapTypeIds: [
            'terrain',
            'satellite',
            TopoOtm.mapTypeId,
            TopoFrance.mapTypeId,
            TopoFrance.mapTypeIdScan,
            TopoEu.mapTypeId,
            TopoSpain.mapTypeId,
          ],
          style: google.maps.MapTypeControlStyle.DROPDOWN_MENU,
        },
        mapId: '997ff70df48844a5',
      };

      this.map = new google.maps.Map(this.querySelector('#map') as HTMLElement, options);

      const controls = document.createElement('controls-element') as ControlsElement;
      controls.map = this.map;
      this.map.controls[google.maps.ControlPosition.TOP_RIGHT].push(controls);

      if (!store.getState().browser.isFromFfvl) {
        const ad = document.createElement('a');
        ad.setAttribute('href', 'https://www.niviuk.com/');
        ad.setAttribute('target', '_blank');
        ad.innerHTML = `<img width="${Math.round(175 * this.adRatio)}" height="${Math.round(
          32 * this.adRatio,
        )}" src="/static/img/niviuk.svg">`;
        this.map.controls[google.maps.ControlPosition.BOTTOM_CENTER].push(ad);
      }

      this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
        const latLng = e.latLng as google.maps.LatLng;
        const found = findClosestFix(this.tracks, latLng.lat(), latLng.lng());
        if (found != null) {
          store.dispatch(setTimeSec(found.timeSec));
          store.dispatch(setCurrentTrackId(found.track.id));
        }
      });

      this.subscriptions.push(
        msg.centerMap.subscribe(({ lat, lon }) => this.center(lat, lon)),
        msg.centerZoomMap.subscribe(({ lat, lon }, delta) => {
          this.center(lat, lon);
          this.zoom(delta);
        }),
        msg.trackGroupsAdded.subscribe(() => this.zoomToTracks()),
        msg.trackGroupsRemoved.subscribe(() => this.zoomToTracks()),
        msg.geoLocation.subscribe((latLon, userInitiated) => this.geolocation(latLon, userInitiated)),
        msg.drawRoute.subscribe(() => this.handleDrawing()),
      );

      if (this.tracks.length) {
        // Zoom to tracks when there are some.
        this.zoomToTracks();
      } else {
        const { location, zoom } = store.getState().location;
        this.map.setCenter({ lat: location.lat, lng: location.lon });
        this.map.setZoom(zoom);
      }

      this.map.addListener('center_changed', () => this.handleLocation());

      // Zoom to the track the first time the document becomes visible.
      if (document.visibilityState != 'visible') {
        document.addEventListener('visibilitychange', () => this.zoomToTracks(), { once: true });
      }

      store.dispatch(setApiLoading(false));
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.subscriptions.forEach((sub) => sub());
    this.subscriptions.length = 0;
    this.map = undefined;
  }

  protected render(): TemplateResult {
    return html`
      <style>
        #drw-container {
          width: 100%;
          height: 100%;
          position: absolute;
          top: 0px;
          left: 0px;
          z-index: 1;
        }
        path {
          stroke-width: 1px;
          stroke: black;
          fill: none;
        }
        svg {
          width: 100%;
          height: 100%;
          touch-action: none;
        }
        rect {
          width: 100%;
          height: 100%;
          opacity: 0.1;
          fill: lightgray;
          stroke: none;
        }
      </style>
      <div id="drw-container" style=${`display:${this.isFreeDrawing ? 'block' : 'none'}`}>
        <svg width="100%" height="100%">
          <path d=${this.freeDrawPath}></path>
          <rect width="100%" height="100%"></rect>
        </svg>
      </div>
      <div id="map"></div>
      <topo-eu .map=${this.map}></topo-eu>
      <topo-spain .map=${this.map}></topo-spain>
      <topo-france .map=${this.map}></topo-france>
      <topo-otm .map=${this.map}></topo-otm>
      <segments-element .map=${this.map} .query=${document.location.search}></segments-element>
      ${repeat(
        this.tracks,
        (track) => track.id,
        (track) =>
          html`
            <marker-element .map=${this.map} .track=${track} .timeSec=${this.timeSec}></marker-element>
            <line-element .map=${this.map} .track=${track}></line-element>
          `,
      )}
    `;
  }

  firstUpdated(): void {
    const rect = this.querySelector('rect') as SVGRectElement;
    let points: [number, number][] = [];

    rect.addEventListener(
      'pointerdown',
      (e) => {
        e.stopPropagation();
        if (this.pointerEventId != null) {
          return;
        }
        this.pointerEventId = e.pointerId;
        rect.setPointerCapture(e.pointerId);
        this.freeDrawPath = '';
        points.length = 0;
      },
      true,
    );

    rect.addEventListener('pointermove', (e) => {
      e.stopPropagation();
      if (this.pointerEventId == null) {
        return;
      }
      points.push([e.offsetX, e.offsetY]);
      if (points.length > 1) {
        this.freeDrawPath = points.map(([x, y], i) => `${i == 0 ? 'M' : 'L'}${x},${y}`).join(' ');
      }
    });

    rect.addEventListener('pointerup', () => {
      if (this.pointerEventId == null) {
        return;
      }
      rect.releasePointerCapture(this.pointerEventId);
      this.pointerEventId = undefined;
      this.freeDrawPath = '';
      store.dispatch(setIsFreeDrawing(false));
      points = simplify(points, 30);
      let encodedRoute = '';
      if (points.length >= 2 && this.map) {
        const proj = this.map.getProjection() as google.maps.Projection;
        const bounds = this.map.getBounds() as google.maps.LatLngBounds;
        const topRight = proj.fromLatLngToPoint(bounds.getNorthEast()) as google.maps.Point;
        const bottomLeft = proj.fromLatLngToPoint(bounds.getSouthWest()) as google.maps.Point;
        const scale = Math.pow(2, this.map.getZoom() as number);
        encodedRoute = google.maps.geometry.encoding.encodePath(
          points.map(([x, y]) => {
            const worldPoint = new google.maps.Point(x / scale + bottomLeft.x, y / scale + topRight.y);
            return proj.fromPointToLatLng(worldPoint) as google.maps.LatLng;
          }),
        );
      }
      store.dispatch(setRoute(encodedRoute));
      points.length = 0;
    });
  }

  private handleDrawing() {
    store.dispatch(setIsFreeDrawing(true));
  }

  // Center the map on the user location:
  // - if they have not yet interacted with the map,
  // - or if the request was initiated by them (i.e. from the menu).
  private geolocation({ lat, lon }: LatLon, userInitiated: boolean): void {
    if (this.map) {
      const center = this.map.getCenter() as google.maps.LatLng;
      const start = store.getState().location.start;
      if (userInitiated || (center.lat() == start.lat && center.lng() == start.lon)) {
        this.center(lat, lon);
      }
    }
  }

  private center(lat: number, lon: number): void {
    this.map?.setCenter({ lat, lng: lon });
  }

  private zoom(delta: number): void {
    const map = this.map;
    if (map) {
      map.setZoom((map.getZoom() as number) + (delta < 0 ? 1 : -1));
    }
  }

  private zoomToTracks(): void {
    // When first loaded the div has no dimension then fitBounds does not work.
    // The workaround is to wait for the div to have a width before calling fitBounds.
    const timeout = Date.now() + 5000;
    const zoomWhenSize = () => {
      const div = this.map?.getDiv();
      const hasWidth = div && div.clientWidth > 0;
      if (Date.now() < timeout && !hasWidth) {
        setTimeout(zoomWhenSize, 100);
      } else {
        const extent = sel.tracksExtent(store.getState());
        if (extent != null) {
          const bounds = new google.maps.LatLngBounds(
            { lat: extent.sw.lat, lng: extent.sw.lon },
            { lat: extent.ne.lat, lng: extent.ne.lon },
          );
          this.map?.fitBounds(bounds);
        }
      }
    };
    zoomWhenSize();
  }

  private handleLocation(): void {
    if (this.map) {
      const center = this.map.getCenter() as google.maps.LatLng;
      store.dispatch(setCurrentLocation({ lat: center.lat(), lon: center.lng() }));
      store.dispatch(setCurrentZoom(this.map.getZoom() as number));
    }
  }

  createRenderRoot(): Element {
    return this;
  }
}
