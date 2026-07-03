import type { IExperimentPaths } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { ExperimentHandlerLargeRdfBench } from '../lib/ExperimentHandlerLargeRdfBench';

describe('ExperimentHandlerLargeRdfBench', () => {
  let handler: ExperimentHandlerLargeRdfBench;
  let experimentPaths: IExperimentPaths;
  beforeEach(() => {
    handler = new ExperimentHandlerLargeRdfBench();
    experimentPaths = createExperimentPaths('dir');
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toEqual('largerdfbench');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.experimentClassName).toEqual('ExperimentLargeRdfBench');
    });
  });

  describe('getDefaultParams', () => {
    it('returns the default params', () => {
      expect(handler.getDefaultParams(experimentPaths)).toEqual({
        datasetLocation: 'https://cloud.ilabt.imec.be/index.php/s/qm8EGWCZBot9Hjj/download',
        dataType: 'url',
        endpointUrl: 'http://localhost:3001/sparql',
        endpointUrlExternal: 'http://localhost:3001/',
        queryRunnerReplication: 3,
        queryRunnerWarmupRounds: 1,
        queryRunnerRequestDelay: 0,
        queryRunnerEndpointAvailabilityCheckTimeout: 1_000,
        queryRunnerUrlParams: {},
      });
    });
  });

  describe('getHookNames', () => {
    it('returns the hook names', () => {
      expect(handler.getHookNames())
        .toEqual([ 'hookSparqlEndpointFederationEngine', 'hookSparqlEndpointsSources' ]);
    });
  });

  describe('init', () => {
    it('does nothing', async() => {
      await handler.init(experimentPaths, <any> {});
    });
  });
});
