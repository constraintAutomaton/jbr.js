import * as Path from 'path';
import type { Hook, ITaskContext, ProcessHandler } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { SparqlBenchmarkRunner } from 'sparql-benchmark-runner';
import { TestLogger } from '../../jbr/test/TestLogger';
import { ExperimentLargeRdfBench } from '../lib/ExperimentLargeRdfBench';

let sparqlBenchmarkRun: any;
let queryLoaderLoadQueries: any;
let resultSerializerSerialize: any;

jest.mock('sparql-benchmark-runner', () => ({
  SparqlBenchmarkRunner: jest.fn().mockImplementation((options: any) => {
    options.logger('Test logger');
    return {
      run: sparqlBenchmarkRun,
    };
  }),
  QueryLoaderFile: jest.fn().mockImplementation(() => ({
    loadQueries: queryLoaderLoadQueries,
  })),
  ResultSerializerCsv: jest.fn().mockImplementation(() => ({
    serialize: resultSerializerSerialize,
  })),
}));

let files: Record<string, boolean | string> = {};
let filesOut: Record<string, string> = {};
let dirsOut: Record<string, boolean | string> = {};
let symlinksOut: Record<string, string> = {};
let dirEntries: Record<string, { name: string; file: boolean }[]> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async pathExists(path: string) {
    return path in files;
  },
  async mkdir(dirPath: string) {
    dirsOut[dirPath] = true;
  },
  async ensureDir(dirPath: string) {
    dirsOut[dirPath] = true;
  },
  async writeFile(path: string, contents: string) {
    filesOut[path] = contents;
  },
  async ensureSymlink(target: string, path: string) {
    symlinksOut[path] = target;
  },
  async readdir(dir: string) {
    return (dirEntries[dir] ?? []).map(entry => ({
      name: entry.name,
      isFile: () => entry.file,
      isDirectory: () => !entry.file,
    }));
  },
}));

