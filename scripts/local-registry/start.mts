import {
  registryUrlFromEnv,
  runVerdaccioForeground,
  workspaceRootDir,
} from './verdaccio.mts';

function main(): void {
  const root = workspaceRootDir();
  const registryUrl = registryUrlFromEnv();

  runVerdaccioForeground(root, registryUrl);
}

main();
