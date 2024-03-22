import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';

/**
 * Runs the run phase of an experiment.
 */
export class TaskRun {
  private readonly context: ITaskContext;
  private readonly combination: number | undefined;

  public constructor(
    context: ITaskContext,
    combination: number | undefined,
  ) {
    this.context = context;
    this.combination = combination;
  }

  public async run(): Promise<void> {
    await ExperimentLoader.requireExperimentPrepared(this.context.experimentPaths.root);
    const { experiments, experimentPathsArray } = await (await ExperimentLoader.build(this.context.mainModulePath))
      .instantiateExperiments(this.context.experimentName, this.context.experimentPaths.root);
    for (const [ i, experiment ] of experiments.entries()) {
      if (this.combination === undefined || this.combination === i) {
        // Log status
        if (experiments.length > 1) {
          this.context.logger.info(`🧩 Running experiment combination ${i}`);
        }
        try {
          await experiment.run({ ...this.context, experimentPaths: experimentPathsArray[i] });
          // eslint-disable-next-line @typescript-eslint/no-implicit-any-catch
        } catch (error: any) {
          this.context.logger.error(error);
        }
      }
    }
  }
}