describe('ExperimentLargeRdfBench', () => {
  let context: ITaskContext;
  let hookSparqlEndpointFederationEngine: Hook;
  let hookSparqlEndpointSource: Hook;
  let endpointHandlerStopCollectingStats: any;
  let endpointHandler: ProcessHandler;

  function createExperiment(
    dataType: 'path' | 'url' = 'path',
    useHdt = false,
    datasetLocation = '/data/datasets',
  ): ExperimentLargeRdfBench {
    return new ExperimentLargeRdfBench(
      datasetLocation,
      dataType,
      useHdt,
      hookSparqlEndpointFederationEngine,
      [ hookSparqlEndpointSource ],
      'http://localhost:3001/sparql',
      'http://localhost:3001/',
      3,
      1,
      0,
      1_000,
      {},
      600,
    );
  }

  beforeEach(() => {
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      experimentName: 'EXP',
      mainModulePath: 'MMP',
      verbose: true,
      closeExperiment: jest.fn(),
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      // The experiment drives its endpoints through the injected hooks, so Docker is never touched.
      docker: <any> {},
    };
    endpointHandlerStopCollectingStats = jest.fn();
    endpointHandler = {
      close: jest.fn(),
      startCollectingStats: jest.fn(() => endpointHandlerStopCollectingStats),
      join: jest.fn(),
      addTerminationHandler: jest.fn(),
      removeTerminationHandler: jest.fn(),
    };
    hookSparqlEndpointFederationEngine = <any> {
      prepare: jest.fn(),
      start: jest.fn(() => endpointHandler),
      clean: jest.fn(),
    };
    hookSparqlEndpointSource = <any> {
      prepare: jest.fn(),
      start: jest.fn(() => endpointHandler),
      clean: jest.fn(),
    };
    sparqlBenchmarkRun = jest.fn(async({ onStart, onStop }) => {
      await onStart();
      await onStop();
      return {};
    });
    queryLoaderLoadQueries = jest.fn().mockResolvedValue({
      C1: 'path/C1',
      C2: 'path/C2',
      C3: 'path/C3',
    });
    resultSerializerSerialize = jest.fn();
    files = {};
    filesOut = {};
    dirsOut = {};
    symlinksOut = {};
    dirEntries = {};
    (<any> process).on = jest.fn();
  });

  describe('prepare', () => {
    it('should prepare the hooks and stage the local dataset and queries', async() => {
      dirEntries['/data/datasets'] = [
        { name: 'Affymetrix.nt', file: true },
        { name: 'ChEBI.ttl', file: true },
        { name: 'hdt', file: false },
        { name: 'stats', file: false },
      ];

      await createExperiment().prepare(context, false);

      expect(hookSparqlEndpointFederationEngine.prepare).toHaveBeenCalledWith(context, false);
      expect(hookSparqlEndpointSource.prepare).toHaveBeenCalledWith(context, false);

      expect(dirsOut).toEqual({
        [Path.join('CWD', 'output', 'logs')]: true,
        [Path.join('CWD', 'generated', 'large-rdf-bench')]: true,
      });

      expect(symlinksOut).toEqual({
        [Path.join('CWD', 'generated', 'large-rdf-bench', 'Affymetrix.nt')]:
          Path.join('/data', 'datasets', 'Affymetrix.nt'),
        [Path.join('CWD', 'generated', 'large-rdf-bench', 'ChEBI.ttl')]:
          Path.join('/data', 'datasets', 'ChEBI.ttl'),
        [Path.join('CWD', 'generated', 'large-rdf-bench', 'queries')]:
          Path.join('/data', 'queries'),
      });
    });

    it('should stage from the hdt folder when useHdt is set', async() => {
      dirEntries[Path.join('/data', 'datasets', 'hdt')] = [
        { name: 'Affymetrix.hdt', file: true },
        { name: 'Affymetrix.hdt.index.v1-1', file: true },
        { name: '.validated', file: false },
      ];

      await createExperiment('path', true).prepare(context, false);

      expect(symlinksOut).toEqual({
        [Path.join('CWD', 'generated', 'large-rdf-bench', 'Affymetrix.hdt')]:
          Path.join('/data', 'datasets', 'hdt', 'Affymetrix.hdt'),
        [Path.join('CWD', 'generated', 'large-rdf-bench', 'Affymetrix.hdt.index.v1-1')]:
          Path.join('/data', 'datasets', 'hdt', 'Affymetrix.hdt.index.v1-1'),
        [Path.join('CWD', 'generated', 'large-rdf-bench', 'queries')]:
          Path.join('/data', 'queries'),
      });
    });

    it('should skip staging when the dataset was already generated', async() => {
      files[Path.join('CWD', 'generated', 'large-rdf-bench')] = true;

      await createExperiment().prepare(context, false);

      expect(hookSparqlEndpointFederationEngine.prepare).toHaveBeenCalledWith(context, false);
      expect(hookSparqlEndpointSource.prepare).toHaveBeenCalledWith(context, false);
      expect(symlinksOut).toEqual({});
    });

    it('should reject remote datasets as not yet supported', async() => {
      await expect(createExperiment('url', false, 'http://example.org/dataset.zip')
        .prepare(context, false)).rejects.toThrow('not yet supported');
    });
  });

  describe('run', () => {
    it('should run the experiment', async() => {
      await createExperiment().run(context);

      expect(hookSparqlEndpointFederationEngine.start).toHaveBeenCalledWith(context);
      expect(hookSparqlEndpointSource.start).toHaveBeenCalledWith(context);
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(endpointHandler.close).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();

      expect(filesOut[Path.join('CWD', 'output', 'logs', 'load-time.csv')])
        .toMatch(/^time\n\d+$/u);
      expect(resultSerializerSerialize).toHaveBeenCalledWith(
        Path.join('CWD', 'output', 'query-times.csv'), {},
      );

      expect(dirsOut).toEqual({
        [Path.join('CWD', 'output')]: true,
      });

      expect(SparqlBenchmarkRunner).toHaveBeenCalledWith(expect.objectContaining({
        querySets: {
          C1: 'path/C1',
          C2: 'path/C2',
          C3: 'path/C3',
        },
      }));
    });

    it('should run the experiment with a query filter', async() => {
      await createExperiment().run({ ...context, filter: 'C1' });

      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(SparqlBenchmarkRunner).toHaveBeenCalledWith(expect.objectContaining({
        querySets: { C1: 'path/C1' },
      }));
    });

    it('should not create an output dir if it already exists', async() => {
      files[Path.join('CWD', 'output')] = true;

      await createExperiment().run(context);

      expect(dirsOut).toEqual({});
    });

    it('should run the experiment with breakpoint', async() => {
      let breakpointBarrierResolver: any;
      const breakpointBarrier: any = () => new Promise(resolve => {
        breakpointBarrierResolver = resolve;
      });
      const experimentEnd = createExperiment().run({ ...context, breakpointBarrier });

      await new Promise(setImmediate);

      expect(hookSparqlEndpointFederationEngine.start).toHaveBeenCalled();
      expect(endpointHandler.startCollectingStats).toHaveBeenCalled();
      expect(sparqlBenchmarkRun).toHaveBeenCalled();
      expect(endpointHandler.close).not.toHaveBeenCalled();

      breakpointBarrierResolver();
      await experimentEnd;

      expect(endpointHandler.close).toHaveBeenCalled();
      expect(endpointHandlerStopCollectingStats).toHaveBeenCalled();
    });
  });

  describe('clean', () => {
    it('should clean the federation engine and source hooks', async() => {
      await createExperiment().clean(context, {});

      expect(hookSparqlEndpointFederationEngine.clean).toHaveBeenCalledWith(context, {});
      expect(hookSparqlEndpointSource.clean).toHaveBeenCalledWith(context, {});
    });
  });
});
