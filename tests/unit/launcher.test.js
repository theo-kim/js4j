'use strict';

const { launchGateway } = require('../../src/launcher');

describe('launchGateway', () => {
  test('throws when classpath is missing', async () => {
    await expect(launchGateway({ mainClass: 'Foo' }))
      .rejects.toThrow('classpath is required');
  });

  test('throws when mainClass is missing', async () => {
    await expect(launchGateway({ classpath: '/some/path.jar' }))
      .rejects.toThrow('mainClass is required');
  });

  test('times out when java process does not print the ready pattern', async () => {
    // Spawn a process that never prints anything meaningful
    await expect(
      launchGateway({
        classpath: '.',
        mainClass: 'DoesNotExist',
        readyPattern: /NEVER_MATCHES/,
        timeout: 500,
      })
    ).rejects.toThrow(/timed out|exited with code/);
  });
});
