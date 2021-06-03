import type * as Dockerode from 'dockerode';
import * as fs from 'fs-extra';
import { DockerContainerCreator } from '../../../lib/experiment/docker/DockerContainerCreator';
import { DockerContainerHandler } from '../../../lib/experiment/docker/DockerContainerHandler';

jest.mock('fs-extra', () => ({
  createWriteStream: jest.fn(),
}));

describe('DockerContainerCreator', () => {
  let container: any;
  let dockerode: Dockerode;
  let creator: DockerContainerCreator;
  beforeEach(() => {
    container = {
      attach: jest.fn(() => ({ pipe: jest.fn() })),
      start: jest.fn(),
      kill: jest.fn(),
      remove: jest.fn(),
    };
    dockerode = <any> {
      createContainer: jest.fn(() => container),
    };
    creator = new DockerContainerCreator();
  });

  describe('start', () => {
    it('creates a container via the proper steps', async() => {
      const handler = await creator.start({
        dockerode,
        imageName: 'IMAGE',
        resourceConstraints: {
          toHostConfig: () => ({ Memory: 123 }),
        },
        hostConfig: {
          Binds: [
            `a:b`,
          ],
        },
        logFilePath: 'LOGPATH',
      });
      expect(handler).toBeInstanceOf(DockerContainerHandler);
      expect(handler.container).toBe(container);

      expect(dockerode.createContainer).toHaveBeenCalledWith({
        Image: 'IMAGE',
        Tty: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
          Binds: [
            `a:b`,
          ],
          Memory: 123,
        },
      });
      expect(container.attach).toHaveBeenCalledWith({
        stream: true,
        stdout: true,
        stderr: true,
      });
      // eslint-disable-next-line import/namespace
      expect(fs.createWriteStream).toHaveBeenCalledWith('LOGPATH', 'utf8');
      expect(container.start).toHaveBeenCalled();
      expect(container.kill).not.toHaveBeenCalled();
      expect(container.remove).not.toHaveBeenCalled();
    });
  });
});