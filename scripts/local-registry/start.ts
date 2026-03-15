import {
  registryUrlFromEnv,
  runVerdaccioForeground,
  workspaceRootDir,
} from './verdaccio.ts';

function main(): void {
  const root = workspaceRootDir();
  const registryUrl = registryUrlFromEnv();

  runVerdaccioForeground(root, registryUrl);
}

main();
