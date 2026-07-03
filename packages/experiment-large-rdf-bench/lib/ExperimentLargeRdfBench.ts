import * as Path from 'path';
import * as fs from 'fs-extra';
import { ProcessHandlerComposite, secureProcessHandler } from 'jbr';
import type { Experiment, Hook, ICleanTargets, ITaskContext, IRunTaskContext } from 'jbr';
import { SparqlBenchmarkRunner, QueryLoaderFile, ResultSerializerCsv } from 'sparql-benchmark-runner';

type DatasetType = 'path' | 'url';
/**
 * An experiment instance for LargeRDFBench.
 */
export class ExperimentLargeRdfBench implements Experiment {
  /**
   * @param datasetLocation
   * @param dataType
   * @param useHdt
   * @param hookSparqlEndpointFederationEngine
   * @param hookSparqlEndpointsSources
   * @param endpointUrl
   * @param endpointUrlExternal
   * @param queryRunnerReplication
   * @param queryRunnerWarmupRounds
   * @param queryRunnerRequestDelay
   * @param queryRunnerEndpointAvailabilityCheckTimeout
   * @param queryRunnerUrlParams - @range {json}
   * @param queryTimeoutFallback
   */
  public constructor(
    public readonly datasetLocation: string,
    public readonly dataType: DatasetType,
    public readonly useHdt: boolean,
    public readonly hookSparqlEndpointFederationEngine: Hook,
    public readonly hookSparqlEndpointsSources: Hook[],
    public readonly endpointUrl: string,
    public readonly endpointUrlExternal: string,
    public readonly queryRunnerReplication: number,
    public readonly queryRunnerWarmupRounds: number,
    public readonly queryRunnerRequestDelay: number,
    public readonly queryRunnerEndpointAvailabilityCheckTimeout: number,
    public readonly queryRunnerUrlParams: Record<string, any>,
    public readonly queryTimeoutFallback: number | undefined,
  ) {
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Prepare hook
    await this.hookSparqlEndpointFederationEngine.prepare(context, forceOverwriteGenerated);
    await Promise.all(this.hookSparqlEndpointsSources
      .map(hookSparqlEndpoint => hookSparqlEndpoint.prepare(context, forceOverwriteGenerated)));

    // Ensure logs directory exists
    await fs.ensureDir(Path.join(context.experimentPaths.output, 'logs'));

    // Prepare dataset
    const directoryTarget = Path.join(context.experimentPaths.generated, 'large-rdf-bench');
    context.logger.info(`Preparing LargeRDFBench dataset and queries`);
    if (await fs.pathExists(directoryTarget)) {
      context.logger.info(`  Skipped`);
    } else if (this.dataType === 'path') {
      await this.preparePath(context, directoryTarget);
    } else {
      await this.prepareRemote(context, directoryTarget);
    }
  }

  private async preparePath(context: ITaskContext, directoryTarget: string): Promise<void> {
    context.logger.info(`Preparing LargeRDFBench dataset and queries from a local folder`);
    await fs.ensureDir(directoryTarget);
    const source = this.useHdt ? Path.join(this.datasetLocation, 'hdt') : this.datasetLocation;
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
      if (entry.isFile()) {
        await fs.ensureSymlink(Path.join(source, entry.name), Path.join(directoryTarget, entry.name));
      }
    }
    await fs.ensureSymlink(
      Path.resolve(this.datasetLocation, '..', 'queries'),
      Path.join(directoryTarget, 'queries'),
    );
  }

  private async prepareRemote(context: ITaskContext, directoryTarget: string): Promise<void> {
    const downloadTarget = Path.join(context.experimentPaths.generated, 'large-rdf-bench.zip');
    throw new Error('not yet supported');
  }

  public async run(context: IRunTaskContext): Promise<void> {
    // Setup SPARQL endpoint
    const startTime = performance.now();
    const endpointProcessHandlers = await Promise.all([
      this.hookSparqlEndpointFederationEngine,
      ...this.hookSparqlEndpointsSources,
    ]
      .map(hookSparqlEndpoint => hookSparqlEndpoint.start(context)));
    const closeProcess = secureProcessHandler(new ProcessHandlerComposite(endpointProcessHandlers), context);

    // Determine query sets
    const queryLoader = new QueryLoaderFile({
      path: Path.join(context.experimentPaths.generated, 'large-rdf-bench', 'queries'),
      extensions: [ '.sparql' ],
    });
    let querySets = await queryLoader.loadQueries();
    if (context.filter) {
      const filterRegex = new RegExp(context.filter, 'u');
      querySets = Object.fromEntries(Object.entries(querySets)
        .filter(entry => filterRegex.test(entry[0])));
    }

    // Initiate SPARQL benchmark runner
    const stopEndpointStats: (() => void)[] = [];
    const results = await new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      endpointUpCheck: this.endpointUrlExternal,
      querySets,
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      requestDelay: this.queryRunnerRequestDelay,
      availabilityCheckTimeout: this.queryRunnerEndpointAvailabilityCheckTimeout,
      logger: (message: string) => process.stderr.write(`${message}\n`),
      additionalUrlParams: new URLSearchParams(this.queryRunnerUrlParams),
      timeout: this.queryTimeoutFallback,
    }).run({
      async onStart() {
        // Measure time it took to start the endpoint
        await fs.writeFile(Path.join(context.experimentPaths.output, 'logs', 'load-time.csv'), `time\n${Math.round(performance.now() - startTime)}`, 'utf-8');

        // Collect stats
        for (const endpointProcessHandler of endpointProcessHandlers) {
          stopEndpointStats.push(await endpointProcessHandler.startCollectingStats());
        }

        // Breakpoint right before starting queries.
        if (context.breakpointBarrier) {
          await context.breakpointBarrier();
        }
      },
      async onStop() {
        for (const entry of stopEndpointStats) {
          entry();
        }
      },
    });

    // Write results
    const resultSerializer = new ResultSerializerCsv();
    const resultsOutput = context.experimentPaths.output;
    if (!await fs.pathExists(resultsOutput)) {
      await fs.mkdir(resultsOutput);
    }
    context.logger.info(`Writing results to ${resultsOutput}\n`);
    await resultSerializer.serialize(Path.join(resultsOutput, 'query-times.csv'), results);

    // Close process safely
    await closeProcess();
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    await this.hookSparqlEndpointFederationEngine.clean(context, cleanTargets);
    await Promise.all(this.hookSparqlEndpointsSources
      .map(hookSparqlEndpoint => hookSparqlEndpoint.clean(context, cleanTargets)));
  }
}
