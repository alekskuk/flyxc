import { LiveTrackEntity, protos, TrackerEntity, TrackerNames } from '@flyxc/common';
import { Datastore, Key } from '@google-cloud/datastore';
import { createInitState } from './state';
import { syncLiveTrack } from './sync';

const NOW = 4321;

const INREACH = 'https://share.garmin.com/Feed/Share/inreach';
const INREACH_2 = 'https://share.garmin.com/Feed/Share/inreach2';
const SPOT = '012345678901234567890123456789spot';
const FLYME = '001';
const SKYLINES = '002';
const FLYMASTER = '003';

describe('sync', () => {
  let nowFn: any;
  let errorFn: any;

  beforeAll(() => {
    nowFn = Date.now;
    Date.now = jest.fn(() => NOW * 1000);
    errorFn = console.error;
    console.error = jest.fn();
  });

  afterAll(() => {
    Date.now = nowFn;
    console.error = errorFn;
  });

  describe('Adding a new pilot', () => {
    it('adds a new pilot', () => {
      const state = createInitState();

      const lt = createLiveTrackEntity('1978', {
        name: 'new',
        updated: new Date(123000),
      });

      syncLiveTrack(state, lt);

      expect(state.lastUpdatedMs).toBe(123000);
      expect(Object.keys(state.pilots)).toEqual(['1978']);

      expect(state.pilots['1978']).toMatchObject({
        name: 'new',
        enabled: true,
        share: true,
      });

      const trackerAccounts: Record<TrackerNames, string> = {
        inreach: INREACH,
        spot: SPOT,
        flyme: FLYME,
        skylines: SKYLINES,
        flymaster: FLYMASTER,
      };

      for (const [p, a] of Object.entries(trackerAccounts)) {
        const tracker = state.pilots['1978'][p];
        expect(tracker).toMatchObject({
          account: a,
          enabled: true,
          lastFetchSec: 0,
          lastFixSec: NOW - 24 * 3600,
          numConsecutiveErrors: 0,
          numRequests: 0,
          numErrors: 0,
        });
        expect(tracker.nextFetchSec).toBeGreaterThanOrEqual(4321);
      }
    });
  });

  describe('Updating an existing pilot', () => {
    it('updates an existing pilot', () => {
      const state = createInitState();

      let lt = createLiveTrackEntity('1978', {
        name: 'new',
        inreach: createTrackerEntity(INREACH, { enabled: false }),
      });

      syncLiveTrack(state, lt);
      expect(state.pilots[1978].name).toEqual('new');
      expect(state.pilots[1978].inreach?.account).toEqual(INREACH);
      expect(state.pilots[1978].inreach?.enabled).toEqual(false);

      lt = createLiveTrackEntity('1978', {
        name: 'new-2',
        inreach: createTrackerEntity(INREACH_2, { enabled: true }),
      });

      syncLiveTrack(state, lt);
      expect(state.pilots[1978].name).toEqual('new-2');
      expect(state.pilots[1978].inreach?.account).toEqual(INREACH_2);
      expect(state.pilots[1978].inreach?.enabled).toEqual(true);
    });

    it('updates lastUpdatedSec', () => {
      const state = createInitState();

      let lt = createLiveTrackEntity('1978', {
        updated: new Date(123000),
      });
      syncLiveTrack(state, lt);
      expect(state.lastUpdatedMs).toEqual(123000);

      lt = createLiveTrackEntity('1978', {
        updated: new Date(456000),
      });
      syncLiveTrack(state, lt);
      expect(state.lastUpdatedMs).toEqual(456000);

      lt = createLiveTrackEntity('1978', {
        updated: new Date(450000),
      });
      syncLiveTrack(state, lt);
      expect(state.lastUpdatedMs).toEqual(456000);
    });

    it('keeps track when no update', () => {
      const state = createInitState();

      const lt = createLiveTrackEntity('1978');
      syncLiveTrack(state, lt);
      state.pilots[1978].track = protos.LiveTrack.create({ timeSec: [1, 2, 3] });

      syncLiveTrack(state, lt);
      expect(state.pilots[1978].track).toMatchObject({ timeSec: [1, 2, 3] });
    });

    it('drops track when global updated', () => {
      const state = createInitState();

      let lt = createLiveTrackEntity('1978', { enabled: true });
      syncLiveTrack(state, lt);
      state.pilots[1978].track = protos.LiveTrack.create({ timeSec: [1, 2, 3] });

      lt = createLiveTrackEntity('1978', { enabled: false });
      syncLiveTrack(state, lt);
      expect(state.pilots[1978].track).toMatchObject({ timeSec: [] });
    });

    it('drop track when tracker updated', () => {
      const state = createInitState();

      let lt = createLiveTrackEntity('1978', { inreach: createTrackerEntity(INREACH, { enabled: true }) });
      syncLiveTrack(state, lt);
      state.pilots[1978].track = protos.LiveTrack.create({ timeSec: [1, 2, 3] });

      lt = createLiveTrackEntity('1978', { inreach: createTrackerEntity(INREACH, { enabled: false }) });
      syncLiveTrack(state, lt);
      expect(state.pilots[1978].track).toMatchObject({ timeSec: [] });
    });

    it('keeps tracker config when no update', () => {
      const state = createInitState();

      const lt = createLiveTrackEntity('1978', { inreach: createTrackerEntity(INREACH, { enabled: true }) });
      syncLiveTrack(state, lt);
      state.pilots[1978].inreach!.numErrors = 10;

      syncLiveTrack(state, lt);
      expect(state.pilots[1978].inreach?.numErrors).toEqual(10);
    });

    it('resets tracker config when enabled updated', () => {
      const state = createInitState();

      let lt = createLiveTrackEntity('1978', { inreach: createTrackerEntity(INREACH, { enabled: true }) });
      syncLiveTrack(state, lt);
      state.pilots[1978].inreach!.numErrors = 10;

      lt = createLiveTrackEntity('1978', { inreach: createTrackerEntity(INREACH, { enabled: false }) });
      syncLiveTrack(state, lt);
      expect(state.pilots[1978].inreach?.numErrors).toEqual(0);
    });

    it('resets tracker config when account updated', () => {
      const state = createInitState();

      let lt = createLiveTrackEntity('1978', { inreach: createTrackerEntity(INREACH, { enabled: true }) });
      syncLiveTrack(state, lt);
      state.pilots[1978].inreach!.numErrors = 10;

      lt = createLiveTrackEntity('1978', { inreach: createTrackerEntity(INREACH_2, { enabled: true }) });
      syncLiveTrack(state, lt);
      expect(state.pilots[1978].inreach?.numErrors).toEqual(0);
    });

    it('validates the account', () => {
      const state = createInitState();

      let lt = createLiveTrackEntity('1978', {
        inreach: createTrackerEntity(INREACH),
        spot: createTrackerEntity(SPOT),
        skylines: createTrackerEntity(SKYLINES),
        flyme: createTrackerEntity(FLYME, { flyme: true }),
        flymaster: createTrackerEntity(FLYMASTER),
      });
      syncLiveTrack(state, lt);

      expect(state.pilots[1978].inreach!.enabled).toEqual(true);
      expect(state.pilots[1978].spot!.enabled).toEqual(true);
      expect(state.pilots[1978].skylines!.enabled).toEqual(true);
      expect(state.pilots[1978].flyme!.enabled).toEqual(true);
      expect(state.pilots[1978].flymaster!.enabled).toEqual(true);
      expect(state.pilots[1978].inreach!.account).toEqual(INREACH);
      expect(state.pilots[1978].spot!.account).toEqual(SPOT);
      expect(state.pilots[1978].skylines!.account).toEqual(SKYLINES);
      expect(state.pilots[1978].flyme!.account).toEqual(FLYME);
      expect(state.pilots[1978].flymaster!.account).toEqual(FLYMASTER);

      lt = createLiveTrackEntity('1978', {
        inreach: createTrackerEntity('invalid'),
        spot: createTrackerEntity('invalid'),
        skylines: createTrackerEntity('invalid'),
        flyme: createTrackerEntity('invalid', { flyme: true }),
        flymaster: createTrackerEntity('invalid'),
      });
      syncLiveTrack(state, lt);

      expect(state.pilots[1978].inreach!.enabled).toEqual(false);
      expect(state.pilots[1978].spot!.enabled).toEqual(false);
      expect(state.pilots[1978].skylines!.enabled).toEqual(false);
      expect(state.pilots[1978].flyme!.enabled).toEqual(false);
      expect(state.pilots[1978].flymaster!.enabled).toEqual(false);
      expect(state.pilots[1978].inreach!.account).toEqual('');
      expect(state.pilots[1978].spot!.account).toEqual('');
      expect(state.pilots[1978].skylines!.account).toEqual('');
      expect(state.pilots[1978].flyme!.account).toEqual('');
      expect(state.pilots[1978].flymaster!.account).toEqual('');
    });
  });
});

function createLiveTrackEntity(id: string, liveTrack: Partial<LiveTrackEntity> = {}): LiveTrackEntity {
  const entity: LiveTrackEntity = {
    [Datastore.KEY]: { id } as Key,
    email: 'email',
    name: 'name',
    google_id: 'google_id',
    created: new Date(),
    updated: new Date(),
    share: true,
    enabled: true,
    inreach: createTrackerEntity(INREACH),
    spot: createTrackerEntity(SPOT),
    skylines: createTrackerEntity(SKYLINES),
    flyme: createTrackerEntity(FLYME, { flyme: true }),
    flymaster: createTrackerEntity(FLYMASTER),
  };

  return { ...entity, ...liveTrack };
}

function createTrackerEntity(
  account: string,
  { enabled, flyme }: { enabled?: boolean; flyme?: boolean } = { enabled: true, flyme: false },
): TrackerEntity {
  enabled ??= true;
  flyme ??= false;
  const entity: TrackerEntity = {
    enabled,
    account: flyme ? 'account@flyme.com' : account,
  };
  if (flyme ?? true) {
    entity.account_resolved = account;
  }
  return entity;
}
