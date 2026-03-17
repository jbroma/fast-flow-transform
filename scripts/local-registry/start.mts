import {
  registryUrlFromEnv,
  runVerdaccioForeground,
  workspaceRootDir,
} from './verdaccio.mts';

function main(): void {
  runVerdaccioForeground(workspaceRootDir(), registryUrlFromEnv());
}

main();
